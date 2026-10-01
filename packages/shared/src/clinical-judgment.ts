/**
 * Clinical Judgment workflow — shared enums, constants, and helpers.
 * Guided Pathway flow remains separate; these types only apply when
 * consultationMode === CLINICAL_JUDGMENT (or DOCUMENTATION_REFERRAL from CJ).
 */

export const CONSULTATION_MODES = {
  GUIDED_PATHWAY: 'GUIDED_PATHWAY',
  CLINICAL_JUDGMENT: 'CLINICAL_JUDGMENT',
  DOCUMENTATION_REFERRAL: 'DOCUMENTATION_REFERRAL',
} as const;

export type ConsultationMode =
  (typeof CONSULTATION_MODES)[keyof typeof CONSULTATION_MODES];

export const DIAGNOSTIC_CERTAINTIES = {
  CONFIRMED: 'CONFIRMED',
  PROBABLE: 'PROBABLE',
  UNCERTAIN: 'UNCERTAIN',
} as const;

export type DiagnosticCertainty =
  (typeof DIAGNOSTIC_CERTAINTIES)[keyof typeof DIAGNOSTIC_CERTAINTIES];

export const DIAGNOSTIC_CERTAINTY_LABELS: Record<DiagnosticCertainty, string> = {
  CONFIRMED: 'Confirmed',
  PROBABLE: 'Probable',
  UNCERTAIN: 'Uncertain',
};

export const TREATMENT_SOURCES = {
  PATHWAY_RECOMMENDED: 'PATHWAY_RECOMMENDED',
  PHARMACIST_SELECTED: 'PHARMACIST_SELECTED',
} as const;

export type TreatmentSource =
  (typeof TREATMENT_SOURCES)[keyof typeof TREATMENT_SOURCES];

export const RATIONALE_STATUSES = {
  DRAFT: 'DRAFT',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  CONFIRMED: 'CONFIRMED',
  STALE: 'STALE',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type RationaleStatus =
  (typeof RATIONALE_STATUSES)[keyof typeof RATIONALE_STATUSES];

export const AI_CONTENT_SOURCES = {
  PHARMACIST: 'PHARMACIST',
  AI_DRAFT: 'AI_DRAFT',
  AI_EDITED: 'AI_EDITED',
  AI_ACCEPTED: 'AI_ACCEPTED',
  SYSTEM: 'SYSTEM',
} as const;

export type AiContentSource =
  (typeof AI_CONTENT_SOURCES)[keyof typeof AI_CONTENT_SOURCES];

export const ALTERNATIVE_CATEGORIES = {
  WATCHFUL_WAITING: 'WATCHFUL_WAITING',
  OTC_MODIFICATION: 'OTC_MODIFICATION',
  ALTERNATIVE_PRESCRIPTION: 'ALTERNATIVE_PRESCRIPTION',
  NON_DRUG: 'NON_DRUG',
  INVESTIGATION: 'INVESTIGATION',
  REFERRAL: 'REFERRAL',
  OTHER: 'OTHER',
} as const;

export type AlternativeCategory =
  (typeof ALTERNATIVE_CATEGORIES)[keyof typeof ALTERNATIVE_CATEGORIES];

export const ALTERNATIVE_CATEGORY_LABELS: Record<AlternativeCategory, string> = {
  WATCHFUL_WAITING: 'No medication / watchful waiting',
  OTC_MODIFICATION: 'Continue or modify current non-prescription treatment',
  ALTERNATIVE_PRESCRIPTION: 'Another prescription treatment',
  NON_DRUG: 'Non-drug or supportive care',
  INVESTIGATION: 'Further assessment or investigation',
  REFERRAL: 'Referral',
  OTHER: 'Other',
};

export const RATIONALE_SECTION_TYPES = {
  REASON_FOR_PRESCRIBING: 'REASON_FOR_PRESCRIBING',
  SELECTION_RATIONALE: 'SELECTION_RATIONALE',
  ALTERNATIVE_SUGGESTIONS: 'ALTERNATIVE_SUGGESTIONS',
  SAFETY_MITIGATION_SUMMARY: 'SAFETY_MITIGATION_SUMMARY',
  ASSESSMENT_SUMMARY: 'ASSESSMENT_SUMMARY',
} as const;

export type RationaleSectionType =
  (typeof RATIONALE_SECTION_TYPES)[keyof typeof RATIONALE_SECTION_TYPES];

/** Null mode (legacy consultations) behaves as guided pathway. */
export function resolveConsultationMode(
  mode: string | null | undefined,
): ConsultationMode {
  if (
    mode === CONSULTATION_MODES.CLINICAL_JUDGMENT ||
    mode === CONSULTATION_MODES.DOCUMENTATION_REFERRAL ||
    mode === CONSULTATION_MODES.GUIDED_PATHWAY
  ) {
    return mode;
  }
  return CONSULTATION_MODES.GUIDED_PATHWAY;
}

export function isClinicalJudgmentMode(
  mode: string | null | undefined,
): boolean {
  return resolveConsultationMode(mode) === CONSULTATION_MODES.CLINICAL_JUDGMENT;
}

export function isGuidedPathwayMode(mode: string | null | undefined): boolean {
  return resolveConsultationMode(mode) === CONSULTATION_MODES.GUIDED_PATHWAY;
}

/** @deprecated Prefer evaluatePrescribingReadinessDecision — legacy two-question gate. */
export function evaluatePrescribingReadiness(
  assessmentSufficient: boolean | null | undefined,
  unresolvedRedFlags: boolean | null | undefined,
): 'READY_TO_CONTINUE' | 'DOCUMENTATION_REFERRAL' | 'INCOMPLETE' {
  if (assessmentSufficient == null || unresolvedRedFlags == null) {
    return 'INCOMPLETE';
  }
  if (assessmentSufficient === true && unresolvedRedFlags === false) {
    return 'READY_TO_CONTINUE';
  }
  return 'DOCUMENTATION_REFERRAL';
}

/** Prescribing Readiness insufficiency reason codes (v1.0). */
export const READINESS_INSUFFICIENCY_REASONS = {
  ADDITIONAL_HISTORY: 'ADDITIONAL_HISTORY',
  PHYSICAL_ASSESSMENT_OR_VITALS: 'PHYSICAL_ASSESSMENT_OR_VITALS',
  LABORATORY_INFORMATION: 'LABORATORY_INFORMATION',
  DIAGNOSTIC_INVESTIGATION: 'DIAGNOSTIC_INVESTIGATION',
  MEDICATION_OR_ALLERGY_CLARIFICATION: 'MEDICATION_OR_ALLERGY_CLARIFICATION',
  OTHER_HEALTHCARE_PROVIDER_INPUT: 'OTHER_HEALTHCARE_PROVIDER_INPUT',
  REFERRAL_REQUIRED: 'REFERRAL_REQUIRED',
  OTHER: 'OTHER',
} as const;

export type ReadinessInsufficiencyReason =
  (typeof READINESS_INSUFFICIENCY_REASONS)[keyof typeof READINESS_INSUFFICIENCY_REASONS];

export const READINESS_INSUFFICIENCY_REASON_LABELS: Record<
  ReadinessInsufficiencyReason,
  string
> = {
  ADDITIONAL_HISTORY: 'Additional patient history',
  PHYSICAL_ASSESSMENT_OR_VITALS: 'Physical assessment or vital signs',
  LABORATORY_INFORMATION: 'Laboratory information',
  DIAGNOSTIC_INVESTIGATION: 'Diagnostic investigation',
  MEDICATION_OR_ALLERGY_CLARIFICATION: 'Medication or allergy clarification',
  OTHER_HEALTHCARE_PROVIDER_INPUT: 'Input from another healthcare provider',
  REFERRAL_REQUIRED: 'Referral',
  OTHER: 'Other',
};

export const READINESS_NEXT_ACTIONS = {
  CONTINUE_TO_TREATMENT: 'CONTINUE_TO_TREATMENT',
  OBTAIN_OR_UPDATE_INFORMATION: 'OBTAIN_OR_UPDATE_INFORMATION',
  DOCUMENT_AND_REFER: 'DOCUMENT_AND_REFER',
} as const;

export type ReadinessNextAction =
  (typeof READINESS_NEXT_ACTIONS)[keyof typeof READINESS_NEXT_ACTIONS];

export const READINESS_RETURN_TARGETS = {
  CLINICAL_IMPRESSION: 'CLINICAL_IMPRESSION',
  PATIENT_PROFILE: 'PATIENT_PROFILE',
  RED_FLAG_CHECK: 'RED_FLAG_CHECK',
} as const;

export type ReadinessReturnTarget =
  (typeof READINESS_RETURN_TARGETS)[keyof typeof READINESS_RETURN_TARGETS];

export const READINESS_STATUSES = {
  AWAITING_DECISION: 'AWAITING_DECISION',
  CONFIRMED_READY: 'CONFIRMED_READY',
  NOT_READY_MORE_INFORMATION: 'NOT_READY_MORE_INFORMATION',
  NOT_READY_REFERRAL: 'NOT_READY_REFERRAL',
  STALE: 'STALE',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type ReadinessStatus =
  (typeof READINESS_STATUSES)[keyof typeof READINESS_STATUSES];

export const READINESS_RETURN_TARGET_LABELS: Record<ReadinessReturnTarget, string> = {
  CLINICAL_IMPRESSION: 'Clinical Impression',
  PATIENT_PROFILE: 'Patient Profile',
  RED_FLAG_CHECK: 'Red-Flag Check',
};

/** Suggested return target by insufficiency reason (navigation aid only). */
export function suggestedReturnTarget(
  reason: ReadinessInsufficiencyReason,
): ReadinessReturnTarget | null {
  switch (reason) {
    case 'ADDITIONAL_HISTORY':
      return 'CLINICAL_IMPRESSION';
    case 'PHYSICAL_ASSESSMENT_OR_VITALS':
    case 'LABORATORY_INFORMATION':
    case 'MEDICATION_OR_ALLERGY_CLARIFICATION':
      return 'PATIENT_PROFILE';
    case 'REFERRAL_REQUIRED':
      return null;
    default:
      return null;
  }
}

export type PrescribingReadinessDecisionResult =
  | 'CONFIRMED_READY'
  | 'NOT_READY_MORE_INFORMATION'
  | 'NOT_READY_REFERRAL'
  | 'INCOMPLETE'
  | 'INVALID';

/**
 * Authoritative Prescribing Readiness decision table (v1.0).
 * Red-flag clearance is a separate prerequisite — not re-asked here.
 */
export function evaluatePrescribingReadinessDecision(input: {
  assessmentSufficient: boolean | null | undefined;
  reasonCodes?: string[] | null;
  reasonDetail?: string | null;
  nextAction?: string | null;
  returnTarget?: string | null;
}): PrescribingReadinessDecisionResult {
  if (input.assessmentSufficient == null) return 'INCOMPLETE';

  if (input.assessmentSufficient === true) {
    if (
      input.nextAction != null &&
      input.nextAction !== READINESS_NEXT_ACTIONS.CONTINUE_TO_TREATMENT
    ) {
      return 'INVALID';
    }
    if ((input.reasonCodes?.length ?? 0) > 0) return 'INVALID';
    return 'CONFIRMED_READY';
  }

  const codes = (input.reasonCodes ?? []).filter(Boolean);
  if (codes.length === 0) return 'INCOMPLETE';
  if (codes.includes(READINESS_INSUFFICIENCY_REASONS.OTHER)) {
    if (!(input.reasonDetail ?? '').trim()) return 'INCOMPLETE';
  }

  if (input.nextAction === READINESS_NEXT_ACTIONS.OBTAIN_OR_UPDATE_INFORMATION) {
    if (!input.returnTarget) return 'INCOMPLETE';
    return 'NOT_READY_MORE_INFORMATION';
  }
  if (input.nextAction === READINESS_NEXT_ACTIONS.DOCUMENT_AND_REFER) {
    return 'NOT_READY_REFERRAL';
  }
  return 'INCOMPLETE';
}

/** Lightweight fingerprint for staleness detection. */
export function computeSnapshotHash(parts: Record<string, unknown>): string {
  const raw = JSON.stringify(parts, Object.keys(parts).sort());
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `cj_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export interface ClinicalJudgmentAssessmentDto {
  id?: string;
  workingDiagnosisText: string;
  workingDiagnosisCode?: string | null;
  workingDiagnosisSystem?: string | null;
  diagnosticCertainty: DiagnosticCertainty | null;
  assessmentSummary: string;
  assessmentSummarySource?: AiContentSource | null;
  assessmentSufficient?: boolean | null;
  unresolvedRedFlags?: boolean | null;
  readinessReason?: string | null;
  impressionConfirmedAt?: string | null;
  readinessConfirmedAt?: string | null;
  sourceSnapshotHash?: string | null;
}

export interface TreatmentRationaleDto {
  id?: string;
  status: RationaleStatus;
  reasonForPrescribing: string;
  reasonSource?: AiContentSource | null;
  selectionRationale: string;
  rationaleSource?: AiContentSource | null;
  safetyMitigationSummary: string;
  safetySummarySource?: AiContentSource | null;
  reasonConfirmed?: boolean;
  selectionConfirmed?: boolean;
  alternativesConfirmed?: boolean;
  safetyConfirmed?: boolean;
  noAlternativesDocumented?: boolean;
  inputSnapshotHash?: string | null;
  safetyRunId?: string | null;
  alternatives?: TreatmentAlternativeDto[];
  confirmedAt?: string | null;
}

export interface TreatmentAlternativeDto {
  id?: string;
  category: AlternativeCategory;
  selected: boolean;
  details?: string | null;
  notSelectedReason?: string | null;
  suggestionSource?: AiContentSource | null;
}
