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

export type MicCommand =
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'END'
  | 'CANCEL'
  | 'RETRY_TRANSCRIPTION'
  | 'MIC_READY';

export const ACTIVE_MIC_STATES: MicSessionState[] = [
  'WAITING',
  'CLAIMED',
  'CONSENT_REQUIRED',
  'READY',
  'RECORDING',
  'PAUSED',
  'FINALIZING',
  'TRANSCRIBING',
];

export const MIC_CONSENT_NOTICE_VERSION = 'mic-consent-v1.0';

export const MIC_COOKIE_NAME = 'safescribe_mic_session';

export type MicSanitizedState = {
  micSessionId: string;
  pairingId: string;
  state: MicSessionState;
  stateVersion: number;
  recordingStartedAt: string | null;
  lastHeartbeatAt: string | null;
  upload: {
    partsReceived: number;
    bytesReceived: number;
  };
  failureCode: string | null;
  expiresAt?: string | null;
  pairingExpiresAt?: string | null;
  sourceLanguage?: string;
  translateToEnglish?: boolean;
  detectedLanguage?: string | null;
  /** Device speech recognizer locale (e.g. pa_IN) when a language is selected */
  speechLocaleId?: string | null;
};

export type MicEventPayload =
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
