/**
 * SafeScribe Adapt — AI counselling for Cards 2–4.
 *
 * Card 1 is always deterministic from confirmed patient_directions (SIG).
 * Cards 2–4 are AI drafts (with deterministic fallback when AI is unavailable).
 */

import type {
  AdaptPayload,
  AdaptStepOne,
  AdaptStepThreeOptionA,
  AdaptStepThreeOptionB,
  AdaptStepTwoOptionA,
  AdaptStepTwoOptionB,
  ProposedPrescription,
} from './adapt';
import {
  ADAPT_COUNSELLING_PROMPT,
  ADAPT_COUNSELLING_PROMPT_VERSION,
} from './adapt-counselling-prompt';
import type { CounsellingCardKey } from './counselling-payload';

export {
  ADAPT_COUNSELLING_PROMPT,
  ADAPT_COUNSELLING_PROMPT_VERSION,
} from './adapt-counselling-prompt';

export const ADAPT_COUNSELLING_SCHEMA_VERSION = '1';

/** Adapt-specific empty-card copy — never imply a pathway repository is missing. */
export const ADAPT_COUNSELLING_EMPTY_REASON: Record<CounsellingCardKey, string> = {
  MEDICATION_USE:
    'No confirmed adapted prescription directions are available yet.',
  EXPECTED_RESPONSE:
    'No additional treatment-expectation guidance was generated.',
  SELF_CARE: 'No additional self-care guidance was generated.',
  FOLLOW_UP: 'No additional follow-up guidance was generated.',
};

export const ADAPT_COUNSELLING_BULLET_LIMITS = {
  what_to_expect: 4,
  self_care: 4,
  routine_follow_up: 2,
  seek_care: 3,
} as const;

export interface AdaptCounsellingFollowUpPlan {
  responsible_party: string;
  timeframe: string;
  monitoring_targets: string[];
  action_if_not_met: string;
  pharmacist_confirmed: boolean;
}

export interface AdaptCounsellingPayload {
  module: 'adapt';
  medication: {
    display_name: string;
    ingredient: string;
    dosage_form: string;
    route: string;
  };
  adapted_prescription: {
    patient_directions: string;
  };
  indication: {
    display_name: string;
    pharmacist_confirmed: boolean;
  };
  adaptation: {
    type: string;
    reason: string;
  };
  patient_context: {
    age: number | null;
    sex: string;
    pregnancy: string | null;
    breastfeeding: string | null;
    relevant_conditions: string[];
    relevant_allergies: string[];
    relevant_medications: string[];
    relevant_labs: string[];
  };
  follow_up_plan: AdaptCounsellingFollowUpPlan | null;
}

export interface AdaptCounsellingAiOutput {
  what_to_expect: string[];
  self_care: string[];
  routine_follow_up: string[];
  seek_care: string[];
}

function trimStr(value: unknown, max = 240): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function asStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = trimStr(item, 220);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function indicationDisplay(step1?: AdaptStepOne | null): {
  display_name: string;
  pharmacist_confirmed: boolean;
} {
  const sel = step1?.indication;
  const custom = trimStr(sel?.customIndicationText, 120);
  const mapped = trimStr(sel?.indicationDisplay, 120);
  const display_name = mapped || custom || '';
  return {
    display_name,
    pharmacist_confirmed: Boolean(sel?.confirmedByPharmacist && display_name),
  };
}

/**
 * Patient-facing medication casing for counselling Card 1.
 * CCDD / catalogue labels are often ALL CAPS — normalize those only.
 */
export function formatPatientFacingMedicationName(name: string): string {
  const t = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return t;
  const allUpper = letters === letters.toUpperCase();
  const allLower = letters === letters.toLowerCase();
  // Catalogue labels are often ALL CAPS or all-lowercase ingredients.
  if (allUpper || allLower) {
    return t
      .toLowerCase()
      .replace(/(^|[\s\-/([])([a-z])/g, (_m, prefix: string, ch: string) => `${prefix}${ch.toUpperCase()}`);
  }
  return t;
}

function extractStrengthToken(value: string | null | undefined): string {
  const t = trimStr(value, 40);
  if (!t) return '';
  // Prefer explicit strength amounts; ignore count-only doses like "1 tablet".
  const m = t.match(/\b(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|%|iu|units)(?:\s*\/\s*[^\s]+)?)\b/i);
  return m?.[1]?.replace(/\s+/g, ' ').trim() || '';
}

/**
 * Card 1 medication label: "Pravastatin 10 mg" (not ALL CAPS, includes strength).
 */
export function buildAdaptMedicationDisplayName(
  proposed?: ProposedPrescription | null,
): string {
  const raw =
    trimStr(proposed?.genericName, 120) ||
    trimStr(proposed?.drugName, 120) ||
    trimStr(proposed?.brandName, 120) ||
    '';
  if (!raw) return 'Medication';

  let base = formatPatientFacingMedicationName(raw);

  // Pull strength already embedded in the name ("Pravastatin 20 mg tablet").
  const embedded = base.match(
    /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|%|iu|units)(?:\s*\/\s*[^\s]+)?)\b(?:\s+.*)?$/i,
  );
  let namePart = embedded
    ? formatPatientFacingMedicationName(embedded[1]!)
    : base;
  const embeddedStrength = embedded?.[2]?.replace(/\s+/g, ' ').trim() || '';

  // Drop trailing dosage-form noise from the name part.
  namePart = namePart
    .replace(
      /\b(tablets?|capsules?|suspension|solution|cream|gel|ointment|patch|oral)\b/gi,
      '',
    )
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  namePart = formatPatientFacingMedicationName(namePart) || 'Medication';

  const strength =
    extractStrengthToken(proposed?.strength) ||
    extractStrengthToken(proposed?.dose) ||
    embeddedStrength;

  if (strength && !namePart.toLowerCase().includes(strength.toLowerCase())) {
    return `${namePart} ${strength}`;
  }
  return namePart;
}

function proposedDisplay(proposed?: ProposedPrescription | null): {
  display_name: string;
  ingredient: string;
  dosage_form: string;
  route: string;
  patient_directions: string;
} {
  const display_name = buildAdaptMedicationDisplayName(proposed);
  const ingredient =
    formatPatientFacingMedicationName(
      trimStr(proposed?.genericName, 120) ||
        trimStr(proposed?.drugName, 120) ||
        display_name,
    ) || display_name;
  return {
    display_name,
    ingredient,
    dosage_form: trimStr(proposed?.dosageForm, 80),
    route: trimStr(proposed?.route, 80),
    patient_directions: trimStr(proposed?.sig, 400),
  };
}

/**
 * Build structured follow-up from Safety Engine monitoring when it is
 * explicitly follow-up-required (e.g. metformin renal). Otherwise null —
 * AI must not invent scheduled intervals.
 */
export function buildAdaptFollowUpPlan(
  step3B?: AdaptStepThreeOptionB | null,
): AdaptCounsellingFollowUpPlan | null {
  const check = step3B?.checks?.find((c) => c.id === 'monitoring_followup');
  if (!check || !check.applicable) return null;
  if (check.status !== 'follow_up_required') return null;

  const summary = trimStr(check.summary, 280);
  const recommendation = trimStr(check.recommendation, 280);
  const combined = `${summary} ${recommendation}`.toLowerCase();

  let timeframe = '';
  if (/3\s*[-–to]+\s*6\s*months/.test(combined)) {
    timeframe = '3 to 6 months';
  } else if (/4\s*[-–to]+\s*8\s*weeks/.test(combined)) {
    timeframe = '4 to 8 weeks';
  } else if (/(\d+)\s*[-–to]+\s*(\d+)\s*(day|week|month)/i.test(combined)) {
    const m = combined.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(day|week|month)s?/i);
    if (m) timeframe = `${m[1]} to ${m[2]} ${m[3]}s`;
  }

  const targets: string[] = [];
  if (/renal|kidney|egfr|creatinine/i.test(combined)) {
    targets.push('kidney function');
  }
  if (/glycem|glucose|hba1c|blood sugar/i.test(combined)) {
    targets.push('blood sugar control');
  }
  if (/blood pressure|hypertension/i.test(combined)) {
    targets.push('blood pressure');
  }
  targets.push('treatment tolerability');

  if (!timeframe) {
    // Do not invent an interval — leave unconfirmed so AI stays general.
    return null;
  }

  return {
    responsible_party: 'Pharmacist',
    timeframe,
    monitoring_targets: [...new Set(targets)].slice(0, 4),
    action_if_not_met: 'reassess therapy or refer as clinically appropriate',
    pharmacist_confirmed: true,
  };
}

export function buildAdaptCounsellingPayload(
  payload: Pick<AdaptPayload, 'step1' | 'step2A' | 'step2B' | 'step2C' | 'step3A' | 'step3B'>,
  proposedOverride?: ProposedPrescription | null,
): AdaptCounsellingPayload {
  const step1 = payload.step1;
  const step2A = payload.step2A;
  const step2B = payload.step2B;
  const proposed =
    proposedOverride && proposedOverride.drugName?.trim()
      ? proposedOverride
      : payload.step3A?.proposedPrescription;
  const med = proposedDisplay(proposed);
  const indication = indicationDisplay(step1);

  const allergies = (step2A?.background?.allergyEntries ?? [])
    .map((a) => trimStr(a.drug, 80))
    .filter(Boolean)
    .slice(0, 8);
  const conditions = (step2A?.background?.conditions ?? [])
    .map((c) => trimStr(c, 80))
    .filter(Boolean)
    .slice(0, 8);
  const labs = (payload.step2C?.extractedLabValues ?? [])
    .slice(0, 6)
    .map((lab) => {
      const test = trimStr(lab.test, 40);
      const value = trimStr(String(lab.value ?? ''), 40);
      const unit = trimStr(lab.unit, 20);
      if (!test || !value) return '';
      return unit ? `${test} ${value} ${unit}` : `${test} ${value}`;
    })
    .filter(Boolean);

  const originalName =
    trimStr(step1?.originalPrescription?.normalized?.genericName, 80) ||
    trimStr(step1?.originalPrescription?.normalized?.brandName, 80) ||
    trimStr(step1?.originalPrescription?.raw?.medicationText, 80);

  const relevantMeds: string[] = [];
  if (originalName && originalName.toLowerCase() !== med.display_name.toLowerCase()) {
    relevantMeds.push(originalName);
  }
  if (step2B?.isTakingMedication && originalName) {
    // Already on therapy — keep original in context when useful.
    if (!relevantMeds.includes(originalName)) relevantMeds.push(originalName);
  }

  return {
    module: 'adapt',
    medication: {
      display_name: med.display_name,
      ingredient: med.ingredient,
      dosage_form: med.dosage_form,
      route: med.route,
    },
    adapted_prescription: {
      patient_directions: med.patient_directions,
    },
    indication,
    adaptation: {
      type: step1?.adaptationType?.replace(/_/g, ' ') || '',
      reason:
        trimStr(step1?.adaptationReason?.label, 160) ||
        trimStr(step1?.adaptationReason?.code, 80) ||
        '',
    },
    patient_context: {
      age:
        typeof step2A?.demographics?.age === 'number' &&
        Number.isFinite(step2A.demographics.age)
          ? step2A.demographics.age
          : null,
      sex: trimStr(step2A?.demographics?.sex, 40),
      pregnancy: trimStr(step2A?.demographics?.pregnancyStatus, 60) || null,
      breastfeeding: trimStr(step2A?.demographics?.breastfeedingStatus, 60) || null,
      relevant_conditions: conditions,
      relevant_allergies: allergies,
      relevant_medications: relevantMeds.slice(0, 6),
      relevant_labs: labs,
    },
    follow_up_plan: buildAdaptFollowUpPlan(payload.step3B),
  };
}

export function joinNaturalLanguage(parts: string[]): string {
  const clean = parts.map((p) => trimStr(p, 80)).filter(Boolean);
  if (clean.length === 0) return 'how you are doing on treatment';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

export function formatFollowUpTimeframe(timeframe: string): string {
  const t = trimStr(timeframe, 80);
  if (!t) return '';
  if (/^in\s+/i.test(t)) return t;
  if (/^(within|after|every)\s+/i.test(t)) return t;
  return `in ${t}`;
}

export function renderConfirmedFollowUpDeterministically(
  plan: AdaptCounsellingFollowUpPlan | null | undefined,
): string[] {
  if (!plan?.pharmacist_confirmed) return [];
  const timeframe = formatFollowUpTimeframe(plan.timeframe);
  if (!timeframe) return [];
  const who =
    /^pharmacist$/i.test(plan.responsible_party.trim())
      ? 'your pharmacist'
      : plan.responsible_party.trim() || 'your pharmacist';
  const targets = joinNaturalLanguage(plan.monitoring_targets);
  return [
    `Follow up with ${who} ${timeframe} to review ${targets}.`,
  ];
}

function looksLikeSigOrDose(text: string, patientDirections: string): boolean {
  const t = text.toLowerCase();
  const sig = patientDirections.toLowerCase();
  if (sig && (t === sig || t.includes(sig) || sig.includes(t))) return true;
  // Dose/frequency reconstruction patterns
  if (/\btake\s+\d+(\.\d+)?\s*(mg|mcg|g|ml|tablet|capsule|puff)/i.test(text)) {
    return true;
  }
  if (/\b\d+(\.\d+)?\s*mg\b.*\b(once|twice|daily|bid|tid|qid)\b/i.test(text)) {
    return true;
  }
  return false;
}

function containsInventedInterval(
  text: string,
  confirmed: AdaptCounsellingFollowUpPlan | null,
): boolean {
  const planConfirmed = Boolean(confirmed?.pharmacist_confirmed);
  const timeframe = confirmed?.timeframe?.trim() ?? '';

  if (planConfirmed && timeframe) {
    const tf = timeframe.toLowerCase().replace(/\s+/g, ' ');
    if (text.toLowerCase().includes(tf)) return false;
  }

  // Flag scheduled intervals when no confirmed plan
  if (!planConfirmed) {
    return /\b(in|within)\s+\d+(\s*[-–to]+\s*\d+)?\s*(day|week|month|hour)s?\b/i.test(
      text,
    );
  }

  // Confirmed plan present — reject intervals that don't match confirmed timeframe digits
  const digitMatches = timeframe.match(/\d+/g);
  const digits = digitMatches ? [...digitMatches] : [];
  if (!digits.length) return false;
  const m = text.match(/\b(\d+)\s*(?:[-–to]+\s*(\d+)\s*)?(day|week|month)s?\b/i);
  if (!m) return false;
  const mentioned: string[] = [];
  if (m[1]) mentioned.push(m[1]);
  if (m[2]) mentioned.push(m[2]);
  return mentioned.some((d) => digits.indexOf(d) === -1);
}

/**
 * Validate / sanitize AI counselling JSON for Adapt Cards 2–4.
 * Replaces routine_follow_up with deterministic wording when confirmed plan exists
 * and AI drifted.
 */
export function validateAdaptCounsellingOutput(
  raw: unknown,
  payload: AdaptCounsellingPayload,
): AdaptCounsellingAiOutput {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let what_to_expect = asStringList(
    obj.what_to_expect,
    ADAPT_COUNSELLING_BULLET_LIMITS.what_to_expect,
  );
  let self_care = asStringList(obj.self_care, ADAPT_COUNSELLING_BULLET_LIMITS.self_care);
  let routine_follow_up = asStringList(
    obj.routine_follow_up,
    ADAPT_COUNSELLING_BULLET_LIMITS.routine_follow_up,
  );
  let seek_care = asStringList(obj.seek_care, ADAPT_COUNSELLING_BULLET_LIMITS.seek_care);

  const sig = payload.adapted_prescription.patient_directions;
  const filterSig = (list: string[]) =>
    list.filter((t) => !looksLikeSigOrDose(t, sig));

  what_to_expect = filterSig(what_to_expect);
  self_care = filterSig(self_care);
  routine_follow_up = filterSig(routine_follow_up);
  seek_care = filterSig(seek_care);

  const plan = payload.follow_up_plan;
  if (plan?.pharmacist_confirmed) {
    const deterministic = renderConfirmedFollowUpDeterministically(plan);
    if (
      !matchesConfirmedFollowUp(routine_follow_up, plan) ||
      routine_follow_up.length === 0
    ) {
      routine_follow_up = deterministic;
    }
  } else {
    routine_follow_up = routine_follow_up.filter(
      (t) => !containsInventedInterval(t, plan),
    );
  }

  // Drop internal/system jargon
  const dropInternal = (list: string[]) =>
    list.filter(
      (t) =>
        !/\b(safescribe|pathway|ai draft|confidence score|repository)\b/i.test(t),
    );
  what_to_expect = dropInternal(what_to_expect);
  self_care = dropInternal(self_care);
  routine_follow_up = dropInternal(routine_follow_up);
  seek_care = dropInternal(seek_care);

  return { what_to_expect, self_care, routine_follow_up, seek_care };
}

export function matchesConfirmedFollowUp(
  bullets: string[],
  plan: AdaptCounsellingFollowUpPlan,
): boolean {
  if (!plan.pharmacist_confirmed || !plan.timeframe.trim()) return true;
  if (!bullets.length) return false;
  const joined = bullets.join(' ').toLowerCase();
  const digits = plan.timeframe.match(/\d+/g) ?? [];
  if (digits.some((d) => !joined.includes(d))) return false;
  if (/^pharmacist$/i.test(plan.responsible_party.trim())) {
    if (!/pharmacist/i.test(joined)) return false;
  } else if (
    plan.responsible_party.trim() &&
    !joined.includes(plan.responsible_party.trim().toLowerCase())
  ) {
    return false;
  }
  // At least one monitoring target should appear (loose match)
  const targets = plan.monitoring_targets.map((t) => t.toLowerCase());
  if (targets.length && !targets.some((t) => joined.includes(t.split(' ')[0]!))) {
    return false;
  }
  return true;
}

/**
 * Conservative deterministic draft when AI is unavailable.
 * Prefer sparse, safe content over pathway-style empty placeholders.
 */
export function buildDeterministicAdaptCounselling(
  payload: AdaptCounsellingPayload,
): AdaptCounsellingAiOutput {
  const indication = payload.indication.display_name;
  const what_to_expect: string[] = [];
  if (indication) {
    what_to_expect.push(
      `This medicine is intended to help manage ${indication.toLowerCase()} as part of your adapted treatment plan.`,
    );
  } else {
    what_to_expect.push(
      'This adapted medicine is intended to support your treatment plan as discussed with your pharmacist.',
    );
  }
  what_to_expect.push(
    'You may not feel noticeably different even when the medicine is working.',
  );

  const self_care: string[] = [];
  const ind = indication.toLowerCase();
  if (/cholesterol|lipid|hyperlipid|dyslipid|statin/i.test(ind) || /statin/i.test(payload.medication.ingredient)) {
    self_care.push(
      'Continue heart-healthy eating and regular physical activity as recommended.',
    );
  } else if (/hypertens|blood pressure/i.test(ind)) {
    self_care.push(
      'Continue the diet, activity, and lifestyle measures recommended for your blood pressure.',
    );
  } else if (/diabet|glucose|glycemi/i.test(ind)) {
    self_care.push(
      'Continue the diet, activity, and monitoring habits recommended for your blood sugar.',
    );
  }

  const routine_follow_up = renderConfirmedFollowUpDeterministically(
    payload.follow_up_plan,
  );
  if (!routine_follow_up.length) {
    routine_follow_up.push(
      'Contact your pharmacist if the adapted treatment is not working as expected.',
    );
  }

  const seek_care = [
    'Contact your pharmacist or another healthcare provider if your condition is worsening or the treatment is not working as expected.',
  ];

  return validateAdaptCounsellingOutput(
    { what_to_expect, self_care, routine_follow_up, seek_care },
    payload,
  );
}

/** Card 1 line: "{display_name}: {patient_directions}" */
export function buildAdaptHowToUseLine(payload: AdaptCounsellingPayload): string {
  const name = payload.medication.display_name.trim() || 'Medication';
  const sig = payload.adapted_prescription.patient_directions.trim();
  if (!sig) return name;
  return `${name}: ${sig}`;
}

/** Flatten Cards 2–4 into FOLLOW_UP UI card (routine + seek care). */
export function flattenAdaptFollowUpCard(output: AdaptCounsellingAiOutput): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const text of [...output.routine_follow_up, ...output.seek_care]) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 5) break;
  }
  return out;
}

export type AdaptCounsellingSectionKey =
  | 'MEDICATION_USE'
  | 'EXPECTED_RESPONSE'
  | 'SELF_CARE'
  | 'FOLLOW_UP';

export interface AdaptCounsellingPlanSection {
  section_key: AdaptCounsellingSectionKey;
  title: string;
  bullets: string[];
}

/**
 * Map validated AI output + Card 1 SIG into the four counselling UI sections.
 */
export function mapAdaptCounsellingToSections(
  payload: AdaptCounsellingPayload,
  ai: AdaptCounsellingAiOutput,
): AdaptCounsellingPlanSection[] {
  const howToUse = buildAdaptHowToUseLine(payload);
  return [
    {
      section_key: 'MEDICATION_USE',
      title: 'How to use your medicine',
      bullets: howToUse ? [howToUse] : [],
    },
    {
      section_key: 'EXPECTED_RESPONSE',
      title: 'What to expect',
      bullets: ai.what_to_expect.slice(0, ADAPT_COUNSELLING_BULLET_LIMITS.what_to_expect),
    },
    {
      section_key: 'SELF_CARE',
      title: 'Self-care & non-drug measures',
      bullets: ai.self_care.slice(0, ADAPT_COUNSELLING_BULLET_LIMITS.self_care),
    },
    {
      section_key: 'FOLLOW_UP',
      title: 'Follow-up & when to seek care',
      bullets: flattenAdaptFollowUpCard(ai),
    },
  ];
}

export function adaptCounsellingRequiresInput(
  step1?: AdaptStepOne | null,
  step3A?: AdaptStepThreeOptionA | null,
): { ok: true } | { ok: false; reason: string } {
  if (!step1?.originalPrescription) {
    return { ok: false, reason: 'Original prescription is required.' };
  }
  if (!step3A?.proposedPrescription?.drugName?.trim()) {
    return { ok: false, reason: 'Confirm the proposed adaptation before generating counselling.' };
  }
  if (!step3A.proposedPrescription.sig?.trim()) {
    return { ok: false, reason: 'Confirmed patient directions (SIG) are required for counselling.' };
  }
  return { ok: true };
}

/** Convenience for API/UI: build payload from Adapt steps. */
export function buildAdaptCounsellingFromSteps(
  step1: AdaptStepOne,
  step2A: AdaptStepTwoOptionA | undefined,
  step2B: AdaptStepTwoOptionB | undefined,
  step3A: AdaptStepThreeOptionA | undefined,
  step3B: AdaptStepThreeOptionB | undefined,
  step2C?: AdaptPayload['step2C'],
  proposedOverride?: ProposedPrescription | null,
): AdaptCounsellingPayload {
  return buildAdaptCounsellingPayload(
    { step1, step2A, step2B, step2C, step3A, step3B },
    proposedOverride,
  );
}
