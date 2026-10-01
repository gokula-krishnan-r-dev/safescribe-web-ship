import { Injectable, Logger } from '@nestjs/common';
import { BatchTranscribeService } from '@/modules/stt/batch-transcribe.service';
import { MicEventsService } from './mic-events.service';

type Rolling = {
  english: string;
  lastSequence: number;
  inflight: boolean;
  queued: { buffer: Buffer; contentType: string; sequence: number } | null;
};

/**
 * Near-real-time English preview for QR Mic sessions in translate mode.
 * Each uploaded part is translated independently and appended — the full-file
 * Whisper pass on finalize remains authoritative.
 */
@Injectable()
export class MicLiveTranslateService {
  private readonly logger = new Logger(MicLiveTranslateService.name);
  private readonly rolling = new Map<string, Rolling>();

  constructor(
    private readonly batch: BatchTranscribeService,
    private readonly events: MicEventsService,
  ) {}

  clear(micSessionId: string) {
    this.rolling.delete(micSessionId);
  }

  enqueuePart(params: {
    micSessionId: string;
    consultationId: string;
    buffer: Buffer;
    contentType: string;
    sequenceNumber: number;
    sourceLanguage?: string | null;
    translateToEnglish?: boolean;
  }) {
    if (!params.translateToEnglish) return;
    if (params.buffer.length < 2_000) return;

    let state = this.rolling.get(params.micSessionId);
    if (!state) {
      state = { english: '', lastSequence: -1, inflight: false, queued: null };
      this.rolling.set(params.micSessionId, state);
    }
    if (params.sequenceNumber <= state.lastSequence && state.english) return;

    state.queued = {
      buffer: params.buffer,
      contentType: params.contentType,
      sequence: params.sequenceNumber,
    };
    if (!state.inflight) {
      void this.drain(params.micSessionId, params.consultationId, params.sourceLanguage);
    }
  }

  private async drain(
    micSessionId: string,
    consultationId: string,
    sourceLanguage?: string | null,
  ) {
    const state = this.rolling.get(micSessionId);
    if (!state || state.inflight) return;
    const next = state.queued;
    if (!next) return;
    state.queued = null;
    state.inflight = true;
    try {
      const result = await this.batch.transcribe({
        audio: next.buffer,
        filename: 'mic-live.webm',
        mimeType: next.contentType,
        provider: 'whisper',
        languageCode: sourceLanguage || 'auto',
        translateToEnglish: true,
        preview: true,
      });
      const piece = (result.rawTranscript || '').trim();
      if (piece) {
        state.english = state.english ? `${state.english} ${piece}`.trim() : piece;
        state.lastSequence = next.sequence;
        await this.events.publish(consultationId, {
          type: 'LIVE_PREVIEW',
          micSessionId,
          text: state.english.slice(0, 4000),
          isFinal: false,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Mic live translate skipped session=${micSessionId} seq=${next.sequence}: ${(err as Error).message}`,
      );
    } finally {
      state.inflight = false;
      if (state.queued) {
        void this.drain(micSessionId, consultationId, sourceLanguage);
      }
    }
  }
}
