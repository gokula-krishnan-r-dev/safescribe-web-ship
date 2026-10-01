'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TherapyReviewGate } from '@safescript/shared';

export function TherapyReviewSummary({
  gate,
  className,
}: {
  gate: TherapyReviewGate;
  className?: string;
}) {
  const unresolved = gate.unresolvedMedicationIds.length;
  const total = gate.reviewableCount;
  const reviewed = gate.conditionsReviewedCount ?? 0;
  const needing = (gate.itemsNeedingCompletion ?? gate.incompleteReviewKeys.length) + unresolved;
  const exceptions = gate.exceptionsDocumentedCount ?? 0;

  return (
    <aside className={cn('space-y-4', className)}>
      <section className="rounded-[14px] border border-[#d9e4e8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#102a43]">Review summary</h2>
        <ul className="mt-3 space-y-3 text-sm">
          <li className="flex items-start justify-between gap-3">
            <span className="text-[#52677a]">Conditions reviewed</span>
            <span className="flex items-center gap-1.5 font-semibold text-[#102a43]">
              {total ? `${reviewed} of ${total}` : reviewed}
              {total > 0 && reviewed === total ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              ) : null}
            </span>
          </li>
          <li className="flex items-start justify-between gap-3">
            <span className="text-[#52677a]">Exceptions documented</span>
            <span className="font-semibold text-[#102a43]">{exceptions}</span>
          </li>
          <li className="flex items-start justify-between gap-3">
            <span className="text-[#52677a]">Items needing completion</span>
            <span
              className={cn(
                'font-semibold',
                needing > 0 ? 'text-[#c2410c]' : 'text-emerald-700',
              )}
            >
              {needing}
            </span>
          </li>
          {unresolved > 0 ? (
            <li className="flex items-center justify-end gap-1 text-[12px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {unresolved} need indication confirmation
            </li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-[14px] border border-[#d9e4e8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#102a43]">At a glance</h2>
        <ul className="mt-3 space-y-2.5 text-sm">
          <GlanceRow
            done={gate.adherenceReviewedCount > 0}
            complete={gate.adherenceReviewed}
            label="Adherence reviewed"
            count={total ? `${gate.adherenceReviewedCount} / ${total}` : undefined}
          />
          <GlanceRow
            done={gate.effectivenessReviewedCount > 0}
            complete={gate.effectivenessReviewed}
            label="Effectiveness reviewed"
            count={total ? `${gate.effectivenessReviewedCount} / ${total}` : undefined}
          />
          <GlanceRow
            done={gate.tolerabilityReviewedCount > 0}
            complete={gate.tolerabilityReviewed}
            label="Medication-related reviewed"
            count={total ? `${gate.tolerabilityReviewedCount} / ${total}` : undefined}
          />
        </ul>
        {gate.exceptionGlance?.length ? (
          <div className="mt-4 border-t border-[#e6eef1] pt-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#52677a]">
              Exceptions at a glance
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-amber-800">
              {gate.exceptionGlance?.map((row) => (
                <li key={row.key} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {row.label}: {row.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : exceptions > 0 ? (
          <ul className="mt-3 space-y-1.5">
            <ConcernLine>
              {exceptions} condition{exceptions === 1 ? '' : 's'} {exceptions === 1 ? 'has' : 'have'} a
              documented exception
            </ConcernLine>
          </ul>
        ) : null}
      </section>

      <div className="rounded-xl border border-[#cfe3e2] bg-[#f3fafa] px-3.5 py-3 text-[12px] leading-relaxed text-[#1f4f4c]">
        <p className="flex gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Answer all questions for each condition or document any exceptions to continue.
        </p>
      </div>
    </aside>
  );
}

function ConcernLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </li>
  );
}

function GlanceRow({
  done,
  complete,
  label,
  count,
}: {
  done: boolean;
  complete?: boolean;
  label: string;
  count?: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <CheckCircle2
        className={cn(
          'h-4 w-4 shrink-0',
          complete || done ? 'text-emerald-600' : 'text-muted-foreground/40',
        )}
        aria-hidden
      />
      <span className="flex-1">{label}</span>
      {count ? <span className="tabular-nums text-[#52677a]">{count}</span> : null}
    </li>
  );
}
