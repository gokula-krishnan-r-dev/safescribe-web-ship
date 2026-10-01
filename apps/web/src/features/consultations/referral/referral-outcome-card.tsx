'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  REFERRAL_DESTINATIONS,
  REFERRAL_DESTINATION_LABELS,
  REFERRAL_REASON_MAX,
  validateReferralOutcomeInput,
  type ReferralDestination,
  type ReferralReasonDraftOrigin,
} from '@safescript/shared';
import {
  ReferralFooterActions,
  type ReferralLetterUiStatus,
} from './referral-footer-actions';
import type {
  ManualReferralHandlingMethod,
  ReferralHandlingMethod,
} from '@safescript/shared';

export interface ReferralOutcomeFormValues {
  destination: ReferralDestination | '';
  destinationOtherText: string;
  reasonForReferral: string;
  additionalNote: string;
}

export function defaultReferralFormValues(
  preselectDestination?: ReferralDestination | null,
): ReferralOutcomeFormValues {
  return {
    destination: preselectDestination ?? '',
    destinationOtherText: '',
    reasonForReferral: '',
    additionalNote: '',
  };
}

function RadioTileGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  value: T | '';
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset className="min-w-0 [overflow-anchor:none]">
      <legend className="mb-2.5 text-[14px] font-semibold text-foreground">{legend}</legend>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? errorId : undefined}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                'relative inline-flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2 text-[13.5px] font-medium transition-colors',
                'focus-within:ring-2 focus-within:ring-primary/30',
                selected
                  ? 'border-primary bg-[#F0FAF9] text-foreground shadow-[0_0_0_1px_rgba(15,118,110,0.12)]'
                  : 'border-[#D5DEE1] text-foreground/85 hover:border-primary/35 hover:bg-accent/40',
              )}
              onMouseDown={(event) => {
                if (event.button === 0) event.preventDefault();
              }}
            >
              <input
                type="radio"
                name={name}
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
                checked={selected}
                onChange={() => onChange(opt.value)}
              />
              <span
                className={cn(
                  'pointer-events-none flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  selected ? 'border-primary' : 'border-muted-foreground/35',
                )}
                aria-hidden
              >
                {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
              </span>
              <span className="pointer-events-none">{opt.label}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-[12.5px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

interface ReferralOutcomeCardProps {
  values: ReferralOutcomeFormValues;
  onChange: (next: ReferralOutcomeFormValues) => void;
  onDocumentComplete: () => void;
  onCreateLetter: () => void;
  saving?: boolean;
  creatingLetter?: boolean;
  approvingLetter?: boolean;
  submitError?: string | null;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  letterStatus?: ReferralLetterUiStatus;
  canComplete?: boolean;
  formValidHint?: boolean;
  /** Last auto-applied draft. Used with reasonOrigin for the provenance badge. */
  autoDraftReason?: string;
  reasonOrigin?: ReferralReasonDraftOrigin | 'AI_EDITED' | 'NONE';
  reasonDrafting?: boolean;
  reasonDraftFailed?: boolean;
  assessmentChanged?: boolean;
  onRetryDraft?: () => void;
  onKeepVersion?: () => void;
  onUpdateDraft?: () => void;
  destinationLabel?: string;
  handlingMethod?: ReferralHandlingMethod | null;
  handlingDetail?: string;
  handlingFaxLocked?: boolean;
  changingHandling?: boolean;
  onChangeHandlingMethod?: (method: ManualReferralHandlingMethod) => void;
  onChangeHandlingDetail?: (detail: string) => void;
  onCommitHandlingDetail?: (detail: string) => void;
  onStartChangeHandling?: () => void;
}

export function ReferralOutcomeCard({
  values,
  onChange,
  onDocumentComplete,
  onCreateLetter,
  saving,
  creatingLetter,
  approvingLetter,
  submitError,
  headingRef,
  letterStatus = 'not_created',
  canComplete = false,
  formValidHint,
  autoDraftReason = '',
  reasonOrigin = 'NONE',
  reasonDrafting = false,
  reasonDraftFailed = false,
  assessmentChanged = false,
  onRetryDraft,
  onKeepVersion,
  onUpdateDraft,
  destinationLabel,
  handlingMethod,
  handlingDetail,
  handlingFaxLocked,
  changingHandling,
  onChangeHandlingMethod,
  onChangeHandlingDetail,
  onCommitHandlingDetail,
  onStartChangeHandling,
}: ReferralOutcomeCardProps) {
  const headingId = useId();
  const reasonId = useId();
  const notesId = useId();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    const el = reasonRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 96), 360)}px`;
  }, [values.reasonForReferral]);

  const patch = (partial: Partial<ReferralOutcomeFormValues>) => {
    onChange({ ...values, ...partial });
    setFieldErrors({});
  };

  const validationInput = {
    destination: values.destination || null,
    destinationOtherText: values.destinationOtherText,
    reasonForReferral: values.reasonForReferral,
    additionalNote: values.additionalNote,
  };

  const runClientValidation = (): boolean => {
    const errors = validateReferralOutcomeInput(validationInput);
    const map: Record<string, string> = {};
    for (const e of errors) map[e.field] = e.message;
    setFieldErrors(map);
    if (errors.length) {
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return false;
    }
    return true;
  };

  const formValid = formValidHint ?? validateReferralOutcomeInput(validationInput).length === 0;
  const reasonText = values.reasonForReferral;
  const matchesApplied =
    Boolean(autoDraftReason.trim()) && reasonText.trim() === autoDraftReason.trim();
  const origin = reasonOrigin === 'NONE' && matchesApplied ? 'RULE_TEMPLATE' : reasonOrigin;
  const badgeLabel =
    origin === 'AI_DRAFT' && matchesApplied
      ? 'Assisted draft'
      : origin === 'AI_EDITED' || (origin === 'AI_DRAFT' && reasonText.trim() && !matchesApplied)
        ? 'Assisted · edited'
        : origin === 'RULE_TEMPLATE' && matchesApplied
          ? 'Suggested draft'
          : null;
  const reasonLength = reasonText.length;
  const showCounter = reasonLength >= 1800;
  const reasonHint = fieldErrors.reasonForReferral
    ? null
    : assessmentChanged
      ? 'Consultation details changed · Review draft'
      : origin === 'AI_DRAFT' && matchesApplied
        ? 'Drafted from the consultation and selected referral findings. Review and edit before creating the letter.'
        : origin === 'AI_EDITED' || (origin === 'AI_DRAFT' && !matchesApplied)
          ? 'Drafted from the consultation and selected referral findings. Review and edit before creating the letter.'
          : origin === 'RULE_TEMPLATE' && matchesApplied
            ? 'Suggested from your selected referral findings. Review and edit as needed.'
            : reasonDraftFailed && !reasonText.trim()
              ? 'A draft could not be prepared. You can enter or edit the reason manually.'
              : !reasonText.trim() && reasonDrafting
                ? null
                : !reasonText.trim()
                  ? 'Enter the reason for referral.'
                  : 'Review and edit as needed.';

  const handleComplete = () => {
    if (!runClientValidation()) return;
    onDocumentComplete();
  };

  const handleLetter = () => {
    if (!runClientValidation()) return;
    onCreateLetter();
  };

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[14px] border border-[#D5DEE1] bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04),0_9px_22px_rgba(15,23,42,0.06)] [overflow-anchor:none]"
    >
      <div className="border-b border-consult-divider px-5 py-5 sm:px-7">
        <h2
          id={headingId}
          ref={headingRef as React.RefObject<HTMLHeadingElement>}
          tabIndex={-1}
          className="m-0 scroll-mt-4 text-[22px] font-bold leading-snug tracking-tight text-foreground outline-none"
        >
          Referral
        </h2>
        <p className="mt-1.5 text-[14.5px] leading-snug text-muted-foreground">
          Review the details, then create and approve the referral letter.
        </p>
      </div>

      {Object.keys(fieldErrors).length > 0 || submitError ? (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          className="mx-5 mt-4 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-4 py-3 outline-none sm:mx-7"
        >
          <p className="text-sm font-semibold text-destructive">
            {submitError || 'Please fix the highlighted fields before continuing.'}
          </p>
        </div>
      ) : null}

      <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <RadioTileGroup
            legend="Patient directed to"
            name="referral-destination"
            value={values.destination}
            options={REFERRAL_DESTINATIONS.map((d) => ({
              value: d,
              label: REFERRAL_DESTINATION_LABELS[d],
            }))}
            onChange={(destination) => patch({ destination })}
            error={fieldErrors.destination}
          />
          {values.destination === 'other' ? (
            <Input
              value={values.destinationOtherText}
              onChange={(e) => patch({ destinationOtherText: e.target.value })}
              placeholder="Specify destination"
              className="mt-2.5 h-10 max-w-md rounded-lg border-[#D5DEE1] shadow-none"
              aria-invalid={Boolean(fieldErrors.destinationOtherText) || undefined}
            />
          ) : null}
          {fieldErrors.destinationOtherText ? (
            <p className="mt-1.5 text-[12.5px] text-destructive" role="alert">
              {fieldErrors.destinationOtherText}
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label htmlFor={reasonId} className="text-[14px] font-semibold text-foreground">
              Reason for referral
            </label>
            {badgeLabel ? (
              <span className="inline-flex items-center rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary">
                {badgeLabel}
              </span>
            ) : null}
            {reasonDrafting ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                Drafting a patient-specific referral summary…
              </span>
            ) : null}
          </div>
          <Textarea
            id={reasonId}
            ref={reasonRef}
            value={values.reasonForReferral}
            onChange={(e) =>
              patch({ reasonForReferral: e.target.value.slice(0, REFERRAL_REASON_MAX) })
            }
            rows={4}
            maxLength={REFERRAL_REASON_MAX}
            className="min-h-[96px] resize-y overflow-hidden rounded-lg border-[#D5DEE1] text-sm leading-relaxed shadow-none"
            aria-invalid={Boolean(fieldErrors.reasonForReferral) || undefined}
            aria-describedby={`${reasonId}-hint`}
            aria-busy={reasonDrafting || undefined}
          />
          {fieldErrors.reasonForReferral ? (
            <p className="mt-1.5 text-[12.5px] font-medium text-destructive" role="alert">
              {fieldErrors.reasonForReferral}
            </p>
          ) : (
            <p
              id={`${reasonId}-hint`}
              className={cn(
                'mt-1.5 text-[12.5px]',
                assessmentChanged ? 'font-medium text-amber-800' : 'text-muted-foreground',
              )}
            >
              {reasonHint}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            {assessmentChanged && (onUpdateDraft || onKeepVersion) ? (
              <div className="flex flex-wrap items-center gap-3">
                {onUpdateDraft ? (
                  <button
                    type="button"
                    onClick={onUpdateDraft}
                    className="border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary hover:underline"
                  >
                    Update draft from consultation
                  </button>
                ) : null}
                {onKeepVersion ? (
                  <button
                    type="button"
                    onClick={onKeepVersion}
                    className="border-0 bg-transparent p-0 text-[12.5px] font-semibold text-foreground/80 hover:underline"
                  >
                    Keep my version
                  </button>
                ) : null}
              </div>
            ) : reasonDraftFailed && onRetryDraft ? (
              <button
                type="button"
                onClick={onRetryDraft}
                className="border-0 bg-transparent p-0 text-[12.5px] font-semibold text-primary hover:underline"
              >
                Retry draft
              </button>
            ) : (
              <span />
            )}
            {showCounter ? (
              <p className="text-[11px] text-muted-foreground">
                {reasonLength.toLocaleString()} / {REFERRAL_REASON_MAX.toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor={notesId} className="mb-2 block text-[14px] font-semibold text-foreground">
            Optional notes
          </label>
          <Textarea
            id={notesId}
            value={values.additionalNote}
            onChange={(e) => patch({ additionalNote: e.target.value.slice(0, 1000) })}
            rows={3}
            maxLength={1000}
            placeholder="Add any relevant context, if needed."
            className="min-h-[88px] resize-y rounded-lg border-[#D5DEE1] text-sm leading-relaxed shadow-none"
          />
        </div>
      </div>

      <div className="border-t border-consult-divider px-5 py-4 sm:px-7">
        <ReferralFooterActions
          letterStatus={letterStatus}
          formValid={formValid}
          canComplete={canComplete}
          saving={saving}
          creatingLetter={creatingLetter}
          approvingLetter={approvingLetter}
          onDocumentComplete={handleComplete}
          onLetterAction={handleLetter}
          destinationLabel={destinationLabel}
          handlingMethod={handlingMethod}
          handlingDetail={handlingDetail}
          handlingFaxLocked={handlingFaxLocked}
          changingHandling={changingHandling}
          onChangeHandlingMethod={onChangeHandlingMethod}
          onChangeHandlingDetail={onChangeHandlingDetail}
          onCommitHandlingDetail={onCommitHandlingDetail}
          onStartChangeHandling={onStartChangeHandling}
        />
      </div>
    </section>
  );
}

export type { ReferralOutcomeFormValues as ReferralFormState };
