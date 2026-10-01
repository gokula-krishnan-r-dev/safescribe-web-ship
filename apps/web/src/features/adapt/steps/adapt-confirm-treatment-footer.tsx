'use client';

import { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TreatmentPlanConfirmStatus } from '@safescript/shared';
import {
  CONFIRM_TREATMENT_PLAN_HELPER,
  CONFIRM_TREATMENT_PLAN_LABEL,
} from '@/features/consultations/confirm-plan-judgment';
import type { ConfirmPlanButtonState } from '@/features/consultations/selected-treatment-plan-card';

function formatConfirmedAt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type AdaptConfirmTreatmentFooterProps = {
  confirmState: ConfirmPlanButtonState;
  confirmStatus: TreatmentPlanConfirmStatus;
  disabledReason?: string | null;
  confirmedAt?: string | null;
  onConfirm: () => void;
  onBlockedConfirm?: () => void;
  onEditPlan?: () => void;
};

/**
 * Compact primary CTA for Adapt Step 3 — sits in the Proposed Adaptation footer
 * (no separate Selected treatment plan card).
 */
export function AdaptConfirmTreatmentFooter({
  confirmState,
  confirmStatus,
  disabledReason,
  confirmedAt,
  onConfirm,
  onBlockedConfirm,
  onEditPlan,
}: AdaptConfirmTreatmentFooterProps) {
  const helperId = useId();
  const isConfirmed = confirmState === 'confirmed' && confirmStatus === 'CONFIRMED';
  const isStale = confirmStatus === 'STALE';
  const canConfirm = confirmState === 'ready';
  const isBlocked = confirmState === 'not_ready';

  if (isConfirmed) {
    return (
      <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
        <Button
          type="button"
          variant="outline"
          onClick={onEditPlan}
          className="h-11 rounded-lg border-[#c5d0d4] px-4 text-[14px] font-semibold shadow-none"
        >
          Edit treatment plan
        </Button>
        <p className="text-center text-[12px] font-medium text-emerald-700 sm:text-right">
          Confirmed{confirmedAt ? ` · ${formatConfirmedAt(confirmedAt)}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
      <Button
        type="button"
        disabled={confirmState === 'confirming'}
        aria-describedby={helperId}
        aria-disabled={!canConfirm}
        onClick={() => {
          if (canConfirm) {
            onConfirm();
            return;
          }
          if (isBlocked) {
            onBlockedConfirm?.();
          }
        }}
        className={cn(
          'h-11 min-w-[220px] rounded-lg px-5 text-[15px] font-semibold shadow-none',
          canConfirm || confirmState === 'confirming'
            ? 'bg-[#0f766e] text-white hover:bg-[#0c635c]'
            : 'cursor-pointer bg-[#c5d0d4] text-white/90 hover:bg-[#b7c3c8]',
        )}
      >
        {confirmState === 'confirming' ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Confirming plan…
          </>
        ) : isStale ? (
          'Reconfirm treatment plan'
        ) : (
          CONFIRM_TREATMENT_PLAN_LABEL
        )}
      </Button>
      <p
        id={helperId}
        className={cn(
          'max-w-[300px] text-center text-[12px] leading-snug sm:text-right',
          isBlocked && disabledReason
            ? 'font-medium text-amber-700'
            : isStale
              ? 'font-medium text-amber-700'
              : 'text-[#667085]',
        )}
      >
        {isBlocked && disabledReason
          ? disabledReason
          : isStale
            ? 'Plan changed — reconfirm to unlock counselling'
            : CONFIRM_TREATMENT_PLAN_HELPER}
      </p>
    </div>
  );
}
