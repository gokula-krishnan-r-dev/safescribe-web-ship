/**
 * Shared documentation-encounter helpers for DAP, PCP communication,
 * and Patient Care Summary. The pharmacist-confirmed encounter is the
 * source of truth; the model only word-smiths.
 *
 * Spec: SafeScribe_Three_Documents_Backend_Developer_Instructions.md
 */

export const DAP_CONSENT_SENTENCE =
  'Patient informed consent obtained prior to the pharmacist assessment.';

/** Previous DAP opening copy — stripped so regenerated notes do not duplicate it. */
const LEGACY_DAP_CONSENT_SENTENCES = [
  'Patient consented to the assessment.',
];

export const DAP_CONSENT_SENTENCE_VARIANTS = [
  DAP_CONSENT_SENTENCE,
  ...LEGACY_DAP_CONSENT_SENTENCES,
] as const;

export const DAP_HANDOUT_PROVIDED_SENTENCE = 'Patient education handout provided.';

export const NO_RED_FLAGS_OVERALL =
  'No red flags requiring referral were identified.';

const RECONSTRUCTED_SIG =
  /\btablet\(s\)\b|\bby oral route\b|\bonce daily for \d+\s*days?\b/i;

const AMBIGUOUS_INSTRUCTION =
  /\b(?:apply|use|take|put|place)\s+it\b/i;

export function foldDocumentationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function readConsentObtained(source: {
  consentObtained?: boolean | null;
  demographics?: unknown;
}): boolean {
  if (source.consentObtained === true) return true;
  const demo =
    source.demographics && typeof source.demographics === 'object'
      ? (source.demographics as Record<string, unknown>)
      : null;
  return demo?.patientConsentObtained === true || demo?.consent_obtained === true;
}

export function resolveNoRedFlagsRequiringReferral(redFlags: unknown): boolean {
  const flags = (redFlags ?? {}) as {
    hasRedFlags?: boolean;
    referralSelected?: boolean;
    acknowledgments?: Array<{ answer?: string; action?: string }>;
    screeningAnswers?: Record<string, string>;
  };
  if (flags.referralSelected === true) return false;
  if (flags.hasRedFlags === true) return false;

  const acks = Array.isArray(flags.acknowledgments) ? flags.acknowledgments : [];
  if (acks.some((a) => a.action === 'refer' || String(a.answer).toLowerCase() === 'yes')) {
    return false;
  }

  const answers = flags.screeningAnswers ?? {};
  if (Object.values(answers).some((v) => String(v).toLowerCase() === 'yes')) {
    return false;
  }

  const screened =
    acks.length > 0 ||
    Object.keys(answers).length > 0 ||
    flags.hasRedFlags === false;
  if (!screened) return false;
  return flags.hasRedFlags === false;
}

export function isReconstructedSigText(text: string): boolean {
  return RECONSTRUCTED_SIG.test(text);
}

/** True when a counselling line restates the canonical SIG. */
export function substantiallyDuplicatesSig(
  item: string,
  patientDirections: string,
  displayName?: string,
): boolean {
  const a = foldDocumentationText(item);
  const b = foldDocumentationText(patientDirections.replace(/\.$/, ''));
  if (!a || !b) return false;
  if (isReconstructedSigText(item)) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const withoutName = displayName
    ? foldDocumentationText(item.replace(new RegExp(displayName, 'ig'), ''))
    : a;
  const itemWords = withoutName.split(' ').filter((w) => w.length > 2);
  if (itemWords.length >= 4) {
    const hit = itemWords.filter((w) => b.includes(w)).length;
    if (hit / itemWords.length >= 0.7) return true;
  }
  const tokens = b.split(' ').filter((t) => t.length > 2);
  if (tokens.length >= 6) {
    const overlap = tokens.filter((t) => a.includes(t)).length;
    if (overlap / tokens.length >= 0.85) return true;
  }
  return false;
}

export function stripDuplicateMedicationUse(
  items: string[],
  treatments: Array<{ display_name?: string; patient_directions?: string }>,
): string[] {
  return items.filter((item) => {
    if (isReconstructedSigText(item)) return false;
    return !treatments.some((t) =>
      substantiallyDuplicatesSig(item, t.patient_directions ?? '', t.display_name),
    );
  });
}

export function structuredRegimenConflictsWithDirections(input: {
  patientDirections?: string | null;
  frequency?: string | null;
}): boolean {
  const directions = foldDocumentationText(input.patientDirections ?? '');
  const frequency = foldDocumentationText(input.frequency ?? '');
  if (!directions || !frequency) return false;
  const daily =
    /\b(once daily|daily|qd|every day|q24)\b/.test(frequency) &&
    !/\b(onset|migraine|prn|as needed|if needed)\b/.test(frequency);
  const eventBased = /\b(onset|migraine|if the|as needed|prn)\b/.test(directions);
  return daily && eventBased;
}

function patientContextBlob(demographics: unknown): string {
  const demo =
    demographics && typeof demographics === 'object'
      ? (demographics as Record<string, unknown>)
      : {};
  return foldDocumentationText(
    [
      demo.medicalConditions,
      demo.conditions,
      demo.pregnancyStatus,
      demo.pregnancyAnswer,
      demo.allergies,
      JSON.stringify(demo.allergyEntries ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function patientIsPregnant(demographics: unknown): boolean {
  const demo =
    demographics && typeof demographics === 'object'
      ? (demographics as Record<string, unknown>)
      : {};
  const answer = String(demo.pregnancyAnswer ?? '').trim().toLowerCase();
  if (answer === 'yes' || answer === 'y' || answer === 'true') return true;
  const status = String(demo.pregnancyStatus ?? '').trim().toLowerCase();
  return /pregnan/.test(status) && !/^not\b|^no\b/.test(status);
}

function patientHasRenalImpairment(blob: string): boolean {
  return /\brenal|kidney|ckd|dialysis|egfr|crcl|creatinine clearance\b/.test(blob);
}

function patientHasHepaticImpairment(blob: string): boolean {
  return /\bhepatic|liver|cirrhosis|hepatitis\b/.test(blob);
}

/**
 * Keep only safety findings that actually apply to this patient.
 * Generic untriggered monograph text is dropped.
 */
export function filterPatientSpecificSafetyFindings(
  findings: string[],
  demographics?: unknown,
): string[] {
  const blob = patientContextBlob(demographics);
  const pregnant = patientIsPregnant(demographics);
  const renal = patientHasRenalImpairment(blob);
  const hepatic = patientHasHepaticImpairment(blob);
  const hasAllergy =
    blob.length > 0 &&
    !/\bnkda\b|\bno known allerg/.test(blob) &&
    (/\ballerg/.test(blob) || Boolean(
      demographics &&
        typeof demographics === 'object' &&
        Array.isArray((demographics as { allergyEntries?: unknown[] }).allergyEntries) &&
        ((demographics as { allergyEntries: unknown[] }).allergyEntries?.length ?? 0) > 0,
    ));

  return findings.filter((raw) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return false;
    const folded = foldDocumentationText(text);
    if (/\bpregnan/.test(folded) && !pregnant) return false;
    if (
      /\brenal|kidney|egfr|crcl\b/.test(folded) &&
      !renal
    ) {
      return false;
    }
    if (/\bhepatic|liver\b/.test(folded) && !hepatic) return false;
    if (/\ballerg/.test(folded) && !hasAllergy) return false;
    return true;
  });
}

export function looksLikeDiagnosticSymptom(
  text: string,
  diagnosticSymptoms: string[],
): boolean {
  const folded = foldDocumentationText(text);
  if (/\b(after (starting|using)|relief|side effect|may vary|onset of|treatment)\b/.test(folded)) {
    return false;
  }
  return diagnosticSymptoms.some((symptom) => {
    const key = foldDocumentationText(symptom);
    if (key.length < 4) return false;
    if (folded.includes(key)) return true;
    const words = key.split(' ').filter((w) => w.length > 2);
    return words.length >= 2 && words.every((w) => folded.includes(w));
  });
}

export function restoreAmbiguousPatientInstruction(
  output: string,
  confirmedOriginal: string,
): string {
  const out = output.replace(/\s+/g, ' ').trim();
  const original = confirmedOriginal.replace(/\s+/g, ' ').trim();
  if (!out || !original) return out;
  if (AMBIGUOUS_INSTRUCTION.test(out) && !AMBIGUOUS_INSTRUCTION.test(original)) {
    return original;
  }
  return out;
}

/** Documents that must be drafted by the model (structured clinical prose). */
export const DOCUMENTATION_LLM_DOCUMENT_KEYS = [
  'consultation_note',
  'prescriber_communication',
] as const;

/** Documents assembled from confirmed consultation fields — never sent to an LLM. */
export const DOCUMENTATION_DETERMINISTIC_DOCUMENT_KEYS = [
  'prescription',
  'patient_care_summary',
] as const;

export type DocumentationLlmDocumentKey =
  (typeof DOCUMENTATION_LLM_DOCUMENT_KEYS)[number];

export type DocumentationDeterministicDocumentKey =
  (typeof DOCUMENTATION_DETERMINISTIC_DOCUMENT_KEYS)[number];

export function resolveDocumentationLlmKeys(
  requested?: readonly string[] | null,
): DocumentationLlmDocumentKey[] {
  const allowed = new Set<string>(DOCUMENTATION_LLM_DOCUMENT_KEYS);
  if (requested == null) {
    return [...DOCUMENTATION_LLM_DOCUMENT_KEYS];
  }
  return requested.filter((key): key is DocumentationLlmDocumentKey =>
    allowed.has(key),
  );
}

export function documentationDocumentHasContent(
  doc: unknown,
  key?: string,
): boolean {
  if (!doc || typeof doc !== 'object') return false;
  const rec = doc as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0;
  if (key === 'consultation_note') return text(rec.data) || text(rec.assessment);
  if (key === 'prescriber_communication') {
    return text(rec.assessment) || text(rec.openingSentence) || text(rec.treatment);
  }
  if (key === 'patient_care_summary') {
    return text(rec.treatment) || text(rec.education) || text(rec.followUp);
  }
  if (key === 'prescription') {
    return Array.isArray(rec.medications) && rec.medications.length > 0;
  }
  return Object.values(rec).some((value) => text(value));
}

export function documentationPackageIsReusable(
  existing: unknown,
  sourceHash: string,
  requiredKeys: readonly string[] = DOCUMENTATION_LLM_DOCUMENT_KEYS,
): boolean {
  if (!sourceHash) return false;
  const pkg = existing as {
    sourceHash?: string;
    source_hash?: string;
    documents?: Record<string, unknown>;
  } | null;
  if (!pkg) return false;
  const stored = pkg.sourceHash ?? pkg.source_hash;
  if (!stored || stored !== sourceHash) return false;
  const docs = pkg.documents ?? {};
  return requiredKeys.every((key) =>
    documentationDocumentHasContent(docs[key], key),
  );
}

export function documentationLlmKeysToGenerate(input: {
  requestedDocumentTypes?: readonly string[] | null;
  force?: boolean;
  sourceHash: string;
  existingDocumentation: unknown;
}): DocumentationLlmDocumentKey[] {
  const requested = resolveDocumentationLlmKeys(input.requestedDocumentTypes);
  if (input.force) return requested;
  return requested.filter(
    (key) =>
      !documentationPackageIsReusable(
        input.existingDocumentation,
        input.sourceHash,
        [key],
      ),
  );
}

export function documentationLlmRetryKeys(input: {
  requested: readonly string[];
  consultationNoteNeedsRetry: boolean;
  prescriberCommunicationNeedsRetry: boolean;
}): DocumentationLlmDocumentKey[] {
  const out: DocumentationLlmDocumentKey[] = [];
  if (
    input.requested.includes('consultation_note') &&
    input.consultationNoteNeedsRetry
  ) {
    out.push('consultation_note');
  }
  if (
    input.requested.includes('prescriber_communication') &&
    input.prescriberCommunicationNeedsRetry
  ) {
    out.push('prescriber_communication');
  }
  return out;
}

export function computeDocumentationSourceHash(input: {
  treatments: Array<{ display_name?: string; patient_directions?: string }>;
  assessment?: string | null;
  counselling?: Record<string, string[] | undefined>;
  referralCompleted?: boolean;
  consentObtained?: boolean;
}): string {
  const counselling = Object.entries(input.counselling ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${(v ?? []).join('|')}`);
  const raw = JSON.stringify({
    t: input.treatments.map((x) => `${x.display_name}|${x.patient_directions}`),
    a: input.assessment ?? '',
    c: counselling,
    r: Boolean(input.referralCompleted),
    consent: Boolean(input.consentObtained),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `doc_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function consentSentencePatterns(): readonly string[] {
  return DAP_CONSENT_SENTENCE_VARIANTS;
}

function stripKnownConsentSentences(data: string): string {
  let out = data.trim();
  for (const sentence of consentSentencePatterns()) {
    out = out.replace(new RegExp(`${escapeRegExp(sentence)}\\s*`, 'gi'), '');
  }
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ ]{2,}/g, ' ').trim();
}

/**
 * DAP Data always opens with the canonical consent sentence as its own
 * first paragraph. Idempotent; replaces legacy wording.
 */
export function ensureDapOpeningConsent(data: string): string {
  const rest = stripKnownConsentSentences(data);
  return [DAP_CONSENT_SENTENCE, rest].filter(Boolean).join('\n\n');
}

export function insertConsentSentence(data: string, consentObtained: boolean): string {
  if (!consentObtained) return data;
  return ensureDapOpeningConsent(data);
}

export function stripOverallRedFlagClaim(text: string, confirmed: boolean): string {
  if (confirmed) return text;
  return text
    .replace(/[^.]*no red flags requiring referral[^.]*\.?/gi, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isPcpCommunicationCompleted(documentation: unknown): boolean {
  const docs = (documentation ?? {}) as {
    pcp_communication?: { completed?: boolean };
    pcpSendConfirmed?: boolean;
    pcpCommunicationCompleted?: boolean;
    faxHistory?: Array<{ status?: string }>;
  };
  if (docs.pcp_communication?.completed === true) return true;
  if (docs.pcpSendConfirmed === true) return true;
  if (docs.pcpCommunicationCompleted === true) return true;
  const history = Array.isArray(docs.faxHistory) ? docs.faxHistory : [];
  return history.some((row) => {
    const status = String(row?.status ?? '').toLowerCase();
    return status === 'sent' || status === 'delivered' || status === 'confirmed';
  });
}

export function isPatientHandoutProvided(notes: unknown, documentation?: unknown): boolean {
  const docs = (documentation ?? {}) as {
    patient_handout_provided?: boolean;
    patientHandoutProvided?: boolean;
  };
  if (docs.patient_handout_provided === true || docs.patientHandoutProvided === true) {
    return true;
  }
  const n = (notes ?? {}) as {
    patientHandoutProvided?: boolean;
    patient_handout_provided?: boolean;
    plan?: { patient_handout_provided?: boolean };
  };
  return (
    n.patientHandoutProvided === true ||
    n.patient_handout_provided === true ||
    n.plan?.patient_handout_provided === true
  );
}
