'use client';

import { useState } from 'react';
import { Check, ChevronDown, Droplets } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  renalHeadline,
  type RenalSafetyView,
} from './renal-safety-model';

interface Props {
  view: RenalSafetyView;
  applying?: boolean;
  onApply?: () => void;
  onRestore?: () => void;
  onChangeProduct?: () => void;
  changeProductButtonId?: string;
}

export function RenalSafetyCard({
  view,
  applying,
  onApply,
  onRestore,
  onChangeProduct,
  changeProductButtonId,
}: Props) {
  const [dosingOpen, setDosingOpen] = useState(false);
  if (!view.matched || view.state === 'NOT_APPLICABLE') return null;

  const canApply = view.state === 'ADJUSTMENT_RECOMMENDED' && Boolean(onApply);
  const applied = view.state === 'APPLIED' || view.state === 'MODIFIED';
  const renalMetricMismatch =
    view.state === 'RENAL_VALUE_REQUIRED' &&
    Boolean(view.basis && view.patient && view.patient.basis !== view.basis);

  return (
    <div className="rounded-[12px] border border-[#ead9b0] bg-white px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fdecee] text-[#b42318]">
          <Droplets className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[13.5px] font-bold uppercase tracking-[0.02em] text-[#b42318]">
            {renalHeadline(view.state)}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              {renalMetricMismatch ? (
                <>
                  <p className="text-[12px] font-semibold text-[#667085]">
                    Renal dosing for this treatment is based on {view.basis}.
                  </p>
                  <p className="mt-2 text-[12px] font-semibold text-[#667085]">Available</p>
                  <p className="mt-0.5 text-[15px] font-bold text-[#1e3a5f]">
                    {view.patient!.basis} {view.patient!.displayValue} {view.patient!.unit}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[12px] font-semibold text-[#667085]">
                    {view.patient?.basis
                      ? `Patient ${view.patient.basis}`
                      : view.basis
                        ? `Patient ${view.basis}`
                        : 'Patient renal value'}
                  </p>
                  <p className="mt-0.5 text-[15px] font-bold text-[#1e3a5f]">
                    {view.patient
                      ? `${view.patient.displayValue} ${view.patient.unit}`
                      : 'Not recorded'}
                  </p>
                </>
              )}
            </div>
            {applied ? (
              <div>
                <p className="text-[12px] font-semibold text-[#667085]">Applied regimen</p>
                <p className="mt-0.5 text-[13.5px] font-semibold leading-snug text-[#1b7a4e]">
                  {view.recommendedRegimenSummary || 'Renal-adjusted regimen selected by pharmacist'}
                </p>
              </div>
            ) : view.recommendedRegimenSummary ? (
              <div>
                <p className="text-[12px] font-semibold text-[#667085]">
                  Recommended for this patient
                </p>
                <p className="mt-0.5 text-[13.5px] font-semibold leading-snug text-[#1b7a4e]">
                  {view.recommendedRegimenSummary}
                </p>
              </div>
            ) : null}
          </div>

          {view.disableApplyReason && view.state !== 'ADJUSTMENT_RECOMMENDED' ? (
            <p className="whitespace-normal break-words text-[13px] leading-relaxed text-[#344054]">
              {view.disableApplyReason}
            </p>
          ) : null}

          {view.state === 'APPLIED' ? (
            <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1b7a4e]">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Renal-adjusted regimen selected by pharmacist
            </p>
          ) : null}

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              {applied && onRestore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRestore}
                  className="h-9 rounded-[10px] border-[#0F817C]/35 px-3.5 text-[13px] font-semibold text-[#0F817C]"
                >
                  Restore standard regimen
                </Button>
              ) : null}
              {view.tiers.length > 0 ? (
                <button
                  type="button"
                  aria-expanded={dosingOpen}
                  onClick={() => setDosingOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#3d6b9a] hover:underline"
                >
                  View all renal dosing
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', dosingOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              ) : null}
            </div>
            {canApply || (view.state === 'PRODUCT_REQUIRED' && onChangeProduct) ? (
              <div className="flex justify-end sm:ml-auto sm:shrink-0">
                {canApply ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={applying}
                    onClick={onApply}
                    className="h-9 min-w-[11.5rem] rounded-[10px] bg-[#3d6b9a] px-4 text-[13px] font-semibold shadow-[0_1px_2px_rgba(30,58,95,0.18)] hover:bg-[#345c86]"
                  >
                    Apply renal-adjusted regimen
                  </Button>
                ) : onChangeProduct ? (
                  <Button
                    id={changeProductButtonId}
                    type="button"
                    size="sm"
                    disabled={applying}
                    onClick={onChangeProduct}
                    aria-label="Use adjusted regimen. Choose a compatible product strength."
                    className="h-9 min-w-[11.5rem] rounded-[10px] bg-[#3d6b9a] px-4 text-[13px] font-semibold shadow-[0_1px_2px_rgba(30,58,95,0.18)] hover:bg-[#345c86]"
                  >
                    Use adjusted regimen
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {dosingOpen && view.tiers.length > 0 ? (
            <div className="space-y-3 rounded-[10px] border border-[#e6ecee] bg-[#f8fbfb] px-3.5 py-3">
              <ul className="space-y-3">
                {view.tiers.map((tier) => {
                  const active = view.applicableTier?.label === tier.label;
                  return (
                    <li key={tier.label} className="min-w-0 text-[13px]">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-[#1e3a5f]">
                        {tier.label}
                        {active ? (
                          <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11px] font-semibold text-[#1b7a4e]">
                            Applies
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 whitespace-normal break-words overflow-visible leading-relaxed text-[#52606d]">
                        {tier.regimen}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {view.clinicalSource ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6ecee] pt-2.5">
                  <p className="min-w-0 whitespace-normal break-words text-[12px] text-[#667085]">
                    Source: {view.clinicalSource.shortLabel}
                  </p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="View clinical source"
                        className="inline-flex shrink-0 items-center text-[12.5px] font-semibold text-[#3d6b9a] hover:underline"
                      >
                        View source ›
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="max-h-[min(70vh,28rem)] w-[min(100vw-2rem,22rem)] overflow-y-auto p-4"
                    >
                      <p className="text-[13px] font-semibold text-[#1e3a5f]">Clinical source</p>
                      <p className="mt-1.5 whitespace-normal break-words text-[13px] leading-relaxed text-[#344054]">
                        {view.clinicalSource.fullReference}
                      </p>
                      <p className="mt-3 text-[13px] font-semibold text-[#1e3a5f]">
                        Clinical guidance used
                      </p>
                      <ul className="mt-1.5 space-y-2">
                        {view.tiers.map((tier) => (
                          <li key={`source-${tier.label}`}>
                            <p className="text-[12.5px] font-semibold text-[#1e3a5f]">{tier.label}</p>
                            <p className="whitespace-normal break-words text-[12.5px] leading-relaxed text-[#52606d]">
                              {tier.regimen}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {view.clinicalSource.url ? (
                        <a
                          href={view.clinicalSource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex text-[12.5px] font-semibold text-[#3d6b9a] hover:underline"
                        >
                          Open source
                        </a>
                      ) : null}
                    </PopoverContent>
                  </Popover>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
