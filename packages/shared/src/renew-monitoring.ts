/**
 * SafeScribe Renew — Step 3 monitoring & safety types and completion helpers.
 * Rules decide what is required. AI extracts candidates. The pharmacist confirms.
 */

import { isoCalendarDateError, isoDateLocal, toIsoCalendarDate } from './patient-age';

export const RENEW_MONITORING_STATUSES = [
  'PENDING',
  'AVAILABLE',
  'UNAVAILABLE',
  'CONCERNING',
] as const;
export type RenewMonitoringStatus = (typeof RENEW_MONITORING_STATUSES)[number];

export const RENEW_MONITORING_INPUT_TYPES = ['VITAL', 'LAB', 'PATIENT_CONTEXT'] as const;
export type RenewMonitoringInputType = (typeof RENEW_MONITORING_INPUT_TYPES)[number];

export const RENEW_MONITORING_VALUE_SHAPES = [
  'NUMERIC',
  'SYSTOLIC_DIASTOLIC',
  'YES_NO',
  'NUMBER',
  'TEXT',
] as const;
export type RenewMonitoringValueShape = (typeof RENEW_MONITORING_VALUE_SHAPES)[number];

export const RENEW_MONITORING_SOURCES = [
  'MANUAL',
  'PASTED_SCREENSHOT',
  'UPLOADED_DOCUMENT',
] as const;
export type RenewMonitoringSource = (typeof RENEW_MONITORING_SOURCES)[number];

export const RENEW_UNAVAILABLE_REASONS = [
  {
    id: 'NOT_AVAILABLE_AT_THIS_TIME',
    label: 'Not available at this time',
    shortLabel: 'Not available at this time',
  },
  {
    id: 'NO_RECENT_RESULT',
    label: 'No recent result available',
    shortLabel: 'No recent result',
  },
  {
    id: 'PATIENT_UNABLE_TO_PROVIDE',
    label: 'Patient unable to provide result',
    shortLabel: 'Patient unable to provide',
  },
  {
    id: 'EXTERNAL_MONITORING_NOT_ACCESSIBLE',
    label: 'Unable to access external result',
    shortLabel: 'Unable to access external result',
  },
  {
    id: 'MANAGED_ELSEWHERE',
    label: 'Monitoring managed elsewhere',
    shortLabel: 'Managed elsewhere',
  },
  {
    id: 'PATIENT_DECLINED',
    label: 'Patient declined',
    shortLabel: 'Patient declined',
  },
  {
    id: 'OTHER',
    label: 'Other',
    shortLabel: 'Other',
  },
  {
    id: 'netcare_record',
    label: 'Netcare / provincial record unavailable',
    shortLabel: 'Netcare unavailable',
  },
  {
    id: 'access_fob',
    label: 'Access/fob issue',
    shortLabel: 'Access/fob issue',
  },
  {
    id: 'no_recent_result',
    label: 'No recent result found',
    shortLabel: 'No recent result',
  },
  {
    id: 'patient_unknown',
    label: 'Patient does not know result',
    shortLabel: 'Patient does not know result',
  },
  {
    id: 'prescriber_pharmacy',
    label: 'Unable to contact prescriber/pharmacy',
    shortLabel: 'Unable to contact prescriber',
  },
  {
    id: 'other',
    label: 'Other',
    shortLabel: 'Other',
  },
] as const;
export type RenewUnavailableReasonId = (typeof RENEW_UNAVAILABLE_REASONS)[number]['id'];

export const CONTEXT_REMOVAL_REASONS = [
  { id: 'NOT_APPLICABLE_PATIENT', label: 'Not applicable to this patient' },
  { id: 'NOT_APPLICABLE_INDICATION', label: 'Not applicable to current indication' },
  { id: 'THERAPY_CONTEXT_CHANGED', label: 'Therapy/context changed' },
  { id: 'ADDRESSED_ELSEWHERE', label: 'Already addressed elsewhere' },
  { id: 'RULE_APPEARS_INCORRECT', label: 'Rule appears incorrect' },
  { id: 'OTHER', label: 'Other' },
] as const;
export type ContextRemovalReasonId = (typeof CONTEXT_REMOVAL_REASONS)[number]['id'];

export const CONTEXT_REMOVAL_REASON_IDS = CONTEXT_REMOVAL_REASONS.map((row) => row.id);

export const MONITORING_REMOVAL_REASONS = [
  { id: 'NOT_CLINICALLY_RELEVANT', label: 'Not clinically relevant to this patient' },
  { id: 'MANAGED_ELSEWHERE', label: 'Monitoring managed elsewhere' },
  { id: 'NO_LONGER_APPLICABLE', label: 'No longer applicable to current therapy' },
  { id: 'RULE_ADDED_IN_ERROR', label: 'Added by rule in error' },
  { id: 'OTHER', label: 'Other' },
] as const;
export type MonitoringRemovalReasonId = (typeof MONITORING_REMOVAL_REASONS)[number]['id'];

export const MONITORING_REMOVAL_REASON_IDS = MONITORING_REMOVAL_REASONS.map((row) => row.id);

export const RENEW_UNAVAILABLE_REASON_UI = [
  {
    id: 'NO_RECENT_RESULT',
    label: 'No recent result available',
    shortLabel: 'No recent result',
  },
  {
    id: 'EXTERNAL_MONITORING_NOT_ACCESSIBLE',
    label: 'Unable to access external result',
    shortLabel: 'Unable to access external result',
  },
  {
    id: 'PATIENT_UNABLE_TO_PROVIDE',
    label: 'Patient unable to provide result',
    shortLabel: 'Patient unable to provide',
  },
  {
    id: 'MANAGED_ELSEWHERE',
    label: 'Monitoring managed elsewhere',
    shortLabel: 'Managed elsewhere',
  },
  {
    id: 'OTHER',
    label: 'Other',
    shortLabel: 'Other',
  },
] as const;

export type MonitoringPresentationTier = 'CORE' | 'ADDITIONAL' | 'HIDDEN_UNTIL_TRIGGERED';

export interface RemovedConditionalQuestion {
  questionRuleId: string;
  reasonCode: ContextRemovalReasonId;
  reasonText?: string | null;
  removedAt: string;
  removedByUserId?: string | null;
}

export interface RemovedMonitoringItem {
  inputCode: string;
  reasonCode: MonitoringRemovalReasonId;
  reasonText?: string | null;
  removedAt: string;
  removedByUserId?: string | null;
}

export type ContextChoice = 'yes' | 'no' | 'unknown';

export const CONTEXT_UNABLE_REASONS = [
  { id: 'PATIENT_UNABLE', label: 'Patient unable to provide information' },
  { id: 'PATIENT_UNAVAILABLE', label: 'Patient/caregiver not available' },
  { id: 'INSUFFICIENT_INFORMATION', label: 'Insufficient information' },
  { id: 'UNABLE_TO_VERIFY', label: 'Unable to verify at this time' },
  { id: 'OTHER', label: 'Other' },
] as const;
export type ContextUnableReasonId = (typeof CONTEXT_UNABLE_REASONS)[number]['id'];

export const CONTEXT_FINDING_ONSET_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'few_days', label: 'Past few days' },
  { id: 'past_week', label: 'Past week' },
  { id: 'longer', label: 'Longer than a week' },
  { id: 'unknown', label: 'Unknown' },
] as const;

export const CONTEXT_FINDING_SEVERITY_OPTIONS = [
  { id: 'mild', label: 'Mild' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'severe', label: 'Severe' },
  { id: 'unknown', label: 'Unknown' },
] as const;

export const CONTEXT_FINDING_ACTIONS = [
  { id: 'CONTINUE_DOCUMENTED', label: 'Continue renewal with documented judgment' },
  { id: 'OBTAIN_MORE_INFO', label: 'Obtain more information' },
  { id: 'SHORTEN_RENEWAL', label: 'Shorten renewal' },
  { id: 'CONTACT_PRESCRIBER', label: 'Contact prescriber' },
  { id: 'DO_NOT_RENEW', label: 'Do not renew' },
  { id: 'OTHER', label: 'Other' },
] as const;
export type ContextFindingActionId = (typeof CONTEXT_FINDING_ACTIONS)[number]['id'];

export type ContextFindingSeverity = 'CONCERN' | 'REVIEW_REQUIRED' | 'ACTION_REQUIRED';

export interface PatientContextFollowup {
  onset?: string | null;
  severity?: string | null;
  details?: string | null;
  action?: string | null;
  completed?: boolean;
}

export const RENEW_CONTEXT_ANSWER_STATUSES = ['ANSWERED', 'UNKNOWN', 'UNAVAILABLE'] as const;
export type RenewContextAnswerStatus = (typeof RENEW_CONTEXT_ANSWER_STATUSES)[number];

export interface RenewMonitoringValue {
  numericValue: number | null;
  secondaryNumericValue: number | null;
  valueText: string | null;
  unit: string | null;
}

export interface RenewMonitoringResult {
  inputCode: string;
  status: RenewMonitoringStatus;
  value: RenewMonitoringValue | null;
  observedDate: string | null;
  sourceType: RenewMonitoringSource | null;
  sourceLabel: string | null;
  note: string | null;
  pharmacistConfirmed: boolean;
}

export interface RenewPatientContextAnswer {
  inputCode: string;
  status: RenewContextAnswerStatus;
  valueText: string | null;
  numericValue: number | null;
  pharmacistConfirmed: boolean;
  source?: 'MANUAL' | 'BULK_NO_CONCERNS';
  bulkActionId?: string | null;
  note?: string | null;
  unableReasonCode?: string | null;
  unableReasonText?: string | null;
  followup?: PatientContextFollowup | null;
  /** Display unit the pharmacist entered (canonical value is numericValue). */
  enteredUnit?: string | null;
  sourceDate?: string | null;
}

export interface ExtractedMonitoringCandidate {
  inputCode: string;
  valueText: string | null;
  numericValue: number | null;
  secondaryNumericValue: number | null;
  unit: string | null;
  observedDate: string | null;
  sourceLabel: string | null;
  confidence: number | null;
  evidenceText: string | null;
}

export interface RenewMonitoringExtraction {
  id: string;
  sourceType: 'PASTED_SCREENSHOT' | 'UPLOADED_DOCUMENT';
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';
  candidates: ExtractedMonitoringCandidate[];
  extraDetectedCount: number;
  createdAt: string;
}

export const MONITORING_REVIEW_ACTIONS = [
  'CONTINUE_AND_MONITOR',
  'SHORTER_RENEWAL',
  'FOLLOW_UP_WITH_PRESCRIBER',
  'DO_NOT_RENEW_MEDICATION',
  'CONTACT_PRESCRIBER',
  'REFER',
  'ADJUST_PLAN',
  'OTHER',
] as const;
export type MonitoringReviewAction = (typeof MONITORING_REVIEW_ACTIONS)[number];

export const MONITORING_REVIEW_ACTION_OPTIONS: Array<{
  id: MonitoringReviewAction;
  label: string;
  reviewLabel: string;
  summaryLabel: string;
  hardStop?: boolean;
}> = [
  {
    id: 'CONTINUE_AND_MONITOR',
    label: 'Continue renewal and monitor',
    reviewLabel: 'Continue and monitor',
    summaryLabel: 'Continue and monitor',
  },
  {
    id: 'SHORTER_RENEWAL',
    label: 'Shorter renewal / reassess sooner',
    reviewLabel: 'Shorter renewal',
    summaryLabel: 'Shorter renewal planned',
  },
  {
    id: 'FOLLOW_UP_WITH_PRESCRIBER',
    label: 'Recommend follow-up with prescriber',
    reviewLabel: 'Recommend follow-up with prescriber',
    summaryLabel: 'Follow-up recommended',
  },
  {
    id: 'DO_NOT_RENEW_MEDICATION',
    label: 'Do not renew related medication',
    reviewLabel: 'Do not renew related medication',
    summaryLabel: 'Medication not selected for renewal',
    hardStop: true,
  },
  {
    id: 'CONTACT_PRESCRIBER',
    label: 'Contact prescriber',
    reviewLabel: 'Contact prescriber',
    summaryLabel: 'Prescriber to be contacted',
  },
  {
    id: 'REFER',
    label: 'Refer for assessment',
    reviewLabel: 'Refer for assessment',
    summaryLabel: 'Referral planned',
  },
  {
    id: 'ADJUST_PLAN',
    label: 'Adjust / change plan',
    reviewLabel: 'Adjust / change plan',
    summaryLabel: 'Plan to be adjusted',
  },
  {
    id: 'OTHER',
    label: 'Other',
    reviewLabel: 'Other',
    summaryLabel: 'Other action documented',
  },
];

export interface RenewMonitoringItemReview {
  inputCode: string;
  action: MonitoringReviewAction;
  note: string | null;
  reviewedAt: string;
  otherText?: string | null;
  affectedMedicationIds?: string[];
  shorterDurationId?: string | null;
}

export const RENEW_SAFETY_REPOSITORY = {
  name: 'SafeScribe Clinical Safety Repository',
  releaseId: 'KR-2026.08.17.520',
  updatedOn: '2026-08-17',
} as const;

export interface RenewMonitoringSafetyState {
  results: RenewMonitoringResult[];
  contextAnswers: RenewPatientContextAnswer[];
  extractions: RenewMonitoringExtraction[];
  acknowledgedFindingKeys: string[];
  itemReviews: RenewMonitoringItemReview[];
  completed: boolean;
  completedAt: string | null;
  requirementFingerprint: string | null;
  removedContextQuestions: RemovedConditionalQuestion[];
  removedMonitoringItems: RemovedMonitoringItem[];
  extraMonitoringCodes: string[];
  contextAdditionalNote: string | null;
  patientContextConfirmed: boolean;
  lastContextBulkActionId: string | null;
  patientContextBulkAcked: boolean;
  monitoringConfirmed: boolean;
}

export interface RenewMonitoringInputDef {
  code: string;
  label: string;
  inputType: RenewMonitoringInputType;
  valueShape: RenewMonitoringValueShape;
  unit: string | null;
  aliases: string[];
  displayPriority: number;
  uiComponent?: string | null;
  allowDate?: boolean;
  allowNotAvailable?: boolean;
  normalRangeDisplay?: string | null;
}

export interface RenewMonitoringRequirement {
  inputCode: string;
  label: string;
  inputType: Exclude<RenewMonitoringInputType, 'PATIENT_CONTEXT'>;
  valueShape: RenewMonitoringValueShape;
  unit: string | null;
  medicationIds: string[];
  medicationNames: string[];
  result: RenewMonitoringResult;
  requirement?: string;
  freshnessDays?: number | null;
  actionIfMissing?: string;
  sourceRuleIds?: string[];
  allowDate?: boolean;
  allowNotAvailable?: boolean;
  normalRangeDisplay?: string | null;
  presentationTier?: MonitoringPresentationTier;
  removable?: boolean;
  overrideRequiresReason?: boolean;
  addedManually?: boolean;
  addedBecause?: string | null;
}

export interface RenewPatientContextRequirement {
  inputCode: string;
  label: string;
  valueShape: RenewMonitoringValueShape;
  unit: string | null;
  medicationIds: string[];
  medicationNames: string[];
  trigger?: { sourceCode: string; operator: 'EQ'; value: string } | null;
  visible: boolean;
  answer: RenewPatientContextAnswer;
  uiComponent?: string | null;
  enumOptions?: string[];
  actionOnTrigger?: string | null;
  followupPrompt?: string | null;
  /** Concise concern label for collapsed review summary (e.g. "Muscle pain/weakness"). */
  reviewSummaryLabel?: string | null;
  allowNotAvailable?: boolean;
  triggerAnswer?: 'YES' | 'NO' | 'UNKNOWN' | string | null;
  stableAnswer?: 'YES' | 'NO' | 'UNKNOWN' | null;
  bulkApplyAllowed?: boolean;
  removable?: boolean;
  priorValue?: {
    numericValue: number;
    unit: string;
    observedDate: string | null;
    sourceLabel?: string | null;
  } | null;
}

export interface RenewSafetyFindingSummary {
  key: string;
  summary: string;
  detail: string;
  clinicalSeverity: string;
  recommendedAction: string | null;
  inputCode: string | null;
}

export interface RenewSafetySummary {
  status: 'clear' | 'review_required' | 'unavailable';
  headline: string;
  detail: string;
  findings: RenewSafetyFindingSummary[];
  unavailableCount: number;
}

export interface RenewMonitoringGate {
  ok: boolean;
  pendingMonitoringCodes: string[];
  pendingContextCodes: string[];
  unacknowledgedFindingCount: number;
  blockingReviewCodes: string[];
}

export interface RenewStep3View {
  patientContext: RenewPatientContextRequirement[];
  monitoring: RenewMonitoringRequirement[];
  safetySummary: RenewSafetySummary;
  gate: RenewMonitoringGate;
  sections: Array<'PATIENT_CONTEXT' | 'MONITORING' | 'SAFETY_REVIEW'>;
  pendingExtraction: RenewMonitoringExtraction | null;
  itemReviews: RenewMonitoringItemReview[];
  indications: Array<{ code: string | null; label: string }>;
  uncoveredMedications?: Array<{ id: string; name: string }>;
  usedPublishedConfig?: boolean;
  removedContextQuestions?: Array<RemovedConditionalQuestion & { label: string; medicationNames: string[] }>;
  removedMonitoringItems?: Array<RemovedMonitoringItem & { label: string; medicationNames: string[] }>;
  additionalMonitoring?: RenewMonitoringRequirement[];
  otherResultOptions?: Array<{ inputCode: string; label: string; unit: string | null }>;
  contextAdditionalNote?: string | null;
  patientContextConfirmed?: boolean;
  lastContextBulkActionId?: string | null;
  patientContextBulkAcked?: boolean;
  monitoringConfirmed?: boolean;
}

export function emptyMonitoringSafety(): RenewMonitoringSafetyState {
  return {
    results: [],
    contextAnswers: [],
    extractions: [],
    acknowledgedFindingKeys: [],
    itemReviews: [],
    completed: false,
    completedAt: null,
    requirementFingerprint: null,
    removedContextQuestions: [],
    removedMonitoringItems: [],
    extraMonitoringCodes: [],
    contextAdditionalNote: null,
    patientContextConfirmed: false,
    lastContextBulkActionId: null,
    patientContextBulkAcked: false,
    monitoringConfirmed: false,
  };
}

export function isEmptyMonitoringSafety(state: RenewMonitoringSafetyState | null | undefined): boolean {
  if (!state) return true;
  return (
    !state.results.length &&
    !state.contextAnswers.length &&
    !state.extractions.length &&
    !state.completed
  );
}

export function formatMonitoringResult(result: RenewMonitoringResult, unit?: string | null): string {
  if (result.status === 'UNAVAILABLE') return '—';
  const value = result.value;
  if (!value) return '—';
  const displayUnit = value.unit || unit || '';
  if (value.numericValue != null && value.secondaryNumericValue != null) {
    return `${formatNumber(value.numericValue)} / ${formatNumber(value.secondaryNumericValue)}${displayUnit ? ` ${displayUnit}` : ''}`;
  }
  if (value.numericValue != null) {
    return `${formatNumber(value.numericValue)}${displayUnit ? ` ${displayUnit}` : ''}`;
  }
  return value.valueText?.trim() || '—';
}

export type MonitoringResultEditorKind = 'systolic_diastolic' | 'numeric' | 'yes_no' | 'text';

export interface MonitoringResultDraft {
  systolic: string;
  diastolic: string;
  numeric: string;
  text: string;
  unit: string;
  observedDate: string;
  sourceLabel: string;
}

export interface MonitoringResultSaveBody {
  numericValue?: number | null;
  secondaryNumericValue?: number | null;
  valueText?: string | null;
  unit?: string | null;
  observedDate?: string | null;
  sourceLabel?: string | null;
}

export type MonitoringResultEditorItem = Pick<
  RenewMonitoringRequirement,
  'inputCode' | 'label' | 'inputType' | 'valueShape' | 'unit' | 'result'
>;

/** Accepted alternate units keyed by input code. Canonical unit from the library always comes first. */
const MONITORING_UNIT_ALTERNATES: Record<string, readonly string[]> = {
  BP: ['mmHg'],
  HR: ['bpm'],
  EGFR: ['mL/min/1.73m²', 'mL/min'],
  CREATININE: ['µmol/L', 'mg/dL'],
  POTASSIUM: ['mmol/L', 'mEq/L'],
  TSH: ['mIU/L', 'µIU/mL'],
  A1C: ['%'],
  GESTATIONAL_AGE: ['weeks'],
  HEMOGLOBIN: ['g/L', 'g/dL'],
  SODIUM: ['mmol/L', 'mEq/L'],
  URINE_ACR: ['mg/mmol'],
  VITAMIN_B12: ['pmol/L'],
  B12: ['pmol/L'],
};

const MONITORING_RESULT_PLACEHOLDERS: Record<string, { primary: string; secondary?: string }> = {
  BP: { primary: '132', secondary: '78' },
  HR: { primary: '72' },
  EGFR: { primary: '68' },
  CREATININE: { primary: '82' },
  POTASSIUM: { primary: '4.2' },
  TSH: { primary: '2.3' },
  A1C: { primary: '6.8' },
  INR: { primary: '2.1' },
};

export function monitoringResultEditorKind(
  shape: RenewMonitoringValueShape | null | undefined,
): MonitoringResultEditorKind {
  if (shape === 'SYSTOLIC_DIASTOLIC') return 'systolic_diastolic';
  if (shape === 'NUMERIC' || shape === 'NUMBER') return 'numeric';
  if (shape === 'YES_NO') return 'yes_no';
  return 'text';
}

export function emptyMonitoringResultDraft(): MonitoringResultDraft {
  return {
    systolic: '',
    diastolic: '',
    numeric: '',
    text: '',
    unit: '',
    observedDate: '',
    sourceLabel: '',
  };
}

export function resolveMonitoringItem<T extends { inputCode: string }>(
  items: T[],
  code: string | null | undefined,
): T | null {
  if (!items.length) return null;
  if (code) {
    const match = items.find((row) => row.inputCode === code);
    if (match) return match;
  }
  return items[0] ?? null;
}

export function unitsForMonitoringItem(item: {
  inputCode: string;
  unit: string | null;
  result: { value?: { unit?: string | null } | null };
}): string[] {
  const units: string[] = [];
  const add = (raw: string | null | undefined) => {
    const unit = raw?.trim();
    if (unit && !units.includes(unit)) units.push(unit);
  };
  add(item.unit);
  add(item.result.value?.unit);
  for (const unit of MONITORING_UNIT_ALTERNATES[item.inputCode] ?? []) add(unit);
  return units;
}

export function monitoringResultPlaceholders(
  inputCode: string,
  shape: RenewMonitoringValueShape,
): { primary: string; secondary?: string } {
  const known = MONITORING_RESULT_PLACEHOLDERS[inputCode];
  if (known) return known;
  if (shape === 'SYSTOLIC_DIASTOLIC') return { primary: '132', secondary: '78' };
  return { primary: 'Value' };
}

export function hydrateMonitoringResultDraft(
  item: MonitoringResultEditorItem,
  carry?: Pick<MonitoringResultDraft, 'observedDate' | 'sourceLabel'> | null,
): MonitoringResultDraft {
  const value = item.result.value;
  const kind = monitoringResultEditorKind(item.valueShape);
  const units = unitsForMonitoringItem(item);
  const draft: MonitoringResultDraft = {
    systolic:
      kind === 'systolic_diastolic' && value?.numericValue != null ? String(value.numericValue) : '',
    diastolic:
      kind === 'systolic_diastolic' && value?.secondaryNumericValue != null
        ? String(value.secondaryNumericValue)
        : '',
    numeric: kind === 'numeric' && value?.numericValue != null ? String(value.numericValue) : '',
    text: kind === 'yes_no' || kind === 'text' ? (value?.valueText ?? '') : '',
    unit: value?.unit?.trim() || item.unit?.trim() || units[0] || '',
    observedDate: item.result.observedDate ?? '',
    sourceLabel: item.result.sourceLabel ?? '',
  };
  if (!draft.observedDate && carry?.observedDate) draft.observedDate = carry.observedDate;
  if (!draft.sourceLabel && carry?.sourceLabel) draft.sourceLabel = carry.sourceLabel;
  return draft;
}

export function monitoringResultDraftsEqual(a: MonitoringResultDraft, b: MonitoringResultDraft): boolean {
  return (
    a.systolic === b.systolic &&
    a.diastolic === b.diastolic &&
    a.numeric === b.numeric &&
    a.text === b.text &&
    a.unit === b.unit &&
    a.observedDate === b.observedDate &&
    a.sourceLabel === b.sourceLabel
  );
}

export function validateMonitoringResultDraft(
  item: Pick<MonitoringResultEditorItem, 'label' | 'valueShape'>,
  draft: MonitoringResultDraft,
): string | null {
  const kind = monitoringResultEditorKind(item.valueShape);
  if (kind === 'systolic_diastolic') {
    if (!draft.systolic.trim() || !draft.diastolic.trim()) {
      return 'Enter both systolic and diastolic values.';
    }
    if (!Number.isFinite(Number(draft.systolic)) || !Number.isFinite(Number(draft.diastolic))) {
      return 'Enter numeric blood pressure values.';
    }
  } else if (kind === 'numeric') {
    if (!draft.numeric.trim() || !Number.isFinite(Number(draft.numeric))) {
      return `Enter a ${item.label} value.`;
    }
  } else if (kind === 'yes_no') {
    const answer = draft.text.trim().toLowerCase();
    if (answer !== 'yes' && answer !== 'no') return `Select a ${item.label} answer.`;
  } else if (!draft.text.trim()) {
    return `Enter a ${item.label} value.`;
  }
  return isoCalendarDateError(draft.observedDate, { max: isoDateLocal() });
}

export function buildMonitoringResultSaveBody(
  item: Pick<MonitoringResultEditorItem, 'valueShape' | 'unit'>,
  draft: MonitoringResultDraft,
): MonitoringResultSaveBody {
  const kind = monitoringResultEditorKind(item.valueShape);
  const observedDate = toIsoCalendarDate(draft.observedDate);
  const sourceLabel = draft.sourceLabel.trim() || null;
  const selectedUnit = draft.unit.trim() || item.unit || null;

  if (kind === 'systolic_diastolic') {
    return {
      numericValue: Number(draft.systolic),
      secondaryNumericValue: Number(draft.diastolic),
      valueText: `${draft.systolic} / ${draft.diastolic}`,
      unit: selectedUnit,
      observedDate,
      sourceLabel,
    };
  }
  if (kind === 'numeric') {
    return {
      numericValue: Number(draft.numeric),
      secondaryNumericValue: null,
      valueText: draft.numeric,
      unit: selectedUnit,
      observedDate,
      sourceLabel,
    };
  }
  return {
    numericValue: null,
    secondaryNumericValue: null,
    valueText: draft.text.trim() || null,
    unit: kind === 'yes_no' ? null : selectedUnit,
    observedDate,
    sourceLabel,
  };
}

export function formatMonitoringDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  return toIsoCalendarDate(iso) ?? iso.trim();
}

export function formatMonitoringResultWithDate(
  result: RenewMonitoringResult,
  unit?: string | null,
): string {
  if (result.status === 'UNAVAILABLE' || result.status === 'PENDING') return '—';
  const value = formatMonitoringResult(result, unit);
  if (!value || value === '—') return value;
  if (!result.observedDate?.trim()) return `${value} · Date unavailable`;
  return `${value} · ${formatMonitoringDate(result.observedDate)}`;
}

const UNAVAILABLE_NOTE_SEPARATOR = ' — ';

const LEGACY_UNAVAILABLE_REASON_IDS: Record<string, RenewUnavailableReasonId> = {
  'Record unavailable': 'netcare_record',
  'Netcare unavailable': 'netcare_record',
  'Prescriber / pharmacy record not accessible': 'prescriber_pharmacy',
  'No recent result available': 'no_recent_result',
  'Patient unable to provide result': 'patient_unknown',
};

export function unavailableReasonById(id: string | null | undefined) {
  return RENEW_UNAVAILABLE_REASONS.find((row) => row.id === id) ?? null;
}

export function composeUnavailableNote(
  reasonId: RenewUnavailableReasonId | null | undefined,
  extra?: string | null,
): string | null {
  const reason = unavailableReasonById(reasonId);
  const extraText = extra?.trim() || '';
  if (!reason) return extraText || null;
  if (reason.id === 'other' || reason.id === 'OTHER') return extraText || reason.label;
  return extraText ? `${reason.label}${UNAVAILABLE_NOTE_SEPARATOR}${extraText}` : reason.label;
}

export function parseUnavailableNote(note: string | null | undefined): {
  reasonId: RenewUnavailableReasonId | null;
  reasonLabel: string | null;
  shortLabel: string;
  extra: string | null;
} {
  const text = note?.trim() || '';
  if (!text) {
    return { reasonId: null, reasonLabel: null, shortLabel: 'Not available', extra: null };
  }

  for (const reason of RENEW_UNAVAILABLE_REASONS) {
    if (text === reason.label || text === reason.shortLabel) {
      return {
        reasonId: reason.id,
        reasonLabel: reason.label,
        shortLabel: reason.shortLabel,
        extra: null,
      };
    }
    const prefix = `${reason.label}${UNAVAILABLE_NOTE_SEPARATOR}`;
    if (text.startsWith(prefix)) {
      return {
        reasonId: reason.id,
        reasonLabel: reason.label,
        shortLabel: reason.shortLabel,
        extra: text.slice(prefix.length).trim() || null,
      };
    }
  }

  for (const [legacy, id] of Object.entries(LEGACY_UNAVAILABLE_REASON_IDS)) {
    const reason = unavailableReasonById(id);
    if (!reason) continue;
    if (text === legacy) {
      return {
        reasonId: reason.id,
        reasonLabel: reason.label,
        shortLabel: reason.shortLabel,
        extra: null,
      };
    }
    const prefix = `${legacy}${UNAVAILABLE_NOTE_SEPARATOR}`;
    if (text.startsWith(prefix)) {
      return {
        reasonId: reason.id,
        reasonLabel: reason.label,
        shortLabel: reason.shortLabel,
        extra: text.slice(prefix.length).trim() || null,
      };
    }
  }

  return {
    reasonId: 'other',
    reasonLabel: 'Other',
    shortLabel: text.length > 42 ? `${text.slice(0, 40)}…` : text,
    extra: text,
  };
}

export function monitoringDispositioned(status: RenewMonitoringStatus): boolean {
  return status === 'AVAILABLE' || status === 'UNAVAILABLE' || status === 'CONCERNING';
}

const NUMERIC_CONTEXT_CODES = new Set([
  'WEIGHT',
  'HEIGHT',
  'GESTATIONAL_AGE',
  'INFANT_AGE_DAYS',
]);

export function isContextComplete(row: RenewPatientContextRequirement): boolean {
  if (!row.visible) return true;
  const code = row.inputCode.trim().toUpperCase();
  const ui = (row.uiComponent ?? '').trim().toUpperCase();
  if (code === 'BMI' || ui === 'DERIVED' || ui === 'READ_ONLY') return true;
  const choice = contextChoiceFromAnswer(row.answer);
  if (choice === 'unknown') {
    return Boolean(row.answer.unableReasonCode);
  }
  if (NUMERIC_CONTEXT_CODES.has(code) || ui === 'NUMBER_WITH_UNIT' || ui === 'NUMBER_INPUT') {
    return row.answer.numericValue != null;
  }
  const yesNo = isYesNoContextQuestion(row);
  const numericShape =
    !yesNo &&
    (row.valueShape === 'NUMBER' ||
      row.valueShape === 'NUMERIC' ||
      Boolean(row.unit?.trim()));
  if (numericShape) return row.answer.numericValue != null;
  if (!yesNo) {
    return Boolean(row.answer.valueText?.trim()) || row.answer.numericValue != null;
  }
  if (!choice && !row.answer.valueText?.trim()) return false;
  if (isContextTriggered(row)) {
    if (row.answer.followup) return row.answer.followup.completed === true;
    return row.answer.pharmacistConfirmed === true;
  }
  return Boolean(row.answer.valueText?.trim());
}

export function evaluateMonitoringGate(args: {
  monitoring: RenewMonitoringRequirement[];
  context: RenewPatientContextRequirement[];
  findings: RenewSafetyFindingSummary[];
  acknowledgedFindingKeys: string[];
  itemReviews?: RenewMonitoringItemReview[];
  indications?: Array<{ code: string | null; label: string }>;
}): RenewMonitoringGate {
  const pendingMonitoringCodes = args.monitoring
    .filter((row) => !monitoringDispositioned(row.result.status))
    .map((row) => row.inputCode);
  const pendingContextCodes = args.context
    .filter((row) => row.visible && !isContextComplete(row))
    .map((row) => row.inputCode);

  const uniqueContext = [...new Set(pendingContextCodes)];
  const reviewFindings = args.findings.filter(
    (finding) => finding.clinicalSeverity === 'AVOID' || finding.clinicalSeverity === 'REVIEW_REQUIRED',
  );
  const unacknowledgedFindingCount = reviewFindings.filter(
    (finding) => !args.acknowledgedFindingKeys.includes(finding.key),
  ).length;

  return {
    ok: pendingMonitoringCodes.length === 0 && uniqueContext.length === 0,
    pendingMonitoringCodes,
    pendingContextCodes: uniqueContext,
    unacknowledgedFindingCount,
    blockingReviewCodes: [],
  };
}

export function matchExtractionToCode(
  testName: string,
  inputs: Array<{ code: string; label: string; aliases: string[] }>,
): string | null {
  const key = normalizeMonitorLabel(testName);
  if (!key) return null;
  for (const input of inputs) {
    const labels = [input.code, input.label, ...input.aliases].map(normalizeMonitorLabel);
    if (labels.includes(key)) return input.code;
    if (labels.some((label) => label && (key.includes(label) || label.includes(key)))) return input.code;
  }
  return null;
}

export function requirementFingerprint(codes: string[]): string {
  return [...codes].sort().join(',');
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

export function normalizeMonitorLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/estimated\s+gfr/g, 'egfr')
    .replace(/blood\s+pressure/g, 'bp')
    .replace(/haemoglobin\s*a1c|hemoglobin\s*a1c|hba1c/g, 'a1c')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asIsoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return toIsoCalendarDate(raw) ?? raw;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const STATUS_SET = new Set<string>(RENEW_MONITORING_STATUSES);
const SOURCE_SET = new Set<string>(RENEW_MONITORING_SOURCES);
const CONTEXT_SET = new Set<string>(RENEW_CONTEXT_ANSWER_STATUSES);

function parseValue(raw: unknown): RenewMonitoringValue | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  return {
    numericValue: asNumber(src.numericValue),
    secondaryNumericValue: asNumber(src.secondaryNumericValue),
    valueText: asString(src.valueText),
    unit: asString(src.unit),
  };
}

function parseResult(raw: unknown): RenewMonitoringResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const inputCode = asString(src.inputCode);
  const status = asString(src.status);
  if (!inputCode || !status || !STATUS_SET.has(status)) return null;
  const source = asString(src.sourceType);
  return {
    inputCode,
    status: status as RenewMonitoringStatus,
    value: parseValue(src.value),
    observedDate: asIsoDate(src.observedDate),
    sourceType: source && SOURCE_SET.has(source) ? (source as RenewMonitoringSource) : null,
    sourceLabel: asString(src.sourceLabel),
    note: asString(src.note),
    pharmacistConfirmed: src.pharmacistConfirmed === true,
  };
}

function parseContextFollowup(raw: unknown): PatientContextFollowup | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  return {
    onset: asString(src.onset),
    severity: asString(src.severity),
    details: asString(src.details),
    action: asString(src.action),
    completed: src.completed === true,
  };
}

function parseContext(raw: unknown): RenewPatientContextAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const inputCode = asString(src.inputCode);
  const status = asString(src.status);
  if (!inputCode || !status || !CONTEXT_SET.has(status)) return null;
  return {
    inputCode,
    status: status as RenewContextAnswerStatus,
    valueText: asString(src.valueText),
    numericValue: asNumber(src.numericValue),
    pharmacistConfirmed: src.pharmacistConfirmed === true,
    source: src.source === 'BULK_NO_CONCERNS' ? 'BULK_NO_CONCERNS' : src.source === 'MANUAL' ? 'MANUAL' : undefined,
    bulkActionId: asString(src.bulkActionId),
    note: asString(src.note),
    unableReasonCode: asString(src.unableReasonCode),
    unableReasonText: asString(src.unableReasonText),
    followup: parseContextFollowup(src.followup),
    enteredUnit: asString(src.enteredUnit),
    sourceDate: asIsoDate(src.sourceDate),
  };
}

function parseCandidate(raw: unknown): ExtractedMonitoringCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const inputCode = asString(src.inputCode);
  if (!inputCode) return null;
  return {
    inputCode,
    valueText: asString(src.valueText),
    numericValue: asNumber(src.numericValue),
    secondaryNumericValue: asNumber(src.secondaryNumericValue),
    unit: asString(src.unit),
    observedDate: asIsoDate(src.observedDate),
    sourceLabel: asString(src.sourceLabel),
    confidence: asNumber(src.confidence),
    evidenceText: asString(src.evidenceText),
  };
}

function parseExtraction(raw: unknown): RenewMonitoringExtraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const id = asString(src.id);
  const sourceType = asString(src.sourceType);
  const status = asString(src.status);
  if (!id || (sourceType !== 'PASTED_SCREENSHOT' && sourceType !== 'UPLOADED_DOCUMENT')) return null;
  if (status !== 'PENDING_REVIEW' && status !== 'CONFIRMED' && status !== 'REJECTED') return null;
  return {
    id,
    sourceType,
    status,
    candidates: Array.isArray(src.candidates)
      ? src.candidates.map(parseCandidate).filter((row): row is ExtractedMonitoringCandidate => Boolean(row))
      : [],
    extraDetectedCount: asNumber(src.extraDetectedCount) ?? 0,
    createdAt: asString(src.createdAt) ?? new Date().toISOString(),
  };
}

function parseItemReview(raw: unknown): RenewMonitoringItemReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const inputCode = asString(src.inputCode);
  const action = asString(src.action);
  if (!inputCode || !action || !MONITORING_REVIEW_ACTIONS.includes(action as MonitoringReviewAction)) {
    return null;
  }
  return {
    inputCode,
    action: action as MonitoringReviewAction,
    note: asString(src.note),
    reviewedAt: asString(src.reviewedAt) ?? new Date().toISOString(),
    otherText: asString(src.otherText),
    affectedMedicationIds: Array.isArray(src.affectedMedicationIds)
      ? src.affectedMedicationIds.map((id) => asString(id)).filter((id): id is string => Boolean(id))
      : [],
    shorterDurationId: asString(src.shorterDurationId),
  };
}

export function upsertMonitoringItemReview(
  reviews: RenewMonitoringItemReview[],
  next: RenewMonitoringItemReview,
): RenewMonitoringItemReview[] {
  const index = reviews.findIndex((row) => row.inputCode === next.inputCode);
  if (index < 0) return [...reviews, next];
  const copy = [...reviews];
  copy[index] = next;
  return copy;
}

export function parseMonitoringSafety(raw: unknown): RenewMonitoringSafetyState {
  const base = emptyMonitoringSafety();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  return {
    results: Array.isArray(src.results)
      ? src.results.map(parseResult).filter((row): row is RenewMonitoringResult => Boolean(row))
      : [],
    contextAnswers: Array.isArray(src.contextAnswers)
      ? src.contextAnswers
          .map(parseContext)
          .filter((row): row is RenewPatientContextAnswer => Boolean(row))
      : [],
    extractions: Array.isArray(src.extractions)
      ? src.extractions
          .map(parseExtraction)
          .filter((row): row is RenewMonitoringExtraction => Boolean(row))
      : [],
    acknowledgedFindingKeys: Array.isArray(src.acknowledgedFindingKeys)
      ? src.acknowledgedFindingKeys.map((v) => asString(v)).filter((v): v is string => Boolean(v))
      : [],
    itemReviews: Array.isArray(src.itemReviews)
      ? src.itemReviews.map(parseItemReview).filter((row): row is RenewMonitoringItemReview => Boolean(row))
      : [],
    completed: src.completed === true,
    completedAt: asString(src.completedAt),
    requirementFingerprint: asString(src.requirementFingerprint),
    removedContextQuestions: Array.isArray(src.removedContextQuestions)
      ? src.removedContextQuestions
          .map(parseRemovedContext)
          .filter((row): row is RemovedConditionalQuestion => Boolean(row))
      : [],
    removedMonitoringItems: Array.isArray(src.removedMonitoringItems)
      ? src.removedMonitoringItems
          .map(parseRemovedMonitoring)
          .filter((row): row is RemovedMonitoringItem => Boolean(row))
      : [],
    extraMonitoringCodes: Array.isArray(src.extraMonitoringCodes)
      ? [...new Set(src.extraMonitoringCodes.map((v) => asString(v)).filter((v): v is string => Boolean(v)))]
      : [],
    contextAdditionalNote: asString(src.contextAdditionalNote),
    patientContextConfirmed: src.patientContextConfirmed === true,
    lastContextBulkActionId: asString(src.lastContextBulkActionId),
    patientContextBulkAcked: src.patientContextBulkAcked === true,
    monitoringConfirmed: src.monitoringConfirmed === true,
  };
}

export function emptyMonitoringResult(inputCode: string): RenewMonitoringResult {
  return {
    inputCode,
    status: 'PENDING',
    value: null,
    observedDate: null,
    sourceType: null,
    sourceLabel: null,
    note: null,
    pharmacistConfirmed: false,
  };
}

export function emptyContextAnswer(inputCode: string): RenewPatientContextAnswer {
  return {
    inputCode,
    status: 'ANSWERED',
    valueText: null,
    numericValue: null,
    pharmacistConfirmed: false,
    note: null,
    unableReasonCode: null,
    unableReasonText: null,
    followup: null,
    enteredUnit: null,
    sourceDate: null,
  };
}

const REMOVAL_REASON_SET = new Set<string>(CONTEXT_REMOVAL_REASONS.map((row) => row.id));
const MONITORING_REMOVAL_SET = new Set<string>(MONITORING_REMOVAL_REASONS.map((row) => row.id));

function parseRemovedContext(raw: unknown): RemovedConditionalQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const questionRuleId = asString(src.questionRuleId);
  const reasonCode = asString(src.reasonCode);
  if (!questionRuleId || !reasonCode || !REMOVAL_REASON_SET.has(reasonCode)) return null;
  return {
    questionRuleId,
    reasonCode: reasonCode as ContextRemovalReasonId,
    reasonText: asString(src.reasonText),
    removedAt: asString(src.removedAt) ?? new Date().toISOString(),
    removedByUserId: asString(src.removedByUserId),
  };
}

function parseRemovedMonitoring(raw: unknown): RemovedMonitoringItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const inputCode = asString(src.inputCode);
  const reasonCode = asString(src.reasonCode);
  if (!inputCode || !reasonCode || !MONITORING_REMOVAL_SET.has(reasonCode)) return null;
  return {
    inputCode,
    reasonCode: reasonCode as MonitoringRemovalReasonId,
    reasonText: asString(src.reasonText),
    removedAt: asString(src.removedAt) ?? new Date().toISOString(),
    removedByUserId: asString(src.removedByUserId),
  };
}

export function formatRelevantFor(names: string[], max = 3): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (!clean.length) return '';
  if (clean.length <= max) return clean.join(' · ');
  return `${clean.slice(0, max).join(' · ')} +${clean.length - max}`;
}

export function contextRemovalLabel(reasonCode: ContextRemovalReasonId, reasonText?: string | null): string {
  const row = CONTEXT_REMOVAL_REASONS.find((item) => item.id === reasonCode);
  if (reasonCode === 'OTHER' && reasonText?.trim()) return reasonText.trim();
  return row?.label ?? 'Removed';
}

export function monitoringRemovalLabel(reasonCode: MonitoringRemovalReasonId, reasonText?: string | null): string {
  const row = MONITORING_REMOVAL_REASONS.find((item) => item.id === reasonCode);
  if (reasonCode === 'OTHER' && reasonText?.trim()) return reasonText.trim();
  return row?.label ?? 'Removed';
}

const ADDITIONAL_MONITORING_CODES = new Set([
  'PSA',
  'ALT',
  'AST',
  'ALP',
  'GGT',
  'BILIRUBIN',
  'B12',
  'VITAMIN_B12',
  'FOLATE',
  'FERRITIN',
  'LIPID_PROFILE',
  'LDL_C',
  'HDL_C',
  'TRIGLYCERIDES',
  'TOTAL_CHOLESTEROL',
  'NON_HDL_C',
  'URATE',
  'URIC_ACID',
]);

const HIDDEN_UNTIL_TRIGGERED_CODES = new Set(['CK', 'CREATINE_KINASE']);

export function resolveMonitoringPresentationTier(args: {
  inputCode: string;
  requirement?: string | null;
  addedManually?: boolean;
  triggerSatisfied?: boolean;
}): MonitoringPresentationTier {
  if (args.addedManually) return 'CORE';
  const code = args.inputCode.trim().toUpperCase();
  const requirement = (args.requirement ?? '').trim().toUpperCase();
  if (requirement === 'CONDITIONAL' || HIDDEN_UNTIL_TRIGGERED_CODES.has(code)) {
    return args.triggerSatisfied ? 'CORE' : 'HIDDEN_UNTIL_TRIGGERED';
  }
  if (requirement === 'REQUIRED') return 'CORE';
  if (ADDITIONAL_MONITORING_CODES.has(code)) return 'ADDITIONAL';
  return 'CORE';
}

export function monitoringItemRemovable(args: {
  requirement?: string | null;
  actionIfMissing?: string | null;
}): { removable: boolean; overrideRequiresReason: boolean } {
  const missing = (args.actionIfMissing ?? '').toUpperCase();
  if (missing === 'BLOCK') return { removable: false, overrideRequiresReason: false };
  return {
    removable: true,
    overrideRequiresReason: (args.requirement ?? '').toUpperCase() === 'REQUIRED',
  };
}

export function isYesNoContextQuestion(
  row: Pick<RenewPatientContextRequirement, 'valueShape' | 'enumOptions' | 'uiComponent'> & {
    inputCode?: string;
  },
): boolean {
  const code = (row.inputCode ?? '').trim().toUpperCase();
  if (NUMERIC_CONTEXT_CODES.has(code) || code === 'BMI' || code === 'AGE') return false;
  const ui = (row.uiComponent ?? '').trim().toUpperCase();
  if (ui === 'NUMBER_WITH_UNIT' || ui === 'NUMBER_INPUT' || ui === 'DERIVED' || ui === 'READ_ONLY') {
    return false;
  }
  if (ui === 'YES_NO' || row.valueShape === 'YES_NO') return true;
  const options = (row.enumOptions ?? []).map((opt) => opt.trim().toLowerCase());
  return options.includes('yes') && options.includes('no');
}

export function contextChoiceFromAnswer(answer: RenewPatientContextAnswer | null | undefined): ContextChoice | null {
  if (!answer) return null;
  if (answer.status === 'UNKNOWN' || answer.status === 'UNAVAILABLE') return 'unknown';
  const value = answer.valueText?.trim().toLowerCase();
  if (value === 'yes' || value === 'y' || value === 'true') return 'yes';
  if (value === 'no' || value === 'n' || value === 'false') return 'no';
  return null;
}

export function contextChoiceToAnswer(
  inputCode: string,
  choice: ContextChoice,
  extras: Pick<RenewPatientContextAnswer, 'source' | 'bulkActionId'> = {},
): RenewPatientContextAnswer {
  if (choice === 'unknown') {
    return {
      inputCode,
      status: 'UNKNOWN',
      valueText: null,
      numericValue: null,
      pharmacistConfirmed: true,
      source: extras.source ?? 'MANUAL',
      bulkActionId: extras.bulkActionId ?? null,
    };
  }
  return {
    inputCode,
    status: 'ANSWERED',
    valueText: choice,
    numericValue: null,
    pharmacistConfirmed: true,
    source: extras.source ?? 'MANUAL',
    bulkActionId: extras.bulkActionId ?? null,
  };
}

export function contextStableChoice(
  row: Pick<RenewPatientContextRequirement, 'stableAnswer' | 'trigger' | 'triggerAnswer'>,
): ContextChoice {
  const configured = (row.stableAnswer || '').toUpperCase();
  if (configured === 'YES') return 'yes';
  if (configured === 'NO') return 'no';
  if (configured === 'UNKNOWN') return 'unknown';
  const trigger = (row.triggerAnswer || row.trigger?.value || 'YES').toUpperCase();
  if (trigger === 'NO') return 'yes';
  return 'no';
}

export function contextBulkApplyAllowed(row: RenewPatientContextRequirement): boolean {
  if (row.bulkApplyAllowed === false) return false;
  if (!isYesNoContextQuestion(row)) return false;
  return true;
}

export function applyNoConcernAnswers(
  rows: RenewPatientContextRequirement[],
  answers: RenewPatientContextAnswer[],
  bulkActionId: string,
): { next: RenewPatientContextAnswer[]; appliedCodes: string[] } {
  const byCode = new Map(answers.map((row) => [row.inputCode, row]));
  const appliedCodes: string[] = [];
  for (const row of rows) {
    if (!contextBulkApplyAllowed(row)) continue;
    const current = byCode.get(row.inputCode);
    if (contextChoiceFromAnswer(current)) continue;
    appliedCodes.push(row.inputCode);
    byCode.set(
      row.inputCode,
      contextChoiceToAnswer(row.inputCode, contextStableChoice(row), {
        source: 'BULK_NO_CONCERNS',
        bulkActionId,
      }),
    );
  }
  return { next: [...byCode.values()], appliedCodes };
}

export function undoNoConcernAnswers(
  answers: RenewPatientContextAnswer[],
  bulkActionId: string,
): RenewPatientContextAnswer[] {
  return answers.map((row) =>
    row.bulkActionId === bulkActionId && row.source === 'BULK_NO_CONCERNS'
      ? emptyContextAnswer(row.inputCode)
      : row,
  );
}

export function contextTriggerChoice(
  row: Pick<RenewPatientContextRequirement, 'trigger' | 'triggerAnswer'>,
): ContextChoice {
  const trigger = (row.triggerAnswer || row.trigger?.value || 'YES').toUpperCase();
  if (trigger === 'NO') return 'no';
  if (trigger === 'UNKNOWN') return 'unknown';
  return 'yes';
}

export function isContextTriggered(row: RenewPatientContextRequirement): boolean {
  const choice = contextChoiceFromAnswer(row.answer);
  if (!choice || choice === 'unknown') return false;
  return choice === contextTriggerChoice(row);
}

export function isContextStableAnswer(row: RenewPatientContextRequirement): boolean {
  const choice = contextChoiceFromAnswer(row.answer);
  if (!choice || choice === 'unknown') return false;
  return choice === contextStableChoice(row);
}

export function contextFindingSeverity(
  row: Pick<RenewPatientContextRequirement, 'actionOnTrigger'>,
): ContextFindingSeverity {
  const action = (row.actionOnTrigger || '').toUpperCase();
  if (action === 'BLOCK' || action === 'REFER' || action === 'DO_NOT_RENEW') return 'ACTION_REQUIRED';
  if (action === 'REVIEW') return 'REVIEW_REQUIRED';
  return 'CONCERN';
}

export function contextUnableAllowed(row: Pick<RenewPatientContextRequirement, 'allowNotAvailable'>): boolean {
  return row.allowNotAvailable !== false;
}

export function contextUnableLabel(reasonCode?: string | null, reasonText?: string | null): string {
  if (reasonCode === 'OTHER' && reasonText?.trim()) return reasonText.trim();
  return CONTEXT_UNABLE_REASONS.find((row) => row.id === reasonCode)?.label ?? 'Unable to assess';
}

export function contextFindingActionLabel(actionId?: string | null): string | null {
  if (!actionId) return null;
  return CONTEXT_FINDING_ACTIONS.find((row) => row.id === actionId)?.label ?? actionId;
}

export function contextFindingOnsetLabel(onsetId?: string | null): string | null {
  if (!onsetId) return null;
  return CONTEXT_FINDING_ONSET_OPTIONS.find((row) => row.id === onsetId)?.label ?? onsetId;
}

export function contextFindingSeverityLabel(severityId?: string | null): string | null {
  if (!severityId) return null;
  return CONTEXT_FINDING_SEVERITY_OPTIONS.find((row) => row.id === severityId)?.label ?? severityId;
}

/** Concise concern title for collapsed “— reviewed” summary. Prefer configured label. */
export function contextConcernSummaryLabel(
  row: Pick<RenewPatientContextRequirement, 'label' | 'reviewSummaryLabel'>,
): string {
  const configured = row.reviewSummaryLabel?.trim();
  if (configured) return configured;
  // Drop trailing question mark / trailing clause after "?" for a shorter scan label.
  return row.label.replace(/\?[\s\S]*$/, '').trim() || row.label;
}

export function patientContextProgress(args: {
  active: RenewPatientContextRequirement[];
  removedCount: number;
}): {
  questions: number;
  reviewed: number;
  remaining: number;
  removed: number;
  findings: number;
} {
  const reviewed = args.active.filter((row) => isContextComplete(row)).length;
  const remaining = args.active.length - reviewed;
  const findings = args.active.filter((row) => isContextTriggered(row) && isContextComplete(row)).length;
  return {
    questions: args.active.length + args.removedCount,
    reviewed,
    remaining,
    removed: args.removedCount,
    findings,
  };
}

export function patientContextProgressCopy(args: {
  active: RenewPatientContextRequirement[];
  removedCount: number;
}): string {
  const progress = patientContextProgress(args);
  if (progress.reviewed === 0 && progress.removed === 0 && progress.findings === 0) {
    return `${progress.questions} question${progress.questions === 1 ? '' : 's'} to review`;
  }
  const parts: string[] = [];
  parts.push(`${progress.reviewed} reviewed`);
  if (progress.remaining > 0) parts.push(`${progress.remaining} remaining`);
  if (progress.removed > 0) parts.push(`${progress.removed} removed`);
  if (progress.findings > 0) {
    parts.push(`${progress.findings} finding${progress.findings === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function patientContextHeaderCounts(args: {
  active: RenewPatientContextRequirement[];
  removedCount: number;
}): { reviewed: number; total: number; remaining: number; removed: number; findings: number; label: string } {
  const progress = patientContextProgress(args);
  return {
    reviewed: progress.reviewed,
    total: progress.questions,
    remaining: progress.remaining,
    removed: progress.removed,
    findings: progress.findings,
    label: patientContextProgressCopy(args),
  };
}

export function patientContextCollapsedSummary(args: {
  active: RenewPatientContextRequirement[];
  removedCount: number;
  findingCount?: number;
}): string {
  const reviewed = args.active.filter((row) => isContextComplete(row)).length + args.removedCount;
  const questionBit = `${reviewed} question${reviewed === 1 ? '' : 's'} reviewed`;
  if ((args.findingCount ?? 0) > 0) {
    return `${questionBit} · ${args.findingCount} finding${args.findingCount === 1 ? '' : 's'} documented`;
  }
  if (args.removedCount > 0) return `${questionBit} · ${args.removedCount} removed`;
  return `${questionBit} · No concerns identified`;
}
