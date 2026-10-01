'use client';

import { useId, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShieldCheck,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TreatmentOptionView } from './treatment-options-model';
import type { TreatmentPlanConfirmStatus } from '@safescript/shared';
import {
  CONFIRM_TREATMENT_PLAN_HELPER,
  CONFIRM_TREATMENT_PLAN_LABEL,
} from './confirm-plan-judgment';

export type ConfirmPlanButtonState =
  | 'not_ready'
  | 'ready'
  | 'confirming'
  | 'confirmed';

interface Props {
  selectedOptions: TreatmentOptionView[];
  confirmState: ConfirmPlanButtonState;
  confirmStatus: TreatmentPlanConfirmStatus;
  disabledReason?: string | null;
  confirmedAt?: string | null;
  onConfirm: () => void;
  onEditPlan: () => void;
}

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

export function SelectedTreatmentPlanCard({
  selectedOptions,
  confirmState,
  confirmStatus,
  disabledReason,
  confirmedAt,
  onConfirm,
  onEditPlan,
}: Props) {
  const [viewOpen, setViewOpen] = useState(false);
  const count = selectedOptions.length;
  const isConfirmed = confirmState === 'confirmed' && confirmStatus === 'CONFIRMED';
  const isStale = confirmStatus === 'STALE';
  const canConfirm = confirmState === 'ready';
  const helperId = useId();

  const safetySummary = useMemo(() => {
    if (!count) return 'Select treatments to continue';
    if (selectedOptions.some((o) => !o.selectable && !o.clinicallyOverridden)) {
      return 'Resolve blocked selections before confirming';
    }
    if (selectedOptions.some((o) => o.clinicallyOverridden)) {
      return `${count} treatment${count === 1 ? '' : 's'} selected · Clinical override documented`;
    }
    return `${count} treatment${count === 1 ? '' : 's'} selected · Safety checks complete`;
  }, [count, selectedOptions]);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_rgba(15,23,42,0.05)]',
        isConfirmed
          ? 'border-tx-preferred-border/70'
          : isStale
            ? 'border-amber-300/80'
            : 'border-[#d5dee1]',
      )}
      aria-labelledby="selected-treatment-plan-heading"
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              isConfirmed
                ? 'bg-tx-preferred-bg text-tx-preferred-fg'
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
              id="selected-treatment-plan-heading"
              className="text-[18px] font-bold leading-tight text-[#111827] sm:text-[20px]"
            >
              Selected treatment plan
            </h2>
            <p
              className={cn(
                'mt-1 text-[14px] leading-snug',
                isConfirmed
                  ? 'font-medium text-tx-preferred-fg'
                  : isStale
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
            {count > 0 ? (
              <button
                type="button"
                onClick={() => setViewOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-tx-preferred-fg hover:underline"
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
                disabled={!canConfirm}
                aria-describedby={helperId}
                onClick={onConfirm}
                className={cn(
                  'h-11 min-w-[220px] rounded-lg px-5 text-[15px] font-semibold shadow-none',
                  'bg-[#0f766e] text-white hover:bg-[#0c635c]',
                  'disabled:cursor-not-allowed disabled:bg-[#c5d0d4] disabled:text-white/90',
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
                className="text-center text-[12px] leading-snug text-[#667085] sm:text-right"
              >
                {confirmState === 'not_ready' && disabledReason
                  ? disabledReason
                  : CONFIRM_TREATMENT_PLAN_HELPER}
              </p>
            </>
          )}
        </div>
      </div>

      {viewOpen && count > 0 ? (
        <div className="border-t border-[#e4eaec] bg-[#fafcfc] px-5 py-3.5 sm:px-6">
          <ul className="space-y-2.5">
            {selectedOptions.map((o) => (
              <li
                key={o.index}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[#e4eaec] bg-white px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#111827]">
                    {o.displayName}
                  </p>
                  {o.regimenSummary ? (
                    <p className="mt-0.5 text-[13px] text-[#58636F]">
                      {o.regimenSummary}
                    </p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                    o.clinicallyOverridden
                      ? 'border-tx-caution-border/60 bg-tx-caution-bg text-tx-caution-fg'
                      : o.safetyTier === 'AVOID'
                        ? 'border-tx-avoid-border/60 bg-tx-avoid-bg text-tx-avoid-fg'
                        : o.safetyTier === 'PREFERRED'
                          ? 'border-tx-preferred-border/60 bg-tx-preferred-bg text-tx-preferred-fg'
                          : 'border-amber-300/70 bg-amber-50 text-amber-800',
                  )}
                >
                  {o.badgeLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
