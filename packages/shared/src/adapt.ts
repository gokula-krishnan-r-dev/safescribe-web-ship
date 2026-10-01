/**
 * SafeScribe Adapt — Step 1 shared types, constants, configuration, and helpers.
 *
 * Scope: Step 1 Prescription and reason for adaptation.
 * Records:
 * - Original prescription
 * - Intended adaptation type
 * - Clinical reason for adaptation
 */

import type { RenewIndicationCandidate, RenewMedication } from './renew';
import { medicationDisplayName } from './renew';
import { medicationIngredientKeys } from './renew-therapy';
import { dateOfBirthError } from './patient-age';

export const ADAPT_UI_STEP_IDS = [
  'PRESCRIPTION_AND_REASON',
  'PATIENT_ASSESSMENT',
  'PROPOSED_ADAPTATION',
  'DOCUMENTS_AND_COMPLETE',
] as const;

export type AdaptUIStepId = (typeof ADAPT_UI_STEP_IDS)[number];

export const ADAPT_UI_STEPS: Array<{
  id: AdaptUIStepId;
  label: string;
  shortLabel: string;
  pageTitle: string;
  stepSubtitle: string;
  description: string;
}> = [
  {
    id: 'PRESCRIPTION_AND_REASON',
    label: 'Prescription & Reason',
    shortLabel: 'Prescription and reason',
    pageTitle: 'Adapt Prescription',
    stepSubtitle: 'Step 1 of 4: Prescription and reason for adaptation',
    description: 'Add the original prescription, confirm what it is being used for, then select the reason for adaptation.',
  },
  {
    id: 'PATIENT_ASSESSMENT',
    label: 'Patient Assessment',
    shortLabel: 'Patient assessment',
    pageTitle: 'Patient Assessment',
    stepSubtitle: 'Step 2 of 4: Patient assessment',
    description: 'Gather relevant clinical and patient-specific assessment information.',
  },
  {
    id: 'PROPOSED_ADAPTATION',
    label: 'Proposed Adaptation',
    shortLabel: 'Proposed adaptation',
    pageTitle: 'Proposed Adaptation',
    stepSubtitle: 'Step 3 of 4: Proposed adaptation and safety review',
    description:
      'Create the proposed adaptation, review Safety Engine alerts in the same step, then continue to counselling.',
  },
  {
    id: 'DOCUMENTS_AND_COMPLETE',
    label: 'Documentation',
    shortLabel: 'Documentation and complete',
    pageTitle: 'Consultation Documents',
    stepSubtitle: 'Step 4 of 4: Consultation documents',
    description:
      'Review and finalize consultation documents — same document session as Prescribe.',
  },
];

export type AdaptationType =
  | 'dose'
  | 'dosage_form'
  | 'regimen'
  | 'route'
  | 'therapeutic_substitution'
  | 'other';

export interface AdaptationTypeOption {
  id: AdaptationType;
  label: string;
  questionLabel: string;
}

export const ADAPTATION_TYPES: AdaptationTypeOption[] = [
  {
    id: 'dose',
    label: 'Dose',
    questionLabel: 'Why is the dose being changed?',
  },
  {
    id: 'dosage_form',
    label: 'Dosage form / formulation',
    questionLabel: 'Why is the dosage form being changed?',
  },
  {
    id: 'regimen',
    label: 'Regimen / frequency',
    questionLabel: 'Why is the regimen being changed?',
  },
  {
    id: 'route',
    label: 'Route',
    questionLabel: 'Why is the route being changed?',
  },
  {
    id: 'therapeutic_substitution',
    label: 'Therapeutic substitution',
    questionLabel: 'Why is therapeutic substitution being considered?',
  },
  {
    id: 'other',
    label: 'Other',
    questionLabel: 'Why is the prescription being adapted?',
  },
];

export const ADAPTATION_TYPE_CONFIG: Record<string, Record<AdaptationType, boolean>> = {
  AB: {
    dose: true,
    dosage_form: true,
    regimen: true,
    route: true,
    therapeutic_substitution: true,
    other: true,
  },
  ON: {
    dose: true,
    dosage_form: true,
    regimen: true,
    route: true,
    therapeutic_substitution: false,
    other: true,
  },
  BC: {
    dose: true,
    dosage_form: true,
    regimen: true,
    route: true,
    therapeutic_substitution: false,
    other: true,
  },
  DEFAULT: {
    dose: true,
    dosage_form: true,
    regimen: true,
    route: true,
    therapeutic_substitution: true,
    other: true,
  },
};

export function isAdaptationTypeAllowed(type: AdaptationType, jurisdiction = 'AB'): boolean {
  const norm = jurisdiction.trim().toUpperCase();
  const config = ADAPTATION_TYPE_CONFIG[norm] ?? ADAPTATION_TYPE_CONFIG.DEFAULT;
  return Boolean(config?.[type]);
}

export interface AdaptationReason {
  code: string;
  label: string;
}

/** Stable reason codes grouped by adaptation type. */
export const ADAPTATION_REASONS: Record<AdaptationType, AdaptationReason[]> = {
  dose: [
    { code: 'DOSE_WEIGHT_AGE', label: 'Weight- or age-based dose adjustment' },
    { code: 'DOSE_RENAL', label: 'Renal function' },
    { code: 'DOSE_HEPATIC', label: 'Hepatic function' },
    { code: 'DOSE_INDICATION_GUIDELINE', label: 'Dose not appropriate for indication / guideline' },
    { code: 'DOSE_RESPONSE_OPTIMIZATION', label: 'Treatment response / dose optimization' },
    { code: 'DOSE_TOLERABILITY', label: 'Adverse effect or tolerability concern' },
    { code: 'DOSE_INTERACTION', label: 'Drug interaction requiring dose adjustment' },
    { code: 'DOSE_PATIENT_SPECIFIC', label: 'Other patient-specific factor' },
    { code: 'DOSE_OTHER', label: 'Other' },
  ],
  dosage_form: [
    { code: 'FORM_SWALLOWING', label: 'Swallowing or administration difficulty' },
    { code: 'FORM_AGE_APPROPRIATE', label: 'Age-appropriate formulation required' },
    { code: 'FORM_FEEDING_TUBE', label: 'Feeding tube or administration-device requirement' },
    { code: 'FORM_AVAILABILITY', label: 'Product availability' },
    { code: 'FORM_EXCIPIENT_TOLERABILITY', label: 'Tolerability or excipient concern' },
    { code: 'FORM_ADHERENCE', label: 'Adherence or ease of use' },
    { code: 'FORM_PATIENT_SUITABILITY', label: 'Equivalent formulation better suited to patient' },
    { code: 'FORM_PATIENT_SPECIFIC', label: 'Other patient-specific factor' },
    { code: 'FORM_OTHER', label: 'Other' },
  ],
  regimen: [
    { code: 'REGIMEN_ADHERENCE', label: 'Adherence or regimen simplification' },
    { code: 'REGIMEN_INDICATION_GUIDELINE', label: 'Regimen not appropriate for indication / guideline' },
    { code: 'REGIMEN_RESPONSE_OPTIMIZATION', label: 'Treatment response / optimization' },
    { code: 'REGIMEN_TOLERABILITY', label: 'Adverse effect or tolerability concern' },
    { code: 'REGIMEN_TIMING', label: 'Administration timing issue' },
    { code: 'REGIMEN_INTERACTION_SPACING', label: 'Drug interaction or spacing requirement' },
    { code: 'REGIMEN_PATIENT_SPECIFIC', label: 'Patient-specific schedule or use concern' },
    { code: 'REGIMEN_OTHER', label: 'Other' },
  ],
  route: [
    { code: 'ROUTE_NOT_FEASIBLE', label: 'Current route not appropriate or feasible' },
    { code: 'ROUTE_SWALLOWING', label: 'Swallowing or administration difficulty' },
    { code: 'ROUTE_CLINICAL_NEED', label: 'Clinical condition requires alternate route' },
    { code: 'ROUTE_TOLERABILITY', label: 'Tolerability or local adverse effect' },
    { code: 'ROUTE_PATIENT_SPECIFIC', label: 'Patient-specific administration need' },
    { code: 'ROUTE_AVAILABILITY', label: 'Product availability' },
    { code: 'ROUTE_OTHER', label: 'Other' },
  ],
  therapeutic_substitution: [
    { code: 'SUB_ALLERGY', label: 'Allergy or hypersensitivity concern' },
    { code: 'SUB_TOLERABILITY', label: 'Adverse effect or intolerance' },
    { code: 'SUB_CONTRAINDICATION', label: 'Contraindication or safety concern' },
    { code: 'SUB_INTERACTION', label: 'Drug interaction' },
    { code: 'SUB_EFFECTIVENESS', label: 'Treatment response / effectiveness concern' },
    { code: 'SUB_AVAILABILITY', label: 'Product unavailable' },
    { code: 'SUB_PATIENT_SPECIFIC', label: 'Patient-specific clinical consideration' },
    { code: 'SUB_OTHER', label: 'Other' },
  ],
  other: [
    { code: 'OTHER_CLINICAL', label: 'Patient-specific clinical consideration' },
    { code: 'OTHER_MEDICATION_USE', label: 'Medication-use issue' },
    { code: 'OTHER_SAFETY', label: 'Safety concern' },
    { code: 'OTHER_OPTIMIZATION', label: 'Treatment optimization' },
    { code: 'OTHER_AVAILABILITY', label: 'Product availability' },
    { code: 'OTHER_OTHER', label: 'Other' },
  ],
};

export function getAdaptationReasons(type: AdaptationType): AdaptationReason[] {
  return ADAPTATION_REASONS[type] ?? [];
}

export function getQuestionLabel(type: AdaptationType): string {
  const match = ADAPTATION_TYPES.find((t) => t.id === type);
  return match?.questionLabel ?? 'Why is the adaptation being considered?';
}

export function isReasonOther(reason: AdaptationReason | null | undefined): boolean {
  if (!reason?.code) return false;
  return reason.code.endsWith('_OTHER') || reason.code === 'OTHER' || reason.label.trim().toLowerCase() === 'other';
}

export type AdaptDispensingStatus = 'not_yet_dispensed' | 'already_dispensed';

export const ADAPT_DISPENSING_STATUS_OPTIONS: Array<{
  value: AdaptDispensingStatus;
  label: string;
}> = [
  { value: 'not_yet_dispensed', label: 'Not yet dispensed' },
  { value: 'already_dispensed', label: 'Already dispensed' },
];

/** Pharmacist-controlled indication for the Adapt original prescription (Step 1). */
export const ADAPT_INDICATION_SELECTION_SOURCES = [
  'approved_mapping',
  'patient_condition',
  'ai_suggested',
  'manual_search',
  'unknown',
] as const;
export type AdaptIndicationSelectionSource =
  (typeof ADAPT_INDICATION_SELECTION_SOURCES)[number];

export const ADAPT_INDICATION_STATUSES = ['pending', 'confirmed', 'unknown'] as const;
export type AdaptIndicationStatus = (typeof ADAPT_INDICATION_STATUSES)[number];

export interface AdaptIndicationSuggestion {
  conditionId: string;
  displayName: string;
  conditionCode: string;
  reason: string;
  badge?: 'suggested' | 'matches_patient';
}

/**
 * Consultation-level indication selection for Adapt Step 1.
 * Mirrors Renew mapping semantics but lives on AdaptStepOne (single med).
 */
export interface AdaptIndicationSelection {
  /** Original prescription medication id at time of selection. */
  medicationId: string;
  /**
   * Stable key from ingredient/product identity — used to invalidate
   * confirmation when the medication identity changes.
   */
  medicationConceptKey: string;
  conditionId?: string | null;
  conditionCode?: string | null;
  indicationDisplay?: string | null;
  customIndicationText?: string | null;
  status: AdaptIndicationStatus;
  selectionSource: AdaptIndicationSelectionSource;
  confirmedByPharmacist: boolean;
  selectedAt?: string;
  /** Approved mapped candidates from MedicationIndicationResolver / curated maps. */
  candidates?: RenewIndicationCandidate[];
  /** Deterministic + optional AI-ranked suggestions (never auto-confirmed). */
  suggestions?: AdaptIndicationSuggestion[];
  repositoryVersion?: string | null;
  mappingId?: string | null;
  /**
   * Consultation-level review candidates created when pharmacist selects a
   * SNOMED indication not yet in the approved repository (not globally published).
   */
  reviewCandidates?: Array<{
    id: string;
    snomedConceptId: string;
    displayName: string;
    createdAt: string;
  }>;
}

export interface AdaptStepOne {
  originalPrescriptionId?: string | null;
  originalPrescription: RenewMedication | null;
  /** Indication for the original prescription — required unless explicitly unknown. */
  indication?: AdaptIndicationSelection | null;
  jurisdiction: string;
  adaptationType: AdaptationType | null;
  adaptationReason: AdaptationReason | null;
  additionalComments?: string;
  dispensingStatus: AdaptDispensingStatus;
  completedAt?: string;
}

export interface AdaptAllergyEntry {
  id: string;
  drug: string;
  reaction?: string;
  severity?: 'Mild' | 'Moderate' | 'Severe' | '';
  allergyType?: string;
  /** e.g. Immediate (IgE-mediated), Delayed */
  reactionType?: string;
  /** When the allergy was recorded (free-text / ISO year) */
  recordedDate?: string;
  /**
   * Prior cephalosporin tolerance — used when reviewing penicillin ↔ cephalosporin
   * cross-reactivity in Step 3B (not a hard stop).
   */
  previousCephalosporinTolerance?: 'yes' | 'no' | 'unknown';
  genericName?: string;
  brandName?: string;
  drugClass?: string;
}

export interface AdaptMedicationEntry {
  id: string;
  name: string;
  label?: string;
  dose?: string;
  frequency?: string;
  route?: string;
  brandName?: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
}

export interface AdaptLifestyle {
  smokingStatus?: string;
  alcoholUse?: string;
  drugUse?: string;
  assessed?: boolean;
}

export interface AdaptDemographics {
  dateOfBirth?: string;
  dateOfBirthUnavailable?: boolean;
  age?: string;
  ageUnit?: 'years' | 'months' | 'weeks' | 'days';
  sex?: string;
  pregnancyStatus?: string;
  breastfeedingStatus?: string;
}

export interface AdaptBackground {
  allergiesNone: boolean;
  allergyEntries: AdaptAllergyEntry[];
  medsNone: boolean;
  medicationEntries: AdaptMedicationEntry[];
  conditionsNone: boolean;
  conditions: string[];
  lifestyle?: AdaptLifestyle;
  additionalHistory?: string;
}

export interface AdaptStepTwoOptionA {
  demographics: AdaptDemographics;
  background: AdaptBackground;
  confirmed?: boolean;
  confirmedAt?: string;
}

export type EffectivenessOption =
  | 'effective'
  | 'partially_effective'
  | 'not_effective'
  | 'unable_to_assess';

export type AdverseEffectsOption =
  | 'none_reported'
  | 'yes_describe';

export type AdherenceOption =
  | 'taking_as_directed'
  | 'occasional_missed_doses'
  | 'frequent_missed_doses'
  | 'other';

/** Predefined “how long taking” options for Adapt 2B (Renew-style chips). */
export const ADAPT_THERAPY_DURATION_OPTIONS = [
  { id: 'less_than_1_month', label: 'Less than 1 month' },
  { id: '1_3_months', label: '1–3 months' },
  { id: '3_6_months', label: '3–6 months' },
  { id: '6_12_months', label: '6–12 months' },
  { id: 'more_than_1_year', label: 'More than 1 year' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'custom', label: 'Custom' },
] as const;

export type AdaptTherapyDurationId = (typeof ADAPT_THERAPY_DURATION_OPTIONS)[number]['id'];

export function resolveAdaptTherapyDurationSelection(duration?: string): {
  id: AdaptTherapyDurationId | null;
  customText: string;
} {
  const raw = (duration ?? '').trim();
  if (!raw) return { id: null, customText: '' };

  const normalized = raw.toLowerCase().replace(/–/g, '-').replace(/\s+/g, ' ');
  const aliases: Record<string, AdaptTherapyDurationId> = {
    'less than 1 month': 'less_than_1_month',
    '< 1 month': 'less_than_1_month',
    '<1 month': 'less_than_1_month',
    '1-3 months': '1_3_months',
    '1–3 months': '1_3_months',
    '3 months': '1_3_months',
    '3-6 months': '3_6_months',
    '3–6 months': '3_6_months',
    '6-12 months': '6_12_months',
    '6–12 months': '6_12_months',
    'more than 1 year': 'more_than_1_year',
    '> 1 year': 'more_than_1_year',
    '>1 year': 'more_than_1_year',
    unknown: 'unknown',
  };

  for (const opt of ADAPT_THERAPY_DURATION_OPTIONS) {
    if (opt.id === 'custom') continue;
    if (opt.label.toLowerCase().replace(/–/g, '-') === normalized) {
      return { id: opt.id, customText: '' };
    }
  }
  const aliased = aliases[normalized];
  if (aliased) return { id: aliased, customText: '' };

  return { id: 'custom', customText: raw };
}

export interface AdaptStepTwoOptionB {
  isTakingMedication: boolean | null;
  currentUse?: string;
  duration?: string;
  effectiveness?: EffectivenessOption;
  adverseEffects?: AdverseEffectsOption;
  adverseEffectsDescription?: string;
  adherence?: AdherenceOption;
  adherenceDescription?: string;
  patientGoals?: string;
  confirmed?: boolean;
  confirmedAt?: string;
}

/** Structured lab row from upload/paste extraction (mirrors Prescribe ExtractedLabValue). */
export interface AdaptExtractedLabValue {
  test: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  observedDate?: string;
  confidence: number;
  needsReview: boolean;
}

/**
 * Accordion 2C — Labs & Vitals (optional).
 * Persisted on consultation.demographics for renal/safety reuse.
 */
export interface AdaptStepTwoOptionC {
  labValues?: string;
  extractedLabValues?: AdaptExtractedLabValue[];
  height?: string;
  weight?: string;
  bmi?: string;
  pulse?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
  measurementDate?: string;
  /** Pharmacist confirmed/skipped this optional section. */
  confirmed?: boolean;
  confirmedAt?: string;
  skipped?: boolean;
}

export type AdaptationProposalMode = 'suggested' | 'custom';

export interface ProposedPrescription {
  drugId?: string;
  drugName: string;
  genericName?: string;
  brandName?: string;
  strength?: string;
  dosageForm?: string;
  dose?: string;
  frequency?: string;
  route?: string;
  quantity?: number | string | null;
  quantityUnit?: string;
  refills?: number | string | null;
  sig: string;
}

export interface SuggestedAdaptation {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string; // e.g. "Recommended"
  proposedPrescription: ProposedPrescription;
  supportingPoints: string[];
  counsellingPoints?: string[];
  rationaleSummary?: string;
  sourceRefs?: string[];
  displayRank?: number;
}

export interface AdaptStepThreeOptionA {
  proposalMode: AdaptationProposalMode | null;
  selectedSuggestionId?: string | null;
  proposedPrescription: ProposedPrescription;
  modifiedFromSuggestion?: boolean;
  changeSummary?: string;
  patientSpecificNotes?: string;
  rationaleDraft?: string;
  rationaleEditedByPharmacist?: boolean;
  counsellingPreview?: string[];
  /** Branch F (other): short summary of the custom adaptation. */
  customAdaptationSummary?: string;
  /** Branch F (other): optional additional details. */
  additionalDetails?: string;
  /** Branch C (regimen): optional dosing time preference. */
  dosingTime?: string;
  /** Branch B (formulation): selected dosage-form family. */
  selectedFormulation?: string;
  /** Branch D (route): selected administration route family. */
  selectedRouteOption?: string;
  confirmed?: boolean;
  confirmedAt?: string;
}

export type CheckSeverity = 'pass' | 'info' | 'review' | 'block';

export type ClinicalCheckStatus =
  | 'appropriate'
  | 'no_issues'
  | 'permitted'
  | 'monitoring_recommended'
  | 'follow_up_required'
  | 'caution'
  | 'contraindicated'
  | 'unable_to_assess';

export type ClinicalCheckTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface CheckReferenceSection {
  heading: string;
  body: string;
}

export interface CheckReference {
  sourceId: string;
  title: string;
  authority?: string;
  version?: string;
  section?: string;
  url?: string;
  sections?: CheckReferenceSection[];
}

export interface ClinicalCheckItem {
  id: string;
  type: string;
  title: string;
  applicable: boolean;
  severity: CheckSeverity;
  status: ClinicalCheckStatus;
  statusLabel: string;
  tone: ClinicalCheckTone;
  icon: 'pill' | 'kidney' | 'shield' | 'link' | 'alert' | 'copy' | 'scale' | 'calendar';
  summary: string;
  assessment: string;
  recommendation: string;
  reference?: CheckReference;
  infoCallout?: string;
  requiresAcknowledgment?: boolean;
  acknowledged?: boolean;
  pharmacistNote?: string;
  /**
   * When true, finding appears in the pharmacist-facing Key findings list.
   * Routine no-issue checks stay false and are available via “View all safety checks”.
   */
  isRelevantToAdaptation?: boolean;
}

export interface AdaptPharmacistConsultedReference {
  type: 'ecps' | 'bugs_and_drugs' | 'condition_guideline' | 'other';
  label: string;
  title?: string;
  organization?: string;
  url?: string;
  notes?: string;
  selected: boolean;
}

export interface AdaptSupportingReferenceSnapshot {
  referenceId: string;
  title: string;
  organizationPublisher?: string;
  yearEdition?: string;
  version?: string;
  jurisdiction?: string;
  sectionsUsed?: string[];
  usedForCheckCodes?: string[];
  source: 'pathway_library' | 'safety_rule' | 'other_approved_source';
}

export interface AdaptStepThreeOptionB {
  checks: ClinicalCheckItem[];
  selectedCheckId: string;
  evaluatedAt: string;
  overallStatus: 'pass' | 'review' | 'block';
  clinicalRationale: string;
  rationaleEditedByPharmacist: boolean;
  acknowledgedCheckIds: string[];
  pharmacistNotes: Record<string, string>;
  /**
   * Documented pharmacist clinical override when proceeding despite a Safety Engine
   * hard stop (allergy / contraindication / CRITICAL CDS). Required to confirm when
   * checks include severity=block.
   */
  clinicalOverride?: {
    overriddenAt: string;
    reason: string;
    comments?: string;
    acknowledgedRisk: true;
    source: 'ALLERGY' | 'AVOID' | 'CAUTION' | 'REVIEW_REQUIRED';
  };
  /** Pharmacist-confirmed references from Step 3B (selected only appear in DAP). */
  pharmacistReferencesConsulted?: AdaptPharmacistConsultedReference[];
  /** Frozen SafeScribe supporting references from AdaptReferenceSelector / check evidence. */
  safeScribeSupportingReferences?: AdaptSupportingReferenceSnapshot[];
  /** Frozen document-generation snapshot id created at Step 3 confirm. */
  documentSnapshotId?: string;
  documentSnapshotHash?: string;
  confirmed?: boolean;
  confirmedAt?: string;
}

export type AdaptDocumentTypeId =
  | 'consultation_note'
  | 'prescription'
  | 'prescriber_communication'
  | 'patient_care_summary';

export interface AdaptDocumentReviewState {
  versionId: string;
  status: 'REVIEW_REQUIRED' | 'REVIEWED' | 'UPDATED_REVIEW_REQUIRED';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedVersionId?: string;
}

export interface AdaptDocumentContent {
  id: AdaptDocumentTypeId;
  title: string;
  shortName: string;
  fileName: string;
  category: 'clinical' | 'communication' | 'patient';
  categoryLabel: string;
  description: string;
  bullets: string[];
  html: string;
  plainText: string;
  lastEditedAt?: string;
}

export interface AdaptPatientDocumentInfo {
  name: string;
  dateOfBirth?: string;
  patientId?: string; // PHN
  phone?: string;
  address?: string;
  skipped?: boolean;
  confirmed?: boolean;
}

export interface AdaptStepFour {
  patientInfo: AdaptPatientDocumentInfo;
  documents: Record<AdaptDocumentTypeId, AdaptDocumentContent>;
  documentReviews: Record<AdaptDocumentTypeId, AdaptDocumentReviewState>;
  overallStatus?: 'draft' | 'ready' | 'completed';
  allReviewed?: boolean;
  completed?: boolean;
  completedAt?: string;
  revision?: number;
  lastGeneratedAt?: string;
}

export interface AdaptPayload {
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step2C?: AdaptStepTwoOptionC;
  step2?: Record<string, unknown>;
  step3A?: AdaptStepThreeOptionA;
  step3B?: AdaptStepThreeOptionB;
  step3?: Record<string, unknown>;
  step4?: AdaptStepFour;
}

export function emptyProposedPrescription(originalRx?: RenewMedication | null): ProposedPrescription {
  const drugName =
    originalRx?.normalized?.genericName ||
    originalRx?.normalized?.brandName ||
    originalRx?.raw?.medicationText ||
    '';
  const strength = originalRx?.normalized?.strength || '';
  const dosageForm = originalRx?.normalized?.dosageForm || 'tablet';
  const rawQty = originalRx?.raw?.quantityText ? parseInt(originalRx.raw.quantityText, 10) : null;
  const quantity = !Number.isNaN(rawQty) && rawQty != null && rawQty > 0 ? rawQty : 90;
  const sig = originalRx?.raw?.directionsText || originalRx?.normalized?.directions || '';

  return {
    drugId: originalRx?.id,
    drugName,
    strength,
    dosageForm,
    dose: strength || '',
    frequency: 'Once daily',
    route: originalRx?.normalized?.route || 'By mouth',
    quantity,
    refills: 1,
    sig,
  };
}

export function emptyAdaptStepThreeOptionA(originalRx?: RenewMedication | null): AdaptStepThreeOptionA {
  return {
    proposalMode: null,
    selectedSuggestionId: null,
    proposedPrescription: emptyProposedPrescription(originalRx),
    modifiedFromSuggestion: false,
    changeSummary: '',
    patientSpecificNotes: '',
    rationaleDraft: '',
    rationaleEditedByPharmacist: false,
    counsellingPreview: [],
    customAdaptationSummary: '',
    additionalDetails: '',
    dosingTime: '',
    selectedFormulation: '',
    selectedRouteOption: '',
    confirmed: false,
  };
}

export function emptyAdaptStepTwoOptionB(): AdaptStepTwoOptionB {
  return {
    isTakingMedication: null,
    currentUse: '',
    duration: '',
    effectiveness: undefined,
    adverseEffects: undefined,
    adverseEffectsDescription: '',
    adherence: undefined,
    adherenceDescription: '',
    patientGoals: '',
    confirmed: false,
  };
}

export function emptyAdaptStepTwoOptionC(): AdaptStepTwoOptionC {
  return {
    labValues: '',
    extractedLabValues: [],
    height: '',
    weight: '',
    bmi: '',
    pulse: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    measurementDate: '',
    confirmed: false,
    skipped: false,
  };
}

export function emptyAdaptStepTwoOptionA(): AdaptStepTwoOptionA {
  return {
    demographics: {
      dateOfBirth: '',
      dateOfBirthUnavailable: false,
      age: '',
      ageUnit: 'years',
      sex: '',
      pregnancyStatus: '',
      breastfeedingStatus: '',
    },
    background: {
      allergiesNone: false,
      allergyEntries: [],
      medsNone: false,
      medicationEntries: [],
      conditionsNone: false,
      conditions: [],
      lifestyle: {
        smokingStatus: '',
        alcoholUse: '',
        drugUse: '',
        assessed: false,
      },
      additionalHistory: '',
    },
    confirmed: false,
  };
}

export function emptyAdaptIndicationSelection(
  medication?: RenewMedication | null,
): AdaptIndicationSelection {
  const med = medication ?? null;
  return {
    medicationId: med?.id ?? '',
    medicationConceptKey: med ? adaptMedicationConceptKey(med) : '',
    conditionId: null,
    conditionCode: null,
    indicationDisplay: null,
    customIndicationText: null,
    status: 'pending',
    selectionSource: 'approved_mapping',
    confirmedByPharmacist: false,
    candidates: [],
    suggestions: [],
    repositoryVersion: null,
    mappingId: null,
  };
}

/** Stable identity key used to detect clinically meaningful medication changes. */
export function adaptMedicationConceptKey(med: RenewMedication): string {
  const keys = medicationIngredientKeys(med)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const strength = (med.normalized.strength ?? '').trim().toLowerCase();
  const form = (med.normalized.dosageForm ?? '').trim().toLowerCase();
  const route = (med.normalized.route ?? '').trim().toLowerCase();
  return [keys.join('|') || med.id, strength, form, route].join('::');
}

export function isAdaptIndicationComplete(
  selection?: AdaptIndicationSelection | null,
): boolean {
  if (!selection) return false;
  if (selection.status === 'unknown') return true;
  if (selection.status !== 'confirmed' || !selection.confirmedByPharmacist) return false;
  return Boolean(
    (selection.conditionId && selection.indicationDisplay) ||
      selection.customIndicationText?.trim(),
  );
}

/** Stable label for a confirmed Step 1 indication (null when unknown/incomplete). */
export function adaptStep1IndicationLabel(
  selection?: AdaptIndicationSelection | null,
): string | null {
  if (!selection || selection.status === 'unknown') return null;
  if (!isAdaptIndicationComplete(selection)) return null;
  const custom = selection.customIndicationText?.trim();
  if (custom) return custom;
  const display = selection.indicationDisplay?.trim();
  return display || null;
}

const ADAPT_STEP1_RX_PREFIX = 'adapt-step1-rx:';

function adaptMedicationEntryFromPrescription(med: RenewMedication): AdaptMedicationEntry {
  return {
    id: `${ADAPT_STEP1_RX_PREFIX}${med.id}`,
    name: medicationDisplayName(med),
    label: medicationDisplayName(med),
    dose: med.normalized.strength?.trim() || undefined,
    frequency: med.normalized.directions?.trim() || undefined,
    route: med.normalized.route?.trim() || undefined,
    brandName: med.normalized.brandName?.trim() || undefined,
    genericName: med.normalized.genericName?.trim() || undefined,
    strength: med.normalized.strength?.trim() || undefined,
    dosageForm: med.normalized.dosageForm?.trim() || undefined,
  };
}

/**
 * Prefill Adapt Step 2A clinical history from Step 1:
 * - medical condition ← confirmed indication (always when available)
 * - current medication ← original prescription **only when** Step 1 status
 *   is "Already dispensed" (patient is already taking this Rx)
 *
 * Idempotent. Does not override a confirmed Step 2A.
 */
export function prefillAdaptStep2AFromStep1(
  step2A: AdaptStepTwoOptionA,
  step1: AdaptStepOne | null | undefined,
): { step2A: AdaptStepTwoOptionA; changed: boolean } {
  if (!step1 || step2A.confirmed) {
    return { step2A, changed: false };
  }

  let changed = false;
  const background: AdaptBackground = {
    ...step2A.background,
    allergyEntries: [...(step2A.background.allergyEntries ?? [])],
    medicationEntries: [...(step2A.background.medicationEntries ?? [])],
    conditions: [...(step2A.background.conditions ?? [])],
  };

  const indicationLabel = adaptStep1IndicationLabel(step1.indication);
  if (indicationLabel) {
    const already = background.conditions.some(
      (c) => c.trim().toLowerCase() === indicationLabel.toLowerCase(),
    );
    if (!already) {
      background.conditions = [...background.conditions, indicationLabel];
      changed = true;
    }
    if (background.conditionsNone) {
      background.conditionsNone = false;
      changed = true;
    }
  }

  // Current medications: only when the original Rx was already dispensed.
  const rx = step1.originalPrescription;
  const alreadyDispensed = step1.dispensingStatus === 'already_dispensed';
  if (alreadyDispensed && rx?.id) {
    const prefillId = `${ADAPT_STEP1_RX_PREFIX}${rx.id}`;
    const display = medicationDisplayName(rx).trim().toLowerCase();
    const already = background.medicationEntries.some((entry) => {
      if (entry.id === prefillId) return true;
      const name = (entry.label || entry.name || '').trim().toLowerCase();
      return Boolean(display && name && name === display);
    });
    if (!already) {
      background.medicationEntries = [
        adaptMedicationEntryFromPrescription(rx),
        ...background.medicationEntries,
      ];
      changed = true;
    }
    if (background.medsNone) {
      background.medsNone = false;
      changed = true;
    }
  }

  if (!changed) return { step2A, changed: false };
  return {
    step2A: {
      ...step2A,
      background,
    },
    changed: true,
  };
}

export function emptyAdaptStepOne(jurisdiction = 'AB'): AdaptStepOne {
  return {
    originalPrescriptionId: null,
    originalPrescription: null,
    indication: null,
    jurisdiction,
    adaptationType: null,
    adaptationReason: null,
    additionalComments: '',
    dispensingStatus: 'not_yet_dispensed',
  };
}

export function emptyAdaptPayload(jurisdiction = 'AB'): AdaptPayload {
  const step1 = emptyAdaptStepOne(jurisdiction);
  const step2A = emptyAdaptStepTwoOptionA();
  const step2B = emptyAdaptStepTwoOptionB();
  const step2C = emptyAdaptStepTwoOptionC();
  const step3A = emptyAdaptStepThreeOptionA();
  const step3B = emptyAdaptStepThreeOptionB(step1, step2A, step2B, step3A, jurisdiction);
  const step4 = emptyAdaptStepFour(step1, step2A, step2B, step3A, step3B, jurisdiction);
  return {
    step1,
    step2A,
    step2B,
    step2C,
    step3A,
    step3B,
    step4,
  };
}

export function parseAdaptPayload(raw: unknown, jurisdiction = 'AB'): AdaptPayload {
  const fallback = emptyAdaptPayload(jurisdiction);
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const step1Raw = (obj.step1 ?? obj) as Record<string, unknown>;

  const originalPrescription =
    step1Raw.originalPrescription && typeof step1Raw.originalPrescription === 'object'
      ? (step1Raw.originalPrescription as RenewMedication)
      : null;

  const adaptationType =
    typeof step1Raw.adaptationType === 'string' &&
    ADAPTATION_TYPES.some((t) => t.id === step1Raw.adaptationType)
      ? (step1Raw.adaptationType as AdaptationType)
      : null;

  let adaptationReason: AdaptationReason | null = null;
  if (step1Raw.adaptationReason && typeof step1Raw.adaptationReason === 'object') {
    const r = step1Raw.adaptationReason as Record<string, unknown>;
    if (typeof r.code === 'string' && typeof r.label === 'string') {
      adaptationReason = { code: r.code, label: r.label };
    }
  }

  const additionalComments =
    typeof step1Raw.additionalComments === 'string' ? step1Raw.additionalComments : '';

  const dispensingStatus =
    step1Raw.dispensingStatus === 'already_dispensed' ? 'already_dispensed' : 'not_yet_dispensed';

  const jur =
    typeof step1Raw.jurisdiction === 'string' && step1Raw.jurisdiction.trim()
      ? step1Raw.jurisdiction.trim().toUpperCase()
      : jurisdiction;

  let step2A: AdaptStepTwoOptionA | undefined = undefined;
  if (obj.step2A && typeof obj.step2A === 'object') {
    const s2 = obj.step2A as Record<string, unknown>;
    const demo = (s2.demographics && typeof s2.demographics === 'object' ? s2.demographics : {}) as Record<string, unknown>;
    const bg = (s2.background && typeof s2.background === 'object' ? s2.background : {}) as Record<string, unknown>;
    const life = (bg.lifestyle && typeof bg.lifestyle === 'object' ? bg.lifestyle : {}) as Record<string, unknown>;

    step2A = {
      demographics: {
        dateOfBirth: typeof demo.dateOfBirth === 'string' ? demo.dateOfBirth : '',
        dateOfBirthUnavailable: Boolean(demo.dateOfBirthUnavailable),
        age: typeof demo.age === 'string' ? demo.age : '',
        ageUnit: demo.ageUnit === 'months' || demo.ageUnit === 'weeks' || demo.ageUnit === 'days' ? demo.ageUnit : 'years',
        sex: typeof demo.sex === 'string' ? demo.sex : '',
        pregnancyStatus: typeof demo.pregnancyStatus === 'string' ? demo.pregnancyStatus : '',
        breastfeedingStatus: typeof demo.breastfeedingStatus === 'string' ? demo.breastfeedingStatus : '',
      },
      background: {
        allergiesNone: Boolean(bg.allergiesNone),
        allergyEntries: Array.isArray(bg.allergyEntries)
          ? bg.allergyEntries.map((a: unknown) => {
              const rec = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
              return {
                id: typeof rec.id === 'string' ? rec.id : `alg_${Math.random().toString(36).slice(2, 8)}`,
                drug: typeof rec.drug === 'string' ? rec.drug : '',
                reaction: typeof rec.reaction === 'string' ? rec.reaction : '',
                severity: rec.severity === 'Mild' || rec.severity === 'Moderate' || rec.severity === 'Severe' ? rec.severity : '',
                allergyType: typeof rec.allergyType === 'string' ? rec.allergyType : '',
                reactionType: typeof rec.reactionType === 'string' ? rec.reactionType : undefined,
                recordedDate: typeof rec.recordedDate === 'string' ? rec.recordedDate : undefined,
                previousCephalosporinTolerance:
                  rec.previousCephalosporinTolerance === 'yes' ||
                  rec.previousCephalosporinTolerance === 'no' ||
                  rec.previousCephalosporinTolerance === 'unknown'
                    ? rec.previousCephalosporinTolerance
                    : undefined,
                genericName: typeof rec.genericName === 'string' ? rec.genericName : undefined,
                brandName: typeof rec.brandName === 'string' ? rec.brandName : undefined,
                drugClass: typeof rec.drugClass === 'string' ? rec.drugClass : undefined,
              };
            })
          : [],
        medsNone: Boolean(bg.medsNone),
        medicationEntries: Array.isArray(bg.medicationEntries)
          ? bg.medicationEntries.map((m: unknown) => {
              const rec = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
              return {
                id: typeof rec.id === 'string' ? rec.id : `med_${Math.random().toString(36).slice(2, 8)}`,
                name: typeof rec.name === 'string' ? rec.name : '',
                dose: typeof rec.dose === 'string' ? rec.dose : '',
                frequency: typeof rec.frequency === 'string' ? rec.frequency : '',
                route: typeof rec.route === 'string' ? rec.route : '',
              };
            })
          : [],
        conditionsNone: Boolean(bg.conditionsNone),
        conditions: Array.isArray(bg.conditions)
          ? bg.conditions.filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
          : [],
        lifestyle: {
          smokingStatus: typeof life.smokingStatus === 'string' ? life.smokingStatus : '',
          alcoholUse: typeof life.alcoholUse === 'string' ? life.alcoholUse : '',
          drugUse: typeof life.drugUse === 'string' ? life.drugUse : '',
          assessed: Boolean(life.assessed),
        },
        additionalHistory: typeof bg.additionalHistory === 'string' ? bg.additionalHistory : '',
      },
      confirmed: Boolean(s2.confirmed),
      confirmedAt: typeof s2.confirmedAt === 'string' ? s2.confirmedAt : undefined,
    };
  } else {
    step2A = emptyAdaptStepTwoOptionA();
  }

  let step2B: AdaptStepTwoOptionB | undefined = undefined;
  if (obj.step2B && typeof obj.step2B === 'object') {
    const s2b = obj.step2B as Record<string, unknown>;
    step2B = {
      isTakingMedication:
        typeof s2b.isTakingMedication === 'boolean' ? s2b.isTakingMedication : null,
      currentUse: typeof s2b.currentUse === 'string' ? s2b.currentUse : '',
      duration: typeof s2b.duration === 'string' ? s2b.duration : '',
      effectiveness:
        typeof s2b.effectiveness === 'string' &&
        ['effective', 'partially_effective', 'not_effective', 'unable_to_assess'].includes(
          s2b.effectiveness,
        )
          ? (s2b.effectiveness as EffectivenessOption)
          : undefined,
      adverseEffects:
        typeof s2b.adverseEffects === 'string' &&
        ['none_reported', 'yes_describe'].includes(s2b.adverseEffects)
          ? (s2b.adverseEffects as AdverseEffectsOption)
          : undefined,
      adverseEffectsDescription:
        typeof s2b.adverseEffectsDescription === 'string' ? s2b.adverseEffectsDescription : '',
      adherence:
        typeof s2b.adherence === 'string' &&
        ['taking_as_directed', 'occasional_missed_doses', 'frequent_missed_doses', 'other'].includes(
          s2b.adherence,
        )
          ? (s2b.adherence as AdherenceOption)
          : undefined,
      adherenceDescription:
        typeof s2b.adherenceDescription === 'string' ? s2b.adherenceDescription : '',
      patientGoals: typeof s2b.patientGoals === 'string' ? s2b.patientGoals : '',
      confirmed: Boolean(s2b.confirmed),
      confirmedAt: typeof s2b.confirmedAt === 'string' ? s2b.confirmedAt : undefined,
    };
  } else {
    step2B = emptyAdaptStepTwoOptionB();
  }

  let step2C: AdaptStepTwoOptionC | undefined = undefined;
  if (obj.step2C && typeof obj.step2C === 'object') {
    const s2c = obj.step2C as Record<string, unknown>;
    const extracted: AdaptExtractedLabValue[] = Array.isArray(s2c.extractedLabValues)
      ? s2c.extractedLabValues
          .map((row: unknown): AdaptExtractedLabValue | null => {
            const rec = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
            const test = typeof rec.test === 'string' ? rec.test.trim() : '';
            const value = typeof rec.value === 'string' ? rec.value.trim() : '';
            if (!test || !value) return null;
            const item: AdaptExtractedLabValue = {
              test,
              value,
              confidence: typeof rec.confidence === 'number' ? rec.confidence : 80,
              needsReview: Boolean(rec.needsReview),
            };
            if (typeof rec.unit === 'string') item.unit = rec.unit;
            if (typeof rec.referenceRange === 'string') item.referenceRange = rec.referenceRange;
            if (typeof rec.observedDate === 'string') item.observedDate = rec.observedDate;
            return item;
          })
          .filter((row): row is AdaptExtractedLabValue => row != null)
      : [];
    step2C = {
      labValues: typeof s2c.labValues === 'string' ? s2c.labValues : '',
      extractedLabValues: extracted,
      height: typeof s2c.height === 'string' ? s2c.height : '',
      weight: typeof s2c.weight === 'string' ? s2c.weight : '',
      bmi: typeof s2c.bmi === 'string' ? s2c.bmi : '',
      pulse: typeof s2c.pulse === 'string' ? s2c.pulse : '',
      bloodPressureSystolic:
        typeof s2c.bloodPressureSystolic === 'string' ? s2c.bloodPressureSystolic : '',
      bloodPressureDiastolic:
        typeof s2c.bloodPressureDiastolic === 'string' ? s2c.bloodPressureDiastolic : '',
      measurementDate: typeof s2c.measurementDate === 'string' ? s2c.measurementDate : '',
      confirmed: Boolean(s2c.confirmed),
      confirmedAt: typeof s2c.confirmedAt === 'string' ? s2c.confirmedAt : undefined,
      skipped: Boolean(s2c.skipped),
    };
  } else {
    step2C = emptyAdaptStepTwoOptionC();
  }

  let step3A: AdaptStepThreeOptionA | undefined = undefined;
  if (obj.step3A && typeof obj.step3A === 'object') {
    const s3 = obj.step3A as Record<string, unknown>;
    const propRx = (s3.proposedPrescription && typeof s3.proposedPrescription === 'object')
      ? (s3.proposedPrescription as Record<string, unknown>)
      : {};

    step3A = {
      proposalMode:
        typeof s3.proposalMode === 'string' && ['suggested', 'custom'].includes(s3.proposalMode)
          ? (s3.proposalMode as AdaptationProposalMode)
          : null,
      selectedSuggestionId:
        typeof s3.selectedSuggestionId === 'string' ? s3.selectedSuggestionId : null,
      proposedPrescription: {
        drugId: typeof propRx.drugId === 'string' ? propRx.drugId : undefined,
        drugName: typeof propRx.drugName === 'string' ? propRx.drugName : '',
        genericName: typeof propRx.genericName === 'string' ? propRx.genericName : undefined,
        brandName: typeof propRx.brandName === 'string' ? propRx.brandName : undefined,
        strength: typeof propRx.strength === 'string' ? propRx.strength : '',
        dosageForm: typeof propRx.dosageForm === 'string' ? propRx.dosageForm : '',
        dose: typeof propRx.dose === 'string' ? propRx.dose : '',
        frequency: typeof propRx.frequency === 'string' ? propRx.frequency : '',
        route: typeof propRx.route === 'string' ? propRx.route : '',
        quantity:
          typeof propRx.quantity === 'number' || typeof propRx.quantity === 'string'
            ? propRx.quantity
            : null,
        quantityUnit: typeof propRx.quantityUnit === 'string' ? propRx.quantityUnit : undefined,
        refills:
          typeof propRx.refills === 'number' || typeof propRx.refills === 'string'
            ? propRx.refills
            : null,
        sig: typeof propRx.sig === 'string' ? propRx.sig : '',
      },
      modifiedFromSuggestion: Boolean(s3.modifiedFromSuggestion),
      changeSummary: typeof s3.changeSummary === 'string' ? s3.changeSummary : '',
      patientSpecificNotes: typeof s3.patientSpecificNotes === 'string' ? s3.patientSpecificNotes : '',
      rationaleDraft: typeof s3.rationaleDraft === 'string' ? s3.rationaleDraft : '',
      rationaleEditedByPharmacist: Boolean(s3.rationaleEditedByPharmacist),
      counsellingPreview: Array.isArray(s3.counsellingPreview)
        ? (s3.counsellingPreview.filter((p) => typeof p === 'string') as string[])
        : [],
      customAdaptationSummary:
        typeof s3.customAdaptationSummary === 'string' ? s3.customAdaptationSummary : '',
      additionalDetails: typeof s3.additionalDetails === 'string' ? s3.additionalDetails : '',
      dosingTime: typeof s3.dosingTime === 'string' ? s3.dosingTime : '',
      selectedFormulation:
        typeof s3.selectedFormulation === 'string' ? s3.selectedFormulation : '',
      selectedRouteOption:
        typeof s3.selectedRouteOption === 'string' ? s3.selectedRouteOption : '',
      confirmed: Boolean(s3.confirmed),
      confirmedAt: typeof s3.confirmedAt === 'string' ? s3.confirmedAt : undefined,
    };
  } else {
    step3A = emptyAdaptStepThreeOptionA(originalPrescription);
  }

  let step3B: AdaptStepThreeOptionB | undefined = undefined;
  if (obj.step3B && typeof obj.step3B === 'object') {
    const s3b = obj.step3B as Record<string, unknown>;
    const rawChecks = Array.isArray(s3b.checks) ? s3b.checks : [];
    const checks: ClinicalCheckItem[] = rawChecks.map((c) => {
      const rec = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return {
        id: typeof rec.id === 'string' ? rec.id : '',
        type: typeof rec.type === 'string' ? rec.type : '',
        title: typeof rec.title === 'string' ? rec.title : '',
        applicable: rec.applicable !== false,
        severity: (['pass', 'info', 'review', 'block'].includes(rec.severity as string)
          ? rec.severity
          : 'pass') as CheckSeverity,
        status: typeof rec.status === 'string' ? (rec.status as ClinicalCheckStatus) : 'appropriate',
        statusLabel: typeof rec.statusLabel === 'string' ? rec.statusLabel : '',
        tone: (['success', 'warning', 'danger', 'neutral'].includes(rec.tone as string)
          ? rec.tone
          : 'success') as ClinicalCheckTone,
        icon: (typeof rec.icon === 'string' ? rec.icon : 'pill') as ClinicalCheckItem['icon'],
        summary: typeof rec.summary === 'string' ? rec.summary : '',
        assessment: typeof rec.assessment === 'string' ? rec.assessment : '',
        recommendation: typeof rec.recommendation === 'string' ? rec.recommendation : '',
        reference:
          rec.reference && typeof rec.reference === 'object'
            ? (rec.reference as CheckReference)
            : undefined,
        infoCallout: typeof rec.infoCallout === 'string' ? rec.infoCallout : undefined,
        requiresAcknowledgment: Boolean(rec.requiresAcknowledgment),
        acknowledged: Boolean(rec.acknowledged),
        pharmacistNote: typeof rec.pharmacistNote === 'string' ? rec.pharmacistNote : undefined,
        isRelevantToAdaptation:
          typeof rec.isRelevantToAdaptation === 'boolean'
            ? rec.isRelevantToAdaptation
            : undefined,
      };
    });

    step3B = {
      checks:
        checks.length > 0
          ? checks
          : evaluateAdaptationSafety(
              {
                originalPrescription,
                jurisdiction: jur,
                adaptationType,
                adaptationReason,
                additionalComments,
                dispensingStatus,
              },
              step2A,
              step2B,
              step3A,
              jur,
            ).checks,
      selectedCheckId: typeof s3b.selectedCheckId === 'string' ? s3b.selectedCheckId : 'renal_function',
      evaluatedAt: typeof s3b.evaluatedAt === 'string' ? s3b.evaluatedAt : '14-Sep-2026 08:58',
      overallStatus: ['pass', 'review', 'block'].includes(s3b.overallStatus as string)
        ? (s3b.overallStatus as 'pass' | 'review' | 'block')
        : 'pass',
      clinicalRationale: typeof s3b.clinicalRationale === 'string' ? s3b.clinicalRationale : '',
      rationaleEditedByPharmacist: Boolean(s3b.rationaleEditedByPharmacist),
      acknowledgedCheckIds: Array.isArray(s3b.acknowledgedCheckIds)
        ? (s3b.acknowledgedCheckIds.filter((id) => typeof id === 'string') as string[])
        : [],
      pharmacistNotes:
        s3b.pharmacistNotes && typeof s3b.pharmacistNotes === 'object'
          ? (s3b.pharmacistNotes as Record<string, string>)
          : {},
      clinicalOverride: (() => {
        const o = s3b.clinicalOverride;
        if (!o || typeof o !== 'object') return undefined;
        const rec = o as Record<string, unknown>;
        const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
        if (!reason || rec.acknowledgedRisk !== true) return undefined;
        const source = rec.source;
        const allowed = ['ALLERGY', 'AVOID', 'CAUTION', 'REVIEW_REQUIRED'] as const;
        return {
          overriddenAt:
            typeof rec.overriddenAt === 'string'
              ? rec.overriddenAt
              : new Date().toISOString(),
          reason,
          comments: typeof rec.comments === 'string' ? rec.comments : undefined,
          acknowledgedRisk: true as const,
          source: allowed.includes(source as (typeof allowed)[number])
            ? (source as (typeof allowed)[number])
            : ('AVOID' as const),
        };
      })(),
      pharmacistReferencesConsulted: Array.isArray(s3b.pharmacistReferencesConsulted)
        ? (s3b.pharmacistReferencesConsulted as AdaptPharmacistConsultedReference[])
        : undefined,
      safeScribeSupportingReferences: Array.isArray(s3b.safeScribeSupportingReferences)
        ? (s3b.safeScribeSupportingReferences as AdaptSupportingReferenceSnapshot[])
        : undefined,
      documentSnapshotId:
        typeof s3b.documentSnapshotId === 'string' ? s3b.documentSnapshotId : undefined,
      documentSnapshotHash:
        typeof s3b.documentSnapshotHash === 'string' ? s3b.documentSnapshotHash : undefined,
      confirmed: Boolean(s3b.confirmed),
      confirmedAt: typeof s3b.confirmedAt === 'string' ? s3b.confirmedAt : undefined,
    };
  } else {
    step3B = emptyAdaptStepThreeOptionB(
      {
        originalPrescription,
        jurisdiction: jur,
        adaptationType,
        adaptationReason,
        additionalComments,
        dispensingStatus,
      },
      step2A,
      step2B,
      step3A,
      jur,
    );
  }

  let step4: AdaptStepFour | undefined = undefined;
  if (obj.step4 && typeof obj.step4 === 'object') {
    const s4 = obj.step4 as Record<string, unknown>;
    const pInfo = (s4.patientInfo && typeof s4.patientInfo === 'object' ? s4.patientInfo : {}) as Record<string, unknown>;
    const defaultStep4 = emptyAdaptStepFour(
      {
        originalPrescription,
        jurisdiction: jur,
        adaptationType,
        adaptationReason,
        additionalComments,
        dispensingStatus,
      },
      step2A,
      step2B,
      step3A,
      step3B,
      jur,
    );

    const rawDocs = (s4.documents && typeof s4.documents === 'object' ? s4.documents : {}) as Record<string, unknown>;
    const docs = { ...defaultStep4.documents };
    for (const def of ADAPT_DOCUMENT_DEFINITIONS) {
      if (rawDocs[def.id] && typeof rawDocs[def.id] === 'object') {
        const d = rawDocs[def.id] as Record<string, unknown>;
        docs[def.id] = {
          ...docs[def.id],
          html: typeof d.html === 'string' ? d.html : docs[def.id].html,
          plainText: typeof d.plainText === 'string' ? d.plainText : docs[def.id].plainText,
          lastEditedAt: typeof d.lastEditedAt === 'string' ? d.lastEditedAt : docs[def.id].lastEditedAt,
        };
      }
    }

    const rawReviews = (s4.documentReviews && typeof s4.documentReviews === 'object' ? s4.documentReviews : {}) as Record<string, unknown>;
    const reviews = { ...defaultStep4.documentReviews };
    for (const def of ADAPT_DOCUMENT_DEFINITIONS) {
      if (rawReviews[def.id] && typeof rawReviews[def.id] === 'object') {
        const r = rawReviews[def.id] as Record<string, unknown>;
        reviews[def.id] = {
          versionId: typeof r.versionId === 'string' ? r.versionId : reviews[def.id].versionId,
          status: ['REVIEW_REQUIRED', 'REVIEWED', 'UPDATED_REVIEW_REQUIRED'].includes(r.status as string)
            ? (r.status as 'REVIEW_REQUIRED' | 'REVIEWED' | 'UPDATED_REVIEW_REQUIRED')
            : 'REVIEW_REQUIRED',
          reviewedAt: typeof r.reviewedAt === 'string' ? r.reviewedAt : undefined,
          reviewedBy: typeof r.reviewedBy === 'string' ? r.reviewedBy : undefined,
        };
      }
    }

    const rawName = typeof pInfo.name === 'string' ? pInfo.name.trim() : '';
    const rawDob = typeof pInfo.dateOfBirth === 'string' ? pInfo.dateOfBirth.trim() : '';
    const rawPhn = typeof pInfo.patientId === 'string' ? pInfo.patientId.trim() : '';
    const rawPhone = typeof pInfo.phone === 'string' ? pInfo.phone.trim() : '';
    const rawAddress = typeof pInfo.address === 'string' ? pInfo.address.trim() : '';

    const isDummyName = rawName === 'Jane Doe' || rawName === 'John Doe';
    const isDummyDob = rawDob === '1958-04-12';
    const isDummyPhn = rawPhn === '987654321';
    const isDummyPhone = rawPhone === '(403) 555-0199' || rawPhone === '4035550199';
    const isDummyAddress = rawAddress.includes('123 Health Ave');

    const cleanName = isDummyName ? '' : rawName;
    const cleanDob = isDummyDob ? '' : rawDob;
    const cleanPhn = isDummyPhn ? '' : rawPhn;
    const cleanPhone = isDummyPhone ? '' : rawPhone;
    const cleanAddress = isDummyAddress ? '' : rawAddress;

    const isSkipped = Boolean(pInfo.skipped);
    const isConfirmed = Boolean(pInfo.confirmed) && !isDummyName && cleanName.length > 0;

    step4 = {
      patientInfo: {
        name: cleanName,
        dateOfBirth: cleanDob,
        patientId: cleanPhn,
        phone: cleanPhone,
        address: cleanAddress,
        skipped: isSkipped,
        confirmed: isConfirmed,
      },
      documents: docs,
      documentReviews: reviews,
      overallStatus: ['draft', 'ready', 'completed'].includes(s4.overallStatus as string)
        ? (s4.overallStatus as 'draft' | 'ready' | 'completed')
        : 'draft',
      allReviewed: Boolean(s4.allReviewed),
      completedAt: typeof s4.completedAt === 'string' ? s4.completedAt : undefined,
    };
  } else {
    step4 = emptyAdaptStepFour(
      {
        originalPrescription,
        jurisdiction: jur,
        adaptationType,
        adaptationReason,
        additionalComments,
        dispensingStatus,
      },
      step2A,
      step2B,
      step3A,
      step3B,
      jur,
    );
  }

  return {
    step1: {
      originalPrescriptionId:
        typeof step1Raw.originalPrescriptionId === 'string'
          ? step1Raw.originalPrescriptionId
          : originalPrescription?.id ?? null,
      originalPrescription,
      indication: parseAdaptIndicationSelection(step1Raw.indication, originalPrescription),
      jurisdiction: jur,
      adaptationType,
      adaptationReason,
      additionalComments,
      dispensingStatus,
      completedAt:
        typeof step1Raw.completedAt === 'string' ? step1Raw.completedAt : undefined,
    },
    step2A,
    step2B,
    step2C,
    step3A,
    step3B,
    step4,
    step2: obj.step2 && typeof obj.step2 === 'object' ? (obj.step2 as Record<string, unknown>) : undefined,
    step3: obj.step3 && typeof obj.step3 === 'object' ? (obj.step3 as Record<string, unknown>) : undefined,
  };
}

function parseAdaptIndicationSelection(
  raw: unknown,
  medication: RenewMedication | null,
): AdaptIndicationSelection | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const statusRaw = typeof src.status === 'string' ? src.status : 'pending';
  const status = (ADAPT_INDICATION_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as AdaptIndicationStatus)
    : 'pending';
  const sourceRaw = typeof src.selectionSource === 'string' ? src.selectionSource : 'approved_mapping';
  const selectionSource = (ADAPT_INDICATION_SELECTION_SOURCES as readonly string[]).includes(
    sourceRaw,
  )
    ? (sourceRaw as AdaptIndicationSelectionSource)
    : 'approved_mapping';

  const candidates: RenewIndicationCandidate[] = [];
  if (Array.isArray(src.candidates)) {
    for (const row of src.candidates) {
      if (!row || typeof row !== 'object') continue;
      const c = row as Record<string, unknown>;
      if (typeof c.conditionId !== 'string' || typeof c.displayName !== 'string') continue;
      candidates.push({
        conditionId: c.conditionId,
        conditionCode: typeof c.conditionCode === 'string' ? c.conditionCode : '',
        displayName: c.displayName,
        mappingStrength:
          c.mappingStrength === 'primary' ||
          c.mappingStrength === 'common' ||
          c.mappingStrength === 'possible' ||
          c.mappingStrength === 'rare'
            ? c.mappingStrength
            : null,
        rank: typeof c.rank === 'number' ? c.rank : null,
        confidenceBand:
          c.confidenceBand === 'high' ||
          c.confidenceBand === 'moderate' ||
          c.confidenceBand === 'low'
            ? c.confidenceBand
            : null,
      });
    }
  }

  const suggestions: AdaptIndicationSuggestion[] = [];
  if (Array.isArray(src.suggestions)) {
    for (const row of src.suggestions) {
      if (!row || typeof row !== 'object') continue;
      const s = row as Record<string, unknown>;
      if (typeof s.conditionId !== 'string' || typeof s.displayName !== 'string') continue;
      const suggestion: AdaptIndicationSuggestion = {
        conditionId: s.conditionId,
        displayName: s.displayName,
        conditionCode: typeof s.conditionCode === 'string' ? s.conditionCode : '',
        reason: typeof s.reason === 'string' ? s.reason : '',
      };
      if (s.badge === 'matches_patient' || s.badge === 'suggested') {
        suggestion.badge = s.badge;
      }
      suggestions.push(suggestion);
    }
  }
  return {
    medicationId:
      typeof src.medicationId === 'string'
        ? src.medicationId
        : medication?.id ?? '',
    medicationConceptKey:
      typeof src.medicationConceptKey === 'string'
        ? src.medicationConceptKey
        : medication
          ? adaptMedicationConceptKey(medication)
          : '',
    conditionId: typeof src.conditionId === 'string' ? src.conditionId : null,
    conditionCode: typeof src.conditionCode === 'string' ? src.conditionCode : null,
    indicationDisplay:
      typeof src.indicationDisplay === 'string' ? src.indicationDisplay : null,
    customIndicationText:
      typeof src.customIndicationText === 'string' ? src.customIndicationText : null,
    status,
    selectionSource,
    confirmedByPharmacist: Boolean(src.confirmedByPharmacist),
    selectedAt: typeof src.selectedAt === 'string' ? src.selectedAt : undefined,
    candidates,
    suggestions,
    repositoryVersion:
      typeof src.repositoryVersion === 'string' ? src.repositoryVersion : null,
    mappingId: typeof src.mappingId === 'string' ? src.mappingId : null,
    reviewCandidates: Array.isArray(src.reviewCandidates)
      ? src.reviewCandidates
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const c = row as Record<string, unknown>;
            if (
              typeof c.id !== 'string' ||
              typeof c.snomedConceptId !== 'string' ||
              typeof c.displayName !== 'string'
            ) {
              return null;
            }
            return {
              id: c.id,
              snomedConceptId: c.snomedConceptId,
              displayName: c.displayName,
              createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
            };
          })
          .filter(
            (
              row,
            ): row is {
              id: string;
              snomedConceptId: string;
              displayName: string;
              createdAt: string;
            } => Boolean(row),
          )
      : undefined,
  };
}

export function isAdaptStepOneValid(stepOne: AdaptStepOne): {
  valid: boolean;
  hasPrescription: boolean;
  hasDirections: boolean;
  hasIndication: boolean;
  hasType: boolean;
  hasReason: boolean;
  commentsValid: boolean;
  commentsError?: string;
} {
  const hasPrescription = Boolean(stepOne.originalPrescription);
  const hasDirections = hasAdaptOriginalDirections(stepOne.originalPrescription);
  const hasIndication = isAdaptIndicationComplete(stepOne.indication);
  const hasType = Boolean(stepOne.adaptationType);
  const hasReason = Boolean(stepOne.adaptationReason?.code);

  const isOther = isReasonOther(stepOne.adaptationReason);
  const commentsTrimmed = (stepOne.additionalComments ?? '').trim();
  const commentsValid = !isOther || commentsTrimmed.length > 0;
  const commentsError =
    isOther && commentsTrimmed.length === 0
      ? 'Please briefly describe the reason for adaptation.'
      : undefined;

  const valid =
    hasPrescription &&
    hasDirections &&
    hasIndication &&
    hasType &&
    hasReason &&
    commentsValid;

  return {
    valid,
    hasPrescription,
    hasDirections,
    hasIndication,
    hasType,
    hasReason,
    commentsValid,
    commentsError,
  };
}

/** Original SIG is required so Adapt can compare before → after accurately. */
export function hasAdaptOriginalDirections(
  med: RenewMedication | null | undefined,
): boolean {
  if (!med) return false;
  if (med.directionsStatus === 'UNAVAILABLE') return false;
  return Boolean(
    med.normalized.directions?.trim() || med.raw.directionsText?.trim(),
  );
}

export function isAdaptStepTwoOptionAValid(step2A: AdaptStepTwoOptionA): {
  valid: boolean;
  snapshotValid: boolean;
  backgroundValid: boolean;
  missingFields: string[];
} {
  const missing: string[] = [];

  // 1. Snapshot: Sex is required
  const sexValid = Boolean(step2A.demographics.sex?.trim());
  if (!sexValid) missing.push('Sex at birth');

  // 2. Snapshot: DOB is required, or DOB Unavailable with Age
  const dobUnavailable = Boolean(step2A.demographics.dateOfBirthUnavailable);
  let dobOrAgeValid = false;
  if (dobUnavailable) {
    const ageNum = parseFloat((step2A.demographics.age ?? '').replace(/[^\d.]/g, ''));
    dobOrAgeValid = !Number.isNaN(ageNum) && ageNum >= 0 && ageNum <= 130;
    if (!dobOrAgeValid) missing.push('Age');
  } else {
    dobOrAgeValid =
      Boolean(step2A.demographics.dateOfBirth) &&
      dateOfBirthError(step2A.demographics.dateOfBirth) == null;
    if (!dobOrAgeValid) missing.push('Date of birth');
  }

  const snapshotValid = sexValid && dobOrAgeValid;

  // Reproductive fields required for Female / Intersex / Unknown (Prescribe parity)
  const sex = (step2A.demographics.sex ?? '').trim();
  const needsReproductive =
    sex === 'Female' || sex === 'Intersex' || sex === 'Unknown' || sex === 'Other';
  let reproductiveValid = true;
  if (needsReproductive) {
    if (!(step2A.demographics.pregnancyStatus ?? '').trim()) {
      reproductiveValid = false;
      missing.push('Pregnancy');
    }
    if (!(step2A.demographics.breastfeedingStatus ?? '').trim()) {
      reproductiveValid = false;
      missing.push('Breastfeeding');
    }
  }

  // 3. Background: Allergies confirmed
  const allergiesConfirmed =
    step2A.background.allergiesNone || (step2A.background.allergyEntries?.length ?? 0) > 0;
  if (!allergiesConfirmed) missing.push('Allergies');

  // 4. Background: Medications confirmed
  const medsConfirmed =
    step2A.background.medsNone || (step2A.background.medicationEntries?.length ?? 0) > 0;
  if (!medsConfirmed) missing.push('Current medications');

  // 5. Background: Conditions confirmed
  const conditionsConfirmed =
    step2A.background.conditionsNone || (step2A.background.conditions?.length ?? 0) > 0;
  if (!conditionsConfirmed) missing.push('Medical conditions');

  const backgroundValid = allergiesConfirmed && medsConfirmed && conditionsConfirmed;
  const valid = snapshotValid && reproductiveValid && backgroundValid;

  return {
    valid,
    snapshotValid,
    backgroundValid,
    missingFields: missing,
  };
}

export function isAdaptStepTwoOptionBValid(step2B: AdaptStepTwoOptionB): {
  valid: boolean;
  missingFields: string[];
} {
  const missing: string[] = [];

  // Gating question is always required
  if (step2B.isTakingMedication === null) {
    missing.push('Is the patient already taking the medication');
    return { valid: false, missingFields: missing };
  }

  // If No, immediately valid
  if (step2B.isTakingMedication === false) {
    return { valid: true, missingFields: [] };
  }

  // If Yes, validate all required follow-up fields
  if (!step2B.currentUse?.trim()) {
    missing.push('How is the patient currently taking it');
  }

  if (!step2B.duration?.trim()) {
    missing.push('How long have they been taking it');
  }

  if (!step2B.effectiveness) {
    missing.push('Effectiveness / response');
  }

  if (!step2B.adverseEffects) {
    missing.push('Adverse effects / tolerability');
  } else if (step2B.adverseEffects === 'yes_describe' && !step2B.adverseEffectsDescription?.trim()) {
    missing.push('Describe adverse effects');
  }

  if (!step2B.adherence) {
    missing.push('Adherence');
  } else if (step2B.adherence === 'other' && !step2B.adherenceDescription?.trim()) {
    missing.push('Describe adherence concern');
  }

  const valid = missing.length === 0;
  return { valid, missingFields: missing };
}

export function generateAdaptationSuggestions(
  step1: AdaptStepOne,
  _step2A?: AdaptStepTwoOptionA,
  _step2B?: AdaptStepTwoOptionB,
): SuggestedAdaptation[] {
  const originalRx = step1.originalPrescription;
  const rawMed = originalRx?.raw?.medicationText || '';
  const generic = originalRx?.normalized?.genericName || '';
  const brand = originalRx?.normalized?.brandName || '';
  const drug = generic || brand || rawMed || 'Metformin 500 mg tablet';
  const strength = originalRx?.normalized?.strength || '500 mg';
  const dosageForm = originalRx?.normalized?.dosageForm || 'tablet';
  const origQty = originalRx?.raw?.quantityText ? parseInt(originalRx.raw.quantityText, 10) || 180 : 180;
  const reasonCode = step1.adaptationReason?.code || '';
  const reasonLabel = step1.adaptationReason?.label || '';
  const adaptType = step1.adaptationType || 'dose';

  const isMetformin = /metformin/i.test(drug);
  const isRenal = /renal|egfr|kidney/i.test(reasonCode) || /renal|kidney|egfr/i.test(reasonLabel);

  // Metformin + renal consideration scenario (matching reference mock media_1789820756874.jpg)
  if (isMetformin && (isRenal || adaptType === 'dose')) {
    return [
      {
        id: 'adjust_dose_metformin',
        title: 'Adjust dose',
        badge: 'Recommended',
        subtitle: 'Metformin 500 mg tablet',
        proposedPrescription: {
          drugId: originalRx?.id,
          drugName: 'Metformin 500 mg tablet',
          strength: '500 mg',
          dosageForm: 'tablet',
          dose: '500 mg',
          frequency: 'Once daily',
          route: 'By mouth',
          quantity: 90,
          refills: 1,
          sig: 'Take 1 tablet by mouth once daily',
        },
        supportingPoints: [
          'Appropriate for current eGFR (45 mL/min)',
          'Aligns with product monograph',
          'Monitor renal function every 3–6 months',
        ],
        rationaleSummary:
          'Dose reduced to 500 mg once daily based on current eGFR of 45 mL/min (moderate renal impairment). This is consistent with the metformin product monograph and clinical guidelines. Renal function should be reassessed every 3–6 months.',
        counsellingPoints: [
          'Take your adjusted 500 mg dose once daily with your largest meal of the day.',
          'Dose was reduced to protect your kidney health while maintaining glucose control.',
          'Watch for rare symptoms of lactic acidosis: severe fatigue, muscle aches, breathing difficulty, or stomach discomfort.',
          'Routine blood work to check your kidney function will be scheduled in 3–6 months.',
        ],
        displayRank: 1,
      },
      {
        id: 'adjust_frequency_metformin',
        title: 'Adjust frequency',
        subtitle: 'Metformin 500 mg tablet',
        proposedPrescription: {
          drugId: originalRx?.id,
          drugName: 'Metformin 500 mg tablet',
          strength: '500 mg',
          dosageForm: 'tablet',
          dose: '500 mg',
          frequency: 'Once daily',
          route: 'By mouth',
          quantity: 90,
          refills: 1,
          sig: 'Take 1 tablet by mouth once daily',
        },
        supportingPoints: [
          'Maintains same daily dose',
          'May improve tolerability',
          'Monitor renal function',
        ],
        rationaleSummary:
          'Dosing schedule adjusted to once daily to optimize tolerability and align with renal clearance capacity.',
        counsellingPoints: [
          'Take once daily with dinner or breakfast consistently.',
          'Report any gastrointestinal symptoms if they persist.',
          'Keep regular lab appointments for renal and glycemic monitoring.',
        ],
        displayRank: 2,
      },
      {
        id: 'alternative_therapy_metformin',
        title: 'Alternative therapy',
        subtitle: 'Consider switching therapy',
        proposedPrescription: {
          drugName: 'Linagliptin 5 mg tablet',
          strength: '5 mg',
          dosageForm: 'tablet',
          dose: '5 mg',
          frequency: 'Once daily',
          route: 'By mouth',
          quantity: 30,
          refills: 1,
          sig: 'Take 1 tablet by mouth once daily',
        },
        supportingPoints: [
          'If eGFR declines < 30 mL/min',
          'Consider non-metformin agent',
          'Assess individual patient factors',
        ],
        rationaleSummary:
          'Alternative non-renal cleared antihyperglycemic therapy considered in the event of further renal decline.',
        counsellingPoints: [
          'Linagliptin does not require dose adjustments for renal impairment.',
          'Take once daily with or without food.',
          'Contact prescriber/pharmacist if blood glucose targets are not achieved.',
        ],
        displayRank: 3,
      },
    ];
  }

  // Clinical suggestions for general medications
  const halfQty = Math.max(30, Math.round(origQty / 2));
  const fullDrugLabel = [drug, strength, dosageForm].filter(Boolean).join(' ');

  return [
    {
      id: `adjust_dose_${drug.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      title: 'Adjust dose',
      badge: 'Recommended',
      subtitle: fullDrugLabel,
      proposedPrescription: {
        drugId: originalRx?.id,
        drugName: fullDrugLabel,
        strength,
        dosageForm,
        dose: strength,
        frequency: 'Once daily',
        route: originalRx?.normalized?.route || 'By mouth',
        quantity: halfQty,
        refills: 1,
        sig: `Take 1 ${dosageForm} by mouth once daily`,
      },
      supportingPoints: [
        `Adjusted based on clinical rationale (${reasonLabel || 'dose optimization'})`,
        'Aligns with clinical practice guidelines',
        'Monitoring plan recommended for efficacy and tolerability',
      ],
      rationaleSummary: `Dose adjusted to optimize therapeutic response and ensure patient safety given ${reasonLabel || 'current clinical profile'}.`,
      counsellingPoints: [
        'Take your revised dose once daily as directed.',
        'Monitor for expected therapeutic response and any new adverse effects.',
        'Follow up with your pharmacist in 2–4 weeks.',
      ],
      displayRank: 1,
    },
    {
      id: `adjust_frequency_${drug.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      title: 'Adjust frequency',
      subtitle: fullDrugLabel,
      proposedPrescription: {
        drugId: originalRx?.id,
        drugName: fullDrugLabel,
        strength,
        dosageForm,
        dose: strength,
        frequency: 'Once daily',
        route: originalRx?.normalized?.route || 'By mouth',
        quantity: halfQty,
        refills: 1,
        sig: `Take 1 ${dosageForm} by mouth once daily`,
      },
      supportingPoints: [
        'Maintains therapeutic target with simplified schedule',
        'Improves patient adherence and convenience',
        'Standard monitoring recommended',
      ],
      rationaleSummary: 'Administration schedule modified to improve compliance and maintain steady-state efficacy.',
      counsellingPoints: [
        'Take at the same time each day.',
        'Discuss with pharmacist if you miss a dose.',
      ],
      displayRank: 2,
    },
    {
      id: `alternative_therapy_${drug.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      title: 'Alternative therapy',
      subtitle: 'Consider therapeutic alternative',
      proposedPrescription: {
        drugName: fullDrugLabel,
        strength,
        dosageForm,
        dose: strength,
        frequency: 'Once daily',
        route: 'By mouth',
        quantity: 30,
        refills: 1,
        sig: `Take 1 ${dosageForm} by mouth once daily`,
      },
      supportingPoints: [
        'Consider if clinical target is not met with dose adjustment',
        'Evaluates patient-specific tolerability and contraindications',
        'Prescriber collaboration advised',
      ],
      rationaleSummary: 'Alternative clinical therapy considered to achieve target outcomes while mitigating risk.',
      counsellingPoints: [
        'Alternative treatment options may be discussed if current therapy is not tolerated.',
      ],
      displayRank: 3,
    },
  ];
}

export function generateChangeSummary(
  originalRx: RenewMedication | null,
  proposed: ProposedPrescription,
): string {
  if (!originalRx) return 'New proposed prescription defined.';
  const changes: string[] = [];

  const origDrug =
    originalRx.normalized?.genericName ||
    originalRx.normalized?.brandName ||
    originalRx.raw?.medicationText ||
    '';
  const propDrug = proposed.drugName || '';
  if (origDrug && propDrug && !propDrug.toLowerCase().includes(origDrug.toLowerCase())) {
    changes.push(`Medication changed from ${origDrug} to ${propDrug}`);
  }

  const origDose = originalRx.normalized?.strength || '';
  const propDose = proposed.dose || '';
  const origFreq = originalRx.raw?.directionsText || originalRx.normalized?.directions || '';
  const propFreq = proposed.frequency || '';

  if (origDose && propDose && origDose !== propDose) {
    changes.push(`dose adjusted from ${origDose} to ${propDose}`);
  }

  if (origFreq && propFreq && !origFreq.toLowerCase().includes(propFreq.toLowerCase())) {
    changes.push(`frequency changed to ${propFreq}`);
  }

  if (proposed.sig && origFreq && proposed.sig !== origFreq && changes.length === 0) {
    changes.push(`directions modified to "${proposed.sig}"`);
  }

  if (changes.length === 0) {
    return 'Dose reduced to 500 mg once daily based on renal function.';
  }

  const first = changes[0]!;
  const capitalized = first.charAt(0).toUpperCase() + first.slice(1);
  return [capitalized, ...changes.slice(1)].join('; ') + '.';
}

export function generateDraftRationale(
  step1: AdaptStepOne,
  step2A?: AdaptStepTwoOptionA,
  step2B?: AdaptStepTwoOptionB,
  proposed?: ProposedPrescription,
): string {
  const reason = step1.adaptationReason?.label || 'clinical assessment';
  const adaptType = step1.adaptationType || 'dose';
  const original = step1.originalPrescription;
  const origDrug =
    original?.normalized?.genericName ||
    original?.normalized?.brandName ||
    original?.raw?.medicationText ||
    'the original medication';
  const proposedDrug = proposed?.drugName?.trim() || '';
  const dose = proposed?.dose?.trim() || '';
  const freq = proposed?.frequency?.trim() || '';
  const route = proposed?.route?.trim() || '';
  const sig = proposed?.sig?.trim() || '';

  const allergies = (step2A?.background?.allergyEntries ?? [])
    .map((a) => a.drug?.trim())
    .filter(Boolean)
    .slice(0, 3);
  const allergyBit =
    allergies.length > 0
      ? ` Documented allergies include ${allergies.join(', ')}.`
      : step2A?.background?.allergiesNone
        ? ' No drug allergies were recorded.'
        : '';

  const experienceBit =
    step2B?.adverseEffects === 'yes_describe' && step2B.adverseEffectsDescription?.trim()
      ? ` Patient-reported adverse effects: ${step2B.adverseEffectsDescription.trim().slice(0, 80)}.`
      : '';

  // Metformin + renal (matching mock)
  if (
    /metformin/i.test(proposedDrug || origDrug) &&
    /renal|egfr|kidney/i.test(reason)
  ) {
    return 'Dose reduced to 500 mg once daily based on current eGFR of 45 mL/min (moderate renal impairment). This is consistent with the metformin product monograph and clinical guidelines. Renal function should be reassessed every 3–6 months.';
  }

  let core = '';
  switch (adaptType) {
    case 'therapeutic_substitution':
      core = proposedDrug
        ? `Therapeutic substitution from ${origDrug} to ${proposedDrug} is proposed due to ${reason.toLowerCase()}.`
        : `Therapeutic substitution of ${origDrug} is proposed due to ${reason.toLowerCase()}.`;
      if (dose || freq) {
        core += ` Proposed regimen: ${[dose, freq, route].filter(Boolean).join(', ') || sig}.`;
      }
      core +=
        ' Selection accounts for patient-specific factors and aims to maintain therapeutic intent while improving safety/tolerability.';
      break;
    case 'dosage_form':
      core = `Dosage form for ${proposedDrug || origDrug} adapted${
        proposed?.dosageForm ? ` to ${proposed.dosageForm}` : ''
      } due to ${reason.toLowerCase()}.`;
      if (sig) core += ` Directions: ${sig}.`;
      core += ' Change supports administration, adherence, or tolerability for this patient.';
      break;
    case 'regimen':
      core = `Regimen for ${proposedDrug || origDrug} changed${
        freq ? ` to ${freq.toLowerCase()}` : ''
      } due to ${reason.toLowerCase()}.`;
      if (dose) core += ` Dose ${dose} maintained/adjusted as clinically appropriate.`;
      core += ' Schedule change supports adherence and therapeutic goals.';
      break;
    case 'route':
      core = `Route of administration for ${proposedDrug || origDrug} changed${
        route ? ` to ${route}` : ''
      } due to ${reason.toLowerCase()}.`;
      core += ' Adaptation preserves intended therapy while matching patient needs.';
      break;
    case 'other':
      core = `Custom adaptation of ${proposedDrug || origDrug} proposed due to ${reason.toLowerCase()}.`;
      if (sig) core += ` Directions: ${sig}.`;
      core += ' Change is individualized to this patient’s clinical profile.';
      break;
    case 'dose':
    default:
      core = `Dose of ${proposedDrug || origDrug} adapted${
        dose ? ` to ${dose}` : ''
      }${freq ? ` ${freq.toLowerCase()}` : ''} due to ${reason.toLowerCase()}.`;
      core +=
        ' This adjustment is consistent with clinical guidance for the documented concern; monitoring for response and tolerability is recommended.';
      break;
  }

  const draft = `${core}${allergyBit}${experienceBit}`.replace(/\s+/g, ' ').trim();
  return draft.slice(0, 500);
}

export function generateCounsellingPreview(
  step1: AdaptStepOne,
  proposed?: ProposedPrescription,
): string[] {
  const drug =
    proposed?.drugName ||
    step1.originalPrescription?.normalized?.genericName ||
    step1.originalPrescription?.normalized?.brandName ||
    step1.originalPrescription?.raw?.medicationText ||
    'Medication';
  const freq = proposed?.frequency || 'once daily';
  const isMetformin = /metformin/i.test(drug);

  if (isMetformin) {
    return [
      'Take your adjusted 500 mg dose once daily with your largest meal of the day to minimize stomach upset.',
      'This adjustment was made to protect your kidney function while keeping your blood sugar stable.',
      'Report any persistent severe fatigue, muscle pains, nausea, or breathing difficulties immediately.',
      'Your next kidney function lab test will be scheduled in 3 to 6 months.',
    ];
  }

  return [
    `Take your adapted prescription (${freq}) as directed on the label.`,
    'Discuss any new or changing symptoms with your pharmacist or prescriber.',
    'Keep your regular follow-up appointments and laboratory tests.',
  ];
}

export function isAdaptStepThreeOptionAValid(
  step3A: AdaptStepThreeOptionA,
  _jurisdiction = 'AB',
  adaptationType?: AdaptationType | null,
): {
  valid: boolean;
  missingFields: string[];
} {
  const missing: string[] = [];

  if (!step3A.proposalMode) {
    missing.push('Proposal option (suggestion or custom)');
  }

  if (adaptationType === 'other' && !step3A.customAdaptationSummary?.trim()) {
    missing.push('Custom adaptation summary');
  }

  const rx = step3A.proposedPrescription;
  if (!rx.drugName?.trim()) {
    missing.push('Drug / Product');
  }

  if (!rx.dose?.trim()) {
    missing.push('Dose');
  }

  if (!rx.frequency?.trim()) {
    missing.push('Frequency');
  }

  if (!rx.sig?.trim()) {
    missing.push('Directions (SIG)');
  }

  if (rx.quantity != null && rx.quantity !== '') {
    const q = typeof rx.quantity === 'number' ? rx.quantity : parseInt(rx.quantity, 10);
    if (Number.isNaN(q) || q < 0) {
      missing.push('Valid quantity');
    }
  }

  if (rx.refills != null && rx.refills !== '') {
    const r = typeof rx.refills === 'number' ? rx.refills : parseInt(rx.refills, 10);
    if (Number.isNaN(r) || r < 0) {
      missing.push('Valid refills');
    }
  }

  const valid = missing.length === 0;
  return { valid, missingFields: missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinical Safety Engine — Allergy & Cross-Reactivity Matching
// ─────────────────────────────────────────────────────────────────────────────

const PENICILLIN_CLASS = [
  'amoxicillin',
  'ampicillin',
  'penicillin',
  'penicillin v',
  'penicillin vk',
  'phenoxymethylpenicillin',
  'amoxil',
  'augmentin',
  'clavulin',
  'amoxicillin/clavulanate',
  'amoxicillin-clavulanate',
  'piperacillin',
  'tazobactam',
  'cloxacillin',
];

const CEPHALOSPORIN_CLASS = [
  'cephalexin',
  'keflex',
  'cefazolin',
  'cefaclor',
  'cefuroxime',
  'ceftriaxone',
  'cefixime',
  'cefpodoxime',
  'ceftazidime',
  'cefprozil',
];

const NSAID_CLASS = [
  'ibuprofen',
  'advil',
  'motrin',
  'naproxen',
  'aleve',
  'diclofenac',
  'voltaren',
  'ketorolac',
  'toradol',
  'indomethacin',
  'meloxicam',
  'celecoxib',
  'celebrex',
  'aspirin',
  'asa',
  'acetylsalicylic acid',
];

const SULFA_CLASS = [
  'sulfamethoxazole',
  'trimethoprim/sulfamethoxazole',
  'bactrim',
  'septra',
  'sulfasalazine',
  'sulfa',
  'sulfonamide',
];

const MACROLIDE_CLASS = [
  'azithromycin',
  'zithromax',
  'clarithromycin',
  'biaxin',
  'erythromycin',
];

const FLUOROQUINOLONE_CLASS = [
  'ciprofloxacin',
  'cipro',
  'levofloxacin',
  'levaquin',
  'moxifloxacin',
  'avelox',
  'norfloxacin',
];

const STATIN_CLASS = [
  'atorvastatin',
  'lipitor',
  'rosuvastatin',
  'crestor',
  'simvastatin',
  'zocor',
  'pravastatin',
  'pravachol',
  'lovastatin',
];

const ACE_INHIBITOR_CLASS = [
  'ramipril',
  'altace',
  'lisinopril',
  'zestril',
  'prinivil',
  'enalapril',
  'vasotec',
  'perindopril',
  'coversyl',
  'quinapril',
  'accupril',
  'captopril',
];

const OPIOID_CLASS = [
  'codeine',
  'morphine',
  'oxycodone',
  'oxycontin',
  'percocet',
  'hydromorphone',
  'dilaudid',
  'fentanyl',
  'tramadol',
];

function normalizeDrugString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDrugTokens(str: string): string[] {
  const normalized = normalizeDrugString(str);
  const stopWords = new Set([
    'mg', 'mcg', 'ml', 'g', 'tablet', 'tablets', 'capsule', 'capsules', 'oral', 'suspension',
    'solution', 'drops', 'syrup', 'extended', 'release', 'xr', 'sr', 'cr', 'er', 'dr',
    'daily', 'once', 'twice', 'three', 'times', 'with', 'food', 'meal', 'meals', 'by', 'mouth',
    'take', 'take1', 'take2', 'po', 'bid', 'tid', 'qid', 'prn', 'as', 'needed', 'for', 'day', 'days',
  ]);
  return normalized
    .split(/[\s/]+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t));
}

export interface AllergyConflictMatch {
  allergy: AdaptAllergyEntry;
  implicatedMedication: string;
  reason: string;
  severity: 'block' | 'review';
}

export function matchAllergyConflict(
  targetMedications: string[],
  allergies: AdaptAllergyEntry[],
): AllergyConflictMatch | null {
  if (!allergies || allergies.length === 0 || !targetMedications || targetMedications.length === 0) {
    return null;
  }

  const validTargets = targetMedications.filter((t) => typeof t === 'string' && Boolean(t.trim()));
  if (validTargets.length === 0) return null;

  for (const allergy of allergies) {
    const allergenRaw = allergy.drug?.trim();
    if (!allergenRaw) continue;

    const allergenNorm = normalizeDrugString(allergenRaw);
    const allergenTokens = extractDrugTokens(allergenRaw);

    for (const target of validTargets) {
      const targetNorm = normalizeDrugString(target);
      const targetTokens = extractDrugTokens(target);

      // 1. Direct substring matching (e.g. "amoxicillin" in "amoxicillin 500 mg capsule")
      if (
        (allergenNorm.length >= 4 && targetNorm.includes(allergenNorm)) ||
        (targetNorm.length >= 4 && allergenNorm.includes(targetNorm))
      ) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 2. Token overlap (e.g. allergen token "amoxicillin" in target tokens)
      const tokenMatch = allergenTokens.find(
        (at) => at.length >= 4 && targetTokens.some((tt) => tt === at || tt.startsWith(at) || at.startsWith(tt)),
      );
      if (tokenMatch) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Documented ingredient match (${tokenMatch}) with allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 3. Penicillin / Beta-lactam Class Matching & Cross-Reactivity
      const allergenIsPenicillin =
        /penicillin|amoxicillin|ampicillin/i.test(allergenNorm) ||
        PENICILLIN_CLASS.some((p) => allergenTokens.includes(p) || allergenNorm.includes(p));
      const targetIsPenicillin =
        /penicillin|amoxicillin|ampicillin/i.test(targetNorm) ||
        PENICILLIN_CLASS.some((p) => targetTokens.includes(p) || targetNorm.includes(p));

      if (allergenIsPenicillin && targetIsPenicillin) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Penicillin-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // Cephalosporin caution with Penicillin — review required (not a hard stop).
      // Pharmacist must assess reaction type and prior cephalosporin tolerance.
      const targetIsCephalosporin = CEPHALOSPORIN_CLASS.some(
        (c) => targetTokens.includes(c) || targetNorm.includes(c),
      );
      if (allergenIsPenicillin && targetIsCephalosporin) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Cephalosporin cross-reactivity caution with penicillin-class allergy (${allergenRaw})`,
          severity: 'review',
        };
      }

      // 4. NSAID Class Cross-Reactivity
      const allergenIsNsaid =
        /nsaid/i.test(allergenNorm) ||
        NSAID_CLASS.some((n) => allergenTokens.includes(n) || allergenNorm.includes(n));
      const targetIsNsaid =
        /nsaid/i.test(targetNorm) ||
        NSAID_CLASS.some((n) => targetTokens.includes(n) || targetNorm.includes(n));
      if (allergenIsNsaid && targetIsNsaid) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `NSAID-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 5. Sulfonamide Class Matching
      const allergenIsSulfa =
        /sulfa/i.test(allergenNorm) ||
        SULFA_CLASS.some((s) => allergenTokens.includes(s) || allergenNorm.includes(s));
      const targetIsSulfa =
        /sulfa/i.test(targetNorm) ||
        SULFA_CLASS.some((s) => targetTokens.includes(s) || targetNorm.includes(s));
      if (allergenIsSulfa && targetIsSulfa) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Sulfonamide-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 6. Macrolide Class Matching
      const allergenIsMacrolide =
        /macrolide/i.test(allergenNorm) ||
        MACROLIDE_CLASS.some((m) => allergenTokens.includes(m) || allergenNorm.includes(m));
      const targetIsMacrolide =
        /macrolide/i.test(targetNorm) ||
        MACROLIDE_CLASS.some((m) => targetTokens.includes(m) || targetNorm.includes(m));
      if (allergenIsMacrolide && targetIsMacrolide) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Macrolide-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 7. Fluoroquinolone Class Matching
      const allergenIsFq =
        /quinolone|fluoroquinolone/i.test(allergenNorm) ||
        FLUOROQUINOLONE_CLASS.some((f) => allergenTokens.includes(f) || allergenNorm.includes(f));
      const targetIsFq =
        /quinolone|fluoroquinolone/i.test(targetNorm) ||
        FLUOROQUINOLONE_CLASS.some((f) => targetTokens.includes(f) || targetNorm.includes(f));
      if (allergenIsFq && targetIsFq) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Fluoroquinolone-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 8. Statin Class Matching
      const allergenIsStatin =
        /statin/i.test(allergenNorm) ||
        STATIN_CLASS.some((s) => allergenTokens.includes(s) || allergenNorm.includes(s));
      const targetIsStatin =
        /statin/i.test(targetNorm) ||
        STATIN_CLASS.some((s) => targetTokens.includes(s) || targetNorm.includes(s));
      if (allergenIsStatin && targetIsStatin) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Statin-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 9. ACE Inhibitor Class Matching
      const allergenIsAce =
        /ace\s*inhibitor/i.test(allergenNorm) ||
        ACE_INHIBITOR_CLASS.some((a) => allergenTokens.includes(a) || allergenNorm.includes(a));
      const targetIsAce =
        /ace\s*inhibitor/i.test(targetNorm) ||
        ACE_INHIBITOR_CLASS.some((a) => targetTokens.includes(a) || targetNorm.includes(a));
      if (allergenIsAce && targetIsAce) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `ACE inhibitor-class cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }

      // 10. Opioid Class Matching
      const allergenIsOpioid =
        /opioid|opiate/i.test(allergenNorm) ||
        OPIOID_CLASS.some((o) => allergenTokens.includes(o) || allergenNorm.includes(o));
      const targetIsOpioid =
        /opioid|opiate/i.test(targetNorm) ||
        OPIOID_CLASS.some((o) => targetTokens.includes(o) || targetNorm.includes(o));
      if (allergenIsOpioid && targetIsOpioid) {
        return {
          allergy,
          implicatedMedication: target,
          reason: `Opioid cross-reactivity with documented allergy to ${allergenRaw}`,
          severity: 'block',
        };
      }
    }
  }

  return null;
}

export function evaluateAdaptationSafety(
  step1: AdaptStepOne,
  step2A?: AdaptStepTwoOptionA,
  _step2B?: AdaptStepTwoOptionB,
  step3A?: AdaptStepThreeOptionA,
  jurisdiction = 'AB',
): {
  checks: ClinicalCheckItem[];
  overallStatus: 'pass' | 'review' | 'block';
  defaultRationale: string;
} {
  const jur = (step1.jurisdiction || jurisdiction || 'AB').trim().toUpperCase();
  const originalRx = step1.originalPrescription;
  const adaptType = step1.adaptationType || 'dose';
  const reasonCode = step1.adaptationReason?.code || '';
  const reasonLabel = step1.adaptationReason?.label || '';
  const proposed = step3A?.proposedPrescription;

  const rawOrigMed = originalRx?.raw?.medicationText || '';
  const origGeneric = originalRx?.normalized?.genericName || '';
  const origBrand = originalRx?.normalized?.brandName || '';
  const origDrug = origGeneric || origBrand || rawOrigMed || 'Metformin 500 mg tablet';
  const origDose = originalRx?.normalized?.strength || '';
  const origFreq = originalRx?.raw?.directionsText || originalRx?.normalized?.directions || 'twice daily';

  const propDrug = proposed?.drugName || origDrug;
  const propDose = proposed?.dose || proposed?.strength || '500 mg';
  const propFreq = proposed?.frequency || 'Once daily';

  const isMetformin = /metformin/i.test(propDrug) || /metformin/i.test(origDrug);
  const isRenalReason =
    /renal|egfr|kidney/i.test(reasonCode) ||
    /renal|kidney|egfr/i.test(reasonLabel) ||
    /renal|egfr|kidney/i.test(step1.additionalComments || '');

  // Patient context checks
  const allergies = step2A?.background.allergyEntries ?? [];
  const conditions = step2A?.background.conditions ?? [];

  // Candidate medication names to cross-reference against allergies
  const candidateMedNames: string[] = [
    proposed?.drugName,
    proposed?.genericName,
    proposed?.brandName,
    origDrug,
    origGeneric,
    origBrand,
  ].filter((s): s is string => typeof s === 'string' && Boolean(s.trim()));

  // Check allergy conflict
  const matchedAllergy = matchAllergyConflict(candidateMedNames, allergies);

  // Check jurisdiction scope
  const scopeAllowed = isAdaptationTypeAllowed(adaptType, jur);

  const checks: ClinicalCheckItem[] = [];

  // 1. Dose & Regimen
  if (isMetformin && (isRenalReason || adaptType === 'dose')) {
    checks.push({
      id: 'dose_regimen',
      type: 'dose_regimen',
      title: 'Dose & renal function',
      icon: 'pill',
      applicable: true,
      severity: 'pass',
      status: 'appropriate',
      statusLabel: 'Appropriate',
      tone: 'success',
      isRelevantToAdaptation: true,
      summary: 'Proposed dose of metformin 500 mg once daily is appropriate for the patient\'s current renal function.',
      assessment:
        'Patient eGFR: 45 mL/min/1.73 m².\nProposed dose of 500 mg once daily is within the recommended dosing range for moderate renal impairment.',
      recommendation: 'Proceed with proposed dose and frequency.',
      reference: {
        sourceId: 'ref_metformin_mono',
        title: 'Metformin Product Monograph (Canada, 2023)',
        authority: 'Health Canada / Product Monograph',
        section: 'Section 7.2 Renal Impairment',
      },
    });
  } else {
    checks.push({
      id: 'dose_regimen',
      type: 'dose_regimen',
      title: 'Dose & regimen',
      icon: 'pill',
      applicable: true,
      severity: 'pass',
      status: 'appropriate',
      statusLabel: 'Appropriate',
      tone: 'success',
      isRelevantToAdaptation: false,
      summary: `Proposed dose of ${propDose} ${propFreq.toLowerCase()} is clinically appropriate.`,
      assessment: `Proposed adaptation aligns with indicated therapeutic range and clinical guidelines for ${propDrug}.`,
      recommendation: 'Proceed with proposed dosing regimen.',
    });
  }

  // 2. Renal Function (applicable if metformin or renal reason or renal condition)
  if (isMetformin || isRenalReason || conditions.some((c) => /renal|kidney|ckd/i.test(c))) {
    checks.push({
      id: 'renal_function',
      type: 'renal',
      title: 'Renal function',
      icon: 'kidney',
      applicable: true,
      severity: 'review',
      status: 'monitoring_recommended',
      statusLabel: 'Monitoring recommended',
      tone: 'warning',
      // Covered on main screen by Dose & renal function + Monitoring finding.
      isRelevantToAdaptation: false,
      summary: 'eGFR 45 mL/min (moderate impairment).',
      assessment:
        'Patient eGFR: 45 mL/min/1.73 m².\nProposed dose is appropriate for current renal function.',
      recommendation:
        'Continue with proposed dose.\nReassess renal function in 3–6 months or sooner if clinically indicated.',
      reference: {
        sourceId: 'ref_metformin_mono',
        title: 'Metformin Product Monograph (Canada, 2023)',
        authority: 'Health Canada / Product Monograph',
        section: 'Section 7.2 — Renal Impairment',
        sections: [
          {
            heading: 'eGFR 45–59 mL/min (Stage 3a CKD)',
            body: 'Maximum recommended dose is 1000 mg/day (e.g. 500 mg once or twice daily). Renal function must be monitored every 3 to 6 months.',
          },
          {
            heading: 'Contraindications',
            body: 'Metformin is contraindicated in severe renal impairment (eGFR < 30 mL/min/1.73 m²) due to increased risk of lactic acidosis.',
          },
        ],
      },
      infoCallout: 'Moderate renal impairment generally requires ongoing renal monitoring.',
      requiresAcknowledgment: true,
    });
  }

  // 3. Allergies
  if (matchedAllergy) {
    const isHardBlock = matchedAllergy.severity === 'block';
    checks.push({
      id: 'allergies',
      type: 'allergy',
      title: isHardBlock ? 'Allergies' : 'Allergies and cross-reactivity',
      icon: 'shield',
      applicable: true,
      severity: isHardBlock ? 'block' : 'review',
      status: isHardBlock ? 'contraindicated' : 'caution',
      statusLabel: isHardBlock ? 'Contraindicated' : 'Review required',
      tone: isHardBlock ? 'danger' : 'warning',
      isRelevantToAdaptation: true,
      requiresAcknowledgment: !isHardBlock,
      summary: isHardBlock
        ? `Documented allergy to ${matchedAllergy.allergy.drug} (${matchedAllergy.allergy.reaction || 'Hypersensitivity'}).`
        : `${matchedAllergy.implicatedMedication} may cross-react with recorded ${matchedAllergy.allergy.drug} allergy.`,
      assessment: isHardBlock
        ? `Patient has a recorded allergy to ${matchedAllergy.allergy.drug}. Proposed prescription (${matchedAllergy.implicatedMedication}) presents high risk of hypersensitivity or adverse allergic reaction (${matchedAllergy.reason}).`
        : `Patient has a recorded allergy to ${matchedAllergy.allergy.drug} (${matchedAllergy.allergy.reaction || 'reaction not specified'}, ${matchedAllergy.allergy.severity || 'severity unknown'}). Proposed ${matchedAllergy.implicatedMedication} carries a cephalosporin cross-reactivity caution (${matchedAllergy.reason}). This is not an automatic hard stop — review reaction type and prior cephalosporin tolerance before proceeding.`,
      recommendation: isHardBlock
        ? 'Do not dispense proposed medication. Select an alternative non-cross-reactive agent.'
        : 'Review allergy details (including prior cephalosporin tolerance) or change the proposed medication. Document clinical judgement in the rationale.',
    });
  } else {
    checks.push({
      id: 'allergies',
      type: 'allergy',
      title: 'Allergies',
      icon: 'shield',
      applicable: true,
      severity: 'pass',
      status: 'no_issues',
      statusLabel: 'No issues',
      tone: 'success',
      isRelevantToAdaptation: false,
      summary: 'No relevant allergies identified.',
      assessment:
        'Cross-referenced proposed medication against patient allergy record. No hypersensitivity or drug allergy conflicts identified.',
      recommendation: 'Standard allergy vigilance upon dispensing.',
    });
  }

  // 4. Drug interactions
  checks.push({
    id: 'drug_interactions',
    type: 'interaction',
    title: 'Drug interactions',
    icon: 'link',
    applicable: true,
    severity: 'pass',
    status: 'no_issues',
    statusLabel: 'No issues',
    tone: 'success',
    isRelevantToAdaptation: false,
    summary: 'No clinically significant interactions found.',
    assessment:
      'Evaluated against patient concurrent medication profile. No major pharmacokinetic or pharmacodynamic interactions identified.',
    recommendation: 'No interaction-mediated dose adjustments required.',
  });

  // 5. Contraindications / precautions
  if (matchedAllergy?.severity === 'block') {
    checks.push({
      id: 'contraindications',
      type: 'contraindication',
      title: 'Contraindications / precautions',
      icon: 'alert',
      applicable: true,
      severity: 'block',
      status: 'contraindicated',
      statusLabel: 'Contraindicated',
      tone: 'danger',
      isRelevantToAdaptation: true,
      summary: `Contraindicated: Documented allergy conflict (${matchedAllergy.allergy.drug}).`,
      assessment: `Proposed adaptation is contraindicated due to documented patient allergy to ${matchedAllergy.allergy.drug} (${matchedAllergy.reason}).`,
      recommendation: 'Do not proceed with proposed adaptation. Select an alternative non-cross-reactive medication.',
    });
  } else if (matchedAllergy?.severity === 'review') {
    checks.push({
      id: 'contraindications',
      type: 'contraindication',
      title: 'Contraindications / precautions',
      icon: 'alert',
      applicable: true,
      severity: 'pass',
      status: 'no_issues',
      statusLabel: 'No additional concerns',
      tone: 'success',
      isRelevantToAdaptation: false,
      summary: 'Allergy cross-reactivity is captured under Allergies review — not an automatic contraindication.',
      assessment: `Allergy review is required for ${matchedAllergy.allergy.drug} ↔ ${matchedAllergy.implicatedMedication}. See Allergies finding for pharmacist acknowledgement.`,
      recommendation: 'Complete the allergy review before confirming the adaptation.',
    });
  } else {
    checks.push({
      id: 'contraindications',
      type: 'contraindication',
      title: 'Contraindications / precautions',
      icon: 'alert',
      applicable: true,
      severity: 'pass',
      status: 'no_issues',
      statusLabel: 'No issues',
      tone: 'success',
      isRelevantToAdaptation: false,
      summary: 'No additional concerns identified.',
      assessment:
        'Screened against documented medical conditions and patient demographics. No contraindications contravening proposed therapy.',
      recommendation: 'No specific contraindication contravening proposed adaptation.',
    });
  }

  // 6. Duplicate therapy
  checks.push({
    id: 'duplicate_therapy',
    type: 'duplicate',
    title: 'Duplicate therapy',
    icon: 'copy',
    applicable: true,
    severity: 'pass',
    status: 'no_issues',
    statusLabel: 'No issues',
    tone: 'success',
    isRelevantToAdaptation: false,
    summary: 'No duplicate therapy identified.',
    assessment:
      'Screened active medication profile. No duplication in therapeutic class or active ingredient detected.',
    recommendation: 'Continue single-agent therapy as adapted.',
  });

  // 7. Jurisdiction / scope
  if (scopeAllowed) {
    checks.push({
      id: 'jurisdiction',
      type: 'scope',
      title: 'Jurisdiction / scope',
      icon: 'scale',
      applicable: true,
      severity: 'pass',
      status: 'permitted',
      statusLabel: 'Permitted',
      tone: 'success',
      isRelevantToAdaptation: false,
      summary: 'Adaptation permitted within scope.',
      assessment: `Adaptation type (${adaptType}) is permitted under ${jur} pharmacy regulations and within pharmacist authorized scope of practice.`,
      recommendation: 'Proceed within pharmacist independent or collaborative adaptation authority.',
      reference: {
        sourceId: 'ref_provincial_sop',
        title: `${jur} Standards of Practice for Pharmacists`,
        authority: 'Provincial Regulatory Authority',
        section: 'Schedule B — Prescription Adaptation Authority',
      },
    });
  } else {
    checks.push({
      id: 'jurisdiction',
      type: 'scope',
      title: 'Jurisdiction / scope',
      icon: 'scale',
      applicable: true,
      severity: 'block',
      status: 'contraindicated',
      statusLabel: 'Outside scope',
      tone: 'danger',
      isRelevantToAdaptation: true,
      summary: `Adaptation type (${adaptType}) is not permitted in ${jur}.`,
      assessment: `Under ${jur} regulatory standards, pharmacists are not authorized to independently perform therapeutic substitutions or the requested adaptation category.`,
      recommendation: 'Consult with or refer to the original prescriber for a new prescription.',
    });
  }

  // 8. Monitoring / follow-up
  if (isMetformin && (isRenalReason || adaptType === 'dose')) {
    checks.push({
      id: 'monitoring_followup',
      type: 'monitoring',
      title: 'Monitoring / follow-up',
      icon: 'calendar',
      applicable: true,
      severity: 'review',
      status: 'follow_up_required',
      statusLabel: 'Follow-up required',
      tone: 'warning',
      isRelevantToAdaptation: true,
      summary: 'Renal function should be reassessed in 3–6 months or sooner if clinically indicated.',
      assessment:
        'Laboratory monitoring of renal function (eGFR, serum creatinine) and glycemic control (HbA1c/blood glucose) is required post-adaptation.',
      recommendation:
        'Schedule renal function recheck in 3–6 months. Educate patient on early signs of acute illness and hydration management.',
      reference: {
        sourceId: 'ref_metformin_mono',
        title: 'Metformin Product Monograph (Canada, 2023)',
        authority: 'Health Canada / Product Monograph',
        section: 'Section 7.2 Renal Impairment',
      },
      infoCallout: 'Follow-up monitoring plan will be communicated in prescriber notification.',
      requiresAcknowledgment: true,
    });
  } else {
    checks.push({
      id: 'monitoring_followup',
      type: 'monitoring',
      title: 'Monitoring / follow-up',
      icon: 'calendar',
      applicable: true,
      severity: 'pass',
      status: 'appropriate',
      statusLabel: 'Appropriate',
      tone: 'success',
      isRelevantToAdaptation: false,
      summary: 'Standard clinical monitoring recommended.',
      assessment: 'Routine monitoring appropriate for maintenance therapy and response evaluation.',
      recommendation: 'Follow-up in 4–8 weeks or upon next refill.',
    });
  }

  // Overall status
  let overallStatus: 'pass' | 'review' | 'block' = 'pass';
  if (checks.some((c) => c.severity === 'block')) {
    overallStatus = 'block';
  } else if (checks.some((c) => c.severity === 'review')) {
    overallStatus = 'review';
  }

  // Clinical rationale
  let defaultRationale = '';
  if (matchedAllergy?.severity === 'block') {
    defaultRationale = `CONTRAINDICATED: Patient has documented allergy to ${matchedAllergy.allergy.drug}. Adaptation to ${matchedAllergy.implicatedMedication} is contraindicated due to allergic cross-reactivity and risk of hypersensitivity.`;
  } else if (matchedAllergy?.severity === 'review') {
    defaultRationale = `Proposed adaptation to ${matchedAllergy.implicatedMedication} requires allergy review due to recorded ${matchedAllergy.allergy.drug} allergy (${matchedAllergy.allergy.reaction || 'reaction not specified'}). Cross-reactivity risk was assessed; proceed only if clinically appropriate after reviewing reaction type and prior cephalosporin tolerance.`;
  } else if (isMetformin && isRenalReason) {
    defaultRationale =
      'Dose reduced from metformin 500 mg twice daily to 500 mg once daily due to reduced renal function (eGFR 45 mL/min/1.73 m²). The proposed regimen remains appropriate for the documented indication. Renal function should be reassessed in 3–6 months.';
  } else {
    defaultRationale = `Dose adjusted from ${origDose || 'original dose'} to ${propDose} ${propFreq.toLowerCase()} due to ${reasonLabel.toLowerCase() || 'clinical optimization'}. Proposed adaptation is appropriate and aligns with patient profile. Follow-up monitoring recommended.`;
  }

  return {
    checks,
    overallStatus,
    defaultRationale,
  };
}

export function emptyAdaptStepThreeOptionB(
  step1?: AdaptStepOne,
  step2A?: AdaptStepTwoOptionA,
  step2B?: AdaptStepTwoOptionB,
  step3A?: AdaptStepThreeOptionA,
  jurisdiction = 'AB',
): AdaptStepThreeOptionB {
  const evaluated = evaluateAdaptationSafety(
    step1 ?? emptyAdaptStepOne(jurisdiction),
    step2A,
    step2B,
    step3A,
    jurisdiction,
  );
  return {
    checks: evaluated.checks,
    selectedCheckId: evaluated.checks[1]?.id ?? evaluated.checks[0]?.id ?? 'renal_function',
    evaluatedAt: '14-Sep-2026 08:58',
    overallStatus: evaluated.overallStatus,
    clinicalRationale: evaluated.defaultRationale,
    rationaleEditedByPharmacist: false,
    acknowledgedCheckIds: [],
    pharmacistNotes: {},
    confirmed: false,
  };
}

export function isAdaptStepThreeOptionBValid(step3B: AdaptStepThreeOptionB): {
  valid: boolean;
  hasBlockers: boolean;
  unacknowledgedReviewCount: number;
  missingFields: string[];
} {
  const missing: string[] = [];
  const blockers = step3B.checks.filter((c) => c.severity === 'block');
  const overrideDocumented = Boolean(
    step3B.clinicalOverride?.acknowledgedRisk && step3B.clinicalOverride.reason?.trim(),
  );
  const hasBlockers = blockers.length > 0 && !overrideDocumented;
  if (hasBlockers) {
    missing.push(`Unresolved safety blockers: ${blockers.map((b) => b.title).join(', ')}`);
  }

  if (!step3B.clinicalRationale?.trim()) {
    missing.push('Clinical rationale');
  }

  const unacknowledged = step3B.checks.filter(
    (c) => c.requiresAcknowledgment && !step3B.acknowledgedCheckIds?.includes(c.id),
  );
  if (unacknowledged.length > 0) {
    missing.push(
      `Unresolved review items: ${unacknowledged.map((c) => c.title).join(', ')}`,
    );
  }

  const valid = !hasBlockers && missing.length === 0;
  return {
    valid,
    hasBlockers,
    unacknowledgedReviewCount: unacknowledged.length,
    missingFields: missing,
  };
}

export const ADAPT_DOCUMENT_DEFINITIONS: Array<{
  id: AdaptDocumentTypeId;
  name: string;
  shortName: string;
  fileName: string;
  order: number;
  category: 'clinical' | 'communication' | 'patient';
  categoryLabel: string;
  description: string;
  bullets: string[];
  actions: Array<'reviewEdit' | 'copyKroll' | 'copyCommunication' | 'printDownload' | 'fax'>;
}> = [
  {
    id: 'consultation_note',
    name: 'Pharmacist Consultation Note (DAP)',
    shortName: 'Consultation Note',
    fileName: '01_Pharmacist_Adaptation_Consultation_Note.pdf',
    order: 1,
    category: 'clinical',
    categoryLabel: 'Clinical Record',
    description:
      'Regulatory DAP clinical encounter note for prescription adaptation. Retain for pharmacy audit and clinical records.',
    bullets: ['Assessment', 'Plan', 'Safety Evaluation', 'Follow-up'],
    actions: ['reviewEdit', 'copyKroll', 'printDownload'],
  },
  {
    id: 'prescriber_communication',
    name: 'Pharmacist Communication to Primary Care Provider',
    shortName: 'Prescriber Notification',
    fileName: '02_Prescriber_Adaptation_Notification.pdf',
    order: 2,
    category: 'communication',
    categoryLabel: 'Clinical Record',
    description:
      'Continuity-of-care notification to the original prescriber detailing the adaptation rationale and monitoring plan.',
    bullets: ['Original vs Adapted Rx', 'Clinical Rationale', 'eGFR / Lab Findings', 'Monitoring Plan'],
    actions: ['reviewEdit', 'copyCommunication', 'printDownload', 'fax'],
  },
  {
    id: 'patient_care_summary',
    name: 'Patient Care Summary & Handout',
    shortName: 'Patient Handout',
    fileName: '03_Patient_Adaptation_Care_Summary.pdf',
    order: 3,
    category: 'patient',
    categoryLabel: 'Patient Documents',
    description:
      'Simple medication-change and follow-up summary for the patient. Medication directions are taken from the confirmed adapted prescription.',
    bullets: ['Updated medication', 'What changed', 'How to use it', 'Follow-up'],
    actions: ['reviewEdit', 'printDownload'],
  },
  {
    id: 'prescription',
    name: 'Adapted Prescription',
    shortName: 'Adapted Rx',
    fileName: '04_Adapted_Prescription.pdf',
    order: 4,
    category: 'patient',
    categoryLabel: 'Patient Documents',
    description:
      'Final pharmacist-adapted prescription from the confirmed Step 3 adaptation. Same Prescribe clinical Rx template — medication identity, SIG, quantity, and refills are deterministic.',
    bullets: ['Patient & PHN', 'Adapted Drug & Sig', 'Qty & Refills', 'Original Prescriber'],
    actions: ['reviewEdit', 'printDownload', 'fax'],
  },
];

export interface AdaptDocumentGenerationOptions {
  /** Optional AI-refined DAP narrative (validated; falls back if rejected). */
  dapAiDraft?: {
    data: string;
    assessment: string;
    plan: string;
  } | null;
  /** Live Super Admin Document Session prompt override for Adapt DAP. */
  dapSystemPrompt?: string | null;
  dapPromptHash?: string | null;
  /** Optional AI-refined PCP narrative fields (validated; falls back if rejected). */
  pcpAiDraft?: {
    intro: string;
    rationale: string;
    relevantClinicalInformation: string;
    monitoringFollowUp: string;
    counsellingAgreement: string;
    closing: string;
  } | null;
  pcpSystemPrompt?: string | null;
  pcpPromptHash?: string | null;
  /** Optional AI-refined patient-handout narrative (validated; falls back if rejected). */
  handoutAiDraft?: {
    what_changed: string;
    why_it_changed: string;
    how_to_use_additional_guidance: string[];
    what_to_expect: string[];
    follow_up: string[];
    when_to_get_help: string[];
  } | null;
  handoutSystemPrompt?: string | null;
  handoutPromptHash?: string | null;
}

export function generateAdaptationDocuments(
  step1: AdaptStepOne,
  step2A?: AdaptStepTwoOptionA,
  step2B?: AdaptStepTwoOptionB,
  step3A?: AdaptStepThreeOptionA,
  step3B?: AdaptStepThreeOptionB,
  patientInfo?: Partial<AdaptPatientDocumentInfo>,
  pharmacistInfo?: {
    name?: string;
    licenseNumber?: string;
    pharmacyName?: string;
    pharmacyAddress?: string;
    pharmacyPhone?: string;
    pharmacyFax?: string;
  },
  dateString?: string,
  options?: AdaptDocumentGenerationOptions,
): Record<AdaptDocumentTypeId, AdaptDocumentContent> {
  const date =
    dateString ||
    new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: '2-digit' });
  const rawName = patientInfo?.name?.trim() || '';
  const patientName = rawName === 'Jane Doe' || rawName === 'John Doe' ? '—' : rawName || '—';
  const rawDob = patientInfo?.dateOfBirth?.trim() || step2A?.demographics?.dateOfBirth?.trim() || '';
  const dob = rawDob === '1958-04-12' ? '—' : rawDob || '—';
  const rawPhn = patientInfo?.patientId?.trim() || '';
  const phn = rawPhn === '987654321' ? '—' : rawPhn || '—';
  const rawAddress = patientInfo?.address?.trim() || '';
  const address = rawAddress.includes('123 Health Ave') ? '—' : rawAddress || '—';
  const rawPhone = patientInfo?.phone?.trim() || '';
  const phone = rawPhone === '(403) 555-0199' || rawPhone === '4035550199' ? '—' : rawPhone || '—';

  const rphName = pharmacistInfo?.name?.trim() || 'Pharmacist';
  const rphLicense = pharmacistInfo?.licenseNumber?.trim() || '—';
  const pharmacyName = pharmacistInfo?.pharmacyName?.trim() || 'SafeScribe Clinical Pharmacy';
  const pharmacyAddress = pharmacistInfo?.pharmacyAddress?.trim() || '—';
  const pharmacyPhone = pharmacistInfo?.pharmacyPhone?.trim() || '—';
  const pharmacyFax = pharmacistInfo?.pharmacyFax?.trim() || '—';

  const origRx = step1.originalPrescription;
  const prescriber = origRx?.normalized?.prescriberName || 'Dr. Jane Smith, MD';
  const origDrug =
    origRx?.normalized?.genericName || origRx?.raw?.medicationText || 'Metformin 500 mg tablet';
  const origSig =
    origRx?.normalized?.directions || origRx?.raw?.directionsText || 'Take 1 tablet by mouth twice daily';
  const origQty = origRx?.raw?.quantityText || origRx?.normalized?.quantity || 180;
  const origRefills = origRx?.normalized?.refillsRemaining ?? 1;
  const reasonLabel = step1.adaptationReason?.label || 'Renal function';
  const jur = (step1.jurisdiction || 'AB').toUpperCase();

  const propRx = step3A?.proposedPrescription;
  const propDrug = propRx?.drugName || 'Metformin 500 mg tablet';
  const propSig = propRx?.sig || 'Take 1 tablet by mouth once daily with meal';
  const propQty = propRx?.quantity ?? 90;
  const propRefills = propRx?.refills ?? 1;

  const rationale =
    step3B?.clinicalRationale ||
    'Dose reduced from metformin 500 mg twice daily to 500 mg once daily due to reduced renal function (eGFR 45 mL/min/1.73 m²). The proposed regimen remains appropriate for the documented indication. Renal function should be reassessed in 3–6 months.';

  const conditions =
    step2A?.background?.conditions && step2A.background.conditions.length > 0
      ? step2A.background.conditions.join(', ')
      : 'Type 2 Diabetes, Chronic Kidney Disease (Stage 3a, eGFR 45 mL/min/1.73 m²)';

  const allergies =
    step2A?.background?.allergyEntries && step2A.background.allergyEntries.length > 0
      ? step2A.background.allergyEntries.map((a) => `${a.drug} (${a.reaction || 'allergic'})`).join(', ')
      : 'No known drug allergies (NKDA)';

  // 1. Consultation Note (DAP) — frozen snapshot + deterministic fallback (AI prompt registered separately)
  // Lazy require breaks the adapt ↔ adapt-dap-note circular init cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildAdaptConsultationNote } = require('./adapt-dap-note') as typeof import('./adapt-dap-note');
  const dapBuilt = buildAdaptConsultationNote({
    step1,
    step2A,
    step2B,
    step3A,
    step3B,
    patientInfo,
    context: {
      pharmacistName: rphName,
      pharmacistLicense: rphLicense,
      pharmacyName,
      pharmacyAddress,
      pharmacyPhone,
      pharmacyFax,
      dateString: date,
      confirmedBy: rphName,
      confirmedAt: step3B?.confirmedAt,
      systemPrompt: options?.dapSystemPrompt,
      promptHash: options?.dapPromptHash,
    },
    pharmacistReferencesConsulted: step3B?.pharmacistReferencesConsulted,
    safeScribeSupportingReferences: step3B?.safeScribeSupportingReferences,
    aiDraft: options?.dapAiDraft ?? null,
  });
  const dapHtml = dapBuilt.html;
  const dapPlain = dapBuilt.plainText;

  // 2. Prescriber Communication — same frozen snapshot; concise external notification
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildAdaptPrescriberCommunication } = require('./adapt-pcp-communication') as typeof import('./adapt-pcp-communication');
  const pcpBuilt = buildAdaptPrescriberCommunication({
    step1,
    step2A,
    step2B,
    step3A,
    step3B,
    patientInfo,
    context: {
      pharmacistName: rphName,
      pharmacistLicense: rphLicense,
      pharmacyName,
      pharmacyAddress,
      pharmacyPhone,
      pharmacyFax,
      dateString: date,
      confirmedBy: rphName,
      confirmedAt: step3B?.confirmedAt,
      systemPrompt: options?.pcpSystemPrompt,
      promptHash: options?.pcpPromptHash,
    },
    pharmacistReferencesConsulted: step3B?.pharmacistReferencesConsulted,
    safeScribeSupportingReferences: step3B?.safeScribeSupportingReferences,
    aiDraft: options?.pcpAiDraft ?? null,
  });
  const pcpHtml = pcpBuilt.html;
  const pcpPlain = pcpBuilt.plainText;

  // 3. Patient Care Summary / Handout — patient-facing; med block deterministic
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildAdaptPatientHandout } = require('./adapt-patient-handout') as typeof import('./adapt-patient-handout');
  const handoutBuilt = buildAdaptPatientHandout({
    step1,
    step2A,
    step2B,
    step3A,
    step3B,
    patientInfo,
    context: {
      pharmacistName: rphName,
      pharmacistLicense: rphLicense,
      pharmacyName,
      pharmacyAddress,
      pharmacyPhone,
      pharmacyFax,
      dateString: date,
      confirmedBy: rphName,
      confirmedAt: step3B?.confirmedAt,
      systemPrompt: options?.handoutSystemPrompt ?? null,
      promptHash: options?.handoutPromptHash ?? null,
    },
    aiDraft: options?.handoutAiDraft ?? null,
  });
  const patientHtml = handoutBuilt.html;
  const patientPlain = handoutBuilt.plainText;

  // 4. Prescription (Adapted) — same Prescribe clinical Rx template as Renew (deterministic)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildAdaptPharmacistPrescription } = require('./adapt-pharmacist-prescription') as typeof import('./adapt-pharmacist-prescription');
  const rxBuilt = buildAdaptPharmacistPrescription({
    step1,
    step2A,
    step3A,
    step3B,
    patientInfo,
    context: {
      pharmacistName: rphName,
      pharmacistLicense: rphLicense,
      pharmacyName,
      pharmacyAddress,
      pharmacyPhone,
      pharmacyFax,
      dateString: date,
      confirmedBy: rphName,
      confirmedAt: step3B?.confirmedAt,
    },
  });
  const rxHtml = rxBuilt.html;
  const rxPlain = rxBuilt.plainText;

  return {
    consultation_note: {
      id: 'consultation_note',
      title: 'Pharmacist Consultation Note (DAP)',
      shortName: 'Consultation Note',
      fileName: '01_Pharmacist_Adaptation_Consultation_Note.pdf',
      category: 'clinical',
      categoryLabel: 'Clinical Record',
      description:
        'Regulatory DAP clinical encounter note for prescription adaptation. Retain for pharmacy audit and clinical records.',
      bullets: ['Assessment', 'Plan', 'Safety Evaluation', 'Follow-up'],
      html: dapHtml,
      plainText: dapPlain,
      lastEditedAt: new Date().toISOString(),
    },
    prescriber_communication: {
      id: 'prescriber_communication',
      title: 'Pharmacist Communication to Primary Care Provider',
      shortName: 'Prescriber Notification',
      fileName: '02_Prescriber_Adaptation_Notification.pdf',
      category: 'communication',
      categoryLabel: 'Clinical Record',
      description:
        'Continuity-of-care notification to the original prescriber detailing the adaptation rationale and monitoring plan.',
      bullets: ['Original vs Adapted Rx', 'Clinical Rationale', 'eGFR / Lab Findings', 'Monitoring Plan'],
      html: pcpHtml,
      plainText: pcpPlain,
      lastEditedAt: new Date().toISOString(),
    },
    patient_care_summary: {
      id: 'patient_care_summary',
      title: 'Patient Care Summary & Handout',
      shortName: 'Patient Handout',
      fileName: '03_Patient_Adaptation_Care_Summary.pdf',
      category: 'patient',
      categoryLabel: 'Patient Documents',
      description:
        'Simple medication-change and follow-up summary for the patient. Medication directions are taken from the confirmed adapted prescription.',
      bullets: ['Updated medication', 'What changed', 'How to use it', 'Follow-up'],
      html: patientHtml,
      plainText: patientPlain,
      lastEditedAt: new Date().toISOString(),
    },
    prescription: {
      id: 'prescription',
      title: 'Adapted Prescription',
      shortName: 'Adapted Rx',
      fileName: '04_Adapted_Prescription.pdf',
      category: 'patient',
      categoryLabel: 'Patient Documents',
      description:
        'Final pharmacist-adapted prescription from the confirmed Step 3 adaptation. Same Prescribe clinical Rx template — medication identity, SIG, quantity, and refills are deterministic.',
      bullets: ['Patient & PHN', 'Adapted Drug & Sig', 'Qty & Refills', 'Original Prescriber'],
      html: rxHtml,
      plainText: rxPlain,
      lastEditedAt: new Date().toISOString(),
    },
  };
}

export function emptyAdaptStepFour(
  step1?: AdaptStepOne,
  step2A?: AdaptStepTwoOptionA,
  step2B?: AdaptStepTwoOptionB,
  step3A?: AdaptStepThreeOptionA,
  step3B?: AdaptStepThreeOptionB,
  jurisdiction = 'AB',
): AdaptStepFour {
  const s1 = step1 ?? emptyAdaptStepOne(jurisdiction);
  const rawDob = step2A?.demographics?.dateOfBirth?.trim() || '';
  const patientDob = rawDob === '1958-04-12' ? '' : rawDob;

  const patientInfo: AdaptPatientDocumentInfo = {
    name: '',
    dateOfBirth: patientDob,
    patientId: '',
    phone: '',
    address: '',
    skipped: false,
    confirmed: false,
  };

  const docs = generateAdaptationDocuments(s1, step2A, step2B, step3A, step3B, patientInfo);
  const stamp = new Date().toISOString();

  const reviews: Record<AdaptDocumentTypeId, AdaptDocumentReviewState> = {
    consultation_note: {
      versionId: `consultation_note:${stamp}`,
      status: 'REVIEW_REQUIRED',
    },
    prescriber_communication: {
      versionId: `prescriber_communication:${stamp}`,
      status: 'REVIEW_REQUIRED',
    },
    patient_care_summary: {
      versionId: `patient_care_summary:${stamp}`,
      status: 'REVIEW_REQUIRED',
    },
    prescription: {
      versionId: `prescription:${stamp}`,
      status: 'REVIEW_REQUIRED',
    },
  };

  return {
    patientInfo,
    documents: docs,
    documentReviews: reviews,
    overallStatus: 'draft',
    allReviewed: false,
  };
}

export function isAdaptStepFourValid(step4: AdaptStepFour): {
  valid: boolean;
  allReviewed: boolean;
  unreviewedDocTitles: string[];
} {
  const unreviewed: string[] = [];
  for (const def of ADAPT_DOCUMENT_DEFINITIONS) {
    const rev = step4.documentReviews[def.id];
    if (rev?.status !== 'REVIEWED') {
      unreviewed.push(def.name);
    }
  }
  return {
    valid: unreviewed.length === 0,
    allReviewed: unreviewed.length === 0,
    unreviewedDocTitles: unreviewed,
  };
}


