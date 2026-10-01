/**
 * Patient Care Summary / Handout payload, deterministic treatment rendering,
 * and post-generation validation.
 *
 * Spec: SafeScribe Patient Care Summary Prompt + Backend Implementation.
 * The generator formats pharmacist-confirmed data. It must not reassess
 * the consultation or reconstruct SIGs from raw medication fields.
 */

import { isCounsellingUiPlaceholder } from './counselling-payload';
import { questionsContactLine } from './handout-languages';
import {
  extractCounsellingSectionPoints,
  getConfirmedTreatmentRows,
  isCounsellingConfirmed,
  pcpDisplayNameFromTreatment,
  pcpPatientDirectionsFromTreatment,
  renderPcpTreatmentSection,
  type PcpPayloadSource,
} from './pcp-communication';
import { readTreatmentPlanConfirmation } from './treatment-plan-confirm';
import {
  looksLikeDiagnosticSymptom,
  restoreAmbiguousPatientInstruction,
  stripDuplicateMedicationUse,
} from './documentation-encounter';

export const PATIENT_CARE_SUMMARY_PROMPT = `You are creating a simple patient-facing care summary from PHARMACIST-CONFIRMED clinical information.

This is a formatting, simplification, organization, and language-rendering task.

You are NOT performing a new clinical assessment.

You must NOT add new clinical advice.

# INPUT

The user message contains the validated patient_summary_payload only:

1. CONFIRMED_ASSESSMENT
- pharmacist-confirmed condition / assessment display name
- optional concise confirmed assessment statement

2. SELECTED_TREATMENTS
- one or more pharmacist-confirmed treatments
- each treatment includes display_name, patient_directions, and optional structured fields for validation only

3. CONFIRMED_COUNSELLING
- pharmacist-reviewed and confirmed counselling
- may include MEDICATION_USE, EXPECTED_RESPONSE, SELF_CARE, FOLLOW_UP

4. SELECTED_LANGUAGE

5. PHARMACY_DETAILS
- pharmacy name
- phone number
- other patient contact information when provided

# SOURCE OF TRUTH

Use information only from the validated input.

Source priority:
1. SELECTED_TREATMENTS
2. CONFIRMED_COUNSELLING
3. CONFIRMED_ASSESSMENT
4. PHARMACY_DETAILS

Do not use outside medical knowledge to add new treatment instructions, precautions, expected-response timelines, self-care advice, red flags, urgent-care advice, follow-up intervals, diagnoses, symptoms, allergies, or medical conditions.

Missing, blank, unknown, or not-assessed information must not be converted into a negative finding.

# TREATMENT PRESERVATION RULES

1. Use each treatment display_name exactly as supplied.
2. Use each treatment patient_directions exactly in meaning.
3. Do NOT add brand names, generic names, parenthetical medication names, trademark symbols, medication synonyms, abbreviations such as BID/TID/QID/PRN unless supplied, dosage-form wording not supplied, or "or as directed" unless supplied.
4. Do not recalculate doses, reconstruct directions from raw dose/route/frequency fields, or duplicate the same direction.
5. If more than one treatment is confirmed, include every confirmed treatment as a separate patient-readable item. Do not omit one, merge regimens, or choose a primary treatment unless explicitly supplied.
6. Leave the treatment array/field empty — the backend renders each line as "[display_name]: [patient_directions]".

Example correct line (backend-rendered):
"valacyclovir: Take 2 g by mouth twice daily for 1 day."

Incorrect:
"Valacyclovir (Valtrex®, generics) (valacyclovir) — 2 g, Oral, Twice daily (BID), 1 day."

# CONFIRMED COUNSELLING RULES

Only use pharmacist-confirmed counselling content.

You may simplify wording, combine closely related confirmed items, remove repetition, and make the language easier for a patient to understand.

You may NOT add a new counselling point, warning, expected-response timeframe, follow-up instruction, or red flag, or change the meaning of a confirmed counselling point.

If a counselling section has no confirmed content, omit that section quietly.
Do not write "No additional counselling required", "No additional self-care measures", or "No follow-up required" unless that exact conclusion was explicitly confirmed.

# LANGUAGE RULES

Generate the entire patient-facing summary in SELECTED_LANGUAGE.
If SELECTED_LANGUAGE is not English: translate the confirmed content naturally; preserve medication names exactly; preserve numbers, strengths, units, doses, frequencies, durations, and treatment timing exactly in meaning; do not add or remove clinical meaning; preserve pharmacy contact information.

Do not translate by first inventing or expanding an English clinical version.
Use the same canonical confirmed source for every language.

# OUTPUT — JSON ONLY

Prefer this schema (arrays of short patient-facing strings):

{
  "title": "",
  "assessment": [],
  "treatment": [],
  "expected_response": [],
  "self_care": [],
  "seek_care": [],
  "follow_up": [],
  "questions_contact": []
}

The application also accepts these equivalent keys as newline-separated strings:
documentTitle, assessment, treatment, expectedResponse, selfCare, seekCare, followUp, questionsContact.

Do not add other keys.

# SECTION RULES

## title / documentTitle
"[Condition] — Your Care Plan" using the confirmed assessment display name. Do not add a diagnosis not present in CONFIRMED_ASSESSMENT.

## assessment
Maximum 1 item. Short patient-friendly statement from the confirmed assessment only.
Example: "Your symptoms are consistent with cold sores (oral herpes labialis)."
Do not include clinical reasoning, differential diagnoses, pathway criteria, or safety-engine findings.

## treatment
Leave empty. Backend fills one item per confirmed treatment as "[display_name]: [patient_directions]".

## expected_response
Maximum 2 items from EXPECTED_RESPONSE. Empty if none.

## self_care
Maximum 3 items from SELF_CARE. Empty if none.

## seek_care
Maximum 3 items from confirmed urgent/safety-net FOLLOW_UP content. Empty if none. Do not invent warning symptoms.

## follow_up
Maximum 2 items from confirmed routine follow-up. Empty if none. Do not invent intervals.

## questions_contact
Leave empty. Backend fills a structured pharmacy contact block from supplied pharmacy details:
Call us at:
Tel: 780-000 0000
Example Pharmacy, 123 Main Street, Edmonton, AB
Empty if no contact information is supplied.

# STYLE

plain language; short sentences; calm and practical; easy to scan; no clinical jargon unless necessary; no SafeScribe, AI, pathway names or IDs, rule IDs, clinical reasoning, or unnecessary pharmacology; aim for one page when rendered.

# FINAL INTERNAL VALIDATION

Before returning JSON, silently verify:
1. No brand/generic/synonym/trademark information was added.
2. No duplicated medication directions or raw database-field lists appear.
3. No new clinical counselling, expected-response, or follow-up timeframe was invented.
4. No missing information was converted into a negative.
5. Every non-empty counselling section is supported by CONFIRMED_COUNSELLING.
6. Numbers, units, doses, frequencies, and durations are preserved.
7. No internal system metadata appears.

Return JSON only.`;

export type PatientHandoutStatus =
  | 'not_requested'
  | 'awaiting_counselling_confirmation'
  | 'ready_to_generate'
  | 'draft_generated'
  | 'pharmacist_reviewed'
  | 'finalized'
  | 'provided';

export interface PatientSummaryTreatment {
  display_name: string;
  patient_directions: string;
  dose?: string;
  route?: string;
  frequency?: string;
  duration?: string;
}

export interface PatientSummaryCounselling {
  MEDICATION_USE: string[];
  EXPECTED_RESPONSE: string[];
  SELF_CARE: string[];
  FOLLOW_UP: string[];
}

export interface PatientSummaryPayload {
  status: PatientHandoutStatus;
  treatment_plan_confirmed: boolean;
  confirmed_assessment: {
    display_name: string | null;
    patient_statement: string | null;
  };
  selected_treatments: PatientSummaryTreatment[];
  confirmed_counselling: PatientSummaryCounselling;
  selected_language: string;
  pharmacy_details: {
    name: string | null;
    phone: string | null;
    address: string | null;
  };
}

export interface PatientSummarySource extends PcpPayloadSource {
  includeDetailedHandout?: boolean | null;
  selectedLanguage?: string | null;
  pharmacyName?: string | null;
  pharmacyPhone?: string | null;
  pharmacyAddress?: string | null;
}

const SEEK_CARE_RE =
  /worsen|urgent|emergency|eye|breathing|swelling|rash|spread|seek medical|get medical|immediately|severe|tongue|face|allergic|chest pain|safety.?net|seek (?:care|assessment|reassessment)/i;

const TRADEMARK = /[®™©]/;
const GENERICS_WORD = /\bgenerics\b/i;
const SIG_ABBREV = /\b(?:BID|TID|QID|QHS|PRN)\b/;
const INTERNAL_META =
  /\b(?:safescribe|guided pathway|clinical judgment|pathway id|rule id|confidence score)\b/i;
const NEGATIVE_INVENTION =
  /^no additional (?:counselling|self-care|follow-up)/i;

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanPoint(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/^[•\-\u2022*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniquePoints(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const text = cleanPoint(raw);
    if (!text || isCounsellingUiPlaceholder(text) || NEGATIVE_INVENTION.test(text)) {
      continue;
    }
    const key = fold(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function includeInHandout(source: PatientSummarySource): boolean {
  const notes = (source.counsellingNotes ?? {}) as {
    includeDetailedHandout?: boolean;
    plan?: { include_detailed_handout?: boolean };
  };
  return (
    source.includeDetailedHandout ??
    notes.plan?.include_detailed_handout ??
    notes.includeDetailedHandout ??
    true
  );
}

function assessmentDisplayName(source: PatientSummarySource): string | null {
  const cj = String(
    source.clinicalJudgmentAssessment?.workingDiagnosisText ?? '',
  ).trim();
  if (cj) return cj;
  const pathway = String(
    source.pathway?.condition ?? source.pathway?.name ?? '',
  ).trim();
  if (pathway) return pathway;
  const eligibility = String(
    (source.eligibility as { overallAssessment?: string } | undefined)
      ?.overallAssessment ?? '',
  ).trim();
  return eligibility || null;
}

export function patientAssessmentStatement(displayName: string | null): string | null {
  if (!displayName?.trim()) return null;
  const name = displayName.trim().replace(/\.$/, '');
  const lowered =
    name === name.toUpperCase()
      ? name
      : name.charAt(0).toLowerCase() + name.slice(1);
  return `Your symptoms are consistent with ${lowered}.`;
}

function structuredToken(value: unknown): string | undefined {
  const t = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^as\s+directed$/i.test(t)) return undefined;
  return t;
}

export function toPatientSummaryTreatment(
  row: Record<string, unknown>,
): PatientSummaryTreatment | null {
  const display_name = pcpDisplayNameFromTreatment(row);
  if (!display_name) return null;
  const patient_directions = pcpPatientDirectionsFromTreatment(row);
  return {
    display_name,
    patient_directions,
    ...(structuredToken(row.dose) ? { dose: structuredToken(row.dose) } : {}),
    ...(structuredToken(row.route)
      ? { route: structuredToken(row.route)?.toLowerCase() }
      : {}),
    ...(structuredToken(row.frequency)
      ? { frequency: structuredToken(row.frequency)?.toLowerCase() }
      : {}),
    ...(structuredToken(row.duration)
      ? { duration: structuredToken(row.duration) }
      : {}),
  };
}

export function getPatientSummaryTreatments(
  treatmentPlan: unknown,
): PatientSummaryTreatment[] {
  return getConfirmedTreatmentRows(treatmentPlan)
    .map((row) => toPatientSummaryTreatment(row))
    .filter((t): t is PatientSummaryTreatment => Boolean(t));
}

export function splitFollowUpForHandout(points: string[]): {
  seekCare: string[];
  followUp: string[];
} {
  const seek: string[] = [];
  const follow: string[] = [];
  for (const point of uniquePoints(points, 12)) {
    if (SEEK_CARE_RE.test(point) && seek.length < 3) seek.push(point);
    else if (!SEEK_CARE_RE.test(point) && follow.length < 2) follow.push(point);
    else if (SEEK_CARE_RE.test(point) && follow.length < 2) follow.push(point);
  }
  return { seekCare: seek.slice(0, 3), followUp: follow.slice(0, 2) };
}

export function confirmedCounsellingForHandout(
  source: PatientSummarySource,
): PatientSummaryCounselling {
  const empty: PatientSummaryCounselling = {
    MEDICATION_USE: [],
    EXPECTED_RESPONSE: [],
    SELF_CARE: [],
    FOLLOW_UP: [],
  };
  if (!isCounsellingConfirmed(source.counsellingNotes)) return empty;
  if (!includeInHandout(source)) return empty;
  return {
    MEDICATION_USE: uniquePoints(
      extractCounsellingSectionPoints(source.counsellingNotes, 'MEDICATION_USE'),
      3,
    ),
    EXPECTED_RESPONSE: uniquePoints(
      extractCounsellingSectionPoints(
        source.counsellingNotes,
        'EXPECTED_RESPONSE',
      ),
      2,
    ),
    SELF_CARE: uniquePoints(
      extractCounsellingSectionPoints(source.counsellingNotes, 'SELF_CARE'),
      3,
    ),
    FOLLOW_UP: uniquePoints(
      extractCounsellingSectionPoints(source.counsellingNotes, 'FOLLOW_UP'),
      5,
    ),
  };
}

export function isTreatmentPlanConfirmedForHandout(treatmentPlan: unknown): boolean {
  const status = readTreatmentPlanConfirmation(treatmentPlan).status;
  if (status === 'STALE') return false;
  if (status === 'CONFIRMED') return true;
  return getConfirmedTreatmentRows(treatmentPlan).length > 0;
}

export function resolvePatientHandoutStatus(
  source: PatientSummarySource,
  _treatments: PatientSummaryTreatment[],
): PatientHandoutStatus {
  if (!includeInHandout(source)) return 'not_requested';
  if (!isCounsellingConfirmed(source.counsellingNotes)) {
    return 'awaiting_counselling_confirmation';
  }
  return 'ready_to_generate';
}

export function patientHandoutGenerationAllowed(
  payload: PatientSummaryPayload,
): boolean {
  return (
    payload.status !== 'not_requested' &&
    payload.status !== 'awaiting_counselling_confirmation' &&
    payload.treatment_plan_confirmed &&
    payload.selected_treatments.length >= 1
  );
}

export function renderPatientSummaryTreatmentLines(
  treatments: PatientSummaryTreatment[],
): string {
  return renderPcpTreatmentSection(
    treatments.map((t, i) => ({
      treatment_id: `t-${i}`,
      display_name: t.display_name,
      patient_directions: t.patient_directions,
      pharmacist_confirmed: true as const,
    })),
  );
}

/** Card 1 extras (technique/timing) that are not already in confirmed directions. */
export function mergeMedicationUseIntoTreatment(
  treatment: string,
  medicationUse: string[],
): string {
  const base = treatment.trim();
  const haystack = fold(base);
  const extras = uniquePoints(medicationUse, 3).filter((point) => {
    const key = fold(point.replace(/\.$/, ''));
    return Boolean(key) && !haystack.includes(key);
  });
  if (!extras.length) return base;
  return base ? `${base}\n${extras.join('\n')}` : extras.join('\n');
}

export function buildPatientSummaryPayload(
  source: PatientSummarySource,
): PatientSummaryPayload {
  const treatments = getPatientSummaryTreatments(source.treatmentPlan);
  const displayName = assessmentDisplayName(source);
  const counselling = confirmedCounsellingForHandout(source);
  counselling.MEDICATION_USE = stripDuplicateMedicationUse(
    counselling.MEDICATION_USE,
    treatments,
  );
  const diagnosticHints = [
    source.chiefComplaint,
    displayName,
  ]
    .filter(Boolean)
    .flatMap((s) => String(s).split(/[,;/]/))
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  counselling.EXPECTED_RESPONSE = counselling.EXPECTED_RESPONSE.filter(
    (p) => !looksLikeDiagnosticSymptom(p, diagnosticHints),
  );
  return {
    status: resolvePatientHandoutStatus(source, treatments),
    treatment_plan_confirmed: isTreatmentPlanConfirmedForHandout(source.treatmentPlan),
    confirmed_assessment: {
      display_name: displayName,
      patient_statement: patientAssessmentStatement(displayName),
    },
    selected_treatments: treatments,
    confirmed_counselling: counselling,
    selected_language: source.selectedLanguage?.trim() || 'en',
    pharmacy_details: {
      name: source.pharmacyName?.trim() || null,
      phone: source.pharmacyPhone?.trim() || null,
      address: source.pharmacyAddress?.replace(/\s+/g, ' ').trim() || null,
    },
  };
}

const HANDOUT_LLM_KEY_MAP: Record<string, string> = {
  title: 'documentTitle',
  documentTitle: 'documentTitle',
  assessment: 'assessment',
  treatment: 'treatment',
  expected_response: 'expectedResponse',
  expectedResponse: 'expectedResponse',
  self_care: 'selfCare',
  selfCare: 'selfCare',
  seek_care: 'seekCare',
  seekCare: 'seekCare',
  follow_up: 'followUp',
  followUp: 'followUp',
  questions_contact: 'questionsContact',
  questionsContact: 'questionsContact',
};

function joinHandoutValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanPoint(String(item ?? '')))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

/** Map LLM array/string output onto the stored Patient Care Summary fields. */
export function coercePatientHandoutLlmOutput(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    const dest = HANDOUT_LLM_KEY_MAP[key];
    if (dest) {
      out[dest] = joinHandoutValue(value);
      continue;
    }
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

export function questionsContactFromPharmacy(
  pharmacy: PatientSummaryPayload['pharmacy_details'],
): string {
  return questionsContactLine(pharmacy.name, pharmacy.phone, 'en', pharmacy.address);
}

export interface PatientHandoutFields {
  documentTitle?: string;
  assessment?: string;
  treatment?: string;
  expectedResponse?: string;
  selfCare?: string;
  seekCare?: string;
  followUp?: string;
  questionsContact?: string;
  handoutLanguage?: string;
  handoutStatus?: string;
  diagnosis?: string;
}

export function applyDeterministicPatientHandoutTreatment(
  fields: Record<string, string>,
  payload: PatientSummaryPayload,
): Record<string, string> {
  const next = { ...fields };
  next.treatment = mergeMedicationUseIntoTreatment(
    renderPatientSummaryTreatmentLines(payload.selected_treatments),
    payload.confirmed_counselling.MEDICATION_USE,
  );
  return next;
}

function fieldItems(value?: string): string[] {
  return (value ?? '')
    .split(/\n+/)
    .map((line) => cleanPoint(line))
    .filter(Boolean);
}

export function validatePatientCareSummary(
  fields: Record<string, string>,
  payload: PatientSummaryPayload,
): {
  ok: boolean;
  reasons: string[];
  medicationFailed: boolean;
  counsellingFailed: boolean;
} {
  const reasons: string[] = [];
  let medicationFailed = false;
  let counsellingFailed = false;
  const treatmentText = fields.treatment ?? '';
  const haystack = [
    fields.assessment,
    fields.treatment,
    fields.expectedResponse,
    fields.selfCare,
    fields.seekCare,
    fields.followUp,
    fields.questionsContact,
    fields.documentTitle,
  ]
    .filter(Boolean)
    .join('\n');

  for (const t of payload.selected_treatments) {
    const nameFold = fold(t.display_name);
    const matches = treatmentText
      .split(/\n+/)
      .filter((line) => fold(line).includes(nameFold)).length;
    if (matches !== 1) {
      reasons.push(`treatment ${t.display_name} appears ${matches} time(s)`);
      medicationFailed = true;
    }
    if (
      t.patient_directions &&
      !fold(treatmentText).includes(fold(t.patient_directions.replace(/\.$/, '')))
    ) {
      reasons.push(`directions missing for ${t.display_name}`);
      medicationFailed = true;
    }
  }

  if (TRADEMARK.test(haystack) || GENERICS_WORD.test(haystack)) {
    const supplied = payload.selected_treatments.some(
      (t) =>
        TRADEMARK.test(`${t.display_name} ${t.patient_directions}`) ||
        GENERICS_WORD.test(`${t.display_name} ${t.patient_directions}`),
    );
    if (!supplied) {
      reasons.push('invented brand/generics wording');
      medicationFailed = true;
    }
  }

  if (/\b(?:or\s+)?as\s+directed\b/i.test(haystack)) {
    const supplied = payload.selected_treatments.some((t) =>
      /\bas\s+directed\b/i.test(t.patient_directions),
    );
    if (!supplied) {
      reasons.push('invented as directed');
      medicationFailed = true;
    }
  }

  if (SIG_ABBREV.test(haystack)) {
    const supplied = payload.selected_treatments.some((t) =>
      SIG_ABBREV.test(`${t.display_name} ${t.patient_directions}`),
    );
    if (!supplied) {
      reasons.push('invented SIG abbreviation');
      medicationFailed = true;
    }
  }

  const allowed = new Set(
    [
      ...payload.confirmed_counselling.EXPECTED_RESPONSE,
      ...payload.confirmed_counselling.SELF_CARE,
      ...payload.confirmed_counselling.FOLLOW_UP,
      ...payload.confirmed_counselling.MEDICATION_USE,
    ].map((p) => fold(p)),
  );

  const checkSupported = (section: string, items: string[]) => {
    for (const item of items) {
      const key = fold(item);
      if (!key) continue;
      const supported = [...allowed].some(
        (a) => a.includes(key) || key.includes(a),
      );
      if (!supported) {
        reasons.push(`unsupported ${section}: ${item}`);
        counsellingFailed = true;
      }
    }
  };

  checkSupported('expectedResponse', fieldItems(fields.expectedResponse));
  checkSupported('selfCare', fieldItems(fields.selfCare));
  checkSupported('seekCare', fieldItems(fields.seekCare));
  checkSupported('followUp', fieldItems(fields.followUp));

  if (INTERNAL_META.test(haystack)) {
    reasons.push('internal metadata leaked');
    counsellingFailed = true;
  }

  return {
    ok: reasons.length === 0,
    reasons,
    medicationFailed,
    counsellingFailed,
  };
}

export function repairPatientCareSummaryFields(
  fields: Record<string, string>,
  payload: PatientSummaryPayload,
): {
  fields: Record<string, string>;
  validation: ReturnType<typeof validatePatientCareSummary>;
} {
  const repaired = applyDeterministicPatientHandoutTreatment(fields, payload);
  const { seekCare, followUp } = splitFollowUpForHandout(
    payload.confirmed_counselling.FOLLOW_UP,
  );

  const dropUnsupported = (value: string | undefined, allowed: string[]) => {
    const allowedFold = allowed.map((a) => fold(a));
    return fieldItems(value)
      .filter((item) => {
        const key = fold(item);
        return allowedFold.some((a) => a.includes(key) || key.includes(a));
      })
      .join('\n');
  };

  repaired.expectedResponse = dropUnsupported(
    repaired.expectedResponse,
    payload.confirmed_counselling.EXPECTED_RESPONSE,
  );
  repaired.selfCare = dropUnsupported(
    repaired.selfCare,
    payload.confirmed_counselling.SELF_CARE,
  );
  repaired.seekCare = dropUnsupported(repaired.seekCare, seekCare);
  repaired.followUp = dropUnsupported(repaired.followUp, followUp);

  if (!payload.confirmed_counselling.EXPECTED_RESPONSE.length) {
    repaired.expectedResponse = '';
  } else if (!repaired.expectedResponse.trim()) {
    repaired.expectedResponse =
      payload.confirmed_counselling.EXPECTED_RESPONSE.join('\n');
  }
  if (!payload.confirmed_counselling.SELF_CARE.length) repaired.selfCare = '';
  else if (!repaired.selfCare.trim()) {
    repaired.selfCare = payload.confirmed_counselling.SELF_CARE.join('\n');
  } else {
    repaired.selfCare = fieldItems(repaired.selfCare)
      .map((item) => {
        const match =
          payload.confirmed_counselling.SELF_CARE.find((c) => {
            const cf = fold(c);
            const f = fold(item);
            const words = cf.split(' ').filter((w) => w.length > 3);
            return words.filter((w) => f.includes(w)).length >= Math.min(2, words.length);
          }) ?? item;
        return restoreAmbiguousPatientInstruction(item, match);
      })
      .join('\n');
  }
  if (!seekCare.length) repaired.seekCare = '';
  else if (!repaired.seekCare.trim()) {
    repaired.seekCare = seekCare.join('\n');
  }
  if (!followUp.length) repaired.followUp = '';
  else if (!repaired.followUp.trim()) {
    repaired.followUp = followUp.join('\n');
  }

  return {
    fields: repaired,
    validation: validatePatientCareSummary(repaired, payload),
  };
}
