'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Link2,
  Loader2,
  Mic,
  Pause,
  Phone,
  Play,
  Square,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { api } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useMicSession } from './use-mic-session';
import type { MicSessionState } from './types';
import type { SttLanguageSettings } from '@safescript/shared';
import { whisperLanguageLabel } from '@safescript/shared';

type Props = {
  consultationId: string;
  active: boolean;
  sttLanguage?: SttLanguageSettings;
  /** Called once when draft transcript is written on the consultation. */
  onTranscriptReady?: (transcript: string) => void;
  onBusyChange?: (busy: boolean) => void;
};

function statusLabel(
  state: MicSessionState | undefined,
  failureCode?: string | null,
): string {
  switch (state) {
    case 'WAITING':
      return 'Waiting for phone';
    case 'CLAIMED':
    case 'CONSENT_REQUIRED':
      return 'Phone connected — waiting for consent';
    case 'READY':
      return 'SafeScribe Mic connected — ready to record';
    case 'RECORDING':
      return 'Recording';
    case 'PAUSED':
      return 'Recording paused';
    case 'FINALIZING':
      return 'Securing the recording…';
    case 'TRANSCRIBING':
      return 'Generating transcript…';
    case 'TRANSCRIPT_READY':
      return 'Draft transcript ready';
    case 'RECOVERABLE_ERROR':
      if (failureCode === 'NO_AUDIO_PARTS') {
        return 'No audio received — disconnect and record again';
      }
      if (failureCode === 'EMPTY_TRANSCRIPT') {
        return 'No speech detected — try recording again';
      }
      if (failureCode === 'WHISPER_FAILED') {
        return 'Transcription failed — retry or type notes';
      }
      return 'Recoverable error — retry or use another input method';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'Session ended';
    default:
      return 'SafeScribe Mic';
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function SafeScribeMicPanel({
  consultationId,
  active,
  sttLanguage,
  onTranscriptReady,
  onBusyChange,
}: Props) {
  const {
    session,
    pairing,
    livePreview,
    connecting,
    error,
    createPairing,
    sendCommand,
    cancel,
    refresh,
    connectSse,
  } = useMicSession(consultationId, sttLanguage);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const notifiedReadyRef = useRef<string | null>(null);
  const pairingKickRef = useRef(false);

  useEffect(() => {
    if (!active) {
      pairingKickRef.current = false;
      return;
    }
    void (async () => {
      await refresh();
      connectSse();
      if (!pairingKickRef.current) {
        pairingKickRef.current = true;
        try {
          await createPairing();
        } catch {
          /* error surface via hook */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, consultationId]);

  useEffect(() => {
    const url = pairing?.pairingUrl;
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: '#0f766e', light: '#ffffff' },
    }).then(setQrDataUrl);
  }, [pairing?.pairingUrl]);

  const isRecording = session?.state === 'RECORDING';
  const isPaused = session?.state === 'PAUSED';
  const isBusy =
    isRecording ||
    isPaused ||
    session?.state === 'FINALIZING' ||
    session?.state === 'TRANSCRIBING' ||
    hydrating;

  useEffect(() => {
    onBusyChange?.(Boolean(isBusy));
  }, [isBusy, onBusyChange]);

  // Pull draft transcript into Step 1 notes once Whisper finishes.
  useEffect(() => {
    if (!active) return;
    if (session?.state !== 'TRANSCRIPT_READY' && session?.state !== 'TRANSCRIBING' && session?.state !== 'FINALIZING') {
      return;
    }

    const readyKey = session.micSessionId;
    if (session.state === 'TRANSCRIPT_READY' && notifiedReadyRef.current === readyKey) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setHydrating(true);
      // TRANSCRIBING / FINALIZING: poll until READY + transcript body
      const attempts = session.state === 'TRANSCRIPT_READY' ? 8 : 36;
      for (let i = 0; i < attempts && !cancelled; i++) {
        if (session.state !== 'TRANSCRIPT_READY') {
          await refresh();
        }
        try {
          const updated = await api.get<{
            transcript?: string | null;
            rawTranscript?: string | null;
          }>(`/consultations/${consultationId}`);
          const text = (updated.transcript || updated.rawTranscript || '').trim();
          if (text) {
            if (notifiedReadyRef.current !== readyKey) {
              notifiedReadyRef.current = readyKey;
              onTranscriptReady?.(text);
            }
            break;
          }
        } catch {
          /* retry */
        }
        await sleep(session.state === 'TRANSCRIPT_READY' ? 700 : 1_800);
      }
      if (!cancelled) setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    active,
    consultationId,
    onTranscriptReady,
    refresh,
    session?.micSessionId,
    session?.state,
  ]);

  useEffect(() => {
    if (!isRecording || !session?.recordingStartedAt) {
      return;
    }
    const started = new Date(session.recordingStartedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isRecording, session?.recordingStartedAt]);

  const timer = useMemo(() => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  const showQr =
    !session ||
    session.state === 'WAITING' ||
    session.state === 'CANCELLED' ||
    session.state === 'EXPIRED';

  if (!active) return null;

  return (
    <div className="mt-3 space-y-3 rounded-[10px] border border-[#B8D4D0] bg-[#F4FBFA] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0F766E]">
            <Phone className="h-4 w-4" aria-hidden />
            Connect SafeScribe Mic
          </div>
          {showQr && (
            <p className="mt-0.5 text-sm text-[#475569]">
              Scan with your phone to use it as the microphone for this consultation.
              {sttLanguage?.translateToEnglish
                ? ` Spoken language: ${whisperLanguageLabel(sttLanguage.sourceLanguage)} → English.`
                : null}
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#C8D3D7] bg-white px-2.5 py-1 text-xs font-medium text-[#334155]">
          {session?.state === 'WAITING' && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
          )}
          {(isRecording ||
            session?.state === 'TRANSCRIBING' ||
            session?.state === 'FINALIZING' ||
            hydrating) && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
          {statusLabel(session?.state, session?.failureCode)}
          {isRecording && <span className="tabular-nums text-foreground">{timer}</span>}
        </span>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {showQr && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto shrink-0 rounded-xl border border-[#D3DEE1] bg-white p-3 shadow-sm">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Scan to open SafeScribe Mic" width={200} height={200} />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-[#475569]">
              <li>Scan the QR code</li>
              <li>Confirm patient consent</li>
              <li>Tap Start consultation</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!pairing?.pairingUrl}
                onClick={async () => {
                  if (!pairing?.pairingUrl) return;
                  await navigator.clipboard.writeText(pairing.pairingUrl);
                  toast.success('Secure link copied', { announce: true });
                }}
              >
                <Link2 className="h-3.5 w-3.5" />
                Copy secure link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={connecting}
                onClick={() => {
                  pairingKickRef.current = true;
                  void createPairing();
                }}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', connecting && 'animate-spin')} />
                Refresh code
              </Button>
            </div>
            <p className="text-xs text-[#64748B]">
              Single-use link · Expires in 5 minutes · No patient details shared.
            </p>
          </div>
        </div>
      )}

      {!showQr && session && (
        <div className="space-y-3">
          {livePreview && session.state === 'RECORDING' && (
            <div className="rounded-lg border border-[#C8D3D7] bg-white px-3 py-2 text-sm text-[#334155]">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[#64748B]">
                {sttLanguage?.translateToEnglish
                  ? 'Live English translation'
                  : 'Live preview'}
              </p>
              <p className="leading-relaxed">{livePreview}</p>
            </div>
          )}

          {(session.state === 'FINALIZING' ||
            session.state === 'TRANSCRIBING' ||
            hydrating) && (
            <div className="flex items-center gap-2 rounded-lg border border-[#C8D3D7] bg-white px-3 py-2.5 text-sm text-[#334155]">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <span>
                {session.state === 'FINALIZING'
                  ? 'Uploading and securing audio…'
                  : 'Whisper is generating your draft transcript…'}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {session.state === 'READY' && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => void sendCommand('START')}
              >
                <Mic className="h-3.5 w-3.5" />
                Start
              </Button>
            )}
            {session.state === 'RECORDING' && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => void sendCommand('PAUSE')}
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => setEndConfirmOpen(true)}
                >
                  <Square className="h-3.5 w-3.5" />
                  End
                </Button>
              </>
            )}
            {session.state === 'PAUSED' && (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void sendCommand('RESUME')}
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => setEndConfirmOpen(true)}
                >
                  <Square className="h-3.5 w-3.5" />
                  End
                </Button>
              </>
            )}
            {session.state === 'RECOVERABLE_ERROR' && (
              <>
                {(session.failureCode === 'WHISPER_FAILED' ||
                  session.failureCode === 'EMPTY_TRANSCRIPT' ||
                  !session.failureCode) && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      notifiedReadyRef.current = null;
                      void sendCommand('RETRY_TRANSCRIPTION');
                    }}
                  >
                    Retry transcription
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    notifiedReadyRef.current = null;
                    pairingKickRef.current = true;
                    void cancel().then(() => createPairing());
                  }}
                >
                  Start new Mic session
                </Button>
              </>
            )}
            {session.state === 'TRANSCRIPT_READY' && (
              <p className="text-sm text-[#0F766E]">Draft inserted into notes — review required.</p>
            )}
            {!['FINALIZING', 'TRANSCRIBING', 'TRANSCRIPT_READY'].includes(session.state) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void cancel()}>
                Disconnect phone
              </Button>
            )}
          </div>

          {session.upload.partsReceived > 0 && (
            <p className="text-xs text-[#64748B]">
              Audio protected · {session.upload.partsReceived} parts ·{' '}
              {Math.round(session.upload.bytesReceived / 1024)} KB
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="End and send recording?"
        description="This stops the phone recording and sends the audio to SafeScribe for transcription."
        confirmLabel="End and send"
        cancelLabel="Keep recording"
        variant="destructive"
        onConfirm={() => {
          setEndConfirmOpen(false);
          void sendCommand('END');
        }}
      />
    </div>
  );
}

/** Mode pills for Step 1 capture options (single composition — match product UI) */
export function CaptureModePills(props: {
  mode: 'desktop' | 'mic' | 'photos';
  onChange: (mode: 'desktop' | 'mic' | 'photos') => void;
  photoCount?: number;
  photoLimit?: number;
  disabled?: boolean;
  micHint?: boolean;
}) {
  const { mode, onChange, photoCount = 0, photoLimit = 5, disabled, micHint } = props;

  const pill = (
    id: 'desktop' | 'mic' | 'photos',
    label: string,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(id)}
      className={cn(
        'inline-flex h-[38px] items-center gap-2 rounded-[8px] border px-3.5 text-sm font-medium transition-colors',
        mode === id
          ? 'border-[#0F766E] bg-[#E6F5F3] text-[#0F766E] shadow-sm'
          : 'border-[#C8D3D7] bg-white text-[#334155] hover:bg-[#F8FAFB]',
        disabled && 'opacity-50',
      )}
    >
      {icon}
      {label}
      {id === 'photos' && (
        <span className="text-xs font-normal text-muted-foreground">
          {photoCount} of {photoLimit}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {pill('desktop', 'Record on this computer', <Mic className="h-3.5 w-3.5" />)}
        {pill('mic', 'Use SafeScribe Mic', <Phone className="h-3.5 w-3.5" />)}
        {pill('photos', 'Add photos', <Camera className="h-3.5 w-3.5" />)}
      </div>
      {micHint && mode === 'mic' && (
        <p className="pl-0.5 text-xs text-[#64748B]">
          No desktop microphone? Use your phone securely—no app required.
        </p>
      )}
    </div>
  );
}
