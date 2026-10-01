'use client';

import { useId, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ListChecks,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
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

export type AdaptConfirmTreatmentSummary = {
  drugName: string;
  sig?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  reasonLabel?: string;
};

interface Props {
  treatment: AdaptConfirmTreatmentSummary | null;
  confirmState: ConfirmPlanButtonState;
  confirmStatus: TreatmentPlanConfirmStatus;
  disabledReason?: string | null;
  confirmedAt?: string | null;
  onConfirm: () => void;
  /** When confirm is blocked, guide the pharmacist to the active requirement. */
  onBlockedConfirm?: () => void;
  onEditPlan: () => void;
}

export function AdaptConfirmTreatmentCard({
  treatment,
  confirmState,
  confirmStatus,
  disabledReason,
  confirmedAt,
  onConfirm,
  onBlockedConfirm,
  onEditPlan,
}: Props) {
  const [viewOpen, setViewOpen] = useState(false);
  const helperId = useId();
  const isConfirmed = confirmState === 'confirmed' && confirmStatus === 'CONFIRMED';
  const isStale = confirmStatus === 'STALE';
  const canConfirm = confirmState === 'ready';
  const isBlocked = confirmState === 'not_ready';
  const hasTreatment = Boolean(treatment?.drugName?.trim());

  const safetySummary = !hasTreatment
    ? 'Complete the proposed adaptation and safety review to continue'
    : isBlocked && disabledReason
      ? disabledReason
      : 'Proposed adaptation selected · Safety checks complete';

  return (
    <section
      id="adapt-selected-treatment-plan"
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_rgba(15,23,42,0.05)]',
        isConfirmed
          ? 'border-emerald-300/80'
          : isStale
            ? 'border-amber-300/80'
            : 'border-[#d5dee1]',
      )}
      aria-labelledby="adapt-selected-treatment-plan-heading"
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              isConfirmed
                ? 'bg-emerald-50 text-emerald-700'
                : isStale
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-[#eff9f8] text-[#0f766e]',
            )}
          >
            {isConfirmed ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            ) : (
              <ShieldCheck className="h-5 w-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <h2
              id="adapt-selected-treatment-plan-heading"
              className="text-[18px] font-bold leading-tight text-[#111827] sm:text-[20px]"
            >
              Selected treatment plan
            </h2>
            <p
              className={cn(
                'mt-1 text-[14px] leading-snug',
                isConfirmed
                  ? 'font-medium text-emerald-800'
                  : isStale || (isBlocked && hasTreatment)
                    ? 'font-medium text-amber-800'
                    : 'text-[#58636F]',
              )}
            >
              {isConfirmed
                ? `Confirmed${confirmedAt ? ` · ${formatConfirmedAt(confirmedAt)}` : ''}`
                : isStale
                  ? 'Plan changed — reconfirm to refresh counselling'
                  : safetySummary}
            </p>
            {hasTreatment ? (
              <button
                type="button"
                onClick={() => setViewOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0f766e] hover:underline"
                aria-expanded={viewOpen}
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                {viewOpen ? 'Hide selected treatments' : 'View selected treatments'}
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    viewOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
          {isConfirmed ? (
            <Button
              type="button"
              variant="outline"
              onClick={onEditPlan}
              className="h-11 rounded-lg border-[#c5d0d4] px-4 text-[14px] font-semibold shadow-none"
            >
              Edit treatment plan
            </Button>
          ) : (
            <>
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
                ) : (
                  CONFIRM_TREATMENT_PLAN_LABEL
                )}
              </Button>
              <p
                id={helperId}
                className={cn(
                  'max-w-[280px] text-center text-[12px] leading-snug sm:text-right',
                  isBlocked && disabledReason ? 'font-medium text-amber-700' : 'text-[#667085]',
                )}
              >
                {isBlocked && disabledReason
                  ? disabledReason
                  : CONFIRM_TREATMENT_PLAN_HELPER}
              </p>
            </>
          )}
        </div>
      </div>

      {viewOpen && treatment ? (
        <div className="border-t border-[#e4eaec] bg-[#fafcfc] px-5 py-3.5 sm:px-6">
          <ul className="space-y-2.5">
            <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[#e4eaec] bg-white px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#111827]">
                  {treatment.drugName}
                </p>
                <p className="mt-0.5 text-[13px] text-[#52677a]">
                  {[treatment.sig, treatment.dose, treatment.frequency, treatment.duration]
                    .filter(Boolean)
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .join(' · ') || '—'}
                </p>
                {treatment.reasonLabel ? (
                  <p className="mt-1 text-[12px] text-[#829ab1]">
                    Reason: {treatment.reasonLabel}
                  </p>
                ) : null}
              </div>
              {treatment.quantity ? (
                <span className="text-[12.5px] font-medium text-[#627d98]">
                  Qty {treatment.quantity}
                </span>
              ) : null}
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}
