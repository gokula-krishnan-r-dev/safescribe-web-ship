/**
 * Counselling AI card payload + post-LLM validation.
 * Spec: SafeScribe_Counselling_AI_Cards_Backend_Cursor_Instructions
 *
 * The four card keys are fixed UI. Clinical facts come from confirmed treatments
 * and approved counselling — never from unconstrained model knowledge.
 */

import {
  isGuidanceOutputSection,
  isUsablePatientGuidanceText,
  type GuidanceOutputSection,
} from './patient-guidance';

export const COUNSELLING_CARD_KEYS = [
  'MEDICATION_USE',
  'EXPECTED_RESPONSE',
  'SELF_CARE',
  'FOLLOW_UP',
] as const;

export type CounsellingCardKey = (typeof COUNSELLING_CARD_KEYS)[number];

/** One line per selected medicine on card 1 — not a 3-bullet AI budget. */
export const MAX_HOW_TO_USE_TREATMENTS = 16;

export const MAX_COUNSELLING_CARD_BULLETS: Record<CounsellingCardKey, number> = {
  /** Confirmed prescription lines — one per selected treatment; screen UI shows the first 3. */
  MEDICATION_USE: MAX_HOW_TO_USE_TREATMENTS,
  EXPECTED_RESPONSE: 3,
  SELF_CARE: 3,
  FOLLOW_UP: 3,
};

/** UI-only empty-card copy. Never persist, send to the model, or print on DAP/handout. */
export const COUNSELLING_UI_PLACEHOLDER =
  'Add a short patient-facing point for this section if needed.';

export const COUNSELLING_EMPTY_REASON: Record<CounsellingCardKey, string> = {
  MEDICATION_USE:
    'No selected treatment directions are available for this visit yet.',
  EXPECTED_RESPONSE:
    'No Patient Guidance is available for this section on the selected pathway.',
  SELF_CARE:
    'No Patient Guidance is available for this section on the selected pathway.',
  FOLLOW_UP:
    'No Patient Guidance is available for this section on the selected pathway.',
};

const ADAPT_EMPTY_REASON_PATTERNS = [
  'no additional treatment-expectation guidance was generated.',
  'no additional self-care guidance was generated.',
  'no additional follow-up guidance was generated.',
  'no confirmed adapted prescription directions are available yet.',
  'unable to generate counselling guidance. retry or add guidance manually.',
];

export function isCounsellingUiPlaceholder(text: string | null | undefined): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t) return true;
  if (t === COUNSELLING_UI_PLACEHOLDER.toLowerCase()) return true;
  if (/^no additional self-care measures/.test(t)) return true;
  for (const reason of Object.values(COUNSELLING_EMPTY_REASON)) {
    if (t === reason.toLowerCase()) return true;
  }
  for (const reason of ADAPT_EMPTY_REASON_PATTERNS) {
    if (t === reason) return true;
  }
  return false;
}

export type ApprovedCounsellingCategory =
  | 'medication_use'
  | 'expected_response'
  | 'self_care'
  | 'follow_up'
  | 'safety_net'
  | 'precaution';

export interface PatientContextPayload {
  confirmed_assessment: string;
  age_years: number | null;
  relevant_allergies: string[];
  relevant_conditions: string[];
  relevant_medications: string[];
  relevant_labs: string[];
  confirmed_red_flags: string[];
  confirmed_follow_up: string[];
}

export interface SelectedTreatmentPayload {
  treatment_id: string;
  display_name: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: string;
  directions?: string;
  patient_directions?: string;
}

export interface ApprovedCounsellingPayload {
  medication_use: string[];
  expected_response: string[];
  self_care: string[];
  follow_up: string[];
  safety_net: string[];
}

export interface CounsellingLlmPayload {
  patient_context: PatientContextPayload;
  selected_treatments: SelectedTreatmentPayload[];
  approved_counselling: ApprovedCounsellingPayload;
}

export interface CounsellingSectionJson {
  section_key: CounsellingCardKey;
  bullets: string[];
}

export function emptyApprovedCounselling(): ApprovedCounsellingPayload {
  return {
    medication_use: [],
    expected_response: [],
    self_care: [],
    follow_up: [],
    safety_net: [],
  };
}

export function emptyPatientContext(): PatientContextPayload {
  return {
    confirmed_assessment: '',
    age_years: null,
    relevant_allergies: [],
    relevant_conditions: [],
    relevant_medications: [],
    relevant_labs: [],
    confirmed_red_flags: [],
    confirmed_follow_up: [],
  };
}

function uniqueTrimmed(values: Array<string | null | undefined>, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const text = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function foldText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Admin/handout-process notes are not patient-facing counselling. */
function isNonPatientCounsellingMeta(text: string): boolean {
  const t = text.toLowerCase();
  if (/^(provide|give|offer|print|include|attach)\b.{0,60}(handout|leaflet|brochure|sheet|pamphlet)/.test(t)) {
    return true;
  }
  if (/\b(handout|leaflet|brochure) (available|attached|provided)\b/.test(t)) return true;
  return false;
}

function looksLikeSafetyNet(text: string): boolean {
  const t = text.toLowerCase();
  return /seek (urgent |emergency |immediate )?(care|help|assessment)|go to (the )?(er|ed|hospital|emergency)|call 911|red.?flag|toward the eye|near the eye|spreading (rash|lesion)|difficulty breathing|chest pain/.test(
    t,
  );
}

function looksLikeExpectedResponse(text: string): boolean {
  const t = text.toLowerCase();
  if (/do not stop|complete the (full )?course|finish (all|the) (tablets|course)/.test(t)) {
    return false;
  }
  if (/\bif\b.{0,48}(not improv|do not improve|worsen|getting worse)/.test(t)) {
    return false;
  }
  return (
    /(symptoms?|pain|itch|lesion|sore|swelling|condition|episode).{0,48}(improv|settle|resolv|ease|clear|heal|subside)/.test(t) ||
    /(should|usually|typically|expect(ed)? to).{0,36}(improv|feel better|heal|resolv|clear|settle)/.test(t) ||
    /(typical|usual|expected).{0,24}(course|response|recovery|healing)/.test(t) ||
    /(improv|feel better|heal|resolv).{0,24}(within|in \d+|over the|in a few)/.test(t)
  );
}

function looksLikeFollowUp(text: string): boolean {
  const t = text.toLowerCase();
  if (looksLikeSafetyNet(t)) return false;
  return /return|follow.?up|reassess|if (symptoms? )?(worsen|not improv|do not improve)|see (your )?(doctor|physician|pharmacist|prescriber)|come back/.test(
    t,
  );
}

function looksLikeSelfCare(text: string): boolean {
  const t = text.toLowerCase();
  if (looksLikeExpectedResponse(t) || looksLikeFollowUp(t) || looksLikeSafetyNet(t)) {
    return false;
  }
  return /avoid|wash|rest|drink|fluid|hydrat|ice|heat|salt water|humidifier|hygiene|do not (kiss|share|touch|pick)|non.?drug|lifestyle|keep the area|clean and dry|cool compress|saline/.test(
    t,
  );
}

function looksLikeMedicationUse(text: string): boolean {
  const t = text.toLowerCase();
  return /take|give|apply|swallow|with food|by mouth|dose|tablet|capsule|cream|ointment|complete the (full )?course|as directed/.test(
    t,
  );
}

function looksLikeMildExpectedEffect(text: string): boolean {
  const t = text.toLowerCase();
  if (looksLikeExpectedResponse(t)) return false;
  if (/take with|with food|before (meals|bed)|apply a/.test(t)) return false;
  return /may occur|common(ly)? (side effect|cause)|you may (feel|notice|have)|mild (nausea|headache|upset|dizz)|side effects?/.test(
    t,
  );
}

function looksLikePatientFacingAdvice(text: string): boolean {
  const t = foldText(text);
  if (t.length < 12) return false;
  if (/\?\s*$/.test(t)) return false;
  if (isNonPatientCounsellingMeta(t)) return false;
  return (
    /^(avoid|keep|wash|rest|drink|use|apply|take|give|seek|return|do not|don't|clean|ice|heat|complete)/i.test(
      t,
    ) || /\b(should|may|if symptoms|until|while|usually|typically)\b/i.test(t)
  );
}

/**
 * Map pathway/treatment category labels onto counselling buckets.
 * Pathway authoring uses "Medication counselling", "Non-drug advice", etc. —
 * there is no dedicated expected-response category, so text classification
 * must still run after this.
 */
export function mapApprovedCounsellingCategory(
  raw: string | null | undefined,
): ApprovedCounsellingCategory | null {
  const c = (raw ?? '').toLowerCase().trim();
  if (!c) return null;
  if (/handout/.test(c)) return null;
  if (/precaution|caution|warning label/.test(c)) return 'precaution';
  if (/when to seek|urgent care|safety.?net/.test(c)) return 'safety_net';
  if (/expect|what to expect|prognosis|typical (course|response)|outcome/.test(c)) {
    return 'expected_response';
  }
  if (
    /self.?care|home care|lifestyle|non.?drug|non.?pharmac|supportive|prevention|hygiene|diet|exercise/.test(
      c,
    )
  ) {
    return 'self_care';
  }
  if (/follow|return|monitor|reassess|referral/.test(c)) return 'follow_up';
  if (
    /medication|dose|administration|how to use|directions|adherence|technique|side effect/.test(c)
  ) {
    return 'medication_use';
  }
  if (/safety.?net|urgent|emergency|red.?flag|seek (care|help)/.test(c)) {
    return 'safety_net';
  }
  return null;
}

/**
 * Classify one approved point using text first (strong clinical signals),
 * then the authoring category. Never invent content — only route existing text.
 */
export function classifyApprovedCounsellingPoint(
  category: string | null | undefined,
  text: string | null | undefined,
): ApprovedCounsellingCategory | null {
  const t = foldText(text ?? '');
  if (!t || isCounsellingUiPlaceholder(t) || isNonPatientCounsellingMeta(t)) {
    return null;
  }
  if (looksLikeSafetyNet(t)) return 'safety_net';
  if (looksLikeExpectedResponse(t)) return 'expected_response';
  if (looksLikeFollowUp(t)) return 'follow_up';
  if (looksLikeSelfCare(t)) return 'self_care';
  if (looksLikeMildExpectedEffect(t)) return 'expected_response';

  const fromCat = mapApprovedCounsellingCategory(category);
  if (fromCat) return fromCat;
  if (looksLikeMedicationUse(t)) return 'medication_use';
  if (looksLikePatientFacingAdvice(t)) return 'self_care';
  return null;
}

function moveMatching(
  from: string[],
  pred: (text: string) => boolean,
  limit: number,
): { kept: string[]; moved: string[] } {
  const moved: string[] = [];
  const kept: string[] = [];
  for (const text of from) {
    if (moved.length < limit && pred(text)) moved.push(text);
    else kept.push(text);
  }
  return { kept, moved };
}

/**
 * If a card bucket is still empty, reuse related approved points that were
 * filed under another category. Does not invent new clinical advice.
 */
export function fillRelatedCounsellingGaps(
  input: ApprovedCounsellingPayload,
): ApprovedCounsellingPayload {
  const out: ApprovedCounsellingPayload = {
    medication_use: [...input.medication_use],
    expected_response: [...input.expected_response],
    self_care: [...input.self_care],
    follow_up: [...input.follow_up],
    safety_net: [...input.safety_net],
  };

  if (!out.expected_response.length) {
    const fromMed = moveMatching(out.medication_use, looksLikeMildExpectedEffect, 2);
    out.medication_use = fromMed.kept;
    out.expected_response = uniqueTrimmed(fromMed.moved, 2);
  }

  if (!out.self_care.length) {
    const fromMed = moveMatching(out.medication_use, looksLikeSelfCare, 3);
    out.medication_use = fromMed.kept;
    if (!fromMed.moved.length) {
      const fromFu = moveMatching(out.follow_up, looksLikeSelfCare, 3);
      out.follow_up = fromFu.kept;
      out.self_care = uniqueTrimmed(fromFu.moved, 3);
    } else {
      out.self_care = uniqueTrimmed(fromMed.moved, 3);
    }
  }

  if (!out.follow_up.length && !out.safety_net.length) {
    const fromMed = moveMatching(out.medication_use, looksLikeFollowUp, 2);
    out.medication_use = fromMed.kept;
    out.follow_up = uniqueTrimmed(fromMed.moved, 3);
  }

  return out;
}

function bucketFromGuidanceSection(
  section: GuidanceOutputSection,
  text: string,
): ApprovedCounsellingCategory {
  if (section === 'self_care') return 'self_care';
  if (section === 'follow_up') {
    return looksLikeSafetyNet(text) ? 'safety_net' : 'follow_up';
  }
  return 'expected_response';
}

export function mergeApprovedCounselling(input: {
  conditionRows?: Array<{
    category?: string | null;
    point?: string | null;
    detail?: string | null;
    outputSection?: string | null;
  }>;
  treatmentRows?: Array<{ category?: string | null; text?: string | null }>;
  followups?: Array<{
    timeframe?: string | null;
    condition?: string | null;
    action?: string | null;
    urgency?: string | null;
  }>;
}): ApprovedCounsellingPayload {
  const out = emptyApprovedCounselling();
  const push = (cat: ApprovedCounsellingCategory | null, text: string) => {
    const t = foldText(text);
    if (!t || !cat || !isUsablePatientGuidanceText(t)) return;
    const bucket = cat === 'precaution' ? 'medication_use' : cat;
    if (!out[bucket].some((x) => x.toLowerCase() === t.toLowerCase())) {
      out[bucket].push(t);
    }
  };

  for (const row of input.conditionRows ?? []) {
    const text = foldText(row.detail?.trim() || row.point?.trim() || '');
    if (isGuidanceOutputSection(row.outputSection)) {
      push(bucketFromGuidanceSection(row.outputSection, text), text);
      continue;
    }
    push(classifyApprovedCounsellingPoint(row.category, text), text);
  }
  for (const row of input.treatmentRows ?? []) {
    const text = foldText(row.text ?? '');
    const cat =
      classifyApprovedCounsellingPoint(row.category, text) ??
      (text ? 'medication_use' : null);
    push(cat, text);
  }
  for (const row of input.followups ?? []) {
    const parts = [row.action, row.condition, row.timeframe]
      .map((p) => (p ?? '').trim())
      .filter(Boolean);
    if (!parts.length) continue;
    const text = parts.join(' — ');
    const urgent = /urgent|emergency|immediate|stat/i.test(row.urgency ?? '');
    if (urgent) {
      push('safety_net', text);
      continue;
    }
    const cat =
      classifyApprovedCounsellingPoint('follow_up', text) ?? 'follow_up';
    push(cat, text);
  }

  const filled = fillRelatedCounsellingGaps(out);
  return {
    medication_use: filled.medication_use.slice(0, 8),
    expected_response: filled.expected_response.slice(0, 6),
    self_care: filled.self_care.slice(0, 8),
    follow_up: filled.follow_up.slice(0, 8),
    safety_net: filled.safety_net.slice(0, 6),
  };
}

function cleanRegimenToken(value?: string | null): string | undefined {
  const t = (value ?? '').trim();
  if (!t) return undefined;
  if (/^(as\s+directed|as\s+needed|n\/?a|tbd|none|null|undefined|-|—)$/i.test(t)) {
    return undefined;
  }
  return t;
}

const RAW_SIG_MARKERS =
  /tablet\(s\)|capsule\(s\)|application\(s\)|\bby oral route\b|\{\s*(bid|tid|qid|qd|prn)\s*\}|^directions:\s*/i;

export function isRawStructuredSig(text: string): boolean {
  return RAW_SIG_MARKERS.test(String(text ?? ''));
}

function looksLikeDoseFirstFragment(text: string): boolean {
  return (
    /^\d+(\.\d+)?(\s|$)/.test(text) ||
    /^(tablet|tablets|capsule|capsules|application|puff|drop|drops|ml|mg|mcg)\b/i.test(
      text,
    )
  );
}

/** Turn inventory SIG fragments into a sentence a pharmacist can say to the patient. */
export function humanizeMedicationDirections(text: string): string {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const strippedDirectionsPrefix = /^directions:\s*/i.test(t);
  t = t.replace(/^directions:\s*/i, '');
  t = t.replace(/^take\s+([^:]{1,48}):\s+/i, 'Take $1 ');
  t = t.replace(/\s*\{\s*(bid|tid|qid|qd|prn)\s*\}/gi, '');
  t = t.replace(/\bBID\b/g, 'twice daily');
  t = t.replace(/\bTID\b/g, 'three times daily');
  t = t.replace(/\bQID\b/g, 'four times daily');
  t = t.replace(/\bQD\b/g, 'once daily');
  t = t.replace(/\bPRN\b/g, 'as needed');
  t = t.replace(/\bby Oral route\b/gi, 'by mouth');
  t = t.replace(/\bOral route\b/gi, 'by mouth');
  t = t.replace(/\b(\d+)\s+tablet\(s\)/gi, (_, n) =>
    Number(n) === 1 ? '1 tablet' : `${n} tablets`,
  );
  t = t.replace(/tablet\(s\)/gi, 'tablet');
  t = t.replace(/capsule\(s\)/gi, 'capsule');
  t = t.replace(/application\(s\)/gi, 'application');
  t = t.replace(/\b1 tablets\b/gi, '1 tablet');
  t = t.replace(/\bOnce daily for 1 days\b/gi, 'once daily for 1 day');
  t = t.replace(/\bfor 1 days\b/gi, 'for 1 day');
  t = t.replace(/\btablet oral\b/gi, 'tablet by mouth');
  t = t.replace(/\bcapsule oral\b/gi, 'capsule by mouth');
  t = t.replace(/\bTwice daily\b/g, 'twice daily');
  t = t.replace(/\bOnce daily\b/g, 'once daily');
  t = t.replace(/\bThree times daily\b/g, 'three times daily');
  t = t.replace(/\bFour times daily\b/g, 'four times daily');
  t = t.replace(/\s{2,}/g, ' ').trim();
  const shouldPrefixTake =
    strippedDirectionsPrefix || looksLikeDoseFirstFragment(t);
  if (
    shouldPrefixTake &&
    t &&
    !/^(take|give|apply|use|inhale|instill|insert|swallow|dissolve)\b/i.test(t)
  ) {
    t = `Take ${t}`;
  }
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Humanize inventory SIGs; leave technique / precaution wording as counselling prose. */
export function asMedicationUseBullet(text: string): string {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (
    isRawStructuredSig(raw) ||
    /^directions:\s*/i.test(raw) ||
    /^take\s+[^:]{1,48}:\s+/i.test(raw)
  ) {
    return humanizeMedicationDirections(raw);
  }
  let t = raw;
  if (!/[.!?]$/.test(t)) t += '.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isNamelessRegimenDump(
  text: string,
  treatments: SelectedTreatmentPayload[],
): boolean {
  const folded = foldText(text).toLowerCase();
  const names = treatments
    .map((row) => foldText(row.display_name).toLowerCase())
    .filter(Boolean);
  if (names.some((name) => name && folded.includes(name))) return false;
  return (
    /\d/.test(text) &&
    /\b(tablet|capsule|by mouth|once daily|twice daily|oral)\b/i.test(text)
  );
}

function formatRouteForPatient(route: string): string {
  const r = route.trim().toLowerCase();
  if (r === 'oral' || r === 'po' || r === 'by mouth' || r === 'oral route') return 'by mouth';
  if (r.startsWith('by ')) return r;
  return `by ${r}`;
}

function formatDoseForPatient(dose: string): string {
  return dose
    .replace(/\b1\s+tablet\(s\)/gi, '1 tablet')
    .replace(/\b(\d+)\s+tablet\(s\)/gi, (_, n) =>
      Number(n) === 1 ? '1 tablet' : `${n} tablets`,
    )
    .replace(/tablet\(s\)/gi, 'tablet');
}

export function patientFacingMedicationUseLine(
  treatment: SelectedTreatmentPayload,
  opts?: { pediatric?: boolean },
): string {
  const verb = opts?.pediatric ? 'Give' : 'Take';
  const preferred = [
    treatment.patient_directions,
    treatment.directions,
  ]
    .map((v) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim())
    .find((v) => v && !/manufacturer\s*:/i.test(v) && !/\bDIN\b|\bNPN\b/i.test(v));

  if (preferred) {
    const human = humanizeMedicationDirections(preferred);
    if (human && !isRawStructuredSig(human)) return human;
  }

  const bits: string[] = [treatment.display_name];
  if (treatment.dose) bits.push(formatDoseForPatient(treatment.dose));
  if (treatment.route) bits.push(formatRouteForPatient(treatment.route));
  if (treatment.frequency) {
    bits.push(
      humanizeMedicationDirections(treatment.frequency)
        .replace(/\.$/, '')
        .replace(/^Take\s+/i, '')
        .toLowerCase(),
    );
  }
  if (treatment.duration) {
    const dur = /^\d+(\.\d+)?$/.test(treatment.duration)
      ? Number(treatment.duration) === 1
        ? '1 day'
        : `${treatment.duration} days`
      : treatment.duration;
    bits.push(`for ${dur}`);
  }
  const line = `${verb} ${bits.join(' ')}.`.replace(/\s+/g, ' ');
  return humanizeMedicationDirections(line);
}

export function sanitizeMedicationUseBullets(
  bullets: string[],
  treatments: SelectedTreatmentPayload[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of bullets) {
    const human = asMedicationUseBullet(raw);
    if (!human || isRawStructuredSig(human)) continue;
    if (isNamelessRegimenDump(human, treatments)) continue;
    const key = fold(human);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(human);
  }
  if (out.length) return out.slice(0, MAX_HOW_TO_USE_TREATMENTS);
  return fallbackMedicationUse(treatments);
}

export function toSelectedTreatmentPayload(
  row: Record<string, unknown>,
  index: number,
): SelectedTreatmentPayload | null {
  const display =
    String(row.genericName || row.medicationName || row.display_name || '').trim();
  if (!display) return null;
  const dose = cleanRegimenToken(
    row.dose != null ? String(row.dose) : row.strength != null ? String(row.strength) : null,
  );
  const route = cleanRegimenToken(row.route != null ? String(row.route) : null);
  const frequency = cleanRegimenToken(
    row.frequency != null ? String(row.frequency) : null,
  );
  const duration = cleanRegimenToken(
    row.duration != null ? String(row.duration) : null,
  );
  const quantity = cleanRegimenToken(
    row.quantity != null ? String(row.quantity) : null,
  );
  const rawDirections = String(
    row.patientDirections ??
      row.patient_directions ??
      row.directions ??
      row.instructions ??
      '',
  )
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const directions =
    rawDirections &&
    !/manufacturer\s*:/i.test(rawDirections) &&
    !/\bDIN\b|\bNPN\b/i.test(rawDirections)
      ? asMedicationUseBullet(rawDirections) || undefined
      : undefined;

  return {
    treatment_id: String(
      row.pathwayTreatmentId || row.treatment_id || row.id || display || `t-${index}`,
    ),
    display_name: display,
    ...(dose ? { dose } : {}),
    ...(route ? { route } : {}),
    ...(frequency ? { frequency } : {}),
    ...(quantity ? { quantity } : {}),
    ...(duration ? { duration } : {}),
    ...(directions ? { directions, patient_directions: directions } : {}),
  };
}

export function fallbackMedicationUse(
  treatments: SelectedTreatmentPayload[],
): string[] {
  return treatments
    .slice(0, MAX_HOW_TO_USE_TREATMENTS)
    .map((t) => patientFacingMedicationUseLine(t))
    .filter(Boolean);
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function significantTokens(text: string): string[] {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'at', 'by',
    'your', 'you', 'if', 'is', 'are', 'as', 'with', 'from', 'this', 'that',
    'should', 'may', 'can', 'be', 'it',
  ]);
  return fold(text)
    .split(' ')
    .filter((w) => w.length > 2 && !stop.has(w));
}

export function medicationUseRepresentsTreatments(
  bullets: string[],
  treatments: SelectedTreatmentPayload[],
): { ok: boolean; reason?: string } {
  if (!treatments.length) return { ok: true };
  const joined = fold(bullets.join(' '));
  for (const t of treatments) {
    const name = fold(t.display_name);
    if (!name) continue;
    if (!joined.includes(name)) {
      return { ok: false, reason: `MEDICATION_USE missing ${t.display_name}` };
    }
    if (t.dose) {
      const dose = fold(t.dose);
      const mentionsNumeric = bullets.some((b) => /\d/.test(b) && /(mg|g|ml|mcg|unit)/i.test(b));
      if (mentionsNumeric && dose && !joined.includes(dose.replace(/\s/g, ' '))) {
        const doseCompact = dose.replace(/\s/g, '');
        if (!joined.replace(/\s/g, '').includes(doseCompact)) {
          return { ok: false, reason: `dose changed for ${t.display_name}` };
        }
      }
    }
  }
  return { ok: true };
}

export function sourcesForCard(
  key: CounsellingCardKey,
  approved: ApprovedCounsellingPayload,
  patient: PatientContextPayload,
): string[] {
  if (key === 'EXPECTED_RESPONSE') return approved.expected_response;
  if (key === 'SELF_CARE') return approved.self_care;
  if (key === 'FOLLOW_UP') {
    return uniqueTrimmed([
      ...approved.follow_up,
      ...approved.safety_net,
      ...patient.confirmed_follow_up,
      ...patient.confirmed_red_flags,
    ]);
  }
  return uniqueTrimmed([...approved.medication_use]);
}

export function bulletDerivesFromApproved(bullet: string, sources: string[]): boolean {
  if (!sources.length) return false;
  const bTokens = significantTokens(bullet);
  if (!bTokens.length) return false;
  return sources.some((source) => {
    const sTokens = new Set(significantTokens(source));
    if (!sTokens.size) return fold(source) && fold(bullet).includes(fold(source));
    const overlap = bTokens.filter((t) => sTokens.has(t)).length;
    return overlap >= Math.min(3, sTokens.size) || overlap / bTokens.length >= 0.45;
  });
}

export function clampCardBullets(
  key: CounsellingCardKey,
  bullets: Array<string | null | undefined>,
): string[] {
  return uniqueTrimmed(
    bullets.filter((b) => !isCounsellingUiPlaceholder(b)),
    MAX_COUNSELLING_CARD_BULLETS[key],
  );
}

export function emptyCounsellingSections(): CounsellingSectionJson[] {
  return COUNSELLING_CARD_KEYS.map((section_key) => ({
    section_key,
    bullets: [] as string[],
  }));
}

export function normalizeCounsellingSections(raw: unknown): CounsellingSectionJson[] {
  const byKey: Record<CounsellingCardKey, string[]> = {
    MEDICATION_USE: [],
    EXPECTED_RESPONSE: [],
    SELF_CARE: [],
    FOLLOW_UP: [],
  };
  if (raw && typeof raw === 'object') {
    const sections = (raw as { sections?: unknown }).sections;
    if (Array.isArray(sections)) {
      for (const section of sections) {
        if (!section || typeof section !== 'object') continue;
        const row = section as { section_key?: unknown; category?: unknown; bullets?: unknown; points?: unknown; items?: unknown };
        const label = String(row.section_key ?? row.category ?? '')
          .trim()
          .toUpperCase()
          .replace(/[\s-]+/g, '_');
        const key = COUNSELLING_CARD_KEYS.find(
          (k) => k === label || label.includes(k),
        );
        if (!key) continue;
        const list = row.bullets ?? row.points ?? row.items;
        const bullets: string[] = [];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (typeof item === 'string' && item.trim()) bullets.push(item.trim());
            else if (item && typeof item === 'object') {
              const text = String(
                (item as { point?: unknown; text?: unknown }).point ??
                  (item as { text?: unknown }).text ??
                  '',
              ).trim();
              if (text) bullets.push(text);
            }
          }
        }
        byKey[key] = clampCardBullets(key, bullets);
      }
    }
  }
  return COUNSELLING_CARD_KEYS.map((section_key) => ({
    section_key,
    bullets: byKey[section_key],
  }));
}

export interface CounsellingValidationResult {
  sections: CounsellingSectionJson[];
  medicationFallbackUsed: boolean;
  droppedUnapproved: Partial<Record<CounsellingCardKey, number>>;
  ok: boolean;
  reason?: string;
}

/**
 * Deterministic post-LLM checks. Cards 2–4 may only use approved/confirmed
 * sources. Invalid medication counselling is replaced with exact directions.
 */
export function validateCounsellingOutput(
  raw: unknown,
  payload: CounsellingLlmPayload,
): CounsellingValidationResult {
  const sections = normalizeCounsellingSections(raw);
  const droppedUnapproved: Partial<Record<CounsellingCardKey, number>> = {};
  let medicationFallbackUsed = false;

  const med = sections.find((s) => s.section_key === 'MEDICATION_USE')!;
  const sanitized = sanitizeMedicationUseBullets(
    med.bullets,
    payload.selected_treatments,
  );
  const medCheck = medicationUseRepresentsTreatments(
    sanitized,
    payload.selected_treatments,
  );
  if (!medCheck.ok) {
    med.bullets = fallbackMedicationUse(payload.selected_treatments);
    medicationFallbackUsed = true;
  } else {
    med.bullets = clampCardBullets('MEDICATION_USE', sanitized);
  }

  for (const key of ['EXPECTED_RESPONSE', 'SELF_CARE', 'FOLLOW_UP'] as const) {
    const section = sections.find((s) => s.section_key === key)!;
    const sources = sourcesForCard(key, payload.approved_counselling, payload.patient_context);
    if (!sources.length) {
      if (section.bullets.length) droppedUnapproved[key] = section.bullets.length;
      section.bullets = [];
      continue;
    }
    const kept = section.bullets.filter((b) => bulletDerivesFromApproved(b, sources));
    if (kept.length !== section.bullets.length) {
      droppedUnapproved[key] = section.bullets.length - kept.length;
    }
    section.bullets = clampCardBullets(
      key,
      kept.length ? kept : sources,
    );
  }

  return {
    sections,
    medicationFallbackUsed,
    droppedUnapproved,
    ok: !medicationFallbackUsed && Object.keys(droppedUnapproved).length === 0,
    reason: medicationFallbackUsed
      ? 'medication_fallback'
      : Object.keys(droppedUnapproved).length
        ? 'unapproved_content_stripped'
        : undefined,
  };
}

export function counsellingPayloadMeta(payload: CounsellingLlmPayload) {
  return {
    selected_treatments: payload.selected_treatments.length,
    approved_counselling: {
      medication_use: payload.approved_counselling.medication_use.length,
      expected_response: payload.approved_counselling.expected_response.length,
      self_care: payload.approved_counselling.self_care.length,
      follow_up: payload.approved_counselling.follow_up.length,
      safety_net: payload.approved_counselling.safety_net.length,
    },
    patient_context: {
      has_assessment: Boolean(payload.patient_context.confirmed_assessment),
      allergies: payload.patient_context.relevant_allergies.length,
      conditions: payload.patient_context.relevant_conditions.length,
      follow_up: payload.patient_context.confirmed_follow_up.length,
    },
  };
}
