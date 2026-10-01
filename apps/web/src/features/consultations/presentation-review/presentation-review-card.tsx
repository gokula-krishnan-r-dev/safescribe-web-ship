'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Info, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  PathwayDevelopmentReviewDialog,
  PathwayDocumentationReferences,
  PathwayEvidenceDialog,
} from '../assessment/evidence-dialogs';
import type { PathwayEvidence } from '../assessment/assessment-types';
import { assignSectionRef, ClinicalYesNoToggle } from '../clinical-ui';
import { MedicationSearchField } from '../medication-search-field';
import { isMedicationQuestion, parseMedicationEntriesFromSaved } from '../medication-utils';
import { parsePharmacistTip } from '../pharmacist-tip';
import type { ClinicalQuestion, MedicationEntry, QuestionResponse } from '../types';
import {
  criteriaAffirmative,
  criteriaFindingOptions,
  criteriaNegative,
  countCriteriaAnswered,
  normalizeCriteriaAnswer,
} from '../steps/step3-clinical-criteria';
import {
  PRESENTATION_FINDING_MAX,
  PRESENTATION_REVIEW_COPY,
} from './presentation-review-copy';
import {
  clampFindingText,
  formatFindingStamp,
  newFindingId,
  type AdditionalClinicalFinding,
} from './presentation-review-findings';

function isDateQuestion(q: ClinicalQuestion): boolean {
  return String(q.type ?? '').trim().toUpperCase() === 'DATE';
}

function isNumberQuestion(q: ClinicalQuestion): boolean {
  const type = String(q.type ?? '').trim().toUpperCase();
  return type === 'NUMBER' || type === 'SCALE';
}

function PresentationYesNo({
  value,
  yesValue,
  noValue,
  onChange,
  ariaLabel,
}: {
  value: string;
  yesValue: string;
  noValue: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const yesSelected = value.trim().toLowerCase() === yesValue.toLowerCase();
  const noSelected = value.trim().toLowerCase() === noValue.toLowerCase();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex w-full max-w-[280px] items-center gap-2.5 lg:justify-end"
    >
      {[
        { label: 'Yes', token: yesValue, selected: yesSelected },
        { label: 'No', token: noValue, selected: noSelected },
      ].map((opt) => (
        <button
          key={opt.label}
          type="button"
          aria-pressed={opt.selected}
          // Keep focus where it is — click-focus scrollIntoView was nudging the pane.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(opt.token)}
          className={cn(
            'inline-flex h-12 min-w-[118px] flex-1 items-center justify-center rounded-[10px] border text-[15px] font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f6b]/30',
            opt.selected
              ? 'border-[#0f6f6b] bg-[#0f6f6b] text-white'
              : 'border-[#c5d0d4] bg-white text-[#334155] hover:bg-[#f7fbfb]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function QuestionRow({
  q,
  response,
  whyOpen,
  onWhyOpenChange,
  evidence,
  onChange,
  onMedicationChange,
}: {
  q: ClinicalQuestion;
  response?: QuestionResponse;
  whyOpen: boolean;
  onWhyOpenChange: (open: boolean) => void;
  evidence: PathwayEvidence | null;
  onChange: (id: string, val: string, entryMethod: 'INDIVIDUAL_SELECTION' | 'YES_TO_ALL') => void;
  onMedicationChange: (id: string, entries: MedicationEntry[], displayText: string) => void;
}) {
  const options = criteriaFindingOptions(q);
  const raw = String(response?.answerText ?? response?.answer ?? '');
  const val = options.length ? normalizeCriteriaAnswer(raw, options) : raw;
  const aff = criteriaAffirmative(options);
  const neg = criteriaNegative(options);
  const isBinary = Boolean(aff && neg && options.length === 2);
  const isMedQ = isMedicationQuestion(q);
  const medEntries = response?.medicationEntries ?? parseMedicationEntriesFromSaved(undefined, val);
  const whyItMatters = q.description?.trim() || '';
  const helper = parsePharmacistTip(q.helpText)?.guidance ?? (q.helpText?.trim() || '');
  const fromReviewedNote =
    Boolean(val) &&
    (response?.source === 'transcript' || response?.source === 'entity' || Boolean(response?.aiAnswered));

  return (
    <div className="border-t border-[#e4ecee] px-5 py-5 first:border-t-0 sm:px-7 [overflow-anchor:none]">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,280px)] lg:gap-8">
        <div className="min-w-0">
          <p className="m-0 text-[16px] font-semibold leading-[1.45] text-[#10233d]">
            <span>{q.question}</span>
            <Popover open={whyOpen} onOpenChange={onWhyOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ml-2 inline-flex items-center gap-1 align-baseline text-[13.5px] font-semibold text-[#0f6f6b] hover:underline"
                  aria-label={`${PRESENTATION_REVIEW_COPY.why} ${q.question}`}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                  {PRESENTATION_REVIEW_COPY.why}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(92vw,360px)] rounded-[14px] border-[#d7e8e6] p-4 shadow-lg"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-[15px] font-bold text-[#10233d]">
                    {PRESENTATION_REVIEW_COPY.whyTitle}
                  </p>
                  <button
                    type="button"
                    onClick={() => onWhyOpenChange(false)}
                    className="rounded-md p-1 text-[#6b7c8a] hover:bg-[#f3f6f7]"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[13.5px] leading-relaxed text-[#334155]">
                  {whyItMatters || PRESENTATION_REVIEW_COPY.noRationale}
                </p>
                <div className="mt-3">
                  <PathwayDocumentationReferences evidence={evidence} />
                </div>
              </PopoverContent>
            </Popover>
          </p>
          {helper ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6b7c8a]">{helper}</p>
          ) : null}
          {fromReviewedNote ? (
            <p className="mt-1.5 text-[12.5px] font-medium text-[#0f6f6b]">
              {PRESENTATION_REVIEW_COPY.fromReviewedNote}
            </p>
          ) : null}
        </div>

        {isMedQ ? (
          <MedicationSearchField
            label="Current medicines"
            hideLabel
            entries={medEntries}
            onChange={(entries, displayText) => onMedicationChange(q.id, entries, displayText)}
          />
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
          <PresentationYesNo
            value={val}
            yesValue={aff}
            noValue={neg}
            onChange={(next) => onChange(q.id, next, 'INDIVIDUAL_SELECTION')}
            ariaLabel={q.question}
          />
        ) : (
          <ClinicalYesNoToggle
            value={val}
            onChange={(next) => onChange(q.id, next, 'INDIVIDUAL_SELECTION')}
            allowDeselect={false}
            aria-label={q.question}
            className="w-full lg:justify-self-end"
          />
        )}
      </div>
    </div>
  );
}

export function PresentationReviewCard({
  questions,
  responses,
  findings,
  evidence,
  pathwayLabel,
  provinceLabel,
  versionLabel,
  sectionRef,
  eligibilityQuestions = [],
  eligibilitySectionRef,
  footerSlot,
  onChange,
  onMedicationChange,
  onFindingsChange,
}: {
  questions: ClinicalQuestion[];
  responses: Record<string, QuestionResponse>;
  findings: AdditionalClinicalFinding[];
  evidence: PathwayEvidence | null;
  pathwayLabel?: string;
  provinceLabel?: string | null;
  versionLabel?: string | null;
  sectionRef?:
    | React.RefObject<HTMLDivElement | null>
    | React.RefCallback<HTMLDivElement | null>;
  /** Kept for API compatibility; questions are shown in one merged list. */
  eligibilityQuestions?: ClinicalQuestion[];
  eligibilityUnlocked?: boolean;
  eligibilitySectionRef?:
    | React.RefObject<HTMLDivElement | null>
    | React.RefCallback<HTMLDivElement | null>;
  footerSlot?: ReactNode;
  onChange: (id: string, val: string, entryMethod: 'INDIVIDUAL_SELECTION' | 'YES_TO_ALL') => void;
  onMedicationChange: (id: string, entries: MedicationEntry[], displayText: string) => void;
  onReset?: () => void;
  onFindingsChange: (next: AdditionalClinicalFinding[]) => void;
  onEligibilityReset?: () => void;
  onYesToAllEligibility?: () => void;
}) {
  const [whyQuestionId, setWhyQuestionId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [developmentOpen, setDevelopmentOpen] = useState(false);

  const mergedQuestions = useMemo(
    () => [...questions, ...eligibilityQuestions],
    [questions, eligibilityQuestions],
  );
  const total = mergedQuestions.length;
  const answered = countCriteriaAnswered(mergedQuestions, responses);
  const eligibilityStartIndex = questions.length;
  const meta = [pathwayLabel, provinceLabel, versionLabel].filter(Boolean).join('  |  ');
  const evidenceActions = useMemo(
    () => [
      {
        id: 'guidelines',
        label: PRESENTATION_REVIEW_COPY.guidelineSources,
        run: () => setEvidenceOpen(true),
      },
      {
        id: 'review',
        label: PRESENTATION_REVIEW_COPY.developmentReview,
        run: () => setDevelopmentOpen(true),
      },
    ],
    [],
  );

  const commitFinding = () => {
    const text = clampFindingText(draft);
    if (!text) return;
    if (editingId) {
      onFindingsChange(
        findings.map((row) =>
          row.id === editingId ? { ...row, text, updatedAt: new Date().toISOString() } : row,
        ),
      );
    } else {
      onFindingsChange([
        ...findings,
        { id: newFindingId(), text, createdAt: new Date().toISOString() },
      ]);
    }
    setDraft('');
    setEditingId(null);
    setEditorOpen(false);
  };

  return (
    <>
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className="scroll-mt-3 overflow-hidden rounded-[16px] border border-[#d5dee1] bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.06)] [overflow-anchor:none]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9eeec] text-[14px] font-bold text-[#0f6f6b]">
              1
            </span>
            <div className="min-w-0 max-w-[36rem]">
              <h2
                data-clinical-section-title
                className="m-0 text-[22px] font-bold leading-tight tracking-tight text-[#10233d]"
              >
                {PRESENTATION_REVIEW_COPY.title}
              </h2>
              <p className="mt-1 text-[14.5px] leading-snug text-[#5b6b76]">
                {PRESENTATION_REVIEW_COPY.subtitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[14px] font-semibold text-[#0f6f6b] hover:bg-[#f3fbfa]"
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  {PRESENTATION_REVIEW_COPY.evidenceReview}
                  <span aria-hidden>▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px] p-1.5">
                {evidenceActions.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    onSelect={action.run}
                    className="rounded-lg px-3 py-2 text-[13.5px]"
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {total > 0 ? (
              <p className="text-[12.5px] font-medium text-[#6b7c8a]">
                {PRESENTATION_REVIEW_COPY.answered(answered, total)}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          {mergedQuestions.map((q, index) => {
            const isEligibilityStart =
              eligibilityQuestions.length > 0 && index === eligibilityStartIndex;
            return (
              <div
                key={q.id}
                ref={
                  isEligibilityStart
                    ? (el) => assignSectionRef(el, eligibilitySectionRef)
                    : undefined
                }
                id={isEligibilityStart ? 'treatment-eligibility' : undefined}
                className={isEligibilityStart ? 'scroll-mt-3' : undefined}
              >
                <QuestionRow
                  q={q}
                  response={responses[q.id]}
                  whyOpen={whyQuestionId === q.id}
                  onWhyOpenChange={(open) => setWhyQuestionId(open ? q.id : null)}
                  evidence={evidence}
                  onChange={onChange}
                  onMedicationChange={onMedicationChange}
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[#e4ecee] px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setDraft('');
              setEditorOpen(true);
            }}
            className="inline-flex items-start gap-2 text-left text-[#0f6f6b] hover:underline"
          >
            <Plus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="block text-[14.5px] font-semibold">
                {PRESENTATION_REVIEW_COPY.addFinding}
              </span>
              <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b7c8a]">
                {PRESENTATION_REVIEW_COPY.addFindingHelper}
              </span>
            </span>
          </button>
        </div>

        {editorOpen ? (
          <div className="border-t border-[#e4ecee] px-5 py-4 sm:px-7">
            <p className="text-[14px] font-semibold text-[#10233d]">
              {PRESENTATION_REVIEW_COPY.findingLabel}
            </p>
            <div className="relative mt-2">
              <textarea
                value={draft}
                maxLength={PRESENTATION_FINDING_MAX}
                onChange={(e) => setDraft(e.target.value.slice(0, PRESENTATION_FINDING_MAX))}
                placeholder={PRESENTATION_REVIEW_COPY.findingPlaceholder}
                rows={3}
                className="min-h-[96px] w-full resize-y rounded-[10px] border border-[#c5d0d4] px-3 py-2.5 pr-24 text-[14px] text-[#10233d] shadow-none outline-none focus:border-[#0f6f6b] focus:ring-2 focus:ring-[#0f6f6b]/20"
              />
              <span className="absolute bottom-2.5 right-3 text-[11px] text-[#8a97a3]">
                {draft.length}/{PRESENTATION_FINDING_MAX}
              </span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setEditingId(null);
                  setDraft('');
                }}
                className="inline-flex h-10 items-center rounded-[10px] px-4 text-[14px] font-semibold text-[#334155] hover:bg-[#f3f6f7]"
              >
                {PRESENTATION_REVIEW_COPY.cancel}
              </button>
              <button
                type="button"
                onClick={commitFinding}
                disabled={!clampFindingText(draft)}
                className="inline-flex h-10 items-center rounded-[10px] bg-[#0f6f6b] px-4 text-[14px] font-semibold text-white hover:bg-[#0c5e5b] disabled:opacity-50"
              >
                {editingId ? PRESENTATION_REVIEW_COPY.save : PRESENTATION_REVIEW_COPY.add}
              </button>
            </div>
          </div>
        ) : null}

        {findings.length ? (
          <div className="space-y-2 px-5 pb-5 sm:px-7">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-[#d7ece9] bg-[#f3fbfa] px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-relaxed text-[#10233d]">{finding.text}</p>
                  <p className="mt-1 text-[12px] text-[#6b7c8a]">
                    {formatFindingStamp(finding.updatedAt ?? finding.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(finding.id);
                      setDraft(finding.text);
                      setEditorOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0f6f6b] hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {PRESENTATION_REVIEW_COPY.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveId(finding.id)}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#b42318] hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {PRESENTATION_REVIEW_COPY.remove}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {footerSlot}
      </div>

      {meta ? (
        <div className="px-1 pt-2 text-[13px] text-[#5b6b76]">
          <p>{meta}</p>
        </div>
      ) : null}

      <PathwayEvidenceDialog
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        evidence={evidence}
      />
      <PathwayDevelopmentReviewDialog
        open={developmentOpen}
        onOpenChange={setDevelopmentOpen}
        evidence={evidence}
      />
      <ConfirmDialog
        open={Boolean(removeId)}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        title={PRESENTATION_REVIEW_COPY.removeFindingTitle}
        description={PRESENTATION_REVIEW_COPY.removeFindingBody}
        confirmLabel={PRESENTATION_REVIEW_COPY.remove}
        cancelLabel={PRESENTATION_REVIEW_COPY.cancel}
        variant="destructive"
        onConfirm={() => {
          if (removeId) onFindingsChange(findings.filter((row) => row.id !== removeId));
          setRemoveId(null);
        }}
      />
    </>
  );
}
