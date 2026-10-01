'use client';

import { Info, Loader2, Mic, Pause, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { IntakeCaptureMode, MicSource } from '@safescript/shared';
import { INTAKE_COPY } from './intake-copy';

type RecordingState = 'idle' | 'recording' | 'paused' | 'transcribing' | 'processing';

type Props = {
  mode: Exclude<IntakeCaptureMode, 'type' | null>;
  micSource: MicSource;
  micConnected?: boolean;
  recordingState: RecordingState;
  timerLabel: string;
  livePreview?: string;
  disabled?: boolean;
  onMicSourceChange: (source: MicSource) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function RecordingPanel({
  mode,
  micSource,
  micConnected,
  recordingState,
  timerLabel,
  livePreview,
  disabled,
  onMicSourceChange,
  onStart,
  onPause,
  onResume,
  onStop,
}: Props) {
  const isDictation = mode === 'dictation';
  const busy =
    recordingState === 'recording' ||
    recordingState === 'paused' ||
    recordingState === 'transcribing' ||
    recordingState === 'processing';

  return (
    <div className="min-w-0 overflow-hidden rounded-[12px] border border-[#d7e8ee] bg-[#eef7fb] px-4 py-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#10233d]">
            {isDictation ? 'Dictation mode' : 'Natural conversation mode'}
          </p>
          <p className="mt-1 max-w-full text-[13px] leading-relaxed text-[#5b6570] sm:max-w-[40rem]">
            {isDictation ? INTAKE_COPY.dictateHelper : INTAKE_COPY.conversationHelper}
          </p>
        </div>
        {micConnected ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#b7e0db] bg-white px-2.5 py-1 text-[12px] font-medium text-[#0f6f6b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0f6f6b]" aria-hidden />
            SafeScribe Mic connected
          </span>
        ) : null}
      </div>

      <div className="mt-3.5 flex min-w-0 flex-wrap items-end gap-3">
        <label className="min-w-[min(100%,180px)] flex-1">
          <span className="mb-1.5 block text-[12px] font-medium text-[#4b5563]">Microphone</span>
          <select
            value={micSource}
            disabled={disabled || busy}
            onChange={(e) => onMicSourceChange(e.target.value as MicSource)}
            className="h-10 w-full min-w-0 rounded-[10px] border border-[#d5dee2] bg-white px-3 text-sm text-[#1f2937] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="computer">This computer</option>
            <option value="safescribe_mic">SafeScribe Mic</option>
          </select>
        </label>

        {recordingState === 'idle' ? (
          <Button
            type="button"
            disabled={disabled}
            onClick={onStart}
            className="h-10 shrink-0 rounded-[10px] bg-[#0f5f7a] px-4 text-sm font-semibold text-white hover:bg-[#0c4e65]"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden />
            {isDictation ? 'Start dictation' : 'Start conversation recording'}
          </Button>
        ) : recordingState === 'transcribing' || recordingState === 'processing' ? (
          <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-[#d5dee2] bg-white px-3 text-sm text-[#334155]">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            {recordingState === 'processing' ? 'Extracting clinical note…' : 'Transcribing…'}
          </span>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#f3d19a] bg-white px-3 text-sm font-medium text-[#1f2937]"
              role="status"
            >
              <span className="relative flex h-2 w-2" aria-hidden>
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60',
                    recordingState === 'recording' && 'animate-ping',
                  )}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {recordingState === 'paused' ? 'Paused' : 'Recording'}{' '}
              <span className="font-mono tabular-nums">{timerLabel}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px]"
              onClick={recordingState === 'paused' ? onResume : onPause}
            >
              {recordingState === 'paused' ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[10px] border-red-200 text-red-700 hover:bg-red-50"
              onClick={onStop}
            >
              <Square className="h-3 w-3" /> Stop
            </Button>
          </div>
        )}
      </div>

      {livePreview ? (
        <p className="mt-3 max-h-24 overflow-y-auto break-words rounded-[10px] border border-[#d5dee2] bg-white px-3 py-2 text-sm leading-relaxed text-[#334155]">
          {livePreview}
        </p>
      ) : null}

      <p className="mt-3 inline-flex min-w-0 items-start gap-1.5 text-[12.5px] leading-relaxed text-[#5b6570]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1d6b9a]" aria-hidden />
        <span className="min-w-0">{INTAKE_COPY.tempTranscriptNotice}</span>
      </p>
    </div>
  );
}
