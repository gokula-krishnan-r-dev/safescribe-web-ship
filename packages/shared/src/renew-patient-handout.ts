/**
 * SafeScribe Renew — Optional Patient Handout.
 * Plain-language after-visit summary from confirmed Renew state.
 * Prescription is authoritative for medication identity/SIG/duration.
 * Does not invent counselling, warnings, or a new medication plan.
 * Optional — never blocks Complete & Delete.
 */

import {
  medicationDisplayName,
  type RenewMedication,
  type RenewPayload,
} from './renew';
import {
  buildRenewDapPayload,
  type RenewDapGenerationPayload,
  type RenewDapPlanRow,
  type RenewDocumentGenerationContext,
} from './renew-dap-note';
import {
  restoreProtectedTokens,
  tokenizeProtectedText,
  type TranslateTextsFn,
} from './handout-translation';
import { googleTranslateLanguageCode, normalizeHandoutLanguage } from './handout-languages';

export const RENEW_PATIENT_HANDOUT_TITLE = 'Your Medication Renewal';
export const RENEW_PATIENT_HANDOUT_PROMPT_VERSION = 'renew-handout-v2';
export const RENEW_PATIENT_HANDOUT_SCHEMA_VERSION = '1';

const FORBIDDEN_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'safe', re: /this medicine is safe|medications? are safe|safe for you/i },
  { id: 'kidney_normal', re: /kidney function is normal|renal function (?:is )?normal|no renal concern/i },
  { id: 'bp_controlled', re: /blood pressure is controlled/i },
  { id: 'no_side_effects', re: /will not have side effects|no side effects/i },
  { id: 'doctor_notified', re: /doctor has been notified|prescriber (?:has been )?notified|pcp notified|fax sent/i },
  { id: 'next_refill', re: /next refill will be available|you can refill this/i },
  { id: 'dtp', re: /drug therapy problem|\bdtp\b|hard stop|pharmacist override|contraindicated|safety engine|reference master/i },
  { id: 'safescribe_approved', re: /safescribe approved|\bllm\b|\bai\b/i },
  { id: 'abbreviation', re: /\b(?:bid|tid|qid|prn|qhs|q\d+h|po)\b/i },
];

/** Governed Renew contact advice — only included when marked approved on the source. */
export const RENEW_GOVERNED_CONTACT_ADVICE = [
  'you have a new or concerning side effect',
  'you have trouble taking your medication as directed',
  'your symptoms are getting worse',
  'you have questions about your medication or renewal',
] as const;

const PATIENT_INDICATION_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^(?:hypertension|htn)$/i, label: 'High blood pressure' },
  { match: /^(?:dyslipidemia|hyperlipidemia|hypercholesterolemia)$/i, label: 'High cholesterol' },
  { match: /^(?:type\s*2\s*diabetes|t2dm)$/i, label: 'Type 2 diabetes' },
  { match: /^(?:hypothyroid(?:ism)?)$/i, label: 'Underactive thyroid' },
];

export interface RenewPatientHandoutMedication {
  medicationId: string;
  name: string;
  confirmedSig: string;
  patientFacingSig: string;
  durationLabel: string | null;
  quantityLabel: string | null;
  indicationPatientLabel: string | null;
  indicationDisplayAllowed: boolean;
  renewed: true;
}

export interface RenewPatientHandoutNotRenewed {
  medicationId: string;
  name: string;
  status: 'NOT_RENEWED' | 'DEFERRED' | 'REFERRED';
  reason: string;
  nextStep: string;
  pharmacistConfirmed: boolean;
}

export interface RenewPatientHandoutSource {
  schemaVersion: string;
  workflow: 'RENEW';
  promptVersion: string;
  patient: { displayName: string | null; preferredFirstName: string | null };
  introduction: string;
  medicationsRenewed: RenewPatientHandoutMedication[];
  medicationsNotRenewed: RenewPatientHandoutNotRenewed[];
  patientInstructions: Array<{ text: string; actuallyProvided: true }>;
  monitoring: Array<{ patientText: string }>;
  followUp: Array<{ patientText: string }>;
  contactAdvice: { approved: boolean; items: string[] };
  pharmacy: {
    name: string | null;
    phone: string | null;
    address: string | null;
    hours: string | null;
  };
  validation: { ready: boolean; blockingIssues: string[] };
}

export function buildPatientHandoutNote(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  const source = buildRenewPatientHandoutSource(payload, rows, context);
  return renderRenewPatientHandout(source);
}

export interface PatientHandoutValidationIssue {
  code: string;
  message: string;
}

export interface PatientHandoutValidationResult {
  ready: boolean;
  blockingIssues: PatientHandoutValidationIssue[];
  warnings: PatientHandoutValidationIssue[];
}

export function validateRenewPatientHandoutSource(
  source: RenewPatientHandoutSource,
): PatientHandoutValidationResult {
  const blockingIssues: PatientHandoutValidationIssue[] = source.validation.blockingIssues.map(
    (message) => ({ code: 'SOURCE_BLOCKING', message }),
  );
  if (!source.medicationsRenewed.length && !source.medicationsNotRenewed.length) {
    blockingIssues.push({
      code: 'EMPTY_PLAN',
      message: 'No renewed or follow-up medications are available for the handout.',
    });
  }
  for (const med of source.medicationsRenewed) {
    if (!med.name.trim()) {
      blockingIssues.push({
        code: 'MEDICATION_IDENTITY',
        message: 'A renewed medication is missing a display name.',
      });
    }
    if (!med.confirmedSig.trim()) {
      blockingIssues.push({
        code: 'SIG_MISSING',
        message: `Confirmed SIG missing for ${med.name || 'a medication'}.`,
      });
    }
  }
  for (const med of source.medicationsNotRenewed) {
    if (!med.reason.trim() || !med.nextStep.trim()) {
      blockingIssues.push({
        code: 'NOT_RENEWED_INCOMPLETE',
        message: `Follow-up reason or next step missing for ${med.name || 'a medication'}.`,
      });
    }
  }
  const warnings: PatientHandoutValidationIssue[] = [];
  if (!source.pharmacy.name && !source.pharmacy.phone) {
    warnings.push({
      code: 'PHARMACY_CONTACT_MISSING',
      message: 'Pharmacy name and phone are not available for the Questions? section.',
    });
  }
  return {
    ready: blockingIssues.length === 0,
    blockingIssues,
    warnings,
  };
}

export function buildRenewPatientHandoutSource(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): RenewPatientHandoutSource {
  const dap = buildRenewDapPayload(payload, rows, context);
  const medById = new Map(payload.medicationList.items.map((med) => [med.id, med]));
  const selected = rows.filter((row) => row.selected);
  const notRenewedRows = rows.filter((row) => !row.selected);

  const medicationsRenewed: RenewPatientHandoutMedication[] = selected.map((row) => {
    const med = medById.get(row.medicationId);
    const indication = dap.medications.find((item) => item.medicationId === row.medicationId)?.indication;
    const patientLabel = patientFacingIndication(indication);
    const sig = row.directions?.trim() || '';
    return {
      medicationId: row.medicationId,
      name: compactMedicationName(row.displayName, med),
      confirmedSig: sig,
      patientFacingSig: toPatientFacingSig(sig),
      durationLabel: formatPlanDuration(row),
      quantityLabel: row.quantityLabel?.trim() || null,
      indicationPatientLabel: patientLabel,
      indicationDisplayAllowed: Boolean(patientLabel),
      renewed: true as const,
    };
  });

  const medicationsNotRenewed = buildNotRenewed(notRenewedRows, dap);
  const patientInstructions = dap.counselling
    .map((row) => row.description.replace(/^Counselling documented:\s*/i, '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((text) => ({ text, actuallyProvided: true as const }));

  const monitoring = buildMonitoringLines(dap);
  const followUp = buildFollowUpLines(dap, selected, payload);
  const durations = [
    ...new Set(medicationsRenewed.map((row) => row.durationLabel).filter((row): row is string => Boolean(row))),
  ];
  const sharedDuration = durations.length === 1 ? durations[0] : null;

  const blockingIssues: string[] = [];
  for (const rx of medicationsRenewed) {
    if (!rx.confirmedSig) blockingIssues.push(`Directions missing for ${rx.name}.`);
  }

  const fullName = dap.encounter.patientName?.trim() || null;

  return {
    schemaVersion: RENEW_PATIENT_HANDOUT_SCHEMA_VERSION,
    workflow: 'RENEW',
    promptVersion: RENEW_PATIENT_HANDOUT_PROMPT_VERSION,
    patient: {
      displayName: fullName,
      preferredFirstName: firstNameOnly(fullName),
    },
    introduction: buildIntroduction(medicationsRenewed.length, medicationsNotRenewed.length, sharedDuration),
    medicationsRenewed,
    medicationsNotRenewed,
    patientInstructions,
    monitoring,
    followUp,
    contactAdvice: {
      approved: true,
      items: [...RENEW_GOVERNED_CONTACT_ADVICE],
    },
    pharmacy: {
      name: dap.encounter.practiceSite?.trim() || context?.encounter?.practiceSite?.trim() || null,
      phone: context?.encounter?.phone?.trim() || null,
      address: context?.encounter?.address?.trim() || null,
      hours: null,
    },
    validation: {
      ready: blockingIssues.length === 0 && medicationsRenewed.length + medicationsNotRenewed.length > 0,
      blockingIssues,
    },
  };
}

export function buildRenewPatientHandoutPromptPayload(
  source: RenewPatientHandoutSource,
): Record<string, unknown> {
  return {
    outputMode: 'PATIENT_HANDOUT',
    workflow: source.workflow,
    promptVersion: source.promptVersion,
    patient: source.patient,
    introduction: source.introduction,
    medicationsRenewed: source.medicationsRenewed.map((row) => ({
      medicationId: row.medicationId,
      name: row.name,
      confirmedSig: row.confirmedSig,
      patientFacingSig: row.patientFacingSig,
      durationLabel: row.durationLabel,
      quantityLabel: row.quantityLabel,
      indicationPatientLabel: row.indicationDisplayAllowed ? row.indicationPatientLabel : null,
      indicationDisplayAllowed: row.indicationDisplayAllowed,
    })),
    medicationsNotRenewed: source.medicationsNotRenewed,
    patientInstructions: source.patientInstructions,
    monitoring: source.monitoring,
    followUp: source.followUp,
    contactAdvice: source.contactAdvice,
    pharmacy: source.pharmacy,
  };
}

export function renderRenewPatientHandout(source: RenewPatientHandoutSource): string {
  // Minimum necessary PHI: omit name/PHN/DOB from the body by default.
  const lines: string[] = [RENEW_PATIENT_HANDOUT_TITLE, '', source.introduction, ''];
  const renewedHeading =
    source.medicationsRenewed.length === 1 ? 'Your renewed medication' : 'Your renewed medications';

  if (source.medicationsRenewed.length) {
    lines.push(renewedHeading, '');
    for (const med of source.medicationsRenewed) {
      lines.push(med.name);
      const sig = sentenceCase(med.patientFacingSig || med.confirmedSig);
      if (sig) lines.push(`How to take it: ${sig}`);
      const supply = renewalSupplyLine(med.durationLabel, med.quantityLabel);
      if (supply) lines.push(supply);
      if (med.indicationDisplayAllowed && med.indicationPatientLabel) {
        lines.push(`Used for: ${med.indicationPatientLabel}`);
      }
      lines.push('');
    }
  }

  if (source.medicationsNotRenewed.length) {
    lines.push('Medication requiring follow-up', '');
    for (const med of source.medicationsNotRenewed) {
      lines.push(med.name);
      lines.push('Not renewed today.');
      if (med.reason) lines.push(`Why: ${med.reason}`);
      if (med.nextStep) lines.push(`Next step: ${med.nextStep}`);
      lines.push('');
    }
  }

  const nextBits = [
    ...source.followUp.map((row) => row.patientText),
    ...source.monitoring.map((row) => row.patientText),
  ];
  if (nextBits.length) {
    lines.push('What happens next', '', ...nextBits, '');
  }

  if (source.patientInstructions.length) {
    lines.push('Important instructions', '', ...source.patientInstructions.map((row) => row.text), '');
  }

  if (source.contactAdvice.approved && source.contactAdvice.items.length) {
    lines.push(
      'When to get help',
      '',
      'Contact your pharmacist or healthcare provider if:',
      ...source.contactAdvice.items.map((row) => `• ${row}`),
      '',
    );
  }

  const questions = pharmacyQuestionsLines(source.pharmacy);
  if (questions.length) {
    lines.push('Questions?', ...questions);
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validatePatientHandout(body: string): string[] {
  return FORBIDDEN_CLAIMS.filter((check) => check.re.test(body)).map(
    (check) => `Unsupported handout claim: ${check.id}`,
  );
}

export function validatePatientHandoutAgainstPlan(
  body: string,
  rows: Array<Pick<RenewDapPlanRow, 'selected' | 'directions' | 'displayName'>>,
): { ok: boolean; reason: string | null } {
  const plain = stripMarkup(body);
  const claims = validatePatientHandout(plain);
  if (claims.length) {
    return {
      ok: false,
      reason: 'The handout contains wording that is not supported for a patient-facing document.',
    };
  }
  const lower = plain.toLowerCase();
  for (const row of rows) {
    if (!row.selected) continue;
    const directions = row.directions?.trim();
    if (!directions) continue;
    const patientSig = toPatientFacingSig(directions);
    const howToTake = `How to take it: ${sentenceCase(patientSig)}`;
    const takeLine = takeLineFromSig(directions);
    if (
      !lower.includes(directions.toLowerCase()) &&
      !lower.includes(patientSig.toLowerCase()) &&
      !lower.includes(howToTake.toLowerCase()) &&
      !lower.includes(takeLine.toLowerCase()) &&
      !lower.includes(stripTrailingPeriod(patientSig).toLowerCase())
    ) {
      return {
        ok: false,
        reason:
          'Medication directions must match the confirmed renewal prescription. Change the plan or prescription instead of the handout.',
      };
    }
  }
  return { ok: true, reason: null };
}

function buildIntroduction(
  renewedCount: number,
  notRenewedCount: number,
  sharedDuration: string | null,
): string {
  if (renewedCount && notRenewedCount) {
    return 'Your pharmacist reviewed your medications. Some medications were renewed and others need follow-up.';
  }
  if (!renewedCount) {
    return 'Your pharmacist reviewed your medications. No medications were renewed today.';
  }
  if (renewedCount === 1) {
    const adjective = durationAdjective(sharedDuration);
    if (adjective) return `Your pharmacist reviewed your medication and provided a ${adjective} renewal.`;
    return 'Your pharmacist reviewed your medication and provided a renewal.';
  }
  return 'Your pharmacist reviewed your medications and renewed the medicines listed below.';
}

function buildNotRenewed(
  rows: RenewDapPlanRow[],
  dap: RenewDapGenerationPayload,
): RenewPatientHandoutNotRenewed[] {
  const important = rows.filter((row) => {
    const note = row.safety.note?.trim();
    if (note && note !== 'No concerns' && note !== 'Appropriate use') return true;
    return dap.uncoveredMedicationNames.some((name) =>
      row.displayName.toLowerCase().includes(name.toLowerCase()),
    );
  });
  if (!important.length && !dap.uncoveredMedicationNames.length) return [];
  const target = important.length ? important : rows;
  return target.map((row) => {
    const uncovered = dap.uncoveredMedicationNames.some((name) =>
      row.displayName.toLowerCase().includes(name.toLowerCase()),
    );
    const reason = uncovered
      ? 'Your pharmacist needs updated kidney or dialysis dosing information before this medication can be continued.'
      : patientSafeReason(row.safety.note);
    return {
      medicationId: row.medicationId,
      name: row.displayName,
      status: 'NOT_RENEWED' as const,
      reason,
      nextStep: 'Complete the recommended follow-up and contact your pharmacy or prescriber as discussed.',
      pharmacistConfirmed: true,
    };
  });
}

function buildMonitoringLines(dap: RenewDapGenerationPayload): Array<{ patientText: string }> {
  const lines: string[] = [];
  const followUpMonitoring = dap.followUp.filter((row) => row.kind === 'MONITORING');
  for (const result of dap.monitoringResults) {
    const reviewIsFollowUp =
      Boolean(result.reviewLabel) && result.reviewLabel !== 'Continue and monitor';
    if (result.unavailable) {
      if (!reviewIsFollowUp && !followUpMonitoring.length) continue;
      lines.push(
        `A recent ${patientMonitoringLabel(result.label)} result was not available. Please complete the follow-up discussed with your pharmacist.`,
      );
      continue;
    }
    if (reviewIsFollowUp) {
      lines.push(
        `Please have your ${patientMonitoringLabel(result.label)} checked again within the timeframe discussed with your pharmacist.`,
      );
    }
  }
  for (const row of followUpMonitoring) {
    const text = patientFriendlyFollowUp(row.text);
    if (text && !lines.some((line) => line.toLowerCase().includes(text.toLowerCase().slice(0, 24)))) {
      lines.push(text);
    }
  }
  if (dap.dialysisLabel) {
    lines.push(
      'Because you are receiving dialysis, some medicines may need special dosing or timing. Follow the plan discussed with your pharmacist.',
    );
  }
  return lines.map((patientText) => ({ patientText }));
}

function buildFollowUpLines(
  dap: RenewDapGenerationPayload,
  selected: RenewDapPlanRow[],
  payload: RenewPayload,
): Array<{ patientText: string }> {
  const lines: string[] = [];
  const shorter = selected.filter((row) =>
    isShorterThanRequested(row, payload.renewalRequest.requestedDuration),
  );
  if (shorter.length) {
    const duration = formatPlanDuration(shorter[0]!) ?? 'a shorter period';
    lines.push(
      `Your medication was renewed for ${duration} so this can be checked again before a longer renewal is considered.`,
    );
  }
  if (dap.followUp.some((row) => row.kind === 'PRESCRIBER' || row.kind === 'REFERRAL')) {
    lines.push(
      'Please follow up with your regular healthcare provider before your renewed supply runs out.',
    );
  }
  if (dap.followUp.some((row) => row.kind === 'SHORTER_RENEWAL') && selected.length && !shorter.length) {
    lines.push('Please complete the follow-up discussed with your pharmacist before more medication is supplied.');
  }
  return [...new Set(lines)].map((patientText) => ({ patientText }));
}

function patientFacingIndication(indication: string | null | undefined): string | null {
  const raw = indication?.trim();
  if (!raw) return null;
  for (const row of PATIENT_INDICATION_LABELS) {
    if (row.match.test(raw.trim())) return row.label;
  }
  if (/unknown|not documented|n\/a|missing/i.test(raw)) return null;
  if (raw.length <= 80 && !/[_\d]{3,}/.test(raw)) return raw;
  return null;
}

export function toPatientFacingSig(sig: string): string {
  let next = String(sig ?? '').trim();
  if (!next) return '';
  const eyeContext = /\b(?:eye|ophthal|ocul|drop)s?\b/i.test(next);
  next = next
    .replace(/\bq\.?\s*i\.?\s*d\.?\b/gi, 'four times daily')
    .replace(/\bt\.?\s*i\.?\s*d\.?\b/gi, 'three times daily')
    .replace(/\bb\.?\s*i\.?\s*d\.?\b/gi, 'twice daily')
    .replace(/\bp\.?\s*r\.?\s*n\.?\b/gi, 'as needed')
    .replace(/\bq\s*12\s*h\b/gi, 'every 12 hours')
    .replace(/\bq\s*8\s*h\b/gi, 'every 8 hours')
    .replace(/\bq\s*6\s*h\b/gi, 'every 6 hours')
    .replace(/\bq\s*4\s*h\b/gi, 'every 4 hours')
    .replace(/\bqhs\b/gi, 'at bedtime')
    .replace(/\bhs\b/gi, 'at bedtime')
    .replace(/\bqd\b/gi, 'once daily')
    .replace(/\bpo\b/gi, 'by mouth')
    .replace(/\borally\b/gi, 'by mouth')
    .replace(/\b(?:one|1)\s+(puffs?|tablets?|capsules?|drops?)\b/gi, '1 $1');
  if (!eyeContext) {
    next = next.replace(/\bo\.?\s*d\.?\b/gi, 'once daily');
  }
  return next.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
}

/** Directions line under the How to take it: label (drops a leading Take if already present). */
export function takeLineFromSig(sig: string): string {
  return toPatientFacingSig(sig)
    .replace(/^take\s+/i, '')
    .trim();
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}${trimmed.endsWith('.') ? '' : '.'}`;
}

function durationAdjective(duration: string | null): string | null {
  if (!duration?.trim()) return null;
  const match = duration.trim().match(/^(\d+)\s+days?$/i);
  if (match) return `${match[1]}-day`;
  return duration.trim();
}

function renewalSupplyLine(durationLabel: string | null, quantityLabel: string | null): string | null {
  if (durationLabel?.trim()) return `Renewal supply: ${durationLabel.trim()}`;
  if (quantityLabel?.trim()) return `Renewal supply: ${quantityLabel.trim()}`;
  return null;
}

function compactMedicationName(displayName: string, med?: RenewMedication): string {
  const source =
    displayName.trim() ||
    med?.productIdentity?.sourceDisplayName?.trim() ||
    med?.productIdentity?.productName?.trim() ||
    (med ? medicationDisplayName(med) : 'Medication');
  return formatPatientMedicationName(dedupeMedicationName(source));
}

function dedupeMedicationName(name: string): string {
  const parts = name.split(/\s*[·•|/]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const [first, second] = parts;
    if (second.toLowerCase().includes(first.toLowerCase())) return second;
    if (first.toLowerCase().includes(second.toLowerCase())) return first;
  }
  return name.trim();
}

function formatPatientMedicationName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      if (/^\d/.test(word)) return word;
      if (/^(mg|mcg|µg|ug|g|ml|l|iu|%)$/i.test(word)) return word.toLowerCase();
      if (/^(hfa|xl|cr|sr|ir|er|dr|ec|hcl|mdi)$/i.test(word)) return word.toUpperCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
}

function patientSafeReason(note: string | null | undefined): string {
  const text = note?.trim() || '';
  if (/dialysis|renal|kidney|egfr|creatinine/i.test(text)) {
    return 'Your pharmacist needs updated kidney-function information before this medication can be continued.';
  }
  if (/blood pressure|bp\b|above target/i.test(text)) {
    return 'Your pharmacist wants your blood pressure checked again before continuing this medication as usual.';
  }
  return 'Your pharmacist determined that more follow-up is needed before this medication can be renewed.';
}

function patientMonitoringLabel(label: string): string {
  const lower = label.toLowerCase();
  if (/egfr|creatinine|potassium|renal/i.test(lower)) return 'kidney function';
  if (/^bp$|blood pressure/i.test(lower)) return 'blood pressure';
  if (/a1c|hba1c/i.test(lower)) return 'A1C';
  if (/tsh/i.test(lower)) return 'thyroid blood test';
  return label;
}

function patientFriendlyFollowUp(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  if (/blood pressure|bp\b/i.test(raw)) {
    return 'Please have your blood pressure checked again within the timeframe discussed with your pharmacist.';
  }
  if (/a1c|hba1c/i.test(raw)) {
    return 'An updated A1C is needed as part of your ongoing diabetes care.';
  }
  if (/before.*supply|supply.*exhaust|renewed supply/i.test(raw)) {
    return 'Please arrange follow-up before your renewed medication runs out.';
  }
  if (/recommend|shorter|referred|dtp|rule/i.test(raw)) return null;
  if (raw.length > 140) return null;
  return raw.replace(/\brenal\b/gi, 'kidney');
}

function pharmacyQuestionsLines(pharmacy: RenewPatientHandoutSource['pharmacy']): string[] {
  if (!pharmacy.name && !pharmacy.phone) return [];
  const lines: string[] = [];
  if (pharmacy.name && pharmacy.phone) {
    lines.push(`Contact ${pharmacy.name}`, pharmacy.phone);
  } else if (pharmacy.name) {
    lines.push(`Contact ${pharmacy.name}`);
  } else if (pharmacy.phone) {
    lines.push(`Contact your pharmacy`, pharmacy.phone);
  }
  if (pharmacy.hours?.trim()) lines.push(pharmacy.hours.trim());
  return lines;
}

function firstNameOnly(fullName: string | null): string | null {
  if (!fullName?.trim()) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

function formatPlanDuration(
  row: Pick<RenewDapPlanRow, 'durationId' | 'customDurationDays' | 'customDurationText'> | undefined,
): string | null {
  if (!row?.durationId) return null;
  if (row.durationId === 'custom') {
    if (row.customDurationDays && row.customDurationDays > 0) return `${row.customDurationDays} days`;
    return row.customDurationText?.trim() || null;
  }
  if (row.durationId === '7_days') return '7 days';
  if (row.durationId === '14_days') return '14 days';
  if (row.durationId === '30_days') return '30 days';
  if (row.durationId === 'next_blister_cycle') return 'Next blister cycle';
  return null;
}

function isShorterThanRequested(row: RenewDapPlanRow, requestedId: string | null | undefined): boolean {
  const rank: Record<string, number> = { '7_days': 7, '14_days': 14, '30_days': 30 };
  if (!row.durationId || !requestedId) return false;
  const selected = rank[row.durationId];
  const requested = rank[requestedId];
  return selected != null && requested != null && selected < requested;
}

function stripTrailingPeriod(value: string): string {
  return value.replace(/\.$/, '').trim();
}

function stripMarkup(value: string): string {
  return plainRenewHandoutBody(value).replace(/\s+/g, ' ').trim();
}

/** Keep line structure when the workspace has stored TipTap HTML. */
export function plainRenewHandoutBody(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return raw.replace(/\n{3,}/g, '\n\n').trim();
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function translateRenewPatientHandoutBody(args: {
  englishBody: string;
  targetLanguage: string;
  translateTexts: TranslateTextsFn;
  medicationNames?: string[];
  pharmacyName?: string | null;
  pharmacyPhone?: string | null;
}): Promise<{ body: string; language: string; fallback: boolean; ok: boolean }> {
  const lang = normalizeHandoutLanguage(args.targetLanguage);
  const english = plainRenewHandoutBody(args.englishBody);
  if (!english || lang === 'en') {
    return { body: english, language: 'en', fallback: false, ok: true };
  }
  const lines = english.split('\n');
  const extras = {
    names: args.medicationNames ?? [],
    phones: args.pharmacyPhone ? [args.pharmacyPhone] : [],
    pharmacyName: args.pharmacyName ?? null,
  };
  const units = lines
    .map((line, index) => ({ index, text: line }))
    .filter((row) => row.text.trim());
  if (!units.length) {
    return { body: english, language: lang, fallback: false, ok: true };
  }
  const tokenized = units.map((row) => tokenizeProtectedText(row.text, extras));
  const translated = await args.translateTexts(
    tokenized.map((row) => row.text),
    googleTranslateLanguageCode(lang),
  );
  if (translated.length !== units.length) {
    return { body: english, language: 'en', fallback: true, ok: false };
  }
  const next = [...lines];
  for (let i = 0; i < units.length; i += 1) {
    const restored = restoreProtectedTokens(translated[i] ?? '', tokenized[i]!.tokens, lang);
    const sourceDigits = units[i]!.text.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const destDigits = restored.match(/\d+(?:[.,]\d+)?/g) ?? [];
    if (sourceDigits.join(',') !== destDigits.join(',')) {
      return { body: english, language: 'en', fallback: true, ok: false };
    }
    next[units[i]!.index] = restored;
  }
  return { body: next.join('\n').replace(/\n{3,}/g, '\n\n').trim(), language: lang, fallback: false, ok: true };
}
