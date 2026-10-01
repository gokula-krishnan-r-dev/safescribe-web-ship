import { MicCommand, MicSessionState } from './mic.types';

/** Allowed transitions. Server is authoritative. */
const TRANSITIONS: Partial<Record<MicSessionState, Partial<Record<MicCommand | 'CLAIM' | 'EXPIRE' | 'TRANSCRIPT_OK' | 'TRANSCRIPT_FAIL' | 'FINALIZE_OK' | 'COMPLETE_WORKFLOW', MicSessionState>>>> =
  {
    WAITING: {
      CLAIM: 'CLAIMED',
      EXPIRE: 'EXPIRED',
      CANCEL: 'CANCELLED',
    },
    CLAIMED: {
      MIC_READY: 'CONSENT_REQUIRED',
      CANCEL: 'CANCELLED',
      EXPIRE: 'EXPIRED',
    },
    CONSENT_REQUIRED: {
      // consent attestation moves to READY (handled as START_PREP via service)
      MIC_READY: 'CONSENT_REQUIRED',
      CANCEL: 'CANCELLED',
      EXPIRE: 'EXPIRED',
    },
    READY: {
      START: 'RECORDING',
      CANCEL: 'CANCELLED',
      EXPIRE: 'EXPIRED',
    },
    RECORDING: {
      PAUSE: 'PAUSED',
      END: 'FINALIZING',
      CANCEL: 'CANCELLED',
    },
    PAUSED: {
      RESUME: 'RECORDING',
      END: 'FINALIZING',
      CANCEL: 'CANCELLED',
    },
    FINALIZING: {
      FINALIZE_OK: 'TRANSCRIBING',
      TRANSCRIPT_FAIL: 'RECOVERABLE_ERROR',
      CANCEL: 'CANCELLED',
    },
    TRANSCRIBING: {
      TRANSCRIPT_OK: 'TRANSCRIPT_READY',
      TRANSCRIPT_FAIL: 'RECOVERABLE_ERROR',
      RETRY_TRANSCRIPTION: 'TRANSCRIBING',
    },
    TRANSCRIPT_READY: {
      COMPLETE_WORKFLOW: 'COMPLETED',
    },
    RECOVERABLE_ERROR: {
      RETRY_TRANSCRIPTION: 'TRANSCRIBING',
      CANCEL: 'CANCELLED',
    },
  };

export function canTransition(
  from: MicSessionState,
  event: MicCommand | 'CLAIM' | 'EXPIRE' | 'TRANSCRIPT_OK' | 'TRANSCRIPT_FAIL' | 'FINALIZE_OK' | 'COMPLETE_WORKFLOW' | 'CONSENT',
): boolean {
  if (event === 'CONSENT') {
    return from === 'CONSENT_REQUIRED' || from === 'CLAIMED';
  }
  const map = TRANSITIONS[from];
  if (!map) return false;
  return Boolean(map[event as keyof typeof map]);
}

export function nextState(
  from: MicSessionState,
  event: MicCommand | 'CLAIM' | 'EXPIRE' | 'TRANSCRIPT_OK' | 'TRANSCRIPT_FAIL' | 'FINALIZE_OK' | 'COMPLETE_WORKFLOW' | 'CONSENT',
): MicSessionState {
  if (event === 'CONSENT') {
    if (from === 'CONSENT_REQUIRED' || from === 'CLAIMED') return 'READY';
    throw new Error(`Invalid transition ${from} + CONSENT`);
  }
  const map = TRANSITIONS[from];
  const to = map?.[event as keyof typeof map] as MicSessionState | undefined;
  if (!to) {
    throw new Error(`Invalid transition ${from} + ${event}`);
  }
  return to;
}

export function isTerminal(state: MicSessionState): boolean {
  return (
    state === 'COMPLETED' ||
    state === 'FAILED' ||
    state === 'EXPIRED' ||
    state === 'CANCELLED'
  );
}

export function isRecordingPhase(state: MicSessionState): boolean {
  return state === 'RECORDING' || state === 'PAUSED';
}
