/**
 * Structured referral letter (v3). The application owns letterhead, date,
 * recipient, patient identity, subject, salutation, and signature. Only the
 * reason body and clinical-detail values are pharmacist-editable.
 */

import type { ReferralLetterAiSections, ReferralLetterPayload } from './referral-letter';
import { formatDocumentFaxNumber } from './pcp-communication';

export const REFERRAL_LETTER_DOCUMENT_SCHEMA = 'referral-letter-v3';

export const REFERRAL_LETTER_CLINICAL_DETAIL_ROWS = [
  { key: 'presentingConcern', label: 'Presenting concern' },
  { key: 'onsetAndCourse', label: 'Onset and course' },
  { key: 'relevantFindings', label: 'Relevant findings' },
  { key: 'pertinentNegatives', label: 'Pertinent negatives' },
  { key: 'relevantMedicalHistory', label: 'Relevant medical history' },
  { key: 'currentMedications', label: 'Current medications' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'treatmentToDate', label: 'Treatment/care to date' },
] as const;

export type ReferralLetterClinicalDetailKey =
  (typeof REFERRAL_LETTER_CLINICAL_DETAIL_ROWS)[number]['key'];

export type ReferralLetterClinicalDetails = Record<
  ReferralLetterClinicalDetailKey,
  string | null
> & {
  referralFinding?: string | null;
};

export type ReferralLetterPatientSnapshot = {
  fullName: string;
  dateOfBirth: string;
  healthNumber: string;
  healthNumberNotAvailable: boolean;
};

export type ReferralLetterDocument = {
  schema: typeof REFERRAL_LETTER_DOCUMENT_SCHEMA;
  letterDate: string;
  recipientLine: string;
  subject: string;
  salutation: string;
  reasonForReferral: string;
  clinicalDetails: ReferralLetterClinicalDetails;
  patient: ReferralLetterPatientSnapshot;
  pharmacist: {
    displayName: string;
    credentials: string;
    pharmacyName: string;
    pharmacyAddress: string;
    pharmacyPhone: string | null;
    pharmacyFax: string | null;
    pharmacyLicense: string | null;
  };
  consultationRef: string;
};

const PLACEHOLDER_VALUES = new Set([
  'included when recorded',
  'enter patient’s full name',
  "enter patient's full name",
  'enter phn',
  'dd-mmm-yyyy',
  'not recorded',
  'not recorded in consultation',
]);

function collapse(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.toLowerCase());
}

export function displayDob(raw: string): string {
  const value = collapse(raw);
  if (!value) return '';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = Number(iso[2]);
  if (!month || month > 12) return value;
  return `${iso[3]}-${months[month - 1]}-${iso[1]}`;
}

export function cleanClinicalValue(value: string | null | undefined): string | null {
  const text = collapse(value);
  if (!text || isPlaceholder(text)) return null;
  return text;
}

export function emptyClinicalDetails(): ReferralLetterClinicalDetails {
  return {
    presentingConcern: null,
    onsetAndCourse: null,
    relevantFindings: null,
    pertinentNegatives: null,
    relevantMedicalHistory: null,
    currentMedications: null,
    allergies: null,
    treatmentToDate: null,
    referralFinding: null,
  };
}

const NKDA_RE =
  /^(no known (drug )?allergies|nkda|nka|none( reported)?|no allergies)$/i;
const NO_MEDS_RE =
  /^(none|n\/a|no current medications?|no medications?( reported)?)$/i;
const NO_CONDITIONS_RE =
  /^(none|n\/a|no known conditions|no relevant medical history)$/i;
const SCREENING_PROSE_RE =
  /patient reported after reviewing|differential review acknowledgment|can an appropriate .{0,80}be selected|safely after reviewing|renal function, gastrointestinal and cardiovascular/i;

/** Pathway eligibility / safety-screen dumps — never show these as clinical facts. */
export function isUnwantedClinicalProse(value: string | null | undefined): boolean {
  const text = collapse(value);
  if (!text) return true;
  if (isPlaceholder(text)) return true;
  return SCREENING_PROSE_RE.test(text);
}

function uniqueCollapsed(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = collapse(value);
    if (!text || isUnwantedClinicalProse(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function formatClinicalList(items: string[]): string | null {
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  return items.map((item) => `• ${item}`).join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function factsWithCategory(
  facts: ReferralLetterPayload['confirmed_facts'],
  category: string,
): string[] {
  return uniqueCollapsed(
    facts
      .filter((f) => (f.category ?? '').toUpperCase() === category.toUpperCase())
      .map((f) => f.renderedText),
  );
}

export function referralAllergiesFromDemographics(
  demographics: unknown,
): string | null {
  const demo = asRecord(demographics);
  if (!demo) return null;
  const recorded = collapse(String(demo.allergies ?? ''));
  if (demo.allergiesNone === true || NKDA_RE.test(recorded)) {
    return 'No known drug allergies.';
  }

  const items: string[] = [];
  const entries = Array.isArray(demo.allergyEntries) ? demo.allergyEntries : [];
  for (const raw of entries) {
    const rec = asRecord(raw);
    const drug = collapse(String(rec?.drug ?? rec?.allergen ?? rec?.name ?? ''));
    if (!drug || NKDA_RE.test(drug) || isUnwantedClinicalProse(drug)) continue;
    const reaction = collapse(String(rec?.reaction ?? ''));
    const severity = collapse(String(rec?.severity ?? ''));
    items.push([drug, reaction, severity].filter(Boolean).join(' — '));
  }
  if (items.length) return formatClinicalList(items);

  if (!recorded || isUnwantedClinicalProse(recorded)) return null;
  const parsed = recorded
    .split(/;\s*/)
    .map((part) => {
      const [drug, reaction, severity] = part.split('|').map((s) => collapse(s));
      if (!drug || NKDA_RE.test(drug) || isUnwantedClinicalProse(drug)) return '';
      return [drug, reaction, severity].filter(Boolean).join(' — ');
    })
    .filter(Boolean);
  return formatClinicalList(parsed);
}

export function referralMedicationsFromDemographics(
  demographics: unknown,
): string | null {
  const demo = asRecord(demographics);
  if (!demo) return null;
  const recorded = collapse(String(demo.currentMedications ?? ''));
  if (demo.medsNone === true || NO_MEDS_RE.test(recorded)) {
    return 'No current medications reported.';
  }

  const items: string[] = [];
  const entries = Array.isArray(demo.medicationEntries) ? demo.medicationEntries : [];
  for (const raw of entries) {
    const rec = asRecord(raw);
    const label = collapse(
      String(
        rec?.label ??
          rec?.name ??
          rec?.brandName ??
          rec?.genericName ??
          rec?.drugName ??
          '',
      ),
    );
    if (!label || NO_MEDS_RE.test(label) || isUnwantedClinicalProse(label)) continue;
    const generic = collapse(String(rec?.genericName ?? ''));
    const strength = collapse(String(rec?.strength ?? ''));
    const withGeneric =
      generic && generic.toLowerCase() !== label.toLowerCase()
        ? `${label} (${generic})`
        : label;
    items.push([withGeneric, strength].filter(Boolean).join(' '));
  }
  if (items.length) return formatClinicalList(items);

  if (!recorded || isUnwantedClinicalProse(recorded)) return null;
  const parts = recorded
    .split(/[,;]\s*/)
    .map((part) => collapse(part))
    .filter((part) => part && !NO_MEDS_RE.test(part) && !isUnwantedClinicalProse(part));
  return formatClinicalList(parts);
}

export function referralHistoryFromDemographics(
  demographics: unknown,
): string | null {
  const demo = asRecord(demographics);
  if (!demo) return null;
  const text = collapse(String(demo.medicalConditions ?? ''));
  if (demo.noKnownConditions === true || NO_CONDITIONS_RE.test(text)) {
    return 'No known medical conditions.';
  }
  if (!text) return null;
  const parts = text
    .split(/[,;]\s*/)
    .map((part) => collapse(part))
    .filter((part) => part && !NO_CONDITIONS_RE.test(part));
  return formatClinicalList(parts.length ? parts : [text]);
}

export function overlayClinicalDetailsFromSeed(
  stored: ReferralLetterClinicalDetails,
  seed: ReferralLetterClinicalDetails | null | undefined,
): ReferralLetterClinicalDetails {
  if (!seed) return stored;
  const next = { ...stored };
  const keys: Array<keyof ReferralLetterClinicalDetails> = [
    'presentingConcern',
    'onsetAndCourse',
    'relevantFindings',
    'pertinentNegatives',
    'relevantMedicalHistory',
    'currentMedications',
    'allergies',
    'treatmentToDate',
    'referralFinding',
  ];
  for (const key of keys) {
    const current = next[key];
    const replacement = seed[key] ?? null;
    const fromPatientProfile =
      key === 'allergies' ||
      key === 'currentMedications' ||
      key === 'relevantMedicalHistory';
    if (fromPatientProfile && replacement) {
      next[key] = replacement;
      continue;
    }
    if (isUnwantedClinicalProse(current)) {
      next[key] = replacement;
    }
  }
  return next;
}

export function isValidReferralDob(raw: string): boolean {
  const iso = collapse(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  const today = new Date();
  const todayIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  if (iso > todayIso) return false;
  if (year < 1900) return false;
  return true;
}

export function patientIdentityComplete(
  patient: ReferralLetterPatientSnapshot | null | undefined,
): boolean {
  if (!patient) return false;
  const name = collapse(patient.fullName);
  if (name.length < 1 || name.length > 200 || isPlaceholder(name)) return false;
  if (!isValidReferralDob(patient.dateOfBirth)) return false;
  if (patient.healthNumberNotAvailable) return true;
  const phn = collapse(patient.healthNumber);
  return phn.length >= 3 && !isPlaceholder(phn);
}

export function ageYearsFromIsoDob(iso: string, asOf = new Date()): number | null {
  if (!isValidReferralDob(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number);
  let age = asOf.getFullYear() - year;
  const monthDiff = asOf.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

export function dobConflictsWithRecordedAge(
  isoDob: string,
  recordedAgeYears: number | null | undefined,
): boolean {
  if (recordedAgeYears == null || !Number.isFinite(recordedAgeYears)) return false;
  const calculated = ageYearsFromIsoDob(isoDob);
  if (calculated == null) return false;
  return Math.abs(calculated - recordedAgeYears) > 1;
}

export function pharmacistDisplayName(pharmacist: ReferralLetterDocument['pharmacist']): string {
  const name = collapse(pharmacist.displayName);
  const creds = collapse(pharmacist.credentials);
  if (!name) return creds;
  if (!creds) return name;
  if (name.toLowerCase().includes(creds.toLowerCase())) return name;
  return `${name}, ${creds}`;
}

export function senderIdentityComplete(
  pharmacist: ReferralLetterDocument['pharmacist'] | null | undefined,
): boolean {
  if (!pharmacist) return false;
  return Boolean(collapse(pharmacist.displayName) && collapse(pharmacist.pharmacyName));
}

export function contactLine(phone?: string | null, fax?: string | null): string {
  const parts: string[] = [];
  if (phone) parts.push(`Tel: ${phone}`);
  if (fax) parts.push(`Fax: ${fax}`);
  return parts.join('  |  ');
}

function joinFacts(
  facts: Array<{ id: string; renderedText: string; category?: string; assertion?: string }>,
  matcher: RegExp,
): string | null {
  const values = facts
    .filter((f) => matcher.test(f.id) || matcher.test(f.category ?? ''))
    .map((f) => collapse(f.renderedText))
    .filter((text) => text && !isUnwantedClinicalProse(text));
  return values.length ? values.join('; ') : null;
}

function factsByCategory(
  facts: ReferralLetterPayload['confirmed_facts'],
  category: RegExp,
  assertion?: RegExp,
): string | null {
  const values = facts
    .filter((f) => {
      const cat = `${f.id} ${f.category ?? ''}`;
      if (!category.test(cat)) return false;
      if (assertion && !assertion.test(f.assertion ?? '')) return false;
      return !isUnwantedClinicalProse(f.renderedText);
    })
    .map((f) => collapse(f.renderedText))
    .filter(Boolean);
  return values.length ? values.join('; ') : null;
}

export function clinicalDetailsFromPayload(
  payload: ReferralLetterPayload,
  extras?: ReferralLetterAiSections | null,
): ReferralLetterClinicalDetails {
  const presenting =
    payload.presenting_concern && payload.presenting_concern !== 'Not recorded'
      ? collapse(payload.presenting_concern)
      : '';

  const findingItems = uniqueCollapsed([
    ...payload.confirmed_facts
      .filter((f) => {
        const category = (f.category ?? '').toUpperCase();
        if (category !== 'SYMPTOM' && category !== 'OBSERVATION') return false;
        if (f.assertion === 'ABSENT') return false;
        return true;
      })
      .map((f) => f.renderedText),
    ...(extras?.clinicalContext ?? []),
  ]);

  const onset = factsByCategory(payload.confirmed_facts, /onset|course|duration/i);
  const negatives = uniqueCollapsed(
    payload.confirmed_facts
      .filter(
        (f) =>
          (f.category ?? '').toUpperCase() === 'PERTINENT_NEGATIVE' ||
          f.assertion === 'ABSENT',
      )
      .map((f) => f.renderedText),
  );

  const allergyFacts = factsWithCategory(payload.confirmed_facts, 'ALLERGY');
  const listedAllergies = allergyFacts.filter((item) => !NKDA_RE.test(item));
  const allergyAbsent = payload.confirmed_facts.some(
    (f) =>
      (f.category ?? '').toUpperCase() === 'ALLERGY' &&
      (f.assertion === 'ABSENT' || NKDA_RE.test(collapse(f.renderedText))),
  );
  const allergies =
    formatClinicalList(listedAllergies) ||
    (allergyAbsent ? 'No known drug allergies.' : null);

  const medicationFacts = factsWithCategory(payload.confirmed_facts, 'MEDICATION').filter(
    (item) => !NO_MEDS_RE.test(item),
  );
  const medicationAbsent = payload.confirmed_facts.some(
    (f) =>
      (f.category ?? '').toUpperCase() === 'MEDICATION' &&
      (f.assertion === 'ABSENT' || NO_MEDS_RE.test(collapse(f.renderedText))),
  );
  const currentMedications =
    formatClinicalList(medicationFacts) ||
    (medicationAbsent ? 'No current medications reported.' : null);

  const historyFacts = factsWithCategory(payload.confirmed_facts, 'CONDITION');
  const relevantMedicalHistory =
    formatClinicalList(historyFacts) || joinFacts(payload.confirmed_facts, /^condition-/i);

  const care = uniqueCollapsed(extras?.careProvided ?? []);
  const extra = uniqueCollapsed(extras?.additionalInformation ?? []);
  const note = isUnwantedClinicalProse(payload.additional_note)
    ? ''
    : collapse(payload.additional_note);
  const tried = factsWithCategory(payload.confirmed_facts, 'TREATMENT_TRIED');
  const treatment = uniqueCollapsed([...care, ...tried, note]);
  if (payload.include_prescribing_not_initiated) {
    treatment.push('Pharmacist prescribing was not initiated.');
  }

  return {
    presentingConcern: presenting || null,
    onsetAndCourse: onset && onset !== presenting ? onset : null,
    relevantFindings: findingItems.length ? findingItems.join('; ') : null,
    pertinentNegatives: negatives.length ? negatives.join('; ') : null,
    relevantMedicalHistory,
    currentMedications,
    allergies,
    treatmentToDate: treatment.length ? treatment.join('; ') : extra.length ? extra.join('; ') : null,
    referralFinding: collapse(payload.primary_concern) || null,
  };
}

export function buildReferralLetterDocument(
  payload: ReferralLetterPayload,
  extras?: ReferralLetterAiSections | null,
): ReferralLetterDocument {
  return {
    schema: REFERRAL_LETTER_DOCUMENT_SCHEMA,
    letterDate: payload.letter_date,
    recipientLine: payload.recipient_line,
    subject: payload.subject,
    salutation: payload.salutation || 'Dear Colleague,',
    reasonForReferral: collapse(payload.canonical_reason || payload.reason_for_referral),
    clinicalDetails: clinicalDetailsFromPayload(payload, extras),
    patient: {
      fullName: payload.patient.display_name,
      dateOfBirth: payload.patient.dob_iso,
      healthNumber: payload.patient.health_number,
      healthNumberNotAvailable: payload.patient.health_number_not_available,
    },
    pharmacist: {
      displayName: payload.pharmacist.display_name,
      credentials: payload.pharmacist.credentials,
      pharmacyName: payload.pharmacist.pharmacy_name,
      pharmacyAddress: payload.pharmacist.pharmacy_address,
      pharmacyPhone: payload.pharmacist.pharmacy_phone,
      pharmacyFax: payload.pharmacist.pharmacy_fax,
      pharmacyLicense: payload.pharmacist.pharmacy_license,
    },
    consultationRef: payload.consultation_ref,
  };
}

export function isReferralLetterDocumentJson(raw: string | null | undefined): boolean {
  const text = String(raw ?? '').trim();
  return text.startsWith('{') && text.includes(REFERRAL_LETTER_DOCUMENT_SCHEMA);
}

export function parseReferralLetterDocument(
  raw: string | null | undefined,
): ReferralLetterDocument | null {
  const text = String(raw ?? '').trim();
  if (!isReferralLetterDocumentJson(text)) return null;
  try {
    const rec = JSON.parse(text) as Partial<ReferralLetterDocument>;
    if (rec.schema !== REFERRAL_LETTER_DOCUMENT_SCHEMA) return null;
    if (!rec.reasonForReferral && !rec.subject) return null;
    return {
      schema: REFERRAL_LETTER_DOCUMENT_SCHEMA,
      letterDate: collapse(rec.letterDate),
      recipientLine: collapse(rec.recipientLine),
      subject: collapse(rec.subject),
      salutation: collapse(rec.salutation) || 'Dear Colleague,',
      reasonForReferral: String(rec.reasonForReferral ?? '').trim(),
      clinicalDetails: { ...emptyClinicalDetails(), ...(rec.clinicalDetails ?? {}) },
      patient: {
        fullName: collapse(rec.patient?.fullName),
        dateOfBirth: collapse(rec.patient?.dateOfBirth),
        healthNumber: collapse(rec.patient?.healthNumber),
        healthNumberNotAvailable: rec.patient?.healthNumberNotAvailable === true,
      },
      pharmacist: {
        displayName: collapse(rec.pharmacist?.displayName),
        credentials: collapse(rec.pharmacist?.credentials),
        pharmacyName: collapse(rec.pharmacist?.pharmacyName),
        pharmacyAddress: collapse(rec.pharmacist?.pharmacyAddress),
        pharmacyPhone: rec.pharmacist?.pharmacyPhone?.trim() || null,
        pharmacyFax: rec.pharmacist?.pharmacyFax?.trim() || null,
        pharmacyLicense: rec.pharmacist?.pharmacyLicense?.trim() || null,
      },
      consultationRef: collapse(rec.consultationRef),
    };
  } catch {
    return null;
  }
}

export function serializeReferralLetterDocument(doc: ReferralLetterDocument): string {
  const clinical = emptyClinicalDetails();
  for (const row of REFERRAL_LETTER_CLINICAL_DETAIL_ROWS) {
    const value = cleanClinicalValue(doc.clinicalDetails[row.key]);
    clinical[row.key] = value && !isUnwantedClinicalProse(value) ? value : null;
  }
  const finding = cleanClinicalValue(doc.clinicalDetails.referralFinding);
  clinical.referralFinding = finding && !isUnwantedClinicalProse(finding) ? finding : null;
  const name = collapse(doc.patient.fullName);
  const phn = collapse(doc.patient.healthNumber);
  return JSON.stringify({
    ...doc,
    reasonForReferral: String(doc.reasonForReferral ?? '').trim(),
    clinicalDetails: clinical,
    patient: {
      fullName: name && !isPlaceholder(name) ? name : '',
      dateOfBirth: collapse(doc.patient.dateOfBirth),
      healthNumber:
        doc.patient.healthNumberNotAvailable || isPlaceholder(phn) ? '' : phn,
      healthNumberNotAvailable: doc.patient.healthNumberNotAvailable === true,
    },
  } satisfies ReferralLetterDocument);
}

export function populatedClinicalRows(
  details: ReferralLetterClinicalDetails,
): Array<{ key: ReferralLetterClinicalDetailKey; label: string; value: string }> {
  const rows: Array<{ key: ReferralLetterClinicalDetailKey; label: string; value: string }> = [];
  for (const row of REFERRAL_LETTER_CLINICAL_DETAIL_ROWS) {
    const value = cleanClinicalValue(details[row.key]);
    if (!value || isUnwantedClinicalProse(value)) continue;
    rows.push({ key: row.key, label: row.label, value });
  }
  return rows;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const REASON_HTML_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li']);

function sanitizeReasonHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
      const name = tag.toLowerCase();
      if (!REASON_HTML_TAGS.has(name)) return '';
      if (full.startsWith('</')) return `</${name}>`;
      if (name === 'br') return '<br>';
      const align = String(attrs ?? '').match(/text-align\s*:\s*(left|center|right)/i);
      if (name === 'p' && align) return `<p style="text-align:${align[1].toLowerCase()}">`;
      return `<${name}>`;
    });
}

function reasonToHtml(reason: string): string {
  const raw = String(reason ?? '').trim();
  if (!raw) return '';
  if (/^<(p|div|ul|ol)\b/i.test(raw)) return sanitizeReasonHtml(raw);
  return raw
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.replace(/\s+/g, ' ').trim())}</p>`)
    .join('');
}

export function referralLetterRenderedText(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const doc = parseReferralLetterDocument(text);
  return doc ? referralLetterDocumentToPlainText(doc) : text;
}

export function referralLetterDocumentToPlainText(doc: ReferralLetterDocument): string {
  const lines: string[] = [];
  const pharmacist = pharmacistDisplayName(doc.pharmacist);
  const phone =
    formatDocumentFaxNumber(doc.pharmacist.pharmacyPhone) ??
    collapse(doc.pharmacist.pharmacyPhone);
  const fax =
    formatDocumentFaxNumber(doc.pharmacist.pharmacyFax) ??
    collapse(doc.pharmacist.pharmacyFax);
  if (pharmacist) lines.push(pharmacist);
  if (doc.pharmacist.pharmacyName) lines.push(doc.pharmacist.pharmacyName);
  if (doc.pharmacist.pharmacyAddress) lines.push(doc.pharmacist.pharmacyAddress);
  if (phone) lines.push(`Telephone: ${phone}`);
  if (fax) lines.push(`Fax: ${fax}`);
  if (lines.length) lines.push('');

  if (doc.letterDate) lines.push(`Date: ${doc.letterDate}`);
  if (doc.recipientLine) lines.push(`To: ${doc.recipientLine}`);
  lines.push('');

  const name = cleanClinicalValue(doc.patient.fullName);
  const dob = displayDob(doc.patient.dateOfBirth) || cleanClinicalValue(doc.patient.dateOfBirth);
  const phn = doc.patient.healthNumberNotAvailable
    ? 'Not available'
    : cleanClinicalValue(doc.patient.healthNumber);
  if (name || dob || phn) {
    lines.push('PATIENT INFORMATION');
    if (name) lines.push(`Name: ${name}`);
    if (dob) lines.push(`Date of birth: ${dob}`);
    if (phn) lines.push(`PHN: ${phn}`);
    lines.push('');
  }

  if (doc.subject) lines.push(`Re: ${doc.subject}`);
  lines.push('');
  lines.push(doc.salutation || 'Dear Colleague,');
  lines.push('');
  lines.push('Reason for referral');
  const reason = collapse(doc.reasonForReferral.replace(/<[^>]+>/g, ' '));
  if (reason) lines.push(reason);
  lines.push('');

  const clinical = populatedClinicalRows(doc.clinicalDetails);
  if (clinical.length) {
    lines.push('Relevant clinical information');
    for (const row of clinical) {
      lines.push(`${row.label}: ${row.value}`);
    }
    lines.push('');
  }

  lines.push('Sincerely,');
  lines.push('');
  if (pharmacist) lines.push(pharmacist);
  if (doc.pharmacist.pharmacyName) lines.push(doc.pharmacist.pharmacyName);
  if (phone) lines.push(`Telephone: ${phone}`);
  if (doc.consultationRef) {
    lines.push('');
    lines.push(`Consultation reference: ${doc.consultationRef}`);
  }
  return lines.join('\n').trim();
}

export function referralLetterDocumentToPrintHtml(
  doc: ReferralLetterDocument,
  opts: { draft?: boolean } = {},
): string {
  const pharmacist = pharmacistDisplayName(doc.pharmacist);
  const phone =
    formatDocumentFaxNumber(doc.pharmacist.pharmacyPhone) ??
    collapse(doc.pharmacist.pharmacyPhone);
  const fax =
    formatDocumentFaxNumber(doc.pharmacist.pharmacyFax) ??
    collapse(doc.pharmacist.pharmacyFax);
  const name = cleanClinicalValue(doc.patient.fullName);
  const dob = displayDob(doc.patient.dateOfBirth) || cleanClinicalValue(doc.patient.dateOfBirth);
  const phn = doc.patient.healthNumberNotAvailable
    ? 'Not available'
    : cleanClinicalValue(doc.patient.healthNumber);
  const clinical = populatedClinicalRows(doc.clinicalDetails);
  const reasonHtml = reasonToHtml(doc.reasonForReferral);

  const patientCells = [
    name ? `<div><strong>Name:</strong> ${escapeHtml(name)}</div>` : '',
    dob ? `<div><strong>Date of birth:</strong> ${escapeHtml(dob)}</div>` : '',
    phn ? `<div><strong>PHN:</strong> ${escapeHtml(phn)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const clinicalRows = clinical
    .map(
      (row) =>
        `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');

  return `<article class="ss-referral-letter">
  <header class="ss-letterhead">
    <div class="ss-letterhead-left">
      ${pharmacist ? `<p class="ss-sender-name">${escapeHtml(pharmacist)}</p>` : ''}
      ${doc.pharmacist.pharmacyName ? `<p>${escapeHtml(doc.pharmacist.pharmacyName)}</p>` : ''}
      ${doc.pharmacist.pharmacyAddress ? `<p>${escapeHtml(doc.pharmacist.pharmacyAddress)}</p>` : ''}
      ${phone ? `<p>Telephone: ${escapeHtml(phone)}</p>` : ''}
      ${fax ? `<p>Fax: ${escapeHtml(fax)}</p>` : ''}
    </div>
    <p class="ss-confidential">CONFIDENTIAL CLINICAL COMMUNICATION</p>
  </header>
  ${opts.draft ? '<p class="ss-draft-mark">DRAFT — NOT APPROVED</p>' : ''}
  <section class="ss-meta">
    ${doc.letterDate ? `<p><strong>Date:</strong> ${escapeHtml(doc.letterDate)}</p>` : ''}
    ${doc.recipientLine ? `<p><strong>To:</strong> ${escapeHtml(doc.recipientLine)}</p>` : ''}
  </section>
  ${
    patientCells
      ? `<p class="ss-patient-title">PATIENT INFORMATION</p><section class="ss-patient">${patientCells}</section>`
      : ''
  }
  ${doc.subject ? `<p class="ss-subject"><strong>Re: ${escapeHtml(doc.subject)}</strong></p>` : ''}
  <p>${escapeHtml(doc.salutation || 'Dear Colleague,')}</p>
  <h2>Reason for referral</h2>
  ${reasonHtml}
  ${
    clinicalRows
      ? `<h2>Relevant clinical information</h2><table class="ss-clinical">${clinicalRows}</table>`
      : ''
  }
  <p class="ss-close">Sincerely,</p>
  ${pharmacist ? `<p class="ss-sender-name">${escapeHtml(pharmacist)}</p>` : ''}
  ${doc.pharmacist.pharmacyName ? `<p>${escapeHtml(doc.pharmacist.pharmacyName)}</p>` : ''}
  ${phone ? `<p>Telephone: ${escapeHtml(phone)}</p>` : ''}
  ${
    doc.consultationRef
      ? `<footer class="ss-letter-footer"><span>Consultation reference: ${escapeHtml(doc.consultationRef)}</span><span>Page 1 of 1</span></footer>`
      : ''
  }
  <p class="ss-legal">This document contains confidential health information and is intended only for the named recipient.</p>
</article>`;
}

export const REFERRAL_LETTER_PRINT_CSS = `
  @page{size:Letter;margin:14mm}
  html,body{background:#fff;margin:0}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;line-height:1.45;font-size:11.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ss-letterhead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0f766e;padding-bottom:12px;margin-bottom:16px}
  .ss-letterhead p{margin:0 0 2px}
  .ss-sender-name{font-weight:700;margin:0 0 2px}
  .ss-confidential{font-size:9pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0;text-align:right;max-width:42%}
  .ss-draft-mark{text-align:center;letter-spacing:.12em;font-size:9.5pt;margin:0 0 12px}
  .ss-meta p{margin:0 0 4px}
  .ss-patient-title{font-weight:700;letter-spacing:.08em;font-size:9.5pt;margin:16px 0 8px}
  .ss-patient{display:flex;flex-wrap:wrap;gap:8px 28px;background:#f5f6f7;border:1px solid #d9dee3;border-radius:10px;padding:10px 14px;margin:0 0 16px}
  .ss-subject{margin:16px 0 10px}
  h2{font-size:11.5pt;margin:18px 0 8px}
  p{margin:0 0 8px}
  .ss-clinical{width:100%;border-collapse:collapse;margin-top:4px}
  .ss-clinical th{width:34%;text-align:left;vertical-align:top;padding:8px 16px 8px 0;font-weight:700}
  .ss-clinical td{vertical-align:top;padding:8px 0;white-space:pre-line}
  .ss-close{margin-top:22px}
  .ss-letter-footer{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #d5dee1;margin-top:28px;padding-top:8px;font-size:9pt;color:#4b5563}
  .ss-legal{margin-top:10px;text-align:center;font-size:8.5pt;color:#6b7280}
`;

/** Complete HTML document for iframe / native print (no popup). */
export function buildReferralLetterPrintDocument(
  doc: ReferralLetterDocument,
  opts: { draft?: boolean } = {},
): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Referral letter</title><style>${REFERRAL_LETTER_PRINT_CSS}</style></head><body>${referralLetterDocumentToPrintHtml(doc, opts)}</body></html>`;
}
