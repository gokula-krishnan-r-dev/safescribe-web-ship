'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, Info, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SafetyReviewItem } from '@safescript/shared';
import type { TreatmentOptionView } from './treatment-options-model';
import {
  countSafetyReviewItems,
  drugReferenceFromTreatment,
  hasDrugReference,
  safetyReviewItemsForOption,
} from './safety-review-model';

export { countSafetyReviewItems };

function FindingIcon({ item }: { item: SafetyReviewItem }) {
  if (item.presentationKind === 'SIGNIFICANT_RISK') {
    return <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />;
  }
  if (item.presentationKind === 'REQUIRED_INFORMATION') {
    return <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />;
  }
  return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />;
}

export function InlineSafetyReview({
  option,
  dirty,
  checking,
  unavailable,
  patientPregnant = false,
  patientHasAllergies = true,
  onRetry,
  onRequestOverride,
  onViewFullDetails,
}: {
  option: TreatmentOptionView;
  dirty: boolean;
  checking?: boolean;
  unavailable?: boolean;
  patientPregnant?: boolean;
  patientHasAllergies?: boolean;
  onRetry?: () => void;
  onRequestOverride?: () => void;
  onViewFullDetails: () => void;
}) {
  const findings = safetyReviewItemsForOption(option, patientPregnant, patientHasAllergies);
  const reviewCount = countSafetyReviewItems(option, patientPregnant, patientHasAllergies);
  const reference = drugReferenceFromTreatment(option.treatment);
  const [openId, setOpenId] = useState<string | null>(findings[0]?.findingId ?? null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const reviewNeeded =
    option.safetyTier === 'REVIEW_REQUIRED' ||
    option.safetyTier === 'AVOID' ||
    findings.some((f) => f.presentationKind === 'SIGNIFICANT_RISK');

  return (
    <section className="space-y-2.5" aria-labelledby={`${option.index}-safety-heading`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4
          id={`${option.index}-safety-heading`}
          className="text-[13px] font-semibold text-[#1e3a5f]"
        >
          Safety review
        </h4>
        {checking ? (
          <span className="text-[12px] font-medium text-muted-foreground">Checking</span>
        ) : unavailable ? (
          <span className="text-[12px] font-medium text-muted-foreground">Check unavailable</span>
        ) : reviewCount > 0 && !option.clinicallyOverridden ? (
          <span className="inline-flex h-6 items-center rounded-md border border-amber-300 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800">
            {reviewCount} to review
          </span>
        ) : option.clinicallyOverridden ? (
          <span className="inline-flex h-6 items-center rounded-md border border-amber-300 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800">
            Decision recorded
          </span>
        ) : (
          <span className="text-[12px] font-medium text-muted-foreground">No matched alerts</span>
        )}
      </div>

      {dirty ? (
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          Safety review will refresh when changes are saved.
        </p>
      ) : null}

      {checking ? (
        <p className="text-[13px] text-muted-foreground">Checking treatment safety…</p>
      ) : unavailable ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[13px] leading-snug text-foreground">
            Automated safety check unavailable. Try again before confirming the treatment
            plan.
          </p>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-8 text-[12.5px]"
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : findings.length === 0 ? (
        <p className="text-[13px] leading-snug text-muted-foreground">
          No patient-specific alerts identified. Checks completed using the reviewed information.
          This is not a guarantee of treatment safety.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {findings.map((finding) => {
            const expanded = (openId ?? findings[0]?.findingId) === finding.findingId;
            const significant = finding.presentationKind === 'SIGNIFICANT_RISK';
            return (
              <li key={finding.findingId}>
                {expanded ? (
                  <div
                    className={cn(
                      'rounded-lg border px-3 py-2.5',
                      finding.presentationKind === 'REQUIRED_INFORMATION'
                        ? 'border-sky-200 bg-sky-50'
                        : significant
                          ? 'border-red-200 bg-red-50'
                          : 'border-amber-200 bg-amber-50',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <FindingIcon item={finding} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#1e3a5f]">
                          {finding.title}
                        </p>
                        <p className="text-[13px] leading-relaxed text-[#25303b]">{finding.summary}</p>
                        {finding.requiresRationale &&
                        onRequestOverride &&
                        !option.clinicallyOverridden &&
                        reviewNeeded ? (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-1 h-8 bg-primary text-[12.5px] font-semibold"
                            onClick={onRequestOverride}
                          >
                            Document decision
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex min-h-[44px] w-full items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/30"
                    aria-expanded={false}
                    onClick={() => setOpenId(finding.findingId)}
                  >
                    <FindingIcon item={finding} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-[#1e3a5f]">
                        {finding.title}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">
                        {finding.summary}
                      </span>
                    </span>
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasDrugReference(reference) ? (
        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left"
            aria-expanded={referenceOpen}
            onClick={() => setReferenceOpen((v) => !v)}
          >
            <span className="text-[13px] font-semibold text-[#1e3a5f]">
              Drug reference · optional
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                referenceOpen && 'rotate-180',
              )}
            />
          </button>
          {referenceOpen ? (
            <div className="space-y-2 border-t border-border px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
              {reference.pregnancy ? <p>{reference.pregnancy}</p> : null}
              {reference.renal ? <p>{reference.renal}</p> : null}
              {reference.hepatic ? <p>{reference.hepatic}</p> : null}
              {reference.interactions.map((row) => (
                <p key={row}>{row}</p>
              ))}
              {reference.monitoring ? <p>{reference.monitoring}</p> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onViewFullDetails}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
        >
          View full treatment information
          <span aria-hidden>→</span>
        </button>
      )}
    </section>
  );
}
