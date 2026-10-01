'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Plus,
  Trash2,
  Pill,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  Loader2,
  Bot,
  Archive,
  ArchiveRestore,
  Leaf,
  ShoppingBag,
  HeartPulse,
  Library,
  Info,
  CircleHelp,
  Eye,
  MoreHorizontal,
  BookOpen,
  X,
} from 'lucide-react';
import { type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useArchiveTreatment,
  useBulkApproveTreatments,
  useBulkDeleteTreatments,
  useCreateTreatment,
  useDeleteTreatment,
  useReorderTreatments,
  useUpdateTreatment,
  useUpdateTreatmentSectionEvidence,
} from '../hooks';
import { TreatmentFormDialog, type TreatmentFormData } from '../treatment-form-dialog';
import {
  TreatmentLibraryPickerDialog,
  librarySourceFromTreatment,
  pathwayOwnedFromTreatment,
  type LibraryPrefill,
} from '@/features/treatment-library/treatment-library-picker-dialog';
import type { ClinicalPathway, ClinicalTreatment, PathwayEvidenceLibraryReference, TreatmentCategory } from '../types';
import { PHARMACOLOGICAL_TREATMENT_CATEGORIES } from '../pathway-constants';
import { cn } from '@/lib/utils';
import {
  citationDisplay,
  editionLabel,
  evidenceCountLabel,
  formatClinicalYesNo,
  isPersistedPathwayTreatment,
  libraryOwnedOverrides,
  mergePathwayOwnedFields,
  normalizeClinicalYesNo,
  TREATMENT_LIBRARY_PATHWAY_UI,
  uniqueIdList,
  type PathwayOwnedTreatmentFields,
} from '@safescript/shared';
import { PathwayReadOnlyBanner, editLockProps } from '../pathway-edit-lock';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import { ImportTreatmentsExcelButton } from '../import-treatments-excel-button';
import { PathwayRegimenEditor } from '@/features/treatment-editor/pathway-regimen-editor';
import { LinkReferenceDialog } from '../presentation-review/link-reference-dialog';
import { TreatmentsEvidenceReviewDrawer } from '../treatments/evidence-review-drawer';
import {
  isFirstLine,
  lineOfTherapyLabel,
  linkedIdsForTreatment,
  sectionEvidenceIds,
  TREATMENTS_BANNER,
  TREATMENTS_SUBTITLE,
  treatmentRegimenSummary,
} from '../treatments/utils';
import {
  PathwayBulkToolbar,
  PathwayDragHandle,
  PathwaySelectCheckbox,
  PathwaySortableList,
  sortableRowClassName,
  usePathwaySelection,
  usePathwaySortableRow,
} from '../components/pathway-sortable-list';

const CATEGORY_ICONS = {
  PRESCRIPTION: Pill,
  OTC: ShoppingBag,
  SUPPLEMENT: Leaf,
  NON_DRUG: HeartPulse,
} as const;

function lactationDetail(t: ClinicalTreatment): string {
  const yesNo = formatClinicalYesNo(t.breastfeedingNotes);
  const reason =
    t.metadata && typeof t.metadata === 'object'
      ? String((t.metadata as { lactationReason?: string }).lactationReason ?? '').trim()
      : '';
  return reason ? `${yesNo} — ${reason}` : yesNo;
}

function getMissingFields(t: ClinicalTreatment): string[] {
  const missing: string[] = [];
  if (!t.medicationName?.trim()) missing.push('Name');
  if (t.category === 'PRESCRIPTION') {
    if (!t.genericName?.trim()) missing.push('Generic');
    if (!t.strength?.trim()) missing.push('Strength');
    if (!t.dose?.trim()) missing.push('Dose');
    if (!t.route?.trim()) missing.push('Route');
    if (!t.frequency?.trim()) missing.push('Frequency');
    if (!t.duration?.trim()) missing.push('Duration');
    if (!t.provinceAvailability?.trim()) missing.push('Province');
  }
  if (t.category === 'OTC') {
    if (!t.genericName?.trim()) missing.push('Active ingredient');
    if (!t.route?.trim()) missing.push('Route');
    if (!t.directions?.trim()) missing.push('Directions');
  }
  if (t.category === 'SUPPLEMENT') {
    if (!t.dose?.trim()) missing.push('Dose');
    if (!t.frequency?.trim()) missing.push('Frequency');
    if (!t.clinicalIndication?.trim()) missing.push('Indication');
  }
  if (t.category === 'NON_DRUG') {
    if (!t.directions?.trim() && !t.clinicalIndication?.trim()) missing.push('Description');
  }
  if (normalizeClinicalYesNo(t.pregnancyNotes) === 'Yes' && !t.pregnancyReason?.trim()) {
    missing.push('Pregnancy reason');
  }
  if (normalizeClinicalYesNo(t.renalAdjustment) === 'Yes' && !t.renalAdjustmentReason?.trim()) {
    missing.push('Renal reason');
  }
  if (
    normalizeClinicalYesNo(t.renalAdjustment) === 'Yes' &&
    Array.isArray(t.renalDosingRules) &&
    t.renalDosingRules.length > 0 &&
    (!t.renalDosingBasis || t.renalDosingBasis === 'NONE')
  ) {
    missing.push('Renal dosing basis');
  }
  if (normalizeClinicalYesNo(t.hepaticAdjustment) === 'Yes' && !t.hepaticAdjustmentReason?.trim()) {
    missing.push('Hepatic reason');
  }
  if (normalizeClinicalYesNo(t.monitoring) === 'Yes' && !t.monitoringReason?.trim()) {
    missing.push('Monitoring reason');
  }
  if (normalizeClinicalYesNo(t.breastfeedingNotes) === 'Yes') {
    const meta = t.metadata as { lactationReason?: string } | null | undefined;
    if (!meta?.lactationReason?.trim()) missing.push('Lactation reason');
  }
  return missing;
}

function FieldPill({
  label,
  value,
  missing,
}: {
  label: string;
  value?: string | null;
  missing?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
        missing
          ? 'border-warning/40 bg-warning/10 text-warning'
          : 'border-border/60 bg-muted/30 text-foreground/85',
      )}
    >
      <span className="font-medium text-muted-foreground">{label}:</span>
      {value?.trim() ? value : '—'}
    </span>
  );
}

export function TreatmentsTab({
  pathway,
  canEdit,
  onOpenReferencesTab,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
  onOpenReferencesTab?: () => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<ClinicalTreatment | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalTreatment | null>(null);
  const [librarySource, setLibrarySource] = useState<LibraryPrefill['librarySource'] | null>(null);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<TreatmentCategory | null>('PRESCRIPTION');
  const [pickerLocked, setPickerLocked] = useState(false);
  const [libraryReplace, setLibraryReplace] = useState(false);
  const [pathwayOwnedSnapshot, setPathwayOwnedSnapshot] = useState<PathwayOwnedTreatmentFields | null>(null);
  const [changeLibraryOpen, setChangeLibraryOpen] = useState(false);
  const [removeLinkOpen, setRemoveLinkOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<TreatmentCategory>('PRESCRIPTION');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);
  const [regimenSavingId, setRegimenSavingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [openViewId, setOpenViewId] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<{
    kind: 'item' | 'section';
    treatment?: ClinicalTreatment;
  } | null>(null);
  const [categoryOrders, setCategoryOrders] = useState<Record<TreatmentCategory, string[]>>({
    PRESCRIPTION: [],
    OTC: [],
    SUPPLEMENT: [],
    NON_DRUG: [],
  });
  const lock = editLockProps(canEdit);

  const createTreatment = useCreateTreatment(pathway.id);
  const deleteTreatment = useDeleteTreatment(pathway.id);
  const updateTreatment = useUpdateTreatment(pathway.id);
  const updateSectionEvidence = useUpdateTreatmentSectionEvidence(pathway.id);
  const reorderTreatments = useReorderTreatments(pathway.id);
  const bulkApprove = useBulkApproveTreatments(pathway.id);
  const bulkDelete = useBulkDeleteTreatments(pathway.id);
  const archiveTreatment = useArchiveTreatment(pathway.id);

  const treatments = pathway.treatments ?? [];
  const library = pathway.libraryReferences ?? [];
  const mappings = pathway.evidenceMappings ?? [];
  const sectionIds = sectionEvidenceIds(mappings);
  const visible = useMemo(
    () =>
      treatments.filter(
        (t) =>
          t.category !== 'NON_DRUG' &&
          (showArchived ? true : t.isActive !== false && !t.archivedAt),
      ),
    [treatments, showArchived],
  );

  const visibleIds = visible.map((t) => t.id);
  const { selectedIds, selectedList, count: selectedCount, toggle, toggleAll, clear } =
    usePathwaySelection(visibleIds);

  const byCategory = useMemo(() => {
    const map = Object.fromEntries(
      PHARMACOLOGICAL_TREATMENT_CATEGORIES.map((c) => [c.value, [] as ClinicalTreatment[]]),
    ) as Record<TreatmentCategory, ClinicalTreatment[]>;
    for (const t of visible) {
      const cat = (t.category in map ? t.category : 'PRESCRIPTION') as TreatmentCategory;
      map[cat].push(t);
    }
    for (const cat of Object.keys(map) as TreatmentCategory[]) {
      map[cat].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }
    return map;
  }, [visible]);

  useEffect(() => {
    const next = Object.fromEntries(
      PHARMACOLOGICAL_TREATMENT_CATEGORIES.map((c) => [
        c.value,
        byCategory[c.value].map((t) => t.id),
      ]),
    ) as Record<TreatmentCategory, string[]>;
    setCategoryOrders(next);
  }, [byCategory]);

  const approvedCount = visible.filter((t) => t.approved).length;
  const firstLineCount = visible.filter((t) => t.recommendationLevel === 'FIRST_LINE').length;
  const incompleteCount = useMemo(
    () => visible.filter((t) => getMissingFields(t).length > 0).length,
    [visible],
  );

  const openLibrary = (
    nextCategory?: TreatmentCategory,
    locked = false,
    mode: 'add' | 'replace' = 'add',
  ) => {
    if (!canEdit) return;
    setLibraryReplace(mode === 'replace');
    if (mode === 'add') {
      setEditing(null);
      setLibrarySource(null);
      setPathwayOwnedSnapshot(null);
    }
    setPickerCategory(nextCategory ?? 'PRESCRIPTION');
    setPickerLocked(locked);
    setLibraryPickerOpen(true);
  };

  const openCreate = (category: TreatmentCategory) => {
    if (!canEdit) return;
    setCreateCategory(category);
    setEditing(null);
    setLibrarySource(null);
    setLibraryReplace(false);
    setPathwayOwnedSnapshot(null);
    setEditorOpen(true);
  };

  const openEdit = (t: ClinicalTreatment) => {
    if (!canEdit) return;
    setEditing(t);
    setCreateCategory(t.category);
    setLibrarySource(librarySourceFromTreatment(t));
    setLibraryReplace(false);
    setEditorOpen(true);
  };

  const handleSave = async (
    data: TreatmentFormData,
    mode: import('../treatment-option-editor-constants').TreatmentEditorMode,
  ) => {
    const payload: Record<string, unknown> = {
      medicationName: data.medicationName.trim(),
      genericName: data.genericName?.trim() || undefined,
      brandName: data.brandName?.trim() || undefined,
      category: data.category,
      recommendationLevel: data.recommendationLevel,
      displayOrder: data.displayOrder,
      strength: data.strength?.trim() || undefined,
      dose: data.dose?.trim() || undefined,
      route: data.route?.trim() || undefined,
      frequency: data.frequency?.trim() || undefined,
      duration: data.duration?.trim() || undefined,
      quantity: data.quantity?.trim() || undefined,
      directions: data.directions?.trim() || undefined,
      clinicalIndication: data.clinicalIndication?.trim() || undefined,
      clinicalNotes: data.clinicalNotes?.trim() || undefined,
      guidelineReference: data.guidelineReference?.trim() || undefined,
      evidenceStrength: data.evidenceStrength?.trim() || undefined,
      eligibility: data.eligibility?.trim() || undefined,
      monitoring: normalizeClinicalYesNo(data.monitoring) || undefined,
      renalAdjustment: normalizeClinicalYesNo(data.renalAdjustment) || undefined,
      renalAdjustmentReason:
        normalizeClinicalYesNo(data.renalAdjustment) === 'Yes'
          ? data.renalAdjustmentReason?.trim() || null
          : null,
      renalDosingBasis:
        normalizeClinicalYesNo(data.renalAdjustment) === 'Yes'
          ? data.renalDosingBasis && data.renalDosingBasis !== 'NONE'
            ? data.renalDosingBasis
            : (data.renalDosingRules?.length ?? 0) > 0
              ? 'CrCl'
              : 'NONE'
          : 'NONE',
      renalDosingRules:
        normalizeClinicalYesNo(data.renalAdjustment) === 'Yes'
          ? data.renalDosingRules ?? []
          : [],
      hepaticAdjustment: normalizeClinicalYesNo(data.hepaticAdjustment) || undefined,
      pregnancyNotes: normalizeClinicalYesNo(data.pregnancyNotes) || undefined,
      breastfeedingNotes: normalizeClinicalYesNo(data.breastfeedingNotes) || undefined,
      pregnancyReason:
        normalizeClinicalYesNo(data.pregnancyNotes) === 'Yes'
          ? data.pregnancyReason?.trim() || null
          : null,
      hepaticAdjustmentReason:
        normalizeClinicalYesNo(data.hepaticAdjustment) === 'Yes'
          ? data.hepaticAdjustmentReason?.trim() || null
          : null,
      monitoringReason:
        normalizeClinicalYesNo(data.monitoring) === 'Yes'
          ? data.monitoringReason?.trim() || null
          : null,
      counsellingNotes: data.counsellingNotes?.trim() || undefined,
      followUpAdvice: data.followUpAdvice?.trim() || undefined,
      ageRestriction: data.ageRestriction?.trim() || undefined,
      provinceAvailability: data.provinceAvailability?.trim() || undefined,
      metadata: data.metadata ?? undefined,
      evidenceRefIds: uniqueIdList(data.evidenceRefIds ?? editing?.evidenceRefIds ?? []),
      approved: mode === 'submit',
      ...(librarySource
        ? {
            treatmentLibraryItemId: librarySource.treatmentLibraryItemId,
            treatmentLibraryVersionId: librarySource.treatmentLibraryVersionId,
            libraryLinkStatus: 'LINKED',
            pathwayOverrides: libraryOwnedOverrides(librarySource.sourceSnapshot, {
              duration: data.duration,
              directions: data.directions,
              dose: data.dose,
              frequency: data.frequency,
              route: data.route,
              strength: data.strength,
            }),
          }
        : isPersistedPathwayTreatment(editing?.id) &&
            (editing?.libraryLinkStatus === 'LINKED' || editing?.treatmentLibraryItemId)
          ? { libraryLinkStatus: 'DETACHED' }
          : {}),
    };

    try {
      if (isPersistedPathwayTreatment(editing?.id)) {
        await updateTreatment.mutateAsync({ treatmentId: editing!.id, data: payload });
        toast.success(
          mode === 'submit'
            ? 'Submitted for clinical review.'
            : mode === 'draft'
              ? 'Draft saved.'
              : 'Treatment option updated.',
        );
      } else {
        await createTreatment.mutateAsync(payload);
        toast.success(
          mode === 'submit'
            ? 'Submitted for clinical review.'
            : 'Draft treatment option saved.',
        );
      }
      setEditorOpen(false);
      setEditing(null);
      setLibrarySource(null);
      setLibraryReplace(false);
      setPathwayOwnedSnapshot(null);
    } catch {
      toast.error(editing ? 'Could not update option.' : 'Could not add option.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTreatment.mutateAsync(deleteTarget.id);
      toast.success('Treatment option removed.');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not remove option.');
    }
  };

  const handleApprove = async (t: ClinicalTreatment) => {
    const missing = getMissingFields(t);
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.join(', ')} before approving`);
      openEdit(t);
      return;
    }
    setActionId(t.id);
    try {
      await updateTreatment.mutateAsync({ treatmentId: t.id, data: { approved: true } });
      toast.success('Approved.');
    } catch {
      toast.error('Could not approve.');
    } finally {
      setActionId(null);
    }
  };

  const handleBulkApprove = async () => {
    if (!selectedList.length) return;
    try {
      const res = await bulkApprove.mutateAsync(selectedList) as { count?: number };
      toast.success(`${res.count ?? selectedList.length} treatment(s) approved.`);
      clear();
    } catch {
      toast.error('Could not approve selected treatments.');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedList.length) return;
    try {
      const res = await bulkDelete.mutateAsync(selectedList) as { count?: number };
      toast.success(`${res.count ?? selectedList.length} treatment(s) removed.`);
      clear();
      setBulkDeleteOpen(false);
    } catch {
      toast.error('Could not remove selected treatments.');
    }
  };

  const buildFullOrder = (orders: Record<TreatmentCategory, string[]>) =>
    PHARMACOLOGICAL_TREATMENT_CATEGORIES.flatMap((c) => orders[c.value]);

  const handleDragEnd = async (category: TreatmentCategory, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = categoryOrders[category] ?? [];
    const oldIndex = current.indexOf(String(active.id));
    const newIndex = current.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const nextCategoryOrder = arrayMove(current, oldIndex, newIndex);
    const nextOrders = { ...categoryOrders, [category]: nextCategoryOrder };
    setCategoryOrders(nextOrders);

    try {
      await reorderTreatments.mutateAsync(buildFullOrder(nextOrders));
      toast.success('Treatment order updated.');
    } catch {
      setCategoryOrders((prev) => ({ ...prev, [category]: current }));
      toast.error('Could not reorder treatments.');
    }
  };

  const toggleSelectCategory = (ids: string[]) => toggleAll(ids);

  const toggleArchive = async (t: ClinicalTreatment) => {
    setActionId(t.id);
    try {
      const restore = Boolean(t.archivedAt) || t.isActive === false;
      await archiveTreatment.mutateAsync({ treatmentId: t.id, restore });
      toast.success(restore ? 'Restored.' : 'Archived.');
    } catch {
      toast.error('Could not update archive state.');
    } finally {
      setActionId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRegimenSave = async (
    treatment: ClinicalTreatment,
    payload: Partial<ClinicalTreatment>,
  ) => {
    setRegimenSavingId(treatment.id);
    try {
      await updateTreatment.mutateAsync({ treatmentId: treatment.id, data: payload });
    } catch {
      toast.error('Could not save regimen.');
      throw new Error('save failed');
    } finally {
      setRegimenSavingId(null);
    }
  };

  const saveItemLinks = async (ids: string[]) => {
    if (!linkTarget?.treatment) return;
    const treatment = linkTarget.treatment;
    const nextIds = uniqueIdList(ids);
    try {
      await updateTreatment.mutateAsync({
        treatmentId: treatment.id,
        data: { evidenceRefIds: nextIds },
      });
      toast.success('Reference linked', {
        announce: true,
        description: `${nextIds.length} reference${nextIds.length === 1 ? '' : 's'} linked to ${treatment.medicationName}.`,
      });
    } catch {
      toast.error('Could not link references. Please try again.');
      throw new Error('link-failed');
    }
  };

  const saveSectionLinks = async (ids: string[]) => {
    const nextIds = uniqueIdList(ids);
    try {
      await updateSectionEvidence.mutateAsync(nextIds);
      toast.success('Reference linked', {
        announce: true,
        description: `${nextIds.length} reference${nextIds.length === 1 ? '' : 's'} linked to this section.`,
      });
    } catch {
      toast.error('Could not link references. Please try again.');
      throw new Error('link-failed');
    }
  };

  const isSaving = createTreatment.isPending || updateTreatment.isPending;

  return (
    <div className="space-y-4">
      <PathwayReadOnlyBanner canEdit={canEdit} />
      <div className={cn('flex flex-col gap-4', evidenceOpen && 'xl:flex-row xl:items-start')}>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Treatment Options</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {TREATMENTS_SUBTITLE}
            {' '}
            {approvedCount}/{visible.length} approved · {firstLineCount} first-line
            {incompleteCount > 0 && (
              <span className="text-warning"> · {incompleteCount} need review</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && selectedCount > 0 && (
            <PathwayBulkToolbar
              count={selectedCount}
              onApprove={handleBulkApprove}
              onDelete={() => setBulkDeleteOpen(true)}
              onClear={clear}
              approvePending={bulkApprove.isPending}
              deletePending={bulkDelete.isPending}
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
            target="treatments"
            canEdit={canEdit}
            className="h-9 gap-1.5 rounded-lg"
          />
          <ImportTreatmentsExcelButton pathwayId={pathway.id} canEdit={canEdit} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg text-[12px]"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          <AddTreatmentOptionMenu
            label="Add option"
            {...lock}
            onFromLibrary={() => openLibrary('PRESCRIPTION', false)}
            onManual={() => openCreate('PRESCRIPTION')}
          />
        </div>
      </div>

      <div className="flex gap-2.5 rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <p>{TREATMENTS_BANNER}</p>
      </div>

      {treatments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16">
          <Pill className="mb-4 h-10 w-10 text-muted-foreground/40" />
          <p className="text-base font-medium text-muted-foreground">No treatment options yet</p>
          <p className="mt-1 max-w-md text-center text-sm text-muted-foreground/70">
            Generate from clinical guides or add prescription, OTC, and supplement options
            manually.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <AddTreatmentOptionMenu
              {...lock}
              onFromLibrary={() => openLibrary('PRESCRIPTION', false)}
              onManual={() => openCreate('PRESCRIPTION')}
            />
            {PHARMACOLOGICAL_TREATMENT_CATEGORIES.map((c) => (
              <Button
                key={c.value}
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => openCreate(c.value)}
                {...lock}
              >
                <Plus className="h-3.5 w-3.5" />
                {c.shortLabel}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {PHARMACOLOGICAL_TREATMENT_CATEGORIES.map((cat) => {
            const orderedIds = categoryOrders[cat.value] ?? [];
            const items = orderedIds
              .map((id) => visible.find((t) => t.id === id))
              .filter((t): t is ClinicalTreatment => Boolean(t));
            const Icon = CATEGORY_ICONS[cat.value];
            const allSectionSelected =
              orderedIds.length > 0 && orderedIds.every((id) => selectedIds.has(id));
            const someSectionSelected = orderedIds.some((id) => selectedIds.has(id));

            return (
              <section key={cat.value} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {canEdit && orderedIds.length > 0 && (
                      <PathwaySelectCheckbox
                        checked={allSectionSelected}
                        indeterminate={someSectionSelected && !allSectionSelected}
                        onChange={() => toggleSelectCategory(orderedIds)}
                        label={
                          allSectionSelected
                            ? `Deselect all ${cat.shortLabel}`
                            : `Select all ${cat.shortLabel}`
                        }
                      />
                    )}
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">{cat.label}</h3>
                      <p className="text-[11px] text-muted-foreground">{cat.description}</p>
                    </div>
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {items.length}
                    </Badge>
                  </div>
                  <AddTreatmentOptionMenu
                    label="Add"
                    variant="ghost"
                    {...lock}
                    onFromLibrary={() => openLibrary(cat.value, true)}
                    onManual={() => openCreate(cat.value)}
                  />
                </div>

                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-4 py-5 text-center text-[12px] text-muted-foreground">
                    No {cat.shortLabel.toLowerCase()} options yet.
                  </div>
                ) : (
                  <Card className="overflow-hidden shadow-none">
                    <div className="divide-y divide-border/50">
                      <PathwaySortableList
                        ids={orderedIds}
                        canEdit={canEdit}
                        onDragEnd={(event) => {
                          void handleDragEnd(cat.value, event);
                        }}
                      >
                        {items.map((t, index) => (
                          <SortableTreatmentRow
                            key={t.id}
                            treatment={t}
                            index={index + 1}
                            canEdit={canEdit}
                            selected={selectedIds.has(t.id)}
                            onToggleSelect={() => toggle(t.id)}
                            isExpanded={expanded.has(t.id)}
                            onToggleExpand={() => toggleExpand(t.id)}
                            onApprove={() => handleApprove(t)}
                            onEdit={() => openEdit(t)}
                            onArchive={() => toggleArchive(t)}
                            onDelete={() => setDeleteTarget(t)}
                            onSaveRegimen={(payload) => handleRegimenSave(t, payload)}
                            regimenSaving={regimenSavingId === t.id}
                            actionId={actionId}
                            deletePending={deleteTreatment.isPending && deleteTarget?.id === t.id}
                            library={library}
                            linkedIds={linkedIdsForTreatment(t, mappings)}
                            whyOpen={openWhyId === t.id}
                            viewOpen={openViewId === t.id}
                            onWhyOpenChange={(open) => {
                              setOpenWhyId(open ? t.id : null);
                              if (open) setOpenViewId(null);
                            }}
                            onViewOpenChange={(open) => {
                              setOpenViewId(open ? t.id : null);
                              if (open) setOpenWhyId(null);
                            }}
                            onLink={() => setLinkTarget({ kind: 'item', treatment: t })}
                            onManageLibrary={() => onOpenReferencesTab?.()}
                            onViewFullReferences={() => {
                              setOpenWhyId(null);
                              setOpenViewId(t.id);
                            }}
                          />
                        ))}
                      </PathwaySortableList>
                    </div>
                  </Card>
                )}
              </section>
            );
          })}
        </div>
      )}
        </div>

        {evidenceOpen ? (
          <TreatmentsEvidenceReviewDrawer
            pathway={pathway}
            treatments={visible}
            canEdit={canEdit}
            onClose={() => setEvidenceOpen(false)}
            onManageReferences={() => onOpenReferencesTab?.()}
            onLinkSectionSources={() => setLinkTarget({ kind: 'section' })}
          />
        ) : null}
      </div>

      <TreatmentFormDialog
        open={editorOpen}
        onOpenChange={(next) => {
          setEditorOpen(next);
          if (!next && !libraryReplace) {
            setLibrarySource(null);
            setRemoveLinkOpen(false);
          }
        }}
        treatment={editing}
        defaultCategory={createCategory}
        loading={isSaving}
        context={{
          pathwayName: pathway.name || pathway.condition,
          condition: pathway.condition,
          jurisdiction: pathway.province,
        }}
        libraryLink={librarySource}
        onViewLibrarySource={
          librarySource
            ? () =>
                window.open(
                  `/super-admin/treatment-library/${librarySource.treatmentLibraryItemId}`,
                  '_blank',
                  'noopener,noreferrer',
                )
            : undefined
        }
        onChangeLibraryTreatment={(owned) => {
          setPathwayOwnedSnapshot(owned);
          setChangeLibraryOpen(true);
        }}
        onRemoveLibraryLink={() => setRemoveLinkOpen(true)}
        onSubmit={handleSave}
        evidenceLibrary={library}
        canEditEvidence={canEdit}
        onManageEvidenceLibrary={() => onOpenReferencesTab?.()}
        onPersistEvidenceIds={
          isPersistedPathwayTreatment(editing?.id)
            ? async (ids) => {
                await updateTreatment.mutateAsync({
                  treatmentId: editing!.id,
                  data: { evidenceRefIds: uniqueIdList(ids) },
                });
              }
            : undefined
        }
      />

      <TreatmentLibraryPickerDialog
        open={libraryPickerOpen}
        onOpenChange={setLibraryPickerOpen}
        pathwayId={pathway.id}
        pathwayName={pathway.name || pathway.condition}
        jurisdiction={pathway.province}
        category={pickerCategory}
        categoryLocked={pickerLocked}
        canEdit={canEdit}
        onCreateManually={() => openCreate(pickerCategory ?? 'PRESCRIPTION')}
        onViewExisting={(treatmentId) => {
          const existing = treatments.find((t) => t.id === treatmentId);
          if (!existing) return;
          setExpanded((prev) => new Set(prev).add(treatmentId));
          window.setTimeout(() => {
            document
              .getElementById(`pathway-treatment-${treatmentId}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
          openEdit(existing);
        }}
        onSelect={(prefill) => {
          const { librarySource: source, ...treatment } = prefill;
          const existingId =
            libraryReplace && isPersistedPathwayTreatment(editing?.id) ? editing!.id : '';
          const merged = mergePathwayOwnedFields(
            {
              ...treatment,
              id: existingId,
              pathwayId: editing?.pathwayId || pathway.id,
              displayOrder: existingId
                ? editing?.displayOrder ?? treatment.displayOrder
                : (categoryOrders[treatment.category]?.length ?? 0) + 1,
            } as unknown as Record<string, unknown>,
            pathwayOwnedSnapshot ?? (existingId && editing ? pathwayOwnedFromTreatment(editing) : null),
          ) as unknown as ClinicalTreatment;
          setLibrarySource(source);
          setEditing(merged);
          setCreateCategory(treatment.category);
          setLibraryReplace(false);
          setPathwayOwnedSnapshot(null);
          setEditorOpen(true);
        }}
      />

      <LinkReferenceDialog
        open={!!linkTarget}
        onClose={() => setLinkTarget(null)}
        title={
          linkTarget?.kind === 'section'
            ? 'Link section sources'
            : 'Link reference to this treatment option'
        }
        description="Select references from the References & Governance library. Citation metadata is edited there, not on this treatment option."
        searchPlaceholder="Search references by title, keyword, or organization..."
        saveLabel={(count) => `Link selected (${count})`}
        showManageInFooter={false}
        library={library}
        selectedIds={
          linkTarget?.kind === 'section'
            ? sectionIds
            : linkTarget?.treatment
              ? linkedIdsForTreatment(linkTarget.treatment, mappings)
              : []
        }
        canEdit={canEdit}
        saving={updateTreatment.isPending || updateSectionEvidence.isPending}
        onSave={linkTarget?.kind === 'section' ? saveSectionLinks : saveItemLinks}
        onManageLibrary={() => {
          setLinkTarget(null);
          onOpenReferencesTab?.();
        }}
      />

      <ConfirmDialog
        open={changeLibraryOpen}
        onOpenChange={setChangeLibraryOpen}
        title="Change the library treatment?"
        description="Pathway-specific fields such as recommendation level and province stay in place. Library-owned values are replaced if you select a different treatment."
        confirmLabel="Change treatment"
        cancelLabel="Cancel"
        variant="default"
        onConfirm={() => {
          setChangeLibraryOpen(false);
          setLibraryReplace(true);
          setEditorOpen(false);
          openLibrary(createCategory, true, 'replace');
        }}
      />

      <ConfirmDialog
        open={removeLinkOpen}
        onOpenChange={setRemoveLinkOpen}
        title={TREATMENT_LIBRARY_PATHWAY_UI.removeLinkTitle}
        description={TREATMENT_LIBRARY_PATHWAY_UI.removeLinkBody}
        confirmLabel="Remove link"
        cancelLabel="Cancel"
        variant="default"
        onConfirm={() => {
          setLibrarySource(null);
          setRemoveLinkOpen(false);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this treatment option?"
        description="This removes it from the current pathway draft. Historical versions remain available. Prefer Archive if you want to keep it on the pathway."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteTreatment.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedCount} treatment${selectedCount === 1 ? '' : 's'}?`}
        description="Selected treatment options will be removed from the current pathway draft. Historical versions remain available."
        confirmLabel="Delete selected"
        variant="destructive"
        onConfirm={handleBulkDelete}
        loading={bulkDelete.isPending}
      />
    </div>
  );
}

function AddTreatmentOptionMenu({
  label = 'Add option',
  variant = 'default',
  disabled,
  title,
  onFromLibrary,
  onManual,
}: {
  label?: string;
  variant?: 'default' | 'ghost';
  disabled?: boolean;
  title?: string;
  onFromLibrary: () => void;
  onManual: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={variant}
          disabled={disabled}
          title={title}
          className={cn(
            'gap-1.5',
            variant === 'ghost' ? 'h-7 text-[11px] text-primary' : 'h-9 gap-2 rounded-lg',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={disabled} onSelect={onFromLibrary} className="gap-2">
          <Library className="h-4 w-4 text-[#0F6F6B]" />
          {TREATMENT_LIBRARY_PATHWAY_UI.fromLibrary}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={disabled} onSelect={onManual} className="gap-2">
          <Plus className="h-4 w-4" />
          {TREATMENT_LIBRARY_PATHWAY_UI.createManually}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableTreatmentRow({
  treatment: t,
  index,
  canEdit,
  selected,
  onToggleSelect,
  isExpanded,
  onToggleExpand,
  onApprove,
  onEdit,
  onArchive,
  onDelete,
  onSaveRegimen,
  regimenSaving,
  actionId,
  deletePending,
  library,
  linkedIds,
  whyOpen,
  viewOpen,
  onWhyOpenChange,
  onViewOpenChange,
  onLink,
  onManageLibrary,
  onViewFullReferences,
}: {
  treatment: ClinicalTreatment;
  index: number;
  canEdit: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSaveRegimen: (payload: Partial<ClinicalTreatment>) => Promise<void> | void;
  regimenSaving?: boolean;
  actionId: string | null;
  deletePending: boolean;
  library: PathwayEvidenceLibraryReference[];
  linkedIds: string[];
  whyOpen: boolean;
  viewOpen: boolean;
  onWhyOpenChange: (open: boolean) => void;
  onViewOpenChange: (open: boolean) => void;
  onLink: () => void;
  onManageLibrary: () => void;
  onViewFullReferences: () => void;
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = usePathwaySortableRow(
    t.id,
    !canEdit,
  );
  const missing = getMissingFields(t);
  const isIncomplete = missing.length > 0;
  const isBusy = actionId === t.id || deletePending || regimenSaving;
  const archived = Boolean(t.archivedAt) || t.isActive === false;
  const firstLine = isFirstLine(t.recommendationLevel);
  const regimenSummary = treatmentRegimenSummary(t);
  const showRegimenEditor = t.category !== 'NON_DRUG';
  const linked = library.filter((ref) => linkedIds.includes(ref.id));
  const evidenceLabel = evidenceCountLabel(linked.length);
  const unlinked = linked.length === 0;
  const whyText =
    t.clinicalNotes?.trim() ||
    'No rationale has been recorded for this treatment option yet.';

  return (
    <div ref={setNodeRef} style={style} id={`pathway-treatment-${t.id}`}>
      <div
        className={cn(
          sortableRowClassName({ selected, isDragging, muted: archived }),
          isIncomplete && !isDragging && 'border-l-2 border-l-warning/50',
          firstLine && !archived && !isDragging && 'border-l-2 border-l-emerald-400/50',
        )}
      >
        <PathwayDragHandle listeners={listeners} attributes={attributes} disabled={!canEdit} />
        {canEdit && (
          <PathwaySelectCheckbox
            checked={selected}
            onChange={onToggleSelect}
            label={`Select treatment ${index}`}
            className="mt-1.5"
          />
        )}
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
          {index}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[15px] font-bold uppercase tracking-[0.02em] text-[#1e3a5f]">
              {t.medicationName}
            </p>
            {t.strength ? (
              <span className="text-[13px] text-[#667085]">{t.strength}</span>
            ) : null}
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                firstLine && 'border-[#c8ead8] bg-[#e7f6ee] text-[#1b7a4e]',
              )}
            >
              {lineOfTherapyLabel(t.recommendationLevel)}
            </Badge>
            {t.isAiGenerated && (
              <Badge variant="outline" className="gap-1 border-violet-500/30 text-[10px] text-violet-500">
                <Bot className="h-2.5 w-2.5" /> Imported
              </Badge>
            )}
            {t.approved && (
              <Badge variant="outline" className="gap-1 border-success/40 text-[10px] text-success">
                <Check className="h-2.5 w-2.5" /> Approved
              </Badge>
            )}
            {t.libraryLinkStatus === 'LINKED' && (
              <Badge variant="outline" className="text-[10px] text-[#0F6F6B]">
                Treatment Library
              </Badge>
            )}
            {t.libraryLinkStatus === 'LINKED' &&
              (t.treatmentLibraryItem?.approvedVersionNumber ?? 0) >
                (t.sourceVersionNumber ?? 0) && (
                <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                  Treatment Library update available
                </Badge>
              )}
            {archived && (
              <Badge variant="outline" className="text-[10px]">Archived</Badge>
            )}
            {isIncomplete && (
              <Badge variant="outline" className="gap-1 border-warning/40 text-[10px] text-warning">
                <AlertTriangle className="h-2.5 w-2.5" /> Incomplete
              </Badge>
            )}
          </div>
          {t.genericName ? (
            <p className="text-[13px] text-[#667085]">{t.genericName}</p>
          ) : null}
          {regimenSummary ? (
            <p className="text-[13.5px] leading-snug text-[#344054]">{regimenSummary}</p>
          ) : null}
          <div className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5 text-[12.5px] leading-snug">
            <Popover open={whyOpen} onOpenChange={onWhyOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                  Why this option?
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-3.5" align="start">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">Why this option?</p>
                  <PopoverClose className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                    <X className="h-3.5 w-3.5" />
                  </PopoverClose>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{whyText}</p>
                <p className="mt-3 text-[12px] font-semibold">Key references</p>
                {linked.length === 0 ? (
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                    No references linked to this treatment option yet.
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
            {t.clinicalNotes?.trim() ? (
              <span className="min-w-0 flex-1 text-muted-foreground line-clamp-2">
                {t.clinicalNotes.trim()}
              </span>
            ) : null}
          </div>
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
              <PopoverContent className="w-[320px] p-3" align="start">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">Linked evidence</p>
                  <PopoverClose className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                    <X className="h-3.5 w-3.5" />
                  </PopoverClose>
                </div>
                {linked.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No references linked to this treatment option yet.
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

        <div className="flex shrink-0 items-center gap-1">
          {showRegimenEditor ? (
            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 px-3 text-[13px] font-semibold text-[#0F817C] sm:inline-flex"
              onClick={onToggleExpand}
            >
              {isExpanded ? 'Close' : 'Open'}
            </Button>
          ) : null}
          {canEdit && !t.approved && !archived && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-success"
              onClick={onApprove}
              disabled={isBusy}
              title="Approve"
            >
              {actionId === t.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onEdit} disabled={isBusy} title="Edit">
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={onDelete} disabled={isBusy} title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={isBusy} aria-label="More treatment actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="gap-2" onClick={onEdit}>
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={onLink}>
                    <BookOpen className="h-3.5 w-3.5" />
                    Link reference
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={onArchive}>
                    {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    {archived ? 'Restore' : 'Archive'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {isExpanded && showRegimenEditor ? (
        <>
          <PathwayRegimenEditor
            treatment={t}
            canEdit={canEdit}
            saving={regimenSaving}
            onSave={onSaveRegimen}
            onCancel={onToggleExpand}
          />
          <div className="space-y-2 border-t border-border/60 bg-muted/10 px-4 py-3 sm:pl-[4.5rem]">
            {t.clinicalIndication && (
              <DetailSection label="Clinical indication" content={t.clinicalIndication} />
            )}
            {t.eligibility && <DetailSection label="Eligibility notes" content={t.eligibility} />}
            {t.pregnancyNotes && (
              <DetailSection
                label="Pregnancy"
                content={
                  formatClinicalYesNo(t.pregnancyNotes) +
                  (t.pregnancyReason?.trim() ? ` — ${t.pregnancyReason.trim()}` : '')
                }
              />
            )}
            {t.breastfeedingNotes && (
              <DetailSection label="Lactation" content={lactationDetail(t)} />
            )}
            {t.renalAdjustment && (
              <DetailSection
                label="Renal"
                content={
                  formatClinicalYesNo(t.renalAdjustment) +
                  (t.renalAdjustmentReason?.trim()
                    ? ` — ${t.renalAdjustmentReason.trim()}`
                    : '')
                }
              />
            )}
            {t.hepaticAdjustment && (
              <DetailSection
                label="Hepatic"
                content={
                  formatClinicalYesNo(t.hepaticAdjustment) +
                  (t.hepaticAdjustmentReason?.trim()
                    ? ` — ${t.hepaticAdjustmentReason.trim()}`
                    : '')
                }
              />
            )}
            {t.monitoring && (
              <DetailSection
                label="Monitoring"
                content={
                  formatClinicalYesNo(t.monitoring) +
                  (t.monitoringReason?.trim() ? ` — ${t.monitoringReason.trim()}` : '')
                }
              />
            )}
            {t.counsellingNotes && (
              <DetailSection label="Counseling" content={t.counsellingNotes} />
            )}
            {t.followUpAdvice && (
              <DetailSection label="Follow-up" content={t.followUpAdvice} />
            )}
            {t.guidelineReference && (
              <DetailSection label="Guideline reference" content={t.guidelineReference} />
            )}
            {t.evidenceStrength && (
              <DetailSection label="Evidence" content={t.evidenceStrength} />
            )}
          </div>
        </>
      ) : isExpanded ? (
        <div className="space-y-2 border-t border-border/60 bg-muted/10 px-4 py-3 sm:pl-[4.5rem]">
          {t.clinicalIndication && (
            <DetailSection label="Clinical indication" content={t.clinicalIndication} />
          )}
          {t.directions && (
            <DetailSection label="Directions / description" content={t.directions} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function DetailSection({
  label,
  content,
  className,
}: {
  label: string;
  content: string;
  className?: string;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn('text-sm', className ?? 'text-foreground')}>{content}</p>
    </div>
  );
}
