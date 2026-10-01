'use client';

import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RenewStep4Summary } from '@safescript/shared';

export function RenewStep4SummaryPanel({
  summary,
  className,
}: {
  summary: RenewStep4Summary;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        'rounded-xl border border-[#d7e2e6] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#0F6F6B]" aria-hidden />
        <h2 className="text-sm font-semibold text-[#163447]">Summary</h2>
      </div>
      <ul className="space-y-2.5 text-sm">
        <SummaryRow label="Medications reviewed" value={String(summary.medicationsReviewed)} />
        <SummaryRow
          label="Selected to renew"
          value={String(summary.selectedToRenew)}
          valueClass="font-semibold text-[#1f8a4c]"
        />
        <SummaryRow
          label="Need review"
          value={String(summary.needReview)}
          valueClass={summary.needReview ? 'font-semibold text-amber-700' : undefined}
        />
        <SummaryRow
          label="Monitoring unavailable"
          value={String(summary.monitoringUnavailable)}
          valueClass={summary.monitoringUnavailable ? 'font-semibold text-amber-700' : undefined}
        />
        <SummaryRow label="Conditions confirmed" value={String(summary.conditionsConfirmed)} />
        <SummaryRow
          label="Adherence"
          value={summary.adherence}
          valueClass={
            summary.adherence === 'Good'
              ? 'font-semibold text-[#1f8a4c]'
              : summary.adherence === 'Concerns'
                ? 'font-semibold text-amber-700'
                : undefined
          }
        />
      </ul>
    </aside>
  );
}

function SummaryRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="text-[#5b6b75]">{label}</span>
      <span className={cn('text-right font-medium text-[#163447]', valueClass)}>{value}</span>
    </li>
  );
}
