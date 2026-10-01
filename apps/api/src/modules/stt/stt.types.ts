import { EventEmitter } from 'events';
import type { SttProviderId } from '@safescript/shared';

export type SttResultKind = 'partial' | 'final' | 'error' | 'status';

export interface SttTranscriptEvent {
  type: SttResultKind;
  text?: string;
  /** Cumulative finals for this session (stable prefix) */
  committedText?: string;
  error?: string;
  status?: 'listening' | 'paused' | 'stopped' | 'reconnecting';
  provider: SttProviderId;
  isFinal?: boolean;
  /** Whisper-detected ISO 639-1 when auto-detect / translation is used */
  detectedLanguage?: string;
}

export interface SttSessionStartOptions {
  sessionId: string;
  consultationId: string;
  tenantId: string | null;
  userId: string;
  languageCode?: string;
  sampleRateHz?: number;
  /** Whisper-family model override (e.g. whisper-large-v3) */
  whisperModel?: string | null;
  /** Translate any Whisper language into English clinical notes */
  translateToEnglish?: boolean;
  onEvent: (event: SttTranscriptEvent) => void;
}

/**
 * Pluggable speech-to-text backend.
 * Implementations must be fault-tolerant and emit partials for live UI.
 */
export interface SttProvider {
  readonly id: SttProviderId;
  readonly label: string;

  isConfigured(modelOverride?: string | null): boolean;

  startSession(opts: SttSessionStartOptions): Promise<LiveSttSession>;
}

export interface LiveSttSession {
  readonly providerId: SttProviderId;
  pushAudio(pcmChunk: Buffer): void;
  pause(): void;
  resume(): void;
  stop(): Promise<{ rawTranscript: string }>;
}

export class SttSessionBus extends EventEmitter {
  emitEvent(event: SttTranscriptEvent) {
    this.emit('event', event);
  }
}

/** Build a minimal WAV container around LINEAR16 PCM for Whisper uploads. */
export function pcm16ToWav(pcm: Buffer, sampleRate = 16000, channels = 1): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
}
