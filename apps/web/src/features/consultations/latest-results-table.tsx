'use client';

import { AlertTriangle, Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatestLabResultRow, LabResultStatusTone } from '@safescript/shared';

const TONE_CLASS: Record<LabResultStatusTone, string> = {
  action: 'bg-[#fce8e8] text-[#b42318]',
  review: 'bg-[#fdedd3] text-[#b54708]',
  ok: 'bg-[#e8f6ee] text-[#027A48]',
  pending: 'bg-[#f3f6f8] text-[#5b6b75]',
};

export function LatestResultsTable({
  title,
  subtitle,
  rows,
  emptyLabel,
}: {
  title: string;
  subtitle?: string;
  rows: LatestLabResultRow[];
  emptyLabel?: string;
}) {
  if (!rows.length && !emptyLabel) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#d7e2e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#edf1f3] px-5 py-3.5 sm:px-6">
        <h3 className="text-[15px] font-semibold text-[#163447]">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-[#5b6b75]">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-[#edf1f3] text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">
              <th className="px-5 py-2.5 font-semibold sm:px-6">
                {title.toLowerCase().includes('vital') ? 'Vital' : 'Monitoring item'}
              </th>
              <th className="px-3 py-2.5 font-semibold">Most recent result</th>
              <th className="px-3 py-2.5 font-semibold">Date</th>
              <th className="px-3 py-2.5 font-semibold">Target / Reference</th>
              <th className="px-5 py-2.5 font-semibold sm:px-6">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr
                  key={row.canonicalTest}
                  className={cn(
                    'border-b border-[#f1f4f6] last:border-b-0',
                    row.statusTone === 'review' && 'bg-[#fff4e8]',
                    row.statusTone === 'action' && 'bg-[#fdeeee]',
                  )}
                >
                  <td className="px-5 py-3.5 align-top sm:px-6">
                    <p className="text-sm font-semibold text-[#163447]">{row.canonicalTest}</p>
                  </td>
                  <td className="px-3 py-3.5 align-top text-sm font-semibold text-[#163447]">
                    {row.resultDisplay}
                  </td>
                  <td className="px-3 py-3.5 align-top text-sm text-[#5b6b75]">{row.dateDisplay}</td>
                  <td className="px-3 py-3.5 align-top text-sm text-[#163447]">
                    {row.referenceDisplay}
                  </td>
                  <td className="px-5 py-3.5 align-top sm:px-6">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        TONE_CLASS[row.statusTone],
                      )}
                    >
                      {row.statusTone === 'ok' ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      {row.statusTone === 'review' || row.statusTone === 'action' ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : null}
                      {row.statusTone === 'pending' ? (
                        <Circle className="h-2.5 w-2.5 fill-current" />
                      ) : null}
                      {row.statusLabel}
                    </span>
                    <p className="mt-1 text-[11px] text-[#7a8b94]">{row.statusDetail}</p>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-sm text-[#5b6b75] sm:px-6">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
