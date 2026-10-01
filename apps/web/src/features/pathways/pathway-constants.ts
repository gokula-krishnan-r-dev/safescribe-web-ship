/**
 * Canonical Assessment module sections.
 * Pathways enable/disable sections via `assessmentSectionsEnabled`.
 * Diagnosis Confirmation + Treatment Eligibility are always on by default;
 * Optional Custom Assessment is admin-named and can use visibility rules.
 */

export const ASSESSMENT_SECTIONS = [
  {
    name: 'diagnosisConfirmation',
    displayName: 'Presentation Review',
    description: 'Questions that review whether the patient presentation is consistent with this pathway',
    required: true,
    order: 0,
  },
  {
    name: 'additionalAssessment',
    displayName: 'Custom Assessment',
    description: 'Optional admin-named section with conditional visibility (e.g. show if Male)',
    required: false,
    order: 1,
  },
  {
    name: 'treatmentEligibility',
    displayName: 'Treatment Eligibility',
    description: 'Questions that determine which treatments are appropriate',
    required: true,
    order: 2,
  },
] as const;

export type AssessmentSectionName = (typeof ASSESSMENT_SECTIONS)[number]['name'];

/** Map legacy AI section names → Assessment section names */
export const LEGACY_SECTION_MAP: Record<string, AssessmentSectionName> = {
  presentingConcern: 'diagnosisConfirmation',
  typicalFeatures: 'diagnosisConfirmation',
  patientHistory: 'additionalAssessment',
  safetyScreening: 'treatmentEligibility',
  redFlags: 'treatmentEligibility',
  treatmentEligibility: 'treatmentEligibility',
  counselling: 'additionalAssessment',
  documentation: 'additionalAssessment',
  followUp: 'additionalAssessment',
  diagnosisConfirmation: 'diagnosisConfirmation',
  additionalAssessment: 'additionalAssessment',
};

export const RED_FLAG_ACTIONS = [
  { value: 'IMMEDIATE_REFERRAL', label: 'Immediate referral' },
  { value: 'SAME_DAY_PHYSICIAN', label: 'Same-day physician' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'PATHWAY_EXCLUDED', label: 'Pathway excluded' },
  { value: 'PHARMACIST_DISCRETION', label: 'Pharmacist discretion' },
] as const;

export type RedFlagActionType = (typeof RED_FLAG_ACTIONS)[number]['value'];

export const TREATMENT_CATEGORIES = [
  {
    value: 'PRESCRIPTION',
    label: 'Prescription Medications',
    shortLabel: 'Prescription',
    description: 'Guideline-recommended prescription therapies',
    order: 0,
  },
  {
    value: 'OTC',
    label: 'Non-Prescription (OTC)',
    shortLabel: 'OTC',
    description: 'Evidence-supported over-the-counter products',
    order: 1,
  },
  {
    value: 'SUPPLEMENT',
    label: 'Supplements',
    shortLabel: 'Supplements',
    description: 'Nutritional or adjunctive therapies when guideline-supported',
    order: 2,
  },
  {
    value: 'NON_DRUG',
    label: 'Non-Pharmacological',
    shortLabel: 'Non-drug',
    description: 'Lifestyle, hygiene, observation, and behavioural care',
    order: 3,
  },
] as const;

/** Categories shown on Treatment Options after Patient Guidance migration. */
export const PHARMACOLOGICAL_TREATMENT_CATEGORIES = TREATMENT_CATEGORIES.filter(
  (c) => c.value !== 'NON_DRUG',
);

export const RECOMMENDATION_LEVELS = [
  { value: 'FIRST_LINE', label: 'First-line', highlight: true },
  { value: 'SECOND_LINE', label: 'Second-line', highlight: false },
  { value: 'ALTERNATIVE', label: 'Alternative', highlight: false },
  { value: 'ADJUNCTIVE', label: 'Adjunctive', highlight: false },
  { value: 'SUPPORTIVE_CARE', label: 'Supportive care', highlight: false },
  { value: 'SPECIALIST', label: 'Specialist recommendation', highlight: false },
] as const;

export const PRESCRIPTION_ROUTES = [
  { value: 'oral', label: 'Oral' },
  { value: 'topical', label: 'Topical' },
  { value: 'injection', label: 'Injection' },
  { value: 'inhaled', label: 'Inhaled' },
  { value: 'ophthalmic', label: 'Ophthalmic' },
  { value: 'otic', label: 'Otic' },
  { value: 'vaginal', label: 'Vaginal' },
  { value: 'rectal', label: 'Rectal' },
  { value: 'nasal', label: 'Nasal' },
] as const;

export const PATIENT_EDUCATION_CATEGORIES = [
  'Medication counselling',
  'Non-drug advice',
  'Prevention',
  'Follow-up',
  'When to seek urgent care',
  'Handouts',
] as const;

export const REQUIREMENT_LEVELS = [
  { value: 'NEVER', label: 'Never' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
] as const;

export const CANADIAN_PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
] as const;

export type RequirementLevel = 'NEVER' | 'OPTIONAL' | 'REQUIRED';
export type TreatmentCategory = 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT' | 'NON_DRUG';
export type RecommendationLevel =
  | 'FIRST_LINE'
  | 'SECOND_LINE'
  | 'ALTERNATIVE'
  | 'ADJUNCTIVE'
  | 'SUPPORTIVE_CARE'
  | 'SPECIALIST';

export interface AssessmentSectionsEnabled {
  diagnosisConfirmation: boolean;
  additionalAssessment: boolean;
  treatmentEligibility: boolean;
}

export const DEFAULT_ASSESSMENT_SECTIONS: AssessmentSectionsEnabled = {
  diagnosisConfirmation: true,
  additionalAssessment: false,
  treatmentEligibility: true,
};

/** Resolve which Assessment section a ClinicalSection belongs to */
export function resolveAssessmentSection(sectionName: string | null | undefined): AssessmentSectionName {
  if (!sectionName) return 'diagnosisConfirmation';
  return LEGACY_SECTION_MAP[sectionName] ?? 'diagnosisConfirmation';
}

/** Prefer DB displayName for Custom Assessment; fall back to constant defaults. */
export function resolveSectionDisplayName(
  sectionName: AssessmentSectionName,
  sections?: Array<{ name: string; displayName: string }> | null,
): string {
  const fromDb = sections?.find((s) => s.name === sectionName)?.displayName?.trim();
  if (fromDb) return fromDb;
  return ASSESSMENT_SECTIONS.find((s) => s.name === sectionName)?.displayName ?? sectionName;
}
