/**
 * DAP Consultation Note payload, prompt, and post-generation validation.
 *
 * Spec: SafeScribe DAP Prompt and Backend Preprocessing.
 * The LLM writes prose from a clean verified payload — it does not decide
 * what happened, and it must never see raw UI questions or internal IDs.
 */

import {
  extractCounsellingSectionPoints,
  getConfirmedTreatmentRows,
  isCounsellingConfirmed,
  pcpDisplayNameFromTreatment,
  pcpPatientDirectionsFromTreatment,
} from './pcp-communication';
import {
  isTechnicalClinicalId,
  scrubTechnicalIdsFromProse,
  toClinicalScreeningPhrase,
} from './clinical-note-prose';
import { isCounsellingUiPlaceholder } from './counselling-payload';
import {
  ensureDapOpeningConsent,
  stripOverallRedFlagClaim,
} from './documentation-encounter';
import {
  containsPlannedFollowUpLanguage,
  ensureFollowUpInPlan,
  ensureSafetySummariesInAssessment,
  isGenericNegativeSafetySummary,
  renderDapFollowUpPlan,
  stripCounsellingLeakageFromPlan,
  stripGenericSafetySentences,
  type DapFollowUpPlan,
  type DapObjectiveDatum,
  type DapPatientSpecificSafety,
} from './dap-payload-clinical';

export const DAP_NOTE_TITLE = 'Pharmacist Consultation Note';

export { DAP_CONSULTATION_NOTE_PROMPT } from './dap-consultation-note-prompt';

export const DOCUMENTATION_PRESCRIPTION_PROMPT = `You are a clinical pharmacist documentation assistant drafting a printable prescription from VERIFIED, pharmacist-confirmed treatment data.

This is a formatting task. You must NOT invent, optimize, substitute, or complete missing prescription facts.

# SOURCE OF TRUTH

Use ONLY the validated prescription_payload in the user message.

# OUTPUT — JSON ONLY

{
  "diagnosis": "indication from confirmed assessment, or empty",
  "notes": "short indication line if supplied, otherwise empty",
  "specialInstructions": "only confirmed extra instructions, otherwise empty",
  "patientBlock": "leave empty — backend fills patient demographics",
  "medicationBlock": "leave empty — backend fills exact SIG lines"
}

# RULES

1. Use each treatment display_name and patient_directions exactly. Do not add brand names, generics, trademark symbols, or "as directed".
2. Include every confirmed prescription treatment. Do not omit one.
3. Do not mention SafeScribe, AI, pathways, or consultation IDs.
4. If no prescription treatment is confirmed, return empty strings.
`;

export type DapFindingStatus = 'present' | 'absent' | 'uncertain';

export interface DapDocumentationFinding {
  clinical_label: string;
  status: DapFindingStatus;
  documentation_value: string;
}

export interface DapSelectedTreatment {
  display_name: string;
  patient_directions: string;
  pharmacist_confirmed?: true;
  treatment_id?: string;
  ingredient_id?: string;
  product_id?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
}

export interface DapPayload {
  consent_obtained?: boolean;
  patient_context: {
    age_years?: number | null;
    sex?: string | null;
    allergies: string[];
    conditions: string[];
    current_medications: string[];
    pregnancy?: string | null;
    breastfeeding?: string | null;
    labs: string[];
    vitals: string[];
  };
  objective_data: DapObjectiveDatum[];
  presenting_concern: string | null;
  clinical_findings: DapDocumentationFinding[];
  eligibility_findings: DapDocumentationFinding[];
  red_flags: {
    screening_completed: boolean;
    negative_findings: string[];
    positive_findings: string[];
    uncertain_findings: string[];
    referral_required: boolean;
    no_red_flags_requiring_referral_confirmed: boolean;
  };
  assessment: {
    condition: string | null;
    eligible_for_pharmacist_management: boolean | null;
    diagnostic_certainty?: string | null;
  };
  meaningful_differentials: string[];
  patient_specific_safety: DapPatientSpecificSafety[];
  treatment_safety: {
    review_completed: boolean;
    clinically_significant_findings: string[];
  };
  selected_treatments: DapSelectedTreatment[];
  follow_up_plan?: DapFollowUpPlan | null;
  follow_up_incomplete?: boolean;
  treatment_rationale: string | null;
  counselling_confirmed: boolean;
  confirmed_counselling?: {
    medication_use: string[];
    expected_response: string[];
    self_care: string[];
    follow_up: string[];
    treatment_expectations?: string[];
    common_side_effects?: string[];
    routine_follow_up?: string[];
    safety_net?: string[];
  };
  patient_handout_provided: boolean;
  referral: {
    recommended: boolean;
    action_completed: boolean;
    reason?: string | null;
    destination?: string | null;
  };
  pcp_communication: {
    planned: boolean;
    completed: boolean;
    method?: string | null;
  };
}

export interface DapValidationResult {
  ok: boolean;
  reasons: string[];
  medicationFailed: boolean;
  unsupportedFacts: boolean;
}

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const QUESTION_LEAD =
  /^(has|have|does|do|is|are|was|were|did|can|could|should)\s+(the\s+)?patient\b/i;
const TRADEMARK = /[®™©]/;
const GENERICS = /\bgenerics\b/i;
const INTERNAL =
  /\b(?:safescribe|guided pathway|clinical judgment|safety engine|safety alert|rules engine|pathway id|consultation id|ai-generated|confidence score)\b/i;
const HANDOUT_MENTION = /patient education|handout provided|written information provided/i;
const REFERRAL_COMPLETED = /referral was (completed|arranged|made|sent)/i;
const PCP_COMPLETED = /primary care (provider|physician).{0,40}(notified|faxed|sent|informed)/i;

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldNote(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function unique(values: Array<string | null | undefined>, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const t = clean(raw);
    if (!t || isCounsellingUiPlaceholder(t) || isTechnicalClinicalId(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function emptyDapPayload(): DapPayload {
  return {
    patient_context: {
      allergies: [],
      conditions: [],
      current_medications: [],
      labs: [],
      vitals: [],
    },
    presenting_concern: null,
    clinical_findings: [],
    eligibility_findings: [],
    red_flags: {
      screening_completed: false,
      negative_findings: [],
      positive_findings: [],
      uncertain_findings: [],
      referral_required: false,
      no_red_flags_requiring_referral_confirmed: false,
    },
    assessment: {
      condition: null,
      eligible_for_pharmacist_management: null,
    },
    meaningful_differentials: [],
    objective_data: [],
    patient_specific_safety: [],
    treatment_safety: {
      review_completed: false,
      clinically_significant_findings: [],
    },
    selected_treatments: [],
    treatment_rationale: null,
    counselling_confirmed: false,
    patient_handout_provided: false,
    referral: { recommended: false, action_completed: false },
    pcp_communication: { planned: false, completed: false },
  };
}

export function toDapSelectedTreatment(
  row: Record<string, unknown>,
): DapSelectedTreatment | null {
  const display_name = pcpDisplayNameFromTreatment(row);
  if (!display_name) return null;
  const patient_directions = pcpPatientDirectionsFromTreatment(row);
  const dose = clean(row.dose);
  const route = clean(row.route);
  const frequency = clean(row.frequency);
  const duration = clean(row.duration);
  const treatment_id = clean(
    row.treatment_id ?? row.treatmentId ?? row.canonical_treatment_id ?? row.canonicalTreatmentId,
  );
  const ingredient_id = clean(
    row.ingredient_id ?? row.ingredientId ?? row.genericName ?? row.generic_name,
  );
  const product_id = clean(row.product_id ?? row.productId ?? row.brandName ?? row.brand_name);
  return {
    display_name,
    patient_directions,
    pharmacist_confirmed: true,
    ...(treatment_id ? { treatment_id } : {}),
    ...(ingredient_id ? { ingredient_id: foldIngredientKey(ingredient_id) } : {}),
    ...(product_id ? { product_id: foldIngredientKey(product_id) } : {}),
    ...(dose ? { dose } : {}),
    ...(route ? { route } : {}),
    ...(frequency ? { frequency } : {}),
    ...(duration ? { duration } : {}),
  };
}

function foldIngredientKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function renderDapPlanTreatments(treatments: DapSelectedTreatment[]): string {
  return treatments
    .map((t) => {
      const directions = t.patient_directions?.trim() || '';
      return directions
        ? `**${t.display_name}:** ${directions}`
        : `**${t.display_name}**`;
    })
    .join('\n\n');
}

export function normalizeDapFinding(input: {
  label?: string | null;
  question?: string | null;
  answer?: unknown;
  documentationValue?: string | null;
}): DapDocumentationFinding | null {
  const rawAnswer = clean(input.answer).toLowerCase();
  if (!rawAnswer || /^(n\/?a|na|not assessed|unknown|null|undefined|-)$/.test(rawAnswer)) {
    return null;
  }
  let status: DapFindingStatus = 'present';
  if (/^(no|false|n|absent|negative)$/.test(rawAnswer)) status = 'absent';
  else if (/unable|uncertain|unknown|not sure/.test(rawAnswer)) status = 'uncertain';
  else if (!/^(yes|true|y|present|positive)$/.test(rawAnswer) && rawAnswer.length < 8) {
    return null;
  }

  const supplied = clean(input.documentationValue);
  const label =
    toClinicalScreeningPhrase(input.label) ||
    toClinicalScreeningPhrase(input.question) ||
    (supplied && !QUESTION_LEAD.test(supplied) ? supplied : null);
  if (!label) return null;

  let documentation_value = supplied;
  if (!documentation_value || QUESTION_LEAD.test(documentation_value) || /\?\s*$/.test(documentation_value)) {
    if (status === 'present') {
      documentation_value = `Patient reported ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
    } else if (status === 'absent') {
      documentation_value = `No ${label.charAt(0).toLowerCase()}${label.slice(1)} identified.`;
    } else {
      documentation_value = `${label} could not be confirmed.`;
    }
  }

  return {
    clinical_label: label,
    status,
    documentation_value: documentation_value.replace(/\s+/g, ' ').trim(),
  };
}

const OMIT_EMPTY_ARRAY_KEYS = new Set([
  'labs',
  'vitals',
  'allergies',
  'conditions',
  'current_medications',
]);

export function stripInternalDapFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripInternalDapFields(item)) as T;
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (
      /(_id|_uuid|uuid|question_id|rule_id|source_id|pathway_id|confidence|questionText|question_text)$/i.test(
        key,
      ) ||
      key === 'question'
    ) {
      continue;
    }
    if (nested == null || nested === '') continue;
    if (Array.isArray(nested) && nested.length === 0 && OMIT_EMPTY_ARRAY_KEYS.has(key)) {
      continue;
    }
    out[key] = stripInternalDapFields(nested);
  }
  return out as T;
}

function joinedNote(fields: Record<string, string>): string {
  return `${fields.data ?? ''}\n${fields.assessment ?? ''}\n${fields.plan ?? ''}`;
}

export function validateDapNote(
  fields: Record<string, string>,
  payload: DapPayload,
): DapValidationResult {
  const reasons: string[] = [];
  const text = joinedNote(fields);
  let medicationFailed = false;
  let unsupportedFacts = false;

  if (UUID.test(text) || /pathway:[0-9a-f-]+/i.test(text)) {
    reasons.push('internal identifier leaked');
    unsupportedFacts = true;
  }
  if (QUESTION_LEAD.test(text) || /\?\s*$/m.test(fields.data ?? '')) {
    if (/has the patient|does the patient|is the following present/i.test(text)) {
      reasons.push('raw question phrasing');
      unsupportedFacts = true;
    }
  }
  if (INTERNAL.test(text)) {
    reasons.push('internal system terminology');
    unsupportedFacts = true;
  }
  if (TRADEMARK.test(text) || GENERICS.test(text)) {
    reasons.push('invented brand or generic decoration');
    medicationFailed = true;
  }

  const plan = fields.plan ?? '';
  for (const t of payload.selected_treatments) {
    const name = t.display_name.toLowerCase();
    if (name && !plan.toLowerCase().includes(name) && !text.toLowerCase().includes(name)) {
      reasons.push(`missing treatment ${t.display_name}`);
      medicationFailed = true;
    }
  }

  if (!payload.counselling_confirmed && /counselling was (provided|completed|reviewed)/i.test(text)) {
    reasons.push('unconfirmed counselling');
    unsupportedFacts = true;
  }
  if (
    /no red flags requiring referral/i.test(text) &&
    payload.red_flags.no_red_flags_requiring_referral_confirmed !== true
  ) {
    reasons.push('unsupported overall red-flag claim');
    unsupportedFacts = true;
  }
  if (!payload.patient_handout_provided && HANDOUT_MENTION.test(text)) {
    reasons.push('handout documented but not provided');
    unsupportedFacts = true;
  }
  if (!payload.referral.action_completed && REFERRAL_COMPLETED.test(text)) {
    reasons.push('referral described as completed');
    unsupportedFacts = true;
  }
  if (!payload.pcp_communication.completed && PCP_COMPLETED.test(text)) {
    reasons.push('PCP communication described as completed');
    unsupportedFacts = true;
  }
  if (
    isGenericNegativeSafetySummary(text) &&
    !(payload.patient_specific_safety ?? []).length
  ) {
    reasons.push('generic negative safety statement');
    unsupportedFacts = true;
  }
  if (
    (payload.patient_specific_safety ?? []).some(
      (item) =>
        item.documentation_summary &&
        !foldNote(text).includes(foldNote(item.documentation_summary).slice(0, 24)),
    )
  ) {
    reasons.push('missing confirmed safety implication');
    unsupportedFacts = true;
  }
  if (payload.follow_up_incomplete) {
    reasons.push('follow-up plan incomplete');
    unsupportedFacts = true;
  }
  if (
    payload.follow_up_plan?.pharmacist_confirmed === true &&
    !containsPlannedFollowUpLanguage(plan)
  ) {
    reasons.push('confirmed follow-up missing from plan');
    unsupportedFacts = true;
  }
  const duplicateGroups = findDuplicateCanonicalTreatments(payload.selected_treatments);
  if (duplicateGroups.length) {
    reasons.push(
      `duplicate canonical treatment selection (${duplicateGroups
        .map((g) => g.map((t) => t.display_name).join(' / '))
        .join('; ')})`,
    );
    medicationFailed = true;
  }

  return {
    ok: reasons.length === 0,
    reasons,
    medicationFailed,
    unsupportedFacts,
  };
}

function stripMissingEntryPadding(text: string): string {
  const topic =
    '(?:laboratory results?(?: or vital signs?)?|lab(?:oratory)? (?:results?|values?)|vital signs?|current medications?|allerg(?:y|ies)|medical conditions?)';
  const missing = new RegExp(
    `\\b(?:No ${topic} (?:were|was|are) (?:not )?(?:documented|recorded|entered|obtained|available|provided|collected)|${topic} (?:were|was|are) not (?:documented|recorded|entered|obtained|available|provided|collected))\\.?\\s*`,
    'gi',
  );
  return text
    .replace(missing, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/[ \t]+([.!?])/g, '$1')
    .trim();
}

function stripDisallowedActions(plan: string, payload: DapPayload): string {
  let out = plan;
  if (!payload.patient_handout_provided) {
    out = out.replace(/[^.]*patient education[^.]*\.?/gi, '');
    out = out.replace(/[^.]*handout provided[^.]*\.?/gi, '');
  }
  if (!payload.referral.action_completed) {
    out = out.replace(/[^.]*referral was (completed|arranged|made|sent)[^.]*\.?/gi, '');
  }
  if (!payload.pcp_communication.completed) {
    out = out.replace(/[^.]*primary care (provider|physician) was (notified|faxed|informed)[^.]*\.?/gi, '');
  }
  if (!payload.counselling_confirmed) {
    out = out.replace(/[^.]*counselling was (provided|completed)[^.]*\.?/gi, '');
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function looksLikeInventedSigLine(
  line: string,
  treatments: DapSelectedTreatment[],
): boolean {
  const t = line.trim();
  if (/^\*\*[^*]{2,80}\*\*:/.test(t)) return true;
  if (TRADEMARK.test(t) || GENERICS.test(t) || /\bas directed\b/i.test(t)) return true;
  if (/\[exact confirmed patient_directions\]/i.test(t)) return true;
  if (/\bpatient_directions\b/i.test(t) && /[\[{]/.test(t)) return true;
  if (/^(treatment:\s*)?(take|apply|use)\b/i.test(t)) return true;
  const lower = t.toLowerCase();
  for (const tr of treatments) {
    const name = tr.display_name.toLowerCase();
    if (!name || !lower.includes(name)) continue;
    if (tr.patient_directions && t.includes(tr.patient_directions)) return false;
    // Drop LLM placeholder / reconstructed SIG lines that restate the drug name.
    if (/^[A-Za-z0-9][^:]{0,60}:\s*/.test(t)) return true;
    if (/\d/.test(t) && t.length < 180) return true;
  }
  return false;
}

/**
 * Concise documentation-ready counselling narrative when the LLM Plan is empty.
 * Prefer summaries over dumping handout bullets.
 */
export function renderDapCounsellingNarrative(payload: DapPayload): string {
  if (!payload.counselling_confirmed) return '';
  const c = payload.confirmed_counselling;
  if (!c) return '';

  const parts: string[] = [];
  const hasMed = (c.medication_use?.length ?? 0) > 0;
  const hasExpect =
    (c.expected_response?.length ?? 0) > 0 ||
    (c.treatment_expectations?.length ?? 0) > 0;
  const hasSelf = (c.self_care?.length ?? 0) > 0;
  if (hasMed || hasExpect || hasSelf) {
    const bits: string[] = [];
    if (hasMed) bits.push('Medication use');
    if (hasExpect) bits.push('expected response');
    if (hasSelf) bits.push('supportive self-care and infection-control measures');
    if (bits.length === 1) {
      parts.push(`${bits[0]} ${bits[0] === 'Medication use' ? 'was' : 'were'} reviewed.`);
    } else if (bits.length === 2) {
      parts.push(`${bits[0]} and ${bits[1]} were reviewed.`);
    } else {
      parts.push(
        `${bits.slice(0, -1).join(', ')}, and ${bits[bits.length - 1]} were reviewed.`,
      );
    }
  }

  const safety = (c.safety_net ?? []).filter(Boolean);
  if (safety.length) {
    parts.push(
      'Safety-net advice was provided regarding when to seek further care if symptoms worsen, spread, or do not improve as expected.',
    );
  }

  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

export function repairDapNoteFields(
  fields: Record<string, string>,
  payload: DapPayload,
): { fields: Record<string, string>; validation: DapValidationResult } {
  const next: Record<string, string> = {
    documentTitle: DAP_NOTE_TITLE,
    data: ensureDapOpeningConsent(
      stripGenericSafetySentences(
        stripOverallRedFlagClaim(
          stripMissingEntryPadding(scrubTechnicalIdsFromProse(fields.data ?? '')),
          payload.red_flags.no_red_flags_requiring_referral_confirmed === true,
        ),
      ),
    ),
    assessment: ensureSafetySummariesInAssessment(
      stripGenericSafetySentences(
        stripOverallRedFlagClaim(
          stripMissingEntryPadding(scrubTechnicalIdsFromProse(fields.assessment ?? '')),
          payload.red_flags.no_red_flags_requiring_referral_confirmed === true,
        ),
      ),
      payload.patient_specific_safety ?? [],
    ),
    plan: scrubTechnicalIdsFromProse(fields.plan ?? ''),
  };

  const treatmentBlock = renderDapPlanTreatments(payload.selected_treatments);
  let planBody = stripCounsellingLeakageFromPlan(stripDisallowedActions(next.plan, payload));
  if (treatmentBlock) {
    const leftover = planBody
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && !looksLikeInventedSigLine(line, payload.selected_treatments))
      .join('\n\n');
    planBody = [treatmentBlock, leftover].filter(Boolean).join('\n\n');
  }

  // If AI omitted Plan narrative, inject concise counselling summary before follow-up.
  const narrativeWithoutTreatments = treatmentBlock
    ? planBody
        .slice(treatmentBlock.length)
        .replace(/^\s+/, '')
        .trim()
    : planBody.trim();
  if (!narrativeWithoutTreatments) {
    const counsellingNarrative = renderDapCounsellingNarrative(payload);
    if (counsellingNarrative) {
      planBody = [planBody, counsellingNarrative].filter(Boolean).join('\n\n');
    }
  }

  next.plan = ensureFollowUpInPlan(planBody, renderDapFollowUpPlan(payload.follow_up_plan));

  const validation = validateDapNote(next, payload);
  return { fields: next, validation };
}

/** Group selected treatments that share a canonical treatment or ingredient id. */
export function findDuplicateCanonicalTreatments(
  treatments: DapSelectedTreatment[],
): DapSelectedTreatment[][] {
  const byCanonicalId = new Map<string, DapSelectedTreatment[]>();

  for (const treatment of treatments) {
    const key =
      treatment.treatment_id?.trim() ||
      treatment.ingredient_id?.trim() ||
      '';
    if (!key) continue;

    const group = byCanonicalId.get(key) ?? [];
    group.push(treatment);
    byCanonicalId.set(key, group);
  }

  return [...byCanonicalId.values()].filter((group) => group.length > 1);
}

export function buildDapTreatmentsFromPlan(treatmentPlan: unknown): DapSelectedTreatment[] {
  return getConfirmedTreatmentRows(treatmentPlan)
    .map((row) => toDapSelectedTreatment(row))
    .filter((t): t is DapSelectedTreatment => Boolean(t));
}

export function confirmedCounsellingFromNotes(notes: unknown): DapPayload['confirmed_counselling'] {
  if (!isCounsellingConfirmed(notes)) return undefined;
  const expected_response = unique(extractCounsellingSectionPoints(notes, 'EXPECTED_RESPONSE'), 2);
  const safety_net = unique(extractCounsellingSectionPoints(notes, 'SAFETY_NET'), 3);
  const follow_up_raw = unique(extractCounsellingSectionPoints(notes, 'FOLLOW_UP'), 3);
  const safety_net_from_follow_up = follow_up_raw.filter((p) =>
    /worsen|urgent|emergency|immediately|seek (?:care|assessment)|contact the pharmacist if/i.test(
      p,
    ),
  );
  return {
    medication_use: unique(extractCounsellingSectionPoints(notes, 'MEDICATION_USE'), 3),
    expected_response,
    self_care: unique(extractCounsellingSectionPoints(notes, 'SELF_CARE'), 3),
    follow_up: [],
    treatment_expectations: expected_response,
    common_side_effects: unique(
      extractCounsellingSectionPoints(notes, 'COMMON_SIDE_EFFECTS'),
      2,
    ),
    routine_follow_up: [],
    safety_net: unique([...safety_net, ...safety_net_from_follow_up], 3),
  };
}

/** Compact payload sent to the documentation model. Matches the DAP prompt contracts. */
export function toLlmDapPayload(payload: DapPayload): Record<string, unknown> {
  const counselling = payload.confirmed_counselling;
  return stripInternalDapFields({
    consent_obtained: payload.consent_obtained === true ? true : undefined,
    PATIENT_CONTEXT: payload.patient_context,
    PRESENTING_CONCERN: payload.presenting_concern
      ? { display_text: payload.presenting_concern }
      : undefined,
    OBJECTIVE_DATA: payload.objective_data.length ? payload.objective_data : undefined,
    CLINICAL_FINDINGS: payload.clinical_findings,
    ASSESSMENT: {
      display_name: payload.assessment.condition,
      eligible_for_pharmacist_management:
        payload.assessment.eligible_for_pharmacist_management,
      diagnostic_certainty: payload.assessment.diagnostic_certainty,
    },
    ELIGIBILITY: {
      eligible_for_pharmacist_management:
        payload.assessment.eligible_for_pharmacist_management,
    },
    DIFFERENTIAL_REVIEW: payload.meaningful_differentials,
    RED_FLAGS: payload.red_flags,
    PATIENT_SPECIFIC_SAFETY: payload.patient_specific_safety,
    SELECTED_TREATMENTS: payload.selected_treatments.map((t) => ({
      display_name: t.display_name,
      patient_directions: t.patient_directions,
      pharmacist_confirmed: true,
    })),
    CONFIRMED_COUNSELLING: counselling
      ? {
          MEDICATION_USE: counselling.medication_use,
          TREATMENT_EXPECTATIONS:
            counselling.treatment_expectations ?? counselling.expected_response,
          COMMON_SIDE_EFFECTS: counselling.common_side_effects ?? [],
          SELF_CARE: counselling.self_care,
          SAFETY_NET: counselling.safety_net ?? [],
          DAP_COUNSELLING_SUMMARY: (() => {
            const summary = renderDapCounsellingNarrative(payload);
            return summary ? [summary] : [];
          })(),
        }
      : undefined,
    FOLLOW_UP_PLAN: payload.follow_up_plan ?? undefined,
    REFERRAL: payload.referral,
    PCP_COMMUNICATION: payload.pcp_communication,
    patient_handout_provided: payload.patient_handout_provided,
    treatment_rationale: payload.treatment_rationale,
  });
}
