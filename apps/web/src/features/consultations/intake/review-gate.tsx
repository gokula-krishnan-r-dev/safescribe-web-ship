'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INTAKE_COPY } from './intake-copy';

type Props = {
  status: 'empty' | 'draft' | 'review_required' | 'approved';
  transcriptDeleted?: boolean;
  busy?: boolean;
  canApprove: boolean;
  onApproveAndContinue: () => void;
};

export function IntakeReviewGate({
  status,
  transcriptDeleted,
  busy,
  canApprove,
  onApproveAndContinue,
}: Props) {
  if (status === 'approved') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#b7e0db] bg-[#eef8f6] px-4 py-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#0f6f6b]" aria-hidden />
          <div>
            <p className="text-[14px] font-semibold text-[#0f6f6b]">{INTAKE_COPY.approved}</p>
            {transcriptDeleted ? (
              <p className="mt-0.5 text-[12.5px] text-[#3d6f6c]">{INTAKE_COPY.transcriptDeleted}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onApproveAndContinue}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Continuing…' : INTAKE_COPY.continueApproved}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#f3d19a] bg-[#fff8eb] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-[#d97706]" aria-hidden />
        <div>
          <p className="text-[14px] font-semibold text-[#b45309]">{INTAKE_COPY.reviewRequired}</p>
          <p className="mt-0.5 text-[12.5px] text-[#92400e]/80">{INTAKE_COPY.reviewHelper}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={!canApprove || busy}
        onClick={onApproveAndContinue}
        className={cn(
          'inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
          canApprove
            ? 'bg-[#e38b2a] text-white hover:bg-[#d17d1f]'
            : 'cursor-not-allowed bg-[#f3d19a] text-white/80',
        )}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        {busy ? 'Approving…' : INTAKE_COPY.approve}
      </button>
    </div>
  );
}

export function IntakeFooter({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[10px] border border-[#d5dee2] bg-white px-5 py-2.5 text-[15px] font-medium text-[#1f2937] hover:bg-[#f8fafb]"
      >
        Cancel
      </button>
    </div>
  );
}
