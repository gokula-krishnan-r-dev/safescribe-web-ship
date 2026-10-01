'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { getPublicApiUrl } from '@/lib/api-url';
import type { SttLanguageSettings } from '@safescript/shared';
import {
  newIdempotencyKey,
  type MicPairingResponse,
  type MicSanitizedState,
  type MicSessionState,
  type MicSseEvent,
} from './types';

const TERMINAL_OR_IDLE: MicSessionState[] = [
  'TRANSCRIPT_READY',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'COMPLETED',
  'RECOVERABLE_ERROR',
];

const LIVE_STATES: MicSessionState[] = [
  'WAITING',
  'CLAIMED',
  'CONSENT_REQUIRED',
  'READY',
  'RECORDING',
  'PAUSED',
  'FINALIZING',
  'TRANSCRIBING',
];

export function useMicSession(consultationId: string, sttLanguage?: SttLanguageSettings) {
  const [session, setSession] = useState<MicSanitizedState | null>(null);
  const [pairing, setPairing] = useState<MicPairingResponse | null>(null);
  const [livePreview, setLivePreview] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<{ close: () => void } | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<MicSanitizedState | null>(null);
  const livePreviewRef = useRef('');
  const sttRef = useRef(sttLanguage);
  sttRef.current = sttLanguage;
  const wantsSseRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    livePreviewRef.current = livePreview;
  }, [livePreview]);

  const applyState = useCallback((s: Partial<MicSanitizedState> & { state?: MicSessionState }) => {
    setSession((prev) => {
      if (!prev && !s.micSessionId) return prev;
      const next: MicSanitizedState = {
        micSessionId: s.micSessionId || prev!.micSessionId,
        pairingId: s.pairingId || prev?.pairingId || '',
        state: (s.state || prev?.state || 'WAITING') as MicSessionState,
        stateVersion: s.stateVersion ?? prev?.stateVersion ?? 0,
        recordingStartedAt: s.recordingStartedAt ?? prev?.recordingStartedAt ?? null,
        lastHeartbeatAt: s.lastHeartbeatAt ?? prev?.lastHeartbeatAt ?? null,
        upload: s.upload || prev?.upload || { partsReceived: 0, bytesReceived: 0 },
        failureCode: s.failureCode ?? prev?.failureCode ?? null,
        pairingExpiresAt: s.pairingExpiresAt ?? prev?.pairingExpiresAt,
        sourceLanguage: s.sourceLanguage ?? prev?.sourceLanguage,
        translateToEnglish: s.translateToEnglish ?? prev?.translateToEnglish,
        detectedLanguage: s.detectedLanguage ?? prev?.detectedLanguage,
        speechLocaleId: s.speechLocaleId ?? prev?.speechLocaleId,
      };
      // Ignore stale SSE/poll results with lower version for same session
      if (
        prev &&
        prev.micSessionId === next.micSessionId &&
        typeof s.stateVersion === 'number' &&
        s.stateVersion < prev.stateVersion
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const disconnectSse = useCallback(() => {
    wantsSseRef.current = false;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const connectSse = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    wantsSseRef.current = true;

    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) return;

    const url = `${getPublicApiUrl()}/api/v1/consultations/${consultationId}/mic/session/events`;
    const ctrl = new AbortController();
    let closed = false;
    let attempt = 0;

    const run = async () => {
      while (!closed && wantsSseRef.current) {
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) {
            throw new Error(`SSE ${res.status}`);
          }
          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!closed && wantsSseRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';
            for (const part of parts) {
              const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
              if (!dataLine) continue;
              try {
                const payload = JSON.parse(dataLine.slice(5).trim()) as MicSseEvent;
                if (payload.type === 'LIVE_PREVIEW') {
                  livePreviewRef.current = payload.text;
                  setLivePreview(payload.text);
                } else if (payload.type === 'MIC_STATE_CHANGED') {
                  applyState(payload);
                  if (payload.state === 'TRANSCRIPT_READY') {
                    setLivePreview('');
                  }
                }
              } catch {
                /* ignore parse errors */
              }
            }
          }
        } catch {
          /* network / abort */
        }

        if (closed || !wantsSseRef.current) break;
        attempt += 1;
        const delay = Math.min(12_000, 800 * 2 ** Math.min(attempt, 4));
        await new Promise<void>((resolve) => {
          reconnectTimer.current = setTimeout(resolve, delay);
        });
      }
    };

    void run();

    esRef.current = {
      close: () => {
        closed = true;
        ctrl.abort();
      },
    };
  }, [applyState, consultationId]);

  const refresh = useCallback(async () => {
    try {
      const s = await api.get<MicSanitizedState | null>(
        `/consultations/${consultationId}/mic/session`,
      );
      if (s) applyState(s);
      else setSession(null);
      return s;
    } catch {
      return null;
    }
  }, [applyState, consultationId]);

  /** Poll while session is live so desktop stays correct even if SSE drops. */
  useEffect(() => {
    if (!session || !LIVE_STATES.includes(session.state)) return;
    const id = window.setInterval(() => {
      void refresh();
    }, session.state === 'FINALIZING' || session.state === 'TRANSCRIBING' ? 2_000 : 4_000);
    return () => window.clearInterval(id);
  }, [refresh, session?.micSessionId, session?.state]);

  const createPairing = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await api.post<MicPairingResponse>(
        `/consultations/${consultationId}/mic/pairings`,
        {
          sourceLanguage: sttRef.current?.sourceLanguage || 'auto',
          translateToEnglish: Boolean(sttRef.current?.translateToEnglish),
        },
      );
      setPairing(res);
      applyState({
        micSessionId: res.micSessionId,
        pairingId: res.pairingId,
        state: res.state,
        stateVersion: res.stateVersion,
        recordingStartedAt: null,
        lastHeartbeatAt: null,
        upload: { partsReceived: 0, bytesReceived: 0 },
        failureCode: null,
        pairingExpiresAt: res.expiresAt,
      });
      connectSse();
      return res;
    } catch (err) {
      const msg =
        (err as { message?: string | string[]; error?: { message?: string } })?.error
          ?.message ||
        (err as { message?: string | string[] })?.message ||
        'Could not create SafeScribe Mic pairing';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [applyState, connectSse, consultationId]);

  useEffect(() => {
    if (!sttLanguage) return;
    const current = sessionRef.current;
    if (!current) return;
    if (
      current.state === 'RECORDING' ||
      current.state === 'PAUSED' ||
      current.state === 'FINALIZING' ||
      current.state === 'TRANSCRIBING'
    ) {
      return;
    }
    void api
      .post(`/consultations/${consultationId}/mic/session/stt-settings`, {
        sourceLanguage: sttLanguage.sourceLanguage,
        translateToEnglish: sttLanguage.translateToEnglish,
      })
      .catch(() => undefined);
  }, [consultationId, sttLanguage?.sourceLanguage, sttLanguage?.translateToEnglish]);

  const sendCommand = useCallback(
    async (command: string) => {
      const current = sessionRef.current;
      if (!current) return;
      try {
        const res = await api.post<MicSanitizedState>(
          `/consultations/${consultationId}/mic/session/commands`,
          {
            command,
            expectedStateVersion: current.stateVersion,
            idempotencyKey: newIdempotencyKey(),
          },
        );
        applyState(res);
        return res;
      } catch (err) {
        // Version conflict: refresh and surface a clear message
        await refresh();
        const message =
          (err as { error?: { message?: string }; message?: string })?.error?.message ||
          (err as { message?: string })?.message ||
          'Command failed — refresh and try again';
        setError(String(message));
        throw err;
      }
    },
    [applyState, consultationId, refresh],
  );

  const cancel = useCallback(async () => {
    try {
      const current = sessionRef.current;
      if (current && !TERMINAL_OR_IDLE.includes(current.state)) {
        await sendCommand('CANCEL');
      }
    } catch {
      /* ignore */
    }
    disconnectSse();
    setPairing(null);
    setSession(null);
    setLivePreview('');
    setError(null);
  }, [disconnectSse, sendCommand]);

  const waitForFinalTranscript = useCallback(
    async (options?: { timeoutMs?: number; isCurrent?: () => boolean }) => {
      const timeoutMs = options?.timeoutMs ?? 45_000;
      const startedAt = Date.now();
      const isCurrent = options?.isCurrent ?? (() => true);

      const readConsultationText = async () => {
        const updated = await api.get<{
          transcript?: string | null;
          rawTranscript?: string | null;
        }>(`/consultations/${consultationId}`);
        return (updated.rawTranscript || updated.transcript || '').trim();
      };

      while (Date.now() - startedAt < timeoutMs) {
        if (!isCurrent()) return '';
        const state = sessionRef.current?.state;
        if (
          state === 'FAILED' ||
          state === 'RECOVERABLE_ERROR' ||
          state === 'CANCELLED' ||
          state === 'EXPIRED'
        ) {
          return livePreviewRef.current.trim();
        }

        if (state === 'TRANSCRIPT_READY' || state === 'COMPLETED') {
          try {
            const text = await readConsultationText();
            if (text) return text;
          } catch {
            /* retry */
          }
        } else {
          await refresh();
        }
        await new Promise((resolve) => setTimeout(resolve, state === 'TRANSCRIPT_READY' ? 400 : 1000));
      }

      if (!isCurrent()) return '';
      try {
        const text = await readConsultationText();
        if (text) return text;
      } catch {
        /* ignore */
      }
      return livePreviewRef.current.trim();
    },
    [consultationId, refresh],
  );

  useEffect(() => {
    return () => disconnectSse();
  }, [disconnectSse]);

  return {
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
    setLivePreview,
    waitForFinalTranscript,
  };
}
