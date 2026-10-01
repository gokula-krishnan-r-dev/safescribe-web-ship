import type { SafetyDrugReference, SafetyReviewItem } from '@safescript/shared';

export type ConsultationStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ConsultationMode =
  | 'GUIDED_PATHWAY'
  | 'CLINICAL_JUDGMENT'
  | 'DOCUMENTATION_REFERRAL';

export type DiagnosticCertainty = 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';

export type ConsultationStep =
  | 'PRESENTING_COMPLAINT'
  | 'PATHWAY_SELECTION'
  | 'DEMOGRAPHICS'
  | 'CLINICAL_QUESTIONS'
  | 'RED_FLAGS'
  | 'ELIGIBILITY'
  | 'TREATMENT'
  | 'COUNSELLING'
  | 'DOCUMENTATION'
  | 'REVIEW'
  | 'CLINICAL_IMPRESSION'
  | 'PRESCRIBING_READINESS'
  | 'TREATMENT_RATIONALE'
  | 'RENEW_MEDICATIONS'
  | 'RENEW_THERAPY_REVIEW'
  | 'RENEW_CLINICAL_ASSESSMENT'
  | 'RENEW_DECISION'
  | 'RENEW_DOCUMENTATION'
  | 'RENEW_SUMMARY'
  | 'PRESCRIPTION_AND_REASON'
  | 'PATIENT_ASSESSMENT'
  | 'PROPOSED_ADAPTATION'
  | 'DOCUMENTS_AND_COMPLETE';

// ── UI Steps (eligibility & counselling removed from visible flow) ────────────

export type UIStepId =
  | 'PRESENTING_COMPLAINT'
  | 'PATHWAY_SELECTION'
  | 'CLINICAL_ASSESSMENT' // Clinical Judgment — impression only
  | 'PATIENT_ASSESSMENT'
  | 'RED_FLAGS'
  | 'PRESCRIBING_READINESS' // Clinical Judgment only
  | 'TREATMENT'
  | 'TREATMENT_RATIONALE' // Clinical Judgment only
  | 'DOCUMENTATION';

export interface UIStep {
  id: UIStepId;
  label: string;
  shortLabel: string;
  description?: string;
  icon: UIStepIcon;
  dbSteps: ConsultationStep[];
}

export type UIStepIcon =
  | 'mic'
  | 'flask'
  | 'user'
  | 'shield'
  | 'scale'
  | 'pill'
  | 'book'
  | 'file'
  | 'clipboard';

/** Guided Pathway UI steps — production order, unchanged. */
export const GUIDED_PATHWAY_UI_STEPS: UIStep[] = [
  {
    id: 'PRESENTING_COMPLAINT',
    label: 'Patient Complaint',
    shortLabel: 'Complaint',
    description: 'Capture the presenting concern and relevant clinical details.',
    icon: 'file',
    dbSteps: ['PRESENTING_COMPLAINT'],
  },
  {
    id: 'PATHWAY_SELECTION',
    label: 'Confirm Clinical Pathway',
    shortLabel: 'Approach',
    description: 'Choose guided pathway or clinical judgment.',
    icon: 'flask',
    dbSteps: ['PATHWAY_SELECTION'],
  },
  {
    id: 'PATIENT_ASSESSMENT',
    label: 'Patient Assessment',
    shortLabel: 'Patient',
    description: 'Confirm background, then review clinical findings.',
    icon: 'user',
    dbSteps: ['DEMOGRAPHICS', 'CLINICAL_QUESTIONS'],
  },
  {
    id: 'RED_FLAGS',
    label: 'Clinical Review',
    shortLabel: 'Clinical Review',
    description: 'Review alternative diagnoses, then complete red-flag safety screening.',
    icon: 'shield',
    dbSteps: ['RED_FLAGS'],
  },
  {
    id: 'TREATMENT',
    label: 'Treatment Options',
    shortLabel: 'Treatment',
    description: 'Select treatment, review counselling & follow-up, then continue.',
    icon: 'pill',
    dbSteps: ['TREATMENT', 'ELIGIBILITY'],
  },
  {
    id: 'DOCUMENTATION',
    label: 'Consultation Documents',
    shortLabel: 'Documents',
    description: 'Review documentation before submitting.',
    icon: 'file',
    dbSteps: ['DOCUMENTATION', 'COUNSELLING', 'REVIEW'],
  },
];

/** Clinical Judgment UI steps — authoritative flowchart order (v1.0). */
export const CLINICAL_JUDGMENT_UI_STEPS: UIStep[] = [
  {
    id: 'PRESENTING_COMPLAINT',
    label: 'Patient Complaint',
    shortLabel: 'Complaint',
    description: 'Capture the presenting concern and relevant clinical details.',
    icon: 'file',
    dbSteps: ['PRESENTING_COMPLAINT'],
  },
  {
    id: 'PATHWAY_SELECTION',
    label: 'Choose Consultation Approach',
    shortLabel: 'Approach',
    description: 'Use a guided pathway or continue with clinical judgment.',
    icon: 'flask',
    dbSteps: ['PATHWAY_SELECTION'],
  },
  {
    id: 'CLINICAL_ASSESSMENT',
    label: 'Clinical Impression',
    shortLabel: 'Impression',
    description: 'Record your working clinical impression.',
    icon: 'clipboard',
    dbSteps: ['CLINICAL_IMPRESSION'],
  },
  {
    id: 'PATIENT_ASSESSMENT',
    label: 'Patient Profile',
    shortLabel: 'Patient',
    description: 'Confirm patient profile before the red-flag check.',
    icon: 'user',
    dbSteps: ['DEMOGRAPHICS'],
  },
  {
    id: 'RED_FLAGS',
    label: 'Red-Flag Check',
    shortLabel: 'Red Flags',
    description: 'Assisted red-flag check before prescribing readiness.',
    icon: 'shield',
    dbSteps: ['RED_FLAGS'],
  },
  {
    id: 'PRESCRIBING_READINESS',
    label: 'Prescribing Readiness',
    shortLabel: 'Readiness',
    description: 'Confirm enough information to make a prescribing decision.',
    icon: 'clipboard',
    dbSteps: ['PRESCRIBING_READINESS'],
  },
  {
    id: 'TREATMENT',
    label: 'Treatment',
    shortLabel: 'Treatment',
    description: 'Select and confirm the treatment plan.',
    icon: 'pill',
    dbSteps: ['TREATMENT', 'ELIGIBILITY'],
  },
  {
    id: 'TREATMENT_RATIONALE',
    label: 'Treatment Rationale',
    shortLabel: 'Rationale',
    description: 'Document why this treatment was selected.',
    icon: 'book',
    dbSteps: ['TREATMENT_RATIONALE', 'COUNSELLING'],
  },
  {
    id: 'DOCUMENTATION',
    label: 'Documentation',
    shortLabel: 'Documents',
    description: 'Review documentation before submitting.',
    icon: 'file',
    dbSteps: ['DOCUMENTATION', 'REVIEW'],
  },
];

/**
 * Authoritative Clinical Judgment flow (for docs / assertions):
 * Patient Complaint → Choose Consultation Approach → Clinical Impression →
 * Patient Profile → AI Red-Flag Check → Prescribing Readiness → Treatment →
 * Treatment Rationale → Documentation
 */
export const CLINICAL_JUDGMENT_FLOW_ORDER: UIStepId[] = CLINICAL_JUDGMENT_UI_STEPS.map(
  (s) => s.id,
);

/** @deprecated Use getUISteps(mode) — kept for imports that assume guided flow */
export const UI_STEPS = GUIDED_PATHWAY_UI_STEPS;

export function resolveConsultationMode(
  mode: ConsultationMode | string | null | undefined,
): ConsultationMode {
  if (
    mode === 'CLINICAL_JUDGMENT' ||
    mode === 'DOCUMENTATION_REFERRAL' ||
    mode === 'GUIDED_PATHWAY'
  ) {
    return mode;
  }
  return 'GUIDED_PATHWAY';
}

export function isClinicalJudgmentMode(
  mode: ConsultationMode | string | null | undefined,
): boolean {
  return resolveConsultationMode(mode) === 'CLINICAL_JUDGMENT';
}

/** True when the Pharmacist Consultation Note must use Clinical Judgment DAP mapping. */
export function usesClinicalJudgmentDap(
  consultation:
    | {
        consultationMode?: ConsultationMode | string | null;
        originMode?: ConsultationMode | string | null;
        clinicalJudgmentAssessment?: unknown;
      }
    | ConsultationMode
    | string
    | null
    | undefined,
): boolean {
  if (!consultation || typeof consultation === 'string') {
    const mode = resolveConsultationMode(consultation);
    return mode === 'CLINICAL_JUDGMENT' || mode === 'DOCUMENTATION_REFERRAL';
  }
  if (isClinicalJudgmentMode(consultation.consultationMode)) return true;
  if (consultation.consultationMode === 'DOCUMENTATION_REFERRAL') return true;
  return false;
}

export function getUISteps(
  mode: ConsultationMode | string | null | undefined,
): UIStep[] {
  const resolved = resolveConsultationMode(mode);
  if (resolved === 'CLINICAL_JUDGMENT' || resolved === 'DOCUMENTATION_REFERRAL') {
    // Referral from CJ still uses CJ step list for resume until documentation
    return CLINICAL_JUDGMENT_UI_STEPS;
  }
  return GUIDED_PATHWAY_UI_STEPS;
}

export function dbStepToUIStepId(
  dbStep: ConsultationStep,
  mode?: ConsultationMode | string | null,
): UIStepId {
  if (isClinicalJudgmentMode(mode) || mode === 'DOCUMENTATION_REFERRAL') {
    if (dbStep === 'CLINICAL_IMPRESSION') return 'CLINICAL_ASSESSMENT';
    if (dbStep === 'PRESCRIBING_READINESS') return 'PRESCRIBING_READINESS';
    if (dbStep === 'RED_FLAGS') return 'RED_FLAGS';
    if (dbStep === 'ELIGIBILITY') return 'TREATMENT';
    if (dbStep === 'COUNSELLING') return 'TREATMENT_RATIONALE';
    if (dbStep === 'TREATMENT') return 'TREATMENT';
    if (dbStep === 'TREATMENT_RATIONALE') return 'TREATMENT_RATIONALE';
    if (dbStep === 'DEMOGRAPHICS' || dbStep === 'CLINICAL_QUESTIONS') {
      return 'PATIENT_ASSESSMENT';
    }
    if (dbStep === 'DOCUMENTATION' || dbStep === 'REVIEW') return 'DOCUMENTATION';
  }
  if (dbStep === 'ELIGIBILITY') return 'TREATMENT';
  if (dbStep === 'COUNSELLING') {
    return 'DOCUMENTATION';
  }
  if (dbStep === 'REVIEW') return 'DOCUMENTATION';
  if (dbStep === 'CLINICAL_IMPRESSION') return 'CLINICAL_ASSESSMENT';
  if (dbStep === 'PRESCRIBING_READINESS') return 'PRESCRIBING_READINESS';
  if (dbStep === 'TREATMENT_RATIONALE') return 'TREATMENT_RATIONALE';
  const steps = getUISteps(mode);
  return steps.find((s) => s.dbSteps.includes(dbStep))?.id ?? 'PRESENTING_COMPLAINT';
}

export function dbStepToUIIndex(
  dbStep: ConsultationStep,
  mode?: ConsultationMode | string | null,
): number {
  const steps = getUISteps(mode);
  const id = dbStepToUIStepId(dbStep, mode);
  const idx = steps.findIndex((s) => s.id === id);
  return idx >= 0 ? idx : 0;
}

// Legacy exports kept for backward compat (guided pathway indices; CJ uses getUISteps)
export const STEP_INDEX: Record<ConsultationStep, number> = {
  PRESENTING_COMPLAINT: 0,
  PATHWAY_SELECTION: 1,
  DEMOGRAPHICS: 2,
  CLINICAL_QUESTIONS: 3,
  RED_FLAGS: 4,
  ELIGIBILITY: 5,
  TREATMENT: 6,
  COUNSELLING: 7,
  DOCUMENTATION: 8,
  REVIEW: 9,
  CLINICAL_IMPRESSION: 2,
  PRESCRIBING_READINESS: 5,
  TREATMENT_RATIONALE: 8,
  RENEW_MEDICATIONS: 0,
  RENEW_THERAPY_REVIEW: 1,
  RENEW_CLINICAL_ASSESSMENT: 2,
  RENEW_DECISION: 3,
  RENEW_DOCUMENTATION: 4,
  RENEW_SUMMARY: 5,
  PRESCRIPTION_AND_REASON: 0,
  PATIENT_ASSESSMENT: 1,
  PROPOSED_ADAPTATION: 2,
  DOCUMENTS_AND_COMPLETE: 3,
};
export const STEP_LABELS: Record<ConsultationStep, string> = {
  PRESENTING_COMPLAINT: 'Complaint',
  PATHWAY_SELECTION: 'Approach',
  DEMOGRAPHICS: 'Patient',
  CLINICAL_QUESTIONS: 'Assessment',
  RED_FLAGS: 'Red Flags',
  ELIGIBILITY: 'Treatment',
  TREATMENT: 'Treatment',
  COUNSELLING: 'Counselling',
  DOCUMENTATION: 'Documents',
  REVIEW: 'Review',
  CLINICAL_IMPRESSION: 'Impression',
  PRESCRIBING_READINESS: 'Readiness',
  TREATMENT_RATIONALE: 'Rationale',
  RENEW_MEDICATIONS: 'Medications',
  RENEW_THERAPY_REVIEW: 'Therapy',
  RENEW_CLINICAL_ASSESSMENT: 'Assessment',
  RENEW_DECISION: 'Renew',
  RENEW_DOCUMENTATION: 'Documents',
  RENEW_SUMMARY: 'Renew',
  PRESCRIPTION_AND_REASON: 'Prescription',
  PATIENT_ASSESSMENT: 'Patient',
  PROPOSED_ADAPTATION: 'Adaptation',
  DOCUMENTS_AND_COMPLETE: 'Documents',
};
export const STEPS = Object.keys(STEP_INDEX) as ConsultationStep[];

export interface AiExtractedEntity {
  chiefComplaint?: string;
  symptoms?: Array<{
    symptom: string;
    duration?: string;
    severity?: string;
    confidence: number;
    source?: string;
  }>;
  medications?: Array<{ name: string; dose?: string; frequency?: string; confidence: number }>;
  allergies?: Array<{
    allergen: string;
    reaction?: string;
    /** AI / local classifier: non_severe | severe | unknown */
    allergyType?: 'non_severe' | 'severe' | 'unknown' | string;
    confidence: number;
  }>;
  conditions?: Array<{ condition: string; confidence: number }>;
  labValues?: Array<{ test: string; value: string; unit?: string; confidence: number }>;
  demographics?: {
    age?: number; sex?: string; weight?: string; height?: string;
    pulse?: string; bloodPressureSystolic?: string; bloodPressureDiastolic?: string;
    pregnant?: boolean; smokingStatus?: string; alcoholUse?: string;
  };
  riskFactors?: string[];
  patientConcerns?: string[];
  overallConfidence?: number;
  /** Vision analysis from optional clinical photos (Step 1 attachments) */
  imageFindings?: ClinicalPhotoFindings;
}

export interface ClinicalPhotoFindings {
  summary: string;
  suggestedConditions: string[];
  visibleFindings: Array<{ finding: string; bodySite?: string; confidence: number }>;
  suggestedPathwayHints: string[];
  bodySite?: string;
  acuity?: string;
  overallConfidence: number;
  warnings?: string[];
  attachmentIds?: string[];
  analyzedAt?: string;
  contentHash?: string;
}

export interface PathwaySuggestion {
  id: string;
  name: string;
  condition: string;
  confidence: number;
  /** Pathway match band — never diagnostic probability. */
  matchLevel?: 'high' | 'moderate' | 'low';
  matchedSymptoms?: string[];
  reasoning?: string;
}

export interface MedicationEntry {
  id: string;
  label: string;
  brandName?: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  drugClass?: string;
  source?: 'ccdd' | 'rxnorm' | 'openfda' | 'transcript' | 'manual';
  rxcui?: string;
  ndc?: string;
}

export interface Demographics {
  age?: string;
  /** Display unit for age — days / weeks / months / years */
  ageUnit?: 'years' | 'months' | 'weeks' | 'days';
  /** ISO date (YYYY-MM-DD). When set, age is derived automatically. */
  dateOfBirth?: string;
  /** Pharmacist confirmed DOB is not available — enter age instead. */
  dateOfBirthUnavailable?: boolean;
  /** Provenance when a Documentation-stage DOB later becomes authoritative. */
  originalManualAge?: { value: number; unit: string };
  /** Informed consent captured at intake before assessment. */
  patientConsentObtained?: boolean;
  /** Step 3 confirmation — pharmacist attested the current patient-information state. */
  patientInformationConfirmed?: boolean;
  patientInformationConfirmedAt?: string | null;
  patientInformationConfirmedBy?: string | null;
  sex?: string;
  height?: string;
  weight?: string;
  bmi?: string;
  pulse?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
  /**
   * Pregnancy answer: No | Yes | Unknown
   * Legacy values (Not pregnant / Pregnant / Breastfeeding) are migrated in the UI.
   */
  pregnancyStatus?: string;
  /** Breastfeeding answer: No | Yes | Unknown — independent of pregnancy */
  breastfeedingStatus?: string;
  allergies?: string;
  /** Pharmacist confirmed no known drug allergies */
  allergiesNone?: boolean;
  /** Structured allergy chips (CCDD-resolved + typed) — preferred over free-text `allergies` */
  allergyEntries?: Array<{
    id: string;
    drug: string;
    reaction: string;
    severity: 'Mild' | 'Moderate' | 'Severe' | '';
    genericName?: string;
    brandName?: string;
    drugClass?: string;
    rxcui?: string;
    ndc?: string;
    codeDisplay?: string;
    source?: 'ccdd' | 'rxnorm' | 'openfda' | 'manual' | 'transcript';
  }>;
  currentMedications?: string;
  /** Pharmacist confirmed no current medications */
  medsNone?: boolean;
  medicationEntries?: MedicationEntry[];
  medicalConditions?: string;
  /** True when pharmacist confirmed no known conditions */
  noKnownConditions?: boolean;
  surgicalHistory?: string;
  familyHistory?: string;
  smokingStatus?: string;
  alcoholUse?: string;
  /** Prefer “Substance use” in UI; stored as drugUse for compatibility */
  drugUse?: string;
  /** True once lifestyle questions have been explicitly assessed */
  lifestyleAssessed?: boolean;
  labValues?: string;
  extractedLabValues?: ExtractedLabValue[];
  /** ISO date (YYYY-MM-DD) for vitals measurement — one date for all vitals on this screen */
  measurementDate?: string;
}

export interface ExtractedLabValue {
  test: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  /** Collection / result date when present (ISO YYYY-MM-DD or display string) */
  observedDate?: string;
  confidence: number;
  needsReview: boolean;
}

export interface LabReportExtractionResult {
  labValues: ExtractedLabValue[];
  formattedText: string;
  summary?: string;
  reportDate?: string;
  patientName?: string;
  overallConfidence: number;
  cached: boolean;
  warnings?: string[];
}

export interface QuestionResponse {
  questionId: string;
  question: string;
  answer: string | boolean | number | null;
  answerText?: string;
  medicationEntries?: MedicationEntry[];
  confidence?: number;
  source?: 'transcript' | 'entity' | 'manual';
  aiAnswered?: boolean;
  /** How the Yes/No answer was entered on diagnosis / eligibility criteria */
  entryMethod?: 'INDIVIDUAL_SELECTION' | 'YES_TO_ALL';
}

export interface RedFlag {
  flag: string;
  severity: 'WARNING' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';
  description: string;
  reasoning: string;
  recommendedAction: string;
  requiresImmediateAction: boolean;
}

/** Static override reasons shown when pharmacist proceeds despite referral */
export const CLINICAL_JUDGMENT_REASONS = [
  'Patient has already been assessed by a physician',
  'Specialist has advised treatment',
  'Additional clinical information not captured by pathway',
  'Guideline exception applies',
  'Other',
] as const;

export type ClinicalJudgmentReason = (typeof CLINICAL_JUDGMENT_REASONS)[number];

export type RedFlagScreenAnswer = 'yes' | 'no';

/** clear = answered No; refer = Refer Patient; override = clinical judgment documented */
export type RedFlagAction = 'clear' | 'refer' | 'override' | 'review' | 'ignore';

export interface RedFlagOverrideDetail {
  reason: string;
  comments: string;
  acknowledgedResponsibility: boolean;
}

export interface RedFlagAcknowledgment {
  flagIndex: number;
  flagId?: string;
  flag: string;
  answer?: RedFlagScreenAnswer;
  action: RedFlagAction;
  override?: RedFlagOverrideDetail;
  acknowledgedAt: string;
  /** How the Yes/No was captured — AUTO_FROM_AGE is derived from Assessment demographics */
  entryMethod?: 'NO_TO_ALL' | 'INDIVIDUAL_SELECTION' | 'AUTO_FROM_AGE' | 'CONFIRM_NONE_PRESENT';
}

export interface RedFlagsResult {
  hasRedFlags: boolean;
  overallRisk: string;
  redFlags: RedFlag[];
  summary: string;
  /** Pathway screening Yes-No answers keyed by item id */
  screeningAnswers?: Record<string, RedFlagScreenAnswer>;
  acknowledgments?: RedFlagAcknowledgment[];
  allAcknowledged?: boolean;
  /** True when pharmacist chose Refer on at least one triggered flag */
  referralSelected?: boolean;
  /** True after Document & complete succeeds on the referral pathway */
  referralCompleted?: boolean;
  referralOutcomeId?: string;
  /** Always pathway-authored for Clinical Safety Review */
  source?: 'pathway';
  /** Pharmacist differential review completed on Clinical Review. */
  differentialReview?: {
    reviewed: boolean;
    reviewedBy?: string;
    reviewedAt?: string;
    pharmacistAddedDifferentials: Array<{
      id: string;
      displayName: string;
      source: 'pharmacist';
      addedBy?: string;
      addedAt?: string;
      order: number;
    }>;
    auditEvents?: Array<{ action: string; at: string; subjectId?: string }>;
  };
}

export interface ConsultationReferralOutcome {
  id: string;
  consultationId: string;
  pathwayId: string;
  pathwayVersion: number;
  urgencyCode: string;
  urgencyDisplaySnapshot: string;
  triggerSnapshot: unknown;
  destination: string;
  destinationOtherText?: string | null;
  actionTaken: string;
  patientResponse: string;
  additionalNote?: string | null;
  reasonForReferral?: string | null;
  providerFacilitySnapshot?: string | null;
  contactMethod?: string | null;
  contactMethodOtherText?: string | null;
  confirmationReceived?: boolean | null;
  handoffAt?: string | null;
  status: 'DRAFT' | 'COMPLETED';
  derivedOutcomeCode?: string | null;
  documentationText?: string | null;
  referralLetterDraft?: string | null;
  sourceRevision?: number;
  sourceFingerprint?: string | null;
  letterStatus?:
    | 'NOT_CREATED'
    | 'DRAFT'
    | 'APPROVED'
    | 'STALE'
    | 'FINALIZED'
    | 'VOID'
    | string;
  letterApprovedAt?: string | null;
  letterApprovedById?: string | null;
  letterApprovedSourceRevision?: number | null;
  letterExternalSendConfirmed?: boolean | null;
  completedAt?: string | null;
}

// Pathway-configured clinical safety content (authored in the pathway admin)
export interface PathwayRedFlag {
  id: string;
  title: string;
  description: string | null;
  severity: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  action: string | null;
}

export interface PathwayDifferential {
  id: string;
  condition: string;
  distinguishingFeatures: string | null;
  keySymptoms: string | null;
  recommendedAction: string | null;
  likelihood: 'COMMON' | 'LESS_COMMON' | 'RARE' | null;
}

export interface EligibilityCriterion {
  criterion: string;
  met: boolean;
  explanation: string;
  source?: string;
}

/** Provenance for avoid/caution signals — maps engine domain → Excel workbook. */
export interface SafetyEngineSourceMeta {
  findingType: string;
  engineType: string;
  workbook: string;
  ruleCode?: string;
  matchType?: string;
  origin?: 'published_release' | 'baseline_engine' | 'direct_engine' | 'pathway';
  severity?: string;
  message?: string;
}

export interface TreatmentRecommendation {
  priority: number;
  medicationName: string;
  genericName?: string;
  brandName?: string;
  category?: 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT' | 'NON_DRUG';
  recommendationLevel?:
    | 'FIRST_LINE'
    | 'SECOND_LINE'
    | 'ALTERNATIVE'
    | 'ADJUNCTIVE'
    | 'SUPPORTIVE_CARE'
    | 'SPECIALIST';
  /** Composed dose display (e.g. "500 mg") — kept for summaries & legacy plans */
  dose?: string;
  /** Numeric/text dose amount without unit (structured editor) */
  doseAmount?: string;
  /** Canonical dose / administration unit (Application(s), Tablet(s), …) */
  doseUnit?: string;
  /** Canonical pharmaceutical form (Foam, Tablet, Cream) — not the dose unit. */
  productForm?: string;
  /** Routes supported by the matched product. */
  allowedRoutes?: string[];
  /** Pharmacist changed the suggested product or structured regimen. */
  pharmacistModified?: boolean;
  /** How the current consultation regimen was chosen. */
  regimenSource?: 'STANDARD' | 'RENAL_ADJUSTED' | 'PHARMACIST_MODIFIED';
  renalBasisUsed?: 'CrCl' | 'eGFR';
  renalValueUsed?: number;
  route?: string;
  frequency?: string;
  duration?: string;
  strength?: string;
  quantity?: string;
  maxDose?: string;
  instructions?: string;
  /** Immutable PCP/documentation display name — exact selected name */
  displayName?: string;
  /** Immutable confirmed SIG in natural language */
  patientDirections?: string;
  /** Clinical indication / context from pathway */
  clinicalIndication?: string;
  /** Clinical rationale from pathway */
  clinicalNotes?: string;
  /** Pathway counselling notes for this treatment option */
  counsellingNotes?: string;
  /** Pathway follow-up / monitoring advice (admin "Monitoring" free-text) */
  followUpAdvice?: string;
  /** Pathway eligibility copy — pharmacist Details panel */
  eligibility?: string;
  reasoning?: string;
  interactions?: string[];
  monitoring?: string;
  /** Alternate structured regimens from pathway metadata */
  regimens?: TreatmentRegimenOption[];
  /** Currently applied regimen id (when regimens[] present) */
  selectedRegimenId?: string;
  /** Pathway flag: pregnancy/lactation caution applies (Yes) */
  pregnancyCaution?: boolean;
  renalAdjustmentRequired?: boolean;
  hepaticAdjustmentRequired?: boolean;
  monitoringRequired?: boolean;
  /** Pharmacist-authored reasons (shown with the warning) */
  pregnancyReason?: string;
  renalAdjustmentReason?: string;
  /** Pathway guideline / monograph citation for pharmacist source display. */
  guidelineReference?: string;
  /** Structured renal matching — never parse renalAdjustmentReason for the dose. */
  renalDosingBasis?: 'CrCl' | 'eGFR' | 'NONE';
  renalDosingRules?: Array<{
    min: number | null;
    minInclusive: boolean;
    max: number | null;
    maxInclusive: boolean;
    doseAmount: number;
    doseUnit: 'mg' | 'mcg' | 'g' | 'mL' | 'units';
    frequency: string;
    duration: number;
    durationUnit: 'Days' | 'Weeks' | 'Months';
    totalDoses: number | null;
    directions: string;
  }>;
  hepaticAdjustmentReason?: string;
  monitoringReason?: string;
  /**
   * Set when pathway pregnancyCaution is Yes AND patient pregnancy is Yes.
   * Drives Step 7 caution UI without client-only inference.
   */
  pregnancyWarning?: {
    active: boolean;
    message: string;
    /** Safety Engine provenance for testing / analysis UI */
    safetySource?: SafetyEngineSourceMeta;
  };
  renalWarning?: {
    active: boolean;
    message: string;
    safetySource?: SafetyEngineSourceMeta;
  };
  hepaticWarning?: {
    active: boolean;
    message: string;
    safetySource?: SafetyEngineSourceMeta;
  };
  monitoringWarning?: { active: boolean; message: string };
  /** Engine-classified review rows — prefer these over reconstructing from flags. */
  safetyReviewItems?: SafetyReviewItem[];
  /** Pathway monograph copy — Drug reference, not a matched alert. */
  drugReference?: SafetyDrugReference;
  /** Server safety presentation tier (PREFERRED / CAUTION / REVIEW_REQUIRED / AVOID). */
  safetyTier?: 'PREFERRED' | 'CAUTION' | 'REVIEW_REQUIRED' | 'AVOID';
  confidence: number;
  drugId?: string;
  pathwayTreatmentId?: string;
  /** Stable instance id for pharmacist-added and draft treatments (safety association). */
  treatmentInstanceId?: string;
  safetyEvaluationId?: string;
  safetyStatus?: 'CLEAR' | 'REVIEW_REQUIRED' | 'AVOID';
  patientContextVersion?: string;
  safetyEvaluatedAt?: string;
  normalizedBaseIngredientIds?: string[];
  rxcui?: string;
  ndc?: string;
  manufacturer?: string;
  drugClass?: string;
  terminologyLabel?: string;
  source?: 'ccdd' | 'rxnorm' | 'openfda' | 'ai' | 'manual' | 'pathway';
  /** Pathway admin approved this option */
  approved?: boolean;
  /** @deprecated Kept for older saved plans — consultation no longer AI-ranks treatments */
  aiPreferred?: boolean;
  /** Blocked by patient allergy rules — still shown, not preferred */
  allergyBlocked?: boolean;
  /** Structured allergy conflict from allergy-rules lookup */
  allergyWarning?: {
    patientAllergy: string;
    prescribedDrug: string;
    matchedDrugClass?: string;
    parentClass?: string;
    therapeuticGroup?: string;
    matchType?: string;
    risk?: string;
    reason: string;
    severity?: string;
    safetySource?: SafetyEngineSourceMeta;
  };
  /**
   * All Safety Engine signals for this card (allergy, renal, DDI, age, …).
   * Used by treatment UI provenance strip for testing / clinical analysis.
   */
  safetySources?: SafetyEngineSourceMeta[];
  /** Optional release metadata when safety sources are present */
  safetyEngineMeta?: {
    knowledgeRelease?: string | null;
    engineVersion?: string | null;
  };
  interactionSafetySources?: SafetyEngineSourceMeta[];
  /**
   * Pharmacist clinical override for this consultation only.
   * Allows selecting an AVOID or review-required caution option after documented acknowledgment.
   */
  clinicalOverride?: TreatmentClinicalOverride;
  /** Pharmacist acknowledged CDS alerts when adding despite warnings */
  safetyAcknowledgment?: {
    acknowledgedAt: string;
    alertCount: number;
    topSeverity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'INFO';
    summaries: string[];
  };
  /** Add-treatment modal kind — medication is the default when omitted. */
  treatmentKind?: 'MEDICATION' | 'CUSTOM_COMPOUND' | 'DEVICE';
  quantityUnit?: string;
  refills?: number;
  prn?: boolean;
  directionsMode?: 'AUTO' | 'MANUAL';
  pharmacyInstructions?: string;
  doNotAdapt?: boolean;
  doNotSubstitute?: boolean;
  trialDispenseAuthorized?: boolean;
  compliancePackageRequired?: boolean;
  confidential?: boolean;
  compoundIngredients?: string;
  preparationDetails?: string;
  compoundSafetyCoverage?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  deviceType?: string;
  deviceBrandModel?: string;
  sizeSpecification?: string;
  useWith?: string;
  useSchedule?: string;
  replacementInterval?: string;
  manualDeviceEntry?: boolean;
  deviceTerminology?: { system?: string; code?: string; display: string; version?: string };
  regimenLines?: Array<{
    clientId: string;
    sequence: number;
    doseFrom: string;
    doseTo: string | null;
    form: string;
    frequency: string;
    prn: boolean;
    durationValue: string | null;
    durationUnit: 'DAY' | 'WEEK' | 'MONTH' | null;
  }>;
}

/** Documented override when proceeding with an otherwise blocked or cautioned treatment. */
export interface TreatmentClinicalOverride {
  overriddenAt: string;
  /** Preset or free-text clinical reason */
  reason: string;
  /** Optional supporting notes */
  comments?: string;
  acknowledgedRisk: true;
  source: 'ALLERGY' | 'AVOID' | 'CAUTION' | 'REVIEW_REQUIRED';
  allergySummary?: string;
}

/** Structured regimen option — mirrors pathway admin TreatmentRegimenDraft */
export interface TreatmentRegimenOption {
  id: string;
  label: string;
  dose: string;
  unit: string;
  frequency: string;
  route: string;
  duration: string;
  productForm?: string;
  administrationUnit?: string;
  durationValue?: string;
  durationUnit?: string;
}

export interface CounsellingSection {
  category: string;
  points: Array<{ point: string; important: boolean }>;
}

export interface ConsultationAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  storageKey?: string;
  storageProvider?: 'gcs' | 'local';
}

export interface Consultation {
  id: string;
  consultationRef: string;
  status: ConsultationStatus;
  currentStep: ConsultationStep;
  stepIndex: number;
  pharmacistId: string;
  tenantId?: string;
  module?: string;
  renewPayload?: import('@safescript/shared').RenewPayload | Record<string, unknown> | null;

  // Step data
  transcript?: string;
  rawTranscript?: string | null;
  chiefComplaint?: string;
  attachments?: ConsultationAttachment[];
  aiEntities?: AiExtractedEntity;
  aiAnalysis?: Record<string, unknown>;
  aiPathwaySuggestions?: PathwaySuggestion[];
  selectedPathwayId?: string;
  demographics?: Demographics;
  questionResponses?: Record<string, QuestionResponse>;
  redFlags?: RedFlagsResult;
  eligibility?: {
    eligible: boolean; confidence: number; overallAssessment: string;
    summary: string; criteria: EligibilityCriterion[]; conditions?: string[];
  };
  treatmentPlan?: {
    recommendedTreatments: TreatmentRecommendation[];
    summary: string;
    followUpTimeframe?: string;
    selectedIndex?: number;
    selectedIndexes?: number[];
    counsellingPoints?: string[];
    followUpPoints?: string[];
    /** Clinical Judgment required fields */
    intendedIndication?: string;
    treatmentGoal?: string;
    treatmentSource?: 'PATHWAY_RECOMMENDED' | 'PHARMACIST_SELECTED';
    selectedTreatments?: TreatmentRecommendation[];
    selectedItemsSnapshot?: TreatmentRecommendation[];
    confirmStatus?: string;
    confirmation?: Record<string, unknown>;
    planVersion?: number;
  };
  counsellingNotes?: {
    sections: CounsellingSection[];
    keyMessages: string[];
    plan?: import('./counselling-panel-model').CounsellingPlan;
    reviewedAt?: string;
    includeDetailedHandout?: boolean;
    sourceRevision?: string;
    safetyAcknowledged?: boolean;
    safetyAcknowledgedAt?: string;
  };
  documentation?: Record<string, unknown>;
  referralOutcome?: ConsultationReferralOutcome | null;
  pathwayClinicalJudgement?: import('@safescript/shared').PathwayClinicalJudgementRecord | null;

  consultationMode?: ConsultationMode | null;
  originMode?: ConsultationMode | null;
  clinicalJudgmentWorkflowVersionId?: string | null;
  clinicalJudgmentAssessment?: ClinicalJudgmentAssessment | null;
  /** Current pharmacist-confirmed CJ red-flag answers — used by the DAP note. */
  clinicalJudgmentRedFlagReview?: ClinicalJudgmentRedFlagReview | null;
  treatmentRationale?: TreatmentRationale | null;
  cjWorkflowVersion?: { id: string; version: string; status?: string } | null;

  submittedAt?: string;
  /** Server-owned end-of-day deletion deadline (America/Edmonton), ISO */
  deletionDeadline?: string | null;
  createdAt: string;
  updatedAt: string;

  pharmacist?: { id: string; firstName: string; lastName: string; email: string };
  tenant?: { id?: string; name?: string; faxNumber?: string | null; phone?: string | null; address?: string | null; timezone?: string | null } | null;
  pathway?: {
    id: string; name: string; condition: string;
    version?: number;
    assessmentSectionsEnabled?: {
      diagnosisConfirmation?: boolean;
      additionalAssessment?: boolean;
      treatmentEligibility?: boolean;
    } | null;
    sections?: Array<{
      id: string;
      name: string;
      displayName: string;
      displayOrder: number;
      visibility?: {
        all?: Array<{
          field: string;
          operator: string;
          value: string | number | string[];
        }>;
      } | null;
    }>;
    questions?: ClinicalQuestion[];
    rules?: unknown[];
    treatments?: unknown[];
    counsellings?: unknown[];
    followups?: Array<{
      timeframe?: string | null;
      condition?: string | null;
      action?: string | null;
      urgency?: string | null;
      approved?: boolean;
    }>;
    redFlags?: PathwayRedFlag[] | null;
    differentials?: PathwayDifferential[] | null;
  };
}

export interface ClinicalJudgmentRedFlagReview {
  checkId: string;
  status: string;
  finalDecision?: string | null;
  otherUnresolvedConcern?: boolean | null;
  otherConcernDetails?: string | null;
  questions: Array<{
    canonicalLabel: string;
    question: string;
    answer: 'NO' | 'YES' | string | null;
    answerNotes?: string | null;
  }>;
  manualConcerns: Array<{
    concernText: string;
    responseStatus: string;
  }>;
}

export interface ClinicalJudgmentAssessment {
  id: string;
  consultationId?: string;
  workingDiagnosisText: string;
  workingDiagnosisCode?: string | null;
  workingDiagnosisSystem?: string | null;
  diagnosticCertainty?: DiagnosticCertainty | null;
  assessmentSummary?: string | null;
  assessmentSummarySource?: string | null;
  assessmentSufficient?: boolean | null;
  unresolvedRedFlags?: boolean | null;
  readinessReason?: string | null;
  readinessStatus?: string | null;
  insufficiencyReasonCodes?: string[] | null;
  insufficiencyDetail?: string | null;
  readinessNextAction?: string | null;
  readinessReturnTarget?: string | null;
  readinessSourceSnapshotHash?: string | null;
  redFlagCheckId?: string | null;
  impressionConfirmedAt?: string | null;
  readinessConfirmedAt?: string | null;
  sourceSnapshotHash?: string | null;
  rowVersion?: number;
}

export interface TreatmentRationale {
  id: string;
  consultationId?: string;
  status: 'DRAFT' | 'REVIEW_REQUIRED' | 'CONFIRMED' | 'STALE' | 'SUPERSEDED';
  reasonForPrescribing?: string | null;
  reasonSource?: string | null;
  selectionRationale?: string | null;
  rationaleSource?: string | null;
  safetyMitigationSummary?: string | null;
  safetySummarySource?: string | null;
  reasonConfirmed?: boolean;
  selectionConfirmed?: boolean;
  alternativesConfirmed?: boolean;
  safetyConfirmed?: boolean;
  noAlternativesDocumented?: boolean;
  inputSnapshotHash?: string | null;
  safetyRunId?: string | null;
  confirmedAt?: string | null;
  alternatives?: Array<{
    id: string;
    category: string;
    selected: boolean;
    details?: string | null;
    notSelectedReason?: string | null;
  }>;
}

export interface ClinicalQuestion {
  id: string;
  question: string;
  type: string;
  required: boolean;
  sectionId?: string;
  description?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  displayOrder?: number;
  evidenceRefIds?: string[];
  section?: {
    id: string;
    name: string;
    displayName: string;
    visibility?: {
      all?: Array<{
        field: string;
        operator: string;
        value: string | number | string[];
      }>;
    } | null;
  } | null;
}

export interface ConsultationListItem {
  id: string;
  consultationRef: string;
  status: ConsultationStatus;
  currentStep: ConsultationStep;
  stepIndex: number;
  chiefComplaint?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  pharmacist: { id: string; firstName: string; lastName: string };
  pathway?: { id: string; name: string; condition: string };
}

export interface PaginatedConsultations {
  items: ConsultationListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
