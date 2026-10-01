'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { RenewSafetySummary } from '@safescript/shared';

export function SafetyReviewCard({
  summary,
  monitoringReviewCount,
  embedded,
}: {
  summary: RenewSafetySummary;
  monitoringReviewCount: number;
  embedded?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const extraFindings = summary.findings.filter((finding) => !finding.inputCode);
  const extraClear = extraFindings.length === 0 && summary.status !== 'unavailable';

  return (
    <section
      className={cn(
        embedded
          ? 'overflow-hidden bg-white'
          : 'overflow-hidden rounded-2xl border border-[#d7e2e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
      )}
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        {embedded ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDetailsOpen(true)}
              className="h-10 w-full shrink-0 border-[#0F6F6B] bg-white px-3 text-sm font-medium text-[#0F6F6B] hover:bg-[#0F6F6B]/5 sm:w-auto"
            >
              View full safety details
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f6ee] text-[#027A48]">
              <Shield className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-[#163447]">Safety review</h2>
              <p className="mt-1 max-w-[46rem] text-sm leading-relaxed text-[#5b6b75]">
                SafeScribe Safety Engine has reviewed the information above along with allergies,
                interactions, conditions and other safety rules.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDetailsOpen(true)}
            className="h-10 w-full shrink-0 border-[#0F6F6B] bg-white px-3 text-sm font-medium text-[#0F6F6B] hover:bg-[#0F6F6B]/5 sm:w-auto sm:self-start"
          >
            View full safety details
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatusCallout
            ok={!monitoringReviewCount}
            title={
              monitoringReviewCount
                ? `${monitoringReviewCount} item${monitoringReviewCount === 1 ? '' : 's'} need review`
                : 'No monitoring items need review'
            }
            detail={
              monitoringReviewCount
                ? 'Please review and document your action.'
                : 'Monitoring findings are complete.'
            }
          />
          <StatusCallout
            ok={extraClear}
            title={
              extraClear
                ? 'No additional medication safety issues identified'
                : summary.headline
            }
            detail={extraClear ? 'Proceed with pharmacist judgment.' : summary.detail}
          />
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Safety details</DialogTitle>
            <DialogDescription>
              Monitoring findings are shown in the table above. Additional medication safety findings from the
              shared Safety Engine appear here.
            </DialogDescription>
          </DialogHeader>
          {summary.findings.length ? (
            <ul className="space-y-3">
              {summary.findings.map((finding) => (
                <li key={finding.key} className="rounded-xl border border-[#edf1f3] px-3 py-2.5">
                  <p className="text-sm font-semibold text-[#163447]">{finding.summary}</p>
                  {finding.detail ? <p className="mt-1 text-xs text-[#5b6b75]">{finding.detail}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5b6b75]">No additional medication safety issues identified.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatusCallout({
  ok,
  title,
  detail,
}: {
  ok: boolean;
  title: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-xl px-4 py-3.5',
        ok ? 'bg-[#edf8f1]' : 'bg-[#fff4e8]',
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1f8a4c]" />
      ) : (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold leading-snug', ok ? 'text-[#166534]' : 'text-amber-900')}>
          {title}
        </p>
        {detail ? (
          <p className={cn('mt-0.5 text-xs leading-relaxed', ok ? 'text-[#3d7a55]' : 'text-amber-800/90')}>
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
