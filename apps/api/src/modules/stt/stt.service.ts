import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  DEFAULT_STT_PROVIDER,
  STT_PROVIDERS,
  STT_WHISPER_MODELS,
  allWhisperLanguagesSorted,
  getSttWhisperModelMeta,
  isSttProviderId,
  normalizeSttLanguageSettings,
  resolveSttWhisperModelId,
  type SttProviderId,
} from '@safescript/shared';
import type { LiveSttSession, SttTranscriptEvent } from './stt.types';
import { WhisperSttProvider } from './providers/whisper.provider';
import { GoogleMedicalSttProvider } from './providers/google-medical.provider';
import { BatchTranscribeService } from './batch-transcribe.service';
import { whisperTransportConfigured, translationWhisperConfigured } from './utils/whisper-client.util';

interface ManagedSession {
  id: string;
  consultationId: string;
  tenantId: string | null;
  userId: string;
  provider: SttProviderId;
  live: LiveSttSession;
  bus: EventEmitter;
  committedText: string;
  partialText: string;
  createdAt: number;
  lastActivityAt: number;
}

@Injectable()
export class SttService implements OnModuleDestroy {
  private readonly logger = new Logger(SttService.name);
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly ttlMs = 45 * 60 * 1000;
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly whisper: WhisperSttProvider,
    private readonly googleMedical: GoogleMedicalSttProvider,
    private readonly batch: BatchTranscribeService,
  ) {
    this.cleanupTimer = setInterval(() => this.sweepExpired(), 60_000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
    for (const id of [...this.sessions.keys()]) {
      void this.forceStop(id);
    }
  }

  listProviders() {
    const defaultProvider = this.resolveDefaultProvider();
    const defaultWhisperModel = resolveSttWhisperModelId(
      this.config.get<string>('STT_WHISPER_MODEL', 'whisper-1'),
    );
    const whisperModels = STT_WHISPER_MODELS.map((m) => {
      const available = whisperTransportConfigured(this.config, m.id);
      return {
        ...m,
        available,
        unavailableReason: available
          ? null
          : m.backend === 'groq'
            ? 'STT_GROQ_API_KEY (or GROQ_API_KEY) not configured'
            : 'OPENAI_API_KEY not configured',
      };
    });

    return {
      defaultProvider,
      defaultWhisperModel,
      whisperModels,
      sampleRateHz: 16_000,
      dictateMode: 'record-then-transcribe' as const,
      translation: {
        target: 'en',
        available: translationWhisperConfigured(this.config),
        note: 'Whisper translates any supported spoken language into English clinical notes.',
      },
      languages: [
        {
          code: 'auto',
          name: 'Auto-detect',
          nativeName: 'Auto-detect',
          bcp47: '',
          localeId: '',
        },
        ...allWhisperLanguagesSorted(),
      ],
      providers: STT_PROVIDERS.map((p) => {
        const available =
          p.id === 'whisper'
            ? this.batch.whisperConfigured() ||
              whisperModels.some((m) => m.available) ||
              this.whisper.isConfigured()
            : this.batch.googleConfigured() || this.googleMedical.isConfigured();
        return {
          ...p,
          available,
          unavailableReason: available
            ? null
            : p.id === 'whisper'
              ? 'No Whisper backend configured (OPENAI_API_KEY and/or STT_GROQ_API_KEY)'
              : 'Google Cloud credentials / project not configured',
        };
      }),
    };
  }

  /** Production dictate: one complete recording → English transcript. */
  async transcribeRecording(params: {
    audio: Buffer;
    filename?: string;
    mimeType?: string;
    provider?: string;
    languageCode?: string;
    whisperModel?: string | null;
    translateToEnglish?: boolean;
    preview?: boolean;
  }) {
    if (!params.audio?.length) {
      throw new BadRequestException('Audio recording is empty');
    }
    if (params.audio.length > 25 * 1024 * 1024) {
      throw new BadRequestException('Recording too large (max 25MB)');
    }

    const lang = normalizeSttLanguageSettings({
      languageCode: params.languageCode,
      translateToEnglish: params.translateToEnglish,
    });
    const providerId = lang.translateToEnglish
      ? 'whisper'
      : this.resolveProvider(params.provider);
    const whisperModel =
      providerId === 'whisper'
        ? resolveSttWhisperModelId(
            params.whisperModel || this.config.get<string>('STT_WHISPER_MODEL', 'whisper-1'),
          )
        : undefined;
    if (
      providerId === 'whisper' &&
      whisperModel &&
      getSttWhisperModelMeta(whisperModel)?.backend === 'groq' &&
      !this.batch.whisperConfigured(whisperModel)
    ) {
      throw new ServiceUnavailableException(
        'Whisper Large v3 requires STT_GROQ_API_KEY (OpenAI does not host this model)',
      );
    }

    const result = await this.batch.transcribe({
      audio: params.audio,
      filename: params.filename,
      mimeType: params.mimeType,
      provider: providerId,
      languageCode: lang.sourceLanguage,
      whisperModel,
      translateToEnglish: lang.translateToEnglish,
      preview: params.preview,
    });

    this.logger.log(
      `Batch STT via ${result.provider}${result.model ? `/${result.model}` : ''} (${params.audio.length} bytes) → ${result.rawTranscript.length} chars translate=${Boolean(result.translated)} lang=${result.detectedLanguage || lang.sourceLanguage}`,
    );

    return {
      ok: true,
      provider: result.provider,
      model: result.model ?? null,
      rawTranscript: result.rawTranscript,
      detectedLanguage: result.detectedLanguage ?? null,
      translated: Boolean(result.translated),
      sourceLanguage: lang.sourceLanguage,
    };
  }

  async createSession(params: {
    consultationId: string;
    tenantId: string | null;
    userId: string;
    provider?: string;
    languageCode?: string;
    whisperModel?: string | null;
    translateToEnglish?: boolean;
  }) {
    const lang = normalizeSttLanguageSettings({
      languageCode: params.languageCode,
      translateToEnglish: params.translateToEnglish,
    });
    const providerId = lang.translateToEnglish
      ? 'whisper'
      : this.resolveProvider(params.provider);
    const whisperModel =
      providerId === 'whisper'
        ? resolveSttWhisperModelId(
            params.whisperModel || this.config.get<string>('STT_WHISPER_MODEL', 'whisper-1'),
          )
        : null;
    const impl = this.getImpl(providerId);
    if (providerId === 'whisper') {
      if (!this.whisper.isConfigured(whisperModel)) {
        throw new ServiceUnavailableException(
          whisperModel && getSttWhisperModelMeta(whisperModel)?.backend === 'groq'
            ? 'Whisper Large v3 is not configured (set STT_GROQ_API_KEY)'
            : 'Whisper is not configured on this environment',
        );
      }
    } else if (!impl.isConfigured()) {
      throw new ServiceUnavailableException(
        `${impl.label} is not configured on this environment`,
      );
    }

    const sessionId = randomUUID();
    const bus = new EventEmitter();
    bus.setMaxListeners(20);

    const live = await impl.startSession({
      sessionId,
      consultationId: params.consultationId,
      tenantId: params.tenantId,
      userId: params.userId,
      languageCode: lang.sourceLanguage,
      whisperModel,
      sampleRateHz: 16_000,
      translateToEnglish: lang.translateToEnglish,
      onEvent: (event) => {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        session.lastActivityAt = Date.now();
        if (event.committedText != null) session.committedText = event.committedText;
        if (event.type === 'partial' && event.text != null) session.partialText = event.text;
        if (event.type === 'final') session.partialText = '';
        bus.emit('event', event as SttTranscriptEvent);
      },
    });

    const managed: ManagedSession = {
      id: sessionId,
      consultationId: params.consultationId,
      tenantId: params.tenantId,
      userId: params.userId,
      provider: providerId,
      live,
      bus,
      committedText: '',
      partialText: '',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.sessions.set(sessionId, managed);

    return {
      sessionId,
      provider: providerId,
      whisperModel,
      sampleRateHz: 16_000,
      encoding: 'LINEAR16' as const,
      channels: 1,
      sourceLanguage: lang.sourceLanguage,
      translateToEnglish: lang.translateToEnglish,
    };
  }

  getSession(sessionId: string, userId: string, consultationId: string): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.consultationId !== consultationId) {
      throw new NotFoundException('STT session not found');
    }
    if (session.userId !== userId) {
      throw new NotFoundException('STT session not found');
    }
    session.lastActivityAt = Date.now();
    return session;
  }

  pushAudio(sessionId: string, userId: string, consultationId: string, pcm: Buffer) {
    const session = this.getSession(sessionId, userId, consultationId);
    if (!pcm?.length) return { ok: true };
    if (pcm.length > 256 * 1024) {
      throw new BadRequestException('Audio chunk too large (max 256KB)');
    }
    session.live.pushAudio(pcm);
    return { ok: true };
  }

  pause(sessionId: string, userId: string, consultationId: string) {
    const session = this.getSession(sessionId, userId, consultationId);
    session.live.pause();
    return { ok: true, status: 'paused' as const };
  }

  resume(sessionId: string, userId: string, consultationId: string) {
    const session = this.getSession(sessionId, userId, consultationId);
    session.live.resume();
    return { ok: true, status: 'listening' as const };
  }

  async stop(sessionId: string, userId: string, consultationId: string) {
    const session = this.getSession(sessionId, userId, consultationId);
    const result = await session.live.stop();
    const rawTranscript = result.rawTranscript || session.committedText;
    this.sessions.delete(sessionId);
    session.bus.removeAllListeners();
    return {
      ok: true,
      provider: session.provider,
      rawTranscript,
    };
  }

  subscribe(
    sessionId: string,
    userId: string,
    consultationId: string,
    listener: (event: SttTranscriptEvent) => void,
  ) {
    const session = this.getSession(sessionId, userId, consultationId);
    session.bus.on('event', listener);
    return () => session.bus.off('event', listener);
  }

  private resolveDefaultProvider(): SttProviderId {
    const raw = (this.config.get<string>('STT_DEFAULT_PROVIDER') || DEFAULT_STT_PROVIDER).trim();
    if (isSttProviderId(raw)) {
      if (raw === 'whisper' && this.batch.whisperConfigured()) return raw;
      if (raw === 'google-medical' && this.batch.googleConfigured()) return raw;
    }
    if (this.batch.whisperConfigured()) return 'whisper';
    if (this.batch.googleConfigured()) return 'google-medical';
    return DEFAULT_STT_PROVIDER;
  }

  private resolveProvider(raw?: string): SttProviderId {
    if (raw && isSttProviderId(raw)) return raw;
    if (raw) throw new BadRequestException(`Unknown STT provider: ${raw}`);
    return this.resolveDefaultProvider();
  }

  private getImpl(id: SttProviderId) {
    return id === 'google-medical' ? this.googleMedical : this.whisper;
  }

  private async forceStop(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      await session.live.stop();
    } catch {
      /* ignore */
    }
    this.sessions.delete(sessionId);
    session.bus.removeAllListeners();
  }

  private sweepExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > this.ttlMs) {
        this.logger.warn(`Expiring idle STT session ${id}`);
        void this.forceStop(id);
      }
    }
  }
}
