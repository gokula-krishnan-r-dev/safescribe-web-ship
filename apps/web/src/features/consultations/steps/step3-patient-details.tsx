'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Shield,
  Pill,
  ClipboardList,
  Leaf,
  FolderOpen,
  Plus,
  Calculator,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import type { Demographics, ExtractedLabValue, MedicationEntry, PathwaySuggestion } from '../types';
import { useConditionCatalogSearch } from '../hooks';
import { PATIENT_INFO_COPY } from '../patient-info/patient-info-copy';
import { AllergySearchField, type AllergyDrugEntry, allergyChipLabel } from '../allergy-search-field';
import {
  AllergyReactionDropdown,
  applyAllergyType,
  allergyTypeFromEntry,
} from '../allergy-type-dialog';
import { MedicationSearchField } from '../medication-search-field';
import { formatMedicationChipLabel } from '../medication-utils';
import { ImportLabReport } from '../import-lab-report';
import {
  ClinicalConfirmCard,
  ClinicalChoiceGroup,
  ClinicalSelect,
  ClinicalFieldLabel,
  ClinicalHistoryRow,
  ClinicalChip,
  ClinicalPrimaryButton,
  ClinicalUnitInput,
  ClinicalReadOnlyField,
  ClinicalBloodPressureInput,
  ClinicalCheckbox,
} from '../clinical-ui';
import { ClinicalDobInput } from '../clinical-dob-input';
import { LatestResultsTable } from '../latest-results-table';
import {
  demographicsAgeFromDob,
  isDateOfBirthUnavailable,
  isoDateLocal,
  isoDateYearsAgo,
  dateOfBirthError,
  partitionLabAndVitalResults,
  presentLatestLabRows,
} from '@safescript/shared';

export type PatientDetailsPhase = 'snapshot' | 'background' | 'labs' | 'done';

export const SEX_OPTIONS = [
  { value: 'Female', label: 'Female' },
  { value: 'Male', label: 'Male' },
  { value: 'Intersex', label: 'Intersex' },
  { value: 'Unknown', label: 'Unknown' },
];

export const YES_NO_UNKNOWN = [
  { value: 'No', label: 'No' },
  { value: 'Yes', label: 'Yes' },
  { value: 'Unknown', label: 'Unknown' },
];

/** Migrate legacy combined pregnancy field into separate answers */
export function migrateReproductiveStatus(demo: Demographics & {
  pregnancyAnswer?: string;
  breastfeedingAnswer?: string;
}): {
  pregnancyStatus: string;
  breastfeedingStatus: string;
} {
  // Prefer explicit UI answer fields when present
  if (demo.pregnancyAnswer || demo.breastfeedingAnswer) {
    return {
      pregnancyStatus: normalizeTriState(demo.pregnancyAnswer ?? ''),
      breastfeedingStatus: normalizeTriState(demo.breastfeedingAnswer ?? ''),
    };
  }

  const raw = (demo.pregnancyStatus ?? '').trim();
  const bf = (demo.breastfeedingStatus ?? '').trim();
  const lower = raw.toLowerCase();

  if (bf && ['no', 'yes', 'unknown'].includes(bf.toLowerCase()) && ['no', 'yes', 'unknown'].includes(lower)) {
    return {
      pregnancyStatus: normalizeTriState(raw),
      breastfeedingStatus: normalizeTriState(bf),
    };
  }

  // Composed safety labels e.g. "Not pregnant; Not breastfeeding"
  if (lower.includes('pregnant') || lower.includes('breast') || lower.includes('pregnancy')) {
    let pregnancy = '';
    let breastfeeding = '';
    if (/\bnot pregnant\b/.test(lower) || /\bpregnancy unknown\b/.test(lower)) {
      pregnancy = /\bpregnancy unknown\b/.test(lower) ? 'Unknown' : 'No';
    } else if (/\bpregnan/.test(lower)) {
      pregnancy = 'Yes';
    }
    if (/\bnot breastfeeding\b/.test(lower) || /\bbreastfeeding unknown\b/.test(lower)) {
      breastfeeding = /\bbreastfeeding unknown\b/.test(lower) ? 'Unknown' : 'No';
    } else if (/\bbreast|\blactat|\bnursing\b/.test(lower)) {
      breastfeeding = 'Yes';
    }
    return {
      pregnancyStatus: pregnancy || normalizeTriState(bf),
      breastfeedingStatus: breastfeeding || (bf ? normalizeTriState(bf) : ''),
    };
  }

  if (lower === 'not pregnant') {
    return { pregnancyStatus: 'No', breastfeedingStatus: bf ? normalizeTriState(bf) : '' };
  }
  if (lower === 'pregnant') {
    return { pregnancyStatus: 'Yes', breastfeedingStatus: bf ? normalizeTriState(bf) : '' };
  }
  if (lower.includes('breast')) {
    return { pregnancyStatus: 'No', breastfeedingStatus: 'Yes' };
  }
  if (['no', 'yes', 'unknown'].includes(lower)) {
    return {
      pregnancyStatus: normalizeTriState(raw),
      breastfeedingStatus: normalizeTriState(bf),
    };
  }
  return { pregnancyStatus: '', breastfeedingStatus: '' };
}

function normalizeTriState(v: string): string {
  const t = v.trim().toLowerCase();
  if (!t) return '';
  if (t === 'yes' || t === 'pregnant') return 'Yes';
  if (t === 'no' || t === 'not pregnant') return 'No';
  if (t === 'unknown') return 'Unknown';
  if (t.includes('breast')) return 'Yes';
  return v;
}

/** Compose a safety-engine-friendly label from separate reproductive answers */
export function composePregnancySafetyLabel(
  pregnancy?: string,
  breastfeeding?: string,
): string {
  const p = normalizeTriState(pregnancy ?? '');
  const b = normalizeTriState(breastfeeding ?? '');
  const parts: string[] = [];
  if (p === 'Yes') parts.push('Pregnant');
  else if (p === 'No') parts.push('Not pregnant');
  else if (p === 'Unknown') parts.push('Pregnancy unknown');
  if (b === 'Yes') parts.push('Breastfeeding');
  else if (b === 'No') parts.push('Not breastfeeding');
  else if (b === 'Unknown') parts.push('Breastfeeding unknown');
  return parts.join('; ');
}

function formatAgeSummary(age?: string, unit?: string): string {
  if (!age?.trim()) return '';
  const u = unit === 'months' ? 'mo' : 'y';
  return `${age.trim()} ${u}`;
}

function formatPregnancySummary(pregnancy?: string, breastfeeding?: string): string {
  const parts: string[] = [];
  const p = normalizeTriState(pregnancy ?? '');
  const b = normalizeTriState(breastfeeding ?? '');
  if (p === 'Yes') parts.push('Pregnant');
  else if (p === 'No') parts.push('Not pregnant');
  else if (p === 'Unknown') parts.push('Pregnancy unknown');
  if (b === 'Yes') parts.push('Breastfeeding');
  else if (b === 'No') parts.push('Not breastfeeding');
  else if (b === 'Unknown') parts.push('Breastfeeding unknown');
  return parts.join(' · ');
}

function truncateSummary(parts: string[], max = 3): string {
  if (parts.length <= max) return parts.join(' · ');
  const shown = parts.slice(0, max);
  const rest = parts.length - max;
  return `${shown.join(' · ')} +${rest} more`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Vitals "Taken" presets — Today or a pharmacist-chosen custom calendar date. */
function resolveTakenPreset(measurementDate?: string): 'today' | 'custom' {
  if (!measurementDate || measurementDate === todayIso()) return 'today';
  return 'custom';
}

function formatDisplayDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildSnapshotSummary(demo: Demographics): string {
  const parts: string[] = [];
  if (demo.dateOfBirth?.trim() && !isDateOfBirthUnavailable(demo)) {
    parts.push(`DOB ${formatDisplayDate(demo.dateOfBirth)}`);
  }
  const age = formatAgeSummary(demo.age, demo.ageUnit);
  if (age) parts.push(age);
  if (demo.sex) parts.push(demo.sex);
  if (!isMaleSex(demo.sex)) {
    const repro = formatPregnancySummary(demo.pregnancyStatus, demo.breastfeedingStatus);
    if (repro) parts.push(repro);
  }
  return parts.join(' · ') || 'Snapshot incomplete';
}

export function buildBackgroundSummary(opts: {
  allergiesNone: boolean;
  allergyEntries: AllergyDrugEntry[];
  medsNone: boolean;
  medicationEntries: MedicationEntry[];
  conditionsNone: boolean;
  conditions: string[];
}): string {
  const parts: string[] = [];
  if (opts.allergiesNone) {
    parts.push('Allergy: None reported');
  } else if (opts.allergyEntries.length) {
    const first = opts.allergyEntries[0];
    const label = first.reaction
      ? `Allergy: ${first.drug}—${first.reaction}`
      : `Allergy: ${first.drug}`;
    if (opts.allergyEntries.length === 1) parts.push(label);
    else parts.push(`${label} +${opts.allergyEntries.length - 1} more`);
  }

  if (opts.medsNone) {
    parts.push('Medications: None reported');
  } else if (opts.medicationEntries.length) {
    const name = formatMedicationChipLabel(opts.medicationEntries[0]);
    if (opts.medicationEntries.length === 1) parts.push(`Medication: ${name}`);
    else parts.push(`Medications: ${name} +${opts.medicationEntries.length - 1} more`);
  }

  if (opts.conditionsNone) {
    parts.push('Condition: None reported');
  } else if (opts.conditions.length) {
    if (opts.conditions.length === 1) parts.push(`Condition: ${opts.conditions[0]}`);
    else
      parts.push(
        `Conditions: ${opts.conditions[0]} +${opts.conditions.length - 1} more`,
      );
  }

  return truncateSummary(parts, 4) || 'Patient background confirmed';
}

export function buildLabsVitalsSummary(demo: Demographics, labCount: number): string {
  const parts: string[] = [];
  if (labCount > 0) {
    parts.push(
      `${labCount} lab result${labCount === 1 ? '' : 's'} confirmed${
        demo.measurementDate ? ` · Collected ${formatDisplayDate(demo.measurementDate)}` : ''
      }`,
    );
  }
  const vitals: string[] = [];
  if (demo.height) vitals.push(`${demo.height} cm`);
  if (demo.weight) vitals.push(`${demo.weight} kg`);
  if (demo.bmi) vitals.push(`BMI ${demo.bmi}`);
  if (demo.bloodPressureSystolic && demo.bloodPressureDiastolic) {
    vitals.push(`BP ${demo.bloodPressureSystolic}/${demo.bloodPressureDiastolic}`);
  }
  if (demo.pulse) vitals.push(`Pulse ${demo.pulse}`);
  if (vitals.length) parts.push(vitals.join(' · '));
  if (!parts.length) return 'Skipped — no labs or vitals added';
  return parts.join(' · ');
}

function lifestyleSummary(demo: Demographics): string {
  if (!demo.lifestyleAssessed) return 'Not assessed';
  const parts: string[] = [];
  if (demo.smokingStatus === 'Never') parts.push('Non-smoker');
  else if (demo.smokingStatus === 'Former') parts.push('Former smoker');
  else if (demo.smokingStatus === 'Current') parts.push('Current smoker');
  else if (demo.smokingStatus) parts.push(`Smoking: ${demo.smokingStatus}`);
  if (demo.alcoholUse === 'None') parts.push('No alcohol');
  else if (demo.alcoholUse) parts.push(`Alcohol: ${demo.alcoholUse}`);
  if (demo.drugUse === 'No' || demo.drugUse === 'None') parts.push('No substance use');
  else if (demo.drugUse) parts.push(`Substance use: ${demo.drugUse}`);
  return parts.length ? parts.join(' · ') : 'Not assessed';
}

const LIFESTYLE_SMOKING = ['Never', 'Former', 'Current'];
const LIFESTYLE_ALCOHOL = ['None', 'Occasional', 'Weekly', 'Daily'];
const LIFESTYLE_SUBSTANCE = [
  { value: 'None', label: 'None' },
  { value: 'Cannabis', label: 'Cannabis' },
  { value: 'Recreational', label: 'Recreational' },
  { value: 'Other', label: 'Other' },
];

/** Normalize legacy substance value "No" → "None" for the Lifestyle editor. */
function normalizeSubstanceUse(raw?: string): string {
  if (!raw) return '';
  return raw === 'No' ? 'None' : raw;
}

function isMaleSex(sex?: string): boolean {
  return (sex ?? '').trim().toLowerCase() === 'male';
}

function showReproductiveFields(sex?: string): boolean {
  if (isMaleSex(sex)) return false;
  return sex === 'Female' || sex === 'Intersex' || sex === 'Unknown' || sex === 'Other';
}

function isFromConsultationSource(source?: string | null): boolean {
  return source === 'transcript';
}

function ProvenanceChip({
  children,
  fromConsultation,
  onRemove,
  onClick,
  className,
}: {
  children: ReactNode;
  fromConsultation?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <ClinicalChip onRemove={onRemove} onClick={onClick} className={className}>
      <span className="flex min-w-0 flex-col py-0.5 leading-tight">
        <span className="truncate">{children}</span>
        {fromConsultation ? (
          <span className="text-[11px] font-medium text-[#5b7c78]">
            {PATIENT_INFO_COPY.fromConsultation}
          </span>
        ) : null}
      </span>
    </ClinicalChip>
  );
}

interface SnapshotProps {
  demo: Demographics;
  errors: Partial<Demographics>;
  open: boolean;
  completed: boolean;
  pending?: boolean;
  pendingHint?: string;
  step?: number;
  pathwayName?: string;
  aiMatchPercent?: number | null;
  onChangePathway?: () => void;
  onEdit: () => void;
  onFieldChange: (key: keyof Demographics, value: string) => void;
  onPatch?: (patch: Partial<Demographics>) => void;
  onContinue?: () => void;
  saving?: boolean;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}

export function PatientSnapshotSection({
  demo,
  errors,
  open,
  completed,
  pending,
  pendingHint,
  step = 1,
  onEdit,
  onFieldChange,
  onPatch,
  sectionRef,
}: SnapshotProps) {
  const [forceShowRepro, setForceShowRepro] = useState(false);
  const showRepro =
    !isMaleSex(demo.sex) && (forceShowRepro || showReproductiveFields(demo.sex));
  const dobUnavailable = isDateOfBirthUnavailable(demo);
  const hasValidDob =
    !dobUnavailable && dateOfBirthError(demo.dateOfBirth) == null;
  const dobMax = isoDateLocal();
  const dobMin = isoDateYearsAgo(120);

  const patch = (next: Partial<Demographics>) => {
    if (onPatch) {
      onPatch(next);
      return;
    }
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'string') onFieldChange(key as keyof Demographics, value);
    }
  };

  const handleDobChange = (iso: string) => {
    const valid = Boolean(iso) && dateOfBirthError(iso) == null;
    const derived = valid ? demographicsAgeFromDob(iso) : null;
    patch({
      dateOfBirth: iso,
      dateOfBirthUnavailable: false,
      age: derived?.age ?? '',
      ageUnit: derived?.ageUnit ?? 'years',
    });
  };

  const handleDobUnavailable = (checked: boolean) => {
    if (checked) {
      patch({
        dateOfBirth: '',
        dateOfBirthUnavailable: true,
        age: '',
        ageUnit: 'years',
      });
      return;
    }
    const derived =
      demo.dateOfBirth && dateOfBirthError(demo.dateOfBirth) == null
        ? demographicsAgeFromDob(demo.dateOfBirth)
        : null;
    patch({
      dateOfBirthUnavailable: false,
      age: derived?.age ?? '',
      ageUnit: derived?.ageUnit ?? 'years',
    });
  };

  return (
    <ClinicalConfirmCard
      title={PATIENT_INFO_COPY.snapshotTitle}
      subtitle={PATIENT_INFO_COPY.snapshotHelper}
      open={open}
      completed={completed}
      pending={pending}
      pendingHint={pendingHint}
      step={step}
      summary={buildSnapshotSummary(demo)}
      onEdit={onEdit}
      sectionRef={sectionRef}
      headerVariant="plain"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 lg:grid-cols-[minmax(220px,1.1fr)_minmax(140px,0.55fr)_minmax(280px,1.35fr)]">
        <div className="min-w-0">
          <ClinicalFieldLabel required>{PATIENT_INFO_COPY.dob}</ClinicalFieldLabel>
          <ClinicalDobInput
            id="patient-date-of-birth"
            value={dobUnavailable ? '' : (demo.dateOfBirth ?? '')}
            onChange={handleDobChange}
            min={dobMin}
            max={dobMax}
            disabled={dobUnavailable}
            error={errors.dateOfBirth}
            aria-label="Date of birth"
            aria-describedby="patient-dob-unavailable"
          />
          <ClinicalCheckbox
            id="patient-dob-unavailable"
            className="mt-3 py-1"
            checked={dobUnavailable}
            onChange={handleDobUnavailable}
            label={PATIENT_INFO_COPY.dobUnavailable}
            description={PATIENT_INFO_COPY.dobUnavailableHint}
          />
        </div>

        <div className="min-w-0">
          <ClinicalFieldLabel required>{PATIENT_INFO_COPY.age}</ClinicalFieldLabel>
          <ClinicalUnitInput
            id="patient-age"
            aria-label="Age in years"
            value={
              hasValidDob && !dobUnavailable
                ? (demo.age ?? '').replace(/[^\d.]/g, '')
                : (demo.age ?? '')
            }
            onChange={(v) => {
              if (hasValidDob && !dobUnavailable) return;
              const age = v.replace(/[^\d.]/g, '');
              if (!dobUnavailable) {
                patch({
                  dateOfBirthUnavailable: true,
                  dateOfBirth: '',
                  age,
                  ageUnit: 'years',
                });
                return;
              }
              onFieldChange('age', age);
            }}
            unit={PATIENT_INFO_COPY.years}
            inputMode="decimal"
            error={errors.age}
            readOnly={hasValidDob && !dobUnavailable}
            className="w-full"
          />
        </div>

        <ClinicalChoiceGroup
          id="patient-sex-at-birth"
          label={PATIENT_INFO_COPY.sex}
          required
          value={demo.sex ?? ''}
          options={SEX_OPTIONS}
          onChange={(v) => {
            onFieldChange('sex', v);
            if (isMaleSex(v)) setForceShowRepro(false);
          }}
          error={errors.sex}
        />
      </div>

      {showRepro ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ClinicalChoiceGroup
            label="Pregnancy"
            value={normalizeTriState(demo.pregnancyStatus ?? '')}
            options={YES_NO_UNKNOWN}
            onChange={(v) => onFieldChange('pregnancyStatus', v)}
          />
          <ClinicalChoiceGroup
            label="Breastfeeding"
            value={normalizeTriState(demo.breastfeedingStatus ?? '')}
            options={YES_NO_UNKNOWN}
            onChange={(v) => onFieldChange('breastfeedingStatus', v)}
          />
        </div>
      ) : isMaleSex(demo.sex) ? null : (
        <button
          type="button"
          onClick={() => setForceShowRepro(true)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Show pregnancy & breastfeeding (clinically necessary)
        </button>
      )}
    </ClinicalConfirmCard>
  );
}

interface BackgroundProps {
  consultationId: string;
  demo: Demographics;
  open: boolean;
  completed: boolean;
  pending?: boolean;
  pendingHint?: string;
  step?: number;
  allergyEntries: AllergyDrugEntry[];
  allergiesNone: boolean;
  medicationEntries: MedicationEntry[];
  medsNone: boolean;
  conditions: string[];
  conditionsNone: boolean;
  onEdit: () => void;
  onAllergiesChange: (entries: AllergyDrugEntry[]) => void;
  onAllergiesNone: (none: boolean) => void;
  onMedicationsChange: (entries: MedicationEntry[], displayText: string) => void;
  onMedsNone: (none: boolean) => void;
  onConditionsChange: (next: string[]) => void;
  onConditionsNone: (none: boolean) => void;
  onFieldChange: (key: keyof Demographics, value: string) => void;
  onLifestyleAssessed: () => void;
  onConfirm: () => void;
  saving?: boolean;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  removeAllergyConfirm: (entry: AllergyDrugEntry, onConfirm: () => void) => void;
  attentionAllergies?: boolean;
  attentionMedications?: boolean;
  attentionConditions?: boolean;
  attentionIntense?: 'allergies' | 'medications' | 'conditions' | null;
  conditionsFromConsultation?: string[];
}

export function PatientClinicalHistorySection({
  consultationId,
  demo,
  open,
  completed,
  pending,
  pendingHint,
  step = 2,
  allergyEntries,
  allergiesNone,
  medicationEntries,
  medsNone,
  conditions,
  conditionsNone,
  onEdit,
  onAllergiesChange,
  onAllergiesNone,
  onMedicationsChange,
  onMedsNone,
  onConditionsChange,
  onConditionsNone,
  onFieldChange,
  onLifestyleAssessed,
  onConfirm,
  saving,
  sectionRef,
  removeAllergyConfirm,
  attentionAllergies,
  attentionMedications,
  attentionConditions,
  attentionIntense,
  conditionsFromConsultation,
}: BackgroundProps) {
  const [allergyPickerOpen, setAllergyPickerOpen] = useState(false);
  const [editingAllergy, setEditingAllergy] = useState<AllergyDrugEntry | null>(
    null,
  );
  const [allergyEditOpen, setAllergyEditOpen] = useState(false);
  const [medPickerOpen, setMedPickerOpen] = useState(false);
  const [conditionQuery, setConditionQuery] = useState('');
  const [conditionOpen, setConditionOpen] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [lifestyleOpen, setLifestyleOpen] = useState(false);
  const [draftLifestyle, setDraftLifestyle] = useState({
    smokingStatus: demo.smokingStatus ?? '',
    alcoholUse: demo.alcoholUse ?? '',
    drugUse: normalizeSubstanceUse(demo.drugUse),
  });
  const [noneConfirm, setNoneConfirm] = useState<null | 'allergies' | 'medications' | 'conditions'>(
    null,
  );
  const [inlineError, setInlineError] = useState<string | null>(null);

  const allergiesDone = allergiesNone || allergyEntries.some((a) => a.drug.trim());
  const medsDone = medsNone || medicationEntries.length > 0;
  const conditionsDone = conditionsNone || conditions.length > 0;
  const canConfirm = allergiesDone && medsDone && conditionsDone;

  const catalogSearch = useConditionCatalogSearch(consultationId, conditionQuery, {
    enabled: conditionOpen && !conditionsNone,
  });
  const conditionSuggestions = useMemo(() => {
    const taken = new Set(conditions.map((c) => c.toLowerCase()));
    return (catalogSearch.data ?? [])
      .map((row) => row.displayName)
      .filter((name) => !taken.has(name.toLowerCase()))
      .slice(0, 8);
  }, [catalogSearch.data, conditions]);

  const addCondition = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (conditions.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setConditionQuery('');
      setConditionOpen(false);
      return;
    }
    onConditionsNone(false);
    onConditionsChange([...conditions, name]);
    setConditionQuery('');
    setConditionOpen(false);
  };

  const handleConfirm = () => {
    if (!canConfirm) {
      setInlineError(
        'Confirm allergies, medications, and conditions — enter items or select the corresponding “No known…” option.',
      );
      return;
    }
    setInlineError(null);
    onConfirm();
  };

  return (
    <>
      <ClinicalConfirmCard
        title={PATIENT_INFO_COPY.backgroundTitle}
        subtitle={PATIENT_INFO_COPY.backgroundHelper}
        open={open}
        completed={completed}
        pending={pending}
        pendingHint={pendingHint}
        step={step}
        summary={buildBackgroundSummary({
          allergiesNone,
          allergyEntries,
          medsNone,
          medicationEntries,
          conditionsNone,
          conditions,
        })}
        onEdit={onEdit}
        sectionRef={sectionRef}
        headerVariant="plain"
      >
        <div className="-mx-7 -my-7 border-y border-consult-divider sm:-mx-[30px]">
          {/* Allergies */}
          <ClinicalHistoryRow
            icon={Shield}
            title={
              <>
                {PATIENT_INFO_COPY.allergies} <span className="text-destructive">*</span>
              </>
            }
            subtitle={PATIENT_INFO_COPY.allergiesHelper}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                id="patient-add-allergies"
                onClick={() => {
                  if (allergiesNone) onAllergiesNone(false);
                  setEditingAllergy(null);
                  setAllergyEditOpen(false);
                  setAllergyPickerOpen((v) => !v);
                }}
              >
                <Plus className="h-4 w-4" /> {PATIENT_INFO_COPY.add}
              </Button>
            }
            trailing={
              <ClinicalCheckbox
                id="patient-no-allergies"
                checked={allergiesNone}
                attention={attentionAllergies}
                attentionIntense={attentionIntense === 'allergies'}
                aria-label={PATIENT_INFO_COPY.allergiesNoneAria}
                onChange={(checked) => {
                  if (checked && allergyEntries.length) {
                    setNoneConfirm('allergies');
                    return;
                  }
                  onAllergiesNone(checked);
                  if (checked) setAllergyPickerOpen(false);
                }}
                label={PATIENT_INFO_COPY.allergiesNone}
                className="min-h-10 items-center whitespace-nowrap py-0 text-[14px]"
              />
            }
          >
            {!allergiesNone &&
              allergyEntries.map((entry) => (
                <ProvenanceChip
                  key={entry.id}
                  className={cn(
                    'border-[#b7d9f0] bg-[#eef7fc] text-[#17324D] hover:bg-[#e4f2fa]',
                    editingAllergy?.id === entry.id && 'ring-2 ring-[#7EB8C4]/40',
                  )}
                  fromConsultation={isFromConsultationSource(entry.source)}
                  onClick={() => {
                    setAllergyPickerOpen(false);
                    setEditingAllergy(entry);
                    setAllergyEditOpen(true);
                  }}
                  onRemove={() =>
                    removeAllergyConfirm(entry, () =>
                      onAllergiesChange(allergyEntries.filter((e) => e.id !== entry.id)),
                    )
                  }
                >
                  {allergyChipLabel(entry)}
                </ProvenanceChip>
              ))}
          </ClinicalHistoryRow>

          {editingAllergy && !allergiesNone ? (
            <div className="relative z-20 overflow-visible border-b border-consult-divider bg-muted/20 px-5 py-3 sm:px-[26px]">
              <AllergyReactionDropdown
                drugLabel={
                  editingAllergy.genericName ||
                  editingAllergy.brandName ||
                  editingAllergy.drug ||
                  'this allergy'
                }
                open={allergyEditOpen}
                selected={allergyTypeFromEntry(editingAllergy)}
                onOpenChange={setAllergyEditOpen}
                onSelect={(typeId) => {
                  onAllergiesChange(
                    allergyEntries.map((e) =>
                      e.id === editingAllergy.id
                        ? applyAllergyType(e, typeId)
                        : e,
                    ),
                  );
                  setEditingAllergy(null);
                  setAllergyEditOpen(false);
                }}
                onDismiss={() => {
                  setEditingAllergy(null);
                  setAllergyEditOpen(false);
                }}
              />
            </div>
          ) : allergyPickerOpen && !allergiesNone ? (
            <div className="relative z-20 overflow-visible border-b border-consult-divider bg-muted/20 px-5 py-3 sm:px-[26px]">
              <AllergySearchField
                entries={allergyEntries}
                hideChips
                onChange={(entries) => {
                  onAllergiesNone(false);
                  onAllergiesChange(entries);
                }}
                placeholder="Search drug or ingredient…"
                autoFocus
              />
            </div>
          ) : null}

          {/* Medications */}
          <ClinicalHistoryRow
            icon={Pill}
            title={
              <>
                {PATIENT_INFO_COPY.medications} <span className="text-destructive">*</span>
              </>
            }
            subtitle={PATIENT_INFO_COPY.medicationsHelper}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                id="patient-add-medications"
                onClick={() => {
                  if (medsNone) onMedsNone(false);
                  setMedPickerOpen((v) => !v);
                }}
              >
                <Plus className="h-4 w-4" /> {PATIENT_INFO_COPY.add}
              </Button>
            }
            trailing={
              <ClinicalCheckbox
                id="patient-no-meds"
                checked={medsNone}
                attention={attentionMedications}
                attentionIntense={attentionIntense === 'medications'}
                aria-label={PATIENT_INFO_COPY.medicationsNoneAria}
                onChange={(checked) => {
                  if (checked && medicationEntries.length) {
                    setNoneConfirm('medications');
                    return;
                  }
                  onMedsNone(checked);
                  if (checked) setMedPickerOpen(false);
                }}
                label={PATIENT_INFO_COPY.medicationsNone}
                className="min-h-10 items-center whitespace-nowrap py-0 text-[14px]"
              />
            }
          >
            {!medsNone &&
              medicationEntries.map((entry) => (
                <ProvenanceChip
                  key={entry.id}
                  fromConsultation={isFromConsultationSource(entry.source)}
                  onClick={() => setMedPickerOpen(true)}
                  onRemove={() =>
                    onMedicationsChange(
                      medicationEntries.filter((e) => e.id !== entry.id),
                      medicationEntries
                        .filter((e) => e.id !== entry.id)
                        .map((e) => formatMedicationChipLabel(e))
                        .join(', '),
                    )
                  }
                >
                  {formatMedicationChipLabel(entry)}
                </ProvenanceChip>
              ))}
          </ClinicalHistoryRow>

          {medPickerOpen && !medsNone ? (
            <div className="border-b border-consult-divider bg-muted/20 px-5 py-3 sm:px-[26px]">
              <MedicationSearchField
                label="Current medications"
                hideLabel
                variant="chips"
                entries={medicationEntries}
                onChange={(entries, display) => {
                  onMedsNone(false);
                  onMedicationsChange(entries, display);
                }}
              />
            </div>
          ) : null}

          {/* Conditions */}
          <ClinicalHistoryRow
            icon={ClipboardList}
            title={
              <>
                {PATIENT_INFO_COPY.conditions} <span className="text-destructive">*</span>
              </>
            }
            subtitle={PATIENT_INFO_COPY.conditionsHelper}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                id="patient-add-conditions"
                onClick={() => {
                  if (conditionsNone) onConditionsNone(false);
                  setConditionOpen((v) => !v);
                }}
              >
                <Plus className="h-4 w-4" /> {PATIENT_INFO_COPY.add}
              </Button>
            }
            trailing={
              <ClinicalCheckbox
                id="patient-no-conditions"
                checked={conditionsNone}
                attention={attentionConditions}
                attentionIntense={attentionIntense === 'conditions'}
                aria-label={PATIENT_INFO_COPY.conditionsNoneAria}
                onChange={(checked) => {
                  if (checked && conditions.length) {
                    setNoneConfirm('conditions');
                    return;
                  }
                  onConditionsNone(checked);
                  if (checked) setConditionOpen(false);
                }}
                label={PATIENT_INFO_COPY.conditionsNone}
                className="min-h-10 items-center whitespace-nowrap py-0 text-[14px]"
              />
            }
          >
            {!conditionsNone &&
              conditions.map((c) => (
                <ProvenanceChip
                  key={c}
                  fromConsultation={Boolean(
                    conditionsFromConsultation?.some((name) => name.toLowerCase() === c.toLowerCase()),
                  )}
                  onRemove={() => onConditionsChange(conditions.filter((x) => x !== c))}
                >
                  {c}
                </ProvenanceChip>
              ))}
          </ClinicalHistoryRow>

          {conditionOpen && !conditionsNone ? (
            <div className="relative border-b border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
              <Input
                value={conditionQuery}
                onChange={(e) => setConditionQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCondition(conditionQuery);
                  }
                }}
                placeholder="Search condition…"
                className="h-10 rounded-lg border-border text-sm shadow-none"
                autoFocus
              />
              {(conditionQuery.trim() || conditionSuggestions.length > 0) && (
                <div className="absolute left-4 right-4 z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-md sm:left-5 sm:right-5">
                  {conditionSuggestions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-full px-3.5 py-2.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => addCondition(c)}
                    >
                      {c}
                    </button>
                  ))}
                  {conditionQuery.trim() &&
                    !conditionSuggestions.some(
                      (c) => c.toLowerCase() === conditionQuery.trim().toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        className="w-full border-t border-border px-3.5 py-2.5 text-left text-sm font-medium text-primary hover:bg-muted/50"
                        onClick={() => addCondition(conditionQuery)}
                      >
                        Add unlisted condition “{conditionQuery.trim()}”
                      </button>
                    )}
                </div>
              )}
            </div>
          ) : null}

          {/* Lifestyle — inline editor (matches clinical design; no cramped modal) */}
          {!lifestyleOpen ? (
            <ClinicalHistoryRow
              icon={Leaf}
              title={PATIENT_INFO_COPY.lifestyle}
              subtitle={PATIENT_INFO_COPY.lifestyleHelper}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                  onClick={() => {
                    setDraftLifestyle({
                      smokingStatus: demo.smokingStatus ?? '',
                      alcoholUse: demo.alcoholUse ?? '',
                      drugUse: normalizeSubstanceUse(demo.drugUse),
                    });
                    setLifestyleOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> {PATIENT_INFO_COPY.addLifestyle}
                </Button>
              }
              trailing={
                <span className="inline-flex items-center rounded-full bg-[#eef3f5] px-2.5 py-1 text-[11px] font-semibold text-[#667085]">
                  {PATIENT_INFO_COPY.optional}
                </span>
              }
            >
              {demo.lifestyleAssessed ? (
                <p className="text-[14px] text-[#24354B]">{lifestyleSummary(demo)}</p>
              ) : null}
            </ClinicalHistoryRow>
          ) : (
            <div className="border-b border-consult-divider bg-card last:border-b-0">
              <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-[26px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <h3 className="m-0 text-base font-bold leading-snug text-foreground">
                      Lifestyle
                    </h3>
                    <span className="text-[13px] font-normal text-muted-foreground">
                      Pathway-relevant only
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLifestyleOpen(false)}
                  className="inline-flex shrink-0 items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  Collapse
                  <span className="text-[10px] leading-none" aria-hidden>
                    ▴
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 px-5 pb-2 sm:grid-cols-3 sm:gap-5 sm:px-[26px]">
                <ClinicalSelect
                  label="Smoking status"
                  value={draftLifestyle.smokingStatus}
                  options={[...LIFESTYLE_SMOKING]}
                  onChange={(v) => setDraftLifestyle((d) => ({ ...d, smokingStatus: v }))}
                  size="comfortable"
                  placeholder="Select…"
                />
                <ClinicalSelect
                  label="Alcohol use"
                  value={draftLifestyle.alcoholUse}
                  options={[...LIFESTYLE_ALCOHOL]}
                  onChange={(v) => setDraftLifestyle((d) => ({ ...d, alcoholUse: v }))}
                  size="comfortable"
                  placeholder="Select…"
                />
                <ClinicalSelect
                  label="Substance use"
                  value={draftLifestyle.drugUse}
                  options={[...LIFESTYLE_SUBSTANCE]}
                  onChange={(v) => setDraftLifestyle((d) => ({ ...d, drugUse: v }))}
                  size="comfortable"
                  placeholder="Select…"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4 sm:px-[26px]">
                <button
                  type="button"
                  onClick={() => setLifestyleOpen(false)}
                  className="h-10 px-2 text-[15px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  Cancel
                </button>
                <ClinicalPrimaryButton
                  onClick={() => {
                    onFieldChange('smokingStatus', draftLifestyle.smokingStatus);
                    onFieldChange('alcoholUse', draftLifestyle.alcoholUse);
                    onFieldChange('drugUse', draftLifestyle.drugUse);
                    onLifestyleAssessed();
                    setLifestyleOpen(false);
                  }}
                  className="h-11 min-w-[140px] rounded-lg px-5 text-[15px]"
                >
                  Save lifestyle
                </ClinicalPrimaryButton>
              </div>
            </div>
          )}

          {/* Additional history */}
          <ClinicalHistoryRow
            icon={FolderOpen}
            title="Additional history"
            subtitle="Surgical and family history"
            onClick={() => setAdditionalOpen((v) => !v)}
            action={
              <span className="text-[#17324D]" aria-hidden>
                {additionalOpen ? '▾' : '›'}
              </span>
            }
          />
          {additionalOpen ? (
            <div className="space-y-3 bg-muted/20 px-5 py-4 sm:px-[26px]">
              <div>
                <ClinicalFieldLabel>Relevant surgical history</ClinicalFieldLabel>
                <Textarea
                  value={demo.surgicalHistory ?? ''}
                  onChange={(e) => onFieldChange('surgicalHistory', e.target.value)}
                  placeholder="e.g. Appendectomy 2019"
                  rows={2}
                  className="min-h-[72px] resize-y rounded-lg text-sm"
                />
              </div>
              <div>
                <ClinicalFieldLabel>Relevant family history</ClinicalFieldLabel>
                <Textarea
                  value={demo.familyHistory ?? ''}
                  onChange={(e) => onFieldChange('familyHistory', e.target.value)}
                  placeholder="e.g. Hypertension (father)"
                  rows={2}
                  className="min-h-[72px] resize-y rounded-lg text-sm"
                />
              </div>
            </div>
          ) : null}
        </div>

        {inlineError ? <p className="text-xs text-destructive">{inlineError}</p> : null}
      </ClinicalConfirmCard>
      <ConfirmDialog
        open={noneConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setNoneConfirm(null);
        }}
        title={PATIENT_INFO_COPY.noneConfirmTitle}
        description={PATIENT_INFO_COPY.noneConfirmBody}
        confirmLabel={PATIENT_INFO_COPY.noneConfirmAction}
        cancelLabel="Keep entries"
        variant="destructive"
        onConfirm={() => {
          if (noneConfirm === 'allergies') {
            onAllergiesNone(true);
            setAllergyPickerOpen(false);
          } else if (noneConfirm === 'medications') {
            onMedsNone(true);
            setMedPickerOpen(false);
          } else if (noneConfirm === 'conditions') {
            onConditionsNone(true);
            setConditionOpen(false);
          }
          setNoneConfirm(null);
        }}
      />
    </>
  );
}

interface LabsProps {
  consultationId: string;
  demo: Demographics;
  extractedLabValues: ExtractedLabValue[];
  open: boolean;
  completed: boolean;
  pending?: boolean;
  pendingHint?: string;
  step?: number;
  onEdit: () => void;
  onFieldChange: (key: keyof Demographics, value: string) => void;
  onLabsApply: (formattedText: string, values: ExtractedLabValue[]) => void;
  onSkip: () => void;
  onSave: () => void;
  saving?: boolean;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  hasUnreviewedReport: boolean;
}

export function LabsVitalsSection({
  consultationId,
  demo,
  extractedLabValues,
  open,
  completed,
  pending,
  pendingHint,
  step = 3,
  onEdit,
  onFieldChange,
  onLabsApply,
  onSkip,
  onSave,
  saving,
  sectionRef,
  hasUnreviewedReport,
}: LabsProps) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [bpError, setBpError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [labsError, setLabsError] = useState<string | null>(null);
  /** True while the pharmacist is picking a custom Taken date (even if value is still today). */
  const [takenCustomMode, setTakenCustomMode] = useState(
    () => resolveTakenPreset(demo.measurementDate) === 'custom',
  );

  const takenPreset: 'today' | 'custom' =
    takenCustomMode || resolveTakenPreset(demo.measurementDate) === 'custom'
      ? 'custom'
      : 'today';

  const { labs: latestLabs, vitals: latestVitals } = useMemo(
    () => partitionLabAndVitalResults(extractedLabValues),
    [extractedLabValues],
  );
  const vitalRows = useMemo(() => presentLatestLabRows(latestVitals), [latestVitals]);

  const hasVitals = Boolean(
    demo.height?.trim() ||
      demo.weight?.trim() ||
      demo.pulse?.trim() ||
      demo.bloodPressureSystolic?.trim() ||
      demo.bloodPressureDiastolic?.trim() ||
      vitalRows.length > 0,
  );
  const hasLabs = latestLabs.length > 0 || Boolean(demo.labValues?.trim());
  const hasUnsaved = hasVitals || hasLabs || hasUnreviewedReport;

  const ensureMeasurementDate = () => {
    if (!demo.measurementDate) {
      onFieldChange('measurementDate', todayIso());
      setTakenCustomMode(false);
    }
  };

  const validateVitals = (): boolean => {
    setBpError(null);
    setDateError(null);
    const sys = demo.bloodPressureSystolic?.trim();
    const dia = demo.bloodPressureDiastolic?.trim();
    if ((sys && !dia) || (!sys && dia)) {
      setBpError('Enter both systolic and diastolic blood pressure.');
      return false;
    }
    if (sys && dia) {
      const s = Number(sys);
      const d = Number(dia);
      if (!Number.isNaN(s) && !Number.isNaN(d) && s <= d) {
        setBpError('Systolic should be higher than diastolic — please verify.');
        return false;
      }
    }
    if (demo.measurementDate) {
      const today = todayIso();
      if (demo.measurementDate > today) {
        setDateError('Measurement date cannot be in the future.');
        return false;
      }
    }
    return true;
  };

  const handleSave = () => {
    if (hasUnreviewedReport) {
      setLabsError('Review the extracted results or remove the report before continuing.');
      return;
    }
    if (!validateVitals()) return;
    setLabsError(null);
    onSave();
  };

  const handleSkip = () => {
    if (hasUnsaved) {
      setDiscardOpen(true);
      return;
    }
    onSkip();
  };

  return (
    <>
      <ClinicalConfirmCard
        title={
          <span className="inline-flex items-center gap-2.5">
            {PATIENT_INFO_COPY.labsTitle}
            <span className="inline-flex items-center rounded-full bg-[#eef3f5] px-2.5 py-0.5 text-[11px] font-semibold text-[#667085]">
              {PATIENT_INFO_COPY.optional}
            </span>
          </span>
        }
        open={open}
        completed={completed}
        pending={pending}
        pendingHint={pendingHint}
        step={step}
        summary={buildLabsVitalsSummary(demo, latestLabs.length)}
        onEdit={onEdit}
        sectionRef={sectionRef}
        headerVariant="plain"
        subtitle={PATIENT_INFO_COPY.labsHelper}
        className="rounded-[14px]"
      >
        {/* Recent lab results */}
        <div className="space-y-4 pt-2">
          <h3 className="m-0 text-[21px] font-bold leading-snug text-foreground">
            Recent lab results{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </h3>
          <ImportLabReport
            consultationId={consultationId}
            currentValue={demo.labValues ?? ''}
            extractedValues={extractedLabValues}
            onApply={(text, values) => {
              setLabsError(null);
              onLabsApply(text, values);
            }}
          />
          {labsError ? <p className="text-sm text-destructive">{labsError}</p> : null}
        </div>

        {/* Vitals — single compact row */}
        <div className="mt-2 space-y-3 border-t border-[#D8E0E3] pt-[22px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 text-[18px] font-bold leading-none text-foreground">
            {PATIENT_INFO_COPY.vitals}
          </h3>
            <span className="inline-flex items-center rounded-full bg-[#EEF2F4] px-2.5 py-0.5 text-[11px] font-medium text-[#667085]">
              {PATIENT_INFO_COPY.optional}
            </span>
          </div>
          <p className="text-[13px] text-[#667085]">{PATIENT_INFO_COPY.vitalsHelper}</p>

          {vitalRows.length ? (
            <LatestResultsTable
              title="Vitals from report"
              subtitle="Most recent value for each vital"
              rows={vitalRows}
            />
          ) : null}

          <div className="flex items-start gap-x-2.5 gap-y-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="w-[5.75rem] shrink-0">
              <ClinicalFieldLabel className="mb-1.5 text-[13px] font-semibold">
                Height
              </ClinicalFieldLabel>
              <ClinicalUnitInput
                size="compact"
                value={demo.height ?? ''}
                onChange={(v) => {
                  onFieldChange('height', v);
                  ensureMeasurementDate();
                }}
                placeholder="170"
                unit="cm"
                inputMode="decimal"
              />
            </div>

            <div className="w-[5.75rem] shrink-0">
              <ClinicalFieldLabel className="mb-1.5 text-[13px] font-semibold">
                Weight
              </ClinicalFieldLabel>
              <ClinicalUnitInput
                size="compact"
                value={demo.weight ?? ''}
                onChange={(v) => {
                  onFieldChange('weight', v);
                  ensureMeasurementDate();
                }}
                placeholder="72"
                unit="kg"
                inputMode="decimal"
              />
            </div>

            <div className="w-[7.25rem] shrink-0">
              <ClinicalReadOnlyField
                size="compact"
                label="BMI"
                value={demo.bmi ?? ''}
                placeholder="—"
                hint="Calculated from height and weight"
                trailing={<Calculator className="h-3.5 w-3.5" aria-hidden />}
              />
            </div>

            <div className="w-[10.5rem] shrink-0">
              <ClinicalBloodPressureInput
                size="compact"
                label="Blood pressure"
                systolic={demo.bloodPressureSystolic ?? ''}
                diastolic={demo.bloodPressureDiastolic ?? ''}
                onSystolicChange={(v) => {
                  onFieldChange('bloodPressureSystolic', v);
                  ensureMeasurementDate();
                  setBpError(null);
                }}
                onDiastolicChange={(v) => {
                  onFieldChange('bloodPressureDiastolic', v);
                  ensureMeasurementDate();
                  setBpError(null);
                }}
                error={bpError ?? undefined}
              />
            </div>

            <div className="w-[5.75rem] shrink-0">
              <ClinicalFieldLabel className="mb-1.5 text-[13px] font-semibold">
                Pulse
              </ClinicalFieldLabel>
              <ClinicalUnitInput
                size="compact"
                value={demo.pulse ?? ''}
                onChange={(v) => {
                  onFieldChange('pulse', v.replace(/[^\d]/g, ''));
                  ensureMeasurementDate();
                }}
                placeholder="72"
                unit="bpm"
                inputMode="numeric"
              />
            </div>

            <div className="w-[8.5rem] shrink-0">
              <ClinicalFieldLabel className="mb-1.5 text-[13px] font-semibold">
                Taken
              </ClinicalFieldLabel>
              {takenPreset === 'custom' ? (
                <div className="space-y-1.5">
                  <Input
                    type="date"
                    value={demo.measurementDate ?? ''}
                    max={todayIso()}
                    aria-label="Custom measurement date"
                    aria-invalid={Boolean(dateError)}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTakenCustomMode(true);
                      onFieldChange('measurementDate', next);
                      setDateError(null);
                    }}
                    className={cn(
                      'h-10 rounded-[7px] border-[#C5D0D4] px-2 text-[13px] tabular-nums shadow-none',
                      'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
                      dateError && 'border-destructive/60',
                    )}
                  />
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-primary hover:underline"
                    onClick={() => {
                      setTakenCustomMode(false);
                      onFieldChange('measurementDate', todayIso());
                      setDateError(null);
                    }}
                  >
                    Use Today
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value="today"
                    aria-label="When vitals were taken"
                    onChange={(e) => {
                      const next = e.target.value;
                      setDateError(null);
                      if (next === 'today') {
                        setTakenCustomMode(false);
                        onFieldChange('measurementDate', todayIso());
                        return;
                      }
                      // Custom date — open calendar; seed with today so the picker has a valid value
                      setTakenCustomMode(true);
                      onFieldChange('measurementDate', demo.measurementDate || todayIso());
                    }}
                    className={cn(
                      'h-10 w-full appearance-none rounded-[7px] border border-[#C5D0D4] bg-card',
                      'pl-2.5 pr-8 text-[13px] font-medium text-foreground shadow-none',
                      'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
                      dateError && 'border-destructive/60',
                    )}
                  >
                    <option value="today">Today</option>
                    <option value="custom">Custom date</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667085]"
                    aria-hidden
                  />
                </div>
              )}
              {dateError ? <p className="mt-1 text-xs text-destructive">{dateError}</p> : null}
            </div>
          </div>
        </div>
      </ClinicalConfirmCard>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Leave without saving these entries?"
        description="You have entered labs or vitals that have not been saved. Discard them and continue, or keep editing."
        cancelLabel="Keep editing"
        confirmLabel="Discard and continue"
        variant="destructive"
        onConfirm={() => {
          setDiscardOpen(false);
          onSkip();
        }}
      />
    </>
  );
}

export function resolveAiMatchPercent(
  suggestions: PathwaySuggestion[] | undefined,
  selectedPathwayId?: string,
): number | null {
  if (!suggestions?.length) return null;
  const match = selectedPathwayId
    ? suggestions.find((s) => s.id === selectedPathwayId)
    : suggestions[0];
  return match?.confidence ?? null;
}
