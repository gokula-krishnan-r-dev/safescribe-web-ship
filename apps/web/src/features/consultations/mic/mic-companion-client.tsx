'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPublicApiUrl } from '@/lib/api-url';
import { BrandMark } from '@/components/shared/brand-mark';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  Check,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  ShieldCheck,
} from 'lucide-react';
import {
  newIdempotencyKey,
  type MicSanitizedState,
  type MicSessionState,
} from '@/features/consultations/mic/types';
import { whisperBcp47, whisperLanguageLabel } from '@safescript/shared';

type Phase = 'claiming' | 'ready' | 'recording' | 'paused' | 'uploading' | 'done' | 'error';

const CONSENT_NOTICE = 'mic-consent-v1.0';

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return 'audio/webm';
}

async function sha256Hex(blob: Blob): Promise<string | undefined> {
  try {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

function micFetch(
  path: string,
  sessionToken: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer mic_${sessionToken}`);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${getPublicApiUrl()}/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
}

export function MicCompanionClient({ pairToken }: { pairToken: string }) {
  const [phase, setPhase] = useState<Phase>('claiming');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [session, setSession] = useState<MicSanitizedState | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [livePreview, setLivePreview] = useState('');
  const [uploadStatus, setUploadStatus] = useState('Idle');
  const [level, setLevel] = useState(0);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentRef = useRef(0);
  const sequenceRef = useRef(0);
  const mimeRef = useRef('audio/webm');
  const sessionRef = useRef(session);
  const tokenRef = useRef(sessionToken);
  const speechRef = useRef<SpeechRecognition | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    tokenRef.current = sessionToken;
  }, [sessionToken]);

  const updateSession = useCallback((s: MicSanitizedState) => {
    setSession(s);
    if (s.state === 'RECORDING') setPhase('recording');
    else if (s.state === 'PAUSED') setPhase('paused');
    else if (
      s.state === 'FINALIZING' ||
      s.state === 'TRANSCRIBING' ||
      s.state === 'TRANSCRIPT_READY' ||
      s.state === 'COMPLETED'
    ) {
      setPhase('done');
    } else if (s.state === 'READY' || s.state === 'CLAIMED' || s.state === 'CONSENT_REQUIRED') {
      setPhase('ready');
    }
  }, []);

  // Claim pairing on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${getPublicApiUrl()}/api/v1/mic/pairings/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pairToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg =
            data?.error?.message ||
            data?.message ||
            'This SafeScribe Mic link is no longer active.';
          throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
        }
        if (cancelled) return;
        setSessionToken(data.sessionToken);
        updateSession(data as MicSanitizedState);
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg((err as Error).message);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pairToken, updateSession]);

  // Heartbeat
  useEffect(() => {
    if (!sessionToken || !session || phase === 'done' || phase === 'error') return;
    const id = window.setInterval(() => {
      void micFetch(
        `/mic/sessions/${session.micSessionId}/heartbeat`,
        sessionToken,
        { method: 'POST', body: '{}' },
      );
    }, 15_000);
    return () => window.clearInterval(id);
  }, [phase, session, sessionToken]);

  // Elapsed timer
  useEffect(() => {
    if (phase !== 'recording') return;
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const enableMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      mediaStreamRef.current = stream;
      setMicReady(true);

      // Audio level meter
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!mediaStreamRef.current) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(1, avg / 80));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      // Notify server mic ready
      if (session && sessionToken) {
        const res = await micFetch(
          `/mic/sessions/${session.micSessionId}/commands`,
          sessionToken,
          {
            method: 'POST',
            body: JSON.stringify({
              command: 'MIC_READY',
              expectedStateVersion: session.stateVersion,
              idempotencyKey: newIdempotencyKey(),
            }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as MicSanitizedState;
          updateSession(data);
        }
      }
    } catch {
      setErrorMsg(
        'Microphone access is off. Allow access in your browser settings.',
      );
    }
  }, [session, sessionToken, updateSession]);

  const startSpeechPreview = useCallback(() => {
    const SR =
      typeof window !== 'undefined'
        ? (
            window as unknown as {
              SpeechRecognition?: new () => SpeechRecognition;
              webkitSpeechRecognition?: new () => SpeechRecognition;
            }
          ).SpeechRecognition ||
          (
            window as unknown as {
              webkitSpeechRecognition?: new () => SpeechRecognition;
            }
          ).webkitSpeechRecognition
        : null;
    if (!SR || !sessionToken || !session) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = whisperBcp47(session.sourceLanguage) || 'en-CA';
    let committed = '';
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (!r) continue;
        if (r.isFinal) committed += r[0]?.transcript + ' ';
        else interim += r[0]?.transcript || '';
      }
      const text = `${committed}${interim}`.trim();
      setLivePreview(text);
      void micFetch(
        `/mic/sessions/${session.micSessionId}/live-preview`,
        sessionToken,
        {
          method: 'POST',
          body: JSON.stringify({ text, isFinal: false }),
        },
      );
    };
    rec.onerror = () => undefined;
    try {
      rec.start();
      speechRef.current = rec;
    } catch {
      /* ignore */
    }
  }, [session, sessionToken]);

  const stopSpeechPreview = useCallback(() => {
    try {
      speechRef.current?.stop();
    } catch {
      /* ignore */
    }
    speechRef.current = null;
  }, []);

  const uploadBlob = useCallback(
    async (blob: Blob, segment: number, sequence: number) => {
      const token = tokenRef.current;
      const s = sessionRef.current;
      if (!token || !s) return;
      setUploadStatus('Uploading…');
      const fd = new FormData();
      fd.append('audio', blob, `part-${segment}-${sequence}.webm`);
      fd.append('segmentNumber', String(segment));
      fd.append('sequenceNumber', String(sequence));
      const checksum = await sha256Hex(blob);
      if (checksum) fd.append('checksumSha256', checksum);
      const res = await micFetch(`/mic/sessions/${s.micSessionId}/parts`, token, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) setUploadStatus('Audio protected');
      else setUploadStatus('Upload retry needed');
    },
    [],
  );

  const pendingUploadsRef = useRef<Promise<void>[]>([]);

  const enqueueUpload = useCallback(
    (blob: Blob, segment: number, sequence: number) => {
      const p = uploadBlob(blob, segment, sequence).catch(() => undefined);
      pendingUploadsRef.current.push(p);
      void p.finally(() => {
        pendingUploadsRef.current = pendingUploadsRef.current.filter((x) => x !== p);
      });
    },
    [uploadBlob],
  );

  const startRecorder = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    mimeRef.current = pickMimeType();
    const recorder = new MediaRecorder(stream, { mimeType: mimeRef.current });
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) {
        const seq = sequenceRef.current++;
        enqueueUpload(ev.data, segmentRef.current, seq);
      }
    };
    recorder.start(5000);
    recorderRef.current = recorder;
    startSpeechPreview();
  }, [enqueueUpload, startSpeechPreview]);

  const stopRecorder = useCallback(async () => {
    stopSpeechPreview();
    const recorder = recorderRef.current;
    if (!recorder) {
      await Promise.allSettled(pendingUploadsRef.current);
      return;
    }
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      if (recorder.state !== 'inactive') {
        try {
          recorder.requestData();
        } catch {
          /* some browsers throw if inactive */
        }
        recorder.stop();
      } else {
        resolve();
      }
    });
    recorderRef.current = null;
    // Wait for final part(s) so Complete never races finalize with 0 parts
    await Promise.allSettled(pendingUploadsRef.current);
    await new Promise((r) => setTimeout(r, 400));
  }, [stopSpeechPreview]);

  const attestConsent = useCallback(async () => {
    if (!session || !sessionToken || !consentChecked || !micReady) return;
    const res = await micFetch(
      `/mic/sessions/${session.micSessionId}/consent`,
      sessionToken,
      {
        method: 'POST',
        body: JSON.stringify({
          consentObtained: true,
          method: 'VERBAL',
          noticeVersion: CONSENT_NOTICE,
          expectedStateVersion: session.stateVersion,
          idempotencyKey: newIdempotencyKey(),
        }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data?.error?.message || 'Could not record consent');
      return;
    }
    const data = (await res.json()) as MicSanitizedState;
    updateSession(data);
  }, [consentChecked, micReady, session, sessionToken, updateSession]);

  const command = useCallback(
    async (cmd: string) => {
      if (!session || !sessionToken) return null;
      const res = await micFetch(
        `/mic/sessions/${session.micSessionId}/commands`,
        sessionToken,
        {
          method: 'POST',
          body: JSON.stringify({
            command: cmd,
            expectedStateVersion: session.stateVersion,
            idempotencyKey: newIdempotencyKey(),
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data?.error?.message || `Could not ${cmd}`);
        return null;
      }
      const data = (await res.json()) as MicSanitizedState;
      updateSession(data);
      return data;
    },
    [session, sessionToken, updateSession],
  );

  const handleStart = async () => {
    if (session?.state !== 'READY') {
      await attestConsent();
    }
    // refresh state after consent
    const s = sessionRef.current;
    const token = tokenRef.current;
    if (!s || !token) return;
    // get latest version
    const got = await micFetch(`/mic/sessions/${s.micSessionId}`, token);
    if (got.ok) {
      const latest = (await got.json()) as MicSanitizedState;
      updateSession(latest);
      const res = await micFetch(
        `/mic/sessions/${latest.micSessionId}/commands`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            command: 'START',
            expectedStateVersion: latest.stateVersion,
            idempotencyKey: newIdempotencyKey(),
          }),
        },
      );
      if (res.ok) {
        const next = (await res.json()) as MicSanitizedState;
        updateSession(next);
        sequenceRef.current = 0;
        segmentRef.current = 0;
        startedAtRef.current = Date.now();
        startRecorder();
        setPhase('recording');
        try {
          await navigator.wakeLock?.request?.('screen');
        } catch {
          /* optional */
        }
      }
    }
  };

  const handlePause = async () => {
    await stopRecorder();
    await command('PAUSE');
    setPhase('paused');
  };

  const handleResume = async () => {
    segmentRef.current += 1;
    sequenceRef.current = 0;
    await command('RESUME');
    startRecorder();
    setPhase('recording');
  };

  const handleEnd = async () => {
    setEndConfirmOpen(false);
    setPhase('uploading');
    setUploadStatus('Sending final audio…');
    await stopRecorder();
    // END then complete with freshest stateVersion
    await command('END');
    const token = tokenRef.current;
    let s = sessionRef.current;
    if (s && token) {
      const latest = await micFetch(`/mic/sessions/${s.micSessionId}`, token);
      if (latest.ok) {
        const data = (await latest.json()) as MicSanitizedState;
        updateSession(data);
        s = data;
      }
      await micFetch(`/mic/sessions/${s.micSessionId}/complete`, token, {
        method: 'POST',
        body: JSON.stringify({
          expectedStateVersion: s.stateVersion,
          idempotencyKey: newIdempotencyKey(),
          clientMimeType: mimeRef.current,
          durationSeconds: elapsed,
        }),
      });
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setPhase('done');
  };

  const handleDisconnect = async () => {
    await stopRecorder();
    await command('CANCEL');
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    setPhase('error');
    setErrorMsg('Disconnected. Return to the SafeScribe desktop and generate a new QR code.');
  };

  const canStart = consentChecked && micReady && phase === 'ready';
  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const stepIndex =
    phase === 'recording' || phase === 'paused' || phase === 'done'
      ? 2
      : consentChecked
        ? 1
        : 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 py-8 text-[#111827]">
      <header className="flex flex-col items-center text-center">
        <div className="flex items-center gap-2">
          <BrandMark size="sm" priority />
          <span className="text-lg font-bold tracking-tight">SafeScribe</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-[#0F766E]">SafeScribe Mic</h1>
      </header>

      {phase === 'claiming' && (
        <div className="mt-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Connecting securely…</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-10 rounded-xl border border-border bg-muted/40 p-5 text-center">
          <p className="text-sm leading-relaxed text-foreground">
            {errorMsg ||
              'This SafeScribe Mic link is no longer active. Return to the SafeScribe desktop and generate a new QR code.'}
          </p>
        </div>
      )}

      {(phase === 'ready' || phase === 'recording' || phase === 'paused') && (
        <>
          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Securely connected
            </span>
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Use this phone as the microphone for the active SafeScribe consultation.
              {session?.translateToEnglish
                ? ` Translating ${whisperLanguageLabel(session.sourceLanguage)} into English.`
                : null}
            </p>
          </div>

          {/* Stepper */}
          <div className="mt-6 flex items-center justify-center gap-2 px-2">
            {['Connected', 'Consent', 'Record'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                      i <= stepIndex
                        ? 'bg-[#0F766E] text-white'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
                {i < 2 && (
                  <div
                    className={cn(
                      'mb-4 h-0.5 w-8',
                      i < stepIndex ? 'bg-[#0F766E]' : 'bg-muted',
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {phase === 'ready' && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <h2 className="font-semibold">Before recording</h2>
                {!micReady ? (
                  <Button
                    type="button"
                    className="mt-3 w-full gap-2"
                    onClick={() => void enableMic()}
                  >
                    <Mic className="h-4 w-4" />
                    Turn on microphone
                  </Button>
                ) : (
                  <p className="mt-2 text-sm text-emerald-700">Microphone ready</p>
                )}
                <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-border"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                  />
                  <span>
                    I have explained transcription and the patient has agreed.
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Declining transcription will not affect care.
                    </span>
                  </span>
                </label>
              </div>

              <Button
                type="button"
                className="h-12 w-full gap-2 text-base"
                disabled={!canStart}
                onClick={() => void handleStart()}
              >
                <Mic className="h-4 w-4" />
                Start consultation
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm font-medium text-[#0F766E] underline-offset-2 hover:underline"
                onClick={() => void handleDisconnect()}
              >
                Disconnect
              </button>
            </div>
          )}

          {(phase === 'recording' || phase === 'paused') && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-border p-5 text-center">
                <div className="flex items-center justify-center gap-2 text-lg font-semibold">
                  {phase === 'recording' ? (
                    <>
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                      </span>
                      Recording
                    </>
                  ) : (
                    'Paused'
                  )}
                </div>
                <p className="mt-2 font-mono text-3xl tabular-nums">{timer}</p>
                <div className="mx-auto mt-4 h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-[#0F766E] transition-all"
                    style={{ width: `${Math.round(level * 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{uploadStatus}</p>
                {livePreview && (
                  <p className="mt-3 max-h-24 overflow-y-auto text-left text-sm text-muted-foreground">
                    {livePreview}
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Keep this page open and the screen unlocked while recording.
                </p>
              </div>
              <div className="flex gap-2">
                {phase === 'recording' ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 flex-1 gap-2"
                    onClick={() => void handlePause()}
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="h-12 flex-1 gap-2"
                    onClick={() => void handleResume()}
                  >
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  className="h-12 flex-1 gap-2"
                  onClick={() => setEndConfirmOpen(true)}
                >
                  <Square className="h-4 w-4" />
                  End consultation
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'uploading' && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium text-foreground">Sending recording…</p>
          <p className="text-sm">{uploadStatus || 'Keep this page open a moment.'}</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold">Recording sent</h2>
          <p className="text-sm text-muted-foreground">
            Continue on the SafeScribe desktop.
          </p>
          <Button type="button" variant="outline" onClick={() => window.close()}>
            Close this tab
          </Button>
        </div>
      )}

      <footer className="mt-auto pt-10">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E]" />
          <p>
            No patient information is stored on this phone. Audio is sent securely to SafeScribe.
          </p>
        </div>
      </footer>

      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="End and send recording?"
        description="This stops the recording and sends the audio to SafeScribe for transcription."
        confirmLabel="End and send"
        cancelLabel="Keep recording"
        variant="destructive"
        onConfirm={() => void handleEnd()}
      />
    </div>
  );
}

// Minimal SpeechRecognition typing for browsers
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }>;
}
