/**
 * Structured clinical extraction (intake AI) — schema, validation, and clinical-relevance post-filter.
 * Mapping into the pharmacist-facing Step 1 result lives in clinical-extraction.ts.
 */

export const STRUCTURED_EXTRACTION_MAX = {
  presentingSummary: 300,
  listItem: 180,
  uncertainItem: 180,
  excludedLabel: 80,
} as const;

export type PatientSex = 'female' | 'male' | 'intersex' | 'unknown';

export type StructuredPresentingConcern = {
  summary: string;
  symptoms: string[];
  location: string | null;
  onset: string | null;
  duration: string | null;
  severity: string | null;
};

export type StructuredClinicalExtraction = {
  presenting_concern: StructuredPresentingConcern;
  patient_context: {
    age: number | null;
    sex: PatientSex | null;
  };
  medical_conditions: string[];
  current_medications: string[];
  allergies: string[];
  associated_symptoms: string[];
  relevant_negatives: string[];
  pregnancy_lactation: string | null;
  relevant_history: string[];
  labs_vitals: string[];
  uncertain_clinical_information: string[];
  /** Internal QA labels only — never render in the pharmacist note. */
  excluded_nonclinical: string[];
};

export type ConsultationNoteItemType =
  | 'age'
  | 'sex'
  | 'condition'
  | 'medication'
  | 'allergy'
  | 'symptom'
  | 'negative'
  | 'history'
  | 'lab_vital'
  | 'uncertain';

export type ConsultationNote = {
  presentingConcern: string;
  clinicalInformation: Array<{
    type: ConsultationNoteItemType;
    text: string;
  }>;
};

const ALLOWED_SEX = new Set<PatientSex>(['female', 'male', 'intersex', 'unknown']);

/** Obvious non-clinical chatter — secondary safeguard after model extraction. */
const NON_CLINICAL_CONTENT =
  /\b(?:parking|traffic|weather|small talk|joke|joking|housing\s+(?:problem|issue|repair)|house\s+(?:repair|issue|problem|issues)|issues?\s+with\s+the\s+house|work\s+schedule|school\s+logistics|travel\s+logistics|social\s+plans|unrelated\s+family|family\s+reunion|vacation|holiday\s+plans?|how are you|you'?re welcome|thanks(?:\s+a\s+lot)?|thank you|good (?:morning|afternoon|evening)|missed (?:work|school)|not going (?:to school|today)|homework|college|university)\b/i;

/** Keep clinically relevant social determinants even if they mention housing/cost. */
const CLINICAL_SOCIAL_KEEP =
  /\b(?:cannot afford|can'?t afford|unable to afford|cost of (?:the )?med(?:ication)?s?|medication cost|no insurance|uninsured|coverage|copay|co-pay|homeless|housing insecurity|food insecur|unable to pick up|cannot pick up)\b/i;

const MALFORMED_AGE =
  /\bage\s+year\s+for\b|\byear\s+for\s+\d{1,3}\b|\bage\s+for\s+\d{1,3}\b/i;

const TRANSCRIPT_LIKE_MIN = 420;

function normalizePhrase(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[•\-\u2013\u2014]\s*/, '')
    .trim();
}

function clampText(value: string, max: number): string {
  const text = normalizePhrase(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function asStringList(raw: unknown, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const text = clampText(entry, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function asNullableString(raw: unknown, maxLen: number): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const text = clampText(raw, maxLen);
  return text || null;
}

function asAge(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 130) {
    return Math.round(raw);
  }
  if (typeof raw === 'string' && /^\d{1,3}$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (n >= 0 && n <= 130) return n;
  }
  return null;
}

function asSex(raw: unknown): PatientSex | null {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value || value === 'null') return null;
  return ALLOWED_SEX.has(value as PatientSex) ? (value as PatientSex) : null;
}

export function isNonClinicalText(text: string): boolean {
  const value = normalizePhrase(text);
  if (!value) return true;
  if (CLINICAL_SOCIAL_KEEP.test(value)) return false;
  if (MALFORMED_AGE.test(value)) return true;
  return NON_CLINICAL_CONTENT.test(value);
}

/** Split prose into sentence-like units for filtering. */
export function splitClinicalSentences(text: string): string[] {
  return normalizePhrase(text)
    .split(/(?<=[.!?])\s+|(?<=;)\s+|\n+/)
    .map(normalizePhrase)
    .filter(Boolean);
}

/**
 * Remove non-clinical sentences / fragments from free text.
 * Preserves clinically relevant social determinants (e.g. cannot afford medication).
 */
export function stripNonClinicalSentences(text: string): string {
  const parts = splitClinicalSentences(text).filter((part) => !isNonClinicalText(part));
  return parts.join(' ').trim();
}

export function clinicallyFilterPresentingConcern(text: string): string {
  const filtered = stripNonClinicalSentences(text);
  if (!filtered) return '';
  return clampText(
    filtered
      .replace(MALFORMED_AGE, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    STRUCTURED_EXTRACTION_MAX.presentingSummary,
  );
}

export function emptyStructuredExtraction(): StructuredClinicalExtraction {
  return {
    presenting_concern: {
      summary: '',
      symptoms: [],
      location: null,
      onset: null,
      duration: null,
      severity: null,
    },
    patient_context: { age: null, sex: null },
    medical_conditions: [],
    current_medications: [],
    allergies: [],
    associated_symptoms: [],
    relevant_negatives: [],
    pregnancy_lactation: null,
    relevant_history: [],
    labs_vitals: [],
    uncertain_clinical_information: [],
    excluded_nonclinical: [],
  };
}

export function looksLikeStructuredExtraction(raw: Record<string, unknown>): boolean {
  return (
    'presenting_concern' in raw ||
    'medical_conditions' in raw ||
    'current_medications' in raw ||
    'uncertain_clinical_information' in raw ||
    'excluded_nonclinical' in raw ||
    'patient_context' in raw
  );
}

function hasHtmlOrMarkdown(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text) || /(^|\n)\s{0,3}#{1,6}\s|(\*\*|__).+\1/.test(text);
}

function isTranscriptLike(text: string): boolean {
  if (text.length >= TRANSCRIPT_LIKE_MIN) return true;
  const speakerHits = (text.match(/\b(?:patient|pharmacist|doctor|clinician)\s*:/gi) || []).length;
  return speakerHits >= 2;
}

/**
 * Validate and coerce LLM JSON into the structured clinical extraction schema.
 * Returns null when the payload is unusable (caller should retry / fall back).
 */
export function sanitizeStructuredClinicalExtraction(
  raw: unknown,
): StructuredClinicalExtraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!looksLikeStructuredExtraction(value)) return null;

  for (const banned of ['diagnosis', 'differential', 'treatment', 'recommendation', 'plan']) {
    if (banned in value && value[banned] != null && value[banned] !== '') return null;
  }

  const concernRaw =
    value.presenting_concern && typeof value.presenting_concern === 'object'
      ? (value.presenting_concern as Record<string, unknown>)
      : {};
  const contextRaw =
    value.patient_context && typeof value.patient_context === 'object'
      ? (value.patient_context as Record<string, unknown>)
      : {};

  const summaryRaw =
    asNullableString(concernRaw.summary, STRUCTURED_EXTRACTION_MAX.presentingSummary) ?? '';

  if (summaryRaw && (hasHtmlOrMarkdown(summaryRaw) || isTranscriptLike(summaryRaw))) {
    return null;
  }

  const extraction: StructuredClinicalExtraction = {
    presenting_concern: {
      // Leave clinical filtering to applyClinicalRelevancePostFilter so exclusions are recorded.
      summary: summaryRaw,
      symptoms: asStringList(concernRaw.symptoms, STRUCTURED_EXTRACTION_MAX.listItem),
      location: asNullableString(concernRaw.location, STRUCTURED_EXTRACTION_MAX.listItem),
      onset: asNullableString(concernRaw.onset, STRUCTURED_EXTRACTION_MAX.listItem),
      duration: asNullableString(concernRaw.duration, STRUCTURED_EXTRACTION_MAX.listItem),
      severity: asNullableString(concernRaw.severity, STRUCTURED_EXTRACTION_MAX.listItem),
    },
    patient_context: {
      age: asAge(contextRaw.age),
      sex: asSex(contextRaw.sex),
    },
    medical_conditions: asStringList(
      value.medical_conditions,
      STRUCTURED_EXTRACTION_MAX.listItem,
    ),
    current_medications: asStringList(
      value.current_medications,
      STRUCTURED_EXTRACTION_MAX.listItem,
    ),
    allergies: asStringList(value.allergies, STRUCTURED_EXTRACTION_MAX.listItem),
    associated_symptoms: asStringList(
      value.associated_symptoms,
      STRUCTURED_EXTRACTION_MAX.listItem,
    ),
    relevant_negatives: asStringList(
      value.relevant_negatives,
      STRUCTURED_EXTRACTION_MAX.listItem,
    ),
    pregnancy_lactation: asNullableString(
      value.pregnancy_lactation,
      STRUCTURED_EXTRACTION_MAX.listItem,
    ),
    relevant_history: asStringList(value.relevant_history, STRUCTURED_EXTRACTION_MAX.listItem),
    labs_vitals: asStringList(value.labs_vitals, STRUCTURED_EXTRACTION_MAX.listItem),
    uncertain_clinical_information: asStringList(
      value.uncertain_clinical_information,
      STRUCTURED_EXTRACTION_MAX.uncertainItem,
    ),
    excluded_nonclinical: asStringList(
      value.excluded_nonclinical,
      STRUCTURED_EXTRACTION_MAX.excludedLabel,
    ),
  };

  return applyClinicalRelevancePostFilter(extraction);
}

/**
 * Deterministic secondary filter — strips obvious non-clinical leftovers from fields.
 */
export function applyClinicalRelevancePostFilter(
  extraction: StructuredClinicalExtraction,
): StructuredClinicalExtraction {
  const excluded = [...extraction.excluded_nonclinical];
  const pushExcluded = (label: string) => {
    const short = clampText(label, STRUCTURED_EXTRACTION_MAX.excludedLabel);
    if (!short) return;
    if (!excluded.some((e) => e.toLowerCase() === short.toLowerCase())) {
      excluded.push(short);
    }
  };

  const filterList = (items: string[]): string[] => {
    const kept: string[] = [];
    for (const item of items) {
      if (isNonClinicalText(item) || hasHtmlOrMarkdown(item) || isTranscriptLike(item)) {
        if (/\bparking\b/i.test(item)) pushExcluded('parking issue');
        else if (/\bhouse|housing\b/i.test(item)) pushExcluded('unrelated housing discussion');
        else if (/\bwork\b/i.test(item)) pushExcluded('unrelated work discussion');
        else if (/\bschool\b/i.test(item)) pushExcluded('unrelated school discussion');
        else pushExcluded('nonclinical chatter');
        continue;
      }
      kept.push(item);
    }
    return kept;
  };

  const summary = clinicallyFilterPresentingConcern(extraction.presenting_concern.summary);
  if (
    extraction.presenting_concern.summary &&
    summary !== normalizePhrase(extraction.presenting_concern.summary)
  ) {
    if (/\bparking\b/i.test(extraction.presenting_concern.summary)) {
      pushExcluded('parking issue');
    }
    if (/\bhouse|housing\b/i.test(extraction.presenting_concern.summary)) {
      pushExcluded('unrelated housing discussion');
    }
  }

  return {
    ...extraction,
    presenting_concern: {
      ...extraction.presenting_concern,
      summary,
      symptoms: filterList(extraction.presenting_concern.symptoms),
      location:
        extraction.presenting_concern.location &&
        isNonClinicalText(extraction.presenting_concern.location)
          ? null
          : extraction.presenting_concern.location,
    },
    medical_conditions: filterList(extraction.medical_conditions),
    current_medications: filterList(extraction.current_medications),
    allergies: filterList(extraction.allergies),
    associated_symptoms: filterList(extraction.associated_symptoms),
    relevant_negatives: filterList(extraction.relevant_negatives),
    pregnancy_lactation:
      extraction.pregnancy_lactation && isNonClinicalText(extraction.pregnancy_lactation)
        ? null
        : extraction.pregnancy_lactation,
    relevant_history: filterList(extraction.relevant_history),
    labs_vitals: filterList(extraction.labs_vitals),
    uncertain_clinical_information: filterList(extraction.uncertain_clinical_information),
    excluded_nonclinical: excluded.slice(0, 12),
  };
}

/** Spec §10–11 / §23 — render Consultation Note from structured fields only. */
export function renderConsultationNoteFromStructured(
  extraction: StructuredClinicalExtraction,
): ConsultationNote {
  const clinicalInformation: ConsultationNote['clinicalInformation'] = [];

  if (extraction.patient_context.age != null) {
    clinicalInformation.push({ type: 'age', text: `Age ${extraction.patient_context.age}` });
  }
  if (extraction.patient_context.sex) {
    clinicalInformation.push({
      type: 'sex',
      text:
        extraction.patient_context.sex.charAt(0).toUpperCase() +
        extraction.patient_context.sex.slice(1),
    });
  }
  for (const text of extraction.medical_conditions) {
    clinicalInformation.push({ type: 'condition', text });
  }
  for (const text of extraction.current_medications) {
    clinicalInformation.push({ type: 'medication', text });
  }
  for (const text of extraction.allergies) {
    clinicalInformation.push({ type: 'allergy', text });
  }
  for (const text of extraction.associated_symptoms) {
    clinicalInformation.push({ type: 'symptom', text });
  }
  for (const text of extraction.relevant_negatives) {
    clinicalInformation.push({ type: 'negative', text });
  }
  if (extraction.pregnancy_lactation) {
    clinicalInformation.push({ type: 'history', text: extraction.pregnancy_lactation });
  }
  for (const text of extraction.relevant_history) {
    clinicalInformation.push({ type: 'history', text });
  }
  for (const text of extraction.labs_vitals) {
    clinicalInformation.push({ type: 'lab_vital', text });
  }
  for (const text of extraction.uncertain_clinical_information) {
    clinicalInformation.push({ type: 'uncertain', text });
  }

  return {
    presentingConcern: extraction.presenting_concern.summary,
    clinicalInformation,
  };
}

export function structuredExtractionHasContent(
  extraction: StructuredClinicalExtraction,
): boolean {
  return Boolean(
    extraction.presenting_concern.summary.trim() ||
      extraction.medical_conditions.length ||
      extraction.current_medications.length ||
      extraction.allergies.length ||
      extraction.associated_symptoms.length ||
      extraction.relevant_negatives.length ||
      extraction.pregnancy_lactation ||
      extraction.relevant_history.length ||
      extraction.labs_vitals.length ||
      extraction.uncertain_clinical_information.length ||
      extraction.patient_context.age != null ||
      extraction.patient_context.sex,
  );
}

export function consultationNoteToPlainText(note: ConsultationNote): string {
  const lines: string[] = [];
  if (note.presentingConcern.trim()) {
    lines.push('Presenting concern', note.presentingConcern.trim(), '');
  }
  if (note.clinicalInformation.length) {
    lines.push('Relevant clinical information');
    for (const item of note.clinicalInformation) {
      lines.push(`• ${item.text}`);
    }
  }
  return lines.join('\n').trim();
}
