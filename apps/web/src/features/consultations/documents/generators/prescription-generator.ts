import type { Consultation, TreatmentRecommendation } from '../../types';
import type {
  PatientDocumentInfo,
  PrescriptionMedication,
} from '../types';
import {
  projectConsultationSource,
  selectedTreatments,
} from './source-projection';
import { escapeHtml, toEditorHtml } from '../tiptap-text';
import { displayDob, formatDocumentFaxNumber } from '@safescript/shared';
import { formatSuggestedDispenseQuantity } from '../../add-treatment/quantity';

export interface PrescriptionDocumentContent {
  diagnosis?: string;
  medications?: PrescriptionMedication[];
  specialInstructions?: string;
  notes?: string;
  /** Flat fields for Review & edit workspace */
  patientBlock?: string;
  medicationBlock?: string;
  sigBlock?: string;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseDurationDays(duration?: string): number | null {
  if (!duration?.trim()) return null;
  const m = duration.match(/(\d+)\s*(day|days|d)\b/i);
  if (m) return Number(m[1]);
  const weeks = duration.match(/(\d+)\s*(week|weeks|w)\b/i);
  if (weeks) return Number(weeks[1]) * 7;
  return null;
}

function formatRxDate(isoOrLabel?: string): string {
  if (!isoOrLabel?.trim()) return '';
  const parsed = Date.parse(isoOrLabel);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed)
      .toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      .replace(/ /g, '-');
  }
  return isoOrLabel.trim();
}

/** Normalize "1 days" → "1 day", keep richer duration copy as-is. */
export function formatRxDurationLabel(duration?: string | null): string | undefined {
  const raw = String(duration ?? '').trim();
  if (!raw) return undefined;
  const match = raw.match(/^(\d+)\s*(days?|d)$/i);
  if (match) {
    const n = Number(match[1]);
    return `${n} ${n === 1 ? 'day' : 'days'}`;
  }
  return raw;
}

function administrationUnitLabel(
  t: Pick<TreatmentRecommendation, 'doseUnit' | 'productForm'>,
): string | undefined {
  const unit = t.doseUnit?.trim();
  if (unit) return unit;
  const form = t.productForm?.trim();
  if (!form) return undefined;
  // Product forms used as countable administration units on the SIG.
  if (/^(tablet|capsule|application|puff|drop|lozenge|patch|suppository)/i.test(form)) {
    return /\(s\)$/i.test(form) ? form : `${form.replace(/s$/i, '')}(s)`;
  }
  return undefined;
}

/**
 * Administration dose for the SIG line.
 * Bare counts like "1" become "1 Tablet(s)" when doseUnit is known — avoids "1, BID".
 */
export function formatRxDoseLabel(
  t: Pick<TreatmentRecommendation, 'dose' | 'doseAmount' | 'doseUnit' | 'productForm'>,
): string | undefined {
  const amount = (t.doseAmount?.trim() || t.dose?.trim() || '').trim();
  if (!amount) return undefined;
  const unit = administrationUnitLabel(t);
  if (!unit) return amount;
  const unitBare = unit.replace(/\(s\)$/i, '').trim().toLowerCase();
  if (!unitBare) return amount;
  if (amount.toLowerCase().includes(unitBare)) return amount;
  if (/^\d+(\.\d+)?$/.test(amount)) return `${amount} ${unit}`;
  return amount;
}

/** Prefer pharmacist-entered dispense quantity; suggest from regimen when possible. */
export function resolveRxQuantity(
  t: Pick<
    TreatmentRecommendation,
    'quantity' | 'quantityUnit' | 'dose' | 'doseAmount' | 'doseUnit' | 'productForm' | 'regimenLines'
  >,
): string {
  const qty = t.quantity?.trim();
  if (qty) {
    // "28" + unit → "28 Tablet(s)"; leave richer strings alone.
    if (/^\d+(\.\d+)?$/.test(qty) && t.quantityUnit?.trim()) {
      return `${qty} ${t.quantityUnit.trim()}`;
    }
    return qty;
  }

  const unit =
    t.quantityUnit?.trim() ||
    administrationUnitLabel(t) ||
    undefined;
  if (unit && t.regimenLines?.length) {
    const suggested = formatSuggestedDispenseQuantity(
      t.regimenLines as Parameters<typeof formatSuggestedDispenseQuantity>[0],
      unit,
    );
    if (suggested) return `${suggested} ${unit}`;
  }
  return 'As directed';
}

/** True when stored Rx rows still use bare dose counts ("1") from older generators. */
export function prescriptionMedicationsLookLegacy(
  medications?: PrescriptionMedication[] | null,
): boolean {
  if (!medications?.length) return false;
  return medications.some((m) => /^\d+(\.\d+)?$/.test(String(m.dosage ?? '').trim()));
}

/** SIG line shown under the Rx title in the Notion editor / medicationBlock. */
export function formatPrescriptionSigLine(
  m: Pick<PrescriptionMedication, 'dosage' | 'frequency' | 'duration'>,
): string {
  const dose = m.dosage?.trim();
  const frequency = m.frequency?.trim();
  const duration = formatRxDurationLabel(m.duration);
  const head = [dose, frequency].filter(Boolean).join(', ');
  if (duration) return head ? `${head}, X ${duration}` : `X ${duration}`;
  return head;
}

/**
 * Parse the saved patientBlock plain-text into individual patient fields.
 * Returns partial overrides — only fields that are present and non-stub.
 * Used by the PDF renderer so that pharmacist edits to the patient section
 * are reflected in the printed/faxed prescription.
 */
export function parsePatientBlockForPdf(patientBlock?: string | null): {
  name?: string;
  dateOfBirth?: string;
  patientId?: string;
  address?: string;
  phone?: string;
} {
  const source = String(patientBlock ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return {};

  const result: {
    name?: string;
    dateOfBirth?: string;
    patientId?: string;
    address?: string;
    phone?: string;
  } = {};

  // Each label-value pair is on its own line (or separated by double-newlines)
  const lines = source
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Name: JANE DOE
    const nameMatch = line.match(/^Name:\s*(.+)$/i);
    if (nameMatch) {
      const v = nameMatch[1].trim();
      if (v && v !== '—' && !/stub|sample/i.test(v)) {
        result.name = v;
      }
      continue;
    }
    // Date of birth: 01-Jan-1990  or  Date of birth: - SAMPLE BIRTH DAY (stub)
    const dobMatch = line.match(/^Date\s+of\s+birth:\s*(.+)$/i);
    if (dobMatch) {
      const v = dobMatch[1].trim().replace(/^[-–—]\s*/, '');
      if (v && !/stub|sample|birth day/i.test(v) && v !== '—' && v !== '-') {
        result.dateOfBirth = v;
      }
      continue;
    }
    // PHN: 123456789  or  PHN: — SAMPLE PHN (stub)
    const phnMatch = line.match(/^PHN:\s*(.+)$/i);
    if (phnMatch) {
      const v = phnMatch[1].trim().replace(/^[-–—]\s*/, '');
      if (v && !/stub|sample|not available/i.test(v) && v !== '—' && v !== '-') {
        result.patientId = v;
      } else if (/not available/i.test(phnMatch[1].trim())) {
        result.patientId = 'Not available';
      }
      continue;
    }
    // Address: 123 Main St, City, BC V1A 2B3
    const addrMatch = line.match(/^Address:\s*(.+)$/i);
    if (addrMatch) {
      const v = addrMatch[1].trim();
      if (v && v !== '—') {
        result.address = v;
      }
      continue;
    }
    // Phone: (604) 555-1234
    const phoneMatch = line.match(/^Phone:\s*(.+)$/i);
    if (phoneMatch) {
      const v = phoneMatch[1].trim();
      if (v && v !== '—') {
        result.phone = v;
      }
      continue;
    }
  }

  return result;
}

/** True when the patient identity block is the legacy stub (or empty). */
export function isPrescriptionPatientStub(value?: string | null): boolean {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!text) return true;
  if (text === 'patient' || text === 'patient.') return true;
  if (/^patient(\s+details)?$/.test(text)) return true;
  return false;
}

/** True when the value is a product strength (5 mg), not a tablet count ("6"). */
export function looksLikeMedicationStrength(value: string | undefined | null): boolean {
  const v = String(value ?? '').trim();
  if (!v) return false;
  return /\d+(\.\d+)?\s*(mg|mcg|µg|ug|g|ml|iu|units?|mmol|meq|%)\b/i.test(v);
}

export function resolveMedicationStrength(
  t: Pick<TreatmentRecommendation, 'strength' | 'dose' | 'displayName' | 'instructions'>,
): string | undefined {
  const explicit = t.strength?.trim();
  if (explicit) return explicit;
  const dose = t.dose?.trim();
  if (dose && looksLikeMedicationStrength(dose)) return dose;
  const fromDisplay = String(t.displayName ?? '').match(
    /(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|units?|mmol|meq|%))\b/i,
  );
  if (fromDisplay?.[1]) return fromDisplay[1].trim();
  const fromSig = String(t.instructions ?? '').match(
    /\((\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|units?|mmol|meq|%))\)/i,
  );
  if (fromSig?.[1]) return fromSig[1].trim();
  return undefined;
}

function strengthAlreadyInName(name: string, strength: string): boolean {
  return name.toLowerCase().includes(strength.toLowerCase());
}

/** `Rx - APO-PREDNISONE 5 mg` — brand line without generic. */
export function formatPrescriptionRxBrandLine(
  m: Pick<PrescriptionMedication, 'name' | 'strength'>,
): string {
  const brand = m.name.trim().toUpperCase();
  const strength = m.strength?.trim();
  if (strength && !strengthAlreadyInName(brand, strength)) {
    return `Rx - ${brand} ${strength}`;
  }
  return `Rx - ${brand}`;
}

/** `Rx - APO-PREDNISONE 5 mg (prednisone)` */
export function formatPrescriptionRxTitle(
  m: Pick<PrescriptionMedication, 'name' | 'genericName' | 'strength'>,
): string {
  const line = formatPrescriptionRxBrandLine(m);
  const generic = m.genericName?.trim();
  if (!generic) return line;
  if (generic.toLowerCase() === m.name.trim().toLowerCase()) return line;
  return `${line} (${generic})`;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

/** Patch stored Rx headlines that omitted product strength. */
export function upsertPrescriptionRxTitlesHtml(
  html: string,
  titles: string[],
): string {
  const source = String(html ?? '');
  if (!source.trim() || !titles.length) return source;
  let index = 0;
  return source.replace(
    /(<strong>)(\s*Rx\s*-\s*[^<]+?)(<\/strong>)/gi,
    (_full, open: string, current: string, close: string) => {
      const next = titles[index++];
      if (!next) return `${open}${current}${close}`;
      const text = decodeBasicEntities(current).replace(/\s+/g, ' ').trim();
      if (looksLikeMedicationStrength(text)) return `${open}${current}${close}`;
      return `${open}${escapeHtml(next)}${close}`;
    },
  );
}

export function upsertPrescriptionRxTitlesPlain(
  block: string,
  titles: string[],
): string {
  const source = String(block ?? '');
  if (!source.trim() || !titles.length) return source;
  let index = 0;
  return source.replace(/\*\*(Rx\s*-\s*[^*]+)\*\*/g, (full, current: string) => {
    const next = titles[index++];
    if (!next) return full;
    if (looksLikeMedicationStrength(current)) return full;
    return `**${next}**`;
  });
}

function toMedication(
  t: TreatmentRecommendation,
  encounterIso: string,
): PrescriptionMedication {
  const startIso = encounterIso.slice(0, 10);
  const durationDays = parseDurationDays(t.duration);
  const endIso =
    durationDays != null ? addDaysIso(startIso, durationDays) : undefined;
  // Typical Rx validity window for pharmacist minor-ailment Rx
  const expiryIso = addDaysIso(startIso, 365);

  const brand =
    t.brandName?.trim() ||
    t.medicationName?.trim() ||
    t.genericName?.trim() ||
    'Medication';
  const generic =
    t.genericName?.trim() &&
    t.genericName.trim().toLowerCase() !== brand.toLowerCase()
      ? t.genericName.trim()
      : undefined;

  return {
    name: brand,
    genericName: generic,
    strength: resolveMedicationStrength(t),
    dosage: formatRxDoseLabel(t),
    frequency: t.frequency?.trim() || undefined,
    duration: formatRxDurationLabel(t.duration),
    route: t.route?.trim() || undefined,
    quantity: resolveRxQuantity(t),
    refills: '0',
    instructions:
      t.patientDirections?.trim() || t.instructions?.trim() || undefined,
    drugUse: 'As directed',
    substitutions: 'Allowed',
    startDate: formatRxDate(startIso),
    endDate: endIso ? formatRxDate(endIso) : undefined,
    effectiveDate: formatRxDate(startIso),
    expiryDate: expiryIso ? formatRxDate(expiryIso) : undefined,
    compliancePkg: 'No',
    trialDispenses: 'Not Authorized',
  };
}

function buildPatientBlock(
  patient: PatientDocumentInfo,
  _consultationRef?: string,
): string {
  const name = patient.name?.trim();
  const dobRaw = patient.dateOfBirth?.trim();
  const dob = dobRaw ? displayDob(dobRaw) || dobRaw : '';
  const phn = patient.phnNotAvailable
    ? 'Not available'
    : patient.patientId?.trim();
  const address = patient.address?.trim().replace(/\n+/g, ', ');
  const phone =
    formatDocumentFaxNumber(patient.phone) ??
    (patient.phone?.trim() || undefined);
  return [
    `Name: ${name || '—'}`,
    `Date of birth: ${dob || '—'}`,
    `PHN: ${phn || '—'}`,
    address ? `Address: ${address}` : null,
    phone ? `Phone: ${phone}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildMedicationBlock(meds: PrescriptionMedication[]): string {
  return meds
    .map((m) => {
      const title = `**${formatPrescriptionRxTitle(m)}**`;
      const sig = formatPrescriptionSigLine(m);
      const originalPrescriber = m.originalPrescriber?.trim();
      const originalDate = m.originalPrescriptionDate?.trim();
      const originalLine = originalPrescriber
        ? originalDate
          ? `Original Prescriber: ${originalPrescriber}  ·  Date: ${originalDate}`
          : `Original Prescriber: ${originalPrescriber}`
        : null;
      return [
        title,
        sig || null,
        m.instructions ? `Patient Instructions: ${m.instructions}` : null,
        `Qty: ${m.quantity ?? '—'}  ·  Refills: ${m.refills ?? '0'}  ·  Route: ${m.route ?? '—'}`,
        `Start: ${m.startDate ?? '—'}  ·  End: ${m.endDate ?? '—'}  ·  Expiry: ${m.expiryDate ?? '—'}`,
        originalLine,
      ]
        .filter(Boolean)
        .join('\n\n');
    })
    .join('\n\n\n');
}

const PRESCRIPTION_SECTION_RE = (key: 'patientBlock' | 'medicationBlock') =>
  new RegExp(
    `(<h2[^>]*data-field=["']${key}["'][^>]*>[\\s\\S]*?<\\/h2>)([\\s\\S]*?)(?=<h2\\b|$)`,
    'i',
  );

function innerTextFromHtml(inner: string): string {
  return inner
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function paragraphStartsRx(inner: string): boolean {
  return /^Rx\s*-/i.test(innerTextFromHtml(inner));
}

function splitJammedRxParagraphs(body: string): string {
  return body.replace(/<p(\b[^>]*)>([\s\S]*?)<\/p>/gi, (full, attrs, inner) => {
    const pieces = String(inner)
      .split(/<br\s*\/?>/i)
      .map((part) => part.trim())
      .filter(Boolean);
    const rxAt = pieces
      .map((part, index) => (paragraphStartsRx(part) ? index : -1))
      .filter((index) => index >= 0);
    if (rxAt.length < 2) return full;
    const groups: string[][] = [];
    let current: string[] = [];
    for (let i = 0; i < pieces.length; i += 1) {
      if (rxAt.includes(i) && current.length) {
        groups.push(current);
        current = [];
      }
      current.push(pieces[i]);
    }
    if (current.length) groups.push(current);
    return groups.map((group) => `<p${attrs}>${group.join('<br>')}</p>`).join('');
  });
}

function spaceRxTreatments(body: string): string {
  const withoutGaps = body.replace(
    /<hr[^>]*class=["'][^"']*ss-rx-gap[^"']*["'][^>]*\/?>/gi,
    '',
  );
  const split = splitJammedRxParagraphs(withoutGaps);
  let seen = 0;
  return split.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) => {
    const inner = paragraph.replace(/^<p\b[^>]*>/i, '').replace(/<\/p>$/i, '');
    if (!paragraphStartsRx(inner)) return paragraph;
    seen += 1;
    return seen === 1 ? paragraph : `<hr class="ss-rx-gap">${paragraph}`;
  });
}

/** Insert a visible gap before every treatment after the first. */
export function ensurePrescriptionTreatmentGapsHtml(html: string): string {
  const source = String(html ?? '');
  if (!source.trim()) return source;
  if (!PRESCRIPTION_SECTION_RE('medicationBlock').test(source)) {
    return spaceRxTreatments(source);
  }
  return source.replace(
    PRESCRIPTION_SECTION_RE('medicationBlock'),
    (_full, heading: string, body: string) => `${heading}${spaceRxTreatments(body)}`,
  );
}

/** Keep the patient identity section in sync with Patient Information. */
export function upsertPrescriptionPatientHtml(
  html: string,
  patientBlock: string,
): string {
  const source = String(html ?? '');
  if (!patientBlock.trim() || isPrescriptionPatientStub(patientBlock)) {
    return source;
  }
  const body = toEditorHtml(patientBlock);
  const byField = PRESCRIPTION_SECTION_RE('patientBlock');
  if (byField.test(source)) return source.replace(byField, `$1${body}`);

  // Legacy HTML without data-field — match the section heading by label.
  const byLabel =
    /(<h2\b[^>]*>\s*Patient details(?:\s*\([^)]*\))?\s*<\/h2>)([\s\S]*?)(?=<h2\b|$)/i;
  if (byLabel.test(source)) return source.replace(byLabel, `$1${body}`);

  return source;
}

/**
 * Prescription document — clinical Rx content from confirmed treatments.
 * PDF rendering uses the structured medications array (sample-template layout).
 */
export function generatePrescriptionContent(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
): PrescriptionDocumentContent {
  const src = projectConsultationSource(consultation, patientInfo);
  const rxTreatments = selectedTreatments(consultation).filter(
    (t) => (t.category ?? 'PRESCRIPTION') === 'PRESCRIPTION',
  );
  const treatments = rxTreatments.length
    ? rxTreatments
    : selectedTreatments(consultation).filter((t) =>
        Boolean(t.medicationName?.trim()),
      );

  const encounterIso = consultation.createdAt || new Date().toISOString();
  const medications = treatments.map((t) => toMedication(t, encounterIso));

  const diagnosis =
    src.pathwayLabel ||
    src.clinicalImpression ||
    src.chiefComplaint ||
    undefined;

  return {
    diagnosis,
    medications,
    specialInstructions: undefined,
    notes: diagnosis ? `Indication: ${diagnosis}` : undefined,
    patientBlock: buildPatientBlock(src.patient, src.consultationRef),
    medicationBlock: buildMedicationBlock(medications),
    sigBlock: medications
      .map((m) => formatPrescriptionSigLine(m))
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildPrescriptionPlainText(
  content: PrescriptionDocumentContent,
): string {
  const parts = [
    'PRESCRIPTION',
    content.patientBlock,
    '',
    content.medicationBlock,
    content.notes ? `\nNotes:\n${content.notes}` : null,
    content.specialInstructions
      ? `\nSpecial instructions:\n${content.specialInstructions}`
      : null,
  ].filter((p) => p != null && String(p).trim());
  return parts.join('\n').trim();
}

export function prescriptionToEditableFields(
  content?: PrescriptionDocumentContent | null,
): Record<string, string> {
  const html =
    content && 'documentHtml' in content
      ? String((content as { documentHtml?: string }).documentHtml ?? '')
      : '';
  return {
    patientBlock: content?.patientBlock ?? '',
    medicationBlock: content?.medicationBlock ?? '',
    diagnosis: content?.diagnosis ?? '',
    notes: content?.notes ?? '',
    specialInstructions: content?.specialInstructions ?? '',
    ...(html ? { documentHtml: html } : {}),
  };
}

/**
 * Split an edited Medication & directions block into one section per Rx.
 * Sections start at lines that begin with "Rx -" (markdown bold / list prefixes allowed).
 */
export function splitMedicationBlockSections(medicationBlock: string): string[] {
  const normalized = normalizeMedicationBlockPlainText(medicationBlock);
  if (!normalized) return [];
  const parts = normalized
    .split(/(?=^Rx\s*-)/im)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized];
}

/** Flatten TipTap numbered-list dumps so each Rx field is on its own line. */
export function normalizeMedicationBlockPlainText(medicationBlock: string): string {
  const source = String(medicationBlock ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!source) return '';

  // TipTap / fieldToPlainText often emits "1. Rx - … 2. sig 3. Patient Instructions…"
  // on one or few lines. Re-split on numbered markers before labeled Rx fields.
  const withBreaks = source
    .replace(
      /(?:^|\s+)\d+[.)]\s*(?=(?:\*\*)?Rx\s*-|Patient Instructions:|Qty:|Start:|Original Prescriber:|Original prescription:)/gi,
      '\n',
    )
    .replace(/\n{3,}/g, '\n\n');

  return withBreaks
    .split('\n')
    .map((line) =>
      stripMdBold(line)
        .replace(/^\d+[.)]\s+/, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

function stripMdBold(line: string): string {
  return line.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function parseLabeledTrio(
  line: string,
  a: string,
  b: string,
  c: string,
): [string | undefined, string | undefined, string | undefined] {
  const re = new RegExp(
    `${a}:\\s*([^·]+?)(?:\\s*[·•|]\\s*${b}:\\s*([^·]+?))?(?:\\s*[·•|]\\s*${c}:\\s*(.+))?$`,
    'i',
  );
  const match = line.match(re);
  if (!match) return [undefined, undefined, undefined];
  return [
    match[1]?.trim() || undefined,
    match[2]?.trim() || undefined,
    match[3]?.trim() || undefined,
  ];
}

function parseOriginalPrescriptionLegacy(text: string): {
  originalPrescriber?: string;
  originalPrescriptionDate?: string;
} | null {
  const match = text.match(/^Original prescription:\s*(.+)$/i);
  if (!match?.[1]?.trim()) return null;
  const bits = match[1]
    .split(/\s*[·•|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^Rx\s*#/i.test(part));
  if (!bits.length) return null;
  const dateIdx = bits.findIndex((part) => /^\d{1,2}-[A-Za-z]{3,}-\d{4}$/.test(part));
  const date = dateIdx >= 0 ? bits[dateIdx] : undefined;
  const name = bits.filter((_, index) => index !== dateIdx).join(' · ').trim() || undefined;
  if (!name) return null;
  return { originalPrescriber: name, originalPrescriptionDate: date };
}

function parseOriginalPrescriberLine(line: string): {
  originalPrescriber?: string;
  originalPrescriptionDate?: string;
} | null {
  const match = line.match(
    /^Original Prescriber:\s*(.+?)(?:\s*[·•|]\s*Date:\s*(.+))?$/i,
  );
  if (!match?.[1]?.trim()) return null;
  return {
    originalPrescriber: match[1].trim(),
    originalPrescriptionDate: match[2]?.trim() || undefined,
  };
}

function applyMedicationSectionEdits(
  med: PrescriptionMedication,
  section: string,
): PrescriptionMedication {
  const lines = normalizeMedicationBlockPlainText(section)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const body = /^Rx\s*-/i.test(lines[0] ?? '') ? lines.slice(1) : lines;

  let instructions = med.instructions;
  let originalPrescriber = med.originalPrescriber;
  let originalPrescriptionDate = med.originalPrescriptionDate;
  let quantity = med.quantity;
  let refills = med.refills;
  let route = med.route;
  let startDate = med.startDate;
  let endDate = med.endDate;
  let expiryDate = med.expiryDate;
  let dosage = med.dosage;
  let frequency = med.frequency;
  let duration = med.duration;
  const sigLines: string[] = [];

  for (const line of body) {
    const instructionMatch = line.match(/^Patient Instructions:\s*(.*)$/i);
    if (instructionMatch) {
      const raw = instructionMatch[1]?.trim() || '';
      const legacy = parseOriginalPrescriptionLegacy(raw);
      if (legacy?.originalPrescriber) {
        originalPrescriber = legacy.originalPrescriber;
        originalPrescriptionDate =
          legacy.originalPrescriptionDate || originalPrescriptionDate;
      } else if (raw) {
        instructions = raw;
      }
      continue;
    }
    const originalLine = parseOriginalPrescriberLine(line);
    if (originalLine?.originalPrescriber) {
      originalPrescriber = originalLine.originalPrescriber;
      originalPrescriptionDate =
        originalLine.originalPrescriptionDate || originalPrescriptionDate;
      continue;
    }
    if (/^Qty:/i.test(line)) {
      const [qty, ref, rt] = parseLabeledTrio(line, 'Qty', 'Refills', 'Route');
      if (qty) quantity = qty;
      if (ref) refills = ref;
      if (rt) route = rt;
      continue;
    }
    if (/^Start:/i.test(line)) {
      const [start, end, expiry] = parseLabeledTrio(line, 'Start', 'End', 'Expiry');
      if (start) startDate = start;
      if (end) endDate = end;
      if (expiry) expiryDate = expiry;
      continue;
    }
    if (/^(Drug Use|Compliance|Substitutions|Effective|Trial)\b/i.test(line)) {
      continue;
    }
    if (/^Rx\s*-/i.test(line)) {
      continue;
    }
    const bareLegacy = parseOriginalPrescriptionLegacy(line);
    if (bareLegacy?.originalPrescriber) {
      originalPrescriber = bareLegacy.originalPrescriber;
      originalPrescriptionDate =
        bareLegacy.originalPrescriptionDate || originalPrescriptionDate;
      continue;
    }
    if (isContaminatedPrescriptionSigLine(line)) {
      continue;
    }
    sigLines.push(line);
  }

  if (sigLines.length) {
    const sig = sigLines.join(' ').trim();
    if (!isContaminatedPrescriptionSigLine(sig)) {
      const withDuration = sig.match(/^(.*?)(?:,\s*)?X\s+(.+)$/i);
      if (withDuration) {
        const before = (withDuration[1] ?? '').trim();
        duration = (withDuration[2] ?? '').trim() || duration;
        const comma = before.indexOf(',');
        if (comma >= 0) {
          dosage = before.slice(0, comma).trim() || dosage;
          frequency = before.slice(comma + 1).trim() || frequency;
        } else if (before) {
          dosage = before;
          frequency = '';
        }
      } else {
        // Freeform TipTap edits (e.g. "one sachet") replace the structured sig.
        dosage = sig;
        frequency = '';
        duration = '';
      }
    }
  }

  return {
    ...med,
    dosage,
    frequency,
    duration,
    instructions,
    originalPrescriber,
    originalPrescriptionDate,
    quantity,
    refills,
    route,
    startDate,
    endDate,
    expiryDate,
  };
}

function isContaminatedPrescriptionSigLine(line: string): boolean {
  const text = line.trim();
  if (!text) return true;
  if (/Patient Instructions:/i.test(text)) return true;
  if (/\bQty:\s*/i.test(text)) return true;
  if (/\bStart:\s*/i.test(text)) return true;
  if (/\bRefills:\s*/i.test(text)) return true;
  if (/^Rx\s*-/i.test(text)) return true;
  if (/\d+[.)]\s*Rx\s*-/i.test(text)) return true;
  return false;
}

/**
 * Apply Notion / TipTap medicationBlock edits onto the structured medications
 * used by the clinical Rx PDF, print, and fax builders.
 */
export function syncPrescriptionMedicationsFromBlock(
  medications: PrescriptionMedication[] | undefined,
  medicationBlock: string | undefined | null,
): PrescriptionMedication[] | undefined {
  if (!medications?.length) return medications;
  const block = (medicationBlock ?? '').trim();
  if (!block) return medications;

  const sections = splitMedicationBlockSections(block);
  if (!sections.length) return medications;

  return medications.map((med, index) => {
    const byIndex = sections[index];
    if (byIndex) return applyMedicationSectionEdits(med, byIndex);

    const titleNeedle = formatPrescriptionRxTitle(med).toLowerCase();
    const brandNeedle = formatPrescriptionRxBrandLine(med).toLowerCase();
    const matched = sections.find((section) => {
      const head = stripMdBold(section.split(/\n/)[0] ?? '').toLowerCase();
      return (
        head.includes(titleNeedle) ||
        head.includes(brandNeedle) ||
        (med.name ? head.includes(med.name.toLowerCase()) : false)
      );
    });
    return matched ? applyMedicationSectionEdits(med, matched) : med;
  });
}

function parseRxHeadline(
  line: string,
): Pick<PrescriptionMedication, 'name' | 'genericName' | 'strength'> {
  const cleaned = stripMdBold(line).replace(/^Rx\s*-\s*/i, '').trim();
  const genericMatch = cleaned.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const head = (genericMatch ? genericMatch[1] : cleaned).trim();
  const generic = genericMatch?.[2]?.trim();
  const strengthMatch = head.match(
    /(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|units?|mmol|meq|%))\s*$/i,
  );
  const strength = strengthMatch?.[1]?.trim();
  const name = strength ? head.slice(0, head.length - strength.length).trim() || head : head;
  return {
    name: name || 'Medication',
    genericName: generic,
    strength,
  };
}

/** Build structured Rx rows from a Prescribe-format medication block (no seed rows required). */
export function medicationsFromMedicationBlock(
  medicationBlock: string | undefined | null,
): PrescriptionMedication[] {
  const sections = splitMedicationBlockSections(medicationBlock ?? '');
  return sections.map((section) => {
    const first = section
      .split(/\n/)
      .map((line) => stripMdBold(line))
      .find(Boolean);
    const seed: PrescriptionMedication = {
      ...parseRxHeadline(first ?? 'Medication'),
      refills: '0',
      quantity: 'As directed',
      substitutions: 'Allowed',
      drugUse: 'As directed',
      compliancePkg: 'No',
      trialDispenses: 'Not Authorized',
    };
    return applyMedicationSectionEdits(seed, section);
  });
}

export function applyPrescriptionEdits(
  existing: PrescriptionDocumentContent | undefined,
  draft: Record<string, string>,
): PrescriptionDocumentContent {
  const medicationBlock =
    draft.medicationBlock?.trim() || existing?.medicationBlock;
  return {
    ...(existing ?? {}),
    diagnosis: draft.diagnosis?.trim() || existing?.diagnosis,
    notes: draft.notes?.trim() || undefined,
    specialInstructions: draft.specialInstructions?.trim() || undefined,
    patientBlock: draft.patientBlock?.trim() || existing?.patientBlock,
    medicationBlock,
    medications: syncPrescriptionMedicationsFromBlock(
      existing?.medications,
      medicationBlock,
    ),
    ...(draft.documentHtml
      ? { documentHtml: draft.documentHtml }
      : {}),
  } as PrescriptionDocumentContent;
}
