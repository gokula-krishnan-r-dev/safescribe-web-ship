import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LiveSttSession,
  SttProvider,
  SttSessionStartOptions,
  SttTranscriptEvent,
} from '../stt.types';
import {
  resolveTranslationWhisperClient,
  resolveWhisperClient,
  whisperTransportConfigured,
} from '../utils/whisper-client.util';
import { runWhisperAudio } from '../utils/whisper-audio';
import { pcm16ToWav } from '../stt.types';

/**
 * Near-real-time Whisper via rolling PCM windows.
 * Emits partials from the latest window and commits stable finals when
 * successive windows agree on a growing prefix (or on stop).
 *
 * Supports OpenAI models (whisper-1, gpt-4o-transcribe*) and Groq
 * Whisper Large v3 / turbo via OpenAI-compatible client.
 */
@Injectable()
export class WhisperSttProvider implements SttProvider {
  readonly id = 'whisper' as const;
  readonly label = 'Whisper';
  private readonly logger = new Logger(WhisperSttProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(modelOverride?: string | null): boolean {
    return whisperTransportConfigured(this.config, modelOverride);
  }

  async startSession(opts: SttSessionStartOptions): Promise<LiveSttSession> {
    if (!this.isConfigured(opts.whisperModel)) {
      throw new Error(
        'Whisper STT is not configured (OPENAI_API_KEY for OpenAI models, or STT_GROQ_API_KEY for Large v3)',
      );
    }

    const resolved = opts.translateToEnglish
      ? resolveTranslationWhisperClient(this.config, opts.whisperModel, { preferFast: true })
      : resolveWhisperClient(this.config, opts.whisperModel);
    this.logger.log(
      `Live Whisper session model=${resolved.model} (${resolved.label}) translate=${Boolean(opts.translateToEnglish)} lang=${opts.languageCode || 'auto'}`,
    );
    const sampleRate = opts.sampleRateHz ?? 16_000;
    const windowMs =
      Number(
        this.config.get<string>(
          opts.translateToEnglish ? 'STT_WHISPER_TRANSLATE_WINDOW_MS' : 'STT_WHISPER_WINDOW_MS',
          opts.translateToEnglish ? '2400' : '1800',
        ),
      ) || (opts.translateToEnglish ? 2400 : 1800);
    const overlapMs = Number(this.config.get<string>('STT_WHISPER_OVERLAP_MS', '400')) || 400;
    const windowBytes = Math.floor((sampleRate * 2 * windowMs) / 1000);
    const overlapBytes = Math.floor((sampleRate * 2 * overlapMs) / 1000);

    let pcmBuffer = Buffer.alloc(0);
    let committed = '';
    let lastPartial = '';
    let paused = false;
    let stopped = false;
    let inflight: Promise<void> | null = null;
    let flushTimer: NodeJS.Timeout | null = null;

    let detectedLanguage: string | undefined;

    const emit = (event: Omit<SttTranscriptEvent, 'provider'>) => {
      opts.onEvent({
        ...event,
        provider: 'whisper',
        detectedLanguage: event.detectedLanguage || detectedLanguage,
      });
    };

    const transcribeWindow = async (pcm: Buffer, prompt: string) => {
      if (pcm.length < sampleRate) return '';
      const wav = pcm16ToWav(pcm, sampleRate, 1);
      const result = await runWhisperAudio({
        resolved,
        audio: wav,
        filename: 'chunk.wav',
        mimeType: 'audio/wav',
        languageCode: opts.languageCode,
        translateToEnglish: Boolean(opts.translateToEnglish),
        prompt,
      });
      if (result.detectedLanguage) detectedLanguage = result.detectedLanguage;
      return result.rawTranscript;
    };

    const flush = async (forceFinal = false) => {
      if (stopped || paused) return;
      if (inflight) return;
      if (pcmBuffer.length < windowBytes && !forceFinal) return;

      const take = forceFinal
        ? pcmBuffer
        : pcmBuffer.subarray(Math.max(0, pcmBuffer.length - windowBytes));
      if (!forceFinal && pcmBuffer.length > windowBytes) {
        pcmBuffer = pcmBuffer.subarray(pcmBuffer.length - overlapBytes);
      } else if (forceFinal) {
        pcmBuffer = Buffer.alloc(0);
      }

      inflight = (async () => {
        try {
          const text = await transcribeWindow(take, committed || lastPartial);
          if (!text || stopped) return;

          if (forceFinal) {
            const next = committed ? `${committed} ${text}`.trim() : text;
            committed = next;
            lastPartial = '';
            emit({
              type: 'final',
              text,
              committedText: committed,
              isFinal: true,
            });
            return;
          }

          // Prefer growing committed prefix when the new window extends prior text
          if (committed && text.toLowerCase().startsWith(committed.toLowerCase().slice(0, 40))) {
            committed = text;
            lastPartial = '';
            emit({
              type: 'final',
              text: committed,
              committedText: committed,
              isFinal: true,
            });
          } else if (!committed) {
            lastPartial = text;
            emit({
              type: 'partial',
              text,
              committedText: '',
              isFinal: false,
            });
            // Promote first solid window to committed to stabilize UI
            if (text.split(/\s+/).length >= 6) {
              committed = text;
              lastPartial = '';
              emit({
                type: 'final',
                text,
                committedText: committed,
                isFinal: true,
              });
            }
          } else {
            // Append novel content after committed
            const novel = stripOverlap(committed, text);
            lastPartial = novel;
            emit({
              type: 'partial',
              text: novel,
              committedText: committed,
              isFinal: false,
            });
          }
        } catch (err) {
          this.logger.warn(`Whisper window failed: ${(err as Error).message}`);
          emit({
            type: 'error',
            error: 'Whisper transcription hiccup — still listening…',
          });
        } finally {
          inflight = null;
        }
      })();

      await inflight;
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush(false);
      }, Math.max(400, windowMs - 200));
    };

    emit({ type: 'status', status: 'listening' });

    return {
      providerId: 'whisper',
      pushAudio: (chunk: Buffer) => {
        if (stopped || paused || !chunk?.length) return;
        pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
        // Cap buffer (~30s) to protect memory on long sessions
        const maxBytes = sampleRate * 2 * 30;
        if (pcmBuffer.length > maxBytes) {
          pcmBuffer = pcmBuffer.subarray(pcmBuffer.length - maxBytes);
        }
        if (pcmBuffer.length >= windowBytes) scheduleFlush();
      },
      pause: () => {
        paused = true;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        emit({ type: 'status', status: 'paused' });
      },
      resume: () => {
        paused = false;
        emit({ type: 'status', status: 'listening' });
      },
      stop: async () => {
        stopped = true;
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        await flush(true);
        if (lastPartial.trim()) {
          committed = committed ? `${committed} ${lastPartial}`.trim() : lastPartial.trim();
          lastPartial = '';
        }
        emit({
          type: 'status',
          status: 'stopped',
          committedText: committed,
          text: committed,
        });
        return { rawTranscript: committed };
      },
    };
  }
}

function stripOverlap(committed: string, windowText: string): string {
  const a = committed.toLowerCase();
  const b = windowText.toLowerCase();
  // Find longest suffix of committed that is a prefix of windowText
  const max = Math.min(a.length, b.length);
  for (let len = max; len >= 12; len--) {
    if (b.startsWith(a.slice(a.length - len))) {
      return windowText.slice(len).trim();
    }
  }
  // Fallback: if window is mostly new, return it
  if (!b.includes(a.slice(0, Math.min(24, a.length)))) {
    return windowText.trim();
  }
  return '';
}
