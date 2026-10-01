'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  ClinicalYesNoToggle,
  ClinicalCollapsedSummary,
  ClinicalPendingSummary,
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
  useClinicalSectionMotion,
  assignSectionRef,
  type ClinicalSectionMotionState,
} from '../clinical-ui';
import type {
  ClinicalQuestion,
  MedicationEntry,
  PathwayDifferential,
  QuestionResponse,
} from '../types';
import { Input } from '@/components/ui/input';
import { MedicationSearchField } from '../medication-search-field';
import { isMedicationQuestion, parseMedicationEntriesFromSaved } from '../medication-utils';
import { parsePharmacistTip } from '../pharmacist-tip';
import { CONFIDENCE_THRESHOLD } from '../ai-prefill';

const YES_NO = ['Yes', 'No'] as const;
const AFFIRMATIVE = new Set(['yes', 'true', 'present', 'positive']);
const NEGATIVE = new Set(['no', 'false', 'absent', 'negative']);

function questionType(q: ClinicalQuestion): string {
  return String(q.type ?? '').trim().toUpperCase();
}

function isDateQuestion(q: ClinicalQuestion): boolean {
  return questionType(q) === 'DATE';
}

function isNumberQuestion(q: ClinicalQuestion): boolean {
  return questionType(q) === 'NUMBER' || questionType(q) === 'SCALE';
}

export function criteriaFindingOptions(q: ClinicalQuestion): string[] {
  if (q.type === 'YES_NO' || q.type === 'BOOLEAN') return [...YES_NO];
  if (isDateQuestion(q) || isNumberQuestion(q)) return [];
  const custom = (Array.isArray(q.options) ? q.options : [])
    .map((o) => (typeof o === 'string' ? o : (o as { label?: string; value?: string }).label || (o as { value?: string }).value || ''))
    .filter(Boolean);
  if (!custom.length) return [...YES_NO];
  const lower = custom.map((c) => c.toLowerCase());
  const looksBinary =
    custom.length <= 3 &&
    lower.some((l) => AFFIRMATIVE.has(l) || NEGATIVE.has(l) || l === 'unknown');
  if (looksBinary) return [...YES_NO];
  return custom;
}

export function criteriaAffirmative(options: string[]): string | null {
  for (const p of ['Yes', 'True', 'Positive', 'Present']) {
    const hit = options.find((o) => o.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return options[0] ?? null;
}

export function criteriaNegative(options: string[]): string | null {
  for (const p of ['No', 'False', 'Negative', 'Absent']) {
    const hit = options.find((o) => o.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return options.length === 2 ? options[1] ?? null : null;
}

export function normalizeCriteriaAnswer(answer: string, options: string[]): string {
  if (!answer) return '';
  const lower = answer.toLowerCase().trim();
  const hit = options.find((o) => o.toLowerCase() === lower);
  if (hit) return hit;
  if (AFFIRMATIVE.has(lower)) return options.find((o) => o.toLowerCase() === 'yes') ?? answer;
  if (NEGATIVE.has(lower)) return options.find((o) => o.toLowerCase() === 'no') ?? answer;
  return answer;
}

export function isCriteriaAnswered(
  q: ClinicalQuestion,
  response: QuestionResponse | undefined,
): boolean {
  if (isMedicationQuestion(q)) {
    return Boolean(String(response?.answerText ?? response?.answer ?? '').trim());
  }
  const options = criteriaFindingOptions(q);
  const raw = String(response?.answerText ?? response?.answer ?? '').trim();
  if (!raw) return false;
  return Boolean(normalizeCriteriaAnswer(raw, options));
}

export function countCriteriaAnswered(
  qs: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): number {
  return qs.filter((q) => isCriteriaAnswered(q, responses[q.id])).length;
}

/** All displayed questions must be answered (not a minimum of 3). */
export function sectionFullyAnswered(
  qs: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): boolean {
  if (!qs.length) return true;
  return qs.every((q) => isCriteriaAnswered(q, responses[q.id]));
}

export function allAnswersYes(
  qs: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): boolean {
  if (!qs.length) return false;
  return qs.every((q) => {
    if (isMedicationQuestion(q)) return true;
    const options = criteriaFindingOptions(q);
    const aff = criteriaAffirmative(options);
    if (!aff) return true;
    const raw = String(responses[q.id]?.answerText ?? responses[q.id]?.answer ?? '');
    return normalizeCriteriaAnswer(raw, options).toLowerCase() === aff.toLowerCase();
  });
}

export function countNoAnswers(
  qs: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): number {
  return qs.filter((q) => {
    if (isMedicationQuestion(q)) return false;
    const options = criteriaFindingOptions(q);
    const neg = criteriaNegative(options);
    if (!neg) return false;
    const raw = String(responses[q.id]?.answerText ?? responses[q.id]?.answer ?? '');
    return normalizeCriteriaAnswer(raw, options).toLowerCase() === neg.toLowerCase();
  }).length;
}

function importanceLabel(likelihood: PathwayDifferential['likelihood']): string | null {
  if (!likelihood) return null;
  if (likelihood === 'COMMON') return 'Common';
  if (likelihood === 'LESS_COMMON') return 'Less common';
  if (likelihood === 'RARE') return 'Important to exclude';
  return String(likelihood).replace(/_/g, ' ');
}

/* ── Single criteria question row ─────────────────────────────────────────── */

function CriteriaQuestionRow({
  q,
  response,
  variant,
  onChange,
  onMedicationChange,
}: {
  q: ClinicalQuestion;
  response?: QuestionResponse;
  variant: 'diagnosis' | 'eligibility';
  onChange: (id: string, val: string, entryMethod: 'INDIVIDUAL_SELECTION' | 'YES_TO_ALL') => void;
  onMedicationChange: (id: string, entries: MedicationEntry[], displayText: string) => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = `criteria-why-${q.id}`;
  const options = criteriaFindingOptions(q);
  const raw = String(response?.answerText ?? response?.answer ?? '');
  const val = options.length ? normalizeCriteriaAnswer(raw, options) : raw;
  const isMedQ = isMedicationQuestion(q);
  const medEntries = response?.medicationEntries ?? parseMedicationEntriesFromSaved(undefined, val);
  const isAi =
    Boolean(response?.aiAnswered) && (response?.confidence ?? 0) >= CONFIDENCE_THRESHOLD;
  const aff = criteriaAffirmative(options);
  const neg = criteriaNegative(options);
  const isBinary = Boolean(aff && neg && options.length === 2);
  const whyItMatters = q.description?.trim() || '';
  const pharmacistTip = parsePharmacistTip(q.helpText);
  const isEligibility = variant === 'eligibility';

  return (
    <div
      className={cn(
        'border-t border-[#D9E1E3] last:border-b-0',
        isEligibility
          ? 'min-h-[104px] px-5 py-5 sm:px-7'
          : 'min-h-[116px] px-5 py-5 sm:px-10',
      )}
    >
      <div
        className={cn(
          'grid grid-cols-1 items-center gap-6',
          isEligibility
            ? 'lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8'
            : 'lg:grid-cols-[minmax(0,1fr)_minmax(240px,390px)] lg:gap-10',
        )}
      >
        <div className="min-w-0">
          <p
            className={cn(
              'm-0 font-medium text-foreground',
              isEligibility
                ? 'text-base leading-[1.45]'
                : 'text-[17px] leading-[1.45]',
            )}
          >
            {q.question}
          </p>
          {whyItMatters ? (
            <div className="mt-1.5">
              <button
                type="button"
                id={`${whyId}-trigger`}
                onClick={() => setWhyOpen((v) => !v)}
                className={cn(
                  'border-0 bg-transparent p-0 font-semibold leading-snug text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  isEligibility ? 'text-sm' : 'text-[15px]',
                )}
                aria-expanded={whyOpen}
                aria-controls={whyId}
              >
                Why?
              </button>
              {whyOpen ? (
                <p
                  id={whyId}
                  className={cn(
                    'mt-2 leading-relaxed text-muted-foreground',
                    isEligibility ? 'text-sm' : 'text-[15px]',
                  )}
                  role="region"
                  aria-label="Why this question matters"
                >
                  {whyItMatters}
                </p>
              ) : null}
            </div>
          ) : null}
          {isAi && val ? (
            <p className="mt-2 text-xs font-medium text-primary/80">From consultation transcript</p>
          ) : null}
        </div>

        {isMedQ ? (
          <div className="w-full min-w-0">
            <MedicationSearchField
              label="Current medicines"
              hideLabel
              entries={medEntries}
              onChange={(entries, displayText) => onMedicationChange(q.id, entries, displayText)}
              aiConfidence={isAi ? response?.confidence : undefined}
            />
          </div>
        ) : isDateQuestion(q) ? (
          <Input
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(val) ? val : ''}
            onChange={(e) => onChange(q.id, e.target.value, 'INDIVIDUAL_SELECTION')}
            aria-label={q.question}
            className="h-12 w-full max-w-[240px] justify-self-stretch lg:justify-self-end"
          />
        ) : isNumberQuestion(q) ? (
          <Input
            type="number"
            inputMode="decimal"
            value={val}
            onChange={(e) => onChange(q.id, e.target.value, 'INDIVIDUAL_SELECTION')}
            aria-label={q.question}
            className="h-12 w-full max-w-[240px] justify-self-stretch lg:justify-self-end"
          />
        ) : isBinary && aff && neg ? (
          <ClinicalYesNoToggle
            tone="clinical"
            size={isEligibility ? 'safety' : 'xl'}
            value={val}
            yesValue={aff}
            noValue={neg}
            onChange={(v) => onChange(q.id, v, 'INDIVIDUAL_SELECTION')}
            allowDeselect={false}
            aria-label={q.question}
            className="w-full justify-self-stretch lg:justify-self-end"
          />
        ) : null}
      </div>

      {pharmacistTip ? (
        <p
          className={cn(
            'mt-3 leading-relaxed text-[#5b6b76]',
            isEligibility ? 'text-[13px]' : 'text-[13.5px]',
          )}
          role="note"
          aria-label="Pharmacist tip"
        >
          <span className="font-medium not-italic text-[#3e4b55]">Pharmacist tip:</span>
          {pharmacistTip.expectedAnswer ? (
            <>
              {' '}
              Expected answer:{' '}
              <strong className="font-semibold text-foreground">
                {pharmacistTip.expectedAnswer}
              </strong>
            </>
          ) : null}
          {pharmacistTip.guidance ? (
            <span className="italic"> {pharmacistTip.guidance}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/* ── Diagnosis / Eligibility criteria card ────────────────────────────────── */

export function AssessmentCriteriaCard({
  title,
  variant,
  questions,
  responses,
  open,
  completed,
  pending,
  pendingHint,
  step,
  onEdit,
  onChange,
  onMedicationChange,
  onYesToAll,
  onReset,
  sectionRef,
  footerSlot,
}: {
  title: string;
  variant: 'diagnosis' | 'eligibility';
  questions: ClinicalQuestion[];
  responses: Record<string, QuestionResponse>;
  open: boolean;
  completed: boolean;
  pending?: boolean;
  pendingHint?: string;
  step?: number;
  onEdit: () => void;
  onChange: (id: string, val: string, entryMethod: 'INDIVIDUAL_SELECTION' | 'YES_TO_ALL') => void;
  onMedicationChange: (id: string, entries: MedicationEntry[], displayText: string) => void;
  onYesToAll: () => void;
  onReset: () => void;
  sectionRef?:
    | React.RefObject<HTMLDivElement | null>
    | React.RefCallback<HTMLDivElement | null>;
  footerSlot?: ReactNode;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const total = questions.length;
  const answered = countCriteriaAnswered(questions, responses);
  const allYes = allAnswersYes(questions, responses);
  const yesTargets = questions.filter((q) => {
    if (isMedicationQuestion(q)) return false;
    return Boolean(criteriaAffirmative(criteriaFindingOptions(q)));
  });
  const yesToAllSelected =
    yesTargets.length > 0 &&
    yesTargets.every((q) => {
      const options = criteriaFindingOptions(q);
      const aff = criteriaAffirmative(options);
      if (!aff) return false;
      const raw = String(responses[q.id]?.answerText ?? responses[q.id]?.answer ?? '');
      return normalizeCriteriaAnswer(raw, options).toLowerCase() === aff.toLowerCase();
    });

  const noun = variant === 'eligibility' ? 'criteria' : 'questions';
  const nounSingular = variant === 'eligibility' ? 'criterion' : 'question';

  const collapsedSummary = useMemo(() => {
    if (answered === total && total > 0) {
      return variant === 'eligibility'
        ? `${total} of ${total} answered`
        : `${total} of ${total} questions completed`;
    }
    return `${answered} of ${total} answered`;
  }, [variant, answered, total]);

  const visualState: ClinicalSectionMotionState | 'none' = open
    ? 'open'
    : completed
      ? 'done'
      : pending
        ? 'pending'
        : 'none';

  const motion = useClinicalSectionMotion(visualState);

  if (visualState === 'done') {
    return (
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn('relative scroll-mt-3 [overflow-anchor:none]', motion)}
      >
        <ClinicalCollapsedSummary
          title={title}
          summary={collapsedSummary}
          onEdit={onEdit}
          step={step}
        />
      </div>
    );
  }

  if (visualState === 'pending') {
    return (
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn('relative scroll-mt-3 [overflow-anchor:none]', motion)}
      >
        <ClinicalPendingSummary
          title={title}
          hint={pendingHint ?? 'Complete the sections above first'}
          step={step}
        />
      </div>
    );
  }

  if (visualState === 'none') return null;

  const isEligibility = variant === 'eligibility';
  /** Hide bulk action for a single eligibility criterion (redundant); keep for diagnosis. */
  const showYesToAll =
    yesTargets.length > 0 && (!isEligibility || yesTargets.length >= 2);

  const supportingText = yesToAllSelected
    ? 'All marked Yes. Clear to revise answers individually.'
    : 'Use when all statements below are true based on the patient assessment.';

  return (
    <>
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn(
          'scroll-mt-3 overflow-hidden rounded-[14px] border border-[#D5DEE1] bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04),0_9px_22px_rgba(15,23,42,0.06)] [overflow-anchor:none]',
          motion,
        )}
      >
        {/* Header — eligibility uses accordion-scale typography per design brief */}
        <div
          className={cn(
            'grid grid-cols-1 items-start gap-5 sm:grid-cols-[minmax(0,1fr)_auto]',
            isEligibility
              ? 'min-h-[88px] px-5 py-5 sm:gap-5 sm:px-7'
              : 'min-h-[118px] border-b border-consult-divider px-5 py-6 sm:gap-6 sm:px-10 sm:py-[26px]',
          )}
        >
          <div className="min-w-0">
            <h2
              data-clinical-section-title
              className={cn(
                'm-0 font-bold leading-snug text-foreground',
                isEligibility
                  ? 'text-xl'
                  : 'text-[24px] tracking-[-0.015em] xl:text-[28px] xl:leading-[1.25]',
              )}
            >
              {title}
            </h2>
            <p
              className={cn(
                'leading-snug text-[#58636F]',
                isEligibility ? 'mt-1.5 text-[15px]' : 'mt-2 text-base',
              )}
            >
              {total} {total === 1 ? nounSingular : noun} · Review all before continuing
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center justify-center bg-[#E5F6F5] font-semibold whitespace-nowrap text-[#0F6F6B]',
              isEligibility
                ? 'h-10 min-w-[132px] rounded-full px-[15px] text-sm'
                : 'h-11 min-w-[166px] rounded-lg px-[18px] text-[15px]',
            )}
          >
            {answered} of {total} answered
          </span>
        </div>

        {/* Yes to all / Clear all */}
        {showYesToAll ? (
          <div
            className={cn(
              'grid grid-cols-1 items-center border-t border-consult-divider',
              isEligibility
                ? 'min-h-[86px] gap-6 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6 sm:px-7'
                : 'min-h-[104px] border-b border-consult-divider gap-6 px-5 py-[18px] sm:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] sm:gap-8 sm:px-10',
            )}
          >
            <button
              type="button"
              onClick={() => (yesToAllSelected ? onReset() : onYesToAll())}
              aria-pressed={yesToAllSelected}
              aria-label={
                yesToAllSelected
                  ? 'Clear all Yes answers'
                  : 'Answer Yes to all unanswered questions'
              }
              className={cn(
                'inline-flex items-center justify-center gap-2.5 rounded-lg border border-primary font-semibold transition-colors shadow-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                isEligibility
                  ? 'h-[50px] min-w-[150px] px-5 text-[15px]'
                  : 'h-14 min-w-[220px] gap-3 px-[22px] text-[17px]',
                yesToAllSelected
                  ? 'bg-[#F0FAF9] text-primary'
                  : 'bg-card text-primary hover:bg-[#F0FAF9]',
              )}
            >
              {yesToAllSelected ? (
                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              ) : (
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              )}
              {yesToAllSelected ? 'Clear all' : 'Yes to all'}
            </button>
            <p
              className={cn(
                'leading-normal text-[#3F4853]',
                isEligibility ? 'text-[15px]' : 'text-base',
              )}
            >
              {supportingText}
            </p>
          </div>
        ) : null}

        {/* Questions */}
        <div>
          {questions.map((q) => (
            <CriteriaQuestionRow
              key={q.id}
              q={q}
              response={responses[q.id]}
              variant={variant}
              onChange={onChange}
              onMedicationChange={onMedicationChange}
            />
          ))}
        </div>

        {/* Eligibility outcome — only when every answer is Yes */}
        {isEligibility && answered === total && allYes ? (
          <div className="mx-5 mb-4 flex min-h-[76px] items-center gap-3.5 rounded-lg border border-[#ACD8D5] bg-[#F5FBFA] px-[18px] py-3.5 sm:mx-7">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">Eligibility criteria met</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                This section is complete. Final treatment suitability still depends on safety
                screening and treatment-specific checks.
              </p>
            </div>
          </div>
        ) : null}

        {footerSlot}

        {/* Reset */}
        <div
          className={cn(
            'flex min-h-[72px] items-center justify-end border-t border-consult-divider py-3.5',
            isEligibility ? 'px-5 sm:px-7' : 'px-5 sm:px-10',
          )}
        >
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={answered === 0}
            className={cn(
              'border-0 bg-transparent text-[15px] font-semibold',
              answered === 0
                ? 'cursor-not-allowed text-[#A8CED0]'
                : 'text-primary hover:underline',
            )}
          >
            Reset answers
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={
          variant === 'eligibility'
            ? 'Reset all treatment-eligibility answers?'
            : 'Reset all diagnosis-confirmation answers?'
        }
        description="This removes recorded assessment answers for this section. You will need to answer the questions again."
        cancelLabel="Cancel"
        confirmLabel="Reset answers"
        variant="destructive"
        onConfirm={() => {
          setResetOpen(false);
          onReset();
        }}
      />
    </>
  );
}

/* ── Differential review card ─────────────────────────────────────────────── */

function DifferentialAccordionItem({
  item,
  flagged,
  onReviewPathway,
}: {
  item: PathwayDifferential;
  flagged: boolean;
  onReviewPathway: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tag = importanceLabel(item.likelihood);
  const considerIf = item.distinguishingFeatures?.trim() || item.keySymptoms?.trim() || '';
  const ifSuspected =
    item.recommendedAction?.trim() || 'Reassess the selected pathway.';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[9px] border transition-colors',
        open ? 'border-[#ACD8D5]' : 'border-[#D5DEE1]',
        flagged && 'bg-[#F1FAF9]',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-4 bg-card px-6 text-left hover:bg-muted/20"
      >
        <p className="min-w-0 text-base font-semibold text-[#111827]">{item.condition}</p>
        {tag ? (
          <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-[13px] font-medium text-muted-foreground">
            {tag}
          </span>
        ) : (
          <span />
        )}
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[#ACD8D5] bg-[#FCFEFE] px-6 py-5 text-[15px] leading-[1.55]">
          <p className="text-[15px] leading-[1.55] text-foreground/90">
            <span className="font-semibold text-foreground">Consider if: </span>
            {considerIf || 'No distinguishing features recorded for this alternative.'}
          </p>
          <p className="text-[15px] leading-[1.55] text-foreground/90">
            <span className="font-semibold text-foreground">If suspected: </span>
            {ifSuspected}
          </p>
          <ClinicalSecondaryButton
            size="lg"
            onClick={onReviewPathway}
            className="mt-1 border-[1.5px] border-primary bg-card text-primary hover:bg-[#F1FAF9] hover:text-primary"
          >
            Review this pathway
          </ClinicalSecondaryButton>
        </div>
      ) : null}
    </div>
  );
}

export function DifferentialReviewCard({
  differentials,
  open,
  completed,
  pending,
  pendingHint,
  step,
  attested,
  flaggedId,
  onEdit,
  onAttest,
  onFlag,
  onClearFlag: _onClearFlag,
  onReset,
  onSaveContinue,
  onReviewPathway,
  saving,
  sectionRef,
}: {
  differentials: PathwayDifferential[];
  open: boolean;
  completed: boolean;
  pending?: boolean;
  pendingHint?: string;
  step?: number;
  attested: boolean;
  flaggedId: string | null;
  onEdit: () => void;
  onAttest: (checked: boolean) => void;
  onFlag: (id: string) => void;
  onClearFlag: () => void;
  onReset: () => void;
  onSaveContinue?: () => void;
  /** Navigate to pathway confirmation after pharmacist confirms the change. */
  onReviewPathway?: () => void;
  saving?: boolean;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  void _onClearFlag;
  const [resetOpen, setResetOpen] = useState(false);
  const [pathwayChangeOpen, setPathwayChangeOpen] = useState(false);
  const [pendingPathwayItem, setPendingPathwayItem] = useState<PathwayDifferential | null>(null);
  const count = differentials.length;

  const statusBadge = attested
    ? `${count} alternative${count === 1 ? '' : 's'} considered`
    : `${count} alternative${count === 1 ? '' : 's'} to review`;

  const statusSubtitle = attested
    ? `${count} alternative${count === 1 ? '' : 's'} · Review completed`
    : `${count} alternative${count === 1 ? '' : 's'} · Consider before continuing`;

  const summary = flaggedId
    ? attested
      ? 'Alternative assessed; current pathway retained'
      : 'Reassessment required'
    : attested
      ? `${count} alternative${count === 1 ? '' : 's'} considered`
      : `${count} alternative${count === 1 ? '' : 's'} to review`;

  const hasInteraction = attested || Boolean(flaggedId);

  const visualState: ClinicalSectionMotionState | 'none' = open
    ? 'open'
    : completed
      ? 'done'
      : pending
        ? 'pending'
        : 'none';

  const motion = useClinicalSectionMotion(visualState);

  if (visualState === 'done') {
    return (
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn('relative scroll-mt-3 [overflow-anchor:none]', motion)}
      >
        <ClinicalCollapsedSummary
          title="Differential Review"
          summary={summary}
          onEdit={onEdit}
          step={step}
        />
      </div>
    );
  }

  if (visualState === 'pending') {
    return (
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn('relative scroll-mt-3 [overflow-anchor:none]', motion)}
      >
        <ClinicalPendingSummary
          title="Differential Review"
          hint={pendingHint ?? 'Complete clinical assessment sections first'}
          step={step}
        />
      </div>
    );
  }

  if (visualState === 'none') return null;

  return (
    <>
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn(
          'scroll-mt-3 overflow-hidden rounded-[14px] border border-[#D5DEE1] bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04),0_9px_22px_rgba(15,23,42,0.06)] [overflow-anchor:none]',
          motion,
        )}
      >
        <div className="grid min-h-[100px] grid-cols-1 items-start gap-6 border-b border-consult-divider px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6 sm:px-7">
          <div className="min-w-0">
            <h2
              data-clinical-section-title
              className="m-0 text-xl font-bold text-foreground"
            >
              Differential Review
            </h2>
            <p className="mt-1.5 text-sm leading-normal text-muted-foreground">{statusSubtitle}</p>
            <p className="mt-2 text-sm leading-normal text-muted-foreground">
              Briefly consider alternative conditions. Expand an item for distinguishing features.
            </p>
          </div>
          <span className="inline-flex h-11 min-w-[166px] items-center justify-center rounded-lg bg-[#E5F6F5] px-[18px] text-[15px] font-semibold whitespace-nowrap text-[#0F6F6B]">
            {statusBadge}
          </span>
        </div>

        <div className="grid gap-2.5 px-5 py-4 sm:px-5">
          {differentials.map((d) => (
            <DifferentialAccordionItem
              key={d.id}
              item={d}
              flagged={flaggedId === d.id}
              onReviewPathway={() => {
                setPendingPathwayItem(d);
                setPathwayChangeOpen(true);
                onFlag(d.id);
              }}
            />
          ))}
        </div>

        {/* Attestation */}
        <div className="px-5 pb-5 sm:px-7">
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3.5 rounded-lg border px-4 py-4 transition-colors',
              attested
                ? 'border-primary/30 bg-accent/80'
                : 'border-border bg-muted/30 hover:bg-muted/50',
            )}
          >
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => onAttest(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded border-2 transition-colors',
                  attested ? 'border-primary bg-primary' : 'border-border bg-card',
                )}
                aria-hidden
              >
                {attested ? (
                  <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
                ) : null}
              </span>
            </span>
            <span className="text-base font-medium text-foreground">
              I have considered the listed alternative diagnoses.
            </span>
          </label>

          {flaggedId && attested ? (
            <p className="mt-2 text-sm text-muted-foreground">
              An alternative was flagged. Document rationale in clinical notes if retaining the
              current pathway.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-consult-divider px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            disabled={!hasInteraction}
            className={cn(
              'border-0 bg-transparent text-[15px] font-semibold',
              hasInteraction
                ? 'text-primary hover:underline'
                : 'cursor-not-allowed text-[#A8CED0]',
            )}
          >
            Reset review
          </button>
          {onSaveContinue ? (
            <ClinicalPrimaryButton
              size="lg"
              onClick={onSaveContinue}
              disabled={!attested}
              loading={saving}
              busyFeedback={false}
              title={
                attested
                  ? undefined
                  : 'Confirm you have considered the alternative diagnoses'
              }
              className="min-w-[160px]"
            >
              Save review
            </ClinicalPrimaryButton>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset differential review?"
        description="This clears the attestation and any flagged alternative."
        cancelLabel="Cancel"
        confirmLabel="Reset review"
        variant="destructive"
        onConfirm={() => {
          setResetOpen(false);
          onReset();
        }}
      />

      <ConfirmDialog
        open={pathwayChangeOpen}
        onOpenChange={(next) => {
          setPathwayChangeOpen(next);
          if (!next) setPendingPathwayItem(null);
        }}
        title="Review a different clinical pathway?"
        description={
          pendingPathwayItem
            ? `Opening pathway selection to review “${pendingPathwayItem.condition}”. Current assessment answers that do not apply may be cleared after you confirm a new pathway. Your current pathway will not change until you select and confirm another.`
            : 'Opening pathway selection. Your current pathway will not change until you select and confirm another.'
        }
        cancelLabel="Stay on this pathway"
        confirmLabel="Review pathways"
        onConfirm={() => {
          setPathwayChangeOpen(false);
          setPendingPathwayItem(null);
          onReviewPathway?.();
        }}
      />
    </>
  );
}
