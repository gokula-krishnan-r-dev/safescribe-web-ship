/** Shared types for SafeScribe Mic desktop + phone clients */

export type MicSessionState =
  | 'WAITING'
  | 'CLAIMED'
  | 'CONSENT_REQUIRED'
  | 'READY'
  | 'RECORDING'
  | 'PAUSED'
  | 'FINALIZING'
  | 'TRANSCRIBING'
  | 'TRANSCRIPT_READY'
  | 'COMPLETED'
  | 'RECOVERABLE_ERROR'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export type MicSanitizedState = {
  micSessionId: string;
  pairingId: string;
  state: MicSessionState;
  stateVersion: number;
  recordingStartedAt: string | null;
  lastHeartbeatAt: string | null;
  upload: { partsReceived: number; bytesReceived: number };
  failureCode: string | null;
  pairingExpiresAt?: string | null;
  sessionToken?: string;
  pairingUrl?: string;
  consentNoticeVersion?: string;
  message?: string;
  sourceLanguage?: string;
  translateToEnglish?: boolean;
  detectedLanguage?: string | null;
  speechLocaleId?: string | null;
};

export type MicPairingResponse = {
  pairingId: string;
  micSessionId: string;
  pairingUrl: string;
  pairToken: string;
  expiresAt: string;
  state: MicSessionState;
  stateVersion: number;
};

export type MicSseEvent =
  | {
      type: 'MIC_STATE_CHANGED';
      micSessionId: string;
      state: MicSessionState;
      stateVersion: number;
      recordingStartedAt: string | null;
      lastHeartbeatAt: string | null;
      upload: { partsReceived: number; bytesReceived: number };
      failureCode?: string | null;
    }
  | {
      type: 'LIVE_PREVIEW';
      micSessionId: string;
      text: string;
      isFinal?: boolean;
    };

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
