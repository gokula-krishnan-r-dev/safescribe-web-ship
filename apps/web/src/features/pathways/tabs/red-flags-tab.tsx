'use client';

import { useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Plus,
  Pencil,
  Trash2,
  ShieldAlert,
  ShieldX,
  Siren,
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
import type { ClinicalPathway, PathwayEvidenceLibraryReference, RedFlag, RedFlagSeverity } from '../types';
import { useUpdateRedFlags } from '../hooks';
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
import { RedFlagsEvidenceReviewDrawer } from '../red-flags/evidence-review-drawer';
import { RedFlagEditor, type RedFlagFormData } from '../red-flags/red-flag-editor';
import {
  RED_FLAGS_BANNER,
  RED_FLAGS_SUBTITLE,
  actionLabel,
  duplicateRedFlagTitle,
  linkedIdsForRedFlag,
  redFlagQuestionText,
  sectionEvidenceIds,
  toRedFlagPayload,
} from '../red-flags/utils';

const SEVERITY_CONFIG: Record<
  RedFlagSeverity,
  { label: string; card: string; badge: string; iconWrap: string; icon: typeof ShieldAlert }
> = {
  EMERGENCY: {
    label: 'Emergency',
    card: 'border-red-100 bg-red-50/40',
    badge: 'bg-red-100 text-red-800 border-red-200',
    iconWrap: 'bg-red-600 text-white',
    icon: Siren,
  },
  CRITICAL: {
    label: 'Critical',
    card: 'border-red-100 bg-white',
    badge: 'bg-red-100 text-red-700 border-red-200',
    iconWrap: 'bg-red-600 text-white',
    icon: ShieldX,
  },
  WARNING: {
    label: 'Warning',
    card: 'border-amber-100 bg-white',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    iconWrap: 'bg-amber-500 text-white',
    icon: ShieldAlert,
  },
};

export function RedFlagsTab({
  pathway,
  canEdit,
  onOpenReferencesTab,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
  onOpenReferencesTab?: () => void;
}) {
  const flags = pathway.redFlags ?? [];
  const library = pathway.libraryReferences ?? [];
  const mappings = pathway.evidenceMappings ?? [];
  const updateRedFlags = useUpdateRedFlags(pathway.id);
  const lock = editLockProps(canEdit);

  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RedFlag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RedFlag | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [openViewId, setOpenViewId] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ kind: 'item' | 'section'; flag?: RedFlag } | null>(
    null,
  );

  const flagIds = flags.map((f) => f.id);
  const { selectedIds, selectedList, count: selectedCount, toggle, toggleAll, clear } =
    usePathwaySelection(flagIds);
  const { order, orderedItems, handleDragEnd } = usePathwayOrder(flags);

  const persist = async (
    next: RedFlag[],
    extra?: { sectionEvidenceRefIds?: string[] },
  ) => {
    await updateRedFlags.mutateAsync({
      redFlags: next.map(toRedFlagPayload),
      sectionEvidenceRefIds: extra?.sectionEvidenceRefIds,
    });
  };

  const handleSave = async (data: RedFlagFormData) => {
    try {
      const question = data.question.trim();
      const entry: RedFlag = {
        id: editing?.id ?? '',
        title: data.title.trim(),
        severity: data.severity,
        question,
        description: question,
        whyItMatters: data.whyItMatters?.trim() || null,
        actionNote: data.actionNote?.trim() || null,
        action: data.action,
        required: data.required,
        approved: false,
        evidenceRefIds: editing?.evidenceRefIds ?? [],
        source: editing?.source ?? 'USER',
      };
      const next = editing
        ? flags.map((f) => (f.id === editing.id ? entry : f))
        : [...flags, entry];
      await persist(next);
      toast.success(editing ? 'Red flag updated.' : 'Red flag added.');
      setEditorOpen(false);
      setEditing(null);
    } catch {
      toast.error('Could not save red flag. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await persist(flags.filter((f) => f.id !== deleteTarget.id));
      toast.success('Red flag removed.');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not remove red flag. Please try again.');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedList.length) return;
    try {
      const remove = new Set(selectedList);
      await persist(flags.filter((f) => !remove.has(f.id)));
      toast.success(`${selectedList.length} red flag(s) removed.`);
      clear();
      setBulkDeleteOpen(false);
    } catch {
      toast.error('Could not remove selected red flags.');
    }
  };

  const handleDuplicate = async (flag: RedFlag) => {
    const copy: RedFlag = {
      ...flag,
      id: '',
      title: duplicateRedFlagTitle(flag.title),
      approved: false,
      source: 'USER',
      evidenceRefIds: [...(flag.evidenceRefIds ?? [])],
    };
    const index = flags.findIndex((f) => f.id === flag.id);
    const next = [...flags];
    next.splice(index + 1, 0, copy);
    try {
      await persist(next);
      toast.success('Red flag duplicated. The copy needs review.');
    } catch {
      toast.error('Could not duplicate red flag.');
    }
  };

  const moveFlag = async (flag: RedFlag, direction: -1 | 1) => {
    const index = orderedItems.findIndex((f) => f.id === flag.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedItems.length) return;
    const next = [...orderedItems];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    try {
      await persist(next);
      toast.success('Red flag order updated.');
    } catch {
      toast.error('Could not reorder red flags.');
    }
  };

  const onDragEnd = async (event: Parameters<typeof handleDragEnd>[0]) => {
    try {
      await handleDragEnd(event, async (nextOrder) => {
        const byId = new Map(flags.map((f) => [f.id, f]));
        const reordered = nextOrder
          .map((id) => byId.get(id))
          .filter((f): f is RedFlag => Boolean(f));
        await persist(reordered);
        toast.success('Red flag order updated.');
      });
    } catch {
      toast.error('Could not reorder red flags.');
    }
  };

  const saveItemLinks = async (ids: string[]) => {
    if (!linkTarget?.flag) return;
    const next = flags.map((f) =>
      f.id === linkTarget.flag!.id ? { ...f, evidenceRefIds: uniqueIdList(ids), approved: false } : f,
    );
    const count = uniqueIdList(ids).length;
    try {
      await persist(next);
      toast.success('References linked', {
        announce: true,
        description: `${count} reference${count === 1 ? '' : 's'} linked to this red flag.`,
      });
    } catch {
      toast.error('Could not link references. Please try again.');
      throw new Error('link-failed');
    }
  };

  const saveSectionLinks = async (ids: string[]) => {
    const count = uniqueIdList(ids).length;
    try {
      await persist(flags, { sectionEvidenceRefIds: uniqueIdList(ids) });
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
  const openEdit = (flag: RedFlag) => {
    if (!canEdit) return;
    setEditing(flag);
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
                <h2 className="text-xl font-semibold tracking-tight">Red Flags</h2>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label="About red flags"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Screening questions that identify warning signs requiring urgent action, referral,
                      or stopping pharmacist treatment.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{RED_FLAGS_SUBTITLE}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && selectedCount > 0 && (
                <PathwayBulkToolbar
                  count={selectedCount}
                  showApprove={false}
                  onDelete={() => setBulkDeleteOpen(true)}
                  onClear={clear}
                  deletePending={updateRedFlags.isPending}
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
                target="red-flags"
                canEdit={canEdit}
                className="h-9 gap-1.5 rounded-lg"
              />
              <Button size="sm" className="h-9 gap-1.5 rounded-lg" onClick={openAdd} {...lock}>
                <Plus className="h-4 w-4" />
                Add Red Flag
              </Button>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <p>{RED_FLAGS_BANNER}</p>
          </div>

          {flags.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-16">
              <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground/40" />
              <p className="text-base font-medium text-muted-foreground">No red flags yet</p>
              <p className="mt-1 max-w-md text-center text-sm text-muted-foreground/70">
                Add warning signs the pharmacist must watch for during this pathway.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <ImportFromChatGptButton pathway={pathway} target="red-flags" canEdit={canEdit} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd} {...lock}>
                  <Plus className="h-4 w-4" />
                  Add Red Flag
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
                    label={allSelected ? 'Deselect all red flags' : 'Select all red flags'}
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
                  {orderedItems.map((flag, idx) => (
                    <SortableRedFlagRow
                      key={flag.id}
                      flag={flag}
                      index={idx + 1}
                      isFirst={idx === 0}
                      isLast={idx === orderedItems.length - 1}
                      canEdit={canEdit}
                      selected={selectedIds.has(flag.id)}
                      library={library}
                      linkedIds={linkedIdsForRedFlag(flag, mappings)}
                      whyOpen={openWhyId === flag.id}
                      viewOpen={openViewId === flag.id}
                      onWhyOpenChange={(open) => {
                        setOpenWhyId(open ? flag.id : null);
                        if (open) setOpenViewId(null);
                      }}
                      onViewOpenChange={(open) => {
                        setOpenViewId(open ? flag.id : null);
                        if (open) setOpenWhyId(null);
                      }}
                      onToggleSelect={() => toggle(flag.id)}
                      onEdit={() => openEdit(flag)}
                      onDelete={() => setDeleteTarget(flag)}
                      onDuplicate={() => void handleDuplicate(flag)}
                      onMoveUp={() => void moveFlag(flag, -1)}
                      onMoveDown={() => void moveFlag(flag, 1)}
                      onLink={() => {
                        setOpenViewId(null);
                        setOpenWhyId(null);
                        window.setTimeout(() => setLinkTarget({ kind: 'item', flag }), 50);
                      }}
                      onManageLibrary={() => onOpenReferencesTab?.()}
                      onViewFullReferences={() => {
                        setOpenWhyId(null);
                        setOpenViewId(flag.id);
                      }}
                    />
                  ))}
                </PathwaySortableList>
              </div>
            </Card>
          )}
        </div>

        {evidenceOpen ? (
          <RedFlagsEvidenceReviewDrawer
            pathway={pathway}
            flags={flags}
            canEdit={canEdit}
            onClose={() => setEvidenceOpen(false)}
            onManageReferences={() => onOpenReferencesTab?.()}
            onLinkSectionSources={() => {
              setOpenViewId(null);
              setOpenWhyId(null);
              window.setTimeout(() => setLinkTarget({ kind: 'section' }), 50);
            }}
          />
        ) : null}
      </div>

      <RedFlagEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        flag={editing}
        onSave={(data) => void handleSave(data)}
        saving={updateRedFlags.isPending}
      />

      <LinkReferenceDialog
        open={!!linkTarget}
        onClose={() => setLinkTarget(null)}
        title={
          linkTarget?.kind === 'section'
            ? 'Link section sources'
            : 'Link reference to this red flag'
        }
        description="Select references from the References & Governance library. Citation metadata is edited there, not on this red flag."
        searchPlaceholder="Search references by title, keyword, or organization..."
        saveLabel={(count) => `Link selected (${count})`}
        showManageInFooter={false}
        library={library}
        selectedIds={
          linkTarget?.kind === 'section'
            ? sectionIds
            : linkTarget?.flag
              ? linkedIdsForRedFlag(linkTarget.flag, mappings)
              : []
        }
        canEdit={canEdit}
        saving={updateRedFlags.isPending}
        onSave={linkTarget?.kind === 'section' ? saveSectionLinks : saveItemLinks}
        onManageLibrary={() => {
          setLinkTarget(null);
          onOpenReferencesTab?.();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this red flag?"
        description="This will remove the red flag from the current pathway draft. Historical versions will remain available."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={updateRedFlags.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedCount} red flag${selectedCount === 1 ? '' : 's'}?`}
        description="Selected red flags will be removed from the current pathway draft. Historical versions will remain available."
        confirmLabel="Delete selected"
        variant="destructive"
        onConfirm={handleBulkDelete}
        loading={updateRedFlags.isPending}
      />
    </div>
  );
}

function SortableRedFlagRow({
  flag,
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
  flag: RedFlag;
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
  const conf = SEVERITY_CONFIG[flag.severity] ?? SEVERITY_CONFIG.WARNING;
  const Icon = conf.icon;
  const { attributes, listeners, setNodeRef, style, isDragging } = usePathwaySortableRow(
    flag.id,
    !canEdit,
  );
  const question = redFlagQuestionText(flag);
  const linked = library.filter((ref) => linkedIds.includes(ref.id));
  const evidenceLabel = evidenceCountLabel(linked.length);
  const unlinked = linked.length === 0;
  const whyText =
    flag.whyItMatters?.trim() ||
    'No rationale has been recorded for this red flag yet.';

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
          label={`Select red flag ${index}`}
          className="mt-2"
        />
      )}
      <span className="mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-bold text-muted-foreground">
        {index}
      </span>
      <div className={cn('min-w-0 flex-1 rounded-xl border px-4 py-3.5', conf.card)}>
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', conf.iconWrap)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold leading-snug">{flag.title}</p>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    conf.badge,
                  )}
                >
                  {conf.label}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Popover open={whyOpen} onOpenChange={onWhyOpenChange}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                      Why?
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-3.5" align="end">
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
                        No references linked to this red flag yet.
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
                      View full references
                    </button>
                  </PopoverContent>
                </Popover>
                {canEdit ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} aria-label="Edit red flag">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      onClick={onDelete}
                      aria-label="Delete red flag"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="More red flag actions">
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
                  </>
                ) : null}
              </div>
            </div>

            {question ? <p className="text-[13.5px] leading-relaxed text-muted-foreground">{question}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              {flag.action ? (
                <p className="text-[13px] font-medium text-muted-foreground">
                  → {flag.actionNote?.trim() || actionLabel(flag.action)}
                </p>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                <span className={cn('font-medium', unlinked ? 'text-amber-700' : 'text-muted-foreground')}>
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
                  <PopoverContent className="w-[320px] p-3" align="end">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">Linked evidence</p>
                      <PopoverClose className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                        <X className="h-3.5 w-3.5" />
                      </PopoverClose>
                    </div>
                    {linked.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No references linked to this red flag yet.
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
                        onClick={() => {
                          onViewOpenChange(false);
                          onLink();
                        }}
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
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex items-center font-semibold text-primary hover:underline disabled:opacity-50"
                    onClick={onLink}
                  >
                    + Link reference
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
