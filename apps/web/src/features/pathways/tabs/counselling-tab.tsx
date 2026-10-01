'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notify';
import {
  BookOpen,
  CalendarCheck,
  Check,
  ChevronDown,
  GraduationCap,
  HeartPulse,
  MoreHorizontal,
  Pencil,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  GUIDANCE_OUTPUT_SECTIONS,
  GUIDANCE_PRIORITY_LABELS,
  GUIDANCE_SECTION_META,
  guidanceTypeForNonDrugName,
  isNonDrugTreatmentMigrated,
  mapRecommendationToPriority,
  patientWordingFromNonDrugTreatment,
  resolveGuidancePriority,
  resolveGuidanceSection,
  resolveGuidanceType,
  type GuidanceOutputSection,
} from '@safescript/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PathwayReadOnlyBanner } from '../pathway-edit-lock';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import {
  PathwayBulkToolbar,
  PathwayDragHandle,
  PathwaySelectCheckbox,
  PathwaySortableList,
  sortableRowClassName,
  usePathwaySelection,
  usePathwaySortableRow,
} from '../components/pathway-sortable-list';
import {
  useArchiveTreatment,
  useBulkApproveCounselling,
  useBulkDeleteCounselling,
  useCreateCounselling,
  useDeleteCounselling,
  useReorderCounselling,
  useRestoreCounselling,
  useUpdateCounselling,
} from '../hooks';
import { GuidanceItemDialog, type GuidanceFormValue } from '../guidance-item-dialog';
import type { ClinicalPathway, ClinicalCounselling, ClinicalTreatment } from '../types';

const SECTION_ICONS: Record<GuidanceOutputSection, LucideIcon> = {
  what_to_expect: BookOpen,
  self_care: HeartPulse,
  follow_up: CalendarCheck,
};

type FilterId = 'all' | GuidanceOutputSection;

function readInitialSection(): GuidanceOutputSection | null {
  if (typeof window === 'undefined') return null;
  const section = new URLSearchParams(window.location.search).get('section');
  if (section === 'what_to_expect' || section === 'self_care' || section === 'follow_up') {
    return section;
  }
  return null;
}

export function CounsellingTab({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const initialSection = readInitialSection();
  const [filter, setFilter] = useState<FilterId>(initialSection ?? 'all');
  const [expanded, setExpanded] = useState<GuidanceOutputSection>(
    initialSection ?? 'self_care',
  );
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetSection, setPresetSection] = useState<GuidanceOutputSection | null>(null);
  const [editing, setEditing] = useState<ClinicalCounselling | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClinicalCounselling | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [sectionOrders, setSectionOrders] = useState<Record<GuidanceOutputSection, string[]>>({
    what_to_expect: [],
    self_care: [],
    follow_up: [],
  });

  const createCounselling = useCreateCounselling(pathway.id);
  const updateCounselling = useUpdateCounselling(pathway.id);
  const deleteCounselling = useDeleteCounselling(pathway.id);
  const restoreCounselling = useRestoreCounselling(pathway.id);
  const reorderCounselling = useReorderCounselling(pathway.id);
  const bulkApprove = useBulkApproveCounselling(pathway.id);
  const bulkDelete = useBulkDeleteCounselling(pathway.id);
  const archiveTreatment = useArchiveTreatment(pathway.id);
  const [legacyBusyId, setLegacyBusyId] = useState<string | null>(null);

  const items = pathway.counsellings ?? [];
  const activeItems = useMemo(
    () => items.filter((item) => !item.archivedAt),
    [items],
  );
  const archivedItems = useMemo(
    () => items.filter((item) => Boolean(item.archivedAt)),
    [items],
  );
  const approvedCount = activeItems.filter((item) => item.approved).length;
  const visibleIds = useMemo(
    () => (showArchived ? items : activeItems).map((item) => item.id),
    [activeItems, items, showArchived],
  );
  const { selectedIds, selectedList, count: selectedCount, toggle, toggleAll, clear } =
    usePathwaySelection(visibleIds);

  const unmigratedFollowups = useMemo(
    () =>
      (pathway.followups ?? []).filter((followup) => {
        const prefixed = `fu_${followup.id}`;
        return !items.some(
          (item) =>
            item.legacyId === followup.id ||
            item.legacyId === prefixed ||
            item.id === prefixed,
        );
      }),
    [items, pathway.followups],
  );
  const unmigratedNonDrug = useMemo(
    () =>
      (pathway.treatments ?? []).filter(
        (treatment) =>
          treatment.category === 'NON_DRUG' &&
          !treatment.archivedAt &&
          treatment.isActive !== false &&
          !isNonDrugTreatmentMigrated(treatment.id, items),
      ),
    [items, pathway.treatments],
  );
  const grouped = useMemo(() => {
    const map: Record<GuidanceOutputSection, ClinicalCounselling[]> = {
      what_to_expect: [],
      self_care: [],
      follow_up: [],
    };
    for (const item of showArchived ? items : activeItems) {
      const section = resolveGuidanceSection(item.outputSection, item.category);
      map[section].push(item);
    }
    for (const section of GUIDANCE_OUTPUT_SECTIONS) {
      map[section].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }
    return map;
  }, [activeItems, items, showArchived]);

  useEffect(() => {
    setSectionOrders({
      what_to_expect: grouped.what_to_expect.map((item) => item.id),
      self_care: grouped.self_care.map((item) => item.id),
      follow_up: grouped.follow_up.map((item) => item.id),
    });
  }, [grouped]);

  const visibleSections = filter === 'all' ? GUIDANCE_OUTPUT_SECTIONS : [filter];

  const openCreate = (section?: GuidanceOutputSection) => {
    if (!canEdit) return;
    setEditing(null);
    setPresetSection(section ?? null);
    setDialogOpen(true);
  };

  const openEdit = (item: ClinicalCounselling) => {
    if (!canEdit) return;
    setEditing(item);
    setPresetSection(null);
    setDialogOpen(true);
  };

  const handleSave = async (value: GuidanceFormValue) => {
    if (!value.outputSection || !value.guidanceType) return;
    const payload = {
      point: value.point.trim(),
      detail: value.detail.trim(),
      descriptor: value.descriptor.trim() || undefined,
      outputSection: value.outputSection,
      guidanceType: value.guidanceType,
      priority: value.priority,
      approved: value.approved,
      category: GUIDANCE_SECTION_META[value.outputSection].categoryLegacy,
      ...(editing ? { itemVersion: value.itemVersion } : {}),
    };
    try {
      if (editing) {
        await updateCounselling.mutateAsync({ itemId: editing.id, data: payload });
        toast.success('Guidance updated.');
      } else {
        await createCounselling.mutateAsync(payload);
        toast.success('Guidance added.');
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save guidance.';
      toast.error(message);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await deleteCounselling.mutateAsync(archiveTarget.id);
      toast.success(archiveTarget.approved ? 'Guidance archived.' : 'Guidance removed.');
      setArchiveTarget(null);
    } catch {
      toast.error('Could not update this item.');
    }
  };

  const handleDuplicate = async (item: ClinicalCounselling) => {
    const section = resolveGuidanceSection(item.outputSection, item.category);
    try {
      await createCounselling.mutateAsync({
        point: `${item.point} (copy)`,
        detail: item.detail ?? '',
        descriptor: item.descriptor ?? undefined,
        outputSection: section,
        guidanceType: resolveGuidanceType(item.guidanceType, section, item.category),
        priority: resolveGuidancePriority(item.priority),
        approved: false,
        category: GUIDANCE_SECTION_META[section].categoryLegacy,
      });
      toast.success('Guidance duplicated as a draft.');
    } catch {
      toast.error('Could not duplicate this item.');
    }
  };

  const convertLegacyNonDrug = async (treatment: ClinicalTreatment) => {
    if (!canEdit || legacyBusyId) return;
    setLegacyBusyId(treatment.id);
    try {
      if (!isNonDrugTreatmentMigrated(treatment.id, items)) {
        await createCounselling.mutateAsync({
          point: (treatment.medicationName ?? 'Self-care measure').trim() || 'Self-care measure',
          detail: patientWordingFromNonDrugTreatment(treatment),
          descriptor: treatment.genericName?.trim() || undefined,
          outputSection: 'self_care',
          guidanceType: guidanceTypeForNonDrugName(treatment.medicationName),
          priority: mapRecommendationToPriority(treatment.recommendationLevel),
          approved: Boolean(treatment.approved),
          category: GUIDANCE_SECTION_META.self_care.categoryLegacy,
          legacySource: 'non_pharmacological',
          legacyId: treatment.id,
        });
      }
      await archiveTreatment.mutateAsync({ treatmentId: treatment.id });
      toast.success('Converted to editable self-care guidance.');
    } catch {
      toast.error('Could not convert this non-drug measure.');
    } finally {
      setLegacyBusyId(null);
    }
  };

  const removeLegacyNonDrug = async (treatment: ClinicalTreatment) => {
    if (!canEdit || legacyBusyId) return;
    setLegacyBusyId(treatment.id);
    try {
      await archiveTreatment.mutateAsync({ treatmentId: treatment.id });
      toast.success('Legacy non-drug measure removed from this pathway.');
    } catch {
      toast.error('Could not remove this non-drug measure.');
    } finally {
      setLegacyBusyId(null);
    }
  };

  const convertAllLegacyNonDrug = async () => {
    if (!canEdit || !unmigratedNonDrug.length || legacyBusyId) return;
    setLegacyBusyId('__all__');
    try {
      for (const treatment of unmigratedNonDrug) {
        if (!isNonDrugTreatmentMigrated(treatment.id, items)) {
          await createCounselling.mutateAsync({
            point:
              (treatment.medicationName ?? 'Self-care measure').trim() || 'Self-care measure',
            detail: patientWordingFromNonDrugTreatment(treatment),
            descriptor: treatment.genericName?.trim() || undefined,
            outputSection: 'self_care',
            guidanceType: guidanceTypeForNonDrugName(treatment.medicationName),
            priority: mapRecommendationToPriority(treatment.recommendationLevel),
            approved: Boolean(treatment.approved),
            category: GUIDANCE_SECTION_META.self_care.categoryLegacy,
            legacySource: 'non_pharmacological',
            legacyId: treatment.id,
          });
        }
        await archiveTreatment.mutateAsync({ treatmentId: treatment.id });
      }
      toast.success(
        `Converted ${unmigratedNonDrug.length} non-drug measure${unmigratedNonDrug.length === 1 ? '' : 's'} to self-care guidance.`,
      );
    } catch {
      toast.error('Could not convert all legacy non-drug measures.');
    } finally {
      setLegacyBusyId(null);
    }
  };

  const handleApprove = async (item: ClinicalCounselling) => {
    try {
      await updateCounselling.mutateAsync({ itemId: item.id, data: { approved: true } });
      toast.success('Guidance approved.');
    } catch {
      toast.error('Could not approve this item.');
    }
  };

  const handleBulkApprove = async () => {
    if (!selectedList.length) return;
    try {
      const res = (await bulkApprove.mutateAsync(selectedList)) as { count?: number };
      toast.success(`${res.count ?? selectedList.length} guidance item(s) approved.`);
      clear();
    } catch {
      toast.error('Could not approve selected items.');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedList.length) return;
    try {
      const res = (await bulkDelete.mutateAsync(selectedList)) as { count?: number };
      toast.success(`${res.count ?? selectedList.length} guidance item(s) removed.`);
      clear();
      setBulkDeleteOpen(false);
    } catch {
      toast.error('Could not remove selected items.');
    }
  };

  const moveItem = async (section: GuidanceOutputSection, itemId: string, delta: number) => {
    const current = sectionOrders[section] ?? [];
    const from = current.indexOf(itemId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = arrayMove(current, from, to);
    setSectionOrders((prev) => ({ ...prev, [section]: next }));
    try {
      await reorderCounselling.mutateAsync({ orderedIds: next, outputSection: section });
    } catch {
      setSectionOrders((prev) => ({ ...prev, [section]: current }));
      toast.error('Could not reorder guidance.');
    }
  };

  const handleDragEnd = async (section: GuidanceOutputSection, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = sectionOrders[section] ?? [];
    const oldIndex = current.indexOf(String(active.id));
    const newIndex = current.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(current, oldIndex, newIndex);
    setSectionOrders((prev) => ({ ...prev, [section]: next }));
    try {
      await reorderCounselling.mutateAsync({ orderedIds: next, outputSection: section });
    } catch {
      setSectionOrders((prev) => ({ ...prev, [section]: current }));
      toast.error('Could not reorder guidance.');
    }
  };

  const saving =
    createCounselling.isPending ||
    updateCounselling.isPending ||
    deleteCounselling.isPending ||
    restoreCounselling.isPending;

  return (
    <div className="space-y-5">
      <PathwayReadOnlyBanner canEdit={canEdit} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Patient guidance</h2>
            <p className="text-sm text-muted-foreground">
              Education, self-care, follow-up, and when to seek care.
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <Check className="h-4 w-4" />
                    {approvedCount} approved item{approvedCount === 1 ? '' : 's'}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  Approved, active items that can generate pharmacist-facing cards.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && selectedCount > 0 && (
            <PathwayBulkToolbar
              count={selectedCount}
              onApprove={() => void handleBulkApprove()}
              onDelete={() => setBulkDeleteOpen(true)}
              onClear={clear}
              approvePending={bulkApprove.isPending}
              deletePending={bulkDelete.isPending}
            />
          )}
          <ImportFromChatGptButton pathway={pathway} target="counselling" canEdit={canEdit} />
          {archivedItems.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
          )}
          <Button size="sm" className="gap-2" disabled={!canEdit} onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            Add guidance
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Guidance filters">
        {(
          [
            { id: 'all' as const, label: 'All' },
            ...GUIDANCE_OUTPUT_SECTIONS.map((id) => ({
              id,
              label: GUIDANCE_SECTION_META[id].filterLabel,
            })),
          ] as Array<{ id: FilterId; label: string }>
        ).map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={filter === chip.id}
            onClick={() => {
              setFilter(chip.id);
              if (chip.id !== 'all') setExpanded(chip.id);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              filter === chip.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted/40',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {activeItems.length === 0 &&
      !showArchived &&
      unmigratedFollowups.length === 0 &&
      unmigratedNonDrug.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12">
          <GraduationCap className="mb-4 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No patient guidance yet</p>
          <p className="mt-1 max-w-md text-center text-sm text-muted-foreground/70">
            Add approved education, self-care, and follow-up wording. Pharmacist cards use this as
            the clinical source.
          </p>
          <div className="mt-4">
            <Button size="sm" className="gap-2" disabled={!canEdit} onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Add guidance
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSections.map((section) => {
            const meta = GUIDANCE_SECTION_META[section];
            const Icon = SECTION_ICONS[section];
            const orderedIds = sectionOrders[section] ?? [];
            const sectionItems = orderedIds
              .map((id) => grouped[section].find((item) => item.id === id))
              .filter((item): item is ClinicalCounselling => Boolean(item));
            const open = expanded === section;
            const allSectionSelected =
              orderedIds.length > 0 && orderedIds.every((id) => selectedIds.has(id));
            const someSectionSelected = orderedIds.some((id) => selectedIds.has(id));

            return (
              <section key={section} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex w-full items-start gap-3 px-5 py-4">
                  {canEdit && orderedIds.length > 0 && (
                    <PathwaySelectCheckbox
                      className="mt-3"
                      checked={allSectionSelected}
                      indeterminate={someSectionSelected && !allSectionSelected}
                      onChange={() => toggleAll(orderedIds)}
                      label={
                        allSectionSelected
                          ? `Deselect all ${meta.title}`
                          : `Select all ${meta.title}`
                      }
                    />
                  )}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-expanded={open}
                    onClick={() => setExpanded(section)}
                  >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{meta.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {sectionItems.filter((item) => !item.archivedAt).length} items
                      </Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{meta.subtitle}</span>
                  </span>
                  <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
                    {meta.mappingLabel}
                  </span>
                  <ChevronDown
                    className={cn(
                      'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                  </button>
                </div>

                {open && (
                  <div className="border-t border-border/70">
                    {sectionItems.length === 0 &&
                    !(section === 'follow_up' && unmigratedFollowups.length) &&
                    !(section === 'self_care' && unmigratedNonDrug.length) ? (
                      <p className="px-5 py-6 text-sm text-muted-foreground">
                        No items in this group yet.
                      </p>
                    ) : (
                      <PathwaySortableList
                        ids={orderedIds}
                        canEdit={canEdit}
                        onDragEnd={(event) => {
                          void handleDragEnd(section, event);
                        }}
                      >
                        {sectionItems.map((item, idx) => (
                          <GuidanceRow
                            key={item.id}
                            item={item}
                            index={idx + 1}
                            canEdit={canEdit}
                            selected={selectedIds.has(item.id)}
                            isFirst={idx === 0}
                            isLast={idx === sectionItems.length - 1}
                            onToggleSelect={() => toggle(item.id)}
                            onEdit={() => openEdit(item)}
                            onApprove={() => void handleApprove(item)}
                            onDuplicate={() => void handleDuplicate(item)}
                            onMoveUp={() => void moveItem(section, item.id, -1)}
                            onMoveDown={() => void moveItem(section, item.id, 1)}
                            onArchive={() => setArchiveTarget(item)}
                            onRestore={() => {
                              void restoreCounselling.mutateAsync(item.id).then(
                                () => toast.success('Guidance restored.'),
                                () => toast.error('Could not restore this item.'),
                              );
                            }}
                          />
                        ))}
                      </PathwaySortableList>
                    )}
                    {section === 'self_care' && unmigratedNonDrug.length > 0 && (
                      <div className="space-y-2 border-t border-border/60 px-5 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Legacy non-drug measures. Convert to self-care guidance to edit, or
                            remove them from this pathway.
                          </p>
                          {canEdit ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(legacyBusyId)}
                              onClick={() => void convertAllLegacyNonDrug()}
                            >
                              Convert all to self-care
                            </Button>
                          ) : null}
                        </div>
                        {unmigratedNonDrug.map((treatment, idx) => (
                          <div
                            key={treatment.id}
                            className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {idx + 1 + sectionItems.length}. {treatment.medicationName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Detail:{' '}
                                {treatment.directions ||
                                  treatment.clinicalIndication ||
                                  treatment.counsellingNotes ||
                                  'No patient wording yet.'}
                              </p>
                            </div>
                            {canEdit ? (
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={Boolean(legacyBusyId)}
                                  onClick={() => void convertLegacyNonDrug(treatment)}
                                >
                                  Convert
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={Boolean(legacyBusyId)}
                                  onClick={() => void removeLegacyNonDrug(treatment)}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {section === 'follow_up' && unmigratedFollowups.length > 0 && (
                      <div className="space-y-2 border-t border-border/60 px-5 py-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Legacy follow-up plan. Add them as follow-up guidance to edit.
                        </p>
                        {unmigratedFollowups.map((followup, idx) => (
                          <div key={followup.id} className="rounded-lg border border-dashed px-3 py-2">
                            <p className="text-sm font-medium">
                              {idx + 1 + sectionItems.length}. {followup.action}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {followup.timeframe}
                              {followup.condition ? ` · ${followup.condition}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {canEdit && (
                      <div className="border-t border-border/60 px-5 py-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-primary"
                          onClick={() => openCreate(section)}
                        >
                          <Plus className="h-4 w-4" />
                          {meta.addLabel}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        Approved pathway items are filtered using patient information and selected treatment before
        Personalization.
      </p>

      <GuidanceItemDialog
        open={dialogOpen}
        canEdit={canEdit}
        presetSection={presetSection}
        item={editing}
        saving={saving}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.approved ? 'Archive this guidance item?' : 'Remove this guidance item?'}
        description={
          archiveTarget?.approved
            ? `"${archiveTarget.point}" will be archived and will no longer generate pharmacist cards.`
            : `Remove "${archiveTarget?.point}"? Draft items are deleted.`
        }
        confirmLabel={archiveTarget?.approved ? 'Archive' : 'Remove'}
        variant="destructive"
        onConfirm={handleArchive}
        loading={deleteCounselling.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        title={`Remove ${selectedCount} guidance item${selectedCount === 1 ? '' : 's'}?`}
        description="Draft items are deleted. Approved items are archived and will no longer generate pharmacist cards."
        confirmLabel="Remove selected"
        variant="destructive"
        onConfirm={() => void handleBulkDelete()}
        loading={bulkDelete.isPending}
      />
    </div>
  );
}

function GuidanceRow({
  item,
  index,
  canEdit,
  selected,
  isFirst,
  isLast,
  onToggleSelect,
  onEdit,
  onApprove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onArchive,
  onRestore,
}: {
  item: ClinicalCounselling;
  index: number;
  canEdit: boolean;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = usePathwaySortableRow(
    item.id,
    !canEdit || Boolean(item.archivedAt),
  );
  const section = resolveGuidanceSection(item.outputSection, item.category);
  const priority = resolveGuidancePriority(item.priority);
  const archived = Boolean(item.archivedAt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(sortableRowClassName({ selected, isDragging, muted: archived }), 'items-start px-4 py-3')}
    >
      {canEdit && !archived && (
        <PathwaySelectCheckbox
          className="mt-1.5"
          checked={selected}
          onChange={onToggleSelect}
          label={`Select ${item.point}`}
        />
      )}
      <PathwayDragHandle
        listeners={listeners}
        attributes={attributes}
        disabled={!canEdit || archived}
      />
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold">{item.point}</p>
          {item.descriptor ? (
            <span className="text-xs text-muted-foreground">({item.descriptor})</span>
          ) : null}
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              priority === 'first_line' && 'border-emerald-400/50 bg-emerald-50 text-emerald-700',
            )}
          >
            {GUIDANCE_PRIORITY_LABELS[priority]}
          </Badge>
          {item.approved && !archived ? (
            <Badge variant="success" className="text-[10px]">
              Approved
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              {archived ? 'Archived' : 'Draft'}
            </Badge>
          )}
        </div>
        {item.detail ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">Detail:</span> {item.detail}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {GUIDANCE_SECTION_META[section].mappingLabel}
        </p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          {!item.approved && !archived && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-success"
              onClick={onApprove}
              aria-label="Approve guidance"
              title="Approve"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onEdit}
            aria-label="Edit guidance"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem disabled={isFirst} onClick={onMoveUp}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onClick={onMoveDown}>
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem onClick={onRestore}>Restore</DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-destructive" onClick={onArchive}>
                  {item.approved ? 'Archive' : 'Remove'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
