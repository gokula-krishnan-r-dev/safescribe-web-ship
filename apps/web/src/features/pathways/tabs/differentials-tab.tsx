'use client';

import { useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Plus,
  Pencil,
  Trash2,
  Stethoscope,
  GitCompareArrows,
  ListChecks,
  ArrowRight,
  Info,
  CircleHelp,
  Eye,
  MoreHorizontal,
  Copy,
  ArrowUp,
  ArrowDown,
  BookOpen,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  citationDisplay,
  editionLabel,
  evidenceCountLabel,
  uniqueIdList,
} from '@safescript/shared';
import type {
  ClinicalPathway,
  DifferentialDiagnosis,
  DifferentialLikelihood,
  PathwayEvidenceLibraryReference,
} from '../types';
import { useUpdateDifferentials } from '../hooks';
import { PathwayReadOnlyBanner, editLockProps } from '../pathway-edit-lock';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import { LinkReferenceDialog } from '../presentation-review/link-reference-dialog';
import {
  PathwayBulkToolbar,
  PathwayDragHandle,
  PathwaySelectCheckbox,
  PathwaySortableList,
  sortableRowClassName,
  usePathwayOrder,
  usePathwaySelection,
  usePathwaySortableRow,
} from '../components/pathway-sortable-list';
import { DifferentialsEvidenceReviewDrawer } from '../differentials/evidence-review-drawer';
import { DifferentialEditor, type DifferentialFormData } from '../differentials/differential-editor';
import {
  DIFFERENTIALS_BANNER,
  DIFFERENTIALS_SUBTITLE,
  duplicateDifferentialTitle,
  linkedIdsForDifferential,
  sectionEvidenceIds,
  toDifferentialPayload,
} from '../differentials/utils';

const LIKELIHOOD_CONFIG: Record<
  DifferentialLikelihood,
  { label: string; badge: string }
> = {
  COMMON: {
    label: 'COMMON',
    badge: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  LESS_COMMON: {
    label: 'LESS COMMON',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  RARE: {
    label: 'RARE',
    badge: 'bg-violet-50 text-violet-800 border-violet-200',
  },
};

export function DifferentialsTab({
  pathway,
  canEdit,
  onOpenReferencesTab,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
  onOpenReferencesTab?: () => void;
}) {
  const items = pathway.differentials ?? [];
  const library = pathway.libraryReferences ?? [];
  const mappings = pathway.evidenceMappings ?? [];
  const updateDifferentials = useUpdateDifferentials(pathway.id);
  const lock = editLockProps(canEdit);

  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DifferentialDiagnosis | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DifferentialDiagnosis | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [openViewId, setOpenViewId] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<{
    kind: 'item' | 'section';
    item?: DifferentialDiagnosis;
  } | null>(null);

  const itemIds = items.map((d) => d.id);
  const { selectedIds, selectedList, count: selectedCount, toggle, toggleAll, clear } =
    usePathwaySelection(itemIds);
  const { order, orderedItems, handleDragEnd } = usePathwayOrder(items);

  const persist = async (
    next: DifferentialDiagnosis[],
    extra?: { sectionEvidenceRefIds?: string[] },
  ) => {
    await updateDifferentials.mutateAsync({
      differentials: next.map(toDifferentialPayload),
      sectionEvidenceRefIds: extra?.sectionEvidenceRefIds,
    });
  };

  const handleSave = async (data: DifferentialFormData) => {
    try {
      const entry: DifferentialDiagnosis = {
        id: editing?.id ?? '',
        condition: data.condition.trim(),
        question: data.question?.trim() || null,
        whyItMatters: data.whyItMatters?.trim() || null,
        suggestedPathway: data.suggestedPathway?.trim() || null,
        likelihood: data.likelihood,
        keySymptoms: data.keySymptoms?.trim() || null,
        distinguishingFeatures: data.distinguishingFeatures?.trim() || null,
        recommendedAction: data.recommendedAction?.trim() || null,
        required: data.required,
        approved: false,
        evidenceRefIds: editing?.evidenceRefIds ?? [],
        source: editing?.source ?? 'USER',
      };
      const next = editing
        ? items.map((d) => (d.id === editing.id ? entry : d))
        : [...items, entry];
      await persist(next);
      toast.success(editing ? 'Condition updated.' : 'Condition added.');
      setEditorOpen(false);
      setEditing(null);
    } catch {
      toast.error('Could not save condition. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await persist(items.filter((d) => d.id !== deleteTarget.id));
      toast.success('Condition removed.');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not remove condition. Please try again.');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedList.length) return;
    try {
      const remove = new Set(selectedList);
      await persist(items.filter((d) => !remove.has(d.id)));
      toast.success(`${selectedList.length} condition(s) removed.`);
      clear();
      setBulkDeleteOpen(false);
    } catch {
      toast.error('Could not remove selected conditions.');
    }
  };

  const handleDuplicate = async (item: DifferentialDiagnosis) => {
    const copy: DifferentialDiagnosis = {
      ...item,
      id: '',
      condition: duplicateDifferentialTitle(item.condition),
      approved: false,
      source: 'USER',
      evidenceRefIds: [...(item.evidenceRefIds ?? [])],
    };
    const index = items.findIndex((d) => d.id === item.id);
    const next = [...items];
    next.splice(index + 1, 0, copy);
    try {
      await persist(next);
      toast.success('Condition duplicated. The copy needs review.');
    } catch {
      toast.error('Could not duplicate condition.');
    }
  };

  const moveItem = async (item: DifferentialDiagnosis, direction: -1 | 1) => {
    const index = orderedItems.findIndex((d) => d.id === item.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedItems.length) return;
    const next = [...orderedItems];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    try {
      await persist(next);
      toast.success('Condition order updated.');
    } catch {
      toast.error('Could not reorder conditions.');
    }
  };

  const onDragEnd = async (event: Parameters<typeof handleDragEnd>[0]) => {
    try {
      await handleDragEnd(event, async (nextOrder) => {
        const byId = new Map(items.map((d) => [d.id, d]));
        const reordered = nextOrder
          .map((id) => byId.get(id))
          .filter((d): d is DifferentialDiagnosis => Boolean(d));
        await persist(reordered);
        toast.success('Condition order updated.');
      });
    } catch {
      toast.error('Could not reorder conditions.');
    }
  };

  const saveItemLinks = async (ids: string[]) => {
    if (!linkTarget?.item) return;
    const next = items.map((d) =>
      d.id === linkTarget.item!.id
        ? { ...d, evidenceRefIds: uniqueIdList(ids), approved: false }
        : d,
    );
    const count = uniqueIdList(ids).length;
    try {
      await persist(next);
      toast.success('References linked', {
        announce: true,
        description: `${count} reference${count === 1 ? '' : 's'} linked to this differential.`,
      });
    } catch {
      toast.error('Could not link references. Please try again.');
      throw new Error('link-failed');
    }
  };

  const saveSectionLinks = async (ids: string[]) => {
    const count = uniqueIdList(ids).length;
    try {
      await persist(items, { sectionEvidenceRefIds: uniqueIdList(ids) });
      toast.success('References linked', {
        announce: true,
        description: `${count} reference${count === 1 ? '' : 's'} linked to this section.`,
      });
    } catch {
      toast.error('Could not link references. Please try again.');
      throw new Error('link-failed');
    }
  };

  const openAdd = () => {
    if (!canEdit) return;
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (item: DifferentialDiagnosis) => {
    if (!canEdit) return;
    setEditing(item);
    setEditorOpen(true);
  };

  const allSelected = order.length > 0 && order.every((id) => selectedIds.has(id));
  const someSelected = order.some((id) => selectedIds.has(id));
  const sectionIds = sectionEvidenceIds(mappings);

  return (
    <div className="space-y-4">
      <PathwayReadOnlyBanner canEdit={canEdit} />
      <div className={cn('flex flex-col gap-4', evidenceOpen && 'xl:flex-row xl:items-start')}>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xl font-semibold tracking-tight">Differential Review</h2>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label="About differential review"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Alternative conditions to consider and rule out before proceeding through this
                      pathway.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{DIFFERENTIALS_SUBTITLE}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && selectedCount > 0 && (
                <PathwayBulkToolbar
                  count={selectedCount}
                  showApprove={false}
                  onDelete={() => setBulkDeleteOpen(true)}
                  onClear={clear}
                  deletePending={updateDifferentials.isPending}
                />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg"
                onClick={() => setEvidenceOpen((v) => !v)}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Evidence & review
                {evidenceOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
              <ImportFromChatGptButton
                pathway={pathway}
                target="differentials"
                canEdit={canEdit}
                className="h-9 gap-1.5 rounded-lg"
              />
              <Button size="sm" className="h-9 gap-1.5 rounded-lg" onClick={openAdd} {...lock}>
                <Plus className="h-4 w-4" />
                Add Condition
              </Button>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p>{DIFFERENTIALS_BANNER}</p>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16">
              <Stethoscope className="mb-4 h-10 w-10 text-muted-foreground/40" />
              <p className="text-base font-medium text-muted-foreground">No differentials yet</p>
              <p className="mt-1 max-w-md text-center text-sm text-muted-foreground/70">
                Add alternative conditions the pharmacist should consider and rule out.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <ImportFromChatGptButton pathway={pathway} target="differentials" canEdit={canEdit} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd} {...lock}>
                  <Plus className="h-4 w-4" />
                  Add Condition
                </Button>
              </div>
            </div>
          ) : (
            <Card className="overflow-hidden rounded-2xl shadow-none">
              <div className="flex items-center gap-3 border-b border-border/60 bg-muted/10 px-5 py-3">
                {canEdit && (
                  <PathwaySelectCheckbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={() => toggleAll(order)}
                    label={allSelected ? 'Deselect all differentials' : 'Select all differentials'}
                  />
                )}
                <span className="text-sm font-semibold">Screening order</span>
                <span className="text-xs text-muted-foreground">
                  Drag to set the order shown during consultation
                </span>
                <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                  Click ··· for more options
                </span>
              </div>
              <div className="divide-y divide-border/50">
                <PathwaySortableList ids={order} canEdit={canEdit} onDragEnd={(e) => void onDragEnd(e)}>
                  {orderedItems.map((item, idx) => (
                    <SortableDifferentialRow
                      key={item.id}
                      item={item}
                      index={idx + 1}
                      isFirst={idx === 0}
                      isLast={idx === orderedItems.length - 1}
                      canEdit={canEdit}
                      selected={selectedIds.has(item.id)}
                      library={library}
                      linkedIds={linkedIdsForDifferential(item, mappings)}
                      whyOpen={openWhyId === item.id}
                      viewOpen={openViewId === item.id}
                      onWhyOpenChange={(open) => {
                        setOpenWhyId(open ? item.id : null);
                        if (open) setOpenViewId(null);
                      }}
                      onViewOpenChange={(open) => {
                        setOpenViewId(open ? item.id : null);
                        if (open) setOpenWhyId(null);
                      }}
                      onToggleSelect={() => toggle(item.id)}
                      onEdit={() => openEdit(item)}
                      onDelete={() => setDeleteTarget(item)}
                      onDuplicate={() => void handleDuplicate(item)}
                      onMoveUp={() => void moveItem(item, -1)}
                      onMoveDown={() => void moveItem(item, 1)}
                      onLink={() => setLinkTarget({ kind: 'item', item })}
                      onManageLibrary={() => onOpenReferencesTab?.()}
                      onViewFullReferences={() => {
                        setOpenWhyId(null);
                        setOpenViewId(item.id);
                      }}
                    />
                  ))}
                </PathwaySortableList>
              </div>
            </Card>
          )}
        </div>

        {evidenceOpen ? (
          <DifferentialsEvidenceReviewDrawer
            pathway={pathway}
            items={items}
            canEdit={canEdit}
            onClose={() => setEvidenceOpen(false)}
            onManageReferences={() => onOpenReferencesTab?.()}
            onLinkSectionSources={() => setLinkTarget({ kind: 'section' })}
          />
        ) : null}
      </div>

      <DifferentialEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        item={editing}
        onSave={(data) => void handleSave(data)}
        saving={updateDifferentials.isPending}
      />

      <LinkReferenceDialog
        open={!!linkTarget}
        onClose={() => setLinkTarget(null)}
        title={
          linkTarget?.kind === 'section'
            ? 'Link section sources'
            : 'Link reference to this differential'
        }
        description="Select references from the References & Governance library. Citation metadata is edited there, not on this differential."
        searchPlaceholder="Search references by title, keyword, or organization..."
        saveLabel={(count) => `Link selected (${count})`}
        showManageInFooter={false}
        library={library}
        selectedIds={
          linkTarget?.kind === 'section'
            ? sectionIds
            : linkTarget?.item
              ? linkedIdsForDifferential(linkTarget.item, mappings)
              : []
        }
        canEdit={canEdit}
        saving={updateDifferentials.isPending}
        onSave={linkTarget?.kind === 'section' ? saveSectionLinks : saveItemLinks}
        onManageLibrary={() => {
          setLinkTarget(null);
          onOpenReferencesTab?.();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this differential?"
        description="This removes the condition from the current pathway draft. Historical versions remain available."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={updateDifferentials.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedCount} condition${selectedCount === 1 ? '' : 's'}?`}
        description="Selected conditions will be removed from the current pathway draft. Historical versions will remain available."
        confirmLabel="Delete selected"
        variant="destructive"
        onConfirm={handleBulkDelete}
        loading={updateDifferentials.isPending}
      />
    </div>
  );
}

function SortableDifferentialRow({
  item,
  index,
  isFirst,
  isLast,
  canEdit,
  selected,
  library,
  linkedIds,
  whyOpen,
  viewOpen,
  onWhyOpenChange,
  onViewOpenChange,
  onToggleSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onLink,
  onManageLibrary,
  onViewFullReferences,
}: {
  item: DifferentialDiagnosis;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  selected: boolean;
  library: PathwayEvidenceLibraryReference[];
  linkedIds: string[];
  whyOpen: boolean;
  viewOpen: boolean;
  onWhyOpenChange: (open: boolean) => void;
  onViewOpenChange: (open: boolean) => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onLink: () => void;
  onManageLibrary: () => void;
  onViewFullReferences: () => void;
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = usePathwaySortableRow(
    item.id,
    !canEdit,
  );
  const likelihood = item.likelihood ? LIKELIHOOD_CONFIG[item.likelihood] : null;
  const linked = library.filter((ref) => linkedIds.includes(ref.id));
  const evidenceLabel = evidenceCountLabel(linked.length);
  const whyText =
    item.whyItMatters?.trim() ||
    'No rationale has been recorded for this differential yet.';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={sortableRowClassName({ selected, isDragging })}
    >
      <PathwayDragHandle listeners={listeners} attributes={attributes} disabled={!canEdit} />
      {canEdit && (
        <PathwaySelectCheckbox
          checked={selected}
          onChange={onToggleSelect}
          label={`Select differential ${index}`}
          className="mt-2"
        />
      )}
      <span className="mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-xs font-bold text-muted-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border/80 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold leading-snug">{item.condition}</p>
                {likelihood ? (
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      likelihood.badge,
                    )}
                  >
                    {likelihood.label}
                  </span>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={onEdit}
                    aria-label="Edit differential"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    onClick={onDelete}
                    aria-label="Delete differential"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="More differential actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem className="gap-2" onClick={onEdit}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={onDuplicate}>
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={onMoveUp} disabled={isFirst}>
                        <ArrowUp className="h-3.5 w-3.5" />
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2" onClick={onMoveDown} disabled={isLast}>
                        <ArrowDown className="h-3.5 w-3.5" />
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-destructive" onClick={onDelete}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>

            {item.question?.trim() ? (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground/85">Question: </span>
                {item.question}
              </p>
            ) : null}

            {item.whyItMatters?.trim() ? (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground/85">Why it matters: </span>
                {item.whyItMatters}
              </p>
            ) : null}

            {item.suggestedPathway?.trim() ? (
              <p className="flex items-start gap-1.5 text-[13.5px] font-medium text-primary">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>If yes → {item.suggestedPathway}</span>
              </p>
            ) : null}

            {item.keySymptoms?.trim() ? (
              <p className="flex items-start gap-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                <span>
                  <span className="font-semibold text-foreground/85">Key symptoms: </span>
                  {item.keySymptoms}
                </span>
              </p>
            ) : null}

            {item.distinguishingFeatures?.trim() ? (
              <p className="flex items-start gap-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                <GitCompareArrows className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                <span>
                  <span className="font-semibold text-foreground/85">How to distinguish: </span>
                  {item.distinguishingFeatures}
                </span>
              </p>
            ) : null}

            {item.recommendedAction?.trim() ? (
              <p className="flex items-start gap-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                <span>
                  <span className="font-semibold text-foreground/85">Suggested next step: </span>
                  {item.recommendedAction}
                </span>
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[12.5px]">
              <Popover open={whyOpen} onOpenChange={onWhyOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-primary hover:bg-primary/5"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                    Why?
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-3.5" align="start">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">Why this matters</p>
                    <PopoverClose className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                      <X className="h-3.5 w-3.5" />
                    </PopoverClose>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{whyText}</p>
                  <p className="mt-3 text-[12px] font-semibold">Key references</p>
                  {linked.length === 0 ? (
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                      No references linked to this differential yet.
                    </p>
                  ) : (
                    <ol className="mt-1.5 space-y-1.5">
                      {linked.slice(0, 3).map((ref, i) => (
                        <li key={ref.id} className="text-[12.5px] leading-snug">
                          <span className="text-muted-foreground">{i + 1}. </span>
                          {citationDisplay(ref)}
                        </li>
                      ))}
                    </ol>
                  )}
                  <button
                    type="button"
                    onClick={onViewFullReferences}
                    className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    View full references →
                  </button>
                </PopoverContent>
              </Popover>
              <span
                className={cn(
                  'font-medium',
                  linked.length === 0 ? 'text-amber-700' : 'text-muted-foreground',
                )}
              >
                {evidenceLabel}
              </span>
              <Popover open={viewOpen} onOpenChange={onViewOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-3" align="start">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">Linked evidence</p>
                    <PopoverClose className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                      <X className="h-3.5 w-3.5" />
                    </PopoverClose>
                  </div>
                  {linked.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No references linked to this differential yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2.5">
                      {linked.map((ref) => (
                        <li key={ref.id}>
                          <span className="block text-[13px] font-medium leading-snug">
                            {citationDisplay(ref)}
                          </span>
                          <span className="block text-[11.5px] text-muted-foreground">
                            {editionLabel(ref)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={onLink}
                      className="mt-3 block text-[12px] font-semibold text-primary hover:underline"
                    >
                      + Link reference
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onManageLibrary}
                    className="mt-2 text-[12px] font-semibold text-primary hover:underline"
                  >
                    Manage in References & Governance →
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
