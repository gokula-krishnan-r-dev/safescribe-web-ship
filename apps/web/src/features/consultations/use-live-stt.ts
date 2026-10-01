'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_STT_PROVIDER, whisperBcp47, type SttLanguageSettings } from '@safescript/shared';
import { api } from '@/lib/api-client';

export type LiveSttStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'paused'
  | 'stopping'
  | 'error';

export interface LiveTranscriptPayload {
  /** Finalized Chrome segments during this take */
  committed: string;
  /** Current interim Chrome hypothesis */
  partial: string;
  /** committed + partial — shown in the live preview box */
  display: string;
  /** True when Web Speech API is driving the preview */
  previewAvailable: boolean;
  detectedLanguage?: string | null;
  translated?: boolean;
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

/** Max local PCM (~3 min @ 16 kHz mono) */
const MAX_PCM_SAMPLES = 16_000 * 180;
const PREVIEW_WINDOW_SAMPLES = 16_000 * 2.4;
const PREVIEW_INTERVAL_MS = 2_400;

function previewLang(settings: SttLanguageSettings): string {
  return whisperBcp47(settings.sourceLanguage) || 'en-CA';
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) return floatTo16BitPCM(input);
  const ratio = inputSampleRate / 16000;
  const newLen = Math.floor(input.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    result[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return floatTo16BitPCM(result);
}

/** Build WAV (LINEAR16 mono) from PCM samples for Whisper batch STT. */
function pcmToWavBlob(samples: Int16Array, sampleRate = 16_000): Blob {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  const pcm = new Int16Array(buffer, 44, samples.length);
  pcm.set(samples);
  return new Blob([buffer], { type: 'audio/wav' });
}

function lastPcmWindow(chunks: Int16Array[], total: number, windowSamples: number): Int16Array {
  const take = Math.min(total, Math.floor(windowSamples));
  const out = new Int16Array(take);
  let remaining = take;
  for (let i = chunks.length - 1; i >= 0 && remaining > 0; i--) {
    const chunk = chunks[i]!;
    const copy = Math.min(chunk.length, remaining);
    out.set(chunk.subarray(chunk.length - copy), remaining - copy);
    remaining -= copy;
  }
  return out;
}

function joinTranscript(committed: string, partial: string): string {
  const a = committed.trim();
  const b = partial.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`.replace(/\s+/g, ' ').trim();
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function recorderExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

/**
 * Live dictate for consultations:
 * 1. Device speech recognition → real-time preview (source language when translating)
 * 2. When Translate is on, rolling Whisper windows stream English into the preview
 * 3. On Stop → upload PCM to Whisper (translate-to-English or transcribe)
 */
export function useLiveStt(consultationId: string, settings: SttLanguageSettings) {
  const provider = DEFAULT_STT_PROVIDER; // whisper
  const [status, setStatus] = useState<LiveSttStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LiveTranscriptPayload>({
    committed: '',
    partial: '',
    display: '',
    previewAvailable: Boolean(getSpeechRecognitionCtor()),
  });

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmChunksRef = useRef<Int16Array[]>([]);
  const pcmSamplesRef = useRef(0);
  const pausedRef = useRef(false);
  const activeRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const restartRecognitionRef = useRef(false);
  const committedLiveRef = useRef('');
  const partialLiveRef = useRef('');
  const settingsRef = useRef(settings);
  const sessionSettingsRef = useRef<SttLanguageSettings>(settings);
  const whisperPreviewInflightRef = useRef(false);
  const lastPreviewAtRef = useRef(0);
  const detectedLanguageRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const startInFlightRef = useRef(false);

  settingsRef.current = settings;

  const publishLive = useCallback((committed: string, partial: string, extra?: { detectedLanguage?: string | null; translated?: boolean }) => {
    committedLiveRef.current = committed;
    partialLiveRef.current = partial;
    setTranscript({
      committed,
      partial,
      display: joinTranscript(committed, partial),
      previewAvailable: Boolean(getSpeechRecognitionCtor()),
      detectedLanguage: extra?.detectedLanguage ?? detectedLanguageRef.current,
      translated: extra?.translated ?? sessionSettingsRef.current.translateToEnglish,
    });
  }, []);

  const clearLive = useCallback(() => {
    committedLiveRef.current = '';
    partialLiveRef.current = '';
    setTranscript({
      committed: '',
      partial: '',
      display: '',
      previewAvailable: Boolean(getSpeechRecognitionCtor()),
      detectedLanguage: null,
      translated: false,
    });
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    restartRecognitionRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      if (abort) rec.abort();
      else rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (sessionSettingsRef.current.translateToEnglish) {
      setTranscript((t) => ({ ...t, previewAvailable: true }));
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setTranscript((t) => ({ ...t, previewAvailable: false }));
      return;
    }

    stopRecognition(true);

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = previewLang(sessionSettingsRef.current);
    restartRecognitionRef.current = true;

    rec.onresult = (event) => {
      if (!activeRef.current || pausedRef.current) return;
      if (sessionSettingsRef.current.translateToEnglish) return;
      let interim = '';
      let newlyFinal = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result?.[0]?.transcript ?? '';
        if (!piece) continue;
        if (result.isFinal) newlyFinal += `${piece} `;
        else interim += piece;
      }
      if (newlyFinal.trim()) {
        const nextCommitted = joinTranscript(committedLiveRef.current, newlyFinal);
        publishLive(nextCommitted, interim);
      } else {
        publishLive(committedLiveRef.current, interim);
      }
    };

    rec.onerror = (event) => {
      // non-fatal for preview — Whisper still runs on stop
      const code = event.error ?? '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setTranscript((t) => ({ ...t, previewAvailable: false }));
        restartRecognitionRef.current = false;
      }
      // 'no-speech' / 'aborted' are expected; recognition restarts via onend
    };

    rec.onend = () => {
      if (!restartRecognitionRef.current || !activeRef.current || pausedRef.current) return;
      // Chrome ends after silence — spin up a fresh recognizer while the take is active
      window.setTimeout(() => {
        if (!restartRecognitionRef.current || !activeRef.current || pausedRef.current) return;
        try {
          const again = new Ctor();
          recognitionRef.current = again;
          again.continuous = true;
          again.interimResults = true;
          again.maxAlternatives = 1;
          again.lang = previewLang(sessionSettingsRef.current);
          again.onresult = rec.onresult;
          again.onerror = rec.onerror;
          again.onend = rec.onend;
          again.start();
        } catch {
          /* Preview may stop; Whisper still finalizes on Stop */
        }
      }, 120);
    };

    try {
      rec.start();
      setTranscript((t) => ({ ...t, previewAvailable: true }));
    } catch {
      setTranscript((t) => ({ ...t, previewAvailable: false }));
    }
  }, [publishLive, stopRecognition]);

  const pushWhisperPreview = useCallback(() => {
    const session = sessionSettingsRef.current;
    if (!session.translateToEnglish) return;
    if (!activeRef.current || pausedRef.current) return;
    if (whisperPreviewInflightRef.current) return;
    if (Date.now() - lastPreviewAtRef.current < PREVIEW_INTERVAL_MS) return;
    const total = pcmSamplesRef.current;
    if (total < 16_000 * 0.9) return;

    const pcmWindow = lastPcmWindow(pcmChunksRef.current, total, PREVIEW_WINDOW_SAMPLES);
    lastPreviewAtRef.current = Date.now();
    whisperPreviewInflightRef.current = true;

    const wav = pcmToWavBlob(pcmWindow, 16_000);
    const form = new FormData();
    form.append('audio', wav, 'preview.wav');
    form.append('provider', 'whisper');
    form.append('languageCode', session.sourceLanguage || 'auto');
    form.append('translateToEnglish', 'true');
    form.append('preview', 'true');
    try {
      const preferred =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('safescribe.stt.whisperModel')
          : null;
      if (preferred) form.append('whisperModel', preferred);
    } catch {
      /* ignore */
    }

    void api
      .upload<{
        rawTranscript?: string;
        detectedLanguage?: string | null;
        translated?: boolean;
      }>(`/consultations/${consultationId}/stt/transcribe`, form)
      .then((result) => {
        if (!activeRef.current) return;
        const text = (result.rawTranscript ?? '').trim();
        if (result.detectedLanguage) {
          detectedLanguageRef.current = result.detectedLanguage;
        }
        if (text) {
          publishLive(text, '', {
            detectedLanguage: detectedLanguageRef.current,
            translated: true,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        whisperPreviewInflightRef.current = false;
      });
  }, [consultationId, publishLive]);

  const stopCapture = useCallback(() => {
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  const discardRecorder = useCallback(() => {
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    if (!rec) return;
    try {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const collectRecorderBlob = useCallback((): Promise<Blob | null> => {
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];
    if (!rec) {
      return Promise.resolve(chunks.length ? new Blob(chunks) : null);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const type = rec.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        resolve(blob && blob.size > 0 ? blob : null);
      };
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      rec.onstop = finish;
      try {
        if (rec.state === 'inactive') finish();
        else rec.stop();
      } catch {
        finish();
      }
      window.setTimeout(finish, 1500);
    });
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (activeRef.current) return true;
    if (startInFlightRef.current || status === 'listening' || status === 'connecting') {
      return status === 'listening' || activeRef.current;
    }
    startInFlightRef.current = true;
    setError(null);
    setStatus('connecting');
    pcmChunksRef.current = [];
    pcmSamplesRef.current = 0;
    recordedChunksRef.current = [];
    discardRecorder();
    detectedLanguageRef.current = null;
    lastPreviewAtRef.current = 0;
    whisperPreviewInflightRef.current = false;
    sessionSettingsRef.current = { ...settingsRef.current };
    clearLive();

    if (!window.isSecureContext) {
      startInFlightRef.current = false;
      setStatus('error');
      setError('Microphone access requires HTTPS.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const mime = pickRecorderMime();
      if (mime) {
        try {
          const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data.size) recordedChunksRef.current.push(event.data);
          };
          recorder.start(1000);
        } catch {
          mediaRecorderRef.current = null;
        }
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!activeRef.current || pausedRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = downsampleTo16k(input, ctx.sampleRate);
        pcmChunksRef.current.push(pcm);
        pcmSamplesRef.current += pcm.length;
        while (pcmSamplesRef.current > MAX_PCM_SAMPLES && pcmChunksRef.current.length > 1) {
          const dropped = pcmChunksRef.current.shift();
          pcmSamplesRef.current -= dropped?.length ?? 0;
        }
        pushWhisperPreview();
      };

      source.connect(processor);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      processor.connect(mute);
      mute.connect(ctx.destination);

      pausedRef.current = false;
      activeRef.current = true;
      setStatus('listening');

      // Chrome live preview in the spoken language (skipped when translating — Whisper streams English)
      startRecognition();
      return true;
    } catch (err) {
      activeRef.current = false;
      stopRecognition(true);
      discardRecorder();
      stopCapture();
      setStatus('error');
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Microphone blocked. Allow mic access, then try again.');
      } else if (name === 'NotFoundError') {
        setError('No microphone found. Connect a mic or continue by typing.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not start recording.');
      }
      return false;
    } finally {
      startInFlightRef.current = false;
    }
  }, [status, stopCapture, stopRecognition, startRecognition, clearLive, pushWhisperPreview, discardRecorder]);

  const pause = useCallback(async () => {
    pausedRef.current = true;
    restartRecognitionRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.pause();
    } catch {
      /* ignore */
    }
    // Fold interim into committed so pause doesn't lose preview text
    if (partialLiveRef.current.trim()) {
      publishLive(joinTranscript(committedLiveRef.current, partialLiveRef.current), '');
    }
    setStatus('paused');
  }, [publishLive]);

  const resume = useCallback(async () => {
    pausedRef.current = false;
    try {
      if (mediaRecorderRef.current?.state === 'paused') mediaRecorderRef.current.resume();
    } catch {
      /* ignore */
    }
    setStatus('listening');
    startRecognition();
  }, [startRecognition]);

  const peekPreview = useCallback(
    () => joinTranscript(committedLiveRef.current, partialLiveRef.current).trim(),
    [],
  );

  const keepPreview = useCallback(
    (text: string, extra?: { detectedLanguage?: string | null; translated?: boolean }) => {
      setTranscript({
        committed: text,
        partial: '',
        display: text,
        previewAvailable: Boolean(getSpeechRecognitionCtor()),
        detectedLanguage: extra?.detectedLanguage ?? detectedLanguageRef.current,
        translated: extra?.translated ?? sessionSettingsRef.current.translateToEnglish,
      });
    },
    [],
  );

  const stop = useCallback(async (): Promise<string> => {
    setStatus('stopping');
    activeRef.current = false;
    pausedRef.current = false;
    stopRecognition(true);

    const previewFallback = peekPreview();
    const recorderBlob = await collectRecorderBlob();
    stopCapture();

    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];
    const total = pcmSamplesRef.current;
    pcmSamplesRef.current = 0;

    const wav =
      total >= 16_000 * 0.4 && chunks.length
        ? (() => {
            const merged = new Int16Array(total);
            let offset = 0;
            for (const chunk of chunks) {
              merged.set(chunk, offset);
              offset += chunk.length;
            }
            return pcmToWavBlob(merged, 16_000);
          })()
        : null;

    const audioBlob =
      recorderBlob && recorderBlob.size > 2000
        ? recorderBlob
        : wav;

    if (!audioBlob) {
      setStatus('idle');
      if (previewFallback) {
        keepPreview(previewFallback);
        return previewFallback;
      }
      clearLive();
      setError('No speech was captured. Hold Record a bit longer and speak clearly.');
      return '';
    }

    const filename =
      audioBlob === wav
        ? 'dictation.wav'
        : `dictation.${recorderExtension(audioBlob.type)}`;
    const form = new FormData();
    form.append('audio', audioBlob, filename);
    form.append('provider', 'whisper');
    form.append('languageCode', sessionSettingsRef.current.sourceLanguage || 'auto');
    form.append(
      'translateToEnglish',
      sessionSettingsRef.current.translateToEnglish ? 'true' : 'false',
    );
    try {
      const preferred =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('safescribe.stt.whisperModel')
          : null;
      if (preferred) form.append('whisperModel', preferred);
    } catch {
      /* ignore storage errors */
    }

    try {
      const result = await api.upload<{
        rawTranscript?: string;
        provider?: string;
        model?: string | null;
        detectedLanguage?: string | null;
        translated?: boolean;
      }>(`/consultations/${consultationId}/stt/transcribe`, form);
      const raw = (result.rawTranscript ?? '').trim();
      setStatus('idle');
      if (result.detectedLanguage) detectedLanguageRef.current = result.detectedLanguage;
      if (!raw) {
        if (previewFallback) {
          keepPreview(previewFallback, {
            detectedLanguage: detectedLanguageRef.current,
            translated: sessionSettingsRef.current.translateToEnglish,
          });
          return previewFallback;
        }
        clearLive();
        setError(
          sessionSettingsRef.current.translateToEnglish
            ? 'No speech was translated. Try again speaking clearly.'
            : 'No speech was transcribed. Try again speaking clearly.',
        );
        return '';
      }
      keepPreview(raw, {
        detectedLanguage: detectedLanguageRef.current,
        translated: Boolean(result.translated),
      });
      return raw;
    } catch (err) {
      setStatus('error');
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Transcription failed. Try again or type your notes.';
      setError(message);
      if (previewFallback) {
        keepPreview(previewFallback);
        return previewFallback;
      }
      clearLive();
      return '';
    }
  }, [
    collectRecorderBlob,
    consultationId,
    keepPreview,
    peekPreview,
    stopCapture,
    stopRecognition,
    clearLive,
  ]);

  const cancel = useCallback(async () => {
    activeRef.current = false;
    pausedRef.current = false;
    pcmChunksRef.current = [];
    pcmSamplesRef.current = 0;
    discardRecorder();
    stopRecognition(true);
    stopCapture();
    clearLive();
    setStatus('idle');
    setError(null);
  }, [discardRecorder, stopCapture, stopRecognition, clearLive]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      discardRecorder();
      stopRecognition(true);
      stopCapture();
    };
  }, [discardRecorder, stopCapture, stopRecognition]);

  return {
    /** Always Whisper for the final polish pass */
    provider,
    status,
    error,
    transcript,
    start,
    pause,
    resume,
    stop,
    cancel,
    peekPreview,
  };
}
