'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { TreatmentClinicalOverride, TreatmentRecommendation } from './types';
import type { SafetyTier } from './treatment-options-model';
import { resolvePatientSpecificReason, resolveSafetyTier } from './treatment-options-model';

/** Preset rationales when unlocking an Avoid / allergy-blocked option. */
export const TREATMENT_AVOID_OVERRIDE_REASONS = [
  'Clinical benefit outweighs documented allergy risk for this presentation',
  'Allergy history is uncertain or not confirmed for this specific agent',
  'Patient has previously tolerated this medicine',
  'No suitable alternative available on this pathway',
  'Other',
] as const;

/** Preset rationales when proceeding despite caution / review-required flags. */
export const TREATMENT_CAUTION_OVERRIDE_REASONS = [
  'Clinical benefit outweighs the documented caution for this presentation',
  'Risk reviewed; regimen is appropriate with monitoring for this patient',
  'Patient-specific factors make this the preferred option',
  'No suitable alternative available on this pathway',
  'Other',
] as const;

/** @deprecated Use TREATMENT_AVOID_OVERRIDE_REASONS */
export const TREATMENT_OVERRIDE_REASONS = TREATMENT_AVOID_OVERRIDE_REASONS;

export type TreatmentOverrideVariant = 'avoid' | 'caution';

export type TreatmentOverrideFormResult = Omit<
  TreatmentClinicalOverride,
  'overriddenAt' | 'acknowledgedRisk' | 'source' | 'allergySummary'
> & {
  reason: string;
  comments: string;
  acknowledgedRisk: true;
};

export function resolveOverrideVariant(
  treatment: TreatmentRecommendation | null | undefined,
  safetyTier?: SafetyTier,
): TreatmentOverrideVariant {
  if (!treatment) return 'avoid';
  const tier = safetyTier ?? resolveSafetyTier(treatment);
  if (tier === 'AVOID' || treatment.allergyBlocked) return 'avoid';
  return 'caution';
}

export function resolveOverrideSource(
  treatment: TreatmentRecommendation,
  safetyTier?: SafetyTier,
): TreatmentClinicalOverride['source'] {
  if (treatment.allergyBlocked) return 'ALLERGY';
  const tier = safetyTier ?? resolveSafetyTier(treatment);
  if (tier === 'AVOID') return 'AVOID';
  if (tier === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  return 'CAUTION';
}

function warningSummary(
  treatment: TreatmentRecommendation | null,
  variant: TreatmentOverrideVariant,
): string {
  if (!treatment) {
    return variant === 'avoid'
      ? 'This option is marked Avoid for this patient.'
      : 'This option requires clinical review before use.';
  }

  const tier = resolveSafetyTier(treatment);
  const specific = resolvePatientSpecificReason(treatment, tier)?.trim();
  if (specific) return specific;

  if (variant === 'avoid') {
    return (
      treatment.allergyWarning?.reason?.trim() ||
      (treatment.allergyWarning?.patientAllergy
        ? `Patient has a recorded allergy to ${treatment.allergyWarning.patientAllergy}.`
        : null) ||
      'This option is marked Avoid for this patient.'
    );
  }

  if (treatment.renalWarning?.active && treatment.renalWarning.message?.trim()) {
    return treatment.renalWarning.message.trim();
  }
  if (treatment.hepaticWarning?.active && treatment.hepaticWarning.message?.trim()) {
    return treatment.hepaticWarning.message.trim();
  }
  if (treatment.pregnancyWarning?.active && treatment.pregnancyWarning.message?.trim()) {
    return treatment.pregnancyWarning.message.trim();
  }
  return 'This option requires clinical review before use for this patient.';
}

interface Props {
  open: boolean;
  treatment: TreatmentRecommendation | null;
  displayName: string;
  /** Prefer explicit tier from the option view when available */
  safetyTier?: SafetyTier;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (result: TreatmentOverrideFormResult) => void;
}

export function TreatmentAvoidOverrideDialog({
  open,
  treatment,
  displayName,
  safetyTier,
  submitting = false,
  onClose,
  onConfirm,
}: Props) {
  const variant = resolveOverrideVariant(treatment, safetyTier);
  const reasons =
    variant === 'avoid'
      ? TREATMENT_AVOID_OVERRIDE_REASONS
      : TREATMENT_CAUTION_OVERRIDE_REASONS;

  const [reason, setReason] = useState<string>(reasons[0]);
  const [otherText, setOtherText] = useState('');
  const [comments, setComments] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(reasons[0]);
    setOtherText('');
    setComments('');
    setAcknowledged(false);
  }, [open, treatment?.medicationName, variant]); // eslint-disable-line react-hooks/exhaustive-deps

  const allergyLine = useMemo(
    () => warningSummary(treatment, variant),
    [treatment, variant],
  );

  const effectiveReason =
    reason === 'Other' ? otherText.trim() : reason.trim();
  const canSave =
    effectiveReason.length >= 8 && acknowledged && !submitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onConfirm({
      reason: effectiveReason,
      comments: comments.trim(),
      acknowledgedRisk: true,
    });
  };

  const isAvoid = variant === 'avoid';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader
            className={cn(
              'space-y-2 border-b px-5 py-4 text-left',
              isAvoid
                ? 'border-destructive/20 bg-destructive/[0.04]'
                : 'border-amber-300/50 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30',
            )}
          >
            <DialogTitle className="flex items-center gap-2 text-base">
              <Scale
                className={cn(
                  'h-4 w-4',
                  isAvoid ? 'text-destructive' : 'text-amber-700 dark:text-amber-400',
                )}
              />
              Clinical override
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed text-foreground/80">
              {isAvoid ? (
                <>
                  Unlock <span className="font-semibold text-foreground">{displayName}</span>{' '}
                  for this consultation only. The Avoid warning remains documented.
                </>
              ) : (
                <>
                  Document clinical judgment to proceed with{' '}
                  <span className="font-semibold text-foreground">{displayName}</span>{' '}
                  despite the caution. The warning remains on the record.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
                isAvoid
                  ? 'border-destructive/25 bg-destructive/[0.04]'
                  : 'border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-50',
              )}
              role="alert"
            >
              <AlertTriangle
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  isAvoid
                    ? 'text-destructive'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              />
              <p
                className={cn(
                  'text-[13px] leading-relaxed',
                  isAvoid ? 'text-destructive' : undefined,
                )}
              >
                {allergyLine}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reason for proceeding
              </legend>
              {reasons.map((r) => {
                const selected = reason === r;
                return (
                  <div key={r}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 transition-colors',
                        selected && 'bg-muted/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                          selected ? 'border-primary' : 'border-muted-foreground/35',
                        )}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </span>
                      <input
                        type="radio"
                        name="tx-override-reason"
                        className="sr-only"
                        checked={selected}
                        onChange={() => setReason(r)}
                      />
                      <span className="text-[13px] leading-snug text-foreground/90">
                        {r}
                      </span>
                    </label>
                    {r === 'Other' && selected ? (
                      <Input
                        value={otherText}
                        onChange={(e) => setOtherText(e.target.value)}
                        placeholder="Describe your clinical rationale…"
                        className="ml-6 mt-1.5 h-10"
                        disabled={submitting}
                      />
                    ) : null}
                  </div>
                );
              })}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="tx-override-comments" className="text-[13px]">
                Supporting notes{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="tx-override-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={2}
                disabled={submitting}
                placeholder={
                  isAvoid
                    ? 'e.g. Discussed risk with patient; monitoring plan…'
                    : 'e.g. CrCl reviewed; dose adjusted; monitoring planned…'
                }
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-border accent-[#0f817c]"
              />
              <span className="text-[13px] leading-snug text-foreground/90">
                I acknowledge the safety warning and accept clinical responsibility for
                using this treatment in this consultation.
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2 border-t border-border bg-muted/15 px-5 py-3.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave} className="min-w-[140px]">
              Override & select
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Alias for callers that prefer a variant-agnostic name. */
export const TreatmentClinicalOverrideDialog = TreatmentAvoidOverrideDialog;
