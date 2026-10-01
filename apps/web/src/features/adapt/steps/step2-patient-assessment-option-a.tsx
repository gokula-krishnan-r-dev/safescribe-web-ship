'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Lightbulb,
  Shield,
  Pill,
  ClipboardList,
  Leaf,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ClinicalCollapsedSummary } from '@/features/consultations/clinical-ui';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import { cn } from '@/lib/utils';
import {
  isAdaptStepTwoOptionAValid,
  emptyAdaptStepTwoOptionA,
  emptyAdaptStepTwoOptionC,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionC,
  type AdaptAllergyEntry,
  type AdaptLifestyle,
} from '@safescript/shared';
import {
  demographicsAgeFromDob,
  dateOfBirthError,
  isDateOfBirthUnavailable,
  isoDateLocal,
  isoDateYearsAgo,
} from '@safescript/shared';
import {
  ClinicalDobInput,
} from '@/features/consultations/clinical-dob-input';
import {
  ClinicalCheckbox,
  ClinicalChoiceGroup,
  ClinicalChip,
  ClinicalFieldLabel,
  ClinicalHistoryRow,
  ClinicalUnitInput,
} from '@/features/consultations/clinical-ui';
import {
  SEX_OPTIONS,
  YES_NO_UNKNOWN,
} from '@/features/consultations/steps/step3-patient-details';
import { useConditionCatalogSearch } from '@/features/consultations/hooks';
import { PATIENT_INFO_COPY } from '@/features/consultations/patient-info/patient-info-copy';
import { AllergySearchField, type AllergyDrugEntry, allergyChipLabel } from '@/features/consultations/allergy-search-field';
import {
  AllergyReactionDropdown,
  applyAllergyType,
  allergyTypeFromEntry,
} from '@/features/consultations/allergy-type-dialog';
import { MedicationSearchField } from '@/features/consultations/medication-search-field';
import { formatMedicationChipLabel } from '@/features/consultations/medication-utils';
import type { MedicationEntry } from '@/features/consultations/types';
import { AdaptLifestyleDialog } from './adapt-lifestyle-dialog';
import { AdaptAdditionalHistoryDialog } from './adapt-additional-history-dialog';
import {
  AdaptLabsVitalsInline,
  finalizeAdaptLabsOnConfirm,
  validateAdaptLabsVitals,
} from './adapt-labs-vitals-inline';

function isMaleSex(sex?: string): boolean {
  return (sex ?? '').trim().toLowerCase() === 'male';
}

/** Same rule as Prescribe PatientDemographicsSection. */
function showReproductiveFields(sex?: string): boolean {
  if (isMaleSex(sex)) return false;
  return sex === 'Female' || sex === 'Intersex' || sex === 'Unknown' || sex === 'Other';
}

function normalizeTriState(v: string): string {
  const t = v.trim();
  if (!t) return '';
  if (/^yes$/i.test(t)) return 'Yes';
  if (/^no$/i.test(t)) return 'No';
  if (/^unknown$/i.test(t)) return 'Unknown';
  return t;
}

export interface Step2PatientAssessmentOptionAProps {
  consultationId: string;
  initialStep2A?: AdaptStepTwoOptionA;
  initialStep2C?: AdaptStepTwoOptionC;
  jurisdiction: string;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  hideTopHeader?: boolean;
  onSaveStep2A: (step2A: AdaptStepTwoOptionA) => Promise<void> | void;
  onSaveStep2C: (step2C: AdaptStepTwoOptionC) => Promise<void> | void;
  onBackToPrescriptionAndReason: () => void;
  onConfirmPatientInfo: (step2A: AdaptStepTwoOptionA, step2C: AdaptStepTwoOptionC) => void;
}

export function Step2PatientAssessmentOptionA({
  consultationId,
  initialStep2A,
  initialStep2C,
  isOpen = true,
  onToggleOpen,
  sectionRef,
  hideTopHeader = false,
  onSaveStep2A,
  onSaveStep2C,
  onBackToPrescriptionAndReason,
  onConfirmPatientInfo,
}: Step2PatientAssessmentOptionAProps) {
  const [step2A, setStep2A] = useState<AdaptStepTwoOptionA>(
    () => initialStep2A ?? emptyAdaptStepTwoOptionA(),
  );
  const [step2C, setStep2C] = useState<AdaptStepTwoOptionC>(
    () => initialStep2C ?? emptyAdaptStepTwoOptionC(),
  );
  const [labsError, setLabsError] = useState<string | null>(null);

  // Accordion expansion states
  const [internalCardOpen, setInternalCardOpen] = useState(true);
  const cardOpen = onToggleOpen ? isOpen : internalCardOpen;
  const toggleCardOpen = onToggleOpen ?? (() => setInternalCardOpen((v) => !v));

  const [snapshotOpen, setSnapshotOpen] = useState(true);
  const [backgroundOpen, setBackgroundOpen] = useState(true);
  /** Manual reveal only when sex is empty — Female/Intersex/Unknown auto-show like Prescribe. */
  const [forceShowRepro, setForceShowRepro] = useState(false);

  // Interactive dialogs & pickers
  const [allergyPickerOpen, setAllergyPickerOpen] = useState(false);
  const [editingAllergy, setEditingAllergy] = useState<AdaptAllergyEntry | null>(null);
  const [allergyEditOpen, setAllergyEditOpen] = useState(false);

  const [medPickerOpen, setMedPickerOpen] = useState(false);

  const [conditionPickerOpen, setConditionPickerOpen] = useState(false);
  const [conditionQuery, setConditionQuery] = useState('');

  const [lifestyleModalOpen, setLifestyleModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Confirm dialog for unchecking if entries exist
  const [noneConfirmType, setNoneConfirmType] = useState<
    'allergies' | 'medications' | 'conditions' | null
  >(null);

  const dobUnavailable = Boolean(step2A.demographics.dateOfBirthUnavailable);
  const hasValidDob =
    !dobUnavailable &&
    Boolean(step2A.demographics.dateOfBirth) &&
    dateOfBirthError(step2A.demographics.dateOfBirth) == null;
  const dobMax = isoDateLocal();
  const dobMin = isoDateYearsAgo(120);

  // Validation
  const validation = useMemo(() => isAdaptStepTwoOptionAValid(step2A), [step2A]);

  // Patch demographics
  const patchDemographics = useCallback(
    (patch: Partial<AdaptStepTwoOptionA['demographics']>) => {
      setStep2A((prev) => {
        const next = {
          ...prev,
          demographics: {
            ...prev.demographics,
            ...patch,
          },
        };
        void onSaveStep2A(next);
        return next;
      });
    },
    [onSaveStep2A],
  );

  // Patch background
  const patchBackground = useCallback(
    (patch: Partial<AdaptStepTwoOptionA['background']>) => {
      setStep2A((prev) => {
        const next = {
          ...prev,
          background: {
            ...prev.background,
            ...patch,
          },
        };
        void onSaveStep2A(next);
        return next;
      });
    },
    [onSaveStep2A],
  );

  // Handlers for Snapshot
  const handleDobChange = (iso: string) => {
    const valid = Boolean(iso) && dateOfBirthError(iso) == null;
    const derived = valid ? demographicsAgeFromDob(iso) : null;
    patchDemographics({
      dateOfBirth: iso,
      dateOfBirthUnavailable: false,
      age: derived?.age ?? '',
      ageUnit: derived?.ageUnit ?? 'years',
    });
  };

  const handleDobUnavailableChange = (checked: boolean) => {
    if (checked) {
      patchDemographics({
        dateOfBirth: '',
        dateOfBirthUnavailable: true,
        age: '',
        ageUnit: 'years',
      });
    } else {
      const derived =
        step2A.demographics.dateOfBirth &&
        dateOfBirthError(step2A.demographics.dateOfBirth) == null
          ? demographicsAgeFromDob(step2A.demographics.dateOfBirth)
          : null;
      patchDemographics({
        dateOfBirthUnavailable: false,
        age: derived?.age ?? '',
        ageUnit: derived?.ageUnit ?? 'years',
      });
    }
  };

  const handleSexChange = (sex: string) => {
    // Match Prescribe: preserve reproductive answers when sex changes;
    // only clear when Male (fields hide).
    if (isMaleSex(sex)) {
      setForceShowRepro(false);
      patchDemographics({ sex, pregnancyStatus: '', breastfeedingStatus: '' });
      return;
    }
    patchDemographics({ sex });
  };

  const sex = step2A.demographics.sex ?? '';
  const showRepro =
    !isMaleSex(sex) && (forceShowRepro || showReproductiveFields(sex));

  // Handlers for Allergies
  const handleAllergiesNoneToggle = (checked: boolean) => {
    if (checked && step2A.background.allergyEntries.length > 0) {
      setNoneConfirmType('allergies');
      return;
    }
    patchBackground({
      allergiesNone: checked,
      allergyEntries: checked ? [] : step2A.background.allergyEntries,
    });
    if (checked) setAllergyPickerOpen(false);
  };

  const handleAddAllergyEntries = (entries: AllergyDrugEntry[]) => {
    const mapped: AdaptAllergyEntry[] = entries.map((e) => ({
      id: e.id,
      drug: e.drug,
      reaction: e.reaction,
      severity: e.severity,
      allergyType: allergyTypeFromEntry(e) ?? undefined,
    }));
    patchBackground({
      allergiesNone: false,
      allergyEntries: mapped,
    });
  };

  const handleRemoveAllergy = (id: string) => {
    patchBackground({
      allergyEntries: step2A.background.allergyEntries.filter((a) => a.id !== id),
    });
  };

  // Handlers for Medications
  const handleMedsNoneToggle = (checked: boolean) => {
    if (checked && step2A.background.medicationEntries.length > 0) {
      setNoneConfirmType('medications');
      return;
    }
    patchBackground({
      medsNone: checked,
      medicationEntries: checked ? [] : step2A.background.medicationEntries,
    });
    if (checked) setMedPickerOpen(false);
  };

  const handleRemoveMedication = (id: string) => {
    patchBackground({
      medicationEntries: step2A.background.medicationEntries.filter((m) => m.id !== id),
    });
  };

  // Handlers for Conditions
  const handleConditionsNoneToggle = (checked: boolean) => {
    if (checked && step2A.background.conditions.length > 0) {
      setNoneConfirmType('conditions');
      return;
    }
    patchBackground({
      conditionsNone: checked,
      conditions: checked ? [] : step2A.background.conditions,
    });
    if (checked) setConditionPickerOpen(false);
  };

  const handleAddCondition = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (step2A.background.conditions.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setConditionQuery('');
      setConditionPickerOpen(false);
      return;
    }
    patchBackground({
      conditionsNone: false,
      conditions: [...step2A.background.conditions, trimmed],
    });
    setConditionQuery('');
    setConditionPickerOpen(false);
  };

  const handleRemoveCondition = (name: string) => {
    patchBackground({
      conditions: step2A.background.conditions.filter((c) => c !== name),
    });
  };

  const allergyEntriesForSearch: AllergyDrugEntry[] = useMemo(() => {
    return step2A.background.allergyEntries.map((a) => ({
      id: a.id,
      drug: a.drug,
      reaction: a.reaction ?? '',
      severity: (a.severity as AllergyDrugEntry['severity']) ?? '',
    }));
  }, [step2A.background.allergyEntries]);

  const medEntriesForSearch: MedicationEntry[] = useMemo(() => {
    return step2A.background.medicationEntries.map((m) => ({
      id: m.id,
      label: m.label || m.name,
      brandName: m.brandName,
      genericName: m.genericName,
      strength: m.strength || m.dose,
      dosageForm: m.dosageForm,
    }));
  }, [step2A.background.medicationEntries]);

  const catalogSearch = useConditionCatalogSearch(consultationId, conditionQuery, {
    enabled: conditionPickerOpen && !step2A.background.conditionsNone,
  });
  const conditionSuggestions = useMemo(() => {
    const taken = new Set(step2A.background.conditions.map((c) => c.toLowerCase()));
    return (catalogSearch.data ?? [])
      .map((row) => row.displayName)
      .filter((name) => !taken.has(name.toLowerCase()))
      .slice(0, 8);
  }, [catalogSearch.data, step2A.background.conditions]);

  // Summaries when collapsed
  const snapshotSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (step2A.demographics.dateOfBirth && !dobUnavailable) {
      parts.push(`DOB: ${step2A.demographics.dateOfBirth}`);
    }
    if (step2A.demographics.age) {
      parts.push(`${step2A.demographics.age}y`);
    }
    if (step2A.demographics.sex) {
      parts.push(step2A.demographics.sex);
    }
    if (step2A.demographics.pregnancyStatus) {
      parts.push(`Pregnancy: ${step2A.demographics.pregnancyStatus}`);
    }
    if (step2A.demographics.breastfeedingStatus) {
      parts.push(`Breastfeeding: ${step2A.demographics.breastfeedingStatus}`);
    }
    return parts.join(' · ') || 'Snapshot incomplete';
  }, [step2A.demographics, dobUnavailable]);

  const backgroundSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (step2A.background.allergiesNone) parts.push('Allergies: None');
    else if (step2A.background.allergyEntries.length > 0)
      parts.push(`Allergies: ${step2A.background.allergyEntries.length}`);

    if (step2A.background.medsNone) parts.push('Meds: None');
    else if (step2A.background.medicationEntries.length > 0)
      parts.push(`Meds: ${step2A.background.medicationEntries.length}`);

    if (step2A.background.conditionsNone) parts.push('Conditions: None');
    else if (step2A.background.conditions.length > 0)
      parts.push(`Conditions: ${step2A.background.conditions.length}`);

    if (step2A.background.lifestyle?.assessed) parts.push('Lifestyle assessed');
    return parts.join(' · ') || 'Background incomplete';
  }, [step2A.background]);

  const fullSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (step2A.demographics.dateOfBirth && !dobUnavailable) {
      parts.push(
        step2A.demographics.age
          ? `DOB: ${step2A.demographics.dateOfBirth} (${step2A.demographics.age} ${
              step2A.demographics.ageUnit === 'months'
                ? 'mos'
                : step2A.demographics.ageUnit === 'weeks'
                ? 'wks'
                : step2A.demographics.ageUnit === 'days'
                ? 'days'
                : 'yrs'
            })`
          : `DOB: ${step2A.demographics.dateOfBirth}`,
      );
    } else if (step2A.demographics.age) {
      parts.push(`${step2A.demographics.age} ${step2A.demographics.ageUnit || 'yrs'}`);
    }
    if (step2A.demographics.sex) {
      const s = SEX_OPTIONS.find((o) => o.value === step2A.demographics.sex)?.label || step2A.demographics.sex;
      parts.push(s);
    }
    if (step2A.background.allergiesNone) {
      parts.push('No known allergies');
    } else if (step2A.background.allergyEntries.length > 0) {
      parts.push(
        `${step2A.background.allergyEntries.length} allerg${
          step2A.background.allergyEntries.length === 1 ? 'y' : 'ies'
        }`,
      );
    }
    if (step2A.background.conditionsNone) {
      parts.push('No known conditions');
    } else if (step2A.background.conditions.length > 0) {
      parts.push(
        `${step2A.background.conditions.length} condition${
          step2A.background.conditions.length === 1 ? '' : 's'
        }`,
      );
    }
    if (step2A.background.medsNone) {
      parts.push('No active meds');
    } else if (step2A.background.medicationEntries.length > 0) {
      parts.push(
        `${step2A.background.medicationEntries.length} medication${
          step2A.background.medicationEntries.length === 1 ? '' : 's'
        }`,
      );
    }
    return parts.join(' · ') || 'Patient info documented';
  }, [step2A, dobUnavailable]);

  const handleConfirm = () => {
    if (!validation.valid) return;
    const labsIssue = validateAdaptLabsVitals(step2C);
    if (labsIssue) {
      setLabsError(labsIssue);
      return;
    }
    setLabsError(null);
    const confirmed: AdaptStepTwoOptionA = {
      ...step2A,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
    };
    const confirmedLabs = finalizeAdaptLabsOnConfirm(step2C);
    setStep2A(confirmed);
    setStep2C(confirmedLabs);
    void onSaveStep2A(confirmed);
    void onSaveStep2C(confirmedLabs);
    onConfirmPatientInfo(confirmed, confirmedLabs);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Breadcrumb */}
      {!hideTopHeader && (
        <div>
          <button
            type="button"
            onClick={onBackToPrescriptionAndReason}
            className="inline-flex items-center gap-1.5 text-lg font-bold text-[#102a43] hover:text-[#0F6F6B] transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>Patient Assessment</span>
          </button>
          <p className="mt-0.5 text-sm text-[#52677a]">
            Review and complete the following information to support your clinical assessment.
          </p>
        </div>
      )}

      {/* Main 2A Card */}
      {!cardOpen ? (
        <div ref={sectionRef} className="scroll-mt-3 clinical-section-collapse">
          <ClinicalCollapsedSummary
            step="2A"
            title="Patient info"
            summary={fullSummaryText}
            onEdit={() => {
              toggleCardOpen();
              setTimeout(() => {
                if (sectionRef && 'current' in sectionRef && sectionRef.current) {
                  scrollConsultChildIntoView(sectionRef.current, {
                    behavior: 'smooth',
                    block: 'start',
                    offset: 16,
                  });
                }
              }, 50);
            }}
          />
        </div>
      ) : (
        <div ref={sectionRef} className="rounded-xl border border-[#d9e4e8] bg-white shadow-sm overflow-hidden clinical-section-expand">
        {/* Card Header 2A */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"]')) return;
            toggleCardOpen();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"]')) return;
              e.preventDefault();
              toggleCardOpen();
            }
          }}
          className="flex items-center justify-between border-b border-[#e2eaed] px-5 py-3.5 cursor-pointer select-none hover:bg-slate-50/60 transition-colors sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F6F6B] text-xs font-bold text-white shadow-sm">
              2A
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-[#102a43]">Patient info</h2>
              <p className="text-xs text-[#627d98]">
                Review and complete patient demographics and medical background.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!cardOpen && (step2A.confirmed || step2A.demographics.dateOfBirth) && (
              <span className="mr-1 hidden max-w-[280px] truncate rounded-full bg-[#f0f4f8] px-2.5 py-1 text-xs font-medium text-[#52677a] md:inline-flex md:max-w-[420px]">
                {fullSummaryText}
              </span>
            )}

            {!cardOpen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleCardOpen}
                className="h-7 text-xs font-medium text-[#0F6F6B] border-[#0F6F6B]/30 hover:bg-[#0F6F6B]/10"
              >
                Edit
              </Button>
            )}

            {/* Tips Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs font-medium text-[#0F6F6B] hover:bg-[#0F6F6B]/10 hover:text-[#0F6F6B]"
                >
                  <Lightbulb className="h-4 w-4" />
                  <span>Tips</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4 text-xs text-[#334e68] shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#102a43]">
                    <Lightbulb className="h-4 w-4 text-[#0F6F6B]" />
                    <span>Patient Assessment for Adaptation</span>
                  </div>
                  <p>
                    Documenting baseline patient demographics, confirmed allergies, active medications,
                    and concurrent medical conditions ensures the adapted prescription avoids drug
                    interactions, aligns with patient organ function, and fits individual clinical needs.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {/* Accordion Toggle Chevron */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleCardOpen}
              className="h-8 w-8 text-[#52677a] hover:bg-slate-100"
              aria-label={cardOpen ? 'Collapse Patient Info' : 'Expand Patient Info'}
            >
              {cardOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Card Body */}
        {cardOpen && (
          <div className="space-y-5 px-5 py-5 sm:px-6 clinical-section-expand">
            {/* Session 1: Patient snapshot Accordion */}
            <div className="space-y-3">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => setSnapshotOpen((v) => !v)}
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#102a43]">Patient snapshot</h3>
                  <p className="text-xs text-[#627d98]">Basic patient details are required.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!snapshotOpen && (
                    <span className="rounded-full bg-[#f0f4f8] px-2.5 py-1 text-xs font-medium text-[#52677a]">
                      {snapshotSummaryText}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#0F6F6B] hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSnapshotOpen((v) => !v);
                    }}
                  >
                    {snapshotOpen ? 'Collapse' : 'Edit'}
                  </button>
                </div>
              </div>

              {snapshotOpen && (
                <div className="space-y-5 pt-0.5">
                  <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 lg:grid-cols-[minmax(220px,1.1fr)_minmax(140px,0.55fr)_minmax(280px,1.35fr)]">
                    {/* Date of birth */}
                    <div className="min-w-0">
                      <ClinicalFieldLabel required>Date of birth</ClinicalFieldLabel>
                      <ClinicalDobInput
                        id="adapt-date-of-birth"
                        value={dobUnavailable ? '' : (step2A.demographics.dateOfBirth ?? '')}
                        onChange={handleDobChange}
                        min={dobMin}
                        max={dobMax}
                        disabled={dobUnavailable}
                        aria-label="Date of birth"
                        aria-describedby="adapt-dob-unavailable"
                      />
                      <ClinicalCheckbox
                        id="adapt-dob-unavailable"
                        className="mt-3 py-1"
                        checked={dobUnavailable}
                        onChange={handleDobUnavailableChange}
                        label="Date of birth unavailable"
                      />
                    </div>

                    {/* Age */}
                    <div className="min-w-0">
                      <ClinicalFieldLabel required>Age</ClinicalFieldLabel>
                      <ClinicalUnitInput
                        id="adapt-age"
                        aria-label="Age in years"
                        value={
                          hasValidDob && !dobUnavailable
                            ? (step2A.demographics.age ?? '').replace(/[^\d.]/g, '')
                            : (step2A.demographics.age ?? '')
                        }
                        onChange={(v) => {
                          if (hasValidDob && !dobUnavailable) return;
                          const age = v.replace(/[^\d.]/g, '');
                          patchDemographics({
                            dateOfBirthUnavailable: true,
                            dateOfBirth: '',
                            age,
                            ageUnit: 'years',
                          });
                        }}
                        unit="Years"
                        inputMode="decimal"
                        readOnly={hasValidDob && !dobUnavailable}
                        className="w-full"
                      />
                    </div>

                    {/* Sex at birth — same ClinicalChoiceGroup as Prescribe */}
                    <ClinicalChoiceGroup
                      id="adapt-sex-at-birth"
                      label="Sex at birth"
                      required
                      value={step2A.demographics.sex ?? ''}
                      options={SEX_OPTIONS}
                      onChange={handleSexChange}
                    />
                  </div>

                  {/* Pregnancy & breastfeeding — auto-show for Female (Prescribe parity) */}
                  {showRepro ? (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <ClinicalChoiceGroup
                        label="Pregnancy"
                        value={normalizeTriState(step2A.demographics.pregnancyStatus ?? '')}
                        options={YES_NO_UNKNOWN}
                        onChange={(v) => patchDemographics({ pregnancyStatus: v })}
                      />
                      <ClinicalChoiceGroup
                        label="Breastfeeding"
                        value={normalizeTriState(step2A.demographics.breastfeedingStatus ?? '')}
                        options={YES_NO_UNKNOWN}
                        onChange={(v) => patchDemographics({ breastfeedingStatus: v })}
                      />
                    </div>
                  ) : isMaleSex(step2A.demographics.sex) ? null : (
                    <button
                      type="button"
                      onClick={() => setForceShowRepro(true)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Show pregnancy & breastfeeding (clinically necessary)
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-[#e2eaed]" />

            {/* Session 2: Patient background Accordion */}
            <div className="space-y-3">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                onClick={() => setBackgroundOpen((v) => !v)}
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#102a43]">Patient background</h3>
                  <p className="text-xs text-[#627d98]">Complete the following information.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!backgroundOpen && (
                    <span className="rounded-full bg-[#f0f4f8] px-2.5 py-1 text-xs font-medium text-[#52677a]">
                      {backgroundSummaryText}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#0F6F6B] hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBackgroundOpen((v) => !v);
                    }}
                  >
                    {backgroundOpen ? 'Collapse' : 'Edit'}
                  </button>
                </div>
              </div>

              {backgroundOpen && (
                <div className="-mx-5 border-y border-consult-divider sm:-mx-6">
                  {/* 1. Allergies — Prescribe ClinicalHistoryRow twin */}
                  <ClinicalHistoryRow
                    icon={Shield}
                    title={
                      <>
                        {PATIENT_INFO_COPY.allergies}{' '}
                        <span className="text-destructive">*</span>
                      </>
                    }
                    subtitle={PATIENT_INFO_COPY.allergiesHelper}
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                        onClick={() => {
                          if (step2A.background.allergiesNone) {
                            patchBackground({ allergiesNone: false });
                          }
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
                        id="adapt-no-allergies"
                        checked={step2A.background.allergiesNone}
                        onChange={handleAllergiesNoneToggle}
                        label={PATIENT_INFO_COPY.allergiesNone}
                        className="min-h-10 items-center whitespace-nowrap py-0 text-[14px]"
                      />
                    }
                  >
                    {!step2A.background.allergiesNone &&
                      step2A.background.allergyEntries.map((entry) => (
                        <ClinicalChip
                          key={entry.id}
                          className={cn(
                            'border-[#b7d9f0] bg-[#eef7fc] text-[#17324D] hover:bg-[#e4f2fa]',
                            editingAllergy?.id === entry.id && 'ring-2 ring-[#7EB8C4]/40',
                          )}
                          onClick={() => {
                            setAllergyPickerOpen(false);
                            setEditingAllergy(entry);
                            setAllergyEditOpen(true);
                          }}
                          onRemove={() => handleRemoveAllergy(entry.id)}
                        >
                          {allergyChipLabel({
                            id: entry.id,
                            drug: entry.drug,
                            reaction: entry.reaction ?? '',
                            severity: (entry.severity as AllergyDrugEntry['severity']) ?? '',
                          })}
                        </ClinicalChip>
                      ))}
                  </ClinicalHistoryRow>

                  {editingAllergy && !step2A.background.allergiesNone ? (
                    <div className="relative z-20 overflow-visible border-b border-consult-divider bg-muted/20 px-5 py-3 sm:px-[26px]">
                      <AllergyReactionDropdown
                        drugLabel={editingAllergy.drug || 'this allergy'}
                        open={allergyEditOpen}
                        selected={allergyTypeFromEntry({
                          reaction: editingAllergy.reaction ?? '',
                          severity:
                            (editingAllergy.severity as AllergyDrugEntry['severity']) ?? '',
                        })}
                        onOpenChange={setAllergyEditOpen}
                        onSelect={(typeId) => {
                          const updated = applyAllergyType(
                            {
                              id: editingAllergy.id,
                              drug: editingAllergy.drug,
                              reaction: editingAllergy.reaction ?? '',
                              severity:
                                (editingAllergy.severity as AllergyDrugEntry['severity']) ?? '',
                            },
                            typeId,
                          );
                          patchBackground({
                            allergyEntries: step2A.background.allergyEntries.map((e) =>
                              e.id === editingAllergy.id
                                ? {
                                    ...e,
                                    reaction: updated.reaction,
                                    severity: updated.severity,
                                    allergyType: allergyTypeFromEntry(updated) ?? undefined,
                                  }
                                : e,
                            ),
                          });
                          setEditingAllergy(null);
                          setAllergyEditOpen(false);
                        }}
                        onDismiss={() => {
                          setEditingAllergy(null);
                          setAllergyEditOpen(false);
                        }}
                      />
                    </div>
                  ) : allergyPickerOpen && !step2A.background.allergiesNone ? (
                    <div className="relative z-20 overflow-visible border-b border-consult-divider bg-muted/20 px-5 py-3 sm:px-[26px]">
                      <AllergySearchField
                        entries={allergyEntriesForSearch}
                        hideChips
                        onChange={handleAddAllergyEntries}
                        placeholder="Search drug or ingredient…"
                        autoFocus
                      />
                    </div>
                  ) : null}

                  {/* 2. Current medications */}
                  <ClinicalHistoryRow
                    icon={Pill}
                    title={
                      <>
                        {PATIENT_INFO_COPY.medications}{' '}
                        <span className="text-destructive">*</span>
                      </>
                    }
                    subtitle={PATIENT_INFO_COPY.medicationsHelper}
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                        onClick={() => {
                          if (step2A.background.medsNone) {
                            patchBackground({ medsNone: false });
                          }
                          setMedPickerOpen((v) => !v);
                        }}
                      >
                        <Plus className="h-4 w-4" /> {PATIENT_INFO_COPY.add}
                      </Button>
                    }
                    trailing={
                      <ClinicalCheckbox
                        id="adapt-no-meds"
                        checked={step2A.background.medsNone}
                        onChange={handleMedsNoneToggle}
                        label={PATIENT_INFO_COPY.medicationsNone}
                        className="min-h-10 items-center whitespace-nowrap py-0 text-[14px]"
                      />
                    }
                  >
                    {!step2A.background.medsNone &&
                      medEntriesForSearch.map((entry) => (
                        <ClinicalChip
                          key={entry.id}
                          onClick={() => setMedPickerOpen(true)}
                          onRemove={() => handleRemoveMedication(entry.id)}
                        >
                          {formatMedicationChipLabel(entry)}
                        </ClinicalChip>
                      ))}
                  </ClinicalHistoryRow>

                  {medPickerOpen && !step2A.background.medsNone ? (
                    <div className="border-b border-consult-divider bg-muted/20 px-5 py-3 sm:px-[26px]">
                      <MedicationSearchField
                        label="Current medications"
                        hideLabel
                        variant="chips"
                        entries={medEntriesForSearch}
                        onChange={(entries) => {
                          patchBackground({
                            medsNone: false,
                            medicationEntries: entries.map((e) => ({
                              id: e.id,
                              name: e.label || e.brandName || e.genericName || 'Medication',
                              label: e.label,
                              dose: e.strength,
                              brandName: e.brandName,
                              genericName: e.genericName,
                              strength: e.strength,
                              dosageForm: e.dosageForm,
                            })),
                          });
                        }}
                      />
                    </div>
                  ) : null}

                  {/* 3. Medical conditions */}
                  <ClinicalHistoryRow
                    icon={ClipboardList}
                    title={
                      <>
                        {PATIENT_INFO_COPY.conditions}{' '}
                        <span className="text-destructive">*</span>
                      </>
                    }
                    subtitle={PATIENT_INFO_COPY.conditionsHelper}
                    action={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 min-w-[88px] gap-1.5 border-[#c5d0d4] text-[14px] font-semibold text-[#0F6F6B] shadow-none hover:bg-muted/40"
                        onClick={() => {
                          if (step2A.background.conditionsNone) {
                            patchBackground({ conditionsNone: false });
                          }
                          setConditionPickerOpen((v) => !v);
                        }}
                      >
                        <Plus className="h-4 w-4" /> {PATIENT_INFO_COPY.add}
                      </Button>
                    }
                    trailing={
                      <ClinicalCheckbox
                        id="adapt-no-conditions"
                        checked={step2A.background.conditionsNone}
                        onChange={handleConditionsNoneToggle}
                        label={PATIENT_INFO_COPY.conditionsNone}
                        className="min-h-10 items-center whitespace-nowrap py-0 text-[14px]"
                      />
                    }
                  >
                    {!step2A.background.conditionsNone &&
                      step2A.background.conditions.map((c) => (
                        <ClinicalChip key={c} onRemove={() => handleRemoveCondition(c)}>
                          {c}
                        </ClinicalChip>
                      ))}
                  </ClinicalHistoryRow>

                  {conditionPickerOpen && !step2A.background.conditionsNone ? (
                    <div className="relative border-b border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
                      <Input
                        value={conditionQuery}
                        onChange={(e) => setConditionQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCondition(conditionQuery);
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
                              onClick={() => handleAddCondition(c)}
                            >
                              {c}
                            </button>
                          ))}
                          {conditionQuery.trim() &&
                            !conditionSuggestions.some(
                              (c) =>
                                c.toLowerCase() === conditionQuery.trim().toLowerCase(),
                            ) && (
                              <button
                                type="button"
                                className="w-full border-t border-border px-3.5 py-2.5 text-left text-sm font-medium text-primary hover:bg-muted/50"
                                onClick={() => handleAddCondition(conditionQuery)}
                              >
                                Add unlisted condition “{conditionQuery.trim()}”
                              </button>
                            )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* 4. Lifestyle */}
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
                        onClick={() => setLifestyleModalOpen(true)}
                      >
                        <Plus className="h-4 w-4" />{' '}
                        {step2A.background.lifestyle?.assessed
                          ? 'Edit lifestyle'
                          : PATIENT_INFO_COPY.addLifestyle}
                      </Button>
                    }
                    trailing={
                      <span className="inline-flex items-center rounded-full bg-[#eef3f5] px-2.5 py-1 text-[11px] font-semibold text-[#667085]">
                        {PATIENT_INFO_COPY.optional}
                      </span>
                    }
                  >
                    {step2A.background.lifestyle?.assessed ? (
                      <p className="text-[14px] text-[#24354B]">
                        {[
                          step2A.background.lifestyle.smokingStatus
                            ? `Smoking: ${step2A.background.lifestyle.smokingStatus}`
                            : null,
                          step2A.background.lifestyle.alcoholUse
                            ? `Alcohol: ${step2A.background.lifestyle.alcoholUse}`
                            : null,
                          step2A.background.lifestyle.drugUse
                            ? `Substance: ${step2A.background.lifestyle.drugUse}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </ClinicalHistoryRow>

                  {/* 5. Additional history */}
                  <ClinicalHistoryRow
                    icon={FolderOpen}
                    title="Additional history"
                    subtitle="Surgical and family history"
                    onClick={() => setHistoryModalOpen(true)}
                    action={
                      <span className="text-[#17324D]" aria-hidden>
                        ›
                      </span>
                    }
                    trailing={
                      <span className="inline-flex items-center rounded-full bg-[#eef3f5] px-2.5 py-1 text-[11px] font-semibold text-[#667085]">
                        {PATIENT_INFO_COPY.optional}
                      </span>
                    }
                  >
                    {step2A.background.additionalHistory ? (
                      <p className="line-clamp-2 text-[14px] text-[#24354B]">
                        {step2A.background.additionalHistory}
                      </p>
                    ) : null}
                  </ClinicalHistoryRow>
                </div>
              )}
            </div>

            {/* Session 3: Labs & Vitals (optional) — Prescribe parity, inside Patient info */}
            <div className="border-t border-[#e2eaed] pt-5">
              <AdaptLabsVitalsInline
                consultationId={consultationId}
                initialStep2C={step2C}
                onSaveStep2C={onSaveStep2C}
                onChange={(next) => {
                  setStep2C(next);
                  if (labsError) setLabsError(null);
                }}
              />
              {labsError ? (
                <p className="mt-2 text-xs font-medium text-destructive">{labsError}</p>
              ) : null}
            </div>
          </div>
        )}

        {/* Card Footer Navigation */}
        <div className="flex flex-col gap-3 border-t border-[#e2eaed] bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={onBackToPrescriptionAndReason}
            className="h-10 rounded-lg border-[#d9e4e8] px-4 text-sm font-semibold text-[#52677a] hover:bg-slate-50"
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            <span>Back to Prescription & Reason</span>
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!validation.valid}
            className={cn(
              'h-10 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-colors',
              validation.valid
                ? 'bg-[#0F6F6B] hover:bg-[#0c5956]'
                : 'cursor-not-allowed bg-[#0F6F6B]/40',
            )}
          >
            <span>Save &amp; continue</span>
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    )}

      {/* Confirmation modal for checking 'No known...' if items exist */}
      <ConfirmDialog
        open={noneConfirmType !== null}
        onOpenChange={(open) => {
          if (!open) setNoneConfirmType(null);
        }}
        title={`Confirm no known ${noneConfirmType ?? ''}`}
        description={`Checking this option will remove all documented ${
          noneConfirmType ?? 'entries'
        }. Are you sure you want to proceed?`}
        confirmLabel="Confirm and clear"
        cancelLabel="Keep entries"
        variant="destructive"
        onConfirm={() => {
          if (noneConfirmType === 'allergies') {
            patchBackground({ allergiesNone: true, allergyEntries: [] });
            setAllergyPickerOpen(false);
          } else if (noneConfirmType === 'medications') {
            patchBackground({ medsNone: true, medicationEntries: [] });
            setMedPickerOpen(false);
          } else if (noneConfirmType === 'conditions') {
            patchBackground({ conditionsNone: true, conditions: [] });
            setConditionPickerOpen(false);
          }
          setNoneConfirmType(null);
        }}
      />

      {/* Lifestyle Dialog */}
      <AdaptLifestyleDialog
        open={lifestyleModalOpen}
        initialLifestyle={step2A.background.lifestyle}
        onOpenChange={setLifestyleModalOpen}
        onSave={(lifestyle: AdaptLifestyle) => patchBackground({ lifestyle })}
      />

      {/* Additional History Dialog */}
      <AdaptAdditionalHistoryDialog
        open={historyModalOpen}
        initialHistory={step2A.background.additionalHistory}
        onOpenChange={setHistoryModalOpen}
        onSave={(additionalHistory: string) => patchBackground({ additionalHistory })}
      />
    </div>
  );
}
