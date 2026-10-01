/**
 * Guided-pathway Diagnosis Confirmation + Treatment Eligibility
 * clinical-judgement continuation (section-level one-Yes threshold).
 *
 * This is not a safety-rule override. Red flags, contraindications, and
 * medication-safety blocks always take priority.
 */

export type AssessmentSectionKind = 'DIAGNOSIS_CONFIRMATION' | 'TREATMENT_ELIGIBILITY';

export type PathwayYesNo = 'YES' | 'NO';

export type ClinicalJudgementStatus =
  | 'NOT_REQUIRED'
  | 'REQUIRED'
  | 'DRAFT'
  | 'CONFIRMED'
  | 'STALE';

export type ClinicalJudgementReason =
  | 'DIAGNOSIS_UNSUPPORTED'
  | 'ELIGIBILITY_UNSUPPORTED'
  | 'DIAGNOSIS_AND_ELIGIBILITY_UNSUPPORTED';

export type PathwayDiagnosticCertainty = 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';

export type ClinicalJudgementDraftSource = 'PHARMACIST' | 'AI_ASSISTED' | 'MIXED';

export type ClinicalJudgementUiState = 'prompt' | 'form' | 'documented';

export interface PathwayAssessmentSectionConfig {
  id: string;
  kind: AssessmentSectionKind;
  title: string;
  questionIds: string[];
  supportingAnswer: 'YES';
  minimumSupportingAnswers: number;
  requireAllQuestionsAnswered: true;
  enabled: boolean;
}

export interface SectionEvaluation {
  sectionId: string;
  kind: AssessmentSectionKind;
  status: 'NOT_APPLICABLE' | 'INCOMPLETE' | 'SUPPORTED' | 'UNSUPPORTED';
  totalQuestions: number;
  answeredQuestions: number;
  yesCount: number;
  noCount: number;
  minimumSupportingAnswers: number;
}

export interface CombinedAssessmentEvaluation {
  diagnosis: SectionEvaluation;
  eligibility: SectionEvaluation;
  clinicalJudgementRequired: boolean;
  clinicalJudgementReason: ClinicalJudgementReason | null;
  canProceedToSafetyScreening: boolean;
  blockingSafetyReason: string | null;
}

export interface PathwayClinicalJudgementRecord {
  id: string;
  consultationId: string;
  pathwayId: string;
  pathwayVersion: string;
  status: ClinicalJudgementStatus;
  reason: ClinicalJudgementReason | null;
  workingDiagnosisConceptId: string | null;
  workingDiagnosisDisplay: string | null;
  diagnosticCertainty: PathwayDiagnosticCertainty | null;
  rationaleDraft: string;
  rationaleApproved: string | null;
  draftSource: ClinicalJudgementDraftSource | null;
  sourceAnswerRevision: string | null;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  noTreatmentInitiated: boolean;
  uiState: ClinicalJudgementUiState;
  createdAt: string;
  updatedAt: string;
}

export const PATHWAY_CLINICAL_JUDGEMENT_MIN_SUPPORTING = 1;
export const PATHWAY_CLINICAL_JUDGEMENT_RATIONALE_MAX = 1000;

export const DIAGNOSTIC_CERTAINTY_OPTIONS: Array<{
  value: PathwayDiagnosticCertainty;
  label: string;
}> = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROBABLE', label: 'Probable' },
  { value: 'UNCERTAIN', label: 'Uncertain' },
];

const AFFIRMATIVE = new Set(['yes', 'true', 'present', 'positive', 'y']);
const NEGATIVE = new Set(['no', 'false', 'absent', 'negative', 'n']);

export function normalizePathwayYesNo(raw: unknown): PathwayYesNo | null {
  if (raw === true) return 'YES';
  if (raw === false) return 'NO';
  const text = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (AFFIRMATIVE.has(text)) return 'YES';
  if (NEGATIVE.has(text)) return 'NO';
  return null;
}

export function evaluateSection(
  config: PathwayAssessmentSectionConfig,
  answers: Record<string, PathwayYesNo | null>,
): SectionEvaluation {
  if (!config.enabled || config.questionIds.length === 0) {
    return {
      sectionId: config.id,
      kind: config.kind,
      status: 'NOT_APPLICABLE',
      totalQuestions: 0,
      answeredQuestions: 0,
      yesCount: 0,
      noCount: 0,
      minimumSupportingAnswers: config.minimumSupportingAnswers,
    };
  }

  const values = config.questionIds.map((id) => answers[id] ?? null);
  const answeredQuestions = values.filter((v) => v !== null).length;
  const yesCount = values.filter((v) => v === 'YES').length;
  const noCount = values.filter((v) => v === 'NO').length;
  const complete = answeredQuestions === config.questionIds.length;

  return {
    sectionId: config.id,
    kind: config.kind,
    status: !complete
      ? 'INCOMPLETE'
      : yesCount >= config.minimumSupportingAnswers
        ? 'SUPPORTED'
        : 'UNSUPPORTED',
    totalQuestions: config.questionIds.length,
    answeredQuestions,
    yesCount,
    noCount,
    minimumSupportingAnswers: config.minimumSupportingAnswers,
  };
}

export function evaluateCombinedAssessment(
  diagnosis: SectionEvaluation,
  eligibility: SectionEvaluation,
  judgementStatus: ClinicalJudgementStatus,
  blockingSafetyReason: string | null,
): CombinedAssessmentEvaluation {
  const evaluated = [diagnosis, eligibility].filter((s) => s.status !== 'NOT_APPLICABLE');

  const complete = evaluated.every(
    (s) => s.status === 'SUPPORTED' || s.status === 'UNSUPPORTED',
  );

  const diagnosisUnsupported = diagnosis.status === 'UNSUPPORTED';
  const eligibilityUnsupported = eligibility.status === 'UNSUPPORTED';

  const reason: ClinicalJudgementReason | null =
    diagnosisUnsupported && eligibilityUnsupported
      ? 'DIAGNOSIS_AND_ELIGIBILITY_UNSUPPORTED'
      : diagnosisUnsupported
        ? 'DIAGNOSIS_UNSUPPORTED'
        : eligibilityUnsupported
          ? 'ELIGIBILITY_UNSUPPORTED'
          : null;

  const clinicalJudgementRequired = complete && reason !== null;
  const judgementSatisfied =
    judgementStatus === 'CONFIRMED' ||
    (judgementStatus === 'STALE' && !clinicalJudgementRequired);

  return {
    diagnosis,
    eligibility,
    clinicalJudgementRequired,
    clinicalJudgementReason: reason,
    canProceedToSafetyScreening:
      blockingSafetyReason === null &&
      complete &&
      (!clinicalJudgementRequired || judgementSatisfied),
    blockingSafetyReason,
  };
}

export function clinicalJudgementPromptCopy(reason: ClinicalJudgementReason | null): {
  title: string;
  body: string;
} {
  const title = 'Clinical judgement needed';
  if (reason === 'DIAGNOSIS_UNSUPPORTED') {
    return {
      title,
      body: 'The responses do not fully support the diagnosis through the guided questions. You may continue if your overall assessment supports this condition.',
    };
  }
  if (reason === 'ELIGIBILITY_UNSUPPORTED') {
    return {
      title,
      body: 'The responses do not fully support treatment through the standard pathway. You may continue if your assessment supports proceeding.',
    };
  }
  return {
    title,
    body: 'The responses do not fully support the diagnosis or treatment through the standard pathway. You may continue based on your clinical assessment.',
  };
}

export function clinicalJudgementNoteFragment(input: {
  reason: ClinicalJudgementReason | null;
  workingDiagnosis: string;
  diagnosticCertainty: PathwayDiagnosticCertainty | null;
  rationale: string;
}): string {
  const support =
    input.reason === 'DIAGNOSIS_UNSUPPORTED'
      ? 'the diagnosis'
      : input.reason === 'ELIGIBILITY_UNSUPPORTED'
        ? 'treatment suitability'
        : 'the diagnosis and treatment suitability';
  const certaintyLabel =
    DIAGNOSTIC_CERTAINTY_OPTIONS.find((o) => o.value === input.diagnosticCertainty)?.label ??
    'unspecified';
  const diagnosis = input.workingDiagnosis.trim() || 'the selected condition';
  const rationale = input.rationale.trim();
  return `The guided pathway responses did not fully support ${support}. The pharmacist continued using clinical judgement. Working diagnosis: ${diagnosis} (${certaintyLabel}). Rationale: ${rationale}`;
}

export const NO_TREATMENT_NOTE_FRAGMENT =
  'The guided assessment responses did not fully support proceeding through the standard treatment pathway. No pharmacist treatment was initiated.';

export function computeSourceAnswerRevision(input: {
  pathwayId: string;
  pathwayVersion: string;
  diagnosisAnswers: Array<{ questionId: string; answer: PathwayYesNo | null }>;
  eligibilityAnswers: Array<{ questionId: string; answer: PathwayYesNo | null }>;
}): string {
  const canonical = JSON.stringify({
    pathwayId: input.pathwayId,
    pathwayVersion: input.pathwayVersion,
    diagnosisAnswers: input.diagnosisAnswers,
    eligibilityAnswers: input.eligibilityAnswers,
  });
  return `v1:${fnv1aHex(canonical)}`;
}

export function isClinicalJudgementFormValid(input: {
  workingDiagnosisDisplay: string | null | undefined;
  diagnosticCertainty: PathwayDiagnosticCertainty | null | undefined;
  rationale: string | null | undefined;
}): boolean {
  return (
    Boolean(input.workingDiagnosisDisplay?.trim()) &&
    Boolean(input.diagnosticCertainty) &&
    Boolean(input.rationale?.trim()) &&
    (input.rationale?.trim().length ?? 0) <= PATHWAY_CLINICAL_JUDGEMENT_RATIONALE_MAX
  );
}

export function confirmBlockedReason(input: {
  workingDiagnosisDisplay: string | null | undefined;
  diagnosticCertainty: PathwayDiagnosticCertainty | null | undefined;
  rationale: string | null | undefined;
  pending?: boolean;
}): string {
  if (input.pending) return 'Wait for the current save to finish.';
  if (!input.workingDiagnosisDisplay?.trim()) return 'Working diagnosis is required.';
  if (!input.diagnosticCertainty) return 'Select diagnostic certainty.';
  if (!input.rationale?.trim()) return 'Enter a reason for continuing.';
  if ((input.rationale?.trim().length ?? 0) > PATHWAY_CLINICAL_JUDGEMENT_RATIONALE_MAX) {
    return `Reason for continuing must be ${PATHWAY_CLINICAL_JUDGEMENT_RATIONALE_MAX} characters or fewer.`;
  }
  return '';
}

export function emptySectionEvaluation(
  kind: AssessmentSectionKind,
  sectionId = kind.toLowerCase(),
): SectionEvaluation {
  return {
    sectionId,
    kind,
    status: 'NOT_APPLICABLE',
    totalQuestions: 0,
    answeredQuestions: 0,
    yesCount: 0,
    noCount: 0,
    minimumSupportingAnswers: PATHWAY_CLINICAL_JUDGEMENT_MIN_SUPPORTING,
  };
}

export function defaultSectionConfig(
  kind: AssessmentSectionKind,
  questionIds: string[],
  title: string,
): PathwayAssessmentSectionConfig {
  return {
    id: kind === 'DIAGNOSIS_CONFIRMATION' ? 'diagnosis-confirmation' : 'treatment-eligibility',
    kind,
    title,
    questionIds,
    supportingAnswer: 'YES',
    minimumSupportingAnswers: PATHWAY_CLINICAL_JUDGEMENT_MIN_SUPPORTING,
    requireAllQuestionsAnswered: true,
    enabled: questionIds.length > 0,
  };
}

export function answersFromQuestionResponses(
  questionIds: string[],
  responses: Record<string, { answer?: unknown; answerText?: unknown } | undefined>,
): Record<string, PathwayYesNo | null> {
  const out: Record<string, PathwayYesNo | null> = {};
  for (const id of questionIds) {
    const row = responses[id];
    out[id] = normalizePathwayYesNo(row?.answerText ?? row?.answer);
  }
  return out;
}

export function classifyPathwayQuestionSection(
  sectionName?: string | null,
): AssessmentSectionKind | null {
  const key = (sectionName ?? '').replace(/[\s_-]/g, '').toLowerCase();
  if (!key) return 'DIAGNOSIS_CONFIRMATION';
  if (
    key === 'treatmenteligibility' ||
    key === 'safetyscreening' ||
    key === 'redflags'
  ) {
    return 'TREATMENT_ELIGIBILITY';
  }
  if (
    key === 'diagnosisconfirmation' ||
    key === 'presentingconcern' ||
    key === 'typicalfeatures' ||
    key === 'presentationreview'
  ) {
    return 'DIAGNOSIS_CONFIRMATION';
  }
  return null;
}

export function orderedAnswerPairs(
  questionIds: string[],
  answers: Record<string, PathwayYesNo | null>,
): Array<{ questionId: string; answer: PathwayYesNo | null }> {
  return questionIds.map((questionId) => ({
    questionId,
    answer: answers[questionId] ?? null,
  }));
}

export function evaluatePathwayAssessment(input: {
  diagnosisQuestionIds: string[];
  eligibilityQuestionIds: string[];
  responses: Record<string, { answer?: unknown; answerText?: unknown } | undefined>;
  judgementStatus: ClinicalJudgementStatus;
  blockingSafetyReason?: string | null;
  diagnosisTitle?: string;
  eligibilityTitle?: string;
}): {
  diagnosisConfig: PathwayAssessmentSectionConfig;
  eligibilityConfig: PathwayAssessmentSectionConfig;
  diagnosisAnswers: Record<string, PathwayYesNo | null>;
  eligibilityAnswers: Record<string, PathwayYesNo | null>;
  evaluation: CombinedAssessmentEvaluation;
} {
  const diagnosisConfig = defaultSectionConfig(
    'DIAGNOSIS_CONFIRMATION',
    input.diagnosisQuestionIds,
    input.diagnosisTitle ?? 'Diagnosis Confirmation',
  );
  const eligibilityConfig = defaultSectionConfig(
    'TREATMENT_ELIGIBILITY',
    input.eligibilityQuestionIds,
    input.eligibilityTitle ?? 'Treatment Eligibility',
  );
  const diagnosisAnswers = answersFromQuestionResponses(
    diagnosisConfig.questionIds,
    input.responses,
  );
  const eligibilityAnswers = answersFromQuestionResponses(
    eligibilityConfig.questionIds,
    input.responses,
  );
  const evaluation = evaluateCombinedAssessment(
    evaluateSection(diagnosisConfig, diagnosisAnswers),
    evaluateSection(eligibilityConfig, eligibilityAnswers),
    input.judgementStatus,
    input.blockingSafetyReason ?? null,
  );
  return { diagnosisConfig, eligibilityConfig, diagnosisAnswers, eligibilityAnswers, evaluation };
}

function fnv1aHex(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
