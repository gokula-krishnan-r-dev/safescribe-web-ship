/**
 * Project Adapt Steps 1–3 clinical state onto a Consultation shape that
 * Prescribe Step 6 (`Step9Documentation`) and its generators understand.
 */
import {
  buildAdaptMedicationDisplayName,
  parseAdaptPayload,
  type AdaptIndicationSelection,
  type AdaptPayload,
  type AdaptStepThreeOptionA,
  type ProposedPrescription,
} from '@safescript/shared';
import type { Consultation, TreatmentRecommendation } from '@/features/consultations/types';
import type { CounsellingPlan } from '@/features/consultations/counselling-panel-model';
import { toLegacyCounsellingNotes } from '@/features/consultations/counselling-panel-model';

function indicationLabel(selection?: AdaptIndicationSelection | null): string | null {
  if (!selection || selection.status === 'unknown') return null;
  const custom = selection.customIndicationText?.trim();
  if (custom) return custom;
  const display = selection.indicationDisplay?.trim();
  return display || null;
}

export function proposedPrescriptionToTreatment(
  proposed?: ProposedPrescription | null,
  rationale?: string,
): TreatmentRecommendation | null {
  const displayName = buildAdaptMedicationDisplayName(proposed);
  if (!proposed?.drugName?.trim() && displayName === 'Medication') return null;
  return {
    priority: 1,
    confidence: 1,
    medicationName: proposed?.drugName?.trim() || displayName,
    genericName: proposed?.genericName?.trim() || undefined,
    brandName: proposed?.brandName?.trim() || undefined,
    dose: proposed?.strength?.trim() || proposed?.dose?.trim() || undefined,
    route: proposed?.route?.trim() || undefined,
    frequency: proposed?.frequency?.trim() || undefined,
    quantity:
      proposed?.quantity != null && proposed.quantity !== ''
        ? String(proposed.quantity)
        : undefined,
    refills:
      proposed?.refills != null && proposed.refills !== ''
        ? Number(proposed.refills)
        : undefined,
    instructions: proposed?.sig?.trim() || undefined,
    patientDirections: proposed?.sig?.trim() || undefined,
    displayName,
    category: 'PRESCRIPTION',
    counsellingNotes: rationale?.trim() || undefined,
  };
}

/** Build a Prescribe-compatible treatmentPlan from the confirmed adapted Rx. */
export function buildAdaptTreatmentPlan(
  step3A?: AdaptStepThreeOptionA | null,
  clinicalRationale?: string | null,
): Consultation['treatmentPlan'] {
  const treatment = proposedPrescriptionToTreatment(
    step3A?.proposedPrescription,
    clinicalRationale || step3A?.rationaleDraft,
  );
  const selected = treatment ? [treatment] : [];
  return {
    recommendedTreatments: selected,
    selectedTreatments: selected,
    selectedItemsSnapshot: selected,
    selectedIndexes: selected.length ? [0] : [],
    selectedIndex: selected.length ? 0 : undefined,
    summary: step3A?.changeSummary?.trim() || 'Adapted prescription confirmed',
    confirmStatus: step3A?.confirmed || selected.length ? 'CONFIRMED' : undefined,
    counsellingPoints: step3A?.counsellingPreview?.length
      ? step3A.counsellingPreview
      : undefined,
  };
}

function demographicsFromAdapt(payload: AdaptPayload): Consultation['demographics'] {
  const demo = payload.step2A?.demographics;
  const bg = payload.step2A?.background;
  const labs = payload.step2C;
  if (!demo && !bg && !labs) return undefined;

  const allergyEntries =
    bg?.allergyEntries?.map((a, i) => ({
      id: a.id || `adapt-allergy-${i}`,
      drug: a.drug || '',
      reaction: a.reaction || '',
      severity: (a.severity || '') as '' | 'Mild' | 'Moderate' | 'Severe',
      genericName: a.genericName,
      brandName: a.brandName,
      drugClass: a.drugClass,
    })) ?? [];
  const medicationEntries =
    bg?.medicationEntries?.map((m, i) => ({
      id: m.id || `adapt-med-${i}`,
      label: m.name || m.label || '',
      brandName: m.brandName,
      genericName: m.genericName,
      strength: m.strength || m.dose,
      dosageForm: m.dosageForm,
      source: 'manual' as const,
    })) ?? [];

  return {
    age: demo?.age || undefined,
    ageUnit: demo?.ageUnit,
    dateOfBirth: demo?.dateOfBirth || undefined,
    dateOfBirthUnavailable: demo?.dateOfBirthUnavailable,
    sex: demo?.sex || undefined,
    pregnancyStatus: demo?.pregnancyStatus || undefined,
    breastfeedingStatus: demo?.breastfeedingStatus || undefined,
    weight: labs?.weight || undefined,
    height: labs?.height || undefined,
    bmi: labs?.bmi || undefined,
    pulse: labs?.pulse || undefined,
    bloodPressureSystolic: labs?.bloodPressureSystolic || undefined,
    bloodPressureDiastolic: labs?.bloodPressureDiastolic || undefined,
    measurementDate: labs?.measurementDate || undefined,
    labValues: labs?.labValues || undefined,
    allergies: bg?.allergiesNone
      ? 'NKDA'
      : allergyEntries.map((a) => a.drug).filter(Boolean).join(', ') || undefined,
    allergiesNone: Boolean(bg?.allergiesNone),
    allergyEntries: bg?.allergiesNone ? [] : allergyEntries,
    currentMedications: bg?.medsNone
      ? 'None'
      : medicationEntries.map((m) => m.label).filter(Boolean).join(', ') || undefined,
    medsNone: Boolean(bg?.medsNone),
    medicationEntries: bg?.medsNone ? [] : medicationEntries,
    medicalConditions: bg?.conditionsNone
      ? ''
      : (bg?.conditions ?? []).filter(Boolean).join(', ') || undefined,
    noKnownConditions: Boolean(bg?.conditionsNone),
    smokingStatus: bg?.lifestyle?.smokingStatus,
    alcoholUse: bg?.lifestyle?.alcoholUse,
    drugUse: bg?.lifestyle?.drugUse,
    lifestyleAssessed: bg?.lifestyle?.assessed,
    surgicalHistory: bg?.additionalHistory?.trim() || undefined,
  };
}

/**
 * Merge Adapt clinical payload into the live consultation for documentation.
 * Prefer already-persisted counsellingNotes / documentation from the API.
 */
export function projectAdaptConsultationForDocumentation(
  consultation: Consultation,
  opts?: {
    jurisdiction?: string;
    counsellingPlan?: CounsellingPlan | null;
    adaptPayload?: AdaptPayload | null;
  },
): Consultation {
  const payload =
    opts?.adaptPayload ??
    parseAdaptPayload(consultation.renewPayload, opts?.jurisdiction || 'AB');

  const indication =
    indicationLabel(payload.step1?.indication) ||
    payload.step1?.adaptationReason?.label ||
    undefined;

  const clinicalRationale =
    payload.step3B?.clinicalRationale?.trim() ||
    payload.step3A?.rationaleDraft?.trim() ||
    '';

  const treatmentPlan =
    consultation.treatmentPlan?.selectedTreatments?.length ||
    consultation.treatmentPlan?.selectedItemsSnapshot?.length
      ? consultation.treatmentPlan
      : buildAdaptTreatmentPlan(payload.step3A, clinicalRationale);

  const counsellingNotes =
    consultation.counsellingNotes?.plan ||
    (consultation.counsellingNotes as { counselling_status?: string } | undefined)
      ?.counselling_status
      ? consultation.counsellingNotes
      : opts?.counsellingPlan
        ? (toLegacyCounsellingNotes(opts.counsellingPlan) as Consultation['counsellingNotes'])
        : consultation.counsellingNotes;

  const adaptDemo = demographicsFromAdapt(payload);
  const demographics = {
    ...(consultation.demographics ?? {}),
    ...(adaptDemo ?? {}),
  };

  return {
    ...consultation,
    chiefComplaint: consultation.chiefComplaint?.trim() || indication || undefined,
    demographics,
    treatmentPlan,
    counsellingNotes,
    eligibility: consultation.eligibility ?? {
      eligible: true,
      confidence: 1,
      overallAssessment: 'yes',
      summary: indication
        ? `Pharmacist adaptation for ${indication}`
        : 'Pharmacist prescription adaptation',
      criteria: [],
    },
    clinicalJudgmentAssessment: consultation.clinicalJudgmentAssessment ?? {
      id: `adapt-cja-${consultation.id}`,
      consultationId: consultation.id,
      workingDiagnosisText: indication || 'Prescription adaptation',
      diagnosticCertainty: null,
      assessmentSummary: clinicalRationale || null,
      assessmentSufficient: true,
      unresolvedRedFlags: false,
    },
    treatmentRationale: consultation.treatmentRationale ?? {
      id: `adapt-tr-${consultation.id}`,
      consultationId: consultation.id,
      status: 'CONFIRMED',
      selectionRationale: clinicalRationale || null,
      reasonForPrescribing: clinicalRationale || null,
      reasonConfirmed: true,
      selectionConfirmed: true,
      alternatives: [],
    },
    pathway: consultation.pathway ?? {
      id: `adapt-pathway-${consultation.id}`,
      name: 'Prescription Adaptation',
      condition: indication || 'Prescription adaptation',
    },
  };
}

/** Persistable slices to hydrate the consultation row before Prescribe docs. */
export function adaptDocumentationHydrationPayload(
  consultation: Consultation,
  counsellingPlan: CounsellingPlan | null | undefined,
  jurisdiction = 'AB',
): {
  renewPayload: AdaptPayload;
  treatmentPlan: Consultation['treatmentPlan'];
  counsellingNotes?: Consultation['counsellingNotes'];
  demographics?: Consultation['demographics'];
  chiefComplaint?: string;
} {
  const payload = parseAdaptPayload(consultation.renewPayload, jurisdiction);
  const projected = projectAdaptConsultationForDocumentation(consultation, {
    jurisdiction,
    counsellingPlan,
    adaptPayload: payload,
  });
  return {
    renewPayload: payload,
    treatmentPlan: projected.treatmentPlan,
    counsellingNotes: projected.counsellingNotes,
    demographics: projected.demographics,
    chiefComplaint: projected.chiefComplaint,
  };
}
