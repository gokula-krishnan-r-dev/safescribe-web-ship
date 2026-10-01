'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  PathwayDevelopmentReviewDialog,
  PathwayDocumentationReferences,
  PathwayEvidenceDialog,
} from '../assessment/evidence-dialogs';
import type { PathwayEvidence } from '../assessment/assessment-types';
import { CLINICAL_REVIEW_COPY } from './clinical-review-copy';
import {
  clampDifferentialName,
  duplicateDifferentialName,
  pharmacistItem,
  type DifferentialReviewState,
  type DifferentialViewItem,
  type PharmacistDifferential,
  type RedFlagViewItem,
} from './clinical-review-model';

function frequencyText(label: DifferentialViewItem['frequencyLabel']): string | null {
  if (label === 'common') return CLINICAL_REVIEW_COPY.frequencyCommon;
  if (label === 'less_common') return CLINICAL_REVIEW_COPY.frequencyLessCommon;
  if (label === 'rare') return CLINICAL_REVIEW_COPY.frequencyRare;
  return null;
}

function CountPill({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e7f6f4] px-3.5 text-[13.5px] font-semibold text-[#0f6f6b] hover:bg-[#d9f1ee]"
    >
      {label}
      <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
    </button>
  );
}

function EvidenceMenu({
  label,
  onOpenGuidelines,
  onOpenDevelopment,
}: {
  label: string;
  onOpenGuidelines: () => void;
  onOpenDevelopment: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2 text-[14px] font-semibold text-[#0f6f6b] hover:bg-[#f3fbfa]"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          {label}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px] p-1.5">
        {[
          { label: CLINICAL_REVIEW_COPY.guidelineSources, run: onOpenGuidelines },
          { label: CLINICAL_REVIEW_COPY.developmentReview, run: onOpenDevelopment },
        ].map((action) => (
          <DropdownMenuItem
            key={action.label}
            onSelect={action.run}
            className="rounded-lg px-3 py-2 text-[13.5px]"
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function YesNo({
  value,
  onChange,
  label,
}: {
  value?: 'yes' | 'no';
  onChange: (next: 'yes' | 'no') => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      {(['yes', 'no'] as const).map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              'h-10 min-w-[72px] rounded-[10px] border px-4 text-[14px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f6b]/30',
              selected
                ? 'border-[#0f6f6b] bg-[#e7f6f4] text-[#0f6f6b]'
                : 'border-[#d5dee1] bg-white text-[#334155] hover:border-[#0f6f6b]/40',
            )}
          >
            {option === 'yes' ? 'Yes' : 'No'}
          </button>
        );
      })}
    </div>
  );
}

export function ClinicalReviewScreen({
  pathwayName,
  evidence,
  differentials,
  review,
  onReviewChange,
  onChooseDifferentPathway,
  flags,
  answers,
  onAnswer,
  answeredCount,
  confirmNoneActive,
  onConfirmNone,
  onUndoConfirmNone,
  onRequestReset,
  renderResolution,
  differentialOpen,
  onDifferentialOpenChange,
  redFlagsOpen,
  onRedFlagsOpenChange,
  questionRef,
}: {
  pathwayName: string;
  pathwayNameVersion?: string | null;
  evidence: PathwayEvidence | null;
  differentials: DifferentialViewItem[];
  review: DifferentialReviewState;
  onReviewChange: (next: DifferentialReviewState) => void;
  onChooseDifferentPathway: () => void;
  flags: Array<RedFlagViewItem & { ageHint?: string }>;
  answers: Record<string, 'yes' | 'no' | undefined>;
  onAnswer: (id: string, answer: 'yes' | 'no') => void;
  answeredCount: number;
  confirmNoneActive: boolean;
  onConfirmNone: () => void;
  onUndoConfirmNone: () => void;
  onRequestReset: () => void;
  renderResolution?: (flag: RedFlagViewItem) => ReactNode;
  differentialOpen: boolean;
  onDifferentialOpenChange: (open: boolean) => void;
  redFlagsOpen: boolean;
  onRedFlagsOpenChange: (open: boolean) => void;
  questionRef?: (id: string, el: HTMLDivElement | null) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(differentials[0]?.id ?? null);
  const [whyId, setWhyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PharmacistDifferential | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [pathwayOpen, setPathwayOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [developmentOpen, setDevelopmentOpen] = useState(false);
  const searchId = useId();
  const nameId = useId();

  const addedItems = review.pharmacistAddedDifferentials.map(pharmacistItem);
  const rows = [...differentials, ...addedItems];
  const searchHits = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return differentials.filter((item) => item.displayName.toLowerCase().includes(query)).slice(0, 6);
  }, [differentials, search]);

  function closeEditor() {
    setAddOpen(false);
    setEditing(null);
    setSearch('');
    setName('');
  }

  function commitDifferential() {
    const displayName = clampDifferentialName(name || search);
    if (!displayName) return;
    if (
      duplicateDifferentialName(
        displayName,
        differentials.map((item) => item.displayName),
        review.pharmacistAddedDifferentials,
        editing?.id,
      )
    ) {
      return;
    }
    if (editing) {
      onReviewChange({
        ...review,
        pharmacistAddedDifferentials: review.pharmacistAddedDifferentials.map((item) =>
          item.id === editing.id ? { ...item, displayName } : item,
        ),
        auditEvents: [
          ...review.auditEvents,
          { action: 'differential_edited', at: new Date().toISOString(), subjectId: editing.id },
        ].slice(-40),
      });
    } else {
      const item: PharmacistDifferential = {
        id: `added-${Date.now()}`,
        displayName,
        source: 'pharmacist',
        addedAt: new Date().toISOString(),
        order: review.pharmacistAddedDifferentials.length,
      };
      onReviewChange({
        ...review,
        pharmacistAddedDifferentials: [...review.pharmacistAddedDifferentials, item],
        auditEvents: [
          ...review.auditEvents,
          { action: 'differential_added', at: item.addedAt ?? new Date().toISOString(), subjectId: item.id },
        ].slice(-40),
      });
      setExpandedId(item.id);
    }
    closeEditor();
  }

  const draftName = clampDifferentialName(name || search);
  const duplicate = draftName
    ? duplicateDifferentialName(
        displayNameSafe(draftName),
        differentials.map((item) => item.displayName),
        review.pharmacistAddedDifferentials,
        editing?.id,
      )
    : false;

  function displayNameSafe(value: string) {
    return value;
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-[16px] border border-[#d5dee1] bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="m-0 flex items-center gap-2 text-[22px] font-bold tracking-tight text-[#10233d]">
              {review.reviewed ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f6f6b] text-white">
                  <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden />
                </span>
              ) : null}
              {CLINICAL_REVIEW_COPY.differentialTitle}
            </h2>
            <p className="mt-1 max-w-[640px] text-[14.5px] leading-snug text-[#5b6b76]">
              {review.reviewed && !differentialOpen
                ? CLINICAL_REVIEW_COPY.reviewedCollapsed
                : CLINICAL_REVIEW_COPY.differentialSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <EvidenceMenu
              label={CLINICAL_REVIEW_COPY.evidenceReview}
              onOpenGuidelines={() => setEvidenceOpen(true)}
              onOpenDevelopment={() => setDevelopmentOpen(true)}
            />
            <CountPill
              label={CLINICAL_REVIEW_COPY.alternatives(rows.length)}
              open={differentialOpen}
              onClick={() => onDifferentialOpenChange(!differentialOpen)}
            />
          </div>
        </div>

        {differentialOpen ? (
          <div className="border-t border-[#e6eef1] px-4 py-4 sm:px-5">
            {!rows.length ? (
              <p className="px-2 pb-3 text-[14px] text-[#5b6b76]">
                {CLINICAL_REVIEW_COPY.emptyDifferentials}
              </p>
            ) : (
              <div className="space-y-2.5">
                {rows.map((item) => {
                  const open = expandedId === item.id;
                  const frequency = frequencyText(item.frequencyLabel);
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-[12px] border border-[#d7e3e6] bg-white"
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          const next = open ? null : item.id;
                          setExpandedId(next);
                          if (next) {
                            onReviewChange({
                              ...review,
                              auditEvents: [
                                ...review.auditEvents,
                                {
                                  action: 'differential_item_expanded',
                                  at: new Date().toISOString(),
                                  subjectId: item.id,
                                },
                              ].slice(-40),
                            });
                          }
                        }}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                      >
                        <span className="text-[15.5px] font-semibold text-[#10233d]">
                          {item.displayName}
                        </span>
                        <span className="flex items-center gap-2">
                          {item.source === 'pharmacist' ? (
                            <span className="rounded-full bg-[#f3f6f7] px-2.5 py-1 text-[12px] font-medium text-[#5b6b76]">
                              {CLINICAL_REVIEW_COPY.addedByPharmacist}
                            </span>
                          ) : frequency ? (
                            <span className="rounded-full bg-[#f3f6f7] px-2.5 py-1 text-[12.5px] font-medium text-[#5b6b76]">
                              {frequency}
                            </span>
                          ) : null}
                          <ChevronDown
                            className={cn('h-4 w-4 text-[#6b7c8a] transition-transform', open && 'rotate-180')}
                            aria-hidden
                          />
                        </span>
                      </button>
                      {open ? (
                        <div className="grid gap-5 border-t border-[#e6eef1] px-4 py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(220px,0.8fr)]">
                          <div>
                            <p className="text-[13.5px] font-semibold text-[#10233d]">
                              {CLINICAL_REVIEW_COPY.distinguishing}
                            </p>
                            {item.distinguishingFeatures.length ? (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-[#334155]">
                                {item.distinguishingFeatures.map((feature) => (
                                  <li key={feature}>{feature}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-[13.5px] text-[#6b7c8a]">
                                No distinguishing features are recorded for this alternative.
                              </p>
                            )}
                            {item.source === 'pharmacist' ? (
                              <div className="mt-3 flex gap-3">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0f6f6b] hover:underline"
                                  onClick={() => {
                                    const saved = review.pharmacistAddedDifferentials.find(
                                      (row) => row.id === item.id,
                                    );
                                    if (!saved) return;
                                    setEditing(saved);
                                    setName(saved.displayName);
                                    setAddOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  {CLINICAL_REVIEW_COPY.edit}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#9a3b3b] hover:underline"
                                  onClick={() => setRemoveId(item.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {CLINICAL_REVIEW_COPY.remove}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div>
                            <p className="text-[13.5px] font-semibold text-[#10233d]">
                              {CLINICAL_REVIEW_COPY.whyConsider}
                            </p>
                            <p className="mt-2 text-[13.5px] leading-relaxed text-[#334155]">
                              {item.rationale ?? 'No rationale is recorded for this alternative.'}
                            </p>
                            <div className="mt-4">
                              <PathwayDocumentationReferences evidence={evidence} />
                            </div>
                          </div>
                          {item.remember ? (
                            <div className="rounded-[12px] border border-[#d7ece9] bg-[#f3fbfa] px-3.5 py-3">
                              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0f6f6b]">
                                <Info className="h-4 w-4" aria-hidden />
                                {CLINICAL_REVIEW_COPY.remember}
                              </p>
                              <p className="mt-1.5 text-[13px] leading-relaxed text-[#1b4f4c]">
                                {item.remember}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setName('');
                setSearch('');
                setAddOpen(true);
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-[12px] border border-dashed border-[#c5d8dc] px-3 py-3 text-left hover:bg-[#f7fbfb]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e7f6f4] text-[#0f6f6b]">
                <Plus className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[14.5px] font-semibold text-[#0f6f6b]">
                  {CLINICAL_REVIEW_COPY.addDifferential}
                </span>
                <span className="text-[13px] text-[#6b7c8a]">{CLINICAL_REVIEW_COPY.addDifferentialHint}</span>
              </span>
            </button>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14.5px] font-medium text-[#10233d]">
                <input
                  type="checkbox"
                  checked={review.reviewed}
                  onChange={(event) => {
                    const reviewed = event.target.checked;
                    onReviewChange({
                      ...review,
                      reviewed,
                      reviewedAt: reviewed ? new Date().toISOString() : undefined,
                      auditEvents: [
                        ...review.auditEvents,
                        {
                          action: reviewed
                            ? 'differential_review_completed'
                            : 'differential_review_reopened',
                          at: new Date().toISOString(),
                        },
                      ].slice(-40),
                    });
                    if (reviewed) {
                      onDifferentialOpenChange(false);
                      onRedFlagsOpenChange(true);
                      requestAnimationFrame(() => {
                        document.getElementById('red-flags-screening')?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      });
                    }
                  }}
                  className="h-4 w-4 rounded border-[#c5d0d4] text-[#0f6f6b] focus:ring-[#0f6f6b]"
                />
                {CLINICAL_REVIEW_COPY.reviewedLabel}
              </label>
              <button
                type="button"
                onClick={() => setPathwayOpen(true)}
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0f6f6b] hover:underline"
              >
                <Shuffle className="h-4 w-4" />
                {CLINICAL_REVIEW_COPY.choosePathway}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section
        id="red-flags-screening"
        className={cn(
          'overflow-hidden rounded-[16px] border bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.06)]',
          review.reviewed ? 'border-[#d5dee1]' : 'border-[#e4ecee]',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="m-0 text-[22px] font-bold tracking-tight text-[#10233d]">
              {CLINICAL_REVIEW_COPY.redFlagsTitle}
            </h2>
            <p className="mt-1 max-w-[680px] text-[14.5px] leading-snug text-[#5b6b76]">
              {CLINICAL_REVIEW_COPY.redFlagsSubtitle}
            </p>
            {!review.reviewed ? (
              <p className="mt-2 text-[13px] text-[#6b7c8a]">{CLINICAL_REVIEW_COPY.redFlagsLockedHint}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <EvidenceMenu
              label={CLINICAL_REVIEW_COPY.evidenceReview}
              onOpenGuidelines={() => setEvidenceOpen(true)}
              onOpenDevelopment={() => setDevelopmentOpen(true)}
            />
            <CountPill
              label={CLINICAL_REVIEW_COPY.answered(answeredCount, flags.length)}
              open={redFlagsOpen}
              onClick={() => onRedFlagsOpenChange(!redFlagsOpen)}
            />
          </div>
        </div>

        {redFlagsOpen ? (
          <div className="border-t border-[#e6eef1]">
            {flags.length ? (
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <button
                  type="button"
                  onClick={onConfirmNone}
                  aria-describedby="confirm-none-hint"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#0f6f6b] px-4 text-[14.5px] font-semibold text-[#0f6f6b] hover:bg-[#f3fbfa]"
                >
                  <Check className="h-4 w-4" />
                  {CLINICAL_REVIEW_COPY.confirmNone}
                </button>
                <p id="confirm-none-hint" className="text-[13.5px] leading-snug text-[#5b6b76]">
                  {CLINICAL_REVIEW_COPY.confirmNoneHint}
                </p>
              </div>
            ) : (
              <p className="px-6 py-5 text-[14.5px] text-[#5b6b76]">{CLINICAL_REVIEW_COPY.noRedFlags}</p>
            )}

            {confirmNoneActive ? (
              <div className="mx-5 mb-2 flex items-center justify-between gap-3 rounded-[12px] border border-[#d7ece9] bg-[#f3fbfa] px-3.5 py-3 sm:mx-6">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#0f6f6b] text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#10233d]">
                      {CLINICAL_REVIEW_COPY.nonePresentTitle}
                    </p>
                    <p className="text-[13px] text-[#5b6b76]">{CLINICAL_REVIEW_COPY.nonePresentBody}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onUndoConfirmNone}
                  className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#0f6f6b] hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {CLINICAL_REVIEW_COPY.undo}
                </button>
              </div>
            ) : null}

            {flags.map((flag) => {
              const answer = answers[flag.id];
              const showOutcome = answer === 'yes';
              return (
                <div
                  key={flag.id}
                  ref={(el) => questionRef?.(flag.id, el)}
                  className="border-t border-[#e6eef1] px-5 py-4 sm:px-6"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                    <p className="m-0 min-w-0 text-[15px] font-medium leading-[1.45] text-[#10233d]">
                      <span>{flag.label}</span>
                      <Popover
                        open={whyId === flag.id}
                        onOpenChange={(open) => {
                          setWhyId(open ? flag.id : null);
                          if (!open) return;
                          onReviewChange({
                            ...review,
                            auditEvents: [
                              ...review.auditEvents,
                              {
                                action: 'red_flag_why_opened',
                                at: new Date().toISOString(),
                                subjectId: flag.id,
                              },
                            ].slice(-40),
                          });
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="ml-2 inline-flex items-center gap-1 align-baseline text-[13.5px] font-semibold text-[#0f6f6b] hover:underline"
                            aria-label={`${CLINICAL_REVIEW_COPY.why} ${flag.label}`}
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden />
                            {CLINICAL_REVIEW_COPY.why}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[320px] p-4">
                          <p className="text-[15px] font-bold text-[#10233d]">
                            {CLINICAL_REVIEW_COPY.whyTitle}
                          </p>
                          <p className="mt-1 text-[13px] font-semibold text-[#334155]">
                            {flag.label.replace(/\?$/, '')}
                          </p>
                          <p className="mt-2 text-[13.5px] leading-relaxed text-[#334155]">
                            {flag.whyText ??
                              'This finding may require referral or prevent treatment through this pathway.'}
                          </p>
                          <div className="mt-3">
                            <PathwayDocumentationReferences evidence={evidence} />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
                      <YesNo
                        value={answer}
                        label={flag.label}
                        onChange={(next) => onAnswer(flag.id, next)}
                      />
                    </div>
                  </div>
                  {flag.ageHint ? (
                    <p className="mt-1 text-right text-[12px] text-[#6b7c8a]">{flag.ageHint}</p>
                  ) : null}
                  {showOutcome ? (
                    <div
                      className={cn(
                        'mt-3 rounded-[12px] border px-3.5 py-3',
                        flag.outcome.kind === 'do_not_proceed_in_pathway' ||
                          flag.outcome.kind === 'referral_recommended'
                          ? 'border-[#f3c7c7] bg-[#fff6f6]'
                          : 'border-[#ead7b0] bg-[#fffaf1]',
                      )}
                    >
                      <p className="text-[14px] font-semibold text-[#10233d]">{flag.outcome.title}</p>
                      {flag.outcome.detail ? (
                        <p className="mt-1 text-[13.5px] leading-relaxed text-[#334155]">
                          {flag.outcome.detail}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {showOutcome ? renderResolution?.(flag) : null}
                </div>
              );
            })}

            {flags.length ? (
              <div className="flex justify-end border-t border-[#e6eef1] px-5 py-3 sm:px-6">
                <button
                  type="button"
                  onClick={onRequestReset}
                  className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0f6f6b] hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {CLINICAL_REVIEW_COPY.resetAnswers}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <Dialog open={addOpen} onOpenChange={(open) => (open ? setAddOpen(true) : closeEditor())}>
        <DialogContent className="max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>{CLINICAL_REVIEW_COPY.addDifferentialTitle}</DialogTitle>
            <DialogDescription>{CLINICAL_REVIEW_COPY.searchHint}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Input
                id={searchId}
                value={search}
                maxLength={100}
                placeholder={CLINICAL_REVIEW_COPY.searchPlaceholder}
                onChange={(event) => setSearch(event.target.value)}
              />
              {searchHits.length ? (
                <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-[#e6eef1] bg-white p-1 shadow-md">
                  {searchHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-[#f3fbfa]"
                        onClick={() => setSearch(hit.displayName)}
                      >
                        {hit.displayName}
                        <span className="text-[12px] text-[#6b7c8a]">
                          {CLINICAL_REVIEW_COPY.alreadyListed}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <p className="text-center text-[12.5px] font-semibold uppercase tracking-wide text-[#8aa0a8]">
              {CLINICAL_REVIEW_COPY.or}
            </p>
            <div>
              <Input
                id={nameId}
                value={name}
                maxLength={100}
                placeholder={CLINICAL_REVIEW_COPY.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="mt-1 text-right text-[12px] text-[#8aa0a8]">
                {clampDifferentialName(name || search).length}/100
              </p>
            </div>
            {duplicate ? (
              <p className="text-[13px] text-[#9a3b3b]">{CLINICAL_REVIEW_COPY.alreadyListed}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditor}>
              {CLINICAL_REVIEW_COPY.cancel}
            </Button>
            <Button type="button" onClick={commitDifferential} disabled={!draftName || duplicate}>
              {editing ? CLINICAL_REVIEW_COPY.save : CLINICAL_REVIEW_COPY.add}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pathwayOpen}
        onOpenChange={setPathwayOpen}
        title={CLINICAL_REVIEW_COPY.choosePathwayTitle}
        description={CLINICAL_REVIEW_COPY.choosePathwayBody}
        cancelLabel={CLINICAL_REVIEW_COPY.choosePathwayCancel}
        confirmLabel={CLINICAL_REVIEW_COPY.choosePathwayConfirm}
        onConfirm={() => {
          setPathwayOpen(false);
          onReviewChange({
            ...review,
            auditEvents: [
              ...review.auditEvents,
              { action: 'choose_different_pathway_selected', at: new Date().toISOString() },
            ].slice(-40),
          });
          onChooseDifferentPathway();
        }}
      />

      <ConfirmDialog
        open={Boolean(removeId)}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        title={CLINICAL_REVIEW_COPY.removeTitle}
        description={CLINICAL_REVIEW_COPY.removeBody}
        confirmLabel={CLINICAL_REVIEW_COPY.remove}
        variant="destructive"
        onConfirm={() => {
          if (!removeId) return;
          onReviewChange({
            ...review,
            pharmacistAddedDifferentials: review.pharmacistAddedDifferentials.filter(
              (item) => item.id !== removeId,
            ),
            auditEvents: [
              ...review.auditEvents,
              { action: 'differential_removed', at: new Date().toISOString(), subjectId: removeId },
            ].slice(-40),
          });
          setRemoveId(null);
        }}
      />

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
      <span className="sr-only">{pathwayName}</span>
    </div>
  );
}
