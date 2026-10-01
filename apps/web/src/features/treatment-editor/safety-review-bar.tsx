'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SafetyReviewItem } from '@safescript/shared';

interface SafetyReviewSectionProps {
  completed: boolean;
  rechecking?: boolean;
  unavailable?: boolean;
  alertCount?: number;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  renal?: ReactNode;
  otherAlerts?: SafetyReviewItem[];
  onRequestOverride?: () => void;
  checksContent?: ReactNode;
}

export function SafetyReviewSection({
  completed,
  rechecking,
  unavailable,
  alertCount = 0,
  detailsOpen = false,
  onToggleDetails,
  renal,
  otherAlerts = [],
  onRequestOverride,
  checksContent,
}: SafetyReviewSectionProps) {
  const [checksOpen, setChecksOpen] = useState(false);
  const hasAlerts = alertCount > 0;
  const otherCount = otherAlerts.length;
  const allOthersPassed = hasAlerts && otherCount === 0 && Boolean(renal);

  if (rechecking) {
    return (
      <div className="flex items-center gap-2.5 rounded-[12px] border border-[#d5dee1] bg-[#f8fbfb] px-4 py-3">
        <Loader2 className="h-[18px] w-[18px] animate-spin text-[#0F817C]" aria-hidden />
        <div>
          <p className="text-[13.5px] font-semibold text-[#1e3a5f]">Safety rechecking…</p>
          <p className="text-[12.5px] text-[#667085]">Revalidating after prescription changes.</p>
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-[18px] w-[18px] text-amber-700" aria-hidden />
          <div>
            <p className="text-[13.5px] font-semibold text-[#1e3a5f]">Safety review unavailable</p>
            <p className="text-[12.5px] text-[#667085]">Try again before saving.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAlerts) {
    const hasSafetyDetails = Boolean(renal) || otherAlerts.length > 0;
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#c8ead8] bg-[#eef8f1] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-[18px] w-[18px] text-[#1b7a4e]" aria-hidden />
            <div>
              <p className="text-[13.5px] font-semibold text-[#1e3a5f]">Safety review completed</p>
              <p className="text-[12.5px] text-[#667085]">No matched alerts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onToggleDetails && hasSafetyDetails ? (
              <button
                type="button"
                onClick={onToggleDetails}
                aria-expanded={detailsOpen}
                className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#3d6b9a] hover:underline"
              >
                View
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {checksContent ? (
              <button
                type="button"
                onClick={() => setChecksOpen((v) => !v)}
                aria-expanded={checksOpen}
                className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#3d6b9a] hover:underline"
              >
                View all checks
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {detailsOpen && hasSafetyDetails ? (
          <div className="space-y-3 border-t border-[#c8ead8]/80 px-4 py-4 sm:px-5">
            {renal}
            {otherAlerts.map((item) => (
              <div
                key={item.findingId}
                className="rounded-[12px] border border-[#c8ead8] bg-white px-4 py-3"
              >
                <p className="text-[12.5px] font-bold uppercase tracking-wide text-[#8a5a12]">
                  {item.title}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#344054]">{item.summary}</p>
                {item.requiresRationale && onRequestOverride ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2.5 h-8 bg-[#3d6b9a] text-[12.5px] font-semibold hover:bg-[#345c86]"
                    onClick={onRequestOverride}
                  >
                    Document decision
                  </Button>
                ) : null}
              </div>
            ))}

            {checksOpen && checksContent ? (
              <div className="rounded-[10px] border border-[#e6ecee] bg-white px-3.5 py-3 text-[13px] text-[#52606d]">
                {checksContent}
              </div>
            ) : null}
          </div>
        ) : null}
        {!detailsOpen && checksOpen && checksContent ? (
          <div className="mt-2 rounded-[10px] border border-[#e6ecee] bg-white px-3.5 py-3 text-[13px] text-[#52606d]">
            {checksContent}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#ead9b0] bg-[#fff8ee]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-[#c2410c]" aria-hidden />
          <p className="text-[14.5px] font-bold text-[#1e3a5f]">Safety review</p>
          <span className="inline-flex h-6 items-center rounded-full border border-[#ead9b0] bg-white px-2 text-[12px] font-semibold text-[#8a5a12]">
            {alertCount} item{alertCount === 1 ? '' : 's'} to review
          </span>
        </div>
        {onToggleDetails ? (
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={onToggleDetails}
            className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#3d6b9a] hover:underline"
          >
            {detailsOpen ? 'Hide details' : 'Details'}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {detailsOpen ? (
        <div className="space-y-3 border-t border-[#ead9b0]/80 px-4 py-4 sm:px-5">
          {renal}
          {otherAlerts.map((item) => (
            <div
              key={item.findingId}
              className="rounded-[12px] border border-[#ead9b0] bg-white px-4 py-3"
            >
              <p className="text-[12.5px] font-bold uppercase tracking-wide text-[#8a5a12]">
                {item.title}
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#344054]">{item.summary}</p>
              {item.requiresRationale && onRequestOverride ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2.5 h-8 bg-[#3d6b9a] text-[12.5px] font-semibold hover:bg-[#345c86]"
                  onClick={onRequestOverride}
                >
                  Document decision
                </Button>
              ) : null}
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-white/80 px-3 py-2.5">
            <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1b7a4e]">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {allOthersPassed ? 'All other safety checks passed' : 'Matched alerts shown above'}
            </p>
            <div className="flex items-center gap-3">
              {allOthersPassed ? (
                <span className="text-[12.5px] text-[#667085]">No other matched alerts</span>
              ) : null}
              {checksContent ? (
                <button
                  type="button"
                  onClick={() => setChecksOpen((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-[#3d6b9a] hover:underline"
                >
                  View all checks
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
          {checksOpen && checksContent ? (
            <div className="rounded-[10px] border border-[#e6ecee] bg-white px-3.5 py-3 text-[13px] text-[#52606d]">
              {checksContent}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SafetyReviewBar({
  completed,
  rechecking,
  unavailable,
  alertCount = 0,
  onView,
}: {
  completed: boolean;
  rechecking?: boolean;
  unavailable?: boolean;
  alertCount?: number;
  onView?: () => void;
  embedded?: boolean;
}) {
  return (
    <SafetyReviewSection
      completed={completed}
      rechecking={rechecking}
      unavailable={unavailable}
      alertCount={alertCount}
      detailsOpen={false}
      onToggleDetails={onView}
    />
  );
}

export function TreatmentEditorFooter({
  allComplete,
  dirty,
  valid,
  saving,
  saveLabel = 'Save treatment',
  continueHint,
  onCancel,
  onSave,
  saveError,
}: {
  allComplete: boolean;
  dirty: boolean;
  valid: boolean;
  saving?: boolean;
  saveLabel?: string;
  continueHint?: string;
  onCancel: () => void;
  onSave: () => void;
  saveError?: string | null;
}) {
  const canSave = valid && !saving;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {allComplete ? (
          <div>
            <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1b7a4e]">
              <Check className="h-4 w-4" aria-hidden />
              All required fields completed
            </p>
            {continueHint ? (
              <p className="mt-0.5 text-[12.5px] font-normal text-[#667085]">{continueHint}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] font-medium text-amber-800">
            Complete required fields before saving
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <p className="mr-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
              Unsaved
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 rounded-[10px] border-[#0F817C]/35 px-4 text-[13.5px] font-semibold text-[#0F817C] hover:bg-[#F4FBFA]"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-10 rounded-[10px] bg-[#0F817C] px-4 text-[13.5px] font-semibold text-white hover:bg-[#0c6b67]"
            disabled={!canSave}
            onClick={onSave}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              saveLabel
            )}
          </Button>
        </div>
      </div>
      {saveError ? (
        <p className="text-[12.5px] text-destructive">
          {saveError}{' '}
          <button type="button" className="font-semibold underline" onClick={onSave}>
            Try again
          </button>
        </p>
      ) : null}
    </div>
  );
}
