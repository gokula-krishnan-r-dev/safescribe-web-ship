import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechClient } from '@google-cloud/speech';
import type {
  LiveSttSession,
  SttProvider,
  SttSessionStartOptions,
  SttTranscriptEvent,
} from '../stt.types';

type StreamingRecognizeStream = ReturnType<SpeechClient['streamingRecognize']>;

/** Google caps bidirectional streaming sessions (~305s). Refresh earlier. */
const STREAM_REFRESH_MS = 240_000;
const MAX_RECONNECT_ATTEMPTS = 8;
const MAX_QUEUED_CHUNKS = 80;
/** Promote sticky interim → committed after brief pause (professional note growth). */
const SILENCE_PROMOTE_MS = 1_250;

function joinTranscript(stable: string, next: string): string {
  const a = stable.replace(/\s+/g, ' ').trim();
  const b = next.replace(/\s+/g, ' ').trim();
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  if (a.endsWith(b)) return a;
  if (b.startsWith(a)) return b;
  return `${a} ${b}`.replace(/\s+/g, ' ').trim();
}

/**
 * Google Cloud Speech-to-Text medical models (v1 streaming).
 *
 * Default model is `medical_dictation` (single-speaker clinical notes).
 * `medical_conversation` is available via STT_GOOGLE_MODEL for dialogue.
 *
 * Client API (@google-cloud/speech v7):
 *   stream = client.streamingRecognize({ config, interimResults })
 *   stream.write(pcmBuffer) // raw LINEAR16 only
 */
@Injectable()
export class GoogleMedicalSttProvider implements SttProvider {
  readonly id = 'google-medical' as const;
  readonly label = 'Google Medical';
  private readonly logger = new Logger(GoogleMedicalSttProvider.name);
  private client: SpeechClient | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const enabled = this.config.get<string>('STT_GOOGLE_ENABLED', 'true') !== 'false';
    if (!enabled) return false;
    const projectId = (this.config.get<string>('GCS_PROJECT_ID') || '').trim();
    const keyFile = (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim();
    return Boolean(projectId || keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  private getClient(): SpeechClient {
    if (this.client) return this.client;
    const projectId = (this.config.get<string>('GCS_PROJECT_ID') || '').trim() || undefined;
    const keyFilename =
      (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim() || undefined;
    this.client = new SpeechClient({
      projectId,
      ...(keyFilename ? { keyFilename } : {}),
    });
    return this.client;
  }

  async startSession(opts: SttSessionStartOptions): Promise<LiveSttSession> {
    if (!this.isConfigured()) {
      throw new Error(
        'Google Medical STT is not configured (GCS_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS / STT_GOOGLE_ENABLED)',
      );
    }

    const sampleRate = opts.sampleRateHz ?? 16_000;
    const languageCode =
      this.config.get<string>('STT_GOOGLE_LANGUAGE', 'en-US') || 'en-US';
    // medical_dictation = single-speaker notes (pharmacist dictation).
    // medical_conversation = two-speaker dialogue — poorer for monologue notes.
    const model =
      this.config.get<string>('STT_GOOGLE_MODEL', 'medical_dictation') ||
      'medical_dictation';

    let committed = '';
    let lastPartial = '';
    let paused = false;
    let stopped = false;
    let recognizeStream: StreamingRecognizeStream | null = null;
    let streamReady = false;
    let streamGeneration = 0;
    let reconnectAttempts = 0;
    let restartTimer: NodeJS.Timeout | null = null;
    let refreshTimer: NodeJS.Timeout | null = null;
    let silenceTimer: NodeJS.Timeout | null = null;
    let opening = false;
    const audioQueue: Buffer[] = [];

    const emit = (event: Omit<SttTranscriptEvent, 'provider'>) => {
      opts.onEvent({ ...event, provider: 'google-medical' });
    };

    const snapshot = () => ({
      committedText: committed,
      partial: lastPartial,
      display: joinTranscript(committed, lastPartial),
    });

    const clearSilenceTimer = () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    const scheduleSilencePromote = () => {
      clearSilenceTimer();
      if (!lastPartial.trim() || stopped || paused) return;
      silenceTimer = setTimeout(() => {
        if (stopped || paused || !lastPartial.trim()) return;
        promotePartial();
      }, SILENCE_PROMOTE_MS);
    };

    const emitPartial = () => {
      const snap = snapshot();
      emit({
        type: 'partial',
        text: lastPartial,
        committedText: snap.committedText,
        isFinal: false,
      });
      scheduleSilencePromote();
    };

    const emitFinalSegment = (segment: string) => {
      clearSilenceTimer();
      committed = joinTranscript(committed, segment);
      lastPartial = '';
      emit({
        type: 'final',
        text: segment,
        committedText: committed,
        isFinal: true,
      });
    };

    /** Lock in current interim so stream refresh/stop never drops spoken words. */
    const promotePartial = () => {
      clearSilenceTimer();
      if (!lastPartial.trim()) return;
      const segment = lastPartial.trim();
      lastPartial = '';
      committed = joinTranscript(committed, segment);
      emit({
        type: 'final',
        text: segment,
        committedText: committed,
        isFinal: true,
      });
    };

    const clearTimers = () => {
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      clearSilenceTimer();
    };

    const closeStreamQuietly = (stream: StreamingRecognizeStream | null) => {
      if (!stream) return;
      try {
        stream.removeAllListeners();
        if (!stream.destroyed) {
          stream.end();
          stream.destroy();
        }
      } catch {
        /* ignore */
      }
    };

    const flushQueue = () => {
      if (!streamReady || !recognizeStream || recognizeStream.destroyed) return;
      while (audioQueue.length) {
        const chunk = audioQueue.shift();
        if (!chunk?.length) continue;
        try {
          recognizeStream.write(chunk);
        } catch (err) {
          this.logger.warn(`Google STT queue flush failed: ${(err as Error).message}`);
          audioQueue.unshift(chunk);
          break;
        }
      }
    };

    const scheduleRefresh = (generation: number) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (stopped || generation !== streamGeneration) return;
        this.logger.log(
          `Refreshing Google STT stream for session ${opts.sessionId} (generation ${generation})`,
        );
        promotePartial();
        void openStream('refresh');
      }, STREAM_REFRESH_MS);
    };

    const scheduleReconnect = (reason: string) => {
      if (stopped) return;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        promotePartial();
        emit({
          type: 'error',
          error: 'Google Medical Speech disconnected. Stop and try again, or switch to Whisper.',
        });
        return;
      }
      if (restartTimer) return;

      const attempt = ++reconnectAttempts;
      const delayMs = Math.min(2_000, 250 * 2 ** (attempt - 1));
      emit({ type: 'status', status: 'reconnecting' });
      this.logger.warn(
        `Google STT reconnect scheduled (${reason}) attempt=${attempt} delay=${delayMs}ms`,
      );

      restartTimer = setTimeout(() => {
        restartTimer = null;
        promotePartial();
        void openStream('reconnect');
      }, delayMs);
    };

    const openStream = async (reason: 'start' | 'reconnect' | 'refresh') => {
      if (stopped || opening) return;
      opening = true;
      streamReady = false;

      const previous = recognizeStream;
      recognizeStream = null;
      closeStreamQuietly(previous);

      const generation = ++streamGeneration;

      try {
        const client = this.getClient();
        const stream = client.streamingRecognize({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: sampleRate,
            languageCode,
            model,
            enableAutomaticPunctuation: true,
          },
          interimResults: true,
        });
        recognizeStream = stream;

        stream.on('error', (err: Error) => {
          if (stopped || generation !== streamGeneration) return;
          streamReady = false;
          this.logger.warn(`Google STT stream error [${reason}]: ${err.message}`);
          const msg = err.message || '';
          if (/UNAUTHENTICATED|PERMISSION_DENIED|invalid_grant/i.test(msg)) {
            promotePartial();
            emit({
              type: 'error',
              error:
                'Google Medical Speech is not authorized. Enable Speech-to-Text API and grant the service account access.',
            });
            return;
          }
          scheduleReconnect(msg.slice(0, 120));
        });

        stream.on(
          'data',
          (data: {
            results?: Array<{
              alternatives?: Array<{ transcript?: string | null; confidence?: number | null }>;
              isFinal?: boolean | null;
              stability?: number | null;
            }>;
          }) => {
            if (stopped || generation !== streamGeneration) return;
            if (!data.results?.length) return;
            reconnectAttempts = 0;

            // Process finals first, then the latest non-final interim.
            let latestInterim = '';
            for (const result of data.results) {
              const text = (result.alternatives?.[0]?.transcript || '').replace(/\s+/g, ' ').trim();
              if (!text) continue;
              if (result.isFinal) {
                emitFinalSegment(text);
              } else {
                latestInterim = text;
              }
            }

            if (latestInterim) {
              lastPartial = latestInterim;
              emitPartial();
            }
          },
        );

        stream.on('end', () => {
          if (stopped || generation !== streamGeneration) return;
          streamReady = false;
          scheduleReconnect('stream-end');
        });

        if (stopped || generation !== streamGeneration) {
          closeStreamQuietly(stream);
          return;
        }

        streamReady = true;
        if (reason === 'start') reconnectAttempts = 0;
        flushQueue();
        scheduleRefresh(generation);
        // Re-broadcast stable text so UI never blanks on reconnect
        emit({
          type: 'status',
          status: 'listening',
          committedText: committed,
          text: snapshot().display,
        });
      } catch (err) {
        this.logger.error(`Failed to open Google STT stream: ${(err as Error).message}`);
        streamReady = false;
        scheduleReconnect((err as Error).message);
      } finally {
        opening = false;
      }
    };

    await openStream('start');

    return {
      providerId: 'google-medical',
      pushAudio: (chunk: Buffer) => {
        if (stopped || paused || !chunk?.length) return;

        if (!streamReady || !recognizeStream || recognizeStream.destroyed || opening) {
          audioQueue.push(Buffer.from(chunk));
          while (audioQueue.length > MAX_QUEUED_CHUNKS) audioQueue.shift();
          return;
        }

        try {
          const ok = recognizeStream.write(chunk);
          if (!ok) {
            audioQueue.push(Buffer.from(chunk));
            while (audioQueue.length > MAX_QUEUED_CHUNKS) audioQueue.shift();
            recognizeStream.once('drain', () => flushQueue());
          }
        } catch (err) {
          this.logger.warn(`Google STT write failed: ${(err as Error).message}`);
          audioQueue.push(Buffer.from(chunk));
          while (audioQueue.length > MAX_QUEUED_CHUNKS) audioQueue.shift();
          streamReady = false;
          scheduleReconnect('write-failed');
        }
      },
      pause: () => {
        paused = true;
        promotePartial();
        emit({ type: 'status', status: 'paused', committedText: committed });
      },
      resume: () => {
        paused = false;
        emit({ type: 'status', status: 'listening', committedText: committed });
        flushQueue();
      },
      stop: async () => {
        stopped = true;
        streamReady = false;
        clearTimers();
        promotePartial();
        const stream = recognizeStream;
        recognizeStream = null;
        audioQueue.length = 0;

        await new Promise<void>((resolve) => {
          if (!stream || stream.destroyed) {
            resolve();
            return;
          }
          const done = () => resolve();
          stream.once('close', done);
          stream.once('end', done);
          stream.once('error', done);
          try {
            stream.end();
          } catch {
            resolve();
          }
          setTimeout(done, 1_000);
        });

        const rawTranscript = committed.replace(/\s+/g, ' ').trim();
        emit({
          type: 'status',
          status: 'stopped',
          committedText: rawTranscript,
          text: rawTranscript,
        });
        return { rawTranscript };
      },
    };
  }
}
