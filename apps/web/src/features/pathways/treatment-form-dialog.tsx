'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Info,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DrugSearchCombobox } from '@/features/consultations/drug-search-combobox';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import type { ClinicalTreatment, PathwayEvidenceLibraryReference, TreatmentCategory } from './types';
import {
  PHARMACOLOGICAL_TREATMENT_CATEGORIES,
  TREATMENT_CATEGORIES,
} from './pathway-constants';
import {
  normalizeClinicalYesNo,
  isPersistedPathwayTreatment,
  TREATMENT_LIBRARY_POPULATION_LABELS,
  normalizeStoredRenalDosing,
  parseRenalDosingRulesJson,
  validateRenalDosingRules,
  citationDisplay,
  uniqueIdList,
  type PathwayOwnedTreatmentFields,
  type RenalDosingBasis,
  type RenalDosingRule,
  type TreatmentLibraryPopulation,
  type TreatmentLibraryStatus,
} from '@safescript/shared';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RenalConfigurationPanel } from './renal-configuration-panel';
import { LinkReferenceDialog } from './presentation-review/link-reference-dialog';
import { LINE_OF_THERAPY_OPTIONS } from './treatments/utils';
import {
  composeAdminDirections,
  composeDuration,
  composeRegimenDoseDisplay,
  createEmptyRegimen,
  DURATION_UNITS,
  parseDuration,
  type TreatmentEditorMode,
  type TreatmentRegimenDraft,
} from './treatment-option-editor-constants';
import {
  administrationUnitsFor,
  inferProductForm,
  isMassOrDoseUnit,
  MAPPED_ROUTES,
  PRODUCT_FORMS,
  PRODUCT_USE_MAPPING_VERSION,
  preferredAdministrationUnit,
  reconcileRegimenUse,
  routesForProductForm,
  validateProductUse,
} from './product-use-mapping';
import { composePatientDirections } from '@/features/consultations/add-treatment/directions';
import { emptyRegimenLine } from '@/features/consultations/add-treatment/constants';
import type { RegimenLineDraft } from '@/features/consultations/add-treatment/types';
import { PrescriptionDetailsFields } from '@/features/treatment-editor/prescription-details-fields';
import { TimingSelector } from '@/features/treatment-editor/timing-selector';
import { buildTimingConfiguration } from '@/features/treatment-editor/build-timing-menu';
import {
  linesFromTreatment,
  linesToRegimen,
  serializeRegimenLines,
} from '@/features/treatment-editor/pathway-regimen-lines';

const schema = z
  .object({
    medicationName: z.string().min(1, 'Treatment name is required'),
    genericName: z.string().optional(),
    brandName: z.string().optional(),
    category: z.enum(['PRESCRIPTION', 'OTC', 'SUPPLEMENT', 'NON_DRUG']),
    recommendationLevel: z.enum([
      'FIRST_LINE',
      'SECOND_LINE',
      'ALTERNATIVE',
      'ADJUNCTIVE',
      'SUPPORTIVE_CARE',
      'SPECIALIST',
    ]),
    displayOrder: z.coerce.number().int().min(1, 'Display order must be 1 or greater'),
    strength: z.string().optional(),
    dose: z.string().optional(),
    route: z.string().optional(),
    frequency: z.string().optional(),
    duration: z.string().optional(),
    quantity: z.string().optional(),
    directions: z.string().optional(),
    clinicalIndication: z.string().optional(),
    clinicalNotes: z.string().max(500, 'Keep Why this option? to 500 characters').optional(),
    guidelineReference: z.string().optional(),
    evidenceStrength: z.string().optional(),
    eligibility: z.string().optional(),
    monitoring: z.string().optional(),
    renalAdjustment: z.string().optional(),
    hepaticAdjustment: z.string().optional(),
    pregnancyNotes: z.string().optional(),
    pregnancyReason: z.string().optional(),
    renalAdjustmentReason: z.string().optional(),
    renalDosingBasis: z.enum(['CrCl', 'eGFR', 'NONE']).optional(),
    renalDosingRules: z.array(z.any()).optional(),
    hepaticAdjustmentReason: z.string().optional(),
    monitoringReason: z.string().optional(),
    counsellingNotes: z.string().optional(),
    followUpAdvice: z.string().optional(),
    ageRestriction: z.string().optional(),
    provinceAvailability: z.string().optional(),
    breastfeedingNotes: z.string().optional(),
    lactationReason: z.string().optional(),
    population: z.enum(['ADULT', 'PEDIATRIC', 'WEIGHT_BASED', 'OTHER']).optional(),
    evidenceRefIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const isMed =
      data.category === 'PRESCRIPTION' ||
      data.category === 'OTC' ||
      data.category === 'SUPPLEMENT';

    if (isMed) {
      if (!data.genericName?.trim() && data.category !== 'SUPPLEMENT') {
        ctx.addIssue({
          code: 'custom',
          path: ['genericName'],
          message: 'Select a medication or enter the active ingredient',
        });
      }
      if (!data.dose?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['dose'], message: 'Dose is required' });
      }
      if (!data.route?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['route'], message: 'Route is required' });
      }
      if (!data.frequency?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['frequency'],
          message: 'Frequency is required',
        });
      }
      if (!data.directions?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['directions'],
          message: 'Patient directions are required',
        });
      }
      if (data.category === 'PRESCRIPTION' && !data.duration?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['duration'],
          message: 'Duration is required',
        });
      }
    }

    if (data.category === 'NON_DRUG') {
      if (!data.directions?.trim() && !data.clinicalIndication?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['directions'],
          message: 'Treatment instructions are required',
        });
      }
    }

    if (isMed) {
      for (const [flag, reason, label] of [
        ['renalAdjustment', 'renalAdjustmentReason', 'Renal adjustment'],
        ['hepaticAdjustment', 'hepaticAdjustmentReason', 'Hepatic adjustment'],
        ['pregnancyNotes', 'pregnancyReason', 'Pregnancy consideration'],
        ['breastfeedingNotes', 'lactationReason', 'Lactation consideration'],
        ['monitoring', 'monitoringReason', 'Lab monitoring'],
      ] as const) {
        if (!data[flag]?.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: [flag],
            message: `${label} must be answered Yes or No`,
          });
        } else if (data[flag] === 'Yes' && !data[reason]?.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: [reason],
            message: `${label} configuration is required when Yes`,
          });
        }
      }

      if (data.renalAdjustment === 'Yes') {
        const parsed = parseRenalDosingRulesJson(data.renalDosingRules ?? []);
        if (!parsed.ok) {
          ctx.addIssue({
            code: 'custom',
            path: ['renalDosingRules'],
            message: parsed.error,
          });
        } else {
          for (const issue of validateRenalDosingRules(parsed.rules)) {
            ctx.addIssue({
              code: 'custom',
              path: ['renalDosingRules'],
              message: issue.message,
            });
          }
          if (parsed.rules.length > 0 && (!data.renalDosingBasis || data.renalDosingBasis === 'NONE')) {
            ctx.addIssue({
              code: 'custom',
              path: ['renalDosingBasis'],
              message: 'Renal dosing basis is required when structured rules are present',
            });
          }
        }
      }
    }
  });

export type TreatmentFormData = z.infer<typeof schema> & {
  metadata?: Record<string, unknown>;
  approved?: boolean;
};

export interface TreatmentEditorContext {
  pathwayName: string;
  condition?: string;
  jurisdiction?: string;
}

export type TreatmentFormContext = 'pathway' | 'library';
export type LibraryEditorFooter = 'draft' | 'approved' | 'review';
export type LibraryEditorAction = 'back' | 'usage' | 'newVersion' | 'requestChanges' | 'approve';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatment?: ClinicalTreatment | null;
  defaultCategory?: TreatmentCategory;
  loading?: boolean;
  context?: TreatmentEditorContext;
  onSubmit: (data: TreatmentFormData, mode: TreatmentEditorMode) => Promise<void>;
  formContext?: TreatmentFormContext;
  presentation?: 'dialog' | 'page';
  readOnly?: boolean;
  libraryStatus?: TreatmentLibraryStatus | null;
  libraryFooter?: LibraryEditorFooter;
  onLibraryAction?: (action: LibraryEditorAction) => void;
  libraryLink?: {
    treatmentLibraryItemId: string;
    displayName: string;
    regimenLabel: string;
    productFormDisplay: string;
    routeDisplay: string;
    sourceVersionNumber: number;
    matchStatus?: string;
    sourceSnapshot?: Record<string, unknown>;
  } | null;
  onChangeLibraryTreatment?: (current: PathwayOwnedTreatmentFields) => void;
  onRemoveLibraryLink?: () => void;
  onViewLibrarySource?: () => void;
  evidenceLibrary?: PathwayEvidenceLibraryReference[];
  canEditEvidence?: boolean;
  onManageEvidenceLibrary?: () => void;
  onPersistEvidenceIds?: (ids: string[]) => Promise<void> | void;
}

type SafetyFlagField =
  | 'renalAdjustment'
  | 'hepaticAdjustment'
  | 'pregnancyNotes'
  | 'breastfeedingNotes'
  | 'monitoring';

type SafetyReasonField =
  | 'renalAdjustmentReason'
  | 'hepaticAdjustmentReason'
  | 'pregnancyReason'
  | 'lactationReason'
  | 'monitoringReason';

type LegacyRegimen = Partial<TreatmentRegimenDraft> & {
  unit?: string;
  duration?: string;
};

function drugFromTreatment(treatment: ClinicalTreatment): DrugSearchResult | null {
  const meta = (treatment.metadata ?? {}) as Record<string, unknown>;
  const concept =
    meta.medicationConcept && typeof meta.medicationConcept === 'object'
      ? (meta.medicationConcept as Record<string, unknown>)
      : null;
  if (!concept && !treatment.genericName && !treatment.brandName) return null;
  const sourceRaw = String(concept?.terminologySystem ?? 'ccdd');
  const source: DrugSearchResult['source'] = (
    ['ccdd', 'rxnorm', 'openfda', 'transcript', 'manual'] as const
  ).includes(sourceRaw as DrugSearchResult['source'])
    ? (sourceRaw as DrugSearchResult['source'])
    : 'ccdd';
  return {
    id: String(concept?.conceptId ?? treatment.id),
    brandName: treatment.brandName || String(concept?.display ?? ''),
    genericName: treatment.genericName ?? undefined,
    strength: treatment.strength ?? undefined,
    dosageForm: String(concept?.doseForm ?? meta.productForm ?? '') || undefined,
    label: String(concept?.display ?? treatment.medicationName),
    source,
  };
}

function statusFromTreatment(treatment?: ClinicalTreatment | null): {
  label: string;
  className: string;
} {
  if (!treatment) {
    return {
      label: 'Draft',
      className: 'border-[#C5D0D4] bg-[#F4F7F8] text-[#52606D]',
    };
  }
  if (treatment.archivedAt) {
    return {
      label: 'Archived',
      className: 'border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]',
    };
  }
  if (treatment.approved) {
    return {
      label: 'Published',
      className: 'border-[#ACD8D5] bg-[#EFF9F8] text-[#0F6F6B]',
    };
  }
  return {
    label: 'Draft',
    className: 'border-[#C5D0D4] bg-[#F4F7F8] text-[#52606D]',
  };
}

function statusFromLibrary(
  status?: TreatmentLibraryStatus | null,
  treatment?: ClinicalTreatment | null,
) {
  if (status === 'APPROVED') {
    return {
      label: 'Approved',
      className: 'border-[#ACD8D5] bg-[#EFF9F8] text-[#0F6F6B]',
    };
  }
  if (status === 'IN_REVIEW') {
    return {
      label: 'In review',
      className: 'border-[#F6D7A8] bg-[#FFF8EB] text-[#B45309]',
    };
  }
  if (status === 'CHANGES_REQUESTED') {
    return {
      label: 'Needs review',
      className: 'border-[#F6D7A8] bg-[#FFF8EB] text-[#B45309]',
    };
  }
  if (status === 'RETIRED') {
    return {
      label: 'Retired',
      className: 'border-[#E5E7EB] bg-[#F3F4F6] text-[#6B7280]',
    };
  }
  return statusFromTreatment(treatment);
}

const emptyDefaults = (
  category: TreatmentCategory = 'PRESCRIPTION',
  displayOrder = 1,
): z.infer<typeof schema> => ({
  medicationName: '',
  genericName: '',
  brandName: '',
  category,
  recommendationLevel: 'FIRST_LINE',
  displayOrder,
  strength: '',
  dose: '',
  route: '',
  frequency: '',
  duration: '',
  quantity: '',
  directions: '',
  clinicalIndication: '',
  clinicalNotes: '',
  guidelineReference: '',
  evidenceStrength: '',
  eligibility: '',
  monitoring: '',
  renalAdjustment: '',
  hepaticAdjustment: '',
  pregnancyNotes: '',
  pregnancyReason: '',
  renalAdjustmentReason: '',
  renalDosingBasis: 'NONE',
  renalDosingRules: [],
  hepaticAdjustmentReason: '',
  monitoringReason: '',
  counsellingNotes: '',
  followUpAdvice: '',
  ageRestriction: '',
  provinceAvailability: 'ALL',
  breastfeedingNotes: '',
  lactationReason: '',
  population: 'ADULT',
  evidenceRefIds: [],
});

function normalizeRegimenDraft(
  raw: LegacyRegimen,
  index: number,
  treatment?: ClinicalTreatment | null,
): TreatmentRegimenDraft {
  const meta = (treatment?.metadata ?? {}) as Record<string, unknown>;
  const parsed = parseDuration(
    raw.duration ?? (index === 0 ? treatment?.duration : undefined),
  );
  const inferredForm =
    raw.productForm?.trim() ||
    (typeof meta.productForm === 'string' ? meta.productForm : '') ||
    inferProductForm(
      typeof meta.doseForm === 'string' ? meta.doseForm : undefined,
      [treatment?.medicationName, treatment?.brandName].filter(Boolean).join(' '),
    ) ||
    '';
  const legacyUnit = raw.administrationUnit || raw.unit || '';
  const reconciled = reconcileRegimenUse({
    productForm: inferredForm,
    route: raw.route ?? (index === 0 ? treatment?.route ?? '' : ''),
    administrationUnit: isMassOrDoseUnit(legacyUnit) ? '' : legacyUnit,
  });
  const empty = createEmptyRegimen(index);
  return {
    id: raw.id || `regimen-${treatment?.id ?? 'new'}-${index}`,
    label: raw.label || empty.label,
    dose: raw.dose ?? (index === 0 ? treatment?.dose ?? '' : ''),
    administrationUnit: reconciled.administrationUnit,
    productForm: reconciled.productForm,
    frequency: raw.frequency ?? (index === 0 ? treatment?.frequency ?? '' : ''),
    route: reconciled.route,
    durationValue: raw.durationValue ?? parsed.durationValue,
    durationUnit: raw.durationUnit ?? parsed.durationUnit,
  };
}

function regimensFromTreatment(treatment?: ClinicalTreatment | null): TreatmentRegimenDraft[] {
  const meta = treatment?.metadata as { regimens?: LegacyRegimen[] } | null | undefined;
  if (Array.isArray(meta?.regimens) && meta.regimens.length) {
    return meta.regimens.map((r, i) => normalizeRegimenDraft(r, i, treatment));
  }
  if (!treatment) return [createEmptyRegimen()];
  return [normalizeRegimenDraft({}, 0, treatment)];
}

function syncPrimaryRegimen(
  formSet: (name: keyof z.infer<typeof schema>, value: string) => void,
  regimen: TreatmentRegimenDraft,
) {
  formSet('dose', composeRegimenDoseDisplay(regimen));
  formSet('frequency', regimen.frequency);
  formSet('route', regimen.route);
  formSet('duration', composeDuration(regimen.durationValue, regimen.durationUnit));
}

export function TreatmentFormDialog({
  open,
  onOpenChange,
  treatment,
  defaultCategory = 'PRESCRIPTION',
  loading,
  context,
  onSubmit,
  formContext = 'pathway',
  presentation = 'dialog',
  readOnly = false,
  libraryStatus,
  libraryFooter,
  onLibraryAction,
  libraryLink,
  onChangeLibraryTreatment,
  onRemoveLibraryLink,
  onViewLibrarySource,
  evidenceLibrary,
  canEditEvidence = true,
  onManageEvidenceLibrary,
  onPersistEvidenceIds,
}: Props) {
  const [selectedDrug, setSelectedDrug] = useState<DrugSearchResult | null>(null);
  const [regimens, setRegimens] = useState<TreatmentRegimenDraft[]>([createEmptyRegimen()]);
  const [regimenLines, setRegimenLines] = useState<RegimenLineDraft[]>([emptyRegimenLine()]);
  const [directionsMode, setDirectionsMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [section1Open, setSection1Open] = useState(true);
  const [section2Open, setSection2Open] = useState(true);
  const [activeMode, setActiveMode] = useState<TreatmentEditorMode | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [pendingClearSafety, setPendingClearSafety] = useState<{
    field: SafetyFlagField;
    reasonField: SafetyReasonField;
  } | null>(null);
  const directionsTouched = useRef(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: emptyDefaults(defaultCategory),
    mode: 'onBlur',
  });

  const category = form.watch('category');
  const pregnancyFlag = form.watch('pregnancyNotes');
  const lactationFlag = form.watch('breastfeedingNotes');
  const renalFlag = form.watch('renalAdjustment');
  const renalDosingBasis = form.watch('renalDosingBasis');
  const renalDosingRules = form.watch('renalDosingRules');
  const renalAdjustmentReason = form.watch('renalAdjustmentReason');
  const hepaticFlag = form.watch('hepaticAdjustment');
  const monitoringFlag = form.watch('monitoring');

  const isMedicationType =
    category === 'PRESCRIPTION' || category === 'OTC' || category === 'SUPPLEMENT';
  const isLibrary = formContext === 'library';
  const isOpen = presentation === 'page' || open;
  const status = isLibrary
    ? statusFromLibrary(libraryStatus, treatment)
    : statusFromTreatment(treatment);

  useEffect(() => {
    if (!isOpen) {
      setSelectedDrug(null);
      setValidationMessages([]);
      setActiveMode(null);
      setPendingClearSafety(null);
      directionsTouched.current = false;
      return;
    }

    if (treatment) {
      const nextRegimens = regimensFromTreatment(treatment);
      const meta = (treatment.metadata ?? {}) as Record<string, unknown>;
      const renalFromTreatment = normalizeStoredRenalDosing({
        renalAdjustment: treatment.renalAdjustment,
        renalAdjustmentReason: treatment.renalAdjustmentReason,
        renalDosingBasis: treatment.renalDosingBasis,
        renalDosingRules: treatment.renalDosingRules,
      });
      setRegimens(nextRegimens);
      setRegimenLines(linesFromTreatment(treatment, nextRegimens[0] ?? createEmptyRegimen()));
      setSelectedDrug(drugFromTreatment(treatment));
      directionsTouched.current = Boolean(treatment.directions?.trim());
      setDirectionsMode(treatment.directions?.trim() ? 'MANUAL' : 'AUTO');
      form.reset({
        ...emptyDefaults(treatment.category, Math.max(1, treatment.displayOrder + 1)),
        medicationName: treatment.medicationName,
        genericName: treatment.genericName ?? '',
        brandName: treatment.brandName ?? '',
        category: treatment.category ?? 'PRESCRIPTION',
        recommendationLevel: treatment.recommendationLevel ?? 'FIRST_LINE',
        displayOrder: Math.max(1, treatment.displayOrder || 1),
        strength: treatment.strength ?? '',
        dose: treatment.dose ?? '',
        route: treatment.route ?? '',
        frequency: treatment.frequency ?? '',
        duration: treatment.duration ?? '',
        quantity: treatment.quantity ?? '',
        directions: treatment.directions ?? '',
        clinicalIndication: treatment.clinicalIndication ?? '',
        clinicalNotes: treatment.clinicalNotes ?? '',
        guidelineReference: treatment.guidelineReference ?? '',
        evidenceStrength: treatment.evidenceStrength ?? '',
        eligibility: treatment.eligibility ?? '',
        monitoring: normalizeClinicalYesNo(treatment.monitoring),
        renalAdjustment: normalizeClinicalYesNo(treatment.renalAdjustment),
        hepaticAdjustment: normalizeClinicalYesNo(treatment.hepaticAdjustment),
        pregnancyNotes: normalizeClinicalYesNo(treatment.pregnancyNotes),
        pregnancyReason: treatment.pregnancyReason ?? '',
        renalAdjustmentReason: treatment.renalAdjustmentReason ?? '',
        renalDosingBasis:
          normalizeClinicalYesNo(treatment.renalAdjustment) === 'Yes'
            ? renalFromTreatment.renalDosingBasis === 'eGFR'
              ? 'eGFR'
              : 'CrCl'
            : 'NONE',
        renalDosingRules: renalFromTreatment.renalDosingRules,
        hepaticAdjustmentReason: treatment.hepaticAdjustmentReason ?? '',
        monitoringReason: treatment.monitoringReason ?? '',
        counsellingNotes: treatment.counsellingNotes ?? '',
        followUpAdvice: treatment.followUpAdvice ?? '',
        ageRestriction: treatment.ageRestriction ?? '',
        provinceAvailability: treatment.provinceAvailability ?? 'ALL',
        breastfeedingNotes: normalizeClinicalYesNo(treatment.breastfeedingNotes),
        lactationReason:
          typeof meta.lactationReason === 'string' ? meta.lactationReason : '',
        population: (['ADULT', 'PEDIATRIC', 'WEIGHT_BASED', 'OTHER'] as const).includes(
          meta.population as TreatmentLibraryPopulation,
        )
          ? (meta.population as TreatmentLibraryPopulation)
          : 'ADULT',
        evidenceRefIds: uniqueIdList(treatment.evidenceRefIds),
      });
      if (nextRegimens[0]) {
        syncPrimaryRegimen(
          (name, value) => form.setValue(name, value, { shouldValidate: false }),
          nextRegimens[0],
        );
      }
    } else {
      setRegimens([createEmptyRegimen()]);
      setRegimenLines([emptyRegimenLine()]);
      setSelectedDrug(null);
      directionsTouched.current = false;
      setDirectionsMode('AUTO');
      form.reset(emptyDefaults(defaultCategory));
    }
  }, [isOpen, treatment, defaultCategory, form]);

  const categoryLabel = useMemo(() => {
    const meta = TREATMENT_CATEGORIES.find((c) => c.value === category);
    return meta ? `${meta.shortLabel} treatment` : 'Treatment';
  }, [category]);

  const contextLine = useMemo(() => {
    const parts = [
      context?.pathwayName || context?.condition || 'Pathway',
      context?.jurisdiction || undefined,
      categoryLabel,
    ].filter(Boolean);
    return parts.join(' • ');
  }, [context, categoryLabel]);

  const applyRegimenPatch = (
    current: TreatmentRegimenDraft,
    patch: Partial<TreatmentRegimenDraft>,
  ): TreatmentRegimenDraft => {
    const merged = { ...current, ...patch };
    const reconciled = reconcileRegimenUse({
      productForm: merged.productForm,
      route: merged.route,
      administrationUnit: merged.administrationUnit,
    });
    return { ...merged, ...reconciled };
  };

  const maybeSyncDirections = (
    nextRegimens: TreatmentRegimenDraft[],
    nextLines?: RegimenLineDraft[],
  ) => {
    if (directionsTouched.current) return;
    const primary = nextRegimens[0] ?? createEmptyRegimen();
    const generated =
      composePatientDirections(nextLines ?? regimenLines, primary.route) ||
      composeAdminDirections(primary);
    form.setValue('directions', generated, { shouldDirty: true });
  };

  const applyDrug = (drug: DrugSearchResult) => {
    setSelectedDrug(drug);
    const strength = drug.strength ?? '';
    const productForm = inferProductForm(drug.dosageForm, drug.label) ?? '';
    const currentName = form.getValues('medicationName')?.trim();
    if (!currentName) {
      const composed = [drug.genericName || drug.label, strength, productForm]
        .filter(Boolean)
        .join(' ');
      const withBrand = drug.brandName ? `${composed} (${drug.brandName})` : composed;
      form.setValue('medicationName', withBrand || drug.label, { shouldValidate: true });
    }
    form.setValue('brandName', drug.brandName ?? '', { shouldValidate: true });
    form.setValue('genericName', drug.genericName ?? '', { shouldValidate: true });
    form.setValue('strength', strength, { shouldValidate: true });
    const current = regimens[0] ?? createEmptyRegimen();
    const patched = applyRegimenPatch(current, { productForm });
    const nextRegimens = [patched, ...regimens.slice(1)];
    setRegimens(nextRegimens);
    syncPrimaryRegimen(
      (name, value) => form.setValue(name, value, { shouldValidate: true }),
      patched,
    );
    const seed = regimenLines.length ? regimenLines : [emptyRegimenLine()];
    const unit =
      patched.administrationUnit || preferredAdministrationUnit(productForm, patched.route);
    const nextLines = seed.map((line, i) => (i === 0 && unit ? { ...line, form: unit } : line));
    setRegimenLines(nextLines);
    maybeSyncDirections(nextRegimens, nextLines);
  };

  const clearMedicationMatch = () => {
    setSelectedDrug(null);
  };

  const updateRegimen = (id: string, patch: Partial<TreatmentRegimenDraft>) => {
    const next = regimens.map((r) => (r.id === id ? applyRegimenPatch(r, patch) : r));
    setRegimens(next);
    if (next[0]?.id === id) {
      syncPrimaryRegimen(
        (name, value) => form.setValue(name, value, { shouldDirty: true }),
        next[0],
      );
    }
    if (next[0] && (patch.productForm !== undefined || patch.route !== undefined)) {
      const unit = next[0].administrationUnit;
      const nextLines = regimenLines.map((line, i) =>
        i === 0 && unit ? { ...line, form: unit } : line,
      );
      setRegimenLines(nextLines);
      maybeSyncDirections(next, nextLines);
      return;
    }
    maybeSyncDirections(next);
  };

  const patchPrimaryLines = (nextLines: RegimenLineDraft[]) => {
    setRegimenLines(nextLines);
    const next = [...regimens];
    if (next[0]) {
      next[0] = applyRegimenPatch(next[0], linesToRegimen(nextLines, next[0]));
      syncPrimaryRegimen(
        (name, value) => form.setValue(name, value, { shouldDirty: true }),
        next[0],
      );
    }
    setRegimens(next);
    maybeSyncDirections(next, nextLines);
  };

  const addRegimen = () => {
    setRegimens((prev) => {
      const seed = prev[0];
      const extra = createEmptyRegimen(prev.length);
      const next = [
        ...prev,
        seed
          ? applyRegimenPatch(extra, {
              productForm: seed.productForm,
              route: seed.route,
              administrationUnit: seed.administrationUnit,
            })
          : extra,
      ];
      return next;
    });
  };

  const removeRegimen = (id: string) => {
    setRegimens((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((r) => r.id !== id);
      if (next[0]) {
        syncPrimaryRegimen(
          (name, value) => form.setValue(name, value, { shouldDirty: true }),
          next[0],
        );
      }
      maybeSyncDirections(next);
      return next;
    });
  };

  const setSafetyFlag = (
    field: SafetyFlagField,
    reasonField: SafetyReasonField,
    value: 'Yes' | 'No',
  ) => {
    const current = form.getValues(field);
    if (current === 'Yes' && value === 'No' && form.getValues(reasonField)?.trim()) {
      setPendingClearSafety({ field, reasonField });
      return;
    }
    form.setValue(field, value, { shouldValidate: true, shouldDirty: true });
    if (field === 'renalAdjustment') {
      if (value === 'Yes') {
        const basis = form.getValues('renalDosingBasis');
        if (!basis || basis === 'NONE') {
          form.setValue('renalDosingBasis', 'CrCl', { shouldDirty: true });
        }
      } else {
        form.setValue('renalDosingBasis', 'NONE', { shouldDirty: true });
        form.setValue('renalDosingRules', [], { shouldDirty: true });
      }
    }
  };

  const matchStatus = selectedDrug
    ? inferProductForm(selectedDrug.dosageForm, selectedDrug.label) ||
      regimens[0]?.productForm
      ? 'MATCHED'
      : 'REVIEW_REQUIRED'
    : 'UNMATCHED';

  const buildPayload = (values: z.infer<typeof schema>): TreatmentFormData => {
    const primary = regimens[0] ?? createEmptyRegimen();
    const doseDisplay = composeRegimenDoseDisplay(primary);
    const durationDisplay = composeDuration(primary.durationValue, primary.durationUnit);
    return {
      ...values,
      dose: doseDisplay || values.dose,
      frequency: primary.frequency || values.frequency,
      route: primary.route || values.route,
      duration: durationDisplay || values.duration,
      metadata: {
        ...(typeof treatment?.metadata === 'object' && treatment.metadata ? treatment.metadata : {}),
        editorVersion: 2,
        productUseMappingVersion: PRODUCT_USE_MAPPING_VERSION,
        matchStatus,
        productForm: primary.productForm || null,
        lactationReason:
          normalizeClinicalYesNo(values.breastfeedingNotes) === 'Yes'
            ? values.lactationReason?.trim() || null
            : null,
        population: values.population ?? 'ADULT',
        regimens: regimens.map((r) => ({
          ...r,
          dose: r.dose.trim(),
          unit: r.administrationUnit,
          duration: composeDuration(r.durationValue, r.durationUnit),
        })),
        regimenLines: serializeRegimenLines(regimenLines),
        medicationConcept: selectedDrug
          ? {
              conceptId: selectedDrug.id || selectedDrug.rxcui || null,
              display: selectedDrug.label,
              terminologySystem: selectedDrug.source ?? 'ccdd',
              doseForm: selectedDrug.dosageForm ?? primary.productForm ?? null,
              ingredients: selectedDrug.genericName
                ? [{ display: selectedDrug.genericName }]
                : [],
            }
          : undefined,
      },
    };
  };

  const runAction = async (mode: TreatmentEditorMode) => {
    setActiveMode(mode);
    setValidationMessages([]);

    if (mode === 'draft') {
      const name = form.getValues('medicationName')?.trim();
      if (!name) {
        form.setError('medicationName', { message: 'Treatment name is required' });
        setValidationMessages(['Treatment name is required to save a draft.']);
        setActiveMode(null);
        return;
      }
      try {
        const values = form.getValues();
        await onSubmit(buildPayload(values), 'draft');
      } finally {
        setActiveMode(null);
      }
      return;
    }

    const valid = await form.trigger();
    const regimenErrors: string[] = [];
    if (isMedicationType) {
      regimens.forEach((r, i) => {
        const label = r.label || `Regimen ${i + 1}`;
        if (!r.dose.trim()) regimenErrors.push(`${label}: dose is required`);
        if (!r.administrationUnit.trim()) {
          regimenErrors.push(`${label}: administration unit is required`);
        }
        if (!r.productForm.trim()) regimenErrors.push(`${label}: product form is required`);
        if (!r.frequency.trim()) regimenErrors.push(`${label}: frequency is required`);
        if (!r.route.trim()) regimenErrors.push(`${label}: route is required`);
        if (category === 'PRESCRIPTION' && !r.durationValue.trim()) {
          regimenErrors.push(`${label}: duration is required`);
        }
        const useError = validateProductUse(r.productForm, r.route, r.administrationUnit);
        if (useError) regimenErrors.push(`${label}: ${useError}`);
      });
      if (matchStatus === 'REVIEW_REQUIRED') {
        regimenErrors.push(
          'Medication match needs review — confirm product form and route before publishing.',
        );
      }
    }

    if (!valid || regimenErrors.length) {
      const messages = [
        ...Object.values(form.formState.errors)
          .map((e) => e?.message)
          .filter((m): m is string => Boolean(m)),
        ...regimenErrors,
      ];
      setValidationMessages(
        messages.length ? messages : ['Please complete required fields before continuing.'],
      );
      toast.error('Validation failed — resolve the highlighted fields.');
      setActiveMode(null);
      return;
    }

    if (mode === 'validate') {
      setValidationMessages([]);
      toast.success('Validation passed. Ready to submit for clinical review.');
      setActiveMode(null);
      return;
    }

    try {
      const values = form.getValues();
      await onSubmit(buildPayload(values), 'submit');
    } finally {
      setActiveMode(null);
    }
  };

  const busy = Boolean(loading || activeMode);
  const footerMode: LibraryEditorFooter | 'pathway' = isLibrary
    ? libraryFooter ?? (readOnly ? 'approved' : 'draft')
    : 'pathway';

  const editorTitle = isLibrary
    ? treatment
      ? readOnly
        ? 'View library treatment'
        : 'Edit library treatment'
      : 'New library treatment'
    : isPersistedPathwayTreatment(treatment?.id)
      ? 'Edit Treatment Option'
      : 'Add Treatment Option';
  const editorDescription = isLibrary
    ? 'Create a reusable, clinically reviewed regimen. Pathway-specific recommendation and eligibility are added when this treatment is used.'
    : 'Configure how this treatment appears and is used across clinical pathways.';

  const headerAndForm = (
        <>
        <div className="shrink-0 border-b border-[#E4ECEF] px-6 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                {presentation === 'dialog' ? (
                  <DialogTitle className="text-[22px] font-bold tracking-tight text-[#111827]">
                    {editorTitle}
                  </DialogTitle>
                ) : (
                  <h2 className="text-[22px] font-bold tracking-tight text-[#111827]">
                    {editorTitle}
                  </h2>
                )}
                <Badge
                  variant="outline"
                  className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', status.className)}
                >
                  {status.label}
                </Badge>
              </div>
              {presentation === 'dialog' ? (
                <DialogDescription className="mt-1.5 text-[14px] text-[#66727D]">
                  {editorDescription}
                </DialogDescription>
              ) : (
                <p className="mt-1.5 text-[14px] text-[#66727D]">{editorDescription}</p>
              )}
            </div>
            {presentation === 'dialog' ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-1.5 text-[#66727D] hover:bg-[#F3F6F7] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          {isLibrary ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#B7D9D6] bg-[#EFF9F8] px-3.5 py-2.5 text-[13px] font-medium text-[#0F6F6B]">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                Approved treatments can be reused across pathways. Pathway-specific changes do not
                alter the library treatment.
              </span>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#B7D9D6] bg-[#EFF9F8] px-3.5 py-2.5 text-[13px] font-medium text-[#0F6F6B]">
              <Info className="h-4 w-4 shrink-0" />
              <span className="truncate">{contextLine}</span>
            </div>
          )}
          {!isLibrary && libraryLink ? (
            <div className="mt-3 rounded-xl border border-[#D5E2E6] bg-white px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0F6F6B]">
                Treatment Library
              </p>
              <p className="mt-1 text-[14px] font-semibold text-[#111827]">
                {libraryLink.displayName}
                {libraryLink.regimenLabel ? ` · ${libraryLink.regimenLabel}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  libraryLink.productFormDisplay,
                  libraryLink.routeDisplay,
                  `Approved v${libraryLink.sourceVersionNumber}`,
                ]
                  .filter(Boolean)
                  .map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md bg-[#EEF1F4] px-2 py-0.5 text-[11px] font-semibold text-[#52606D]"
                    >
                      {chip}
                    </span>
                  ))}
                {libraryLink.matchStatus === 'MATCHED' ? (
                  <span className="rounded-md bg-[#E7F6EE] px-2 py-0.5 text-[11px] font-semibold text-[#127A4B]">
                    CCDD/DPD matched
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[13px] font-semibold text-[#0F6F6B]">
                {onViewLibrarySource ? (
                  <button type="button" className="hover:underline" onClick={onViewLibrarySource}>
                    View source
                  </button>
                ) : null}
                {onChangeLibraryTreatment ? (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() =>
                      onChangeLibraryTreatment({
                        recommendationLevel: form.getValues('recommendationLevel'),
                        displayOrder: form.getValues('displayOrder'),
                        provinceAvailability: form.getValues('provinceAvailability'),
                        clinicalNotes: form.getValues('clinicalNotes'),
                        eligibility: form.getValues('eligibility'),
                        counsellingNotes: form.getValues('counsellingNotes'),
                        followUpAdvice: form.getValues('followUpAdvice'),
                        clinicalIndication: form.getValues('clinicalIndication'),
                      })
                    }
                  >
                    Change treatment
                  </button>
                ) : null}
                {onRemoveLibraryLink ? (
                  <button type="button" className="hover:underline" onClick={onRemoveLibraryLink}>
                    Remove link
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void runAction('submit');
          }}
        >
          <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5', readOnly && 'pointer-events-none select-none')}>
            {validationMessages.length > 0 && (
              <div
                className="rounded-xl border border-[#E9A4A8] bg-[#FFF5F5] px-4 py-3 text-[13px] text-[#B4232A]"
                role="alert"
              >
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Resolve before continuing
                </div>
                <ul className="list-disc space-y-0.5 pl-5">
                  {validationMessages.slice(0, 6).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Section 1 — Treatment details */}
            <EditorSection
              index={1}
              title="Treatment details"
              open={section1Open}
              onToggle={() => setSection1Open((v) => !v)}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label="Treatment type"
                  required
                  input={
                    <select
                      className={selectClass}
                      {...form.register('category')}
                    >
                      {PHARMACOLOGICAL_TREATMENT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.shortLabel}
                        </option>
                      ))}
                    </select>
                  }
                />
                {isLibrary ? (
                  <Field
                    label="Population"
                    required
                    input={
                      <select className={selectClass} {...form.register('population')}>
                        {Object.entries(TREATMENT_LIBRARY_POPULATION_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                ) : (
                  <>
                    <Field
                      label="Line of therapy"
                      required
                      input={
                        <select
                          className={selectClass}
                          {...form.register('recommendationLevel')}
                        >
                          {LINE_OF_THERAPY_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                          {form.watch('recommendationLevel') === 'SECOND_LINE' ? (
                            <option value="SECOND_LINE">Alternative</option>
                          ) : null}
                          {form.watch('recommendationLevel') === 'SPECIALIST' ? (
                            <option value="SPECIALIST">Suitable</option>
                          ) : null}
                        </select>
                      }
                    />
                    <Field
                      label="Display order"
                      required
                      error={form.formState.errors.displayOrder?.message}
                      input={
                        <Input
                          type="number"
                          min={1}
                          className={inputClass}
                          {...form.register('displayOrder')}
                        />
                      }
                    />
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Treatment name"
                  required
                  error={form.formState.errors.medicationName?.message}
                  input={
                    <Input
                      className={inputClass}
                      placeholder="e.g. Roflumilast 0.3% Foam (Zoryve)"
                      {...form.register('medicationName')}
                    />
                  }
                />
                {isMedicationType ? (
                  <div>
                    <Label className="mb-1.5 block text-[13px] font-semibold text-[#111827]">
                      Medication <span className="text-destructive">*</span>
                    </Label>
                    <DrugSearchCombobox
                      value={selectedDrug}
                      onSelect={applyDrug}
                      placeholder="Search drugs by brand or generic name..."
                      autoFocus={isOpen && !treatment && !readOnly}
                      className="[&_input]:h-11"
                    />
                    {form.formState.errors.genericName?.message ? (
                      <p className="mt-1 text-xs text-destructive">
                        {form.formState.errors.genericName.message}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <Field
                    label="Instructions"
                    required
                    error={form.formState.errors.directions?.message}
                    input={
                      <Input
                        className={inputClass}
                        placeholder="Structured non-drug recommendation"
                        {...form.register('directions')}
                      />
                    }
                  />
                )}
              </div>

              {isMedicationType && selectedDrug ? (
                <>
                  <MedicationMatchStrip
                    drug={selectedDrug}
                    productForm={regimens[0]?.productForm}
                    route={regimens[0]?.route}
                    status={matchStatus}
                    onChange={clearMedicationMatch}
                  />
                  {matchStatus === 'REVIEW_REQUIRED' ? (
                    <p className="-mt-2 text-[12px] text-[#B45309]">
                      Confirm the pharmaceutical form and route. Missing form is not treated as a tablet.
                    </p>
                  ) : null}
                </>
              ) : null}

              {isMedicationType && (
                <div className="space-y-3">
                  {(() => {
                    const primary = regimens[0] ?? createEmptyRegimen();
                    const formLocked = Boolean(
                      selectedDrug &&
                        inferProductForm(selectedDrug.dosageForm, selectedDrug.label) &&
                        primary.productForm,
                    );
                    const compatibleRoutes = primary.productForm
                      ? routesForProductForm(primary.productForm)
                      : MAPPED_ROUTES;
                    const routeOptions =
                      compatibleRoutes.length > 0 ? compatibleRoutes : MAPPED_ROUTES;
                    const unitOptions = administrationUnitsFor(
                      primary.productForm,
                      primary.route,
                    );
                    const showRoute = !primary.route.trim() || routeOptions.length > 1;
                    return (
                      <>
                        {!formLocked ? (
                          <Field
                            label="Product form"
                            required
                            input={
                              <select
                                value={primary.productForm}
                                onChange={(e) =>
                                  updateRegimen(primary.id, { productForm: e.target.value })
                                }
                                className={selectClass}
                              >
                                <option value="">Select…</option>
                                {PRODUCT_FORMS.map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            }
                          />
                        ) : null}
                        <PrescriptionDetailsFields
                          lines={regimenLines}
                          onLinesChange={patchPrimaryLines}
                          productForm={primary.productForm}
                          route={primary.route}
                          medicationHaystack={form.watch('medicationName') ?? ''}
                          pathwayFrequency={primary.frequency}
                          unitOptions={unitOptions}
                          routeOptions={routeOptions}
                          showRoute={showRoute}
                          onRouteChange={(route) => updateRegimen(primary.id, { route })}
                          patientDirections={form.watch('directions') ?? ''}
                          directionsSource={
                            directionsMode === 'MANUAL' ? 'PHARMACIST_EDITED' : 'GENERATED'
                          }
                          directionsError={form.formState.errors.directions?.message}
                          disabled={busy || readOnly}
                          idPrefix="pathway-treatment"
                          subtitle="Configure the default regimen for this pathway treatment."
                          showRegenerate={directionsMode === 'MANUAL'}
                          onDirectionsChange={(value) => {
                            directionsTouched.current = true;
                            setDirectionsMode('MANUAL');
                            form.setValue('directions', value, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                          onDirectionsEdit={() => {
                            directionsTouched.current = true;
                            setDirectionsMode('MANUAL');
                          }}
                          onDirectionsRegenerate={() => {
                            directionsTouched.current = false;
                            setDirectionsMode('AUTO');
                            maybeSyncDirections(regimens, regimenLines);
                          }}
                          showDispense={false}
                        />
                      </>
                    );
                  })()}

                  {regimens.slice(1).map((regimen, extraIndex) => {
                    const index = extraIndex + 1;
                    const formLocked = Boolean(
                      selectedDrug &&
                        inferProductForm(selectedDrug.dosageForm, selectedDrug.label) &&
                        regimen.productForm,
                    );
                    const compatibleRoutes = regimen.productForm
                      ? routesForProductForm(regimen.productForm)
                      : MAPPED_ROUTES;
                    const routeOptions =
                      compatibleRoutes.length > 0 ? compatibleRoutes : MAPPED_ROUTES;
                    const routeLocked = formLocked && routeOptions.length === 1;
                    const unitOptions = administrationUnitsFor(
                      regimen.productForm,
                      regimen.route,
                    );
                    return (
                      <div
                        key={regimen.id}
                        className="space-y-3 rounded-xl border border-[#D8E0E3] bg-[#FAFCFC] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            value={regimen.label}
                            onChange={(e) =>
                              updateRegimen(regimen.id, { label: e.target.value })
                            }
                            className="h-9 max-w-[200px] border-[#C5D0D4] bg-white text-[13px] font-semibold shadow-none"
                            aria-label={`Regimen ${index + 1} label`}
                          />
                          <button
                            type="button"
                            onClick={() => removeRegimen(regimen.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#66727D] hover:bg-white hover:text-destructive"
                            aria-label="Remove regimen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
                          <MiniField label="Dose *">
                            <Input
                              value={regimen.dose}
                              onChange={(e) =>
                                updateRegimen(regimen.id, { dose: e.target.value })
                              }
                              placeholder=""
                              className={miniInputClass}
                            />
                          </MiniField>
                          <MiniField label="Administration unit *">
                            <select
                              value={regimen.administrationUnit}
                              onChange={(e) =>
                                updateRegimen(regimen.id, {
                                  administrationUnit: e.target.value,
                                })
                              }
                              className={miniSelectClass}
                            >
                              <option value="">Select…</option>
                              {(unitOptions.length
                                ? unitOptions
                                : regimen.administrationUnit
                                  ? [regimen.administrationUnit]
                                  : []
                              ).map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </MiniField>
                          <MiniField label="Product form *">
                            <select
                              value={regimen.productForm}
                              disabled={formLocked}
                              onChange={(e) =>
                                updateRegimen(regimen.id, { productForm: e.target.value })
                              }
                              className={cn(
                                miniSelectClass,
                                formLocked && 'bg-[#F4F7F8] text-[#52606D]',
                              )}
                            >
                              <option value="">Select…</option>
                              {PRODUCT_FORMS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </MiniField>
                          <MiniField label="Frequency *">
                            <TimingSelector
                              id={`pathway-extra-timing-${regimen.id}`}
                              value={regimen.frequency === 'other' ? '' : regimen.frequency}
                              configuration={buildTimingConfiguration({
                                pathwayFrequency: regimen.frequency,
                              })}
                              disabled={busy || readOnly}
                              onChange={(frequency) =>
                                updateRegimen(regimen.id, { frequency })
                              }
                            />
                          </MiniField>
                          <MiniField label="Route *">
                            <select
                              value={regimen.route}
                              disabled={routeLocked}
                              onChange={(e) =>
                                updateRegimen(regimen.id, { route: e.target.value })
                              }
                              className={cn(
                                miniSelectClass,
                                routeLocked && 'bg-[#F4F7F8] text-[#52606D]',
                              )}
                            >
                              <option value="">Select…</option>
                              {routeOptions.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </MiniField>
                          <MiniField label="Duration *">
                            <Input
                              inputMode="numeric"
                              value={regimen.durationValue}
                              onChange={(e) =>
                                updateRegimen(regimen.id, {
                                  durationValue: e.target.value,
                                })
                              }
                              placeholder=""
                              className={miniInputClass}
                            />
                          </MiniField>
                          <MiniField label="Duration unit *">
                            <select
                              value={regimen.durationUnit}
                              onChange={(e) =>
                                updateRegimen(regimen.id, {
                                  durationUnit: e.target.value,
                                })
                              }
                              className={miniSelectClass}
                            >
                              <option value="">Select…</option>
                              {DURATION_UNITS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </MiniField>
                        </div>

                      </div>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRegimen}
                    className="h-10 gap-1.5 border-[#ACD8D5] bg-white text-[13px] font-semibold text-[#0F7F7A] shadow-none hover:bg-[#EFF9F8]"
                  >
                    <Plus className="h-4 w-4" />
                    Add another regimen
                  </Button>
                </div>
              )}

              <Field
                label={isLibrary ? 'General clinical notes' : 'Why this option?'}
                hint={!isLibrary ? `${(form.watch('clinicalNotes') ?? '').length}/500` : undefined}
                input={
                  <Textarea
                    rows={3}
                    maxLength={500}
                    className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                    placeholder={
                      isLibrary
                        ? 'Add general notes that apply whenever this regimen is reused…'
                        : 'Preferred first-line therapy due to shorter duration, proven efficacy, and good tolerability.'
                    }
                    {...form.register('clinicalNotes')}
                  />
                }
                error={form.formState.errors.clinicalNotes?.message}
              />

              {!isLibrary && evidenceLibrary ? (
                <Field
                  label="References"
                  input={
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {uniqueIdList(form.watch('evidenceRefIds')).map((id) => {
                          const ref = evidenceLibrary.find((row) => row.id === id);
                          if (!ref) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full border border-[#C5D0D4] bg-[#F7FAFB] px-2.5 py-1 text-[12px] text-[#344054]"
                            >
                              {citationDisplay(ref)}
                              {canEditEvidence ? (
                                <button
                                  type="button"
                                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                                  aria-label={`Remove ${citationDisplay(ref)}`}
                                  onClick={() =>
                                    form.setValue(
                                      'evidenceRefIds',
                                      uniqueIdList(form.getValues('evidenceRefIds')).filter((row) => row !== id),
                                      { shouldDirty: true },
                                    )
                                  }
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2 text-[12.5px] font-semibold text-primary"
                        disabled={!canEditEvidence}
                        onClick={() => setLinkDialogOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Link reference
                      </Button>
                    </div>
                  }
                />
              ) : null}

              {category === 'NON_DRUG' && (
                <Field
                  label="Clinical context"
                  input={
                    <Textarea
                      rows={2}
                      className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                      placeholder="When this non-drug option applies…"
                      {...form.register('clinicalIndication')}
                    />
                  }
                />
              )}
            </EditorSection>

            {/* Section 2 — Safety and monitoring */}
            {isMedicationType && (
              <EditorSection
                index={2}
                title="Safety and monitoring"
                open={section2Open}
                onToggle={() => setSection2Open((v) => !v)}
              >
                <div className="space-y-2">
                  <SafetyToggleRow
                    label="Renal adjustment"
                    value={renalFlag}
                    onChange={(v) =>
                      setSafetyFlag('renalAdjustment', 'renalAdjustmentReason', v)
                    }
                    error={form.formState.errors.renalAdjustment?.message}
                  />
                  {renalFlag === 'Yes' && (
                    <RenalConfigurationPanel
                      disabled={busy}
                      error={
                        form.formState.errors.renalAdjustmentReason?.message ||
                        form.formState.errors.renalDosingBasis?.message ||
                        (typeof form.formState.errors.renalDosingRules?.message === 'string'
                          ? form.formState.errors.renalDosingRules.message
                          : undefined)
                      }
                      value={{
                        renalAdjustmentReason: renalAdjustmentReason ?? '',
                        renalDosingBasis: (renalDosingBasis as RenalDosingBasis) || 'CrCl',
                        renalDosingRules: (renalDosingRules as RenalDosingRule[]) ?? [],
                      }}
                      onChange={(next) => {
                        if (next.renalAdjustmentReason !== undefined) {
                          form.setValue('renalAdjustmentReason', next.renalAdjustmentReason, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                        if (next.renalDosingBasis !== undefined) {
                          form.setValue('renalDosingBasis', next.renalDosingBasis, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                        if (next.renalDosingRules !== undefined) {
                          form.setValue('renalDosingRules', next.renalDosingRules, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      }}
                    />
                  )}

                  <SafetyToggleRow
                    label="Hepatic adjustment"
                    value={hepaticFlag}
                    onChange={(v) =>
                      setSafetyFlag('hepaticAdjustment', 'hepaticAdjustmentReason', v)
                    }
                    error={form.formState.errors.hepaticAdjustment?.message}
                  />
                  {hepaticFlag === 'Yes' && (
                    <SafetyConfigPanel
                      label="Hepatic configuration"
                      error={form.formState.errors.hepaticAdjustmentReason?.message}
                    >
                      <Textarea
                        rows={3}
                        className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                        placeholder="Impairment category, action, adjusted regimen, and pharmacist instruction…"
                        {...form.register('hepaticAdjustmentReason')}
                      />
                    </SafetyConfigPanel>
                  )}

                  <SafetyToggleRow
                    label="Pregnancy consideration"
                    value={pregnancyFlag}
                    onChange={(v) =>
                      setSafetyFlag('pregnancyNotes', 'pregnancyReason', v)
                    }
                    error={form.formState.errors.pregnancyNotes?.message}
                  />
                  {pregnancyFlag === 'Yes' && (
                    <SafetyConfigPanel
                      label="Pregnancy configuration"
                      error={form.formState.errors.pregnancyReason?.message}
                    >
                      <Textarea
                        rows={3}
                        className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                        placeholder="Rule action and pharmacist-facing pregnancy warning…"
                        {...form.register('pregnancyReason')}
                      />
                    </SafetyConfigPanel>
                  )}

                  <SafetyToggleRow
                    label="Lactation consideration"
                    value={lactationFlag}
                    onChange={(v) =>
                      setSafetyFlag('breastfeedingNotes', 'lactationReason', v)
                    }
                    error={form.formState.errors.breastfeedingNotes?.message}
                  />
                  {lactationFlag === 'Yes' && (
                    <SafetyConfigPanel
                      label="Lactation configuration"
                      error={form.formState.errors.lactationReason?.message}
                    >
                      <Textarea
                        rows={3}
                        className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                        placeholder="Rule action and pharmacist-facing lactation warning…"
                        {...form.register('lactationReason')}
                      />
                    </SafetyConfigPanel>
                  )}

                  <SafetyToggleRow
                    label="Lab monitoring needed"
                    value={monitoringFlag}
                    onChange={(v) =>
                      setSafetyFlag('monitoring', 'monitoringReason', v)
                    }
                    error={form.formState.errors.monitoring?.message}
                  />
                  {monitoringFlag === 'Yes' && (
                    <SafetyConfigPanel
                      label="Lab monitoring configuration"
                      error={form.formState.errors.monitoringReason?.message}
                    >
                      <Textarea
                        rows={3}
                        className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                        placeholder="Parameter, timing, whether required before selection, threshold/action, pharmacist instruction…"
                        {...form.register('monitoringReason')}
                      />
                    </SafetyConfigPanel>
                  )}
                </div>

                <Field
                  label="Eligibility notes (optional)"
                  input={
                    <Textarea
                      rows={2}
                      className="resize-none rounded-[10px] border-[#C5D0D4] bg-white text-[14px] shadow-none"
                      placeholder="When this option may be used on this pathway…"
                      {...form.register('eligibility')}
                    />
                  }
                />

                <div className="flex items-start gap-2.5 rounded-xl border border-[#B7D9D6] bg-[#EFF9F8] px-3.5 py-3 text-[13px] text-[#0F6F6B]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Patient allergy, interaction, renal and disease screening runs as a
                    safety alert at consult time.
                  </p>
                </div>

                <Field
                  label="Monitoring"
                  input={
                    <Textarea
                      rows={3}
                      className="resize-none rounded-[10px] border-[#C5D0D4] text-[14px] shadow-none"
                      placeholder="Add monitoring parameters, timing and follow-up guidance…"
                      {...form.register('followUpAdvice')}
                    />
                  }
                />
                <p className="text-[12px] text-[#66727D]">
                  Selecting Yes reveals the required configuration fields.
                </p>
              </EditorSection>
            )}
          </div>

          <div className="shrink-0 border-t border-[#E4ECEF] bg-[#FAFCFC] px-6 py-4">
            {footerMode === 'approved' ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => onLibraryAction?.('back') ?? onOpenChange(false)}
                  className="text-[14px] font-semibold text-[#52606D] hover:text-foreground"
                >
                  Back
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onLibraryAction?.('usage')}
                    className="h-11 border-[#0F817C]/50 text-[#0F6F6B] shadow-none hover:bg-[#EFF9F8]"
                  >
                    View usage
                  </Button>
                  {libraryStatus === 'APPROVED' ? (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => onLibraryAction?.('newVersion')}
                      className="h-11 bg-[#0F6F6B] text-white hover:bg-[#0c5c59]"
                    >
                      Create new version
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : footerMode === 'review' ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-[14px] font-semibold text-[#52606D] hover:text-foreground"
                >
                  Cancel
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onLibraryAction?.('requestChanges')}
                    className="h-11 border-[#B45309]/40 text-[#B45309] shadow-none hover:bg-[#FFF8EB]"
                  >
                    Return for changes
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => onLibraryAction?.('approve')}
                    className="h-11 bg-[#0F6F6B] text-white hover:bg-[#0c5c59]"
                  >
                    Approve and publish
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                  className="text-[14px] font-semibold text-[#52606D] hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || readOnly}
                    onClick={() => void runAction('draft')}
                    className="h-11 min-w-[120px] border-[#0F817C]/50 text-[#0F6F6B] shadow-none hover:bg-[#EFF9F8]"
                  >
                    {activeMode === 'draft' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Save draft'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || readOnly}
                    onClick={() => void runAction('validate')}
                    className="h-11 min-w-[110px] border-[#0F817C]/50 text-[#0F6F6B] shadow-none hover:bg-[#EFF9F8]"
                  >
                    {activeMode === 'validate' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Validate'
                    )}
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || readOnly}
                    onClick={() => void runAction('submit')}
                    className="h-11 min-w-[200px] bg-[#1E3A5F] text-white hover:bg-[#162C49]"
                  >
                    {activeMode === 'submit' || loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Submit for clinical review'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
        </>
  );

  return (
    <>
      {presentation === 'page' ? (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-[#D5E2E6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {headerAndForm}
        </div>
      ) : (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="flex max-h-[92vh] w-[min(1120px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#D5E2E6] p-0 shadow-2xl [&>button.absolute]:hidden">
            {headerAndForm}
          </DialogContent>
        </Dialog>
      )}

      <LinkReferenceDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        title="Link reference to this treatment option"
        description="Select references from the References & Governance library. Citation metadata is edited there, not on this treatment option."
        searchPlaceholder="Search references by title, keyword, or organization..."
        saveLabel={(count) => `Link selected (${count})`}
        showManageInFooter={false}
        library={evidenceLibrary ?? []}
        selectedIds={uniqueIdList(form.watch('evidenceRefIds'))}
        canEdit={canEditEvidence && !readOnly}
        onSave={async (ids) => {
          const nextIds = uniqueIdList(ids);
          form.setValue('evidenceRefIds', nextIds, { shouldDirty: true });
          if (onPersistEvidenceIds) await onPersistEvidenceIds(nextIds);
          const name = form.getValues('medicationName')?.trim() || 'this treatment option';
          toast.success('Reference linked', {
            announce: true,
            description: `${nextIds.length} reference${nextIds.length === 1 ? '' : 's'} linked to ${name}.`,
          });
        }}
        onManageLibrary={() => {
          setLinkDialogOpen(false);
          onManageEvidenceLibrary?.();
        }}
      />

      <ConfirmDialog
      open={Boolean(pendingClearSafety)}
      onOpenChange={(next) => {
        if (!next) setPendingClearSafety(null);
      }}
      title="Clear safety details?"
      description="This removes the configured safety details for this flag. You can enter them again if needed."
      confirmLabel="Clear details"
      cancelLabel="Keep details"
      variant="destructive"
      onConfirm={() => {
        if (!pendingClearSafety) return;
        form.setValue(pendingClearSafety.reasonField, '', { shouldDirty: true });
        form.setValue(pendingClearSafety.field, 'No', {
          shouldValidate: true,
          shouldDirty: true,
        });
        if (pendingClearSafety.field === 'renalAdjustment') {
          form.setValue('renalDosingBasis', 'NONE', { shouldDirty: true });
          form.setValue('renalDosingRules', [], { shouldDirty: true });
        }
        setPendingClearSafety(null);
      }}
    />
    </>
  );
}

const inputClass =
  'h-11 rounded-[10px] border-[#C5D0D4] bg-white text-[14px] shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15';
const selectClass = cn(
  'flex h-11 w-full appearance-none rounded-[10px] border border-[#C5D0D4] bg-white px-3 text-[14px]',
  'outline-none focus:border-primary focus:ring-2 focus:ring-primary/15',
);
const miniInputClass =
  'h-10 rounded-lg border-[#C5D0D4] bg-white text-[13px] shadow-none';
const miniSelectClass = cn(
  'flex h-10 w-full appearance-none rounded-lg border border-[#C5D0D4] bg-white px-2.5 text-[13px]',
  'outline-none focus:border-primary focus:ring-2 focus:ring-primary/15',
);

function Field({
  label,
  required,
  input,
  error,
  hint,
}: {
  label: string;
  required?: boolean;
  input: React.ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label className="block text-[13px] font-semibold text-[#111827]">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {input}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function MiniField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#66727D]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function MedicationMatchStrip({
  drug,
  productForm,
  route,
  status,
  onChange,
}: {
  drug: DrugSearchResult;
  productForm?: string;
  route?: string;
  status: 'MATCHED' | 'REVIEW_REQUIRED' | 'UNMATCHED';
  onChange: () => void;
}) {
  const brand = (drug.brandName || drug.label).trim();
  const genericBits = [drug.genericName, drug.strength].filter(Boolean).join(' ');
  const formChip =
    productForm || inferProductForm(drug.dosageForm, drug.label) || undefined;
  const matched = status === 'MATCHED';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D8E0E3] bg-white px-4 py-3">
      <div className="min-w-[140px] flex-1">
        <p className="truncate text-[14px] font-bold uppercase tracking-wide text-[#111827]">
          {brand}
        </p>
        {genericBits ? (
          <p className="truncate text-[13px] text-[#66727D]">{genericBits}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {formChip ? (
          <span className="rounded-full bg-[#EEF2F4] px-2.5 py-0.5 text-[12px] font-medium text-[#52606D]">
            {formChip}
          </span>
        ) : null}
        {route ? (
          <span className="rounded-full bg-[#EEF2F4] px-2.5 py-0.5 text-[12px] font-medium text-[#52606D]">
            {route}
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[13px] font-semibold',
            matched ? 'text-[#12805C]' : 'text-[#B45309]',
          )}
        >
          {matched ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {matched ? 'Matched' : 'Review'}
        </span>
        <button
          type="button"
          onClick={onChange}
          className="text-[13px] font-semibold text-[#2563EB] hover:underline"
        >
          Change
        </button>
      </div>
    </div>
  );
}

function EditorSection({
  index,
  title,
  open,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#D5E2E6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-[#FAFCFC]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F817C] text-[13px] font-bold text-white">
          {index}
        </span>
        <span className="flex-1 text-[16px] font-bold text-[#111827]">{title}</span>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-[#66727D] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-[#E8EEF0] px-5 py-5">{children}</div>
      ) : null}
    </section>
  );
}

function SafetyToggleRow({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value?: string;
  onChange: (v: 'Yes' | 'No') => void;
  error?: string;
}) {
  return (
    <div className="rounded-xl border border-[#D8E0E3] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-[#111827]">{label}</p>
          {error ? <p className="mt-0.5 text-xs text-destructive">{error}</p> : null}
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-[#C5D0D4]">
          {(['Yes', 'No'] as const).map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  'min-w-[64px] px-4 py-2 text-[13px] font-semibold transition-colors',
                  selected
                    ? 'bg-[#0F817C] text-white'
                    : 'bg-white text-[#52606D] hover:bg-[#F3F6F7]',
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SafetyConfigPanel({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ml-0 rounded-xl border border-[#ACD8D5] bg-[#F7FBFA] p-3.5 sm:ml-2">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#0F6F6B]">
        {label}
      </p>
      {children}
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
