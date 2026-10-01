'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Info, Loader2, Pencil, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from './clinical-ui';
import {
  clinicalJudgementPromptCopy,
  confirmBlockedReason,
  DIAGNOSTIC_CERTAINTY_OPTIONS,
  isClinicalJudgementFormValid,
  PATHWAY_CLINICAL_JUDGEMENT_RATIONALE_MAX,
  type ClinicalJudgementReason,
  type CombinedAssessmentEvaluation,
  type PathwayClinicalJudgementRecord,
  type PathwayDiagnosticCertainty,
} from '@safescript/shared';

export function PathwayClinicalJudgementCard({
  record,
  evaluation,
  sourceAnswerRevision,
  workingDiagnosis,
  saving,
  aiDrafting,
  confirming,
  error,
  onOpenForm,
  onBack,
  onReviewAnswers,
  onDocumentWithoutTreatment,
  onDraftWithAi,
  onConfirm,
  onChangeDraft,
  onSwitchPathway,
  onStandaloneClinicalJudgement,
}: {
  record: PathwayClinicalJudgementRecord;
  evaluation: CombinedAssessmentEvaluation;
  sourceAnswerRevision: string;
  workingDiagnosis: string;
  saving?: boolean;
  aiDrafting?: boolean;
  confirming?: boolean;
  error?: string | null;
  onOpenForm: () => void;
  onBack: () => void;
  onReviewAnswers: () => void;
  onDocumentWithoutTreatment: () => void;
  onDraftWithAi: () => void;
  onConfirm: () => void;
  onChangeDraft: (patch: {
    diagnosticCertainty?: PathwayDiagnosticCertainty | null;
    rationaleDraft?: string;
    uiState?: PathwayClinicalJudgementRecord['uiState'];
  }) => void;
  onSwitchPathway: () => void;
  onStandaloneClinicalJudgement: () => void;
}) {
  const headingId = useId();
  const rationaleId = useId();
  const certaintyId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const reason = (evaluation.clinicalJudgementReason ?? record.reason) as ClinicalJudgementReason | null;
  const copy = clinicalJudgementPromptCopy(reason);
  const stale =
    record.status === 'STALE' ||
    (record.status === 'CONFIRMED' &&
      Boolean(record.sourceAnswerRevision) &&
      record.sourceAnswerRevision !== sourceAnswerRevision &&
      evaluation.clinicalJudgementRequired);
  const documented = record.status === 'CONFIRMED' && !stale;
  const formOpen = record.uiState === 'form' && !documented;

  useEffect(() => {
    if (formOpen) headingRef.current?.focus({ preventScroll: true });
  }, [formOpen]);

  if (documented && record.uiState !== 'form') {
    return (
      <div className="mx-5 mb-1 mt-1 rounded-[10px] border border-[#ACD8D5] bg-[#F5FBFA] px-4 py-3 sm:mx-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#0F6F6B]">Clinical judgement documented</p>
          <button
            type="button"
            onClick={() => onChangeDraft({ uiState: 'form' })}
            className="text-sm font-semibold text-primary hover:underline"
          >
            View or edit
          </button>
        </div>
      </div>
    );
  }

  if (!formOpen) {
    return (
      <section
        className="mx-5 mb-1 mt-1 rounded-[10px] border border-[#ACD8D5] bg-[#F3FAFA] px-4 py-4 sm:mx-7 sm:px-5 sm:py-[18px]"
        aria-labelledby={headingId}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#7FB8B5] text-[#0F6F6B]">
            <Info className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-[15px] font-semibold text-[#0F6F6B]">
              {stale ? 'Clinical judgement requires review' : copy.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[#3F4853]">{copy.body}</p>
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
              <ClinicalPrimaryButton size="md" onClick={onOpenForm} className="h-10 min-w-0 px-4">
                Use clinical judgement & continue
              </ClinicalPrimaryButton>
              <ClinicalSecondaryButton
                size="md"
                onClick={onReviewAnswers}
                className="h-10 border-[1.5px] border-primary bg-card px-4 text-primary hover:bg-[#F1FAF9] hover:text-primary"
              >
                Review answers
              </ClinicalSecondaryButton>
              <button
                type="button"
                onClick={onDocumentWithoutTreatment}
                className="h-10 px-1 text-sm font-semibold text-primary hover:underline"
              >
                Document without treatment
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Safety screening and medication checks will still be required.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const certainty = record.diagnosticCertainty;
  const rationale = record.rationaleDraft ?? '';
  const valid = isClinicalJudgementFormValid({
    workingDiagnosisDisplay: workingDiagnosis,
    diagnosticCertainty: certainty,
    rationale,
  });
  const missing = confirmBlockedReason({
    workingDiagnosisDisplay: workingDiagnosis,
    diagnosticCertainty: certainty,
    rationale,
    pending: saving || confirming || aiDrafting,
  });

  return (
    <section
      className="mx-5 mb-1 mt-1 rounded-[10px] border border-[#ACD8D5] bg-[#F3FAFA] px-4 py-4 sm:mx-7 sm:px-5 sm:py-5"
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#7FB8B5] text-[#0F6F6B]">
          <Info className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-[15px] font-semibold text-[#0F6F6B] outline-none"
          >
            Use clinical judgement
          </h3>
          <p className="mt-0.5 text-sm text-[#3F4853]">
            Document why you are continuing with this pathway.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2">
                <Label className="text-sm font-semibold text-foreground">Working diagnosis</Label>
                <span className="rounded-full bg-[#E8EEF0] px-2 py-0.5 text-[11px] font-semibold text-[#58636F]">
                  Pre-filled
                </span>
              </div>
              <div className="relative">
                <Input
                  value={workingDiagnosis}
                  readOnly
                  aria-readonly="true"
                  className="h-11 rounded-lg border-[#D5DEE1] bg-card pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setDiagnosisOpen(true)}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-primary hover:bg-[#E8F7F5]"
                  aria-label="Change working diagnosis"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2">
                <Label htmlFor={certaintyId} className="text-sm font-semibold text-foreground">
                  Diagnostic certainty
                </Label>
                <span className="text-[11px] font-semibold text-[#0F6F6B]">Required</span>
              </div>
              <Select
                id={certaintyId}
                required
                value={certainty ?? ''}
                placeholder="Select certainty."
                onChange={(e) =>
                  onChangeDraft({
                    diagnosticCertainty: (e.target.value || null) as PathwayDiagnosticCertainty | null,
                  })
                }
                options={DIAGNOSTIC_CERTAINTY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                className="h-11 rounded-lg border-[#D5DEE1] bg-card"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor={rationaleId} className="text-sm font-semibold text-foreground">
                  Reason for continuing
                </Label>
                <span className="text-[11px] font-semibold text-[#0F6F6B]">Required</span>
              </div>
              <button
                type="button"
                onClick={onDraftWithAi}
                disabled={aiDrafting}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary bg-card px-2.5 text-xs font-semibold text-primary hover:bg-[#F1FAF9] disabled:opacity-60"
              >
                {aiDrafting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Draft
              </button>
            </div>
            <Textarea
              id={rationaleId}
              value={rationale}
              maxLength={PATHWAY_CLINICAL_JUDGEMENT_RATIONALE_MAX}
              onChange={(e) => onChangeDraft({ rationaleDraft: e.target.value })}
              placeholder="Briefly document why this diagnosis or treatment remains appropriate based on your assessment."
              className="min-h-[108px] rounded-lg border-[#D5DEE1] bg-card text-sm"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              This rationale will be included in the consultation note.
            </p>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <ClinicalPrimaryButton
              size="md"
              onClick={onConfirm}
              disabled={!valid || confirming || saving}
              loading={confirming}
              loadingLabel="Saving…"
              className="h-10 min-w-0 px-4"
            >
              Confirm & continue
            </ClinicalPrimaryButton>
            <ClinicalSecondaryButton
              size="md"
              onClick={onBack}
              className="h-10 border-[1.5px] border-primary bg-card px-4 text-primary hover:bg-[#F1FAF9] hover:text-primary"
            >
              Back
            </ClinicalSecondaryButton>
            <button
              type="button"
              onClick={onDocumentWithoutTreatment}
              className="h-10 px-1 text-sm font-semibold text-primary hover:underline"
            >
              Document without treatment
            </button>
          </div>
          {!valid ? (
            <p id={`${headingId}-missing`} className="sr-only">
              {missing}
            </p>
          ) : null}
        </div>
      </div>

      {diagnosisOpen ? (
        <div className="mt-4 rounded-lg border border-[#D5DEE1] bg-card px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Change working diagnosis?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This pathway’s treatments apply to the current diagnosis. Choose another guided
            pathway, or continue with standalone clinical judgement.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ClinicalSecondaryButton
              size="md"
              onClick={() => {
                setDiagnosisOpen(false);
                onSwitchPathway();
              }}
              className="h-9 border-primary px-3 text-primary"
            >
              Switch pathway
            </ClinicalSecondaryButton>
            <button
              type="button"
              onClick={() => {
                setDiagnosisOpen(false);
                onStandaloneClinicalJudgement();
              }}
              className="h-9 px-2 text-sm font-semibold text-primary hover:underline"
            >
              Use standalone clinical judgement
            </button>
            <button
              type="button"
              onClick={() => setDiagnosisOpen(false)}
              className="h-9 px-2 text-sm text-muted-foreground hover:underline"
            >
              Keep current diagnosis
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function PathwayClinicalJudgementStatusChip({
  record,
  onView,
}: {
  record: PathwayClinicalJudgementRecord | null | undefined;
  onView?: () => void;
}) {
  if (record?.status !== 'CONFIRMED' || record.noTreatmentInitiated) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#ACD8D5] bg-[#F5FBFA] px-3 py-2 text-sm text-[#0F6F6B]">
      <span className="font-medium">Clinical judgement used</span>
      <span aria-hidden>·</span>
      {onView ? (
        <button type="button" onClick={onView} className="font-semibold hover:underline">
          View rationale
        </button>
      ) : (
        <span>View rationale</span>
      )}
    </div>
  );
}

export function pathwayClinicalJudgementActive(
  evaluation: CombinedAssessmentEvaluation | null | undefined,
  record: PathwayClinicalJudgementRecord | null | undefined,
): boolean {
  if (record?.status === 'STALE') return true;
  if (evaluation?.clinicalJudgementRequired && record?.status !== 'CONFIRMED') return true;
  return Boolean(
    evaluation?.clinicalJudgementRequired && record?.status === 'CONFIRMED' && record.uiState === 'form',
  );
}
