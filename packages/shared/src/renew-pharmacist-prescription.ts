/**
 * SafeScribe Renew — Pharmacist Prescription (formal Rx).
 * Deterministic render from the confirmed Step 4-1 plan.
 * No LLM clinical decisions. Quantity may be calculated only when SIG+duration are unambiguous.
 */

import { displayDob } from './referral-letter-document';
import {
  medicationDisplayName,
  medicationDirections,
  medicationQuantityLabel,
  type RenewDurationId,
  type RenewMedication,
  type RenewPayload,
} from './renew';
import type {
  RenewDapPlanRow,
  RenewDocumentGenerationContext,
} from './renew-dap-note';

type RenewPrescriptionPlanRow = Pick<
  RenewDapPlanRow,
  | 'medicationId'
  | 'displayName'
  | 'directions'
  | 'quantityLabel'
  | 'selected'
  | 'durationId'
  | 'customDurationDays'
  | 'customDurationText'
>;

export const RENEW_PHARMACIST_PRESCRIPTION_TITLE = 'PRESCRIPTION';
export const RENEW_PRESCRIPTION_PROMPT_VERSION = 'renew-rx-deterministic-v1';
export const RENEW_PRESCRIPTION_SCHEMA_VERSION = '1';

export type RenewPrescriptionQuantitySource =
  | 'DETERMINISTIC_CALCULATION'
  | 'PHARMACIST_ENTERED'
  | 'PRODUCT_PACK'
  | 'UNRESOLVED';

export interface RenewPrescriptionQuantity {
  value: number | string | null;
  unit: string | null;
  display: string | null;
  source: RenewPrescriptionQuantitySource;
  pharmacistConfirmed: boolean;
}

export interface RenewOriginalPrescriptionReference {
  medicationId: string;
  required: boolean;
  originalPrescriberName: string | null;
  originalPrescriptionDate: string | null;
  originalRxNumber: string | null;
  otherReference: string | null;
  status: 'COMPLETE' | 'INCOMPLETE' | 'NOT_REQUIRED';
  display: string | null;
}

export interface RenewSharedPrescriptionItem {
  medicationId: string;
  displayName: string;
  brandName: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  route: string | null;
  confirmedSig: string;
  quantity: RenewPrescriptionQuantity;
  refills: { count: number; interval: string | null; source: 'DEFAULT_ZERO' | 'PHARMACIST_AUTHORIZED' };
  durationLabel: string | null;
  durationDays: number | null;
  originalPrescriptionReference: RenewOriginalPrescriptionReference;
}

export interface RenewPharmacistPrescriptionSource {
  schemaVersion: string;
  workflow: 'RENEW';
  jurisdiction: string;
  language: string;
  promptVersion: string;
  prescriptionDate: string;
  prescriptionDateIso: string;
  patient: {
    fullName: string;
    dateOfBirth: string | null;
    phn: string | null;
    address: string | null;
    phone: string | null;
  };
  prescriptions: RenewSharedPrescriptionItem[];
  prescriber: {
    name: string | null;
    designation: string | null;
    registrationNumber: string | null;
    phone: string | null;
  };
  practiceSite: {
    pharmacyName: string | null;
    address: string | null;
    phone: string | null;
    fax: string | null;
  };
  authorization: { status: 'NOT_AUTHORIZED' | 'AUTHORIZED' };
  validation: {
    readyForRender: boolean;
    blockingIssues: string[];
  };
}

const AMBIGUOUS_FORM_RE =
  /\b(?:cream|ointment|gel|lotion|inhaler|insulin|drop|spray|nasal|topical|patch|device|kit|pack|pen|syringe|suspension|solution|prn)\b/i;

/** Build validated Renew prescription source in one pass (O(n) over plan rows). */
export function buildRenewPharmacistPrescriptionSource(
  payload: RenewPayload,
  rows: RenewPrescriptionPlanRow[],
  context?: RenewDocumentGenerationContext,
): RenewPharmacistPrescriptionSource {
  const medById = new Map(payload.medicationList.items.map((med) => [med.id, med]));
  const itemById = new Map(payload.renewalDecision.items.map((item) => [item.medicationId, item]));
  const info = payload.renewalDecision.patientInfo;
  const encounter = context?.encounter;
  const prescriptionDateIso = (encounter?.dateTimeIso || new Date().toISOString()).slice(0, 10);
  const prescriptionDate = formatPrescriptionDate(
    encounter?.dateTimeIso || new Date().toISOString(),
    encounter?.timeZone || 'America/Edmonton',
  );

  const prescriptions: RenewSharedPrescriptionItem[] = [];
  for (const row of rows) {
    if (!row.selected) continue;
    const med = medById.get(row.medicationId);
    const planItem = itemById.get(row.medicationId);
    const durationLabel =
      (planItem ? formatDurationFields(planItem) : null) || formatDurationFields(row);
    const durationDays = durationDaysFromLabel(durationLabel);
    const confirmedSig = (row.directions?.trim() || (med ? medicationDirections(med) : null) || '').trim();
    const quantity = resolvePrescriptionQuantity({
      enteredLabel: row.quantityLabel || (med ? medicationQuantityLabel(med) : null),
      sig: confirmedSig,
      durationDays,
      dosageForm: med?.normalized.dosageForm ?? null,
      dose: med?.normalized.dose ?? null,
      doseUnit: med?.normalized.doseUnit ?? null,
      quantityUnit: med?.normalized.quantityUnit ?? null,
      prn: Boolean(med?.normalized.prn),
    });
    const original = buildOriginalReference(row.medicationId, med);
    prescriptions.push({
      medicationId: row.medicationId,
      displayName: row.displayName || (med ? medicationDisplayName(med) : 'Medication'),
      brandName: med?.normalized.brandName?.trim() || null,
      genericName: med?.normalized.genericName?.trim() || null,
      strength: med?.normalized.strength?.trim() || null,
      dosageForm: med?.normalized.dosageForm?.trim() || null,
      route: med?.normalized.route?.trim() || null,
      confirmedSig,
      quantity,
      refills: { count: 0, interval: null, source: 'DEFAULT_ZERO' },
      durationLabel,
      durationDays,
      originalPrescriptionReference: original,
    });
  }

  const blockingIssues: string[] = [];
  if (!info.patientName.trim()) blockingIssues.push('Patient name is required.');
  if (!prescriptions.length) blockingIssues.push('No medications were selected for renewal.');
  for (const rx of prescriptions) {
    if (!rx.confirmedSig) blockingIssues.push(`Directions missing for ${rx.displayName}.`);
  }
  const authorizationIssues = prescriptions
    .filter((rx) => rx.quantity.source === 'UNRESOLVED')
    .map((rx) => `Quantity unresolved for ${rx.displayName}.`);

  return {
    schemaVersion: RENEW_PRESCRIPTION_SCHEMA_VERSION,
    workflow: 'RENEW',
    jurisdiction: encounter?.jurisdiction?.trim() || 'AB',
    language: 'en-CA',
    promptVersion: RENEW_PRESCRIPTION_PROMPT_VERSION,
    prescriptionDate,
    prescriptionDateIso,
    patient: {
      fullName: info.patientName.trim(),
      dateOfBirth: info.dateOfBirth.trim() || null,
      phn: info.phn?.trim() || null,
      address: context?.patient?.address?.trim() || null,
      phone: context?.patient?.phone?.trim() || null,
    },
    prescriptions,
    prescriber: {
      name: encounter?.pharmacistName?.trim() || null,
      designation: encounter?.pharmacistRole?.trim() || 'Pharmacist',
      registrationNumber: context?.prescriber?.registrationNumber?.trim() || null,
      phone: encounter?.phone?.trim() || null,
    },
    practiceSite: {
      pharmacyName: encounter?.practiceSite?.trim() || null,
      address: encounter?.address?.trim() || null,
      phone: encounter?.phone?.trim() || null,
      fax: encounter?.fax?.trim() || null,
    },
    authorization: { status: 'NOT_AUTHORIZED' },
    validation: {
      readyForRender: blockingIssues.length === 0,
      blockingIssues: [...blockingIssues, ...authorizationIssues],
    },
  };
}

/** Compact LLM/audit payload — only prescription fields, no DAP/monitoring. */
export function buildRenewPrescriptionPromptPayload(
  source: RenewPharmacistPrescriptionSource,
): Record<string, unknown> {
  return {
    sourceModule: source.workflow,
    jurisdiction: source.jurisdiction,
    language: source.language,
    promptVersion: source.promptVersion,
    patient: source.patient,
    prescriptionDate: source.prescriptionDate,
    prescriptions: source.prescriptions.map((rx) => ({
      medicationId: rx.medicationId,
      name: rx.displayName,
      brandName: rx.brandName,
      genericName: rx.genericName,
      strength: rx.strength,
      dosageForm: rx.dosageForm,
      route: rx.route,
      confirmedSig: rx.confirmedSig,
      quantity: {
        value: rx.quantity.value,
        unit: rx.quantity.unit,
        display: rx.quantity.display,
      },
      refills: rx.refills,
      duration: rx.durationLabel,
      originalPrescriptionReference: {
        required: rx.originalPrescriptionReference.required,
        originalPrescriber: rx.originalPrescriptionReference.originalPrescriberName,
        originalPrescriptionDate: rx.originalPrescriptionReference.originalPrescriptionDate,
        originalRxNumber: rx.originalPrescriptionReference.originalRxNumber,
        otherReference: rx.originalPrescriptionReference.otherReference,
        display: rx.originalPrescriptionReference.display,
      },
    })),
    prescriber: source.prescriber,
    practiceSite: source.practiceSite,
    authorization: source.authorization,
  };
}

export function renderRenewPharmacistPrescription(source: RenewPharmacistPrescriptionSource): string {
  const patientBlock = [
    `Name: ${source.patient.fullName || '—'}`,
    `Date of birth: ${source.patient.dateOfBirth ? displayDob(source.patient.dateOfBirth) || source.patient.dateOfBirth : '—'}`,
    `PHN: ${source.patient.phn || '—'}`,
    source.patient.address ? `Address: ${source.patient.address}` : null,
    source.patient.phone ? `Phone: ${source.patient.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const startIso = source.prescriptionDateIso || null;
  const medicationBlock = source.prescriptions.length
    ? source.prescriptions.map((rx) => renderPrescribeMedicationBlock(rx, startIso)).join('\n\n\n')
    : 'No medications were selected for renewal.';

  return [RENEW_PHARMACIST_PRESCRIPTION_TITLE, patientBlock, '', medicationBlock]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderPrescribeMedicationBlock(
  rx: RenewSharedPrescriptionItem,
  startIso: string | null,
): string {
  const title = `**${formatRenewRxTitle(rx)}**`;
  const sig = formatRenewRxSigLine(rx);
  const start = startIso ? formatLooseDate(startIso) : null;
  const end =
    startIso && rx.durationDays && rx.durationDays > 0
      ? formatLooseDate(addCalendarDaysIso(startIso, rx.durationDays))
      : null;
  const expiry = startIso ? formatLooseDate(addCalendarDaysIso(startIso, 365)) : null;
  return [
    title,
    sig || null,
    `Qty: ${rx.quantity.display?.trim() || 'As directed'}  ·  Refills: ${rx.refills.count}  ·  Route: ${formatRenewRoute(rx.route, rx.confirmedSig)}`,
    `Start: ${start || '—'}  ·  End: ${end || '—'}  ·  Expiry: ${expiry || '—'}`,
    formatOriginalPrescriberLine(rx.originalPrescriptionReference),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Step-1 original prescriber line for the Rx PDF — omitted when no prescriber name. */
export function formatOriginalPrescriberLine(ref: {
  originalPrescriberName?: string | null;
  originalPrescriptionDate?: string | null;
}): string | null {
  const name = ref.originalPrescriberName?.trim();
  if (!name) return null;
  const date = ref.originalPrescriptionDate?.trim();
  return date ? `Original Prescriber: ${name}  ·  Date: ${date}` : `Original Prescriber: ${name}`;
}

function formatRenewRxTitle(rx: RenewSharedPrescriptionItem): string {
  const brand = (rx.brandName || rx.genericName || rx.displayName).trim();
  const strength = rx.strength?.trim();
  const generic = rx.genericName?.trim();
  let line = `Rx - ${brand.toUpperCase()}`;
  if (strength && !brand.toLowerCase().includes(strength.toLowerCase())) {
    line = `${line} ${strength}`;
  }
  if (generic && generic.toLowerCase() !== brand.toLowerCase()) {
    line = `${line} (${generic})`;
  }
  return line;
}

function formatRenewRxSigLine(rx: RenewSharedPrescriptionItem): string {
  const sig = rx.confirmedSig.replace(/[.]+$/, '').trim();
  const duration = rx.durationLabel?.trim();
  if (sig && duration && !/,\s*X\s+/i.test(sig)) return `${sig}, X ${duration}`;
  return sig;
}

function formatRenewRoute(route: string | null, sig: string): string {
  const raw = route?.trim();
  if (raw) return `${raw.charAt(0).toUpperCase()}${raw.slice(1).toLowerCase()}`;
  if (/\b(?:po|orally|by mouth)\b/i.test(sig)) return 'Oral';
  if (/\binhale|inhalation\b/i.test(sig)) return 'Inhalation';
  if (/\beye|ophthal|drop\b/i.test(sig)) return 'Ophthalmic';
  if (/\btopical|apply\b/i.test(sig)) return 'Topical';
  return '—';
}

function addCalendarDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildRenewPharmacistPrescriptionNote(
  payload: RenewPayload,
  rows: RenewPrescriptionPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  return renderRenewPharmacistPrescription(
    buildRenewPharmacistPrescriptionSource(payload, rows, context),
  );
}

function formatDurationFields(row: {
  durationId?: RenewDurationId | null;
  customDurationDays?: number | null;
  customDurationText?: string | null;
}): string | null {
  if (!row.durationId) return null;
  if (row.durationId === 'custom') {
    if (row.customDurationDays && row.customDurationDays > 0) return `${row.customDurationDays} days`;
    return row.customDurationText?.trim() || 'Custom';
  }
  if (row.durationId === '7_days') return '7 days';
  if (row.durationId === '14_days') return '14 days';
  if (row.durationId === '30_days') return '30 days';
  if (row.durationId === 'next_blister_cycle') return 'Next blister cycle';
  return null;
}

export function validateRenewPharmacistPrescriptionBody(body: string): string[] {
  const warnings: string[] = [];
  if (/adaptation renewal|renewal\/adaptation|\badaptation\b/i.test(body)) {
    warnings.push('Unsupported prescription terminology: adaptation');
  }
  if (/safety engine|\bllm\b|\bai\b|confidence score|drug therapy problem|adherence assessment/i.test(body)) {
    warnings.push('Unsupported clinical documentation content on formal prescription');
  }
  if (/dispense and counsel/i.test(body)) {
    warnings.push('Unsupported counselling instruction on formal prescription');
  }
  return warnings;
}

export function resolvePrescriptionQuantity(input: {
  enteredLabel: string | null;
  sig: string;
  durationDays: number | null;
  dosageForm: string | null;
  dose: string | null;
  doseUnit: string | null;
  quantityUnit: string | null;
  prn: boolean;
}): RenewPrescriptionQuantity {
  const entered = input.enteredLabel?.trim() || null;
  if (entered) {
    const parsed = parseQuantityLabel(entered);
    return {
      value: parsed.value,
      unit: parsed.unit,
      display: entered,
      source: 'PHARMACIST_ENTERED',
      pharmacistConfirmed: true,
    };
  }

  if (input.prn || AMBIGUOUS_FORM_RE.test(input.dosageForm || '') || AMBIGUOUS_FORM_RE.test(input.sig)) {
    return unresolvedQuantity();
  }
  if (!input.durationDays || input.durationDays <= 0) return unresolvedQuantity();

  const perDay = administrationsPerDay(input.sig);
  const dosePerAdmin = dosePerAdministration(input.sig, input.dose);
  if (perDay == null || dosePerAdmin == null) return unresolvedQuantity();

  const calculated = Math.round(dosePerAdmin * perDay * input.durationDays * 1000) / 1000;
  if (!Number.isFinite(calculated) || calculated <= 0) return unresolvedQuantity();

  const unit =
    countableUnit(input.quantityUnit) ||
    countableUnit(input.doseUnit) ||
    countableUnitFromForm(input.dosageForm) ||
    countableUnitFromSig(input.sig);

  const display = unit ? `${formatQtyNumber(calculated)} ${pluralizeUnit(unit, calculated)}` : String(formatQtyNumber(calculated));
  return {
    value: calculated,
    unit,
    display,
    source: 'DETERMINISTIC_CALCULATION',
    pharmacistConfirmed: false,
  };
}

function unresolvedQuantity(): RenewPrescriptionQuantity {
  return {
    value: null,
    unit: null,
    display: null,
    source: 'UNRESOLVED',
    pharmacistConfirmed: false,
  };
}

function buildOriginalReference(
  medicationId: string,
  med: RenewMedication | undefined,
): RenewOriginalPrescriptionReference {
  const name = med?.normalized.prescriberName?.trim() || med?.raw.prescriberText?.trim() || null;
  // Step 1 captures "Last fill date" for renewals; use prescribedDate when present,
  // otherwise fall back to lastFillDate so the Rx PDF shows the date pharmacists entered.
  const dateRaw =
    med?.normalized.prescribedDate?.trim() ||
    med?.normalized.lastFillDate?.trim() ||
    null;
  const date = dateRaw ? formatLooseDate(dateRaw) : null;
  const rxNumber = extractRxNumber(med?.raw.dateText) || extractRxNumber(med?.raw.prescriberText);
  const bits = [rxNumber ? `Rx #${rxNumber}` : null, name, date].filter(Boolean);
  const display = bits.length ? bits.join(' · ') : null;
  const complete = Boolean(name && date);
  return {
    medicationId,
    required: true,
    originalPrescriberName: name,
    originalPrescriptionDate: date,
    originalRxNumber: rxNumber,
    otherReference: null,
    status: complete ? 'COMPLETE' : display ? 'INCOMPLETE' : 'INCOMPLETE',
    display,
  };
}

function extractRxNumber(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const match = value.match(/\b(?:rx\s*#?\s*|prescription\s*#?\s*)([A-Z0-9-]{3,})\b/i);
  return match?.[1]?.trim() || null;
}

function administrationsPerDay(sig: string): number | null {
  const lower = sig.toLowerCase().replace(/\s+/g, ' ');
  if (/\bevery\s+(\d+)\s+hours?\b/.test(lower)) {
    const hours = Number(lower.match(/\bevery\s+(\d+)\s+hours?\b/)?.[1]);
    if (!hours || hours <= 0 || 24 % hours !== 0) return null;
    return 24 / hours;
  }
  const ordered: Array<[RegExp, number]> = [
    [/\bfour times (?:a )?daily\b|\bqid\b/, 4],
    [/\bthree times (?:a )?daily\b|\btid\b/, 3],
    [/\btwice (?:a )?daily\b|\bbid\b|\btwice a day\b/, 2],
    [/\bonce (?:a )?daily\b|\bonce a day\b|\bqd\b|\bod\b|\bdaily\b/, 1],
  ];
  for (const [re, value] of ordered) {
    if (re.test(lower)) return value;
  }
  if (/\bq\s*am\b|\bmorning\b/.test(lower) && !/\bnoon|evening|bed|night|pm\b/.test(lower)) return 1;
  return null;
}

function dosePerAdministration(sig: string, doseField: string | null): number | null {
  if (doseField && /^\d+(\.\d+)?$/.test(doseField.trim())) return Number(doseField.trim());
  const match = sig.match(
    /\b(?:take|inhale|instill|apply|use)?\s*(\d+(?:\.\d+)?)\s*(?:tablet|capsule|tab|cap|puff|drop|patch|application|dose|unit)s?\b/i,
  );
  if (match) return Number(match[1]);
  const bare = sig.match(/\b(\d+(?:\.\d+)?)\s*(?:tablet|capsule|tab|cap)s?\b/i);
  if (bare) return Number(bare[1]);
  return null;
}

function parseQuantityLabel(label: string): { value: number | string | null; unit: string | null } {
  const match = label.trim().match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  if (match) return { value: Number(match[1]), unit: match[2].trim() };
  return { value: label, unit: null };
}

function countableUnit(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (/tablet|tab\b/.test(raw)) return 'tablet';
  if (/capsule|cap\b/.test(raw)) return 'capsule';
  if (/patch/.test(raw)) return 'patch';
  if (/lozenge/.test(raw)) return 'lozenge';
  if (/application/.test(raw)) return 'application';
  return null;
}

function countableUnitFromForm(form: string | null): string | null {
  return countableUnit(form);
}

function countableUnitFromSig(sig: string): string | null {
  return countableUnit(sig);
}

function pluralizeUnit(unit: string, qty: number): string {
  if (qty === 1) return unit;
  if (unit.endsWith('s')) return unit;
  return `${unit}s`;
}

function formatQtyNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function durationDaysFromLabel(label: string | null): number | null {
  if (!label?.trim()) return null;
  const days = label.match(/^(\d+)\s+days?$/i);
  if (days) return Number(days[1]);
  if (/^7 days$/i.test(label)) return 7;
  if (/^14 days$/i.test(label)) return 14;
  if (/^30 days$/i.test(label)) return 30;
  return null;
}

function formatPrescriptionDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')}-${get('month')}-${get('year')}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function formatLooseDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return formatPrescriptionDate(new Date(parsed).toISOString(), 'UTC');
  }
  return value;
}
