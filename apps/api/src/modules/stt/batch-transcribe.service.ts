import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pcm16ToWav } from './stt.types';
import {
  resolveTranslationWhisperClient,
  resolveWhisperClient,
  translationWhisperConfigured,
  whisperTransportConfigured,
} from './utils/whisper-client.util';
import { runWhisperAudio } from './utils/whisper-audio';

@Injectable()
export class BatchTranscribeService {
  private readonly logger = new Logger(BatchTranscribeService.name);

  constructor(private readonly config: ConfigService) {}

  whisperConfigured(modelOverride?: string | null): boolean {
    return whisperTransportConfigured(this.config, modelOverride);
  }

  translationConfigured(): boolean {
    return translationWhisperConfigured(this.config);
  }

  googleConfigured(): boolean {
    const enabled = this.config.get<string>('STT_GOOGLE_ENABLED', 'true') !== 'false';
    if (!enabled) return false;
    const projectId = (this.config.get<string>('GCS_PROJECT_ID') || '').trim();
    const keyFile = (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim();
    return Boolean(projectId || keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  /**
   * Transcribe a complete recording (WAV / WebM / PCM-as-WAV).
   * When translateToEnglish is set, Whisper translates any supported language
   * into English clinical notes.
   */
  async transcribe(params: {
    audio: Buffer;
    filename?: string;
    mimeType?: string;
    provider: 'whisper' | 'google-medical';
    languageCode?: string;
    whisperModel?: string | null;
    translateToEnglish?: boolean;
    /** Faster model for live rolling windows; still English when translating */
    preview?: boolean;
  }): Promise<{
    rawTranscript: string;
    provider: string;
    model?: string;
    detectedLanguage?: string;
    translated?: boolean;
  }> {
    if (params.translateToEnglish) {
      return this.transcribeWhisper(params);
    }

    if (params.provider === 'google-medical') {
      if (!this.googleConfigured()) {
        if (this.whisperConfigured(params.whisperModel)) {
          this.logger.warn('Google STT not configured — using Whisper for batch dictate');
          return this.transcribeWhisper(params);
        }
        throw new Error('Google Medical STT is not configured');
      }
      try {
        return await this.transcribeGoogle(params);
      } catch (err) {
        this.logger.warn(
          `Google batch STT failed (${(err as Error).message}) — falling back to Whisper`,
        );
        if (this.whisperConfigured(params.whisperModel)) return this.transcribeWhisper(params);
        throw err;
      }
    }
    return this.transcribeWhisper(params);
  }

  private async transcribeWhisper(params: {
    audio: Buffer;
    filename?: string;
    mimeType?: string;
    languageCode?: string;
    whisperModel?: string | null;
    translateToEnglish?: boolean;
    preview?: boolean;
  }): Promise<{
    rawTranscript: string;
    provider: string;
    model: string;
    detectedLanguage?: string;
    translated?: boolean;
  }> {
    const translate = Boolean(params.translateToEnglish);
    if (translate) {
      if (!this.translationConfigured()) {
        throw new Error(
          'Speech translation is not configured (OPENAI_API_KEY or STT_GROQ_API_KEY)',
        );
      }
    } else if (!this.whisperConfigured(params.whisperModel)) {
      throw new Error(
        'Whisper STT is not configured (OPENAI_API_KEY for OpenAI models, or STT_GROQ_API_KEY for Large v3)',
      );
    }

    const resolved = translate
      ? resolveTranslationWhisperClient(this.config, params.whisperModel, {
          preferFast: Boolean(params.preview),
        })
      : resolveWhisperClient(this.config, params.whisperModel);

    this.logger.log(
      `${params.preview ? 'Preview' : 'Batch'} Whisper model=${resolved.model} (${resolved.label}) translate=${translate} lang=${params.languageCode || 'auto'}`,
    );

    try {
      const result = await runWhisperAudio({
        resolved,
        audio: params.audio,
        filename: params.filename,
        mimeType: params.mimeType,
        languageCode: params.languageCode,
        translateToEnglish: translate,
      });
      return {
        rawTranscript: result.rawTranscript,
        provider: 'whisper',
        model: result.model,
        detectedLanguage: result.detectedLanguage,
        translated: result.translated,
      };
    } catch (err) {
      if (translate && resolved.model === 'whisper-large-v3-turbo') {
        this.logger.warn(
          `Turbo translation failed (${(err as Error).message}) — retrying Large v3`,
        );
        const fallback = resolveTranslationWhisperClient(this.config, 'whisper-large-v3');
        const result = await runWhisperAudio({
          resolved: fallback,
          audio: params.audio,
          filename: params.filename,
          mimeType: params.mimeType,
          languageCode: params.languageCode,
          translateToEnglish: true,
        });
        return {
          rawTranscript: result.rawTranscript,
          provider: 'whisper',
          model: result.model,
          detectedLanguage: result.detectedLanguage,
          translated: true,
        };
      }
      throw err;
    }
  }

  private async transcribeGoogle(params: {
    audio: Buffer;
    mimeType?: string;
    languageCode?: string;
    whisperModel?: string | null;
  }): Promise<{ rawTranscript: string; provider: string; model?: string }> {
    const { SpeechClient } = await import('@google-cloud/speech');
    const projectId = (this.config.get<string>('GCS_PROJECT_ID') || '').trim() || undefined;
    const keyFilename =
      (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim() || undefined;
    const client = new SpeechClient({
      projectId,
      ...(keyFilename ? { keyFilename } : {}),
    });

    const languageCode =
      this.config.get<string>('STT_GOOGLE_LANGUAGE', 'en-US') ||
      params.languageCode ||
      'en-US';
    const model =
      this.config.get<string>('STT_GOOGLE_MODEL', 'medical_dictation') ||
      'medical_dictation';

    let content = params.audio;
    const mime = (params.mimeType || '').toLowerCase();
    if (content.toString('ascii', 0, 4) === 'RIFF') {
      const dataIdx = content.indexOf(Buffer.from('data'));
      if (dataIdx >= 0 && dataIdx + 8 <= content.length) {
        const dataSize = content.readUInt32LE(dataIdx + 4);
        content = content.subarray(dataIdx + 8, dataIdx + 8 + dataSize);
      }
    } else if (mime.includes('webm') || mime.includes('ogg')) {
      throw new Error('Google Medical batch requires WAV/PCM — use Whisper for WebM');
    }

    const [response] = await client.recognize({
      audio: { content: content.toString('base64') },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16_000,
        languageCode,
        model,
        enableAutomaticPunctuation: true,
        useEnhanced: false,
      },
    });

    const parts =
      response.results
        ?.map((r) => r.alternatives?.[0]?.transcript?.trim())
        .filter(Boolean) ?? [];
    let rawTranscript = parts.join(' ').replace(/\s+/g, ' ').trim();

    if (
      this.whisperConfigured(params.whisperModel) &&
      (/\[[^\]]{0,40}\]/.test(rawTranscript) ||
        /\b(?:close quote|open quote|dictation)\b/i.test(rawTranscript))
    ) {
      this.logger.warn('Google transcript looked like command artifacts — using Whisper');
      return this.transcribeWhisper({
        audio: pcm16ToWav(content, 16_000, 1),
        filename: 'dictation.wav',
        mimeType: 'audio/wav',
        languageCode: params.languageCode,
        whisperModel: params.whisperModel,
      });
    }

    return { rawTranscript, provider: 'google-medical', model };
  }
}
