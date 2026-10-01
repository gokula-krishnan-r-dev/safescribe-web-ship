/**
 * Step 1 consultation-note extraction + deterministic rendering.
 * Pipeline: transcript → structured clinical extraction → relevance filter → note render.
 * SafeScribe organizes clinically relevant information. The pharmacist owns assessment.
 */

import {
  applyClinicalRelevancePostFilter,
  clinicallyFilterPresentingConcern,
  emptyStructuredExtraction,
  isNonClinicalText,
  looksLikeStructuredExtraction,
  sanitizeStructuredClinicalExtraction,
  stripNonClinicalSentences,
  structuredExtractionHasContent,
  type StructuredClinicalExtraction,
} from './clinical-extraction-structured';

export {
  applyClinicalRelevancePostFilter,
  clinicallyFilterPresentingConcern,
  consultationNoteToPlainText,
  emptyStructuredExtraction,
  isNonClinicalText,
  renderConsultationNoteFromStructured,
  sanitizeStructuredClinicalExtraction,
  stripNonClinicalSentences,
  structuredExtractionHasContent,
  STRUCTURED_EXTRACTION_MAX,
  type ConsultationNote,
  type ConsultationNoteItemType,
  type PatientSex,
  type StructuredClinicalExtraction,
  type StructuredPresentingConcern,
} from './clinical-extraction-structured';

export const CLINICAL_EXTRACTION_SCHEMA_VERSION = 'consultation-intake-1.0';

export type ClinicalItemCategory =
  | 'symptom'
  | 'course'
  | 'relevant_negative'
  | 'medical_condition'
  | 'medication'
  | 'allergy'
  | 'lab'
  | 'vital'
  | 'pregnancy_lactation'
  | 'previous_treatment'
  | 'relevant_social_history'
  | 'other_relevant';

export type Certainty = 'confirmed' | 'uncertain';

export type ClinicallyRelevantReason =
  | 'assessment'
  | 'safety'
  | 'eligibility'
  | 'treatment'
  | 'follow_up'
  | 'documentation';

export type IntakeCaptureMode = 'type' | 'dictation' | 'conversation' | null;

export type NoteReviewStatus = 'empty' | 'draft' | 'review_required' | 'approved';

export type MicSource = 'computer' | 'safescribe_mic';

export type CarryForwardType = 'allergy' | 'medication' | 'condition' | 'lab' | 'vital';

export type CarryForwardConfirmation =
  | 'unconfirmed'
  | 'confirmed'
  | 'rejected'
  | 'edited';

export interface ExtractedClinicalItem {
  id: string;
  category: ClinicalItemCategory;
  text: string;
  normalizedValue?: string;
  certainty: Certainty;
  sourceSpeaker?: 'patient' | 'pharmacist' | 'other';
  sourceStartMs?: number;
  sourceEndMs?: number;
  clinicallyRelevantReason?: ClinicallyRelevantReason;
}

export interface ClinicalExtractionResult {
  presentingConcern: {
    text: string;
    sourceStartMs?: number;
    sourceEndMs?: number;
  } | null;
  relevantClinicalInformation: ExtractedClinicalItem[];
  carryForwardCandidates: {
    allergies: ExtractedClinicalItem[];
    medications: ExtractedClinicalItem[];
    medicalConditions: ExtractedClinicalItem[];
    labs: ExtractedClinicalItem[];
    vitals: ExtractedClinicalItem[];
  };
  extractionStatus: 'complete' | 'needs_review' | 'failed';
}

export interface RenderedConsultationNote {
  presentingConcern: string | null;
  items: ExtractedClinicalItem[];
  chipItems: ExtractedClinicalItem[];
  proseItems: ExtractedClinicalItem[];
  plainText: string;
}

export interface CarryForwardCandidate {
  type: CarryForwardType;
  displayText: string;
  normalizedValue?: string;
  source: 'consultation_extraction';
  confirmationStatus: CarryForwardConfirmation;
}

export interface TemporaryTranscriptTurn {
  speaker: 'patient' | 'pharmacist' | 'other';
  text: string;
  timestamp?: string;
  startMs?: number;
}

export interface ConsultationIntakePayload {
  schemaVersion: string;
  captureMode: IntakeCaptureMode;
  noteReviewStatus: NoteReviewStatus;
  approvedAt?: string;
  approvedBy?: string;
  approvedNoteHash?: string;
  structuredNote?: {
    presentingConcern?: string;
    relevantClinicalInformation: ExtractedClinicalItem[];
  };
  carryForwardCandidates: CarryForwardCandidate[];
  hasTemporaryTranscript: boolean;
  temporaryTranscriptTurns?: TemporaryTranscriptTurn[];
  transcriptDeletedAt?: string | null;
  extractionStatus?: ClinicalExtractionResult['extractionStatus'];
  lastExtractedAt?: string;
  micSource?: MicSource;
  /** Short internal QA labels only — never render in the pharmacist note. */
  excludedNonclinical?: string[];
}

export const SAFETY_CATEGORIES: ClinicalItemCategory[] = [
  'allergy',
  'pregnancy_lactation',
];

export const CHIP_CATEGORIES: ClinicalItemCategory[] = [
  'medical_condition',
  'medication',
  'allergy',
  'lab',
  'vital',
  'pregnancy_lactation',
];

const CATEGORY_ORDER: ClinicalItemCategory[] = [
  'allergy',
  'pregnancy_lactation',
  'medical_condition',
  'medication',
  'lab',
  'vital',
  'previous_treatment',
  'symptom',
  'course',
  'relevant_negative',
  'relevant_social_history',
  'other_relevant',
];

function normalizePhrase(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[•\-\u2013\u2014]\s*/, '')
    .trim();
}

function normalizeKey(value: string): string {
  return normalizePhrase(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

export function isSafetyItem(item: ExtractedClinicalItem): boolean {
  return SAFETY_CATEGORIES.includes(item.category);
}

export function shouldRenderAsChip(item: ExtractedClinicalItem): boolean {
  return CHIP_CATEGORIES.includes(item.category);
}

export function newExtractionItemId(prefix = 'ci'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function dedupeAndPrioritize(
  items: ExtractedClinicalItem[],
): ExtractedClinicalItem[] {
  const seen = new Set<string>();
  const unique: ExtractedClinicalItem[] = [];
  for (const item of items) {
    const text = normalizePhrase(item.text);
    if (!text) continue;
    const key = `${item.category}:${normalizeKey(item.normalizedValue || text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...item, text });
  }
  return unique.sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
}

export function renderConsultationNote(
  result: Pick<ClinicalExtractionResult, 'presentingConcern' | 'relevantClinicalInformation'>,
): RenderedConsultationNote {
  const presentingConcern = result.presentingConcern?.text
    ? clinicallyFilterPresentingConcern(result.presentingConcern.text) || null
    : null;
  const concernKey = presentingConcern ? normalizeKey(presentingConcern) : '';
  const items = dedupeAndPrioritize(result.relevantClinicalInformation).filter((item) => {
    if (isNonClinicalText(item.text)) return false;
    if (!concernKey) return true;
    return normalizeKey(item.text) !== concernKey;
  });
  const chipItems = items.filter(shouldRenderAsChip);
  const proseItems = items.filter((item) => !shouldRenderAsChip(item));

  const lines: string[] = [];
  if (presentingConcern) {
    lines.push('Presenting concern', presentingConcern, '');
  }
  if (items.length) {
    lines.push('Relevant clinical information');
    for (const item of items) {
      lines.push(`• ${item.text}`);
    }
  }

  return {
    presentingConcern,
    items,
    chipItems,
    proseItems,
    plainText: lines.join('\n').trim(),
  };
}

/** Map structured extraction → Step 1 ClinicalExtractionResult (UI / carry-forward). */
export function structuredToClinicalResult(
  extraction: StructuredClinicalExtraction,
): ClinicalExtractionResult {
  const filtered = applyClinicalRelevancePostFilter(extraction);
  const items: ExtractedClinicalItem[] = [];

  const push = (
    category: ClinicalItemCategory,
    text: string,
    reason: ClinicallyRelevantReason,
    certainty: Certainty = 'confirmed',
  ) => {
    const cleaned = normalizePhrase(text);
    if (!cleaned || isNonClinicalText(cleaned)) return;
    items.push({
      id: newExtractionItemId(category.slice(0, 3)),
      category,
      text: cleaned,
      certainty,
      clinicallyRelevantReason: reason,
      normalizedValue: cleaned,
    });
  };

  if (filtered.patient_context.age != null) {
    push('other_relevant', `Age ${filtered.patient_context.age}`, 'assessment');
  }
  if (filtered.patient_context.sex) {
    const sexLabel =
      filtered.patient_context.sex.charAt(0).toUpperCase() + filtered.patient_context.sex.slice(1);
    push('other_relevant', sexLabel, 'assessment');
  }
  for (const condition of filtered.medical_conditions) {
    push('medical_condition', condition, 'safety');
  }
  for (const med of filtered.current_medications) {
    push('medication', med, 'safety');
  }
  for (const allergy of filtered.allergies) {
    push('allergy', allergy, 'safety');
  }
  for (const symptom of filtered.associated_symptoms) {
    push('symptom', symptom, 'assessment');
  }
  for (const negative of filtered.relevant_negatives) {
    push('relevant_negative', negative, 'assessment');
  }
  if (filtered.pregnancy_lactation) {
    push('pregnancy_lactation', filtered.pregnancy_lactation, 'safety');
  }
  for (const history of filtered.relevant_history) {
    push('relevant_social_history', history, 'assessment');
  }
  for (const lab of filtered.labs_vitals) {
    const category: ClinicalItemCategory = /\b(?:bp|blood pressure|hr|heart rate|temp|spo2|weight|bmi)\b/i.test(
      lab,
    )
      ? 'vital'
      : 'lab';
    push(category, lab, 'safety');
  }
  for (const uncertain of filtered.uncertain_clinical_information) {
    push('other_relevant', uncertain, 'documentation', 'uncertain');
  }

  const unique = dedupeAndPrioritize(items);
  const summary = filtered.presenting_concern.summary.trim();

  return {
    presentingConcern: summary ? { text: summary } : null,
    relevantClinicalInformation: unique,
    carryForwardCandidates: {
      allergies: unique.filter((i) => i.category === 'allergy'),
      medications: unique.filter((i) => i.category === 'medication'),
      medicalConditions: unique.filter((i) => i.category === 'medical_condition'),
      labs: unique.filter((i) => i.category === 'lab'),
      vitals: unique.filter((i) => i.category === 'vital'),
    },
    extractionStatus: summary || unique.length ? 'complete' : 'needs_review',
  };
}

/** Convert a Step 1 result into structured form (local / legacy path). */
export function clinicalResultToStructured(
  result: ClinicalExtractionResult,
): StructuredClinicalExtraction {
  const base = emptyStructuredExtraction();
  base.presenting_concern.summary = clinicallyFilterPresentingConcern(
    result.presentingConcern?.text ?? '',
  );

  for (const entry of result.relevantClinicalInformation) {
    const text = normalizePhrase(entry.text);
    if (!text || isNonClinicalText(text)) continue;
    switch (entry.category) {
      case 'medical_condition':
        base.medical_conditions.push(text);
        break;
      case 'medication':
        base.current_medications.push(text);
        break;
      case 'allergy':
        if (entry.certainty === 'uncertain') {
          base.uncertain_clinical_information.push(text);
        } else {
          base.allergies.push(text);
        }
        break;
      case 'symptom':
      case 'course':
        base.associated_symptoms.push(text);
        break;
      case 'relevant_negative':
        base.relevant_negatives.push(text);
        break;
      case 'pregnancy_lactation':
        base.pregnancy_lactation = text;
        break;
      case 'lab':
      case 'vital':
        base.labs_vitals.push(text);
        break;
      case 'previous_treatment':
      case 'relevant_social_history':
        base.relevant_history.push(text);
        break;
      default:
        if (entry.certainty === 'uncertain') {
          base.uncertain_clinical_information.push(text);
        } else if (/^age\s+\d+/i.test(text)) {
          const age = Number(text.replace(/^age\s+/i, '').trim());
          if (Number.isFinite(age)) base.patient_context.age = age;
        } else if (/^(female|male|intersex|unknown)$/i.test(text)) {
          base.patient_context.sex = text.toLowerCase() as StructuredClinicalExtraction['patient_context']['sex'];
        } else {
          base.relevant_history.push(text);
        }
    }
  }

  return applyClinicalRelevancePostFilter(base);
}

/**
 * Choose the consultation-note body after capture/extraction.
 * Prefer structured rendered note. Never paste raw conversational transcript
 * when it still contains non-clinical chatter.
 */
export function resolveRewrittenConsultationNote(input: {
  rewriteNote: boolean;
  sourceTranscript: string;
  renderedPlainText?: string | null;
  itemCount?: number;
  previousNote?: string | null;
}): string {
  const source = input.sourceTranscript.trim();
  const rendered = (input.renderedPlainText ?? '').trim();
  const previous = (input.previousNote ?? '').trim();
  const clinicalSource = stripNonClinicalSentences(source);

  if (!input.rewriteNote) {
    return previous || rendered || clinicalSource;
  }

  const hasStructuredItems = (input.itemCount ?? 0) > 0;
  if (
    rendered &&
    (hasStructuredItems || !source || rendered.length >= Math.ceil(Math.min(source.length, 280) * 0.35))
  ) {
    return rendered;
  }

  // Manual note workflow fallback: clinically filtered source, never raw fluff.
  return clinicalSource || rendered || previous;
}

export function hashConsultationNote(input: {
  presentingConcern?: string | null;
  noteBody?: string | null;
  items?: Array<string | { text: string }>;
}): string {
  const itemText = (input.items ?? [])
    .map((item) => (typeof item === 'string' ? item : item.text))
    .map(normalizeKey)
    .filter(Boolean)
    .join('|');
  const raw = [
    normalizeKey(input.presentingConcern ?? ''),
    normalizeKey(input.noteBody ?? ''),
    itemText,
  ].join('::');
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function parseRenderedConsultationNote(text: string): {
  presentingConcern: string;
  bodyItems: string[];
  remainder: string;
} {
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (!raw) return { presentingConcern: '', bodyItems: [], remainder: '' };

  const concernMatch = raw.match(
    /presenting concern\s*\n+([\s\S]*?)(?=\n\s*relevant clinical information\b|$)/i,
  );
  const relevantMatch = raw.match(/relevant clinical information\s*\n+([\s\S]*)$/i);

  if (!concernMatch && !relevantMatch) {
    return { presentingConcern: '', bodyItems: [], remainder: raw };
  }

  const presentingConcern = normalizePhrase(concernMatch?.[1] ?? '').replace(/^•\s*/, '');
  const relevantBlock = relevantMatch?.[1]?.trim() ?? '';
  const bodyItems = relevantBlock
    .split('\n')
    .map((line) => normalizePhrase(line).replace(/^•\s*/, ''))
    .filter(Boolean);

  return { presentingConcern, bodyItems, remainder: '' };
}

export function carryForwardFromExtraction(
  result: ClinicalExtractionResult,
): CarryForwardCandidate[] {
  const push = (
    items: ExtractedClinicalItem[],
    type: CarryForwardType,
  ): CarryForwardCandidate[] =>
    items.map((item) => ({
      type,
      displayText: item.text,
      normalizedValue: item.normalizedValue,
      source: 'consultation_extraction' as const,
      confirmationStatus: 'unconfirmed' as const,
    }));

  return [
    ...push(result.carryForwardCandidates.allergies, 'allergy'),
    ...push(result.carryForwardCandidates.medications, 'medication'),
    ...push(result.carryForwardCandidates.medicalConditions, 'condition'),
    ...push(result.carryForwardCandidates.labs, 'lab'),
    ...push(result.carryForwardCandidates.vitals, 'vital'),
  ];
}

export function emptyExtractionResult(
  status: ClinicalExtractionResult['extractionStatus'] = 'failed',
): ClinicalExtractionResult {
  return {
    presentingConcern: null,
    relevantClinicalInformation: [],
    carryForwardCandidates: {
      allergies: [],
      medications: [],
      medicalConditions: [],
      labs: [],
      vitals: [],
    },
    extractionStatus: status,
  };
}

export function emptyIntakePayload(): ConsultationIntakePayload {
  return {
    schemaVersion: CLINICAL_EXTRACTION_SCHEMA_VERSION,
    captureMode: null,
    noteReviewStatus: 'empty',
    carryForwardCandidates: [],
    hasTemporaryTranscript: false,
    transcriptDeletedAt: null,
  };
}

export function readConsultationIntake(
  aiAnalysis: unknown,
): ConsultationIntakePayload {
  const raw =
    aiAnalysis && typeof aiAnalysis === 'object'
      ? (aiAnalysis as { consultationIntake?: unknown }).consultationIntake
      : undefined;
  if (!raw || typeof raw !== 'object') return emptyIntakePayload();
  const value = raw as Partial<ConsultationIntakePayload>;
  return {
    ...emptyIntakePayload(),
    ...value,
    schemaVersion: value.schemaVersion || CLINICAL_EXTRACTION_SCHEMA_VERSION,
    carryForwardCandidates: Array.isArray(value.carryForwardCandidates)
      ? value.carryForwardCandidates
      : [],
  };
}

export function mergeConsultationIntake(
  aiAnalysis: unknown,
  next: ConsultationIntakePayload,
): Record<string, unknown> {
  const prev =
    aiAnalysis && typeof aiAnalysis === 'object'
      ? (aiAnalysis as Record<string, unknown>)
      : {};
  return {
    ...prev,
    consultationIntake: next,
  };
}

const SPEAKER_LINE =
  /^(?:(\d{1,2}:\d{2}(?::\d{2})?)\s+)?(pharmacist|patient|clinician|doctor|other)\s*:\s*(.+)$/i;

export function parseSpeakerTurns(transcript: string): TemporaryTranscriptTurn[] {
  const turns: TemporaryTranscriptTurn[] = [];
  for (const rawLine of transcript.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(SPEAKER_LINE);
    if (match) {
      const speakerRaw = match[2]!.toLowerCase();
      const speaker: TemporaryTranscriptTurn['speaker'] =
        speakerRaw === 'patient'
          ? 'patient'
          : speakerRaw === 'other'
            ? 'other'
            : 'pharmacist';
      turns.push({
        speaker,
        text: match[3]!.trim(),
        timestamp: match[1],
      });
      continue;
    }
    turns.push({ speaker: 'other', text: line });
  }
  return turns;
}

function titleCaseClinical(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

function item(
  category: ClinicalItemCategory,
  text: string,
  reason: ClinicallyRelevantReason,
  extra?: Partial<ExtractedClinicalItem>,
): ExtractedClinicalItem {
  return {
    id: extra?.id || newExtractionItemId(category.slice(0, 3)),
    category,
    text: normalizePhrase(text),
    certainty: extra?.certainty ?? 'confirmed',
    clinicallyRelevantReason: reason,
    ...extra,
  };
}

function stripGreeting(text: string): string {
  return text
    .replace(/^(hi|hello|hey|good (?:morning|afternoon|evening))[,!.]?\s+/i, '')
    .replace(/^(i have |i've got |i've had |i am |i'm )/i, '')
    .replace(/\bmy\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[a-z]/, (ch) => ch.toUpperCase());
}

function looksUncertain(text: string): boolean {
  return /\b(i think|not sure|maybe|might|possibly|unsure|i don't know|i do not know)\b/i.test(
    text,
  );
}

/**
 * Deterministic fallback extractor used when the LLM is unavailable.
 * Conservative: extract explicitly supported clinical facts only.
 */
export function extractClinicalNoteLocal(
  transcript: string,
  opts?: { presentingConcern?: string; mode?: IntakeCaptureMode },
): ClinicalExtractionResult {
  const source = transcript.trim();
  if (!source && !opts?.presentingConcern?.trim()) {
    return emptyExtractionResult('failed');
  }

  const turns = parseSpeakerTurns(source);
  const patientText = turns
    .filter((turn) => turn.speaker === 'patient')
    .map((turn) => turn.text)
    .join(' ');
  const allText = turns.length ? turns.map((turn) => turn.text).join(' ') : source;
  const haystack = `${patientText} ${allText}`.replace(/\s+/g, ' ');
  const lower = haystack.toLowerCase();

  const items: ExtractedClinicalItem[] = [];

  let presenting = clinicallyFilterPresentingConcern(opts?.presentingConcern?.trim() || '');
  if (!presenting) {
    const firstPatient = turns.find(
      (turn) =>
        turn.speaker === 'patient' &&
        turn.text.trim() &&
        !isNonClinicalText(turn.text) &&
        !/^(hi|hello|hey|good |i'?m fine|how are you)/i.test(turn.text.trim()),
    );
    if (firstPatient) {
      presenting = clinicallyFilterPresentingConcern(
        stripGreeting(firstPatient.text).replace(/\.$/, ''),
      );
    } else {
      const clinicalLines = source
        .split('\n')
        .map((l) => l.trim())
        .map((line) => line.replace(SPEAKER_LINE, '$3'))
        .filter((line) => line && !isNonClinicalText(line));
      const firstLine = clinicalLines[0] ?? '';
      if (firstLine) {
        presenting = clinicallyFilterPresentingConcern(
          stripGreeting(firstLine).replace(/\.$/, ''),
        );
      }
    }
  }

  const allergyMatch = haystack.match(
    /\b(?:i(?:'m| am)?\s+)?allergic to\s+([a-z0-9][a-z0-9\s/-]{1,40}?)(?:[.!,]|$)/i,
  );
  if (allergyMatch) {
    const allergen = titleCaseClinical(
      normalizePhrase(allergyMatch[1]!).replace(/\s+allergy$/i, ''),
    );
    const idx = allergyMatch.index ?? 0;
    const window = haystack.slice(Math.max(0, idx - 64), idx + allergyMatch[0].length + 64);
    const uncertain = looksUncertain(window);
    items.push(
      item(
        'allergy',
        uncertain ? `Possible ${allergen} allergy — patient uncertain` : `${allergen} allergy`,
        'safety',
        { certainty: uncertain ? 'uncertain' : 'confirmed', normalizedValue: allergen },
      ),
    );
  } else if (/\bno known (?:drug )?allerg(?:y|ies)|nkda|nka\b/i.test(lower)) {
    items.push(item('allergy', 'No known drug allergies', 'safety', { normalizedValue: 'NKDA' }));
  }

  const diabetesMatch = haystack.match(/\b((?:type\s*[12]\s+)?diabet(?:es|ic)(?:\s+mellitus)?)\b/i);
  if (diabetesMatch) {
    const label = /type\s*2/i.test(diabetesMatch[1]!)
      ? 'Type 2 diabetes'
      : /type\s*1/i.test(diabetesMatch[1]!)
        ? 'Type 1 diabetes'
        : 'Diabetes';
    items.push(item('medical_condition', label, 'safety', { normalizedValue: label }));
  }

  const conditionPatterns: Array<[RegExp, string]> = [
    [/\basthma\b/i, 'Asthma'],
    [/\bhypertension\b|\bhigh blood pressure\b/i, 'Hypertension'],
    [/\bckd\b|\bchronic kidney\b|\brenal (?:disease|failure|impairment)\b/i, 'Renal disease'],
    [/\bhepatic|liver (?:disease|failure|impairment)\b/i, 'Hepatic disease'],
  ];
  for (const [pattern, label] of conditionPatterns) {
    if (pattern.test(haystack)) {
      items.push(item('medical_condition', label, 'safety', { normalizedValue: label }));
    }
  }

  const medPatterns = [
    /\bmetformin\b/i,
    /\blisinopril\b/i,
    /\bramipril\b/i,
    /\batlansoprazole\b/i,
    /\bomeprazole\b/i,
    /\bsalbutamol\b/i,
    /\bventolin\b/i,
    /\blevothyroxine\b/i,
    /\batorvastatin\b/i,
    /\bamoxicillin\b/i,
  ];
  const takeMatch = haystack.match(
    /\b(?:i (?:take|am taking|i've been taking)|taking)\s+([a-z][a-z0-9\s-]{1,40}?)(?:[.!,]|$)/i,
  );
  const meds = new Set<string>();
  for (const pattern of medPatterns) {
    const found = haystack.match(pattern);
    if (
      found &&
      !/allerg/i.test(haystack.slice(Math.max(0, (found.index ?? 0) - 24), (found.index ?? 0) + 24))
    ) {
      meds.add(found[0][0]!.toUpperCase() + found[0].slice(1).toLowerCase());
    }
  }
  if (takeMatch) {
    const name = normalizePhrase(takeMatch[1]!).replace(/\b(for|because).*$/i, '');
    if (name && !isNonClinicalText(name) && name.length < 40) {
      meds.add(name[0]!.toUpperCase() + name.slice(1));
    }
  }
  // Do not record amoxicillin as a current medication when mentioned only as an allergy.
  if (/\ballergic to amoxicillin\b/i.test(lower)) {
    meds.delete('Amoxicillin');
  }
  for (const name of meds) {
    items.push(item('medication', name, 'safety', { normalizedValue: name }));
  }

  if (
    /\bno(?:t any)? other (?:associated )?symptoms\b/i.test(lower) ||
    /\bdon'?t have any other symptoms\b/i.test(lower) ||
    /\bno, i don'?t have any other symptoms\b/i.test(lower)
  ) {
    items.push(
      item('relevant_negative', 'No other associated symptoms reported', 'assessment'),
    );
  }

  if (/\bpregnan/i.test(lower) && !/\bnot pregnant|denies pregnancy\b/i.test(lower)) {
    items.push(item('pregnancy_lactation', 'Pregnancy mentioned', 'safety'));
  } else if (/\bbreast.?feed|\blactat\b/i.test(lower)) {
    items.push(item('pregnancy_lactation', 'Lactation mentioned', 'safety'));
  }

  const filtered = items.filter((entry) => !isNonClinicalText(entry.text));
  const unique = dedupeAndPrioritize(filtered);

  const allergies = unique.filter((entry) => entry.category === 'allergy');
  const medications = unique.filter((entry) => entry.category === 'medication');
  const medicalConditions = unique.filter((entry) => entry.category === 'medical_condition');
  const labs = unique.filter((entry) => entry.category === 'lab');
  const vitals = unique.filter((entry) => entry.category === 'vital');

  return {
    presentingConcern: presenting ? { text: presenting.replace(/\.$/, '') } : null,
    relevantClinicalInformation: unique,
    carryForwardCandidates: {
      allergies,
      medications,
      medicalConditions,
      labs,
      vitals,
    },
    extractionStatus: unique.length || presenting ? 'complete' : 'needs_review',
  };
}

const ALLOWED_CATEGORIES = new Set<ClinicalItemCategory>([
  'symptom',
  'course',
  'relevant_negative',
  'medical_condition',
  'medication',
  'allergy',
  'lab',
  'vital',
  'pregnancy_lactation',
  'previous_treatment',
  'relevant_social_history',
  'other_relevant',
]);

function asItem(raw: unknown, index: number): ExtractedClinicalItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const category = String(value.category ?? '') as ClinicalItemCategory;
  const text = normalizePhrase(String(value.text ?? ''));
  if (!text || !ALLOWED_CATEGORIES.has(category)) return null;
  const certainty: Certainty = value.certainty === 'uncertain' ? 'uncertain' : 'confirmed';
  return {
    id: typeof value.id === 'string' && value.id ? value.id : newExtractionItemId(`i${index}`),
    category,
    text,
    normalizedValue:
      typeof value.normalizedValue === 'string' ? value.normalizedValue : undefined,
    certainty,
    sourceSpeaker:
      value.sourceSpeaker === 'patient' ||
      value.sourceSpeaker === 'pharmacist' ||
      value.sourceSpeaker === 'other'
        ? value.sourceSpeaker
        : undefined,
    clinicallyRelevantReason:
      value.clinicallyRelevantReason === 'assessment' ||
      value.clinicallyRelevantReason === 'safety' ||
      value.clinicallyRelevantReason === 'eligibility' ||
      value.clinicallyRelevantReason === 'treatment' ||
      value.clinicallyRelevantReason === 'follow_up' ||
      value.clinicallyRelevantReason === 'documentation'
        ? value.clinicallyRelevantReason
        : undefined,
  };
}

function asItemList(
  raw: unknown,
  fallbackCategory?: ClinicalItemCategory,
): ExtractedClinicalItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return asItem(
          {
            category: fallbackCategory ?? 'other_relevant',
            text: entry,
            certainty: 'confirmed',
          },
          index,
        );
      }
      return asItem(entry, index);
    })
    .filter((entry): entry is ExtractedClinicalItem => Boolean(entry));
}

/** Drop LLM-invented diagnosis fields and coerce to the Step 1 schema. */
export function sanitizeClinicalExtraction(raw: unknown): ClinicalExtractionResult {
  if (!raw || typeof raw !== 'object') return emptyExtractionResult('failed');
  const value = raw as Record<string, unknown>;

  // New structured clinical extraction schema (spec §7).
  if (looksLikeStructuredExtraction(value)) {
    const structured = sanitizeStructuredClinicalExtraction(value);
    if (structured && structuredExtractionHasContent(structured)) {
      return structuredToClinicalResult(structured);
    }
    // Structured payload present but empty/invalid after filter.
    if (structured) {
      return structuredToClinicalResult(structured);
    }
  }

  const concernRaw = value.presentingConcern;
  let presentingConcern: ClinicalExtractionResult['presentingConcern'] = null;
  if (typeof concernRaw === 'string' && concernRaw.trim()) {
    const filtered = clinicallyFilterPresentingConcern(concernRaw);
    if (filtered) presentingConcern = { text: filtered };
  } else if (concernRaw && typeof concernRaw === 'object') {
    const text = clinicallyFilterPresentingConcern(
      String((concernRaw as { text?: unknown }).text ?? ''),
    );
    if (text) presentingConcern = { text };
  }

  const relevant = asItemList(value.relevantClinicalInformation).filter(
    (entry) => !isNonClinicalText(entry.text),
  );
  const carryRaw =
    value.carryForwardCandidates && typeof value.carryForwardCandidates === 'object'
      ? (value.carryForwardCandidates as Record<string, unknown>)
      : {};

  const result: ClinicalExtractionResult = {
    presentingConcern,
    relevantClinicalInformation: dedupeAndPrioritize(relevant),
    carryForwardCandidates: {
      allergies: asItemList(carryRaw.allergies, 'allergy').filter(
        (entry) => !isNonClinicalText(entry.text),
      ),
      medications: asItemList(carryRaw.medications, 'medication').filter(
        (entry) => !isNonClinicalText(entry.text),
      ),
      medicalConditions: asItemList(carryRaw.medicalConditions, 'medical_condition').filter(
        (entry) => !isNonClinicalText(entry.text),
      ),
      labs: asItemList(carryRaw.labs, 'lab').filter((entry) => !isNonClinicalText(entry.text)),
      vitals: asItemList(carryRaw.vitals, 'vital').filter((entry) => !isNonClinicalText(entry.text)),
    },
    extractionStatus:
      value.extractionStatus === 'needs_review' || value.extractionStatus === 'failed'
        ? value.extractionStatus
        : relevant.length || presentingConcern
          ? 'complete'
          : 'needs_review',
  };

  if (!result.carryForwardCandidates.allergies.length) {
    result.carryForwardCandidates.allergies = result.relevantClinicalInformation.filter(
      (item) => item.category === 'allergy',
    );
  }
  if (!result.carryForwardCandidates.medications.length) {
    result.carryForwardCandidates.medications = result.relevantClinicalInformation.filter(
      (item) => item.category === 'medication',
    );
  }
  if (!result.carryForwardCandidates.medicalConditions.length) {
    result.carryForwardCandidates.medicalConditions = result.relevantClinicalInformation.filter(
      (item) => item.category === 'medical_condition',
    );
  }

  return result;
}

export function isIntakeNoteApproved(payload: ConsultationIntakePayload): boolean {
  return payload.noteReviewStatus === 'approved';
}

export function noteStatusAfterEdit(
  previous: ConsultationIntakePayload,
  nextHash: string,
): NoteReviewStatus {
  if (!previous.approvedNoteHash) {
    return nextHash ? 'review_required' : 'draft';
  }
  if (previous.noteReviewStatus === 'approved' && previous.approvedNoteHash !== nextHash) {
    return 'review_required';
  }
  return previous.noteReviewStatus;
}
