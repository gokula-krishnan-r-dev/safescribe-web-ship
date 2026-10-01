'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, OctagonX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MonitoringSummaryCounts } from '@safescript/shared';

export function MonitoringSummaryPanel({
  counts,
  canContinue,
}: {
  counts: MonitoringSummaryCounts;
  canContinue: boolean;
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-[14px] border border-[#d9e4e8] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#102a43]">Monitoring summary</h2>
        <ul className="mt-3 space-y-2.5 text-sm">
          <SummaryRow
            icon={<OctagonX className="h-4 w-4 text-[#b42318]" />}
            label="Action required"
            value={counts.actionRequired}
            tone={counts.actionRequired ? 'action' : 'muted'}
          />
          <SummaryRow
            icon={<AlertTriangle className="h-4 w-4 text-[#b54708]" />}
            label="Review required"
            value={counts.reviewRequired}
            tone={counts.reviewRequired ? 'review' : 'muted'}
          />
          <SummaryRow
            icon={<Circle className="h-3.5 w-3.5 text-[#667085]" />}
            label="Unavailable"
            value={counts.unavailable}
            tone="muted"
          />
          <SummaryRow
            icon={<CheckCircle2 className="h-4 w-4 text-[#027A48]" />}
            label="No action needed"
            value={counts.noActionNeeded}
            tone="ok"
          />
        </ul>
      </section>

      <section
        className={cn(
          'rounded-[14px] border px-4 py-3.5 text-[13px] leading-5',
          canContinue
            ? 'border-[#cce6d4] bg-[#f3faf5] text-[#166534]'
            : 'border-[#cfe0f4] bg-[#eef5fb] text-[#1e4b73]',
        )}
      >
        <p className="font-semibold">Continue to Renewal Plan</p>
        <p className="mt-1">
          {canContinue
            ? 'Monitoring & Safety review is complete. You can continue.'
            : 'You must review and address all items with status Action required or Review required before continuing.'}
        </p>
      </section>
    </aside>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: 'action' | 'review' | 'ok' | 'muted';
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[#52677a]">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'font-semibold',
          tone === 'action' && 'text-[#b42318]',
          tone === 'review' && 'text-[#b54708]',
          tone === 'ok' && 'text-[#027A48]',
          tone === 'muted' && 'text-[#102a43]',
        )}
      >
        {value}
      </span>
    </li>
  );
}
