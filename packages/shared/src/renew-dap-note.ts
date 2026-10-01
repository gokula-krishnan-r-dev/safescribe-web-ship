/**
 * SafeScribe Renew — Consultation / DAP Note.
 * Reconstructs the pharmacist encounter from confirmed Steps 1–4.
 * Wording is deterministic. Missing data is omitted or left uncertain.
 * Do not invent findings, counselling, labs, DTPs, or communications.
 */

import { displayDob } from './referral-letter-document';
import { ensureDapOpeningConsent } from './documentation-encounter';
import {
  RENEW_DURATION_OPTIONS,
  formatRenewDuration,
  formatRenewReasons,
  formatVerifiedFrom,
  type RenewConditionReview,
  type RenewDocumentKind,
  type RenewDurationId,
  type RenewGeneratedDocument,
  type RenewMedication,
  type RenewMedicationIndication,
  type RenewPayload,
} from './renew';
import {
  formatAdherenceConcernsNarrative,
  formatEffectivenessNarrative,
  formatMedicationConcernsNarrative,
  groupTherapyConditions,
  isEffectivenessConcern,
  isIndicationResolved,
  linkedMedicationNames,
  medicationConcernActionLabel,
} from './renew-therapy';
import {
  MONITORING_REVIEW_ACTION_OPTIONS,
  RENEW_SAFETY_REPOSITORY,
  contextChoiceFromAnswer,
  formatMonitoringDate,
  formatMonitoringResult,
  parseUnavailableNote,
  type RenewMonitoringRequirement,
  type RenewPatientContextRequirement,
  type RenewSafetyFindingSummary,
} from './renew-monitoring';
import { parseDialysisContext } from './renew-renal-coverage';
import { formatDapCommunicationRecord, syncRenewCommunication } from './renew-communication';

/** Plan row fields the DAP needs. Compatible with RenewDapPlanRow. */
export interface RenewDapPlanRow {
  medicationId: string;
  displayName: string;
  directions: string | null;
  quantityLabel: string | null;
  selected: boolean;
  durationId: RenewDurationId | null;
  customDurationDays: number | null;
  customDurationText: string | null;
  durationApplyNote: string | null;
  safety: { label: string; note: string | null };
}

export const RENEW_DAP_NOTE_TITLE = 'Pharmacist Renewal Assessment';
export const RENEW_DAP_PROMPT_VERSION = 'renew-dap-compact-v3';

export type RenewPrescribingBasis =
  | 'ADAPTATION_RENEWAL_CONTINUITY_OF_CARE'
  | 'APA_ONGOING_CARE'
  | 'OTHER_AUTHORIZED_RENEWAL';

export type RenewDtpState = 'NONE_IDENTIFIED' | 'ACTUAL' | 'POTENTIAL' | 'NOT_ASSESSED';

export type RenewDapRenewalDecision =
  | 'RENEW'
  | 'RENEW_SHORTER_DURATION'
  | 'DO_NOT_RENEW'
  | 'DEFER_PENDING_INFORMATION'
  | 'REFER';

export interface RenewDapEncounterContext {
  dateTimeIso: string;
  pharmacistName: string;
  pharmacistRole: string;
  practiceSite: string | null;
  timeZone?: string | null;
  ageYears?: number | null;
  mode?: 'IN_PERSON' | 'VIRTUAL' | null;
  prescribingBasis?: RenewPrescribingBasis;
  jurisdiction?: string | null;
  phone?: string | null;
  fax?: string | null;
  address?: string | null;
}

export interface RenewDapClinicalContext {
  patientContext?: RenewPatientContextRequirement[];
  monitoring?: RenewMonitoringRequirement[];
  safetyFindings?: RenewSafetyFindingSummary[];
  uncoveredMedications?: Array<{ id: string; name: string }>;
}

export interface RenewDocumentGenerationContext {
  encounter?: RenewDapEncounterContext;
  clinical?: RenewDapClinicalContext;
  /** Optional patient extras for formal prescription (address not always on Step 4 identity). */
  patient?: {
    address?: string | null;
    phone?: string | null;
  };
  /** Optional pharmacist registration for formal prescription chrome. */
  prescriber?: {
    registrationNumber?: string | null;
  };
  /** Live Super Admin Document Session prompts keyed by renew document kind. */
  systemPrompts?: Partial<Record<RenewDocumentKind, string>>;
  /** Content hashes of live prompts used for this generate (staleness / audit). */
  promptHashes?: Partial<Record<RenewDocumentKind, string>>;
}

export interface RenewDapDtpRecord {
  state: 'ACTUAL' | 'POTENTIAL';
  description: string;
  source: 'therapy_review' | 'monitoring_review';
}

export interface RenewDapCounsellingRecord {
  description: string;
}

export interface RenewDapFollowUpRecord {
  kind: 'MONITORING' | 'ADHERENCE' | 'REFERRAL' | 'PRESCRIBER' | 'SHORTER_RENEWAL';
  text: string;
}

export interface RenewDapDraft {
  data: {
    reasonForCare: string;
    currentTherapy: string;
    therapyReview: string;
    relevantHistory: string;
    safetyScreen: string;
    monitoring: string;
    sourcesReviewed: string;
  };
  assessment: string;
  plan: {
    renewalDecision: string;
    counselling: string;
    monitoringFollowUp: string;
    referralCommunication: string;
  };
  resourcesConsulted: string[];
  warnings: string[];
}

export interface RenewDapGenerationPayload {
  encounter: {
    patientName: string;
    dob: string;
    phn: string | null;
    ageYears: number | null;
    dateTime: string;
    mode: 'IN_PERSON' | 'VIRTUAL' | null;
    pharmacistName: string;
    pharmacistRole: string;
    practiceSite: string | null;
    jurisdiction: string;
    prescribingBasis: RenewPrescribingBasis;
    timeZone: string;
  };
  renewalRequest: {
    reasons: string[];
    verificationSources: string[];
    requestedDuration: string | null;
  };
  medications: Array<{
    medicationId: string;
    displayName: string;
    directions: string | null;
    quantityLabel: string | null;
    indication: string | null;
    selected: boolean;
    durationLabel: string | null;
  }>;
  conditions: Array<{
    displayName: string;
    medicationNames: string[];
    adherenceStatus: string | null;
    effectivenessStatus: string | null;
    medicationConcernStatus: string | null;
    compactReview: string;
    exceptionNotes: string[];
  }>;
  patientSpecificScreen: Array<{
    inputCode: string;
    label: string;
    positive: boolean;
    unable: boolean;
    detail: string | null;
  }>;
  monitoringResults: Array<{
    inputCode: string;
    label: string;
    unavailable: boolean;
    unavailableReason: string | null;
    valueText: string | null;
    dateText: string | null;
    reviewLabel: string | null;
    reviewNote: string | null;
  }>;
  safetyScreenCompleted: boolean;
  therapyCompleted: boolean;
  monitoringCompleted: boolean;
  dtpState: RenewDtpState;
  dtps: RenewDapDtpRecord[];
  counselling: RenewDapCounsellingRecord[];
  followUp: RenewDapFollowUpRecord[];
  communicationRequired: boolean;
  communicationRecord: string | null;
  patientHandoutGenerated: boolean;
  dialysisLabel: string | null;
  uncoveredMedicationNames: string[];
  resourcesConsulted: string[];
  provenance: {
    renewConfigReleaseId: string;
    safetyReleaseId: string;
  };
}

const COUNSEL_ACTION_IDS = new Set(['counselled_patient', 'counsel_patient']);
const REFERRAL_ACTION_IDS = new Set(['refer_to_prescriber', 'contact_prescriber']);
const DURATION_RANK: Record<string, number> = { '7_days': 7, '14_days': 14, '30_days': 30 };

const FORBIDDEN_CLAIM_CHECKS: Array<{
  id: string;
  re: RegExp;
  allowed: (payload: RenewDapGenerationPayload) => boolean;
}> = [
  {
    id: 'counselled',
    re: /\b(?:patient )?counsel+ed\b|\bunderstands\b/i,
    allowed: (payload) => payload.counselling.length > 0,
  },
  {
    id: 'notified',
    re: /prescriber notified|notified (?:the )?(?:prescriber|physician)|notified on /i,
    allowed: (payload) => Boolean(payload.communicationRecord?.toLowerCase().includes('notified')),
  },
  {
    id: 'referred',
    re: /\breferred to\b/i,
    allowed: (payload) => payload.followUp.some((row) => row.kind === 'REFERRAL'),
  },
  {
    id: 'no_allergies',
    re: /no known allerg|no allergies\b/i,
    allowed: () => false,
  },
  {
    id: 'no_dtp',
    re: /no (?:actual or potential )?(?:dtp|drug therapy problem)/i,
    allowed: (payload) => payload.dtpState === 'NONE_IDENTIFIED',
  },
  {
    id: 'backend_missing',
    re: /method(?:\/| and )date.{0,60}not (?:yet )?(?:been )?documented|not yet documented|field missing|data unavailable|not provided in (?:the )?(?:payload|supplied)/i,
    allowed: () => false,
  },
  {
    id: 'awkward_effectiveness',
    re: /no effectiveness\/stability/i,
    allowed: () => false,
  },
  {
    id: 'duration_is_appropriate',
    re: /renewal is appropriate/i,
    allowed: () => false,
  },
  {
    id: 'lab_normal',
    re: /\b(?:labs?|result)s?\s+normal\b|\bwithin normal (?:limits|range)\b/i,
    allowed: () => false,
  },
  {
    id: 'safe_because',
    re: /safe because no (?:rule|alert)|no red flags/i,
    allowed: () => false,
  },
  {
    id: 'internal_terms',
    re: /safety engine|\bstep [1-4]\b|\bllm\b|confidence score|bulk action|reference master/i,
    allowed: () => false,
  },
];

export function buildRenewConsultationNote(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  const built = buildRenewDapDraft(payload, rows, context);
  return renderRenewDapNote(built.draft, built.payload);
}

export function buildRenewDapDraft(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): { draft: RenewDapDraft; payload: RenewDapGenerationPayload } {
  const generation = buildRenewDapPayload(payload, rows, context);
  const draft = composeRenewDapDraft(generation, payload, rows);
  const rendered = renderRenewDapNote(draft, generation);
  draft.warnings = validateRenewDapNote(rendered, generation);
  return { draft, payload: generation };
}

export function buildRenewDapPayload(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): RenewDapGenerationPayload {
  const info = payload.renewalDecision.patientInfo;
  const encounterCtx = context?.encounter;
  const clinical = context?.clinical;
  const selected = rows.filter((row) => row.selected);
  const reasons = formatRenewReasons(payload.renewalRequest);
  const verified = formatVerifiedFrom(payload.renewalRequest);
  const medications = rows.map((row) => ({
    medicationId: row.medicationId,
    displayName: row.displayName,
    directions: row.directions,
    quantityLabel: row.quantityLabel,
    indication: indicationForMedication(row.medicationId, payload),
    selected: row.selected,
    durationLabel: formatPlanDuration(row),
  }));
  const patientSpecificScreen = buildPatientSpecificScreen(payload, clinical);
  const monitoringResults = buildMonitoringResults(payload, clinical);

  const conditionGroups = groupTherapyConditions(
    payload.medicationList.items,
    payload.therapyReview,
    [],
  ).map((group) => {
    const displayName = resolveConditionName(group.review, payload.therapyReview.mappings);
    const medicationNames = linkedMedicationNames(group.medicationIds, payload.medicationList.items);
    const exceptionNotes = conditionExceptionNotes(
      group.review,
      displayName,
      payload.medicationList.items,
    );
    return {
      displayName,
      medicationNames,
      adherenceStatus: group.review.adherenceStatus,
      effectivenessStatus: group.review.effectivenessStatus,
      medicationConcernStatus: group.review.medicationConcernStatus,
      compactReview: compactTherapyLine(group.review, exceptionNotes),
      exceptionNotes,
    };
  });

  const dtps = collectDtps(payload, clinical);
  const counselling = collectCounselling(payload);
  const followUp = collectFollowUp(payload, clinical);
  const dtpState = resolveDtpState(payload, dtps);
  const communication = syncRenewCommunication(payload.renewalDecision);
  const handout = documentOfKind(payload.renewalDecision.documents, 'patient_handout');
  const dialysis = parseDialysisContext({
    patientContext: clinical?.patientContext?.length
      ? clinical.patientContext
      : payload.monitoringSafety.contextAnswers.map((answer) => ({
          inputCode: answer.inputCode,
          label: humanizeCode(answer.inputCode),
          valueShape: 'YES_NO',
          unit: null,
          medicationIds: [],
          medicationNames: [],
          visible: true,
          answer,
        })),
    findings: clinical?.safetyFindings,
  });
  const dialysisLabel = dialysis.onDialysis ? dialysis.label : null;
  const uncovered = (clinical?.uncoveredMedications ?? []).map((row) => row.name).filter(Boolean);

  return {
    encounter: {
      patientName: info.patientName.trim(),
      dob: info.dateOfBirth.trim(),
      phn: info.phn?.trim() || null,
      ageYears: encounterCtx?.ageYears ?? null,
      dateTime: encounterCtx?.dateTimeIso || new Date().toISOString(),
      mode: encounterCtx?.mode ?? null,
      pharmacistName: encounterCtx?.pharmacistName?.trim() || '',
      pharmacistRole: encounterCtx?.pharmacistRole?.trim() || 'Pharmacist',
      practiceSite: encounterCtx?.practiceSite?.trim() || null,
      jurisdiction: encounterCtx?.jurisdiction?.trim() || 'Alberta',
      prescribingBasis: encounterCtx?.prescribingBasis ?? 'ADAPTATION_RENEWAL_CONTINUITY_OF_CARE',
      timeZone: encounterCtx?.timeZone?.trim() || 'America/Edmonton',
    },
    renewalRequest: {
      reasons: reasons ? [reasons] : [],
      verificationSources: verified ? [verified] : [],
      requestedDuration: formatRenewDuration(payload.renewalRequest),
    },
    medications,
    conditions: conditionGroups,
    patientSpecificScreen,
    monitoringResults,
    safetyScreenCompleted:
      payload.monitoringSafety.patientContextConfirmed || patientSpecificScreen.length > 0,
    therapyCompleted: payload.therapyReview.completed,
    monitoringCompleted: payload.monitoringSafety.completed,
    dtpState,
    dtps,
    counselling,
    followUp,
    communicationRequired: communication.requirement === 'REQUIRED',
    communicationRecord: formatDapCommunicationRecord(communication),
    patientHandoutGenerated: Boolean(handout?.body.trim()),
    dialysisLabel,
    uncoveredMedicationNames: uncovered,
    resourcesConsulted: collectResources(payload, clinical, dialysisLabel, uncovered.length > 0),
    provenance: {
      renewConfigReleaseId: RENEW_SAFETY_REPOSITORY.releaseId,
      safetyReleaseId: RENEW_SAFETY_REPOSITORY.releaseId,
    },
  };
}

export function buildRenewDapPromptPayload(generation: RenewDapGenerationPayload): Record<string, unknown> {
  return {
    outputMode: 'COMPACT_CHART_COPY',
    jurisdiction: 'AB',
    language: 'en-CA',
    renewalRequest: generation.renewalRequest,
    currentTherapy: generation.medications.map((med) => ({
      medicationId: med.medicationId,
      displayName: med.displayName,
      directions: med.directions,
      indication: med.indication,
      selected: med.selected,
      durationLabel: med.durationLabel,
    })),
    conditionAssessments: generation.conditions.map((row) => ({
      condition: row.displayName,
      medications: row.medicationNames,
      adherenceStatus: row.adherenceStatus,
      effectivenessStatus: row.effectivenessStatus,
      medicationConcernStatus: row.medicationConcernStatus,
      compactReview: row.compactReview,
      exceptionNotes: row.exceptionNotes,
      documentationDensity: row.exceptionNotes.length ? 'EXCEPTION' : 'STABLE',
    })),
    therapyReview: {
      completed: generation.therapyCompleted,
    },
    relevantPatientContext: [
      generation.dialysisLabel ? { code: 'DIALYSIS', label: generation.dialysisLabel } : null,
    ].filter(Boolean),
    safetyScreening: generation.patientSpecificScreen.map((row) => ({
      label: row.label,
      positive: row.positive,
      unable: row.unable,
      detail: row.detail,
    })),
    monitoringReviewed: generation.monitoringResults.map((row) => ({
      label: row.label,
      unavailable: row.unavailable,
      unavailableReason: row.unavailableReason,
      valueText: row.valueText,
      dateText: row.dateText,
      reviewLabel: row.reviewLabel,
      reviewNote: row.reviewNote,
    })),
    drugTherapyProblems: {
      state: generation.dtpState,
      items: generation.dtps,
    },
    renewalDecisions: generation.medications
      .filter((med) => med.selected)
      .map((med) => ({
        medicationId: med.medicationId,
        displayName: med.displayName,
        directions: med.directions,
        quantityLabel: med.quantityLabel,
        durationLabel: med.durationLabel,
        decision: 'RENEW',
      })),
    counselling: generation.counselling,
    followUp: generation.followUp,
    communications: {
      required: generation.communicationRequired,
      record: generation.communicationRecord,
    },
    overallRenewalAppropriateness:
      generation.dtpState === 'NONE_IDENTIFIED' && generation.therapyCompleted && generation.monitoringCompleted
        ? 'APPROPRIATE_TO_CONTINUE'
        : null,
  };
}

export function formatRenewDapChartCopy(fields: { data?: string; assessment?: string; plan?: string }): string {
  return [
    'D — Data',
    ensureDapOpeningConsent(stripDapSectionHeading(fields.data ?? '', 'data')),
    '',
    'A — Assessment',
    stripDapSectionHeading(fields.assessment ?? '', 'assessment'),
    '',
    'P — Plan',
    stripDapSectionHeading(fields.plan ?? '', 'plan'),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateRenewDapNote(body: string, payload: RenewDapGenerationPayload): string[] {
  const warnings: string[] = [];
  for (const check of FORBIDDEN_CLAIM_CHECKS) {
    if (check.re.test(body) && !check.allowed(payload)) {
      warnings.push(`Unsupported DAP claim: ${check.id}`);
    }
  }
  return warnings;
}

export function renderRenewDapNote(draft: RenewDapDraft, _payload: RenewDapGenerationPayload): string {
  return formatRenewDapChartCopy({
    data: [
      draft.data.reasonForCare,
      draft.data.currentTherapy,
      draft.data.therapyReview,
      draft.data.relevantHistory,
      draft.data.safetyScreen,
      draft.data.monitoring,
      draft.data.sourcesReviewed,
    ]
      .filter((line) => line.trim())
      .join(' '),
    assessment: draft.assessment,
    plan: [
      draft.plan.renewalDecision,
      draft.plan.counselling,
      draft.plan.monitoringFollowUp,
      draft.plan.referralCommunication,
    ]
      .filter((line) => line.trim())
      .join('\n'),
  });
}

function composeRenewDapDraft(
  generation: RenewDapGenerationPayload,
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
): RenewDapDraft {
  return {
    data: {
      reasonForCare: compactDataNarrative(generation, payload),
      currentTherapy: '',
      therapyReview: '',
      relevantHistory: '',
      safetyScreen: '',
      monitoring: '',
      sourcesReviewed: '',
    },
    assessment: compactAssessmentNarrative(generation, payload, rows),
    plan: {
      renewalDecision: compactPlanNarrative(generation, payload, rows),
      counselling: '',
      monitoringFollowUp: '',
      referralCommunication: '',
    },
    resourcesConsulted: generation.resourcesConsulted,
    warnings: [],
  };
}

function stripDapSectionHeading(value: string, section: 'data' | 'assessment' | 'plan'): string {
  const text = value.trim();
  if (!text) return '';
  const heading =
    section === 'data'
      ? /^(?:d\s*[—–-]\s*data)\s*/i
      : section === 'assessment'
        ? /^(?:a\s*[—–-]\s*assessment)\s*/i
        : /^(?:p\s*[—–-]\s*plan)\s*/i;
  return text.replace(heading, '').trim();
}

function compactDurationAdjective(duration: string | null): string | null {
  if (!duration?.trim()) return null;
  const match = duration.trim().match(/^(\d+)\s+days?$/i);
  if (match) return `${match[1]}-day`;
  return duration.trim();
}

function compactReasonClause(reasons: string[]): string | null {
  const joined = reasons.map((row) => row.trim()).filter(Boolean).join(', ').toLowerCase();
  if (!joined) return null;
  if (joined.includes('no refills') && joined.includes('unable to see')) {
    return 'no remaining refills before regular prescriber follow-up';
  }
  if (joined.includes('no refills')) return 'no refills remain';
  return joined;
}

function compactVerification(sources: string[]): string | null {
  if (!sources.length) return null;
  const lower = sources.map((row) => row.toLowerCase());
  const pharmacy = lower.some((row) => row.includes('pharmacy'));
  const provincial = lower.some((row) => row.includes('provincial'));
  if (pharmacy && provincial) return 'pharmacy and provincial medication records';
  if (pharmacy) return 'pharmacy dispensing record';
  if (provincial) return 'provincial medication record';
  return sources.join(' and ').toLowerCase();
}

function exactDirections(directions: string | null): string | null {
  if (!directions?.trim()) return null;
  return directions.replace(/\s+/g, ' ').replace(/\.$/, '').trim() || null;
}

function compactCurrentTherapy(generation: RenewDapGenerationPayload): string | null {
  const selected = generation.medications.filter((med) => med.selected);
  const relevant = selected.length ? selected : generation.medications;
  if (!relevant.length) return null;
  const clauses = relevant.map((med) => {
    const bits = [med.displayName];
    const sig = exactDirections(med.directions);
    if (sig) bits.push(sig);
    if (med.indication?.trim()) bits.push(`for ${med.indication.trim()}`);
    return bits.join(', ');
  });
  return `Current therapy: ${clauses.join('; ')}.`;
}

function compactDataNarrative(generation: RenewDapGenerationPayload, payload: RenewPayload): string {
  const sentences: string[] = [];
  const reason = compactReasonClause(generation.renewalRequest.reasons);
  if (reason) sentences.push(`Renewal requested because ${reason}.`);
  const verified = compactVerification(generation.renewalRequest.verificationSources);
  if (verified) sentences.push(`Therapy verified against the ${verified}.`);
  const current = compactCurrentTherapy(generation);
  if (current) sentences.push(current);
  const therapy = compactTherapyReviewSentence(generation);
  if (therapy) sentences.push(therapy);
  const safety = compactSafetySentence(generation);
  if (safety) sentences.push(safety);
  const monitoring = compactMonitoringSentence(generation);
  if (monitoring) sentences.push(monitoring);
  if (generation.dialysisLabel) {
    sentences.push(`Dialysis-dependent; ${generation.dialysisLabel.toLowerCase()} confirmed.`);
  }
  const extra = payload.monitoringSafety.contextAdditionalNote?.trim();
  if (extra) sentences.push(extra);
  return sentences.join(' ');
}

function compactTherapyReviewSentence(generation: RenewDapGenerationPayload): string | null {
  if (!generation.conditions.length) return null;
  const exceptions = generation.conditions.flatMap((row) => row.exceptionNotes);
  const allAdherent = generation.conditions.every((row) => row.adherenceStatus === 'yes');
  const allEffective = generation.conditions.every((row) => row.effectivenessStatus === 'yes');
  const noConcern = generation.conditions.every((row) => row.medicationConcernStatus === 'no');
  const unableEffectiveness = generation.conditions.some(
    (row) =>
      row.effectivenessStatus === 'unable_to_assess' ||
      row.effectivenessStatus === 'unsure' ||
      row.effectivenessStatus === 'no_unsure',
  );
  if (!exceptions.length && allAdherent && allEffective && noConcern) {
    return 'Patient reports taking the medication as directed and reports no concerns with effectiveness or tolerability.';
  }
  const parts: string[] = [];
  if (allAdherent) parts.push('Patient reports taking the medication as directed');
  if (allEffective && noConcern) {
    parts.push('reports no concerns with effectiveness or tolerability');
  } else if (allEffective) {
    parts.push('reports no concerns with effectiveness');
  } else if (noConcern) {
    parts.push('reports no concerns with tolerability');
  }
  if (unableEffectiveness) {
    parts.push('current symptom control could not be fully assessed during this encounter');
  }
  const lead = parts.length
    ? `${parts[0]}${parts.slice(1).map((part) => ` and ${part}`).join('')}.`
    : '';
  return [lead, exceptions.join(' ')].filter(Boolean).join(' ') || null;
}

function compactSafetySentence(generation: RenewDapGenerationPayload): string | null {
  const rows = generation.patientSpecificScreen;
  const positives = rows.filter((row) => row.positive);
  const unable = rows.filter((row) => row.unable);
  if (positives.length) {
    return [
      ...positives.map(
        (row) =>
          `Medication-specific safety review identified ${row.label.toLowerCase()}${
            row.detail ? ` (${row.detail})` : ''
          }; finding reviewed by pharmacist.`,
      ),
      ...unable.map(
        (row) =>
          `Unable to assess ${row.label.toLowerCase()}${row.detail ? ` because ${row.detail}` : ''}.`,
      ),
    ].join(' ');
  }
  if (unable.length) {
    return unable
      .map(
        (row) =>
          `Unable to assess ${row.label.toLowerCase()}${row.detail ? ` because ${row.detail}` : ''}.`,
      )
      .join(' ');
  }
  if (rows.length) {
    return 'Medication-specific safety review identified no new relevant concerns.';
  }
  return null;
}

function compactMonitoringLabel(item: RenewDapGenerationPayload['monitoringResults'][number]): string {
  const code = item.inputCode.trim().toUpperCase();
  if (code === 'EGFR' || code === 'CREATININE' || code === 'POTASSIUM') return 'renal/electrolyte';
  if (code === 'BP' || code === 'BLOOD_PRESSURE' || code === 'SBP') return 'BP';
  if (code === 'A1C' || code === 'HBA1C') return 'A1C';
  if (code === 'TSH') return 'TSH';
  return item.label;
}

function compactMonitoringSentence(generation: RenewDapGenerationPayload): string | null {
  const items = generation.monitoringResults;
  if (!items.length) return null;
  const unavailable = items.filter((row) => row.unavailable);
  const available = items.filter((row) => !row.unavailable);
  const concerning = items.filter((row) => row.reviewLabel && !/continue/i.test(row.reviewLabel));
  const sentences: string[] = [];
  if (concerning.length) {
    sentences.push(
      concerning
        .map((row) => {
          const value = row.valueText ? `${row.label} ${row.valueText}` : row.label;
          const date = row.dateText ? ` (${row.dateText})` : '';
          const review = [row.reviewLabel, row.reviewNote].filter(Boolean).join('; ');
          return `${value}${date}${review ? `, ${review}` : ''}; reviewed.`;
        })
        .join(' '),
    );
  } else {
    const withValues = available.filter((row) => row.valueText?.trim());
    if (withValues.length) {
      sentences.push(
        `${withValues
          .map((row) => {
            const date = row.dateText ? ` (${row.dateText})` : '';
            return `${compactMonitoringLabel(row)} ${row.valueText}${date}`;
          })
          .join('; ')} reviewed.`,
      );
    }
  }
  if (unavailable.length) {
    sentences.push(
      unavailable
        .map(
          (row) =>
            `No recent ${row.label} was available${
              row.unavailableReason ? ` (${row.unavailableReason})` : ''
            }.`,
        )
        .join(' '),
    );
  }
  return sentences.join(' ') || null;
}

function shortTherapyName(row: Pick<RenewDapPlanRow, 'medicationId' | 'displayName'>, payload: RenewPayload): string {
  const med = payload.medicationList.items.find((item) => item.id === row.medicationId);
  const generic = med?.normalized.genericName?.trim();
  if (generic) return generic;
  return row.displayName.replace(/\s+\d.*$/, '').trim() || row.displayName;
}

function compactAssessmentNarrative(
  generation: RenewDapGenerationPayload,
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
): string {
  const blocks: string[] = [];
  const exceptions = generation.conditions.flatMap((row) => row.exceptionNotes);
  const selected = rows.filter((row) => row.selected);
  if (selected.length && !exceptions.length) {
    const names = selected.map((row) => shortTherapyName(row, payload));
    blocks.push(
      `Based on the information obtained, continued ${joinClinicalList(names)} therapy remains appropriate.`,
    );
  }
  if (exceptions.length) {
    generation.conditions
      .filter((row) => row.exceptionNotes.length)
      .forEach((row) => {
        blocks.push(`${row.displayName}: ${row.exceptionNotes.join(' ')}`);
      });
  }
  if (generation.dtpState === 'NONE_IDENTIFIED') {
    blocks.push(
      'No drug therapy problem requiring a change in therapy was identified during this assessment.',
    );
  } else if (generation.dtps.length) {
    blocks.push(
      generation.dtps
        .map((dtp) => `${dtp.state === 'ACTUAL' ? 'Actual' : 'Potential'} drug therapy problem: ${dtp.description}`)
        .join(' '),
    );
  }
  const renal = renalAssessment(generation);
  if (renal) blocks.push(renal);
  if (selected.length) {
    const shorter = selected.filter((row) =>
      isShorterThanRequested(row.durationId, payload.renewalRequest.requestedDuration),
    );
    const durationNote = selected.map((row) => row.durationApplyNote?.trim()).find(Boolean);
    const adjective = compactDurationAdjective(
      formatPlanDuration(selected[0]!) ?? generation.renewalRequest.requestedDuration,
    );
    if (durationNote) {
      blocks.push(durationNote);
    } else if (shorter.length) {
      blocks.push(
        `A shorter ${adjective ?? ''} renewal was provided to maintain continuity of therapy while allowing reassessment.`
          .replace(/\s+/g, ' ')
          .trim(),
      );
    } else if (adjective) {
      blocks.push(
        `A ${adjective} renewal was provided to maintain continuity of therapy pending follow-up with the prescriber.`,
      );
    }
  }
  return blocks.join(' ');
}

function authorizedSupplySentence(duration: string | null): string | null {
  const adjective = compactDurationAdjective(duration);
  if (!adjective) return null;
  if (/^\d+-day$/i.test(adjective)) return `Renewal authorized for a ${adjective} supply.`;
  return `Renewal authorized for ${adjective}.`;
}

function compactPlanNarrative(
  generation: RenewDapGenerationPayload,
  _payload: RenewPayload,
  rows: RenewDapPlanRow[],
): string {
  const selected = rows.filter((row) => row.selected);
  const notRenewed = rows.filter((row) => !row.selected);
  const sentences: string[] = [];
  if (selected.length) {
    for (const row of selected) {
      const sig = exactDirections(row.directions);
      const lead = `Renewed ${row.displayName}${sig ? `: ${sig}` : ''}.`;
      const supply = authorizedSupplySentence(formatPlanDuration(row));
      const quantity = row.quantityLabel?.trim() ? `Quantity: ${row.quantityLabel.trim()}.` : null;
      sentences.push([lead, supply, quantity].filter(Boolean).join(' '));
    }
  } else {
    sentences.push('No medications were selected for renewal.');
  }
  if (notRenewed.length) {
    sentences.push(
      notRenewed
        .map((row) => {
          const why = row.safety.note || row.durationApplyNote;
          return `${row.displayName} not renewed${why && why !== 'No concerns' && why !== 'Appropriate use' ? ` — ${why}` : ' at this time'}.`;
        })
        .join(' '),
    );
  }
  if (generation.counselling.length) {
    sentences.push(generation.counselling.map((row) => row.description).join(' '));
  }
  const followUp = generation.followUp.filter((row) => row.kind !== 'REFERRAL' && row.kind !== 'PRESCRIBER');
  if (followUp.length) {
    sentences.push(followUp.map((row) => row.text).join(' '));
  }
  const referral = generation.followUp.filter((row) => row.kind === 'REFERRAL' || row.kind === 'PRESCRIBER');
  if (referral.length) sentences.push(referral.map((row) => row.text).join(' '));
  if (generation.communicationRecord) sentences.push(generation.communicationRecord);
  return sentences.join('\n');
}

function encounterHeader(payload: RenewDapGenerationPayload): string {
  const encounter = payload.encounter;
  const lines = [
    encounter.patientName ? `Patient: ${encounter.patientName}` : null,
    encounter.dob ? `DOB: ${displayDob(encounter.dob)}` : null,
    encounter.phn ? `PHN: ${encounter.phn}` : null,
    encounter.ageYears != null ? `Age: ${encounter.ageYears} years` : null,
    `Encounter: ${formatEncounterDateTime(encounter.dateTime, encounter.timeZone)}`,
    encounter.mode ? `Encounter type: ${encounter.mode === 'VIRTUAL' ? 'Virtual' : 'In person'}` : null,
    encounter.pharmacistName ? `Pharmacist: ${encounter.pharmacistName}, ${encounter.pharmacistRole}` : null,
    encounter.practiceSite ? `Practice site: ${encounter.practiceSite}` : null,
    `Nature of care: ${natureOfCare(encounter.prescribingBasis)}`,
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function natureOfCare(basis: RenewPrescribingBasis): string {
  if (basis === 'APA_ONGOING_CARE') return 'Pharmacist prescribing to manage ongoing therapy.';
  if (basis === 'OTHER_AUTHORIZED_RENEWAL') return 'Authorized pharmacist prescription renewal.';
  return 'Prescription renewal for continuity of care.';
}

function reasonForCareNarrative(generation: RenewDapGenerationPayload): string {
  const names = generation.medications.map((med) => med.displayName);
  const requested = generation.renewalRequest.requestedDuration;
  const reasons = generation.renewalRequest.reasons[0];
  const verified = generation.renewalRequest.verificationSources[0];
  const lead = names.length
    ? `Patient requested continuation of ${joinClinicalList(names)}.`
    : 'Patient requested pharmacist medication renewal.';
  const reasonLine = reasons
    ? `Reason: ${reasons}${requested ? `; requested duration ${requested}` : ''}.`
    : requested
      ? `Requested duration: ${requested}.`
      : '';
  const verifyLine = verified ? `Current therapy verified using ${verified}.` : '';
  return [lead, reasonLine, verifyLine].filter(Boolean).join(' ');
}

function currentTherapyNarrative(generation: RenewDapGenerationPayload): string {
  const lines = generation.medications.map((med) => {
    const bits = [med.displayName];
    if (med.directions) bits.push(med.directions);
    if (med.indication) bits.push(med.indication);
    return `• ${bits.join(' — ')}`;
  });
  return lines.join('\n');
}

function therapyReviewNarrative(generation: RenewDapGenerationPayload): string {
  if (!generation.conditions.length) {
    return generation.therapyCompleted
      ? 'Therapy review completed; no condition-level findings were documented.'
      : '';
  }
  return generation.conditions
    .map((condition) => {
      const who = condition.medicationNames.length
        ? `${condition.displayName} (${condition.medicationNames.join('/')})`
        : condition.displayName;
      return `• ${who} — ${condition.compactReview}`;
    })
    .join('\n');
}

function relevantHistoryNarrative(
  generation: RenewDapGenerationPayload,
  payload: RenewPayload,
): string {
  const lines: string[] = [];
  if (generation.dialysisLabel) {
    lines.push(`Renal history: Dialysis-dependent; ${generation.dialysisLabel.toLowerCase()} confirmed.`);
  }
  const extra = payload.monitoringSafety.contextAdditionalNote?.trim();
  if (extra) lines.push(extra);
  return lines.join(' ');
}

function safetyScreenNarrative(generation: RenewDapGenerationPayload): string {
  const rows = generation.patientSpecificScreen;
  if (!rows.length && !generation.safetyScreenCompleted) return '';
  const positives = rows.filter((row) => row.positive);
  const unable = rows.filter((row) => row.unable);
  if (positives.length) {
    return [
      ...positives.map(
        (row) =>
          `Patient reports ${row.label.toLowerCase()}${row.detail ? ` (${row.detail})` : ''}; finding reviewed by pharmacist.`,
      ),
      ...unable.map(
        (row) =>
          `Unable to assess ${row.label.toLowerCase()}${row.detail ? ` because ${row.detail}` : ''}.`,
      ),
    ].join(' ');
  }
  if (unable.length && positives.length === 0 && unable.length === rows.length) {
    return unable
      .map(
        (row) =>
          `Unable to assess ${row.label.toLowerCase()}${row.detail ? ` because ${row.detail}` : ''}.`,
      )
      .join(' ');
  }
  if (rows.length || generation.safetyScreenCompleted) {
    const unableLine = unable
      .map(
        (row) =>
          `Unable to assess ${row.label.toLowerCase()}${row.detail ? ` because ${row.detail}` : ''}.`,
      )
      .join(' ');
    return [
      'Medication-specific safety screening completed; no configured alarm features were reported.',
      unableLine,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function monitoringNarrative(generation: RenewDapGenerationPayload): string {
  const items = generation.monitoringResults;
  if (!items.length && !generation.monitoringCompleted) return '';
  if (!items.length) return 'Monitoring information was reviewed in the context of current therapy.';
  return items
    .map((item) => {
      if (item.unavailable) {
        return `• Recent ${item.label} result unavailable — ${item.unavailableReason ?? 'documented reason not recorded'}.`;
      }
      const datePart = item.dateText ? ` (${item.dateText})` : '';
      const bits = [`${item.label}: ${item.valueText ?? 'result recorded'}${datePart}`];
      if (item.reviewLabel) bits.push(item.reviewLabel);
      if (item.reviewNote) bits.push(item.reviewNote);
      return `• ${bits.join('; ')}.`;
    })
    .join('\n');
}

function sourcesNarrative(generation: RenewDapGenerationPayload, payload: RenewPayload): string {
  const sources = new Set<string>();
  for (const source of generation.renewalRequest.verificationSources) sources.add(source);
  for (const result of payload.monitoringSafety.results) {
    const label = result.sourceLabel?.trim();
    if (label) sources.add(label);
    else if (result.sourceType === 'UPLOADED_DOCUMENT') sources.add('Uploaded laboratory / clinical document');
    else if (result.sourceType === 'PASTED_SCREENSHOT') sources.add('Pasted laboratory screenshot');
    else if (result.sourceType === 'MANUAL' && result.status === 'AVAILABLE') {
      sources.add('Pharmacist-entered measurement');
    }
  }
  if (payload.monitoringSafety.contextAnswers.some((row) => row.pharmacistConfirmed)) {
    sources.add('Patient interview');
  }
  if (!sources.size) return '';
  return `Information sources reviewed: ${joinClinicalList([...sources])}.`;
}

function assessmentNarrative(
  generation: RenewDapGenerationPayload,
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
): string {
  const blocks: string[] = [];
  generation.conditions.forEach((condition, index) => {
    const relatedRows = rows.filter((row) =>
      condition.medicationNames.some((name) => namesMatch(row.displayName, name)),
    );
    const related =
      relatedRows.length > 0
        ? relatedRows
        : rows.filter((row) => {
            const indication = generation.medications.find((med) => med.medicationId === row.medicationId)?.indication;
            return indication === condition.displayName;
          });
    const medNames = condition.medicationNames.join(' and ') || 'current therapy';
    const indicated = `${condition.displayName[0]?.toUpperCase()}${condition.displayName.slice(1)}`;
    const adherence =
      condition.adherenceStatus === 'yes'
        ? 'Patient reports adherence.'
        : condition.adherenceStatus === 'no'
          ? condition.exceptionNotes.find((note) => /adherence/i.test(note)) || 'Adherence concern documented.'
          : '';
    const effectiveness =
      condition.effectivenessStatus === 'yes'
        ? 'No therapy-stability concern reported.'
        : condition.exceptionNotes.find((note) => /control|stability|assessed/i.test(note)) || '';
    const concern =
      condition.medicationConcernStatus === 'no'
        ? 'No other medication-related concern identified.'
        : condition.medicationConcernStatus === 'yes'
          ? condition.exceptionNotes.find((note) => !/adherence|control|assessed/i.test(note)) ||
            'Medication-related concern documented.'
          : '';
    const decision = related.map((row) => medicationAssessmentDecision(row, payload)).filter(Boolean).join(' ');
    const body = [adherence, effectiveness, concern, decision].filter(Boolean).join(' ');
    blocks.push(`${index + 1}. ${indicated}\nCurrent ${medNames} remains indicated. ${body}`.trim());
  });

  if (!blocks.length) {
    const selected = rows.filter((row) => row.selected);
    if (selected.length) {
      blocks.push(
        `${joinClinicalList(selected.map((row) => row.displayName))} remain${selected.length === 1 ? 's' : ''} indicated for continuation based on the confirmed renewal review.`,
      );
    }
  }

  if (generation.dtpState === 'NONE_IDENTIFIED') {
    blocks.push(
      'No actual or potential drug therapy problem identified that would prevent the planned renewal.',
    );
  } else if (generation.dtps.length) {
    blocks.push(
      generation.dtps
        .map((dtp) => `${dtp.state === 'ACTUAL' ? 'Actual' : 'Potential'} drug therapy problem: ${dtp.description}`)
        .join(' '),
    );
  }

  const renal = renalAssessment(generation);
  if (renal) blocks.push(renal);

  const monitoring = monitoringAssessment(payload, generation);
  if (monitoring) blocks.push(monitoring);

  const options = optionsConsidered(payload, rows);
  if (options) blocks.push(options);

  const duration = durationRationale(payload, rows);
  if (duration) blocks.push(duration);

  if (generation.resourcesConsulted.length) {
    blocks.push(`Resources consulted:\n${generation.resourcesConsulted.map((row) => `• ${row}`).join('\n')}`);
  }

  return blocks.join('\n\n');
}

function renewalPlanNarrative(
  generation: RenewDapGenerationPayload,
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
): string {
  const selected = rows.filter((row) => row.selected);
  const notRenewed = rows.filter((row) => !row.selected);
  const renewed = selected.map((row) => {
    const duration = formatPlanDuration(row);
    const qty = generation.medications.find((med) => med.medicationId === row.medicationId)?.quantityLabel;
    const bits = [row.displayName];
    if (row.directions) bits.push(row.directions);
    if (duration) bits.push(`${duration} renewal`);
    if (qty) bits.push(`Quantity: ${qty}`);
    return `• ${bits.join(' — ')}.`;
  });
  const declined = notRenewed.map((row) => {
    const why = row.safety.note || row.durationApplyNote || row.safety.label;
    return `• ${row.displayName} not renewed${why && why !== 'No concerns' ? ` — ${why}` : ' at this time'}.`;
  });
  const parts: string[] = [];
  if (renewed.length) parts.push(`Renewed:\n${renewed.join('\n')}`);
  else parts.push('No medications were selected for renewal.');
  if (declined.length) parts.push(`Not renewed:\n${declined.join('\n')}`);
  return parts.join('\n');
}

function counsellingNarrative(generation: RenewDapGenerationPayload): string {
  if (!generation.counselling.length) return '';
  return generation.counselling.map((row) => row.description).join(' ');
}

function followUpNarrative(generation: RenewDapGenerationPayload): string {
  const rows = generation.followUp.filter((row) => row.kind !== 'REFERRAL');
  if (!rows.length) return '';
  return rows.map((row) => `• ${row.text}`).join('\n');
}

function communicationNarrative(generation: RenewDapGenerationPayload): string {
  const referral = generation.followUp.filter((row) => row.kind === 'REFERRAL' || row.kind === 'PRESCRIBER');
  const lines = referral.map((row) => row.text);
  if (generation.patientHandoutGenerated) {
    lines.push('Patient handout generated/provided: yes.');
  }
  if (generation.communicationRecord) lines.push(generation.communicationRecord);
  return lines.join(' ');
}

function pharmacistFooter(payload: RenewDapGenerationPayload): string {
  const encounter = payload.encounter;
  const lines = [
    encounter.pharmacistName ? `${encounter.pharmacistName}, ${encounter.pharmacistRole}` : null,
    encounter.practiceSite,
    formatEncounterDateTime(encounter.dateTime, encounter.timeZone),
    encounter.mode ? `Encounter mode: ${encounter.mode === 'VIRTUAL' ? 'Virtual' : 'In person'}` : null,
  ].filter((line): line is string => Boolean(line));
  return lines.length ? `\n${lines.join('\n')}` : '';
}

function indicationForMedication(medicationId: string, payload: RenewPayload): string | null {
  const mapping = payload.therapyReview.mappings.find((row) => row.medicationId === medicationId);
  if (!mapping || !isIndicationResolved(mapping)) return null;
  if (mapping.customIndicationText?.trim()) return mapping.customIndicationText.trim();
  if (mapping.conditionId) {
    const review = payload.therapyReview.reviews.find((row) => row.conditionId === mapping.conditionId);
    const fromReview = review ? resolveConditionName(review, payload.therapyReview.mappings) : null;
    if (fromReview && fromReview !== 'This condition') return fromReview;
    const candidate = mapping.candidates.find((row) => row.conditionId === mapping.conditionId);
    if (candidate?.displayName?.trim()) return candidate.displayName.trim();
  }
  return null;
}

function resolveConditionName(
  review: Pick<RenewConditionReview, 'conditionId' | 'customConditionText'>,
  mappings: RenewMedicationIndication[],
): string {
  const custom = review.customConditionText?.trim();
  if (custom) return custom;
  if (review.conditionId) {
    for (const mapping of mappings) {
      const candidate = mapping.candidates.find((row) => row.conditionId === review.conditionId);
      if (candidate?.displayName?.trim()) return candidate.displayName.trim();
    }
  }
  return 'This condition';
}

function compactTherapyLine(review: RenewConditionReview, exceptionNotes: string[]): string {
  if (exceptionNotes.length) return exceptionNotes.join(' ');
  const parts: string[] = [];
  if (review.adherenceStatus === 'yes') parts.push('patient reports taking the medication as directed');
  if (review.effectivenessStatus === 'yes' && review.medicationConcernStatus === 'no') {
    parts.push('reports no concerns with effectiveness or tolerability');
  } else if (review.effectivenessStatus === 'yes') {
    parts.push('reports no concerns with effectiveness');
  } else if (review.medicationConcernStatus === 'no') {
    parts.push('reports no concerns with tolerability');
  } else if (
    review.effectivenessStatus === 'unable_to_assess' ||
    review.effectivenessStatus === 'unsure' ||
    review.effectivenessStatus === 'no_unsure'
  ) {
    parts.push('current symptom control could not be fully assessed');
  }
  return parts.length ? `${parts.join('; ')}.` : '';
}

function buildPatientSpecificScreen(
  payload: RenewPayload,
  clinical?: RenewDapClinicalContext,
): RenewDapGenerationPayload['patientSpecificScreen'] {
  const byCode = new Map((clinical?.patientContext ?? []).map((row) => [row.inputCode, row]));
  const rows: RenewDapGenerationPayload['patientSpecificScreen'] = [];
  const answers = clinical?.patientContext?.length
    ? clinical.patientContext.map((row) => row.answer)
    : payload.monitoringSafety.contextAnswers;
  for (const answer of answers) {
    if (!answer.pharmacistConfirmed && answer.status !== 'UNKNOWN' && answer.status !== 'UNAVAILABLE') {
      continue;
    }
    const requirement = byCode.get(answer.inputCode);
    const choice = contextChoiceFromAnswer(answer);
    const label = requirement?.label?.trim() || humanizeCode(answer.inputCode);
    const unable =
      answer.status === 'UNKNOWN' || answer.status === 'UNAVAILABLE' || choice === 'unknown';
    const positive =
      !unable && choice
        ? isPositiveSafetyFinding(
            {
              stableAnswer: requirement?.stableAnswer ?? null,
              triggerAnswer: requirement?.triggerAnswer ?? null,
            },
            choice,
          )
        : false;
    if (!unable && !choice) continue;
    rows.push({
      inputCode: answer.inputCode,
      label,
      positive,
      unable,
      detail: unable
        ? answer.unableReasonText?.trim() || answer.note?.trim() || null
        : answer.note?.trim() || answer.followup?.details?.trim() || null,
    });
  }
  return rows;
}

function buildMonitoringResults(
  payload: RenewPayload,
  clinical?: RenewDapClinicalContext,
): RenewDapGenerationPayload['monitoringResults'] {
  const byCode = new Map((clinical?.monitoring ?? []).map((row) => [row.inputCode, row]));
  return payload.monitoringSafety.results
    .filter(
      (result) =>
        result.pharmacistConfirmed || result.status === 'UNAVAILABLE' || result.status === 'AVAILABLE',
    )
    .map((result) => {
      const requirement = byCode.get(result.inputCode);
      const label =
        requirement?.label?.trim() || formatMonitoringCodeLabel(result.inputCode);
      const review = payload.monitoringSafety.itemReviews.find((row) => row.inputCode === result.inputCode);
      const unavailable = result.status === 'UNAVAILABLE' || result.status === 'PENDING';
      const parsed = parseUnavailableNote(result.note);
      return {
        inputCode: result.inputCode,
        label,
        unavailable,
        unavailableReason: unavailable
          ? parsed.reasonLabel || parsed.extra || parsed.shortLabel
          : null,
        valueText: unavailable ? null : formatMonitoringResult(result, requirement?.unit ?? result.value?.unit),
        dateText: result.observedDate ? formatMonitoringDate(result.observedDate) : null,
        reviewLabel: review
          ? MONITORING_REVIEW_ACTION_OPTIONS.find((row) => row.id === review.action)?.reviewLabel ?? null
          : null,
        reviewNote: review?.note?.trim() || null,
      };
    });
}

function formatMonitoringCodeLabel(code: string): string {
  const upper = code.trim().toUpperCase();
  if (upper === 'EGFR') return 'eGFR';
  if (upper === 'BP') return 'BP';
  if (upper === 'HR') return 'HR';
  if (upper === 'TSH') return 'TSH';
  if (upper === 'INR') return 'INR';
  if (upper === 'A1C') return 'A1C';
  return humanizeCode(code);
}

function conditionExceptionNotes(
  review: RenewConditionReview,
  displayName: string,
  medications: RenewMedication[],
): string[] {
  const notes: string[] = [];
  if (review.adherenceStatus === 'no') {
    const narrative = formatAdherenceConcernsNarrative(review.issues, medications);
    notes.push(narrative || 'Adherence concern identified.');
  }
  const effectiveness = formatEffectivenessNarrative(review, displayName, null);
  if (effectiveness) notes.push(effectiveness);
  if (review.medicationConcernStatus === 'yes') {
    const narrative = formatMedicationConcernsNarrative(review.issues, medications);
    notes.push(narrative || 'Medication-related concern documented.');
  }
  return notes;
}

function collectDtps(payload: RenewPayload, clinical?: RenewDapClinicalContext): RenewDapDtpRecord[] {
  const dtps: RenewDapDtpRecord[] = [];
  for (const review of payload.therapyReview.reviews) {
    if (review.adherenceStatus === 'no') {
      const description =
        formatAdherenceConcernsNarrative(review.issues, payload.medicationList.items) ||
        'Adherence concern documented during therapy review.';
      dtps.push({ state: 'POTENTIAL', description, source: 'therapy_review' });
    }
    if (isEffectivenessConcern(review.effectivenessStatus)) {
      const name = resolveConditionName(review, payload.therapyReview.mappings);
      const description =
        formatEffectivenessNarrative(review, name, null) ||
        `Effectiveness/stability concern documented for ${name}.`;
      dtps.push({ state: 'POTENTIAL', description, source: 'therapy_review' });
    }
    if (review.medicationConcernStatus === 'yes') {
      const description =
        formatMedicationConcernsNarrative(review.issues, payload.medicationList.items) ||
        'Medication-related concern documented during therapy review.';
      dtps.push({ state: 'ACTUAL', description, source: 'therapy_review' });
    }
  }
  for (const review of payload.monitoringSafety.itemReviews) {
    if (review.action === 'DO_NOT_RENEW_MEDICATION' || review.action === 'REFER' || review.action === 'CONTACT_PRESCRIBER') {
      const label = monitoringLabel(payload, review.inputCode, clinical);
      const action = MONITORING_REVIEW_ACTION_OPTIONS.find((row) => row.id === review.action)?.label ?? review.action;
      dtps.push({
        state: review.action === 'DO_NOT_RENEW_MEDICATION' ? 'ACTUAL' : 'POTENTIAL',
        description: `${label}: ${action}${review.note?.trim() ? ` — ${review.note.trim()}` : ''}.`,
        source: 'monitoring_review',
      });
    }
  }
  return dtps;
}

function resolveDtpState(payload: RenewPayload, dtps: RenewDapDtpRecord[]): RenewDtpState {
  if (dtps.length) return dtps.some((row) => row.state === 'ACTUAL') ? 'ACTUAL' : 'POTENTIAL';
  if (payload.therapyReview.completed && payload.monitoringSafety.completed) return 'NONE_IDENTIFIED';
  return 'NOT_ASSESSED';
}

function collectCounselling(payload: RenewPayload): RenewDapCounsellingRecord[] {
  const rows: RenewDapCounsellingRecord[] = [];
  for (const issue of payload.therapyReview.reviews.flatMap((review) => review.issues)) {
    if (!issue.actionTaken || !COUNSEL_ACTION_IDS.has(issue.actionTaken)) continue;
    const details = issue.details?.trim() || issue.otherActionText?.trim();
    rows.push({
      description: details
        ? `Counselling documented: ${details}.`
        : `${medicationConcernActionLabel(issue.actionTaken)}.`,
    });
  }
  return rows;
}

function collectFollowUp(payload: RenewPayload, clinical?: RenewDapClinicalContext): RenewDapFollowUpRecord[] {
  const rows: RenewDapFollowUpRecord[] = [];
  for (const issue of payload.therapyReview.reviews.flatMap((review) => review.issues)) {
    if (!issue.actionTaken) continue;
    if (REFERRAL_ACTION_IDS.has(issue.actionTaken)) {
      rows.push({
        kind: 'REFERRAL',
        text: `Recommended follow-up with the patient's primary prescriber regarding ${issue.details?.trim() || 'the documented concern'}.`,
      });
    } else if (issue.actionTaken === 'recommend_follow_up_or_labs') {
      rows.push({
        kind: 'PRESCRIBER',
        text: issue.details?.trim() || 'Recommend follow-up / labs as documented during therapy review.',
      });
    } else if (issue.actionTaken === 'renew_short_term_only') {
      rows.push({
        kind: 'SHORTER_RENEWAL',
        text: 'Shorter renewal selected to allow reassessment.',
      });
    } else if (issue.actionTaken === 'continue_and_monitor' || issue.actionTaken === 'monitor') {
      rows.push({
        kind: 'MONITORING',
        text: issue.details?.trim() || 'Continue therapy and monitor as documented.',
      });
    }
  }
  for (const review of payload.monitoringSafety.itemReviews) {
    const label = monitoringLabel(payload, review.inputCode, clinical);
    const extra = review.note?.trim() || review.otherText?.trim();
    if (review.action === 'SHORTER_RENEWAL') {
      rows.push({
        kind: 'SHORTER_RENEWAL',
        text: `${label} — shorter renewal / reassess sooner${extra ? `; ${extra}` : ''}.`,
      });
    } else if (review.action === 'FOLLOW_UP_WITH_PRESCRIBER' || review.action === 'CONTACT_PRESCRIBER') {
      rows.push({
        kind: 'PRESCRIBER',
        text: `Recommend follow-up with the patient's primary prescriber regarding ${label.toLowerCase()}${extra ? ` (${extra})` : ''}.`,
      });
    } else if (review.action === 'REFER') {
      rows.push({
        kind: 'REFERRAL',
        text: `Referred for assessment regarding ${label.toLowerCase()}${extra ? ` (${extra})` : ''}.`,
      });
    } else if (review.action === 'CONTINUE_AND_MONITOR') {
      rows.push({
        kind: 'MONITORING',
        text: `${label} — continue according to current therapy and clinical context${extra ? `; ${extra}` : ''}.`,
      });
    }
  }
  return dedupeFollowUp(rows);
}

function collectResources(
  payload: RenewPayload,
  clinical: RenewDapClinicalContext | undefined,
  dialysisLabel: string | null,
  uncovered: boolean,
): string[] {
  const resources: string[] = [];
  if (payload.monitoringSafety.completed || (clinical?.monitoring?.length ?? 0) > 0) {
    resources.push('SafeScribe Renew monitoring configuration');
    resources.push(`${RENEW_SAFETY_REPOSITORY.name} used during this review`);
  }
  if (dialysisLabel) resources.push('Applicable SafeScribe renal/dialysis safety review');
  if (uncovered) {
    resources.push('Dialysis-specific published rule coverage was incomplete for one or more medications');
  }
  return resources;
}

function renalAssessment(generation: RenewDapGenerationPayload): string | null {
  if (!generation.dialysisLabel && !generation.uncoveredMedicationNames.length) return null;
  const parts = ['Renal/dialysis assessment:'];
  if (generation.dialysisLabel) {
    parts.push(`Patient is dialysis-dependent (${generation.dialysisLabel}). Renal medication review was performed using confirmed dialysis status and available medication-specific information.`);
  }
  if (generation.uncoveredMedicationNames.length) {
    parts.push(
      `Dialysis-specific dosing could not be fully resolved for ${joinClinicalList(generation.uncoveredMedicationNames)} because no applicable published rule was available in the active Safety Engine release. Pharmacist review was completed as documented in the plan.`,
    );
  }
  return parts.join(' ');
}

function monitoringAssessment(payload: RenewPayload, generation: RenewDapGenerationPayload): string | null {
  const reviews = payload.monitoringSafety.itemReviews;
  if (!reviews.length && !generation.dialysisLabel) return null;
  const parts = reviews.map((review) => {
    const label = monitoringLabel(payload, review.inputCode);
    const action = MONITORING_REVIEW_ACTION_OPTIONS.find((row) => row.id === review.action)?.summaryLabel;
    return action ? `${label}: ${action}${review.note?.trim() ? ` (${review.note.trim()})` : ''}.` : null;
  });
  return parts.filter(Boolean).join(' ') || null;
}

function optionsConsidered(payload: RenewPayload, rows: RenewDapPlanRow[]): string | null {
  const requested = payload.renewalRequest.requestedDuration;
  const selected = rows.filter((row) => row.selected);
  const notRenewed = rows.filter((row) => !row.selected);
  const options: string[] = [];
  const shorter = selected.some((row) => isShorterThanRequested(row.durationId, requested));
  if (shorter) {
    options.push('full requested renewal', 'shorter interim renewal with reassessment');
  }
  if (notRenewed.length) options.push('withholding renewal of selected medication(s)');
  if (payload.monitoringSafety.itemReviews.some((row) => row.action === 'FOLLOW_UP_WITH_PRESCRIBER')) {
    options.push('recommend prescriber follow-up');
  }
  if (!options.length) return null;
  return `Options considered: ${joinClinicalList(options)}.`;
}

function durationRationale(payload: RenewPayload, rows: RenewDapPlanRow[]): string | null {
  const selected = rows.filter((row) => row.selected);
  if (!selected.length) return null;
  const notes = selected
    .map((row) => row.durationApplyNote?.trim())
    .filter((note): note is string => Boolean(note));
  const requested = payload.renewalRequest.requestedDuration;
  const shorter = selected.filter((row) => isShorterThanRequested(row.durationId, requested));
  if (notes.length) return notes[0] ?? null;
  if (shorter.length) {
    const labels = shorter.map((row) => `${row.displayName} (${formatPlanDuration(row) ?? 'shorter interval'})`);
    return `A shorter renewal interval was provided for ${joinClinicalList(labels)} rather than the requested ${formatRenewDuration(payload.renewalRequest) ?? 'duration'} to allow reassessment.`;
  }
  return null;
}

function medicationAssessmentDecision(row: RenewDapPlanRow, payload: RenewPayload): string {
  if (!row.selected) {
    const why = row.safety.note || row.durationApplyNote;
    return `Renewal of ${row.displayName} was not provided${why ? ` because ${why}` : ''}.`;
  }
  const duration = formatPlanDuration(row);
  const shorter = isShorterThanRequested(row.durationId, payload.renewalRequest.requestedDuration);
  if (shorter) {
    return `Renewal considered appropriate for ${row.displayName} for a ${duration ?? 'shorter'} interval to maintain continuity while follow-up is arranged.`;
  }
  return `Renewal considered appropriate for ${row.displayName}${duration ? ` for ${duration}` : ''} to maintain continuity of therapy.`;
}

function isPositiveSafetyFinding(
  row: { stableAnswer?: 'YES' | 'NO' | 'UNKNOWN' | null; triggerAnswer?: string | null },
  choice: 'yes' | 'no',
): boolean {
  const trigger = row.triggerAnswer?.trim().toUpperCase();
  if (trigger === 'YES' || trigger === 'NO') return choice === trigger.toLowerCase();
  if (row.stableAnswer === 'NO') return choice === 'yes';
  if (row.stableAnswer === 'YES') return choice === 'no';
  return choice === 'yes';
}

function monitoringLabel(
  payload: RenewPayload,
  inputCode: string,
  clinical?: RenewDapClinicalContext,
): string {
  const fromClinical = clinical?.monitoring?.find((row) => row.inputCode === inputCode)?.label;
  if (fromClinical?.trim()) return fromClinical.trim();
  const fromContext = clinical?.patientContext?.find((row) => row.inputCode === inputCode)?.label;
  if (fromContext?.trim()) return fromContext.trim();
  return humanizeCode(inputCode);
}

function documentOfKind(
  documents: RenewGeneratedDocument[] | undefined,
  kind: RenewGeneratedDocument['kind'],
): RenewGeneratedDocument | undefined {
  return documents?.find((doc) => doc.kind === kind);
}

function formatPlanDuration(row: Pick<RenewDapPlanRow, 'durationId' | 'customDurationDays' | 'customDurationText'>): string | null {
  if (!row.durationId) return null;
  if (row.durationId === 'custom') {
    if (row.customDurationDays && row.customDurationDays > 0) return `${row.customDurationDays} days`;
    return row.customDurationText?.trim() || 'Custom';
  }
  return RENEW_DURATION_OPTIONS.find((option) => option.id === row.durationId)?.label ?? null;
}

function isShorterThanRequested(
  selectedId: string | null | undefined,
  requestedId: string | null | undefined,
): boolean {
  if (!selectedId || !requestedId) return false;
  const selected = DURATION_RANK[selectedId];
  const requested = DURATION_RANK[requestedId];
  if (selected == null || requested == null) return false;
  return selected < requested;
}

function formatEncounterDateTime(iso: string, timeZone = 'America/Edmonton'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
      timeZone,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')}-${get('month')}-${get('year')}, ${get('hour')}:${get('minute')}`;
  } catch {
    return iso;
  }
}

function labeledBlock(label: string, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  return `${label}:\n${text}`;
}

function joinClinicalList(items: string[]): string {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length <= 1) return unique[0] ?? '';
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesMatch(displayName: string, shortName: string): boolean {
  const left = displayName.toLowerCase();
  const right = shortName.toLowerCase();
  return left.includes(right) || right.includes(left.split(' ')[0] ?? '');
}

function dedupeFollowUp(rows: RenewDapFollowUpRecord[]): RenewDapFollowUpRecord[] {
  const seen = new Set<string>();
  const out: RenewDapFollowUpRecord[] = [];
  for (const row of rows) {
    const key = `${row.kind}:${row.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
