'use client';

import { ChevronRight, Loader2, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ASSESSMENT_COPY } from './assessment-copy';

export function PathwayMatchRow({
  displayName,
  continuing,
  onEvidence,
  onContinue,
  selected,
  onSelect,
  compact,
}: {
  displayName: string;
  continuing?: boolean;
  onEvidence?: () => void;
  onContinue?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
}) {
  if (compact && onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors',
          selected
            ? 'border-[#0f6f6b] bg-[#f3fbfa] ring-2 ring-[#0f6f6b]/25'
            : 'border-[#e6eef1] bg-white hover:border-[#cfe8e5] hover:bg-[#f8fcfb]',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-[#0f6f6b] bg-[#0f6f6b]' : 'border-[#c5d0d6] bg-white',
          )}
          aria-hidden
        >
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-[#10233d]">{displayName}</span>
          <span className="mt-0.5 block text-[13px] text-[#5b6b76]">
            {ASSESSMENT_COPY.structuredAvailable}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#cfe8e5] bg-[#f3fbfa] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-[#10233d]">{displayName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="text-[#5b6b76]">{ASSESSMENT_COPY.structuredAvailable}</span>
          {onEvidence ? (
            <button
              type="button"
              onClick={onEvidence}
              className="font-semibold text-[#0f6f6b] hover:underline"
            >
              {ASSESSMENT_COPY.evidenceReview}
            </button>
          ) : null}
        </div>
      </div>
      {onContinue ? (
        <button
          type="button"
          onClick={onContinue}
          disabled={continuing}
          className="inline-flex h-10 shrink-0 items-center rounded-full bg-[#0f6f6b] px-5 text-sm font-semibold text-white hover:bg-[#0c5e5b] disabled:opacity-60"
        >
          {continuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {ASSESSMENT_COPY.continue}
        </button>
      ) : null}
    </div>
  );
}

export function ClinicalJudgmentRow({
  continuing,
  emphasized,
  onContinue,
}: {
  continuing?: boolean;
  emphasized?: boolean;
  onContinue: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onContinue}
      disabled={continuing}
      className={cn(
        'flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors',
        emphasized
          ? 'border-[#cfe8e5] bg-[#f3fbfa] hover:bg-[#eaf7f5]'
          : 'border-[#e6eef1] bg-[#f7fafb] hover:bg-[#eef4f6]',
        'disabled:opacity-60',
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#0f6f6b] shadow-sm">
        {continuing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Stethoscope className="h-4 w-4" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold text-[#1b3a4a]">
        {ASSESSMENT_COPY.clinicalJudgment}
      </span>
      <ChevronRight className="h-4 w-4 text-[#8a97a3]" aria-hidden />
    </button>
  );
}
