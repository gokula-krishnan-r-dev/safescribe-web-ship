'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  GripVertical,
  BookOpen,
  MoreHorizontal,
  Pencil,
  Eye,
  X,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClinicalPathway, ClinicalQuestion, ClinicalSection } from '../types';
import {
  useApproveAllQuestions,
  useBulkApproveQuestions,
  useBulkDeleteQuestions,
  useDeleteQuestion,
  useReorderQuestions,
  useUpdateQuestion,
  useUpdatePresentationReviewSection,
} from '../hooks';
import { cn } from '@/lib/utils';
import { AddQuestionModal } from '../add-question-modal';
import { EditQuestionModal } from '../edit-question-modal';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import { PathwayReadOnlyBanner, editLockProps } from '../pathway-edit-lock';
import { EvidenceReviewPanel } from '../presentation-review/evidence-review-panel';
import { LinkReferenceDialog } from '../presentation-review/link-reference-dialog';
import {
  PRESENTATION_REVIEW_SUBTITLE,
  PRESENTATION_REVIEW_TITLE,
  approvalStatusLabel,
  citationDisplay,
  editionLabel,
  evidenceCountLabel,
  formatVisibilityLabel,
  parsePresentationReviewState,
  parseVisibilityRule,
  matchVisibilityPresetId,
  uniqueIdList,
} from '@safescript/shared';

const TYPE_LABELS: Record<string, string> = {
  TEXT: 'Short Text',
  TEXTAREA: 'Long Text',
  YES_NO: 'Yes / No',
  DATE: 'Date',
  NUMBER: 'Number',
  SELECT: 'Pick One',
  MULTI_SELECT: 'Pick Many',
  SCALE: 'Scale',
};

function sortQuestions(list: ClinicalQuestion[]) {
  return [...list].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function QuestionsTab({
  pathway,
  canEdit,
  onOpenReferencesTab,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
  onOpenReferencesTab?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editQuestion, setEditQuestion] = useState<ClinicalQuestion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClinicalQuestion | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const [linkTarget, setLinkTarget] = useState<{ kind: 'question' | 'section'; question?: ClinicalQuestion } | null>(
    null,
  );
  const lock = editLockProps(canEdit);

  const approveAll = useApproveAllQuestions(pathway.id);
  const deleteQuestion = useDeleteQuestion(pathway.id);
  const updateQuestion = useUpdateQuestion(pathway.id);
  const reorderQuestions = useReorderQuestions(pathway.id);
  const bulkApprove = useBulkApproveQuestions(pathway.id);
  const bulkDelete = useBulkDeleteQuestions(pathway.id);
  const updateSection = useUpdatePresentationReviewSection(pathway.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const questions = useMemo(() => sortQuestions(pathway.questions ?? []), [pathway.questions]);
  const approvedCount = questions.filter((q) => approvalStatusLabel(q.status, q.approved) === 'approved').length;
  const needsReviewCount = questions.length - approvedCount;
  const sectionState = parsePresentationReviewState(pathway.presentationReview);
  const library = pathway.libraryReferences ?? [];
  const mappings = pathway.evidenceMappings ?? [];

  useEffect(() => {
    setOrder(questions.map((q) => q.id));
    setSelectedIds((prev) => {
      const valid = new Set(questions.map((q) => q.id));
      const kept = [...prev].filter((id) => valid.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [questions]);

  const questionsById = useMemo(() => {
    const map = new Map<string, ClinicalQuestion>();
    for (const q of questions) map.set(q.id, q);
    return map;
  }, [questions]);

  const orderedQuestions = order
    .map((id) => questionsById.get(id))
    .filter((q): q is ClinicalQuestion => Boolean(q));

  const assessmentSectionOptions: ClinicalSection[] = [
    pathway.sections?.find((s) => s.name === 'diagnosisConfirmation') ?? {
      id: 'virtual:diagnosisConfirmation',
      name: 'diagnosisConfirmation',
      displayName: PRESENTATION_REVIEW_TITLE,
      description: PRESENTATION_REVIEW_SUBTITLE,
      displayOrder: 0,
      isAiGenerated: false,
    },
  ];

  const selectedCount = selectedIds.size;
  const selectedList = useMemo(() => [...selectedIds], [selectedIds]);
  const bulkBusy = bulkApprove.isPending || bulkDelete.isPending;

  const handleApprove = async (question: ClinicalQuestion) => {
    try {
      await updateQuestion.mutateAsync({
        questionId: question.id,
        data: { approved: true, status: 'APPROVED' },
      });
      toast.success('Question approved.');
    } catch {
      toast.error('Could not approve question. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteQuestion.mutateAsync(deleteTarget.id);
      toast.success('Question removed.');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not remove question. Please try again.');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(nextOrder);
    try {
      await reorderQuestions.mutateAsync(nextOrder);
      toast.success('Question order updated.');
    } catch {
      setOrder(order);
      toast.error('Could not reorder questions.');
    }
  };

  const saveQuestionLinks = async (ids: string[]) => {
    if (!linkTarget || linkTarget.kind !== 'question' || !linkTarget.question) return;
    await updateQuestion.mutateAsync({
      questionId: linkTarget.question.id,
      data: { evidenceRefIds: ids },
    });
    toast.success('Evidence links updated. This question needs review.');
  };

  const saveSectionLinks = async (ids: string[]) => {
    await updateSection.mutateAsync({ sectionEvidenceRefIds: ids });
    toast.success('Section sources updated.');
  };

  return (
    <div className="space-y-4">
      <PathwayReadOnlyBanner canEdit={canEdit} />

      <div className={cn('flex flex-col gap-4', evidenceOpen && 'xl:flex-row xl:items-start')}>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{PRESENTATION_REVIEW_TITLE}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{PRESENTATION_REVIEW_SUBTITLE}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && selectedCount > 0 && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void bulkApprove.mutateAsync(selectedList)} disabled={bulkBusy}>
                    {bulkApprove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                    Approve ({selectedCount})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive"
                    onClick={() => setBulkDeleteOpen(true)}
                    disabled={bulkBusy}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete ({selectedCount})
                  </Button>
                </>
              )}
              {needsReviewCount > 0 && questions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void approveAll.mutateAsync()}
                  disabled={!canEdit || approveAll.isPending}
                  title={!canEdit ? lock.title : undefined}
                >
                  {approveAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                  Approve All
                </Button>
              )}
              <ImportFromChatGptButton
                pathway={pathway}
                target="assessment"
                canEdit={canEdit}
                className="h-9 gap-1.5 rounded-lg"
              />
              <Button size="sm" className="h-9 gap-1.5 rounded-lg" onClick={() => setShowAdd(true)} {...lock}>
                <Plus className="h-4 w-4" />
                Add Question
              </Button>
            </div>
          </div>

          {sectionState.duplicateReviewNeeded ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Review for duplicate / overlapping questions. This import used legacy Diagnosis Confirmation and Treatment Eligibility headings.
            </div>
          ) : null}

          {questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16">
              <HelpCircle className="mb-4 h-10 w-10 text-muted-foreground/40" />
              <p className="text-base font-medium text-muted-foreground">No Presentation Review questions yet</p>
              <p className="mt-1 max-w-md text-center text-sm text-muted-foreground/70">
                Import a ChatGPT script or add the minimum questions needed to review whether the presentation is consistent with this pathway.
              </p>
              {canEdit && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <ImportFromChatGptButton pathway={pathway} target="assessment" canEdit={canEdit} />
                  <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
                    <Plus className="h-4 w-4" />
                    Add Question
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card className="overflow-hidden rounded-2xl shadow-none">
              <div className="flex w-full items-center justify-between gap-3 border-b border-border/60 bg-muted/10 px-4 py-2.5 sm:px-5">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm font-semibold">{PRESENTATION_REVIEW_TITLE}</span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {questions.length} question{questions.length === 1 ? '' : 's'} · {approvedCount} approved · {needsReviewCount} needs review
                  </span>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 rounded-lg"
                  onClick={() => setEvidenceOpen((v) => !v)}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Evidence & review
                  {evidenceOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </div>

              {expanded && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => canEdit && void handleDragEnd(event)}>
                  <SortableContext items={order} strategy={verticalListSortingStrategy}>
                    <div className="divide-y divide-border/60">
                      {orderedQuestions.map((question, idx) => (
                        <SortableQuestionRow
                          key={question.id}
                          question={question}
                          index={idx + 1}
                          canEdit={canEdit}
                          selected={selectedIds.has(question.id)}
                          library={library}
                          mappings={mappings}
                          onToggleSelect={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(question.id)) next.delete(question.id);
                              else next.add(question.id);
                              return next;
                            });
                          }}
                          onEdit={() => setEditQuestion(question)}
                          onDelete={() => setDeleteTarget(question)}
                          onApprove={() => void handleApprove(question)}
                          onLink={() => setLinkTarget({ kind: 'question', question })}
                          onManageLibrary={() => onOpenReferencesTab?.()}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </Card>
          )}

          <AdminGuide />
        </div>

        {evidenceOpen ? (
          <EvidenceReviewPanel
            pathway={pathway}
            questionIdsInOrder={order}
            onClose={() => setEvidenceOpen(false)}
            onManageReferences={() => onOpenReferencesTab?.()}
            onLinkSectionSources={() => setLinkTarget({ kind: 'section' })}
            canEdit={canEdit}
          />
        ) : null}
      </div>

      <AddQuestionModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        pathwayId={pathway.id}
        sections={assessmentSectionOptions}
        preferredSectionName="diagnosisConfirmation"
      />

      {editQuestion && (
        <EditQuestionModal
          open={!!editQuestion}
          onClose={() => setEditQuestion(null)}
          pathwayId={pathway.id}
          question={editQuestion}
          sections={assessmentSectionOptions}
        />
      )}

      <LinkReferenceDialog
        open={!!linkTarget}
        onClose={() => setLinkTarget(null)}
        title={linkTarget?.kind === 'section' ? 'Link section sources' : 'Link reference'}
        library={library}
        selectedIds={
          linkTarget?.kind === 'section'
            ? sectionState.sectionEvidenceRefIds
            : linkTarget?.question?.evidenceRefIds ?? []
        }
        canEdit={canEdit}
        saving={updateQuestion.isPending || updateSection.isPending}
        onSave={linkTarget?.kind === 'section' ? saveSectionLinks : saveQuestionLinks}
        onManageLibrary={() => {
          setLinkTarget(null);
          onOpenReferencesTab?.();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove this question?"
        description={`Remove "${deleteTarget?.question}"? This cannot be undone.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteQuestion.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Remove ${selectedCount} question${selectedCount === 1 ? '' : 's'}?`}
        description="Selected questions will be permanently removed from this pathway."
        confirmLabel="Remove selected"
        variant="destructive"
        onConfirm={async () => {
          try {
            const res = (await bulkDelete.mutateAsync(selectedList)) as { count?: number };
            toast.success(`${res.count ?? selectedList.length} question(s) removed.`);
            setSelectedIds(new Set());
            setBulkDeleteOpen(false);
          } catch {
            toast.error('Could not remove selected questions.');
          }
        }}
        loading={bulkDelete.isPending}
      />
    </div>
  );
}

function SortableQuestionRow({
  question,
  index,
  canEdit,
  selected,
  library,
  mappings,
  onToggleSelect,
  onEdit,
  onDelete,
  onApprove,
  onLink,
  onManageLibrary,
}: {
  question: ClinicalQuestion;
  index: number;
  canEdit: boolean;
  selected: boolean;
  library: ClinicalPathway['libraryReferences'];
  mappings?: ClinicalPathway['evidenceMappings'];
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onLink: () => void;
  onManageLibrary: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
    disabled: !canEdit,
  });

  const approval = approvalStatusLabel(question.status, question.approved);
  const linkedIds = uniqueIdList([
    ...(question.evidenceRefIds ?? []),
    ...((mappings ?? [])
      .filter((m) => m.mappingType === 'question' && m.targetId === question.id)
      .map((m) => m.referenceId)),
  ]);
  const linked = library?.filter((ref) => linkedIds.includes(ref.id)) ?? [];
  const rule =
    parseVisibilityRule(question.visibilityRule) ??
    (question.section?.name === 'additionalAssessment' && question.section.visibility
      ? {
          sourceField: 'demographics.sex',
          operator: 'eq',
          value: matchVisibilityPresetId(question.section.visibility),
          label:
            matchVisibilityPresetId(question.section.visibility) === 'always'
              ? undefined
              : `Shown only if ${matchVisibilityPresetId(question.section.visibility)} is documented.`,
        }
      : null);
  const conditionLabel = formatVisibilityLabel(rule);
  const evidenceLabel = evidenceCountLabel(linked.length);
  const unlinked = linked.length === 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group px-4 py-4 sm:px-5',
        selected && 'bg-primary/[0.03]',
        isDragging && 'z-10 rounded-lg border border-primary/30 bg-card shadow-md',
      )}
    >
      <div className="flex items-start gap-2.5">
        {canEdit && (
          <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border accent-primary opacity-0 transition-opacity group-hover:opacity-100 checked:opacity-100"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Select question ${index}`}
            />
          </div>
        )}
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {index}
        </span>

        <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-snug text-foreground">{question.question}</p>
            {question.description ? (
              <p className="mt-1.5 text-[13px] italic leading-relaxed text-primary">
                <span className="font-semibold not-italic text-foreground/80">Why it matters: </span>
                {question.description}
              </p>
            ) : null}
            {question.helpText ? (
              <p className="mt-1 text-[12.5px] italic leading-relaxed text-muted-foreground">
                <span className="font-medium not-italic text-foreground/70">Pharmacist tip: </span>
                {question.helpText}
              </p>
            ) : null}
            {conditionLabel ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  Conditional
                </span>
                <span className="text-[12px] text-muted-foreground">{conditionLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  approval === 'approved'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-800',
                )}
              >
                {approval === 'approved' ? <Check className="h-3 w-3" /> : null}
                {approval === 'approved' ? 'Approved' : 'Needs review'}
              </span>
              <span className="text-[12px] text-muted-foreground">{TYPE_LABELS[question.type] ?? question.type}</span>
              {question.required ? <span className="text-[12px] font-medium text-muted-foreground">Required</span> : null}
              {canEdit ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 px-0" aria-label="Question actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {approval !== 'approved' ? (
                      <DropdownMenuItem onClick={onApprove}>
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] lg:justify-end">
              <span className={cn('font-medium', unlinked ? 'text-amber-700' : 'text-muted-foreground')}>
                {evidenceLabel}
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-3" align="end">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">Linked evidence</p>
                    <PopoverClose className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                      <X className="h-3.5 w-3.5" />
                    </PopoverClose>
                  </div>
                  {linked.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No references linked to this question yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2.5">
                      {linked.map((ref) => (
                        <li key={ref.id} className="flex items-start gap-2">
                          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span>
                            <span className="block text-[13px] font-medium leading-snug">{citationDisplay(ref)}</span>
                            <span className="block text-[11.5px] text-muted-foreground">{editionLabel(ref)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={onManageLibrary}
                    className="mt-3 text-[12px] font-semibold text-primary hover:underline"
                  >
                    Manage in References & Governance →
                  </button>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                className="inline-flex items-center font-semibold text-primary hover:underline disabled:opacity-50"
                onClick={onLink}
                disabled={!canEdit}
              >
                + Link reference
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminGuide() {
  const steps = [
    { n: '1', title: 'View question evidence', body: 'Click “View” to see linked references for a question.' },
    { n: '2', title: 'Link existing reference', body: 'Click “+ Link reference” to connect a reference from your library.' },
    { n: '3', title: 'Open section Evidence & review', body: 'Click the “Evidence & review” button to see section sources, reviewers, and version history.' },
    { n: '4', title: 'Import from ChatGPT', body: 'Draft questions with assistive import (admin review required). Do not import invented references.' },
    { n: '5', title: 'Add manual question', body: 'Click “+ Add Question” to create a new question.' },
  ];
  return (
    <div className="rounded-2xl border border-border bg-muted/20 px-5 py-4">
      <p className="text-sm font-semibold">Interactive behaviour (admin guide)</p>
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        {steps.map((step) => (
          <div key={step.n} className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {step.n}
            </span>
            <div>
              <p className="text-[12.5px] font-semibold leading-snug">{step.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
