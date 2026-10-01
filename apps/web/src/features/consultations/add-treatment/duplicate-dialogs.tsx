'use client';

import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TreatmentCandidateDuplicate } from './candidate';
import { isGuidedDuplicate } from './candidate';

export function DuplicateTreatmentDialog({
  duplicate,
  onPrimary,
  onCancel,
}: {
  duplicate: TreatmentCandidateDuplicate;
  onPrimary: () => void;
  onCancel: () => void;
}) {
  const guided = isGuidedDuplicate(duplicate);
  const name = duplicate.existingDisplayName?.trim() || 'This medication';
  const title = guided
    ? 'Already available in guided treatments'
    : 'Already in the treatment plan';
  const body = guided
    ? `${name} is already included in this pathway. Open the existing option to review its patient-specific safety findings or edit the regimen.`
    : 'This medication has already been added. Review or update the existing treatment instead of adding another copy.';
  const primaryLabel = guided ? 'View guided treatment' : 'Edit existing treatment';
  const warning = duplicate.existingBlockingFindingSummary?.trim();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="duplicate-treatment-title"
      aria-describedby="duplicate-treatment-body"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h2
          id="duplicate-treatment-title"
          className="text-[17px] font-semibold text-foreground"
        >
          {title}
        </h2>
        <p id="duplicate-treatment-body" className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {body}
        </p>
        {warning ? (
          <div
            className={cn(
              'mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive',
            )}
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">Patient safety warning: </span>
              {warning}
            </p>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="h-10" onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RelatedTreatmentDialog({
  duplicate,
  onContinue,
  onReview,
  onCancel,
}: {
  duplicate: TreatmentCandidateDuplicate;
  onContinue: () => void;
  onReview: () => void;
  onCancel: () => void;
}) {
  const name = duplicate.existingDisplayName?.trim() || 'a related treatment';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="related-treatment-title"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h2 id="related-treatment-title" className="text-[17px] font-semibold text-foreground">
          Related treatment already listed
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {name} is already on this consultation with a different route. Review the existing option
          before adding another form of the same ingredient.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={onReview}>
            Review existing treatment
          </Button>
          <Button type="button" className="h-10" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SafetyUnavailableDialog({
  onRetry,
  onCancel,
}: {
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="safety-unavailable-title"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h2 id="safety-unavailable-title" className="text-[17px] font-semibold text-foreground">
          Safety checks could not be completed
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          Try again before adding this treatment.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="h-10" onClick={onRetry}>
            Retry safety checks
          </Button>
        </div>
      </div>
    </div>
  );
}
