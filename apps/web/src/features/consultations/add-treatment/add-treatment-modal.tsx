'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Loader2,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import type { TreatmentRecommendation } from '../types';
import { useDrugSearchInput } from '../use-drug-search-input';
import { formatSourceBadge, omitPlaceholderValue, uniqueCcdDStrengthOptions, type DrugSearchResult } from '../medication-utils';
import { useDrugSearch } from '../hooks';
import type { DeviceCatalogueItem } from './types';
import type { FieldErrors, TreatmentDraft, TreatmentKind, RegimenLineDraft } from './types';
import { searchDevices } from './device-catalogue';
import { composeDeviceDirections, composePatientDirections } from './directions';
import { withAutoPrescriptionSupply, withAutoDispenseQuantity, formatSuggestedDispenseQuantity } from './quantity';
import { draftToRecommendation } from './map-to-treatment';
import {
  collectPrescriptionFieldAlerts,
  QuantityAndRefillsFields,
} from './regimen-editor';
import { PrescriptionDetailsFields } from '@/features/treatment-editor/prescription-details-fields';
import type { QuantityStatus } from '@/features/treatment-editor/types';
import {
  administrationUnitsFor,
  findProductUseMapping,
  inferProductForm,
  routesForProductForm,
} from '@/features/pathways/product-use-mapping';
import { routeSelectOptions } from './route-options';
import {
  DEVICE_DURATION_OPTIONS,
  DEVICE_SCHEDULE_OPTIONS,
  DEVICE_SIZE_OPTIONS,
  inferCcdDProductPresentation,
} from './constants';
import { DeviceSearchDropdown } from './device-search-dropdown';
import {
  ExpandableOptionalSection,
  FieldError,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  ModeActionButton,
  NumberedSection,
  SubsectionLabel,
} from './ui-bits';
import { validateDraft } from './validate';
import { emptyCompoundDraft, emptyDeviceDraft, emptyMedicationDraft } from './empty-drafts';
import { TreatmentPicker } from './treatment-picker';
import type { AddTreatmentView, MedicationSelectionSource, QuickAddSource } from './quick-add';
import { drugSearchToUsageInput, quickAddToDrugSearchResult } from './quick-add';
import { useRecordQuickAddUsage } from './use-quick-add';
import { TreatmentAddSafetyPreview } from '../treatment-add-safety-preview';
import { useEvaluateTreatmentCandidate } from '../hooks';
import {
  applyCandidateSafety,
  slimTreatmentsForEvaluate,
  type TreatmentCandidateDuplicate,
  type TreatmentCandidateEvaluateResponse,
} from './candidate';
import {
  DuplicateTreatmentDialog,
  RelatedTreatmentDialog,
  SafetyUnavailableDialog,
} from './duplicate-dialogs';
import type { ApiError } from '@/lib/api-client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (treatments: TreatmentRecommendation[]) => void;
  priority: number;
  existingMedicationNames?: string[];
  excludedMedicationIds?: string[];
  existingTreatments?: TreatmentRecommendation[];
  consultationId?: string;
  selectedPathwayId?: string | null;
  onFocusExistingTreatment?: (ref: {
    pathwayOptionId?: string;
    treatmentInstanceId?: string;
    displayName?: string;
  }) => void;
  /** Open directly into the editor for this catalogue medication (Adapt replacement). */
  initialMedication?: DrugSearchResult | null;
  /** Prefill picker search when no initialMedication (e.g. evidence alternative name). */
  initialSearchQuery?: string;
  /** Override dialog title (default: Add treatment). */
  title?: string;
  /** Override primary confirm label (default: Add to treatment plan). */
  confirmLabel?: string;
  /** Hide compound / device modes — medication substitution only. */
  medicationOnly?: boolean;
  /** Toast after successful add (defaults to Prescribe wording). */
  successToastMessage?: (name: string) => string;
}

function InhalerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M10 3h4v3h-1.2v2.2c2.4.6 4.2 2.8 4.2 5.4V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5.4c0-2.6 1.8-4.8 4.2-5.4V6H10V3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatMedicationCardTitle(
  display: string,
  strength?: string,
  dosageForm?: string,
): string {
  const raw = display.trim();
  const hay = raw.toUpperCase();
  const bits = [raw];
  const strengthNorm = strength?.replace(/\s+/g, ' ').trim();
  if (strengthNorm && !hay.includes(strengthNorm.toUpperCase())) {
    bits.push(strengthNorm);
  }
  const formNorm = dosageForm
    ?.replace(/\(e?s\)/gi, '')
    .replace(/manufactured product/gi, '')
    .trim();
  if (formNorm && !bits.join(' ').toUpperCase().includes(formNorm.toUpperCase())) {
    bits.push(formNorm);
  }
  return bits.join(' ').replace(/\s+/g, ' ').toUpperCase();
}

function SelectedItemCard({
  title,
  subtitle,
  strength,
  meta,
  badge,
  icon,
  onRemove,
  removeLabel,
  action,
  headingId,
}: {
  title: string;
  subtitle?: string;
  /** Product strength shown beside the name */
  strength?: string;
  /** Form / class line under the name */
  meta?: string;
  badge?: string;
  icon: 'pill' | 'device';
  onRemove?: () => void;
  removeLabel?: string;
  action?: ReactNode;
  headingId?: string;
}) {
  const Icon = icon === 'device' ? InhalerIcon : Pill;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3
            id={headingId}
            tabIndex={headingId ? -1 : undefined}
            className="text-[14.5px] font-bold uppercase tracking-wide text-foreground outline-none"
          >
            {title}
          </h3>
          {strength ? (
            <span className="inline-flex items-center rounded-md bg-primary/12 px-2 py-0.5 text-[12.5px] font-semibold tabular-nums text-primary">
              {strength}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>
        ) : null}
        {meta ? (
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/90">{meta}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge ? (
          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
            {badge}
          </span>
        ) : null}
        {action ??
          (onRemove && removeLabel ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={removeLabel}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null)}
      </div>
    </div>
  );
}

function InDialogConfirm({
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[10000] flex items-end justify-center bg-black/40 p-4 backdrop-blur-[3px] sm:items-center sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="add-treatment-discard-title"
      aria-describedby="add-treatment-discard-desc"
      style={{ pointerEvents: 'auto' }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-start gap-3 p-5 pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="add-treatment-discard-title" className="text-[16px] font-semibold tracking-tight">
              {title}
            </h2>
            <p id="add-treatment-discard-desc" className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 bg-muted/20 px-5 py-3.5">
          <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" className="h-10 min-w-[8.5rem]" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckboxRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 text-[13.5px] text-foreground">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input text-primary focus-visible:ring-primary/30"
      />
      {label}
    </label>
  );
}

export function AddTreatmentModal({
  open,
  onOpenChange,
  onAdd,
  priority,
  existingMedicationNames = [],
  excludedMedicationIds = [],
  existingTreatments = [],
  consultationId,
  selectedPathwayId,
  onFocusExistingTreatment,
  initialMedication = null,
  initialSearchQuery,
  title = 'Add treatment',
  confirmLabel = 'Add to treatment plan',
  medicationOnly = false,
  successToastMessage,
}: Props) {
  const [view, setView] = useState<AddTreatmentView>('picker');
  const [kind, setKind] = useState<TreatmentKind>('MEDICATION');
  const [medication, setMedication] = useState(emptyMedicationDraft);
  const [compound, setCompound] = useState(emptyCompoundDraft);
  const [device, setDevice] = useState(emptyDeviceDraft);
  const [editorDirty, setEditorDirty] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardIntent, setDiscardIntent] = useState<'close' | 'return-picker'>('close');
  const [moreOpen, setMoreOpen] = useState(false);
  const [clinicalOpen, setClinicalOpen] = useState(false);
  const [directionsNotice, setDirectionsNotice] = useState(false);
  const [previewDirections, setPreviewDirections] = useState<string | null>(null);
  const [deviceQuery, setDeviceQuery] = useState('');
  const [deviceDebounced, setDeviceDebounced] = useState('');
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceActive, setDeviceActive] = useState(0);
  const [quickAddSource, setQuickAddSource] = useState<QuickAddSource>('frequent');
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [candidateSafety, setCandidateSafety] =
    useState<TreatmentCandidateEvaluateResponse | null>(null);
  const [safetyAck, setSafetyAck] = useState(false);
  const [duplicate, setDuplicate] = useState<TreatmentCandidateDuplicate | null>(null);
  const [related, setRelated] = useState<{
    duplicate: TreatmentCandidateDuplicate;
    drug: DrugSearchResult;
    result: TreatmentCandidateEvaluateResponse;
  } | null>(null);
  const [safetyUnavailable, setSafetyUnavailable] = useState<DrugSearchResult | null>(null);
  const pendingDrugRef = useRef<DrugSearchResult | null>(null);
  const submitLock = useRef(false);
  const firstErrorRef = useRef<string | null>(null);
  const lastMedQtyRef = useRef<string | null>(emptyMedicationDraft().quantityValue);
  const lastMedUnitRef = useRef<string | null>(null);
  const lastCompoundQtyRef = useRef<string | null>(null);
  const lastCompoundUnitRef = useRef<string | null>(null);
  const selectionSourceRef = useRef<MedicationSelectionSource>('search');
  const deviceListId = useId();
  const deviceAnchorRef = useRef<HTMLDivElement>(null);
  const recordUsage = useRecordQuickAddUsage(consultationId);
  const evaluateCandidate = useEvaluateTreatmentCandidate(consultationId);
  const pickerActive = view === 'picker';

  const draft: TreatmentDraft =
    kind === 'CUSTOM_COMPOUND' ? compound : kind === 'DEVICE' ? device : medication;

  const resetAll = useCallback(() => {
    const med = emptyMedicationDraft();
    setView('picker');
    setKind('MEDICATION');
    setMedication(med);
    setCompound(emptyCompoundDraft());
    setDevice(emptyDeviceDraft());
    setEditorDirty(false);
    setErrors({});
    setSubmitting(false);
    setMoreOpen(false);
    setClinicalOpen(false);
    setDirectionsNotice(false);
    setPreviewDirections(null);
    setDeviceQuery('');
    setDeviceOpen(false);
    setDiscardOpen(false);
    setDiscardIntent('close');
    setQuickAddSource('frequent');
    setQuickAddExpanded(false);
    setSelectingId(null);
    setCandidateSafety(null);
    setSafetyAck(false);
    setDuplicate(null);
    setRelated(null);
    setSafetyUnavailable(null);
    pendingDrugRef.current = null;
    submitLock.current = false;
    selectionSourceRef.current = 'search';
    lastMedQtyRef.current = med.quantityValue;
    lastCompoundQtyRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) resetAll();
  }, [open, resetAll]);

  const markDirty = () => setEditorDirty(true);

  const cancelDiscard = () => setDiscardOpen(false);

  const returnToPicker = useCallback(() => {
    const med = emptyMedicationDraft();
    setView('picker');
    setKind('MEDICATION');
    setMedication(med);
    setCompound(emptyCompoundDraft());
    setDevice(emptyDeviceDraft());
    setEditorDirty(false);
    setErrors({});
    setMoreOpen(false);
    setClinicalOpen(false);
    setDirectionsNotice(false);
    setPreviewDirections(null);
    setDeviceQuery('');
    setDeviceOpen(false);
    setDiscardOpen(false);
    setSelectingId(null);
    lastMedQtyRef.current = med.quantityValue;
    lastCompoundQtyRef.current = null;
  }, []);

  const confirmDiscard = () => {
    setDiscardOpen(false);
    if (discardIntent === 'return-picker') {
      returnToPicker();
      return;
    }
    onOpenChange(false);
  };

  const requestReturnToPicker = () => {
    if (editorDirty) {
      setDiscardIntent('return-picker');
      setDiscardOpen(true);
      return;
    }
    returnToPicker();
  };

  const enterEditor = (next: Exclude<AddTreatmentView, 'picker'>, nextKind: TreatmentKind) => {
    setKind(nextKind);
    setView(next);
    setErrors({});
    setMoreOpen(false);
    setClinicalOpen(false);
    setPreviewDirections(null);
    setDiscardOpen(false);
  };

  const requestKind = (next: TreatmentKind) => {
    if (next === 'MEDICATION') {
      requestReturnToPicker();
      return;
    }
    if (next === kind && view !== 'picker') return;
    enterEditor(next === 'DEVICE' ? 'device-editor' : 'compound-editor', next);
  };

  const generated = useMemo(() => {
    if (draft.kind === 'DEVICE') {
      return composeDeviceDirections({
        useSchedule: draft.useSchedule,
        durationDisplay: draft.durationDisplay,
        deviceType: draft.deviceType,
      });
    }
    return composePatientDirections(draft.regimenLines, draft.route);
  }, [draft]);

  useEffect(() => {
    if (draft.directionsMode !== 'AUTO') {
      setDirectionsNotice(true);
      return;
    }
    if (!generated) return;
    if (draft.kind === 'MEDICATION') {
      setMedication((d) =>
        d.patientDirections === generated ? d : { ...d, patientDirections: generated },
      );
    } else if (draft.kind === 'CUSTOM_COMPOUND') {
      setCompound((d) =>
        d.patientDirections === generated ? d : { ...d, patientDirections: generated },
      );
    } else {
      setDevice((d) =>
        d.patientDirections === generated ? d : { ...d, patientDirections: generated },
      );
    }
  }, [generated, draft.directionsMode, draft.kind]);

  const setDirectionsManual = (value: string) => {
    markDirty();
    setDirectionsNotice(true);
    if (kind === 'MEDICATION') {
      setMedication((d) => ({ ...d, patientDirections: value, directionsMode: 'MANUAL' }));
    } else if (kind === 'CUSTOM_COMPOUND') {
      setCompound((d) => ({ ...d, patientDirections: value, directionsMode: 'MANUAL' }));
    } else {
      setDevice((d) => ({ ...d, patientDirections: value, directionsMode: 'MANUAL' }));
    }
  };

  const applyGeneratedDirections = () => {
    if (kind === 'MEDICATION') {
      setMedication((d) => ({
        ...d,
        patientDirections: generated,
        directionsMode: 'AUTO',
      }));
    } else if (kind === 'CUSTOM_COMPOUND') {
      setCompound((d) => ({
        ...d,
        patientDirections: generated,
        directionsMode: 'AUTO',
      }));
    } else {
      setDevice((d) => ({
        ...d,
        patientDirections: generated,
        directionsMode: 'AUTO',
      }));
    }
    setDirectionsNotice(false);
    setPreviewDirections(null);
  };

  const candidateSource = (): 'SEARCH' | 'QUICK_ADD' | 'MANUAL' =>
    selectionSourceRef.current === 'search' ? 'SEARCH' : 'QUICK_ADD';

  const openMedicationEditor = (
    drug: DrugSearchResult,
    result?: TreatmentCandidateEvaluateResponse | null,
  ) => {
    const name = drug.brandName || drug.genericName || drug.label;
    const presentation = inferCcdDProductPresentation(
      drug.dosageForm,
      [drug.label, drug.brandName, drug.genericName].filter(Boolean).join(' '),
    );
    const form = presentation.doseForm;
    const route = presentation.route;
    const strength = omitPlaceholderValue(drug.strength)?.replace(/\s+/g, ' ');
    const dosageForm = omitPlaceholderValue(drug.dosageForm);
    const drugClass = omitPlaceholderValue(drug.drugClass);
    const base = emptyMedicationDraft();
    setMedication(
      withAutoPrescriptionSupply(
        {
          ...base,
          medicationDisplay: name,
          genericDisplay: omitPlaceholderValue(drug.genericName) ?? '',
          sourceBadge: formatSourceBadge(drug.source),
          drugId: drug.id,
          rxcui: drug.rxcui,
          ndc: drug.ndc,
          dosageForm,
          strength,
          drugClass:
            drugClass &&
            !/^(manufactured product|non-proprietary product|therapeutic moiety)$/i.test(drugClass)
              ? drugClass
              : undefined,
          medicationCode: {
            system: drug.source === 'ccdd' ? 'CCDD' : drug.source,
            code: drug.id,
            display: name,
          },
          route,
          quantityUnit: presentation.quantityUnit,
          regimenLines: base.regimenLines.map((line, i) =>
            i === 0 ? { ...line, form } : line,
          ),
          directionsMode: 'AUTO' as const,
        },
        {
          lastAutoQty: lastMedQtyRef,
          lastAutoUnit: lastMedUnitRef,
        },
      ),
    );
    setCandidateSafety(result ?? null);
    setSafetyAck(false);
    setKind('MEDICATION');
    setView('standard-medication-editor');
    setEditorDirty(false);
    setSelectingId(null);
    setErrors((e) => {
      const next = { ...e };
      delete next.medicationDisplay;
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById('selected-medication-heading')?.focus();
    });
  };

  const selectMedication = async (drug: DrugSearchResult) => {
    if (evaluateCandidate.isPending && selectingId) return;
    const name = (drug.brandName || drug.genericName || drug.label).trim();
    const presentation = inferCcdDProductPresentation(
      drug.dosageForm,
      [drug.label, drug.brandName, drug.genericName].filter(Boolean).join(' '),
    );
    pendingDrugRef.current = drug;
    setSelectingId(drug.id);
    setDuplicate(null);
    setRelated(null);
    setSafetyUnavailable(null);

    if (!consultationId) {
      toast.error('Safety checks could not be completed. Try again before adding this treatment.');
      setSelectingId(null);
      return;
    }

    try {
      const result = await evaluateCandidate.mutateAsync({
        source: candidateSource(),
        medicationId: drug.id,
        medicationName: name,
        genericName: omitPlaceholderValue(drug.genericName) ?? undefined,
        route: presentation.route || undefined,
        rxcui: drug.rxcui,
        ndc: drug.ndc,
        existingTreatments: slimTreatmentsForEvaluate(existingTreatments),
      });

      if (result.duplicate.blocking) {
        setDuplicate(result.duplicate);
        setSelectingId(null);
        return;
      }
      if (result.duplicate.matchType === 'RELATED_INGREDIENT_DIFFERENT_ROUTE') {
        setRelated({ duplicate: result.duplicate, drug, result });
        setSelectingId(null);
        return;
      }
      if (result.candidate.normalizationStatus === 'UNRESOLVED') {
        toast.error(
          'This medication could not be verified for safety. Search again or enter a different medication.',
        );
        setSelectingId(null);
        return;
      }
      openMedicationEditor(drug, result);
    } catch (err) {
      const apiErr = err as ApiError;
      const payload = apiErr.message;
      const code =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload.code ?? apiErr.code
          : apiErr.code;
      if (apiErr.statusCode === 503 || code === 'SAFETY_UNAVAILABLE') {
        setSafetyUnavailable(drug);
      } else if (code === 'MEDICATION_IDENTITY_UNRESOLVED') {
        toast.error(
          'This medication could not be verified for safety. Search again or enter a different medication.',
        );
      } else {
        toast.error('This treatment could not be checked for duplicates. Try again.');
      }
      setSelectingId(null);
    }
  };

  const focusExistingAndClose = (dup: TreatmentCandidateDuplicate) => {
    onOpenChange(false);
    onFocusExistingTreatment?.({
      pathwayOptionId: dup.existingPathwayOptionId,
      treatmentInstanceId: dup.existingTreatmentInstanceId,
      displayName: dup.existingDisplayName,
    });
  };

  const medSearch = useDrugSearchInput({
    onSelect: (drug) => {
      selectionSourceRef.current = 'search';
      selectMedication(drug);
    },
    allowFreeText: false,
    clearOnSelect: true,
    refocusOnSelect: false,
    autoFocus: open && pickerActive && !initialMedication,
    initialQuery: initialSearchQuery ?? '',
  });

  const appliedInitialMedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedInitialMedRef.current = null;
      return;
    }
    if (!initialMedication?.id) return;
    if (appliedInitialMedRef.current === initialMedication.id) return;
    appliedInitialMedRef.current = initialMedication.id;
    selectionSourceRef.current = 'search';
    void selectMedication(initialMedication);
  }, [open, initialMedication]);

  useEffect(() => {
    if (!open || initialMedication || !initialSearchQuery?.trim()) return;
    medSearch.setQuery(initialSearchQuery.trim());
    medSearch.setOpen(true);
  }, [open, initialMedication, initialSearchQuery]);

  const requestClose = () => {
    medSearch.setOpen(false);
    setDeviceOpen(false);
    if (editorDirty && !pickerActive && !discardOpen) {
      setDiscardIntent('close');
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) medSearch.setQuery('');
  }, [open, medSearch.setQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDeviceDebounced(deviceQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [deviceQuery]);

  const deviceResults = useMemo(
    () => searchDevices(deviceDebounced),
    [deviceDebounced],
  );

  const selectDevice = (item: DeviceCatalogueItem) => {
    markDirty();
    setDevice((d) => ({
      ...d,
      manualEntry: false,
      deviceName: item.display,
      deviceType: item.deviceType,
      sizeSpecification: item.sizeSpecification ?? d.sizeSpecification,
      terminologyRef: {
        system: item.sourceMetadata.system,
        code: item.code,
        display: item.display,
        version: item.sourceMetadata.version,
      },
      useWith: item.deviceType.toLowerCase().includes('spacer')
        ? 'Metered-dose inhaler'
        : d.useWith,
      useSchedule: item.deviceType.toLowerCase().includes('spacer')
        ? 'With each inhaler dose'
        : d.useSchedule,
      directionsMode: 'AUTO',
    }));
    setDeviceQuery('');
    setDeviceOpen(false);
  };

  const handleSubmit = async () => {
    if (submitLock.current || submitting) return;
    const current = draft;
    const nextErrors = validateDraft(current);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const first = Object.keys(nextErrors)[0];
      firstErrorRef.current = first;
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        el?.focus();
      });
      toast.error('Review the highlighted treatment details.');
      return;
    }

    if (current.kind === 'MEDICATION' && !current.drugId) {
      toast.error(
        'This medication could not be verified for safety. Search again or enter a different medication.',
      );
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    let item = draftToRecommendation(current, priority);

    if (current.kind === 'MEDICATION' && consultationId) {
      try {
        const result = await evaluateCandidate.mutateAsync({
          treatmentInstanceId: candidateSafety?.candidate.treatmentInstanceId,
          source: candidateSource(),
          medicationId: current.drugId,
          medicationName: current.medicationDisplay,
          genericName: current.genericDisplay || undefined,
          route: current.route || undefined,
          rxcui: current.rxcui,
          ndc: current.ndc,
          existingTreatments: slimTreatmentsForEvaluate(existingTreatments),
        });
        if (result.duplicate.blocking) {
          setSubmitting(false);
          submitLock.current = false;
          setDuplicate(result.duplicate);
          return;
        }
        if (result.candidate.normalizationStatus === 'UNRESOLVED') {
          setSubmitting(false);
          submitLock.current = false;
          toast.error(
            'This medication could not be verified for safety. Search again or enter a different medication.',
          );
          return;
        }
        item = applyCandidateSafety(item, result);
        setCandidateSafety(result);
      } catch (err) {
        setSubmitting(false);
        submitLock.current = false;
        const apiErr = err as ApiError;
        if (apiErr.statusCode === 503) {
          setSafetyUnavailable(pendingDrugRef.current);
          return;
        }
        toast.error('Safety checks could not be completed. Try again before adding this treatment.');
        return;
      }
    } else if (current.kind === 'MEDICATION' && candidateSafety) {
      item = applyCandidateSafety(item, candidateSafety);
    }

    if (current.kind === 'MEDICATION' && current.drugId) {
      void recordUsage
        .mutateAsync(
          drugSearchToUsageInput(
            {
              id: current.drugId,
              brandName: current.medicationDisplay,
              genericName: current.genericDisplay || undefined,
              strength: current.strength,
              dosageForm: current.dosageForm,
              label: current.medicationDisplay,
              source:
                current.medicationCode?.system === 'CCDD'
                  ? 'ccdd'
                  : current.medicationCode?.system === 'rxnorm'
                    ? 'rxnorm'
                    : current.medicationCode?.system === 'openfda'
                      ? 'openfda'
                      : 'ccdd',
              rxcui: current.rxcui,
              ndc: current.ndc,
            },
            selectionSourceRef.current,
          ),
        )
        .catch(() => undefined);
    }
    setEditorDirty(false);
    setDiscardOpen(false);
    onOpenChange(false);
    onAdd([item]);
    toast.success(
      item.allergyBlocked
        ? `${item.medicationName} added under Avoid / not suitable`
        : successToastMessage
          ? successToastMessage(item.medicationName)
          : `${item.medicationName} added to the treatment plan`,
    );
  };

  const footerMessage =
    kind === 'DEVICE'
      ? 'Device details will be included in the treatment plan and documentation.'
      : kind === 'CUSTOM_COMPOUND'
        ? 'Custom compounds are documented without coded safety matching.'
        : candidateSafety?.safety?.status === 'AVOID'
          ? 'This medication is not suitable for this patient. It will be listed under Avoid / not suitable.'
          : 'Patient-specific safety checks run before this treatment is added.';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        hideCloseButton
        onEscapeKeyDown={(e) => {
          if (discardOpen) {
            e.preventDefault();
            cancelDiscard();
            return;
          }
          e.preventDefault();
          requestClose();
        }}
        onPointerDownOutside={(e) => {
          if (discardOpen) e.preventDefault();
        }}
        className={cn(
          'relative flex min-h-0 flex-col gap-0 overflow-hidden p-0 pointer-events-auto sm:rounded-2xl',
          pickerActive
            ? 'h-auto max-h-[90dvh] w-[min(640px,calc(100vw-24px))] max-w-[min(640px,calc(100vw-24px))]'
            : 'h-[90dvh] max-h-[90dvh] w-[min(960px,calc(100vw-48px))] max-w-[min(960px,calc(100vw-48px))]',
        )}
      >
          <div className="relative z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card px-6 pb-4 pt-5 sm:px-7">
            <div>
              <DialogTitle className="text-[22px] font-bold tracking-tight text-foreground sm:text-[24px]">
                {title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Add a medication, compound, or device to the treatment plan.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                requestClose();
              }}
              aria-label="Close add treatment"
              className="relative z-10 min-h-11 min-w-11 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-7">
            {pickerActive ? (
              <TreatmentPicker
                search={medSearch}
                searchError={errors.medicationDisplay}
                consultationId={consultationId}
                quickAddSource={quickAddSource}
                onQuickAddSourceChange={setQuickAddSource}
                pathwayActive={Boolean(selectedPathwayId)}
                excludedIds={excludedMedicationIds}
                excludedNames={existingMedicationNames}
                expanded={quickAddExpanded}
                onExpandedChange={setQuickAddExpanded}
                selectingId={selectingId}
                medicationOnly={medicationOnly}
                onSelectQuickAdd={(item) => {
                  selectionSourceRef.current = item.source;
                  setSelectingId(item.medicationId);
                  selectMedication(quickAddToDrugSearchResult(item));
                }}
                onCustomCompound={() => requestKind('CUSTOM_COMPOUND')}
                onDevice={() => requestKind('DEVICE')}
              />
            ) : null}

            {!medicationOnly && (view === 'compound-editor' || view === 'device-editor') ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                    {view === 'device-editor' ? (
                      <InhalerIcon className="h-5 w-5" />
                    ) : (
                      <FlaskConical className="h-5 w-5" />
                    )}
                  </span>
                  <p className="text-[16px] font-bold text-foreground">
                    {view === 'device-editor' ? 'Device' : 'Custom compound'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ModeActionButton onClick={() => requestKind('MEDICATION')}>
                    Use standard medication
                  </ModeActionButton>
                  {view === 'device-editor' ? (
                    <ModeActionButton onClick={() => requestKind('CUSTOM_COMPOUND')}>
                      <Plus className="h-3.5 w-3.5" />
                      Custom compound
                    </ModeActionButton>
                  ) : (
                    <ModeActionButton onClick={() => requestKind('DEVICE')}>
                      <Plus className="h-3.5 w-3.5" />
                      Device
                    </ModeActionButton>
                  )}
                </div>
              </div>
            ) : null}

            {view === 'standard-medication-editor' ? (
              <MedicationBody
                draft={medication}
                errors={errors}
                moreOpen={moreOpen}
                clinicalOpen={clinicalOpen}
                directionsNotice={directionsNotice && medication.directionsMode === 'MANUAL'}
                generated={generated}
                onApplyGenerated={applyGeneratedDirections}
                onToggleMore={() => setMoreOpen((v) => !v)}
                onToggleClinical={() => setClinicalOpen((v) => !v)}
                onChangeMedication={requestReturnToPicker}
                onSelectDrug={(drug) => {
                  selectionSourceRef.current = 'search';
                  selectMedication(drug);
                }}
                onPatch={(patch) => {
                  markDirty();
                  setMedication((d) => {
                    const next = { ...d, ...patch };
                    if (patch.quantityValue !== undefined) {
                      lastMedQtyRef.current = next.quantityValue.trim() || null;
                      return next;
                    }
                    if (patch.quantityUnit !== undefined) {
                      return withAutoDispenseQuantity(next, lastMedQtyRef);
                    }
                    return withAutoPrescriptionSupply(next, {
                      lastAutoQty: lastMedQtyRef,
                      lastAutoUnit: lastMedUnitRef,
                    });
                  });
                }}
                onDirections={setDirectionsManual}
                safetySlot={
                  <div className="space-y-3">
                    {candidateSafety?.safety?.allergyWarning?.reason ? (
                      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[13.5px] text-destructive">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <p>
                          <span className="font-semibold">Patient safety warning: </span>
                          {candidateSafety.safety.allergyWarning.reason}
                        </p>
                      </div>
                    ) : null}
                    {consultationId ? (
                      <TreatmentAddSafetyPreview
                        consultationId={consultationId}
                        medicationName={medication.medicationDisplay}
                        genericName={medication.genericDisplay || undefined}
                        acknowledged={safetyAck}
                        onAcknowledgedChange={setSafetyAck}
                      />
                    ) : null}
                  </div>
                }
              />
            ) : null}

            {view === 'compound-editor' ? (
              <CompoundBody
                draft={compound}
                errors={errors}
                moreOpen={moreOpen}
                clinicalOpen={clinicalOpen}
                directionsNotice={directionsNotice && compound.directionsMode === 'MANUAL'}
                generated={generated}
                onApplyGenerated={applyGeneratedDirections}
                onToggleMore={() => setMoreOpen((v) => !v)}
                onToggleClinical={() => setClinicalOpen((v) => !v)}
                onPatch={(patch) => {
                  markDirty();
                  setCompound((d) => {
                    const next = { ...d, ...patch };
                    if (patch.quantityValue !== undefined) {
                      lastCompoundQtyRef.current = next.quantityValue.trim() || null;
                      return next;
                    }
                    if (patch.quantityUnit !== undefined) {
                      return withAutoDispenseQuantity(next, lastCompoundQtyRef);
                    }
                    return withAutoPrescriptionSupply(next, {
                      lastAutoQty: lastCompoundQtyRef,
                      lastAutoUnit: lastCompoundUnitRef,
                    });
                  });
                }}
                onDirections={setDirectionsManual}
              />
            ) : null}

            {view === 'device-editor' ? (
              <DeviceBody
                draft={device}
                errors={errors}
                query={deviceQuery}
                results={deviceResults}
                listOpen={deviceOpen && deviceDebounced.length >= 2}
                activeIndex={deviceActive}
                listId={deviceListId}
                anchorRef={deviceAnchorRef}
                moreOpen={moreOpen}
                clinicalOpen={clinicalOpen}
                directionsNotice={directionsNotice && device.directionsMode === 'MANUAL'}
                generated={generated}
                previewDirections={previewDirections}
                onQuery={(v) => {
                  setDeviceQuery(v);
                  setDeviceOpen(true);
                }}
                onSelect={selectDevice}
                onActiveIndexChange={setDeviceActive}
                onPreview={() => setPreviewDirections(generated)}
                onApplyGenerated={applyGeneratedDirections}
                onCancelPreview={() => setPreviewDirections(null)}
                onToggleMore={() => setMoreOpen((v) => !v)}
                onToggleClinical={() => setClinicalOpen((v) => !v)}
                onSearchAgain={() => {
                  setDevice((d) => ({ ...d, manualEntry: false }));
                  requestAnimationFrame(() => {
                    deviceAnchorRef.current?.querySelector<HTMLInputElement>('input')?.focus();
                  });
                }}
                onManual={() => {
                  markDirty();
                  setDevice((d) => ({
                    ...d,
                    manualEntry: true,
                    terminologyRef: null,
                    deviceName: d.deviceName,
                  }));
                }}
                onClear={() => {
                  markDirty();
                  setDevice(emptyDeviceDraft());
                }}
                onCloseList={() => setDeviceOpen(false)}
                onPatch={(patch) => {
                  markDirty();
                  setDevice((d) => ({ ...d, ...patch }));
                }}
                onDirections={setDirectionsManual}
              />
            ) : null}
          </div>

          <div className="relative z-10 flex shrink-0 flex-col gap-3 border-t border-border bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="inline-flex items-start gap-2 text-[12.5px] text-muted-foreground sm:items-center">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
              {footerMessage}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-[6.5rem]"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  requestClose();
                }}
              >
                Cancel
              </Button>
              {!pickerActive ? (
                <Button
                  type="button"
                  className="h-11 min-w-[12.5rem]"
                  disabled={submitting || evaluateCandidate.isPending}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {confirmLabel}
                </Button>
              ) : null}
            </div>
          </div>

          {duplicate ? (
            <DuplicateTreatmentDialog
              duplicate={duplicate}
              onPrimary={() => {
                const dup = duplicate;
                setDuplicate(null);
                focusExistingAndClose(dup);
              }}
              onCancel={() => setDuplicate(null)}
            />
          ) : null}
          {related ? (
            <RelatedTreatmentDialog
              duplicate={related.duplicate}
              onContinue={() => {
                const pending = related;
                setRelated(null);
                openMedicationEditor(pending.drug, pending.result);
              }}
              onReview={() => {
                const dup = related.duplicate;
                setRelated(null);
                focusExistingAndClose(dup);
              }}
              onCancel={() => setRelated(null)}
            />
          ) : null}
          {safetyUnavailable ? (
            <SafetyUnavailableDialog
              onRetry={() => {
                const drug = safetyUnavailable;
                setSafetyUnavailable(null);
                void selectMedication(drug);
              }}
              onCancel={() => setSafetyUnavailable(null)}
            />
          ) : null}
          {discardOpen ? (
            <InDialogConfirm
              title="Discard treatment details?"
              description="The information entered in this window will be lost."
              cancelLabel="Keep editing"
              confirmLabel="Discard changes"
              onCancel={cancelDiscard}
              onConfirm={confirmDiscard}
            />
          ) : null}
        </DialogContent>
      </Dialog>
  );
}

function addTreatmentQuantityStatus(
  quantityValue: string,
  suggested: string | null,
): QuantityStatus {
  const current = quantityValue.trim();
  if (!current) return 'REVIEW_REQUIRED';
  if (suggested && suggested === current) return 'AUTO_CALCULATED';
  if (suggested && suggested !== current) return 'PHARMACIST_MODIFIED';
  return 'PATHWAY_SUGGESTED';
}

function AddTreatmentPrescriptionDetails({
  draft,
  errors,
  generated,
  directionsNotice,
  onPatch,
  onDirections,
  onApplyGenerated,
  productFormHint,
}: {
  draft: ReturnType<typeof emptyMedicationDraft> | ReturnType<typeof emptyCompoundDraft>;
  errors: FieldErrors;
  generated: string;
  directionsNotice: boolean;
  onPatch: (patch: {
    regimenLines?: RegimenLineDraft[];
    directionsMode?: 'AUTO' | 'MANUAL';
    route?: string;
    quantityValue?: string;
    quantityUnit?: string;
    refills?: number;
  }) => void;
  onDirections: (v: string) => void;
  onApplyGenerated: () => void;
  productFormHint?: string;
}) {
  const haystack =
    draft.kind === 'MEDICATION'
      ? [draft.medicationDisplay, draft.genericDisplay, draft.dosageForm].filter(Boolean).join(' ')
      : draft.compoundLabel;
  const productForm =
    inferProductForm(
      draft.kind === 'MEDICATION' ? draft.dosageForm : undefined,
      haystack || productFormHint || '',
    ) ||
    productFormHint ||
    '';
  const unitOptions = administrationUnitsFor(productForm, draft.route);
  const allowedQuantityUnits =
    findProductUseMapping(productForm, draft.route)?.allowedQuantityUnits ?? [];
  const mappedRoutes = productForm ? routesForProductForm(productForm) : [];
  const routeOptions =
    mappedRoutes.length > 0
      ? mappedRoutes
      : routeSelectOptions(draft.route).map((option) => option.value);
  const suggestedQty = formatSuggestedDispenseQuantity(draft.regimenLines, draft.quantityUnit);
  const showRoute = !draft.route.trim() || routeOptions.length > 1;

  return (
    <PrescriptionDetailsFields
      lines={draft.regimenLines}
      onLinesChange={(regimenLines) =>
        onPatch({
          regimenLines,
          directionsMode: draft.directionsMode === 'MANUAL' ? 'MANUAL' : 'AUTO',
        })
      }
      productForm={productForm}
      route={draft.route}
      medicationHaystack={haystack}
      unitOptions={unitOptions}
      routeOptions={routeOptions}
      showRoute={showRoute}
      onRouteChange={(route) => onPatch({ route })}
      patientDirections={draft.patientDirections}
      directionsSource={draft.directionsMode === 'MANUAL' ? 'PHARMACIST_EDITED' : 'GENERATED'}
      directionsError={errors.patientDirections}
      errors={errors}
      idPrefix={`add-${draft.kind.toLowerCase()}`}
      subtitle="Review and adjust before adding this treatment."
      showRegenerate={
        directionsNotice && draft.directionsMode === 'MANUAL' && Boolean(generated)
      }
      onDirectionsChange={onDirections}
      onDirectionsEdit={() => onDirections(draft.patientDirections)}
      onDirectionsRegenerate={onApplyGenerated}
      quantityValue={draft.quantityValue}
      quantityUnit={draft.quantityUnit}
      allowedQuantityUnits={allowedQuantityUnits}
      refills={draft.refills}
      quantityStatus={addTreatmentQuantityStatus(draft.quantityValue, suggestedQty)}
      onQuantityChange={onPatch}
    />
  );
}

function DirectionsBlock({
  value,
  error,
  notice,
  generated,
  preview,
  onChange,
  onPreview,
  onApply,
  onCancelPreview,
}: {
  value: string;
  error?: string;
  notice: boolean;
  generated: string;
  preview: string | null;
  onChange: (v: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onCancelPreview: () => void;
}) {
  return (
    <div className="space-y-2">
      <LabeledTextarea
        id="patient-directions"
        label="Patient directions"
        required
        autoGrow
        minLines={2}
        maxLines={4}
        value={value}
        error={error}
        onChange={onChange}
        placeholder="Directions for the patient…"
      />
      {notice && generated ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-[12.5px] text-amber-950">
          <p>Prescription details changed. Review the patient directions.</p>
          <button
            type="button"
            className="mt-1 font-semibold text-primary hover:underline"
            onClick={onPreview}
          >
            Update directions from prescription details
          </button>
        </div>
      ) : null}
      {preview ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[12px] font-semibold text-muted-foreground">Proposed directions</p>
          <p className="mt-1 text-[13.5px] text-foreground">{preview}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={onApply}>
              Replace directions
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancelPreview}>
              Keep current
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MedicationBody({
  draft,
  errors,
  moreOpen,
  clinicalOpen,
  directionsNotice,
  generated,
  onApplyGenerated,
  onToggleMore,
  onToggleClinical,
  onChangeMedication,
  onSelectDrug,
  onPatch,
  onDirections,
  safetySlot,
}: {
  draft: ReturnType<typeof emptyMedicationDraft>;
  errors: FieldErrors;
  moreOpen: boolean;
  clinicalOpen: boolean;
  directionsNotice: boolean;
  generated: string;
  onApplyGenerated: () => void;
  onToggleMore: () => void;
  onToggleClinical: () => void;
  onChangeMedication: () => void;
  onSelectDrug: (drug: DrugSearchResult) => void;
  onPatch: (patch: Partial<ReturnType<typeof emptyMedicationDraft>>) => void;
  onDirections: (v: string) => void;
  safetySlot?: ReactNode;
}) {
  const lookupName = (draft.genericDisplay || draft.medicationDisplay).trim();
  const selectedStrength = omitPlaceholderValue(draft.strength);
  const needsStrengthLookup =
    Boolean(draft.medicationDisplay.trim()) && !selectedStrength && lookupName.length >= 2;
  const { data: strengthHits = [], isFetching: strengthFetching } = useDrugSearch(
    lookupName,
    needsStrengthLookup,
    'medication',
  );
  const strengthOptions = useMemo(
    () => uniqueCcdDStrengthOptions(strengthHits),
    [strengthHits],
  );

  const generic = omitPlaceholderValue(draft.genericDisplay);
  const sameName =
    Boolean(generic) &&
    generic!.toLowerCase() === draft.medicationDisplay.trim().toLowerCase();
  const subtitle = sameName ? undefined : generic;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SelectedItemCard
          icon="pill"
          headingId="selected-medication-heading"
          title={formatMedicationCardTitle(
            draft.medicationDisplay,
            selectedStrength,
            omitPlaceholderValue(draft.dosageForm),
          )}
          subtitle={subtitle}
          action={
            <button
              type="button"
              onClick={onChangeMedication}
              className="min-h-11 rounded-md px-2 text-[13px] font-semibold text-primary hover:underline"
            >
              Change medication
            </button>
          }
        />
        {safetySlot}
        <FieldError message={errors.medicationDisplay} />
        {needsStrengthLookup && (strengthFetching || strengthOptions.length > 0) ? (
          <div className="rounded-xl border border-dashed border-primary/25 bg-card px-3.5 py-3">
            <p className="text-[12.5px] font-semibold text-foreground">
              Select product strength
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              This product was coded without a strength. Choose the matching product strength.
            </p>
            {strengthFetching && !strengthOptions.length ? (
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading strengths…
              </p>
            ) : null}
            {strengthOptions.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {strengthOptions.map((opt) => (
                  <button
                    key={`${opt.result.id}-${opt.strength}`}
                    type="button"
                    onClick={() => onSelectDrug(opt.result)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-2.5',
                      'text-[12.5px] font-semibold text-primary transition-colors',
                      'hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                    )}
                  >
                    {opt.strength}
                    {opt.dosageForm ? (
                      <span className="font-medium text-muted-foreground">
                        · {opt.dosageForm.toLowerCase()}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <AddTreatmentPrescriptionDetails
        draft={draft}
        errors={errors}
        generated={generated}
        directionsNotice={directionsNotice}
        onPatch={onPatch}
        onDirections={onDirections}
        onApplyGenerated={onApplyGenerated}
      />

      <div className="space-y-2.5">
        <ExpandableOptionalSection
          title="More prescription options"
          helper="Maximum dose, substitution, trial supply and pharmacy instructions"
          icon="clipboard"
          open={moreOpen}
          onToggle={onToggleMore}
        >
          <LabeledInput
            id="max-dose"
            label="Maximum dose"
            value={draft.maximumDose}
            onChange={(maximumDose) => onPatch({ maximumDose })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <CheckboxRow
              id="do-not-adapt"
              label="Do not adapt"
              checked={draft.doNotAdapt}
              onChange={(doNotAdapt) => onPatch({ doNotAdapt })}
            />
            <CheckboxRow
              id="do-not-sub"
              label="Do not allow substitutions"
              checked={draft.doNotSubstitute}
              onChange={(doNotSubstitute) => onPatch({ doNotSubstitute })}
            />
            <CheckboxRow
              id="trial"
              label="Trial dispense authorized"
              checked={draft.trialDispenseAuthorized}
              onChange={(trialDispenseAuthorized) => onPatch({ trialDispenseAuthorized })}
            />
            <CheckboxRow
              id="compliance"
              label="Compliance package required"
              checked={draft.compliancePackageRequired}
              onChange={(compliancePackageRequired) => onPatch({ compliancePackageRequired })}
            />
            <CheckboxRow
              id="confidential"
              label="Confidential"
              checked={draft.confidential}
              onChange={(confidential) => onPatch({ confidential })}
            />
          </div>
          <LabeledTextarea
            id="pharmacy-instructions"
            label="Pharmacy instructions"
            value={draft.pharmacyInstructions}
            onChange={(pharmacyInstructions) => onPatch({ pharmacyInstructions })}
            rows={2}
          />
        </ExpandableOptionalSection>
        <ExpandableOptionalSection
          title="Clinical documentation"
          helper="Rationale and monitoring / follow-up"
          icon="stethoscope"
          open={clinicalOpen}
          onToggle={onToggleClinical}
        >
          <LabeledTextarea
            id="clinical-rationale"
            label="Clinical rationale"
            value={draft.clinicalRationale}
            onChange={(clinicalRationale) => onPatch({ clinicalRationale })}
          />
          <LabeledTextarea
            id="monitoring"
            label="Monitoring / follow-up"
            value={draft.monitoringFollowUp}
            onChange={(monitoringFollowUp) => onPatch({ monitoringFollowUp })}
          />
        </ExpandableOptionalSection>
      </div>
    </div>
  );
}

function CompoundBody({
  draft,
  errors,
  moreOpen,
  clinicalOpen,
  directionsNotice,
  generated,
  onApplyGenerated,
  onToggleMore,
  onToggleClinical,
  onPatch,
  onDirections,
}: {
  draft: ReturnType<typeof emptyCompoundDraft>;
  errors: FieldErrors;
  moreOpen: boolean;
  clinicalOpen: boolean;
  directionsNotice: boolean;
  generated: string;
  onApplyGenerated: () => void;
  onToggleMore: () => void;
  onToggleClinical: () => void;
  onPatch: (patch: Partial<ReturnType<typeof emptyCompoundDraft>>) => void;
  onDirections: (v: string) => void;
}) {
  return (
    <div className="space-y-8">
      <NumberedSection title="Compound details">
        <LabeledInput
          id="compound-label"
          label="Compound name / label"
          required
          value={draft.compoundLabel}
          error={errors.compoundLabel}
          onChange={(compoundLabel) => onPatch({ compoundLabel })}
          placeholder="Hydrocortisone 1% / Clotrimazole 1% cream"
        />
        <LabeledTextarea
          id="compound-ingredients"
          label="Compound ingredients"
          required
          helper="Enter each ingredient and strength."
          helperPlacement="after"
          value={draft.compoundIngredientsText}
          error={errors.compoundIngredientsText}
          onChange={(compoundIngredientsText) => onPatch({ compoundIngredientsText })}
          placeholder="Hydrocortisone 1%; Clotrimazole 1%; cream base q.s."
          rows={2}
        />
        <LabeledTextarea
          id="preparation"
          label="Preparation details"
          value={draft.preparationDetails}
          onChange={(preparationDetails) => onPatch({ preparationDetails })}
          placeholder="Mix to a uniform cream."
          rows={2}
        />
      </NumberedSection>

      <AddTreatmentPrescriptionDetails
        draft={draft}
        errors={errors}
        generated={generated}
        directionsNotice={directionsNotice}
        onPatch={onPatch}
        onDirections={onDirections}
        onApplyGenerated={onApplyGenerated}
        productFormHint="Cream"
      />

      <div className="space-y-2.5">
        <ExpandableOptionalSection
          title="More prescription options"
          helper="Substitution, trial supply and pharmacy instructions"
          icon="clipboard"
          open={moreOpen}
          onToggle={onToggleMore}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <CheckboxRow
              id="c-do-not-adapt"
              label="Do not adapt"
              checked={draft.doNotAdapt}
              onChange={(doNotAdapt) => onPatch({ doNotAdapt })}
            />
            <CheckboxRow
              id="c-do-not-sub"
              label="Do not allow substitutions"
              checked={draft.doNotSubstitute}
              onChange={(doNotSubstitute) => onPatch({ doNotSubstitute })}
            />
            <CheckboxRow
              id="c-trial"
              label="Trial dispense authorized"
              checked={draft.trialDispenseAuthorized}
              onChange={(trialDispenseAuthorized) => onPatch({ trialDispenseAuthorized })}
            />
            <CheckboxRow
              id="c-confidential"
              label="Confidential"
              checked={draft.confidential}
              onChange={(confidential) => onPatch({ confidential })}
            />
          </div>
          <LabeledTextarea
            id="c-pharmacy"
            label="Pharmacy instructions"
            value={draft.pharmacyInstructions}
            onChange={(pharmacyInstructions) => onPatch({ pharmacyInstructions })}
            rows={2}
          />
        </ExpandableOptionalSection>
        <ExpandableOptionalSection
          title="Clinical documentation"
          helper="Rationale and monitoring / follow-up"
          icon="stethoscope"
          open={clinicalOpen}
          onToggle={onToggleClinical}
        >
          <LabeledTextarea
            id="c-rationale"
            label="Clinical rationale"
            value={draft.clinicalRationale}
            onChange={(clinicalRationale) => onPatch({ clinicalRationale })}
          />
          <LabeledTextarea
            id="c-monitoring"
            label="Monitoring / follow-up"
            value={draft.monitoringFollowUp}
            onChange={(monitoringFollowUp) => onPatch({ monitoringFollowUp })}
          />
        </ExpandableOptionalSection>
      </div>
    </div>
  );
}

function DeviceBody({
  draft,
  errors,
  query,
  results,
  listOpen,
  activeIndex,
  listId,
  anchorRef,
  moreOpen,
  clinicalOpen,
  directionsNotice,
  generated,
  previewDirections,
  onQuery,
  onSelect,
  onActiveIndexChange,
  onPreview,
  onApplyGenerated,
  onCancelPreview,
  onToggleMore,
  onToggleClinical,
  onSearchAgain,
  onManual,
  onClear,
  onCloseList,
  onPatch,
  onDirections,
}: {
  draft: ReturnType<typeof emptyDeviceDraft>;
  errors: FieldErrors;
  query: string;
  results: DeviceCatalogueItem[];
  listOpen: boolean;
  activeIndex: number;
  listId: string;
  anchorRef: RefObject<HTMLDivElement | null>;
  moreOpen: boolean;
  clinicalOpen: boolean;
  directionsNotice: boolean;
  generated: string;
  previewDirections: string | null;
  onQuery: (v: string) => void;
  onSelect: (item: DeviceCatalogueItem) => void;
  onActiveIndexChange: (i: number) => void;
  onPreview: () => void;
  onApplyGenerated: () => void;
  onCancelPreview: () => void;
  onToggleMore: () => void;
  onToggleClinical: () => void;
  onSearchAgain: () => void;
  onManual: () => void;
  onClear: () => void;
  onCloseList: () => void;
  onPatch: (patch: Partial<ReturnType<typeof emptyDeviceDraft>>) => void;
  onDirections: (v: string) => void;
}) {
  return (
    <div className="space-y-8">
      <NumberedSection title="Select device">
        {draft.manualEntry ? (
          <div className="space-y-3">
            <LabeledInput
              id="device-name"
              label="Device name"
              required
              value={draft.deviceName}
              error={errors.deviceName}
              onChange={(deviceName) => onPatch({ deviceName })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledInput
                id="device-type"
                label="Device type / category"
                value={draft.deviceType}
                onChange={(deviceType) => onPatch({ deviceType })}
              />
              <LabeledInput
                id="brand-model"
                label="Brand / model"
                value={draft.brandModel}
                onChange={(brandModel) => onPatch({ brandModel })}
              />
            </div>
            <LabeledInput
              id="size-manual"
              label="Size / specification"
              value={draft.sizeSpecification}
              onChange={(sizeSpecification) => onPatch({ sizeSpecification })}
            />
            <button
              type="button"
              className="text-[13px] font-semibold text-primary hover:underline"
              onClick={onSearchAgain}
            >
              Search devices instead
            </button>
          </div>
        ) : (
          <>
            <div>
              <div
                ref={anchorRef}
                className={cn(
                  'relative rounded-[10px] border bg-background',
                  listOpen && 'border-primary/40 ring-2 ring-primary/15',
                )}
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  placeholder="Search devices by name or type"
                  aria-label="Search devices by name or type"
                  role="combobox"
                  aria-expanded={listOpen}
                  aria-controls={listId}
                  className="h-11 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
                  onChange={(e) => onQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      onActiveIndexChange(Math.min(activeIndex + 1, Math.max(results.length - 1, 0)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      onActiveIndexChange(Math.max(activeIndex - 1, 0));
                    } else if (e.key === 'Enter' && results[activeIndex]) {
                      e.preventDefault();
                      onSelect(results[activeIndex]);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      onCloseList();
                    }
                  }}
                />
              </div>
              <DeviceSearchDropdown
                open={listOpen}
                anchorRef={anchorRef}
                listId={listId}
                results={results}
                query={query}
                activeIndex={activeIndex}
                onActiveIndexChange={onActiveIndexChange}
                onSelect={onSelect}
              />
              <FieldError message={errors.deviceName} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground">Can’t find the device?</p>
              <ModeActionButton onClick={onManual}>
                <Plus className="h-3.5 w-3.5" />
                Enter device manually
              </ModeActionButton>
            </div>

            {draft.deviceName ? (
              <SelectedItemCard
                icon="device"
                title={draft.deviceName}
                subtitle={draft.deviceType || undefined}
                onRemove={onClear}
                removeLabel={`Remove ${draft.deviceName}`}
              />
            ) : null}
          </>
        )}
      </NumberedSection>

      {draft.deviceName.trim() || draft.manualEntry ? (
      <NumberedSection
        title="Supply and directions"
        alerts={collectPrescriptionFieldAlerts([], errors)}
      >
        <div className="space-y-2.5">
          <SubsectionLabel>Device use details</SubsectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LabeledSelect
            id="size-spec"
            label="Size / specification"
            value={draft.sizeSpecification}
            onChange={(sizeSpecification) => onPatch({ sizeSpecification })}
            options={(draft.sizeSpecification &&
            !(DEVICE_SIZE_OPTIONS as readonly string[]).includes(draft.sizeSpecification)
              ? [draft.sizeSpecification, ...DEVICE_SIZE_OPTIONS]
              : [...DEVICE_SIZE_OPTIONS]
            ).map((v) => ({ value: v, label: v }))}
            placeholder="Select"
          />
          <LabeledInput
            id="use-with"
            label="Use with (optional)"
            value={draft.useWith}
            onChange={(useWith) => onPatch({ useWith })}
          />
          <LabeledSelect
            id="use-schedule"
            label="Use schedule (optional)"
            value={draft.useSchedule}
            onChange={(useSchedule) => onPatch({ useSchedule })}
            options={DEVICE_SCHEDULE_OPTIONS.map((v) => ({ value: v, label: v }))}
            placeholder="Select"
          />
          <LabeledSelect
            id="device-duration"
            label="Duration"
            value={draft.durationDisplay}
            onChange={(durationDisplay) => onPatch({ durationDisplay })}
            options={DEVICE_DURATION_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
          </div>
        </div>
        <div className="mt-5">
          <DirectionsBlock
            value={draft.patientDirections}
            error={errors.patientDirections}
            notice={directionsNotice}
            generated={generated}
            preview={previewDirections}
            onChange={onDirections}
            onPreview={onPreview}
            onApply={onApplyGenerated}
            onCancelPreview={onCancelPreview}
          />
        </div>
        <div className="mt-5 space-y-2.5">
          <SubsectionLabel>Device supply</SubsectionLabel>
          <QuantityAndRefillsFields
            quantity={draft.quantityValue}
            quantityUnit={draft.quantityUnit}
            refills={draft.refills}
            showRoute={false}
            errors={errors}
            onChange={onPatch}
          />
        </div>
      </NumberedSection>
      ) : (
      <NumberedSection title="Supply and directions">
        <p className="rounded-xl border border-dashed border-border bg-muted/25 px-4 py-3.5 text-[13.5px] text-muted-foreground">
          Select or enter a device to add supply and directions.
        </p>
      </NumberedSection>
      )}

      {draft.deviceName.trim() || draft.manualEntry ? (
      <div className="space-y-2.5">
        <ExpandableOptionalSection
          title="Additional device details"
          helper="Brand, model, compatibility, replacement interval and pharmacy instructions"
          icon="clipboard"
          open={moreOpen}
          onToggle={onToggleMore}
        >
          <LabeledInput
            id="d-brand"
            label="Brand / model"
            value={draft.brandModel}
            onChange={(brandModel) => onPatch({ brandModel })}
          />
          <LabeledInput
            id="d-replace"
            label="Replacement interval"
            value={draft.replacementInterval}
            onChange={(replacementInterval) => onPatch({ replacementInterval })}
          />
          <LabeledTextarea
            id="d-pharmacy"
            label="Pharmacy instructions"
            value={draft.pharmacyInstructions}
            onChange={(pharmacyInstructions) => onPatch({ pharmacyInstructions })}
            rows={2}
          />
        </ExpandableOptionalSection>
        <ExpandableOptionalSection
          title="Clinical documentation"
          helper="Rationale and monitoring / follow-up"
          icon="stethoscope"
          open={clinicalOpen}
          onToggle={onToggleClinical}
        >
          <LabeledTextarea
            id="d-rationale"
            label="Clinical rationale"
            value={draft.clinicalRationale}
            onChange={(clinicalRationale) => onPatch({ clinicalRationale })}
          />
          <LabeledTextarea
            id="d-monitoring"
            label="Monitoring / follow-up"
            value={draft.monitoringFollowUp}
            onChange={(monitoringFollowUp) => onPatch({ monitoringFollowUp })}
          />
        </ExpandableOptionalSection>
      </div>
      ) : null}
    </div>
  );
}
