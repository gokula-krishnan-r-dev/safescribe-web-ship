/**
 * SafeScribe Adapt — Adapted Prescription (formal Rx).
 * Deterministic render from the confirmed Step 3 adapted prescription.
 * Same Prescribe clinical Rx template as Renew (patient block + Rx - medication block).
 * No LLM clinical decisions.
 */

import { displayDob } from './referral-letter-document';
import { formatDocumentFaxNumber } from './pcp-communication';
import type {
  AdaptPatientDocumentInfo,
  AdaptStepOne,
  AdaptStepThreeOptionA,
  AdaptStepThreeOptionB,
  AdaptStepTwoOptionA,
  ProposedPrescription,
} from './adapt';
import type { AdaptDapGenerationContext } from './adapt-dap-note';
import { ADAPT_PRESCRIPTION_PROMPT_VERSION } from './adapt-pharmacist-prescription-prompt';

/** Body title matches Prescribe / Renew formal Rx template. */
export const ADAPT_PHARMACIST_PRESCRIPTION_TITLE = 'PRESCRIPTION';
/** Step 4 document card title (customer: Adapted Prescription). */
export const ADAPT_PRESCRIPTION_UI_TITLE = 'Adapted Prescription';
export const ADAPT_PRESCRIPTION_SCHEMA_VERSION = '1';
export { ADAPT_PRESCRIPTION_PROMPT_VERSION };

const ADAPT_TYPE_LABELS: Record<string, string> = {
  dose: 'Dose adjustment',
  dosage_form: 'Dosage form / formulation',
  regimen: 'Regimen / frequency',
  route: 'Route',
  therapeutic_substitution: 'Therapeutic substitution',
  other: 'Other',
};

export interface AdaptPharmacistPrescriptionSource {
  schemaVersion: string;
  workflow: 'ADAPT';
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
  prescription: {
    displayName: string;
    brandName: string | null;
    genericName: string | null;
    strength: string | null;
    dosageForm: string | null;
    route: string | null;
    confirmedSig: string;
    quantityDisplay: string;
    refills: string;
    durationLabel: string | null;
    originalPrescriberName: string | null;
    originalPrescriptionDate: string | null;
  };
  adaptation: {
    adaptationType: string;
    adaptationTypeLabel: string;
    adaptationReasonLabel: string;
  };
  pharmacist: {
    name: string | null;
    licenceNumber: string | null;
  };
  practiceSite: {
    pharmacyName: string | null;
    address: string | null;
    phone: string | null;
    fax: string | null;
  };
  validation: {
    readyForRender: boolean;
    blockingIssues: string[];
  };
}

export interface AdaptPrescriptionBuildInput {
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step3A?: AdaptStepThreeOptionA;
  step3B?: AdaptStepThreeOptionB;
  patientInfo?: Partial<AdaptPatientDocumentInfo>;
  context?: AdaptDapGenerationContext;
}

export function buildAdaptPharmacistPrescriptionSource(
  input: AdaptPrescriptionBuildInput,
): AdaptPharmacistPrescriptionSource {
  const { step1, step2A, step3A, patientInfo, context } = input;
  const prop = step3A?.proposedPrescription;
  const orig = step1.originalPrescription;
  const adaptedAtIso =
    (input.step3B?.confirmedAt || context?.confirmedAt || new Date().toISOString()).slice(0, 10);
  const prescriptionDate = formatRxDate(adaptedAtIso);
  const jurisdiction = (step1.jurisdiction || 'AB').trim().toUpperCase() || 'AB';

  const brand =
    prop?.brandName?.trim() ||
    stripStrengthFromDrugLabel(prop?.drugName, prop?.strength) ||
    prop?.genericName?.trim() ||
    prop?.drugName?.trim() ||
    '';
  const genericRaw = prop?.genericName?.trim() || null;
  const generic =
    genericRaw && genericRaw.toLowerCase() !== brand.toLowerCase() ? genericRaw : null;
  const strength =
    prop?.strength?.trim() ||
    extractStrengthFromLabel(prop?.drugName) ||
    null;
  const dosageForm = prop?.dosageForm?.trim() || null;
  const route = prop?.route?.trim() || null;
  const confirmedSig = prop?.sig?.trim() || '';
  const quantityDisplay = formatQuantityDisplay(prop);
  const refills =
    prop?.refills === null || prop?.refills === undefined || prop?.refills === ''
      ? ''
      : String(prop.refills).trim();

  const adaptType = step1.adaptationType || '';
  const adaptTypeLabel =
    (adaptType ? ADAPT_TYPE_LABELS[adaptType] : '') || adaptType || '';

  const blockingIssues: string[] = [];
  const patientName = sanitizePlaceholder(patientInfo?.name, ['Jane Doe', 'John Doe']);
  if (!patientName) blockingIssues.push('Patient name is required.');
  if (!confirmedSig) blockingIssues.push('Adapted prescription directions (SIG) are required.');
  if (!brand) blockingIssues.push('Adapted medication name is required.');
  if (refills === '') blockingIssues.push('Refills must be confirmed.');
  if (!quantityDisplay) blockingIssues.push('Quantity must be confirmed.');

  return {
    schemaVersion: ADAPT_PRESCRIPTION_SCHEMA_VERSION,
    workflow: 'ADAPT',
    jurisdiction,
    language: 'en-CA',
    promptVersion: ADAPT_PRESCRIPTION_PROMPT_VERSION,
    prescriptionDate,
    prescriptionDateIso: adaptedAtIso,
    patient: {
      fullName: patientName,
      dateOfBirth: sanitizePlaceholder(
        patientInfo?.dateOfBirth || step2A?.demographics?.dateOfBirth,
        ['1958-04-12'],
      ) || null,
      phn: sanitizePlaceholder(patientInfo?.patientId, ['987654321']) || null,
      address: sanitizePlaceholder(patientInfo?.address, ['123 Health Ave']) || null,
      phone:
        formatDocumentFaxNumber(patientInfo?.phone) ||
        sanitizePlaceholder(patientInfo?.phone, ['(403) 555-0199', '4035550199']) ||
        null,
    },
    prescription: {
      displayName: brand || 'Medication',
      brandName: brand || null,
      genericName: generic,
      strength,
      dosageForm,
      route,
      confirmedSig,
      // Never invent quantity/refills — blank stays blank and blocks finalization.
      quantityDisplay,
      refills,
      durationLabel: null,
      originalPrescriberName: orig?.normalized?.prescriberName?.trim() || null,
      originalPrescriptionDate: null,
    },
    adaptation: {
      adaptationType: adaptType,
      adaptationTypeLabel: adaptTypeLabel,
      adaptationReasonLabel: step1.adaptationReason?.label?.trim() || '',
    },
    pharmacist: {
      name: context?.pharmacistName?.trim() || null,
      licenceNumber: context?.pharmacistLicense?.trim() || null,
    },
    practiceSite: {
      pharmacyName: context?.pharmacyName?.trim() || null,
      address: context?.pharmacyAddress?.trim() || null,
      phone: context?.pharmacyPhone?.trim() || null,
      fax: context?.pharmacyFax?.trim() || null,
    },
    validation: {
      readyForRender: blockingIssues.length === 0,
      blockingIssues,
    },
  };
}

/** Compact audit / catalog payload — prescription facts only. */
export function buildAdaptPrescriptionPromptPayload(
  source: AdaptPharmacistPrescriptionSource,
): Record<string, unknown> {
  return {
    sourceModule: source.workflow,
    jurisdiction: source.jurisdiction,
    language: source.language,
    promptVersion: source.promptVersion,
    patient: source.patient,
    prescriptionDate: source.prescriptionDate,
    prescription: {
      name: source.prescription.displayName,
      brandName: source.prescription.brandName,
      genericName: source.prescription.genericName,
      strength: source.prescription.strength,
      dosageForm: source.prescription.dosageForm,
      route: source.prescription.route,
      confirmedSig: source.prescription.confirmedSig,
      quantity: source.prescription.quantityDisplay,
      refills: source.prescription.refills,
      originalPrescriber: source.prescription.originalPrescriberName,
      originalPrescriptionDate: source.prescription.originalPrescriptionDate,
    },
    adaptation: source.adaptation,
    pharmacist: source.pharmacist,
    practiceSite: source.practiceSite,
  };
}

/**
 * Render formal Adapt Rx in the same Prescribe clinical template used by Renew:
 * PRESCRIPTION + patient identity + Rx - medication block.
 */
export function renderAdaptPharmacistPrescription(
  source: AdaptPharmacistPrescriptionSource,
): string {
  const patientBlock = [
    `Name: ${source.patient.fullName || '—'}`,
    `Date of birth: ${
      source.patient.dateOfBirth
        ? displayDob(source.patient.dateOfBirth) || source.patient.dateOfBirth
        : '—'
    }`,
    `PHN: ${source.patient.phn || '—'}`,
    source.patient.address ? `Address: ${source.patient.address}` : null,
    source.patient.phone ? `Phone: ${source.patient.phone}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const medicationBlock = renderPrescribeMedicationBlock(source);
  const notes = buildAdaptationNotes(source);

  return [ADAPT_PHARMACIST_PRESCRIPTION_TITLE, patientBlock, '', medicationBlock, notes ? `\nNotes:\n${notes}` : null]
    .filter((p) => p != null && String(p).trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderAdaptPharmacistPrescriptionHtml(
  source: AdaptPharmacistPrescriptionSource,
): string {
  const plain = renderAdaptPharmacistPrescription(source);
  const patientLines = [
    `Name: ${escapeHtml(source.patient.fullName || '—')}`,
    `Date of birth: ${escapeHtml(
      source.patient.dateOfBirth
        ? displayDob(source.patient.dateOfBirth) || source.patient.dateOfBirth
        : '—',
    )}`,
    `PHN: ${escapeHtml(source.patient.phn || '—')}`,
    source.patient.address ? `Address: ${escapeHtml(source.patient.address)}` : null,
    source.patient.phone ? `Phone: ${escapeHtml(source.patient.phone)}` : null,
  ].filter(Boolean);

  const title = escapeHtml(formatAdaptRxTitle(source));
  const sig = escapeHtml(formatAdaptRxSigLine(source));
  const qtyLine = escapeHtml(
    `Qty: ${source.prescription.quantityDisplay || '—'}  ·  Refills: ${source.prescription.refills || '—'}  ·  Route: ${formatAdaptRoute(source.prescription.route, source.prescription.confirmedSig)}`,
  );
  const start = formatRxDate(source.prescriptionDateIso);
  const expiry = formatRxDate(addCalendarDaysIso(source.prescriptionDateIso, 365));
  const datesLine = escapeHtml(`Start: ${start || '—'}  ·  End: —  ·  Expiry: ${expiry || '—'}`);
  const original = formatOriginalPrescriberLine(source.prescription);
  const notes = buildAdaptationNotes(source);

  const medParts = [
    `<p><strong>${title}</strong></p>`,
    sig ? `<p>${sig}</p>` : '',
    `<p>${qtyLine}</p>`,
    `<p>${datesLine}</p>`,
    original ? `<p>${escapeHtml(original)}</p>` : '',
  ].filter(Boolean);

  return [
    '<div class="prescription-container adapt-prescription-note" data-template="prescribe">',
    `<h2>${escapeHtml(ADAPT_PHARMACIST_PRESCRIPTION_TITLE)}</h2>`,
    '<h2 data-field="patientBlock">Patient details</h2>',
    ...patientLines.map((line) => `<p>${line}</p>`),
    '<h2 data-field="medicationBlock">Medication &amp; directions</h2>',
    ...medParts,
    notes
      ? `<h2 data-field="notes">Notes</h2><p>${escapeHtml(notes)}</p>`
      : '',
    '</div>',
    `<!-- adapt-rx-plain\n${plain.replace(/--/g, '—')}\n-->`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAdaptPharmacistPrescription(input: AdaptPrescriptionBuildInput): {
  source: AdaptPharmacistPrescriptionSource;
  plainText: string;
  html: string;
  warnings: string[];
} {
  const source = buildAdaptPharmacistPrescriptionSource(input);
  const plainText = renderAdaptPharmacistPrescription(source);
  const html = renderAdaptPharmacistPrescriptionHtml(source);
  const warnings = [
    ...source.validation.blockingIssues.map((issue) => `Blocking: ${issue}`),
    ...validateAdaptPharmacistPrescriptionBody(plainText),
  ];
  return { source, plainText, html, warnings };
}

export function validateAdaptPharmacistPrescriptionBody(body: string): string[] {
  const warnings: string[] = [];
  if (/safety engine|\bllm\b|confidence score|drug therapy problem/i.test(body)) {
    warnings.push('Unsupported clinical documentation content on formal prescription');
  }
  if (/please approve|request(?:ing)? approval/i.test(body)) {
    warnings.push('Unsupported approval language on formal prescription');
  }
  if (!/\bRx\s*-/i.test(body)) {
    warnings.push('Missing Prescribe-format Rx title line');
  }
  if (!/^PRESCRIPTION\b/m.test(body)) {
    warnings.push('Missing PRESCRIPTION title');
  }
  return warnings;
}

/** Extract plain Prescribe-format body from Adapt prescription HTML (or return as-is). */
export function adaptPrescriptionBodyFromHtml(htmlOrPlain: string): string {
  const raw = String(htmlOrPlain ?? '').trim();
  if (!raw) return '';
  const comment = raw.match(/<!--\s*adapt-rx-plain\n([\s\S]*?)\n-->/);
  if (comment?.[1]) return comment[1].trim();
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h2>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Prescribe-template helpers (aligned with Renew) ─────────────────────────

function renderPrescribeMedicationBlock(source: AdaptPharmacistPrescriptionSource): string {
  const title = `**${formatAdaptRxTitle(source)}**`;
  const sig = formatAdaptRxSigLine(source);
  const start = formatRxDate(source.prescriptionDateIso);
  const expiry = formatRxDate(addCalendarDaysIso(source.prescriptionDateIso, 365));
  return [
    title,
    sig || null,
    `Qty: ${source.prescription.quantityDisplay?.trim() || '—'}  ·  Refills: ${source.prescription.refills || '—'}  ·  Route: ${formatAdaptRoute(source.prescription.route, source.prescription.confirmedSig)}`,
    `Start: ${start || '—'}  ·  End: —  ·  Expiry: ${expiry || '—'}`,
    formatOriginalPrescriberLine(source.prescription),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatAdaptRxTitle(source: AdaptPharmacistPrescriptionSource): string {
  const brand = (
    source.prescription.brandName ||
    source.prescription.genericName ||
    source.prescription.displayName
  ).trim();
  const strength = source.prescription.strength?.trim();
  const generic = source.prescription.genericName?.trim();
  let line = `Rx - ${brand.toUpperCase()}`;
  if (strength && !brand.toLowerCase().includes(strength.toLowerCase())) {
    line = `${line} ${strength}`;
  }
  if (generic && generic.toLowerCase() !== brand.toLowerCase()) {
    line = `${line} (${generic})`;
  }
  return line;
}

function formatAdaptRxSigLine(source: AdaptPharmacistPrescriptionSource): string {
  const sig = source.prescription.confirmedSig.replace(/[.]+$/, '').trim();
  const duration = source.prescription.durationLabel?.trim();
  if (sig && duration && !/,\s*X\s+/i.test(sig)) return `${sig}, X ${duration}`;
  return sig;
}

function formatAdaptRoute(route: string | null, sig: string): string {
  const raw = route?.trim();
  if (raw) return `${raw.charAt(0).toUpperCase()}${raw.slice(1).toLowerCase()}`;
  if (/\b(?:po|orally|by mouth)\b/i.test(sig)) return 'Oral';
  if (/\binhale|inhalation\b/i.test(sig)) return 'Inhalation';
  if (/\beye|ophthal|drop\b/i.test(sig)) return 'Ophthalmic';
  if (/\btopical|apply\b/i.test(sig)) return 'Topical';
  return '—';
}

function formatOriginalPrescriberLine(ref: {
  originalPrescriberName?: string | null;
  originalPrescriptionDate?: string | null;
}): string | null {
  const name = ref.originalPrescriberName?.trim();
  if (!name) return null;
  const date = ref.originalPrescriptionDate?.trim();
  return date ? `Original Prescriber: ${name}  ·  Date: ${date}` : `Original Prescriber: ${name}`;
}

function buildAdaptationNotes(source: AdaptPharmacistPrescriptionSource): string {
  const bits: string[] = [];
  if (source.pharmacist.name) {
    bits.push(`Adapted by pharmacist: ${source.pharmacist.name}`);
  } else {
    bits.push('Adapted by pharmacist');
  }
  if (source.adaptation.adaptationTypeLabel) {
    bits.push(`Adaptation type: ${source.adaptation.adaptationTypeLabel}`);
  }
  if (source.adaptation.adaptationReasonLabel) {
    bits.push(`Reason: ${source.adaptation.adaptationReasonLabel}`);
  }
  return bits.join('. ') + '.';
}

function formatQuantityDisplay(prop?: ProposedPrescription | null): string {
  if (!prop) return '';
  const qty = prop.quantity;
  if (qty === null || qty === undefined || qty === '') return '';
  const text = String(qty).trim();
  if (!text) return '';
  const unit =
    prop.quantityUnit?.trim() ||
    (() => {
      const form = prop.dosageForm?.trim();
      if (!form) return '';
      if (/tablet/i.test(form)) return 'tablets';
      if (/capsule/i.test(form)) return 'capsules';
      if (/mL|ml|millilitre|milliliter/i.test(form)) return 'mL';
      return form;
    })();
  if (/^\d+(\.\d+)?$/.test(text) && unit) {
    return `${text} ${unit}`;
  }
  return text;
}

/** Prefer a clean brand/generic label without duplicated strength/form suffixes. */
function stripStrengthFromDrugLabel(
  drugName?: string | null,
  strength?: string | null,
): string {
  let label = drugName?.trim() || '';
  if (!label) return '';
  if (strength?.trim()) {
    label = label.replace(new RegExp(`\\b${escapeRegExp(strength.trim())}\\b`, 'i'), '').trim();
  }
  label = label
    .replace(/\b(tablet|capsule|suspension|solution|cream|ointment|gel|inhaler)s?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return label;
}

function extractStrengthFromLabel(drugName?: string | null): string | null {
  const match = String(drugName ?? '').match(
    /(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|units?|mmol|meq|%))\b/i,
  );
  return match?.[1]?.trim() || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatRxDate(isoOrLabel?: string | null): string {
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

function addCalendarDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sanitizePlaceholder(
  value: string | null | undefined,
  placeholders: string[],
): string {
  const text = value?.trim() || '';
  if (!text) return '';
  if (placeholders.some((p) => p.toLowerCase() === text.toLowerCase())) return '';
  return text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
