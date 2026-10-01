'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Info,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/notify';
import { toastError, getErrorCode } from '@/lib/errors';
import {
  READINESS_INSUFFICIENCY_REASONS,
  READINESS_INSUFFICIENCY_REASON_LABELS,
  READINESS_NEXT_ACTIONS,
  READINESS_RETURN_TARGETS,
  READINESS_RETURN_TARGET_LABELS,
  suggestedReturnTarget,
  type ReadinessInsufficiencyReason,
  type ReadinessNextAction,
  type ReadinessReturnTarget,
} from '@safescript/shared';
import type { Consultation } from '../types';
import {
  usePrescribingReadiness,
  useSavePrescribingReadiness,
} from '../hooks';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '../clinical-ui';

interface Props {
  consultation: Consultation;
  onNext: (options?: { targetStep?: string }) => void;
  onBack: () => void;
  backLabel?: string;
  onGoToStep?: (stepId: string) => void;
}

const REASON_ORDER = Object.keys(
  READINESS_INSUFFICIENCY_REASONS,
) as ReadinessInsufficiencyReason[];

function formatConfirmedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Prescribing Readiness — pharmacist-owned gate after red-flag review.
 * No AI recommendation; no preselection; treatment blocked until Yes is confirmed.
 */
export function StepPrescribingReadiness({
  consultation,
  onNext,
  onBack,
  backLabel = 'Back',
  onGoToStep,
}: Props) {
  const legendId = useId();
  const reasonListRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLTextAreaElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const { data: page, isLoading, isError, refetch } = usePrescribingReadiness(
    consultation.id,
  );
  const saveReadiness = useSavePrescribingReadiness(consultation.id);

  // Local selection — never initialize Yes from completed upstream fields
  const [sufficient, setSufficient] = useState<boolean | null>(null);
  const [reasonCodes, setReasonCodes] = useState<ReadinessInsufficiencyReason[]>(
    [],
  );
  const [reasonDetail, setReasonDetail] = useState('');
  const [nextAction, setNextAction] = useState<ReadinessNextAction | null>(null);
  const [returnTarget, setReturnTarget] = useState<ReadinessReturnTarget | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server only when a prior decision exists and local is empty
  useEffect(() => {
    if (!page?.readiness || hydrated) return;
    const r = page.readiness;
    // Do not preselect from AWAITING — only restore explicit prior answers for edit
    if (
      r.status === 'CONFIRMED_READY' ||
      r.status === 'NOT_READY_MORE_INFORMATION' ||
      r.status === 'NOT_READY_REFERRAL'
    ) {
      if (r.assessmentSufficient === true) setSufficient(true);
      else if (r.assessmentSufficient === false) setSufficient(false);
      if (Array.isArray(r.reasonCodes) && r.reasonCodes.length) {
        setReasonCodes(r.reasonCodes as ReadinessInsufficiencyReason[]);
      }
      if (r.reasonDetail) setReasonDetail(r.reasonDetail);
      if (r.nextAction) setNextAction(r.nextAction as ReadinessNextAction);
      if (r.returnTarget) setReturnTarget(r.returnTarget as ReadinessReturnTarget);
    }
    setHydrated(true);
  }, [page, hydrated]);

  useEffect(() => {
    if (page?.blockingCode && bannerRef.current) {
      bannerRef.current.focus();
    }
  }, [page?.blockingCode]);

  const canConfirm = page?.permissions?.canConfirm !== false && !page?.blockingCode;
  const redFlagSummary = page?.redFlagSummary;
  const snapshotHash = page?.readiness?.sourceSnapshotHash;

  const pharmacistName = useMemo(() => {
    const fromSummary = redFlagSummary?.confirmedBy?.displayName;
    if (fromSummary) return fromSummary;
    const p = consultation.pharmacist;
    if (!p) return 'Pharmacist';
    return `${p.firstName} ${p.lastName}`.trim() || 'Pharmacist';
  }, [redFlagSummary, consultation.pharmacist]);

  const toggleReason = (code: ReadinessInsufficiencyReason) => {
    setReasonCodes((prev) => {
      const next = prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code];
      // Suggest return target from first matching reason
      if (next.length && nextAction === 'OBTAIN_OR_UPDATE_INFORMATION') {
        const suggested = suggestedReturnTarget(next[0]);
        if (suggested) setReturnTarget(suggested);
      }
      return next;
    });
  };

  const yesSelected = sufficient === true;
  const noSelected = sufficient === false;

  const otherSelected = reasonCodes.includes('OTHER');
  const noFormValid =
    noSelected &&
    reasonCodes.length > 0 &&
    (!otherSelected || reasonDetail.trim().length >= 1) &&
    nextAction != null &&
    (nextAction !== 'OBTAIN_OR_UPDATE_INFORMATION' || returnTarget != null);

  const primaryDisabled =
    !canConfirm ||
    saveReadiness.isPending ||
    sufficient == null ||
    (yesSelected ? false : !noFormValid);

  const primaryLabel = yesSelected
    ? 'Continue to Treatment'
    : nextAction === 'OBTAIN_OR_UPDATE_INFORMATION' && returnTarget
      ? `Save & Return to ${READINESS_RETURN_TARGET_LABELS[returnTarget]}`
      : nextAction === 'DOCUMENT_AND_REFER'
        ? 'Document & Refer'
        : 'Continue';

  const handleDocumentRefer = async () => {
    if (sufficient !== false) {
      // Secondary footer action without selecting No — open referral without Yes
      try {
        const res = await saveReadiness.mutateAsync({
          assessmentSufficient: false,
          reasonCodes: reasonCodes.length
            ? reasonCodes
            : ['REFERRAL_REQUIRED'],
          reasonDetail: reasonDetail.trim() || undefined,
          nextAction: 'DOCUMENT_AND_REFER',
          expectedSourceSnapshotHash: snapshotHash,
          expectedReadinessRowVersion: page?.readiness?.rowVersion ?? null,
        });
        toast.message('Routed to documentation & referral');
        onNext({ targetStep: 'DOCUMENTATION' });
        void res;
      } catch (e) {
        toastError(e, 'Could not start referral');
      }
      return;
    }
    setNextAction('DOCUMENT_AND_REFER');
    setReturnTarget(null);
  };

  const handlePrimary = async () => {
    if (sufficient == null) {
      toast.error('Select an answer to continue');
      return;
    }

    if (sufficient === false) {
      if (reasonCodes.length === 0) {
        toast.error('Select at least one reason');
        reasonListRef.current?.focus();
        return;
      }
      if (otherSelected && !reasonDetail.trim()) {
        toast.error('Provide details for Other');
        detailRef.current?.focus();
        return;
      }
      if (!nextAction) {
        toast.error('Choose a next action');
        return;
      }
      if (
        nextAction === 'OBTAIN_OR_UPDATE_INFORMATION' &&
        !returnTarget
      ) {
        toast.error('Choose which section to return to');
        return;
      }
    }

    try {
      const res = await saveReadiness.mutateAsync({
        assessmentSufficient: sufficient,
        reasonCodes: sufficient ? [] : reasonCodes,
        reasonDetail:
          sufficient || !reasonDetail.trim() ? undefined : reasonDetail.trim(),
        nextAction: sufficient
          ? 'CONTINUE_TO_TREATMENT'
          : (nextAction as ReadinessNextAction),
        returnTarget:
          sufficient || nextAction !== 'OBTAIN_OR_UPDATE_INFORMATION'
            ? undefined
            : returnTarget ?? undefined,
        expectedSourceSnapshotHash: snapshotHash,
        expectedReadinessRowVersion: page?.readiness?.rowVersion ?? null,
      });

      if (res.decision === 'READY_TO_CONTINUE' || res.nextRoute === 'treatment') {
        toast.success('Prescribing readiness confirmed');
        onNext({ targetStep: 'TREATMENT' });
        return;
      }
      if (
        res.decision === 'MORE_INFORMATION' ||
        res.nextRoute === 'assessment' ||
        res.nextRoute === 'patient' ||
        res.nextRoute === 'red-flags'
      ) {
        const map: Record<string, string> = {
          assessment: 'CLINICAL_ASSESSMENT',
          patient: 'PATIENT_ASSESSMENT',
          'red-flags': 'RED_FLAGS',
        };
        const target = map[res.nextRoute] ?? 'CLINICAL_ASSESSMENT';
        toast.message('Saved — return to update information');
        if (onGoToStep) onGoToStep(target);
        else onNext({ targetStep: target });
        return;
      }
      toast.message('Routed to documentation & referral');
      onNext({ targetStep: 'DOCUMENTATION' });
    } catch (e) {
      const code = getErrorCode(e);
      if (code === 'READINESS_SNAPSHOT_STALE' || code === 'RED_FLAG_CHECK_STALE') {
        void refetch();
        toast.error('Clinical information changed — review red flags again');
        return;
      }
      toastError(e, 'Could not confirm prescribing readiness');
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading prescribing readiness…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center py-16 gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="font-semibold">Could not load readiness</p>
        <ClinicalSecondaryButton onClick={() => void refetch()}>
          Retry
        </ClinicalSecondaryButton>
      </div>
    );
  }

  const blocked = Boolean(page?.blockingCode);

  return (
    <div className="mx-auto flex w-full flex-col pb-10">
      <header className="mb-6">
        <h1 className="m-0 text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[34px]">
          Prescribing Readiness
        </h1>
        <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Confirm whether you have enough information to make a prescribing
          decision.
        </p>
      </header>

      {/* Blocking / stale banner */}
      {blocked && (
        <div
          ref={bannerRef}
          tabIndex={-1}
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-amber-950">
              Review required
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-amber-900/90">
              {page?.message ??
                'Clinical or patient information changed after the red-flag review. Review the updated red flags before confirming prescribing readiness.'}
            </p>
            <button
              type="button"
              className="mt-2 text-[13px] font-semibold text-primary hover:underline"
              onClick={() =>
                onGoToStep
                  ? onGoToStep('RED_FLAGS')
                  : onBack()
              }
            >
              Return to Red-Flag Check
            </button>
          </div>
        </div>
      )}

      {/* Completed red-flag summary */}
      {!blocked && redFlagSummary && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200/90 bg-emerald-50/85 px-4 py-3.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-emerald-950">
              {redFlagSummary.isManual
                ? 'Manual red-flag review complete'
                : 'Red-flag review complete'}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-emerald-900/85">
              {redFlagSummary.questionCount > 0
                ? `${redFlagSummary.questionCount} priority question${redFlagSummary.questionCount === 1 ? '' : 's'} reviewed · `
                : ''}
              No unresolved concerns requiring referral were identified.
            </p>
            {(redFlagSummary.confirmedAt || pharmacistName) && (
              <p className="mt-1 text-[12px] text-emerald-800/75">
                Confirmed by {pharmacistName}
                {redFlagSummary.confirmedAt
                  ? ` on ${formatConfirmedAt(redFlagSummary.confirmedAt)}`
                  : ''}
              </p>
            )}
            <button
              type="button"
              className="mt-1.5 text-[12.5px] font-semibold text-primary hover:underline"
              onClick={() => (onGoToStep ? onGoToStep('RED_FLAGS') : onBack())}
            >
              Review details
            </button>
          </div>
        </div>
      )}

      {/* Main decision card */}
      {!blocked && (
        <section
          className={cn(
            'overflow-hidden rounded-2xl border border-[color:var(--consult-card-border)] bg-card',
            'shadow-[var(--consult-card-shadow)]',
          )}
        >
          <div className="relative border-b border-[color:var(--consult-divider)] px-5 py-5 sm:px-6">
            <p className="absolute right-5 top-5 text-[11.5px] font-semibold text-primary sm:right-6">
              Pharmacist confirmation required
            </p>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend
                id={legendId}
                className="mb-5 max-w-[85%] text-[15.5px] font-bold leading-snug text-foreground"
              >
                Based on the clinical assessment, patient information, and
                red-flag review, do you have enough information to make a
                prescribing decision?
              </legend>

              <div
                role="radiogroup"
                aria-labelledby={legendId}
                className="flex flex-col gap-3"
              >
                <ReadinessOptionCard
                  selected={yesSelected}
                  onSelect={() => {
                    setSufficient(true);
                    setReasonCodes([]);
                    setReasonDetail('');
                    setNextAction(null);
                    setReturnTarget(null);
                  }}
                  title="Yes — Continue to treatment"
                  description="I have enough information to make a prescribing decision."
                  name="prescribing-readiness"
                  value="yes"
                />
                <ReadinessOptionCard
                  selected={noSelected}
                  onSelect={() => {
                    setSufficient(false);
                    setNextAction(null);
                  }}
                  title="No — More information or referral is required"
                  description="Additional assessment, information, investigation, consultation, or referral is needed."
                  name="prescribing-readiness"
                  value="no"
                />
              </div>
            </fieldset>
          </div>

          {/* Insufficiency panel */}
          {noSelected && (
            <div className="space-y-5 border-b border-[color:var(--consult-divider)] px-5 py-5 sm:px-6">
              <h3 className="text-[15px] font-bold text-foreground">
                What information or action is required?
              </h3>

              <div
                ref={reasonListRef}
                tabIndex={-1}
                className="space-y-2 outline-none"
                role="group"
                aria-label="Insufficiency reasons"
              >
                <p className="text-[13px] font-semibold text-foreground">
                  Reason <span className="text-destructive">*</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REASON_ORDER.map((code) => {
                    const checked = reasonCodes.includes(code);
                    return (
                      <label
                        key={code}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13.5px] transition-colors',
                          checked
                            ? 'border-primary/45 bg-primary/[0.06]'
                            : 'border-[color:var(--consult-card-border)] hover:border-primary/25',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                          checked={checked}
                          onChange={() => toggleReason(code)}
                        />
                        <span className="leading-snug text-foreground">
                          {READINESS_INSUFFICIENCY_REASON_LABELS[code]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="readiness-detail"
                  className="mb-1.5 block text-[13px] font-semibold text-foreground"
                >
                  Details
                  {otherSelected ? (
                    <span className="text-destructive"> *</span>
                  ) : (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      (optional)
                    </span>
                  )}
                </label>
                <p className="mb-2 text-[12.5px] text-muted-foreground">
                  Briefly record what is missing or what action is needed.
                </p>
                <Textarea
                  ref={detailRef}
                  id="readiness-detail"
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  aria-required={otherSelected}
                  className="rounded-xl border-[color:var(--consult-card-border)] text-[14px]"
                />
              </div>

              <div role="radiogroup" aria-label="Next action" className="space-y-2">
                <p className="text-[13px] font-semibold text-foreground">
                  Next action <span className="text-destructive">*</span>
                </p>
                {(
                  [
                    {
                      value: READINESS_NEXT_ACTIONS.OBTAIN_OR_UPDATE_INFORMATION,
                      title: 'Obtain or update information',
                      desc: 'Return to the relevant assessment section.',
                    },
                    {
                      value: READINESS_NEXT_ACTIONS.DOCUMENT_AND_REFER,
                      title: 'Document & Refer',
                      desc: 'Stop prescribing and open the referral workflow.',
                    },
                  ] as const
                ).map((opt) => {
                  const selected = nextAction === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setNextAction(opt.value);
                        if (opt.value === 'DOCUMENT_AND_REFER') {
                          setReturnTarget(null);
                        } else if (reasonCodes[0]) {
                          const s = suggestedReturnTarget(reasonCodes[0]);
                          if (s) setReturnTarget(s);
                        }
                      }}
                      className={cn(
                        'flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors',
                        selected
                          ? 'border-primary/50 bg-primary/[0.06]'
                          : 'border-[color:var(--consult-card-border)] hover:border-primary/30',
                      )}
                    >
                      <span className="text-[14px] font-semibold text-foreground">
                        {opt.title}
                      </span>
                      <span className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              {nextAction === 'OBTAIN_OR_UPDATE_INFORMATION' && (
                <div
                  role="radiogroup"
                  aria-label="Return target"
                  className="space-y-2"
                >
                  <p className="text-[13px] font-semibold text-foreground">
                    Return to <span className="text-destructive">*</span>
                  </p>
                  {(
                    Object.keys(READINESS_RETURN_TARGETS) as ReadinessReturnTarget[]
                  ).map((target) => {
                    const selected = returnTarget === target;
                    return (
                      <button
                        key={target}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setReturnTarget(target)}
                        className={cn(
                          'flex w-full items-center rounded-xl border px-4 py-2.5 text-left text-[14px] font-medium transition-colors',
                          selected
                            ? 'border-primary/50 bg-primary/[0.06] text-primary'
                            : 'border-[color:var(--consult-card-border)] text-foreground hover:border-primary/30',
                        )}
                      >
                        {READINESS_RETURN_TARGET_LABELS[target]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-2.5 px-5 py-4 sm:px-6">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              SafeScribe can organize the information reviewed, but only the
              pharmacist can confirm prescribing readiness.
            </p>
          </div>
        </section>
      )}

      {/* Footer */}
      <div
        className={cn(
          'mt-8 flex flex-col gap-3 border-t border-[color:var(--consult-divider)] pt-5',
          'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <ClinicalSecondaryButton
          onClick={onBack}
          size="md"
          className="h-11 min-w-[7.5rem] border-transparent bg-transparent px-0 text-primary shadow-none hover:bg-transparent hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </ClinicalSecondaryButton>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          {!blocked && (
            <ClinicalSecondaryButton
              onClick={() => void handleDocumentRefer()}
              disabled={saveReadiness.isPending}
              size="md"
              className="h-11 border-primary/50 text-primary hover:bg-primary/[0.05]"
              aria-label="Document and refer without confirming readiness as Yes"
            >
              Document & Refer
            </ClinicalSecondaryButton>
          )}

          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <ClinicalPrimaryButton
              onClick={() => void handlePrimary()}
              loading={saveReadiness.isPending}
              disabled={primaryDisabled || blocked}
              loadingLabel="Saving…"
              size="md"
              className="h-11 min-w-[11rem] px-6"
              aria-label={primaryLabel}
            >
              {primaryLabel}
            </ClinicalPrimaryButton>
            {sufficient == null && !blocked && (
              <p className="text-center text-[12px] text-muted-foreground sm:text-right">
                Select an answer to continue.
              </p>
            )}
          </div>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {saveReadiness.isSuccess ? 'Readiness decision saved' : ''}
      </div>
    </div>
  );
}

function ReadinessOptionCard({
  selected,
  onSelect,
  title,
  description,
  name,
  value,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  name: string;
  value: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3.5 rounded-xl border px-4 py-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        selected
          ? 'border-primary/55 bg-primary/[0.05] shadow-sm'
          : 'border-[color:var(--consult-card-border)] hover:border-primary/35',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected
            ? 'border-primary bg-primary text-white'
            : 'border-muted-foreground/40 bg-background',
        )}
        aria-hidden
      >
        {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
        tabIndex={-1}
      />
    </button>
  );
}
