import type { AiExtractedEntity, Demographics, ClinicalQuestion, QuestionResponse } from './types';
import {
  computeBmiKgCm,
  extractVitalsFromTranscript,
  formatBmi,
  parseNumericInput,
  demographicsAgeFromDob,
} from '@safescript/shared';
import { isPlaceholderClinicalValue } from './medication-utils';

/** Shared display threshold for marking AI-answered clinical findings */
export const CONFIDENCE_THRESHOLD = 60;

const NKDA_SENTINELS = new Set([
  'no known allergies',
  'nkda',
  'nka',
  'none reported',
  'none',
  'no allergies',
  'no known drug allergies',
]);

export function isNkdaText(value?: string | null): boolean {
  if (!value?.trim()) return false;
  return NKDA_SENTINELS.has(value.trim().toLowerCase());
}

export function normalizeAllergyAllergen(allergen: string): string {
  return isNkdaText(allergen) ? 'No known allergies' : allergen;
}

/** Normalize AI / free-text sex values to UI option labels */
export function normalizeSex(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim().toLowerCase();
  if (['m', 'male', 'man', 'boy', 'gentleman'].includes(s)) return 'Male';
  if (['f', 'female', 'woman', 'girl', 'lady'].includes(s)) return 'Female';
  if (['other', 'o', 'x', 'non-binary', 'nonbinary', 'unspecified'].includes(s)) return 'Other';
  if (s === 'male' || s.startsWith('male')) return 'Male';
  if (s === 'female' || s.startsWith('female')) return 'Female';
  return undefined;
}

/**
 * Infer sex from pronouns and clinical cues in the transcript.
 * "he/him" → Male; "she/her" or pregnant/breastfeeding → Female.
 */
export function inferSexFromTranscript(transcript: string): string | undefined {
  if (!transcript.trim()) return undefined;
  const lower = transcript.toLowerCase();

  if (
    /\b(?:sex|gender)\s*(?:is|:)?\s*female\b/i.test(transcript) ||
    /\b(?:a|an)\s+female\b/i.test(lower) ||
    /\bfemale\b/i.test(lower)
  ) {
    return 'Female';
  }
  if (
    (/\b(?:sex|gender)\s*(?:is|:)?\s*male\b/i.test(transcript) ||
      /\b(?:a|an)\s+male\b/i.test(lower) ||
      /\bmale\b/i.test(lower)) &&
    !/\bfemale\b/i.test(lower)
  ) {
    return 'Male';
  }

  // Pregnancy / breastfeeding implies female
  const deniesPregnancy = /\bnot pregnant|non.?pregnant|denies pregnancy|no pregnancy\b/i.test(lower);
  if (!deniesPregnancy && /\bpregnan/i.test(lower)) return 'Female';
  if (/\bbreast.?feed|\blactat|\bnursing\b/i.test(lower)) return 'Female';

  const hasHe = /\b(?:he|him)\b/i.test(transcript);
  const hasShe = /\b(?:she|her)\b/i.test(transcript);
  if (hasHe && !hasShe) return 'Male';
  if (hasShe && !hasHe) return 'Female';
  return undefined;
}

/** Map AI / transcript pregnancy signals to UI option values */
export function mapPregnancyStatus(
  pregnant: boolean | undefined,
  transcript = '',
  sex?: string,
): string | undefined {
  if (sex === 'Male') return '';

  const lower = transcript.toLowerCase();
  if (/\bbreast.?feed|\blactat|\bnursing\b/i.test(lower)) return 'Breastfeeding';
  if (/\bnot pregnant|non.?pregnant|denies pregnancy|no pregnancy\b/i.test(lower)) {
    return 'Not pregnant';
  }
  if (pregnant === true || /\bpregnan/i.test(lower)) return 'Pregnant';
  if (pregnant === false) return 'Not pregnant';
  return undefined;
}

function normalizeClinicalLabel(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Canonical drug name fixes for common speech/typo variants */
const DRUG_NAME_FIXES: Array<[RegExp, string]> = [
  [/\bamox(?:i|y)?(?:cill?in|lien|lin|line|cillan)\b/gi, 'amoxicillin'],
  [/\bnovamoxin\b/gi, 'amoxicillin'],
  [/\bpenicillin\b/gi, 'penicillin'],
];

export function canonicalizeDrugName(name: string): string {
  let out = name.trim();
  for (const [pattern, replacement] of DRUG_NAME_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * True when the transcript clearly states the patient is taking / on / prescribed
 * this medicine. Mere name mentions (e.g. allergy context) do NOT count.
 */
export function isExplicitlyTakingMedication(transcript: string, drugName: string): boolean {
  const drug = canonicalizeDrugName(drugName);
  if (!transcript.trim() || drug.length < 3) return false;
  const escaped = escapeRegExp(drug);
  const patterns = [
    new RegExp(
      `\\b(?:currently\\s+)?(?:taking|takes|take|took|using|uses|prescribed|started|continues?\\s+on)\\s+[^.!?]{0,60}\\b${escaped}\\b`,
      'i',
    ),
    // "is on metformin" — exclude "on the/a/an …"
    new RegExp(
      `\\b(?:is|are|was|were|currently)\\s+on\\s+(?!the\\b|a\\b|an\\b|his\\b|her\\b|their\\b)[^.!?]{0,40}\\b${escaped}\\b`,
      'i',
    ),
    new RegExp(
      `\\b${escaped}\\b[^.!?]{0,40}\\b(?:daily|od|bid|tid|qid|prn|once|twice|\\d+(?:\\.\\d+)?\\s*(?:mg|mcg|g|ml|iu)|units?)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:current\\s+)?(?:medications?|meds|medicines?)\\s*[:\\-][^.!?]{0,100}\\b${escaped}\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:medications?|meds|medicines?)\\s+(?:include|are|is)\\s+[^.!?]{0,100}\\b${escaped}\\b`,
      'i',
    ),
  ];
  return patterns.some((p) => p.test(transcript));
}

/** True when drug appears only as an allergen / intolerance, not as therapy. */
export function isAllergyOnlyDrugMention(transcript: string, drugName: string): boolean {
  const drug = canonicalizeDrugName(drugName);
  if (!transcript.trim() || drug.length < 3) return false;
  if (isExplicitlyTakingMedication(transcript, drug)) return false;
  const escaped = escapeRegExp(drug);
  return new RegExp(
    `\\b(?:allergic\\s+to|allergy\\s+to|allergies?(?:\\s+to|:)?|hypersensitiv(?:e|ity)\\s+to|intoleran(?:t|ce)\\s+to|cannot\\s+take|can't\\s+take|avoid(?:s|ing)?|reacts?\\s+to)\\s+[^.!?]{0,80}\\b${escaped}\\b`,
    'i',
  ).test(transcript);
}

const LAB_TEST_PATTERNS: Array<{
  re: RegExp;
  test: string;
  defaultUnit?: string;
}> = [
  {
    re: /\b(?:e\s*gfr|egfr|estimated\s+(?:glomerular\s+filtration\s+rate|gfr))\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mL\/min(?:\/1\.73\s*m²?)?|ml\/min)?/gi,
    test: 'eGFR',
    defaultUnit: 'mL/min',
  },
  {
    re: /\b(?:hba1c|hb\s*a1c|a1c)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(%|percent)?/gi,
    test: 'HbA1c',
    defaultUnit: '%',
  },
  {
    re: /\b(?:serum\s+)?creatinine\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(µmol\/L|umol\/L|mg\/dL)?/gi,
    test: 'Creatinine',
  },
  {
    re: /\b(?:inr)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)/gi,
    test: 'INR',
  },
  {
    re: /\b(?:potassium|k\+)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mmol\/L|mEq\/L)?/gi,
    test: 'Potassium',
  },
  {
    re: /\b(?:sodium|na\+)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mmol\/L|mEq\/L)?/gi,
    test: 'Sodium',
  },
  {
    re: /\b(?:hemoglobin|haemoglobin|hb)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(g\/L|g\/dL)?/gi,
    test: 'Hemoglobin',
  },
  {
    re: /\b(?:ldl(?:-?c)?)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mmol\/L|mg\/dL)?/gi,
    test: 'LDL',
  },
  {
    re: /\b(?:hdl(?:-?c)?)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mmol\/L|mg\/dL)?/gi,
    test: 'HDL',
  },
  {
    re: /\b(?:tsh)\s*(?:is|of|for|:|=)?\s*(\d+(?:\.\d+)?)\s*(mIU\/L|mU\/L)?/gi,
    test: 'TSH',
  },
];

const LAB_LIKE_CONDITION =
  /\b(?:e\s*gfr|egfr|hba1c|hb\s*a1c|\ba1c\b|creatinine|inr|potassium|sodium|hemoglobin|haemoglobin|\bh[bg]\b|ldl|hdl|triglyceride|tsh|alt|ast|bilirubin|crp|wbc|platelet|bun|urea)\b/i;

/** True when a "condition" label is actually a lab result (e.g. "eGFR 25"). */
export function isLabLikeCondition(label: string): boolean {
  const norm = normalizeClinicalLabel(label);
  if (!norm) return false;
  if (LAB_LIKE_CONDITION.test(norm)) return true;
  // Compact forms: "egfr25", "hba1c72"
  return /^(egfr|hba1c|a1c|creatinine|inr)\s*\d/.test(norm.replace(/\s+/g, ''));
}

export function extractLabValuesLocal(
  transcript: string,
): NonNullable<AiExtractedEntity['labValues']> {
  if (!transcript.trim()) return [];
  const found: NonNullable<AiExtractedEntity['labValues']> = [];
  const seen = new Set<string>();

  for (const { re, test, defaultUnit } of LAB_TEST_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(transcript)) !== null) {
      const value = match[1]?.trim();
      if (!value) continue;
      const unit = (match[2] || defaultUnit || '').trim() || undefined;
      const key = `${test.toLowerCase()}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ test, value, unit, confidence: 88 });
    }
  }
  return found;
}

function labFromConditionLabel(
  label: string,
): { test: string; value: string; unit?: string; confidence: number } | null {
  const local = extractLabValuesLocal(label);
  if (local[0]) return local[0];
  if (!isLabLikeCondition(label)) return null;
  const valueMatch = label.match(/(\d+(?:\.\d+)?)/);
  const testMatch = label.match(
    /\b(e\s*gfr|egfr|hba1c|hb\s*a1c|a1c|creatinine|inr|potassium|sodium|hemoglobin|haemoglobin|ldl|hdl|tsh)\b/i,
  );
  if (!testMatch || !valueMatch) return null;
  const raw = testMatch[1].toLowerCase().replace(/\s+/g, '');
  let test = testMatch[1];
  let unit: string | undefined;
  if (raw.includes('egfr')) {
    test = 'eGFR';
    unit = 'mL/min';
  } else if (raw.includes('hba1c') || raw === 'a1c') {
    test = 'HbA1c';
    unit = '%';
  } else if (raw.includes('creat')) test = 'Creatinine';
  else if (raw === 'inr') test = 'INR';
  else if (raw.includes('potassium')) test = 'Potassium';
  else if (raw.includes('sodium')) test = 'Sodium';
  else if (raw.includes('haemoglobin') || raw.includes('hemoglobin')) test = 'Hemoglobin';
  else if (raw === 'ldl') test = 'LDL';
  else if (raw === 'hdl') test = 'HDL';
  else if (raw === 'tsh') test = 'TSH';
  return { test, value: valueMatch[1], unit, confidence: 84 };
}

/**
 * Past medical history only — drop conditions that are really the current
 * presenting complaint / acute symptoms (e.g. "cold" when chief is cold sore),
 * or lab values mistakenly filed as history (e.g. "eGFR 25").
 */
export function filterPastMedicalConditions(
  conditions: Array<{ condition: string; confidence?: number }> | undefined,
  symptoms?: Array<{ symptom: string }> | null,
  chiefComplaint?: string | null,
): Array<{ condition: string; confidence: number }> {
  if (!conditions?.length) return [];

  const symptomNorms = (symptoms ?? [])
    .map((s) => normalizeClinicalLabel(s.symptom))
    .filter(Boolean);
  const chiefNorm = normalizeClinicalLabel(chiefComplaint);
  const presentingBag = [chiefNorm, ...symptomNorms].filter(Boolean);

  return conditions
    .map((c) => ({
      condition: c.condition.trim(),
      confidence: c.confidence ?? 70,
    }))
    .filter((c) => {
      const norm = normalizeClinicalLabel(c.condition);
      if (!norm || norm.length < 2) return false;
      if (isLabLikeCondition(c.condition)) return false;

      for (const presenting of presentingBag) {
        if (!presenting) continue;
        if (norm === presenting) return false;
        // Short label fully contained in presenting ("cold" ⊂ "cold sore")
        if (presenting.includes(norm) && norm.length < presenting.length) return false;
        const condTokens = norm.split(' ').filter((t) => t.length > 2);
        const presentTokens = new Set(presenting.split(' ').filter((t) => t.length > 2));
        // Single-word history that is just a presenting token
        if (condTokens.length === 1 && presentTokens.has(condTokens[0])) return false;
      }
      return true;
    });
}

/**
 * Production guardrails for AI + local extraction:
 * - medications only when explicitly taking (never allergy-only mentions)
 * - lab markers → labValues, never medical history
 */
export function sanitizeExtractedEntities(
  entities: Partial<AiExtractedEntity> | null | undefined,
  transcript: string,
): Partial<AiExtractedEntity> {
  const src = entities ?? {};
  const localLabs = extractLabValuesLocal(transcript);

  const allergyNames = new Set(
    (src.allergies ?? [])
      .map((a) => normalizeClinicalLabel(canonicalizeDrugName(a.allergen)))
      .filter(Boolean),
  );

  const medications = (src.medications ?? [])
    .map((m) => ({
      ...m,
      name: canonicalizeDrugName(m.name),
      confidence: m.confidence ?? 70,
    }))
    .filter((m) => {
      if (!m.name || m.name.length < 2) return false;
      if (isAllergyOnlyDrugMention(transcript, m.name)) return false;
      const norm = normalizeClinicalLabel(m.name);
      if (allergyNames.has(norm) && !isExplicitlyTakingMedication(transcript, m.name)) {
        return false;
      }
      // Require explicit "taking / on / prescribed / current meds" evidence in transcript
      if (transcript.trim() && !isExplicitlyTakingMedication(transcript, m.name)) {
        return false;
      }
      return true;
    });

  const labValues: NonNullable<AiExtractedEntity['labValues']> = [];
  const labSeen = new Set<string>();
  const pushLab = (lab: { test: string; value: string; unit?: string; confidence?: number }) => {
    const key = `${lab.test.toLowerCase()}:${lab.value}`;
    if (labSeen.has(key)) return;
    labSeen.add(key);
    labValues.push({
      test: lab.test,
      value: lab.value,
      unit: lab.unit,
      confidence: lab.confidence ?? 85,
    });
  };

  for (const lab of src.labValues ?? []) {
    if (lab?.test && lab?.value != null && String(lab.value).trim()) {
      pushLab({
        test: lab.test,
        value: String(lab.value).trim(),
        unit: lab.unit,
        confidence: lab.confidence,
      });
    }
  }
  for (const lab of localLabs) pushLab(lab);

  const keptConditions: Array<{ condition: string; confidence: number }> = [];
  for (const c of src.conditions ?? []) {
    const label = (c.condition ?? '').trim();
    if (!label) continue;
    if (isLabLikeCondition(label)) {
      const asLab = labFromConditionLabel(label);
      if (asLab) pushLab(asLab);
      continue;
    }
    keptConditions.push({ condition: label, confidence: c.confidence ?? 70 });
  }

  const pastConditions = filterPastMedicalConditions(
    keptConditions,
    src.symptoms,
    src.chiefComplaint,
  );

  return {
    ...src,
    medications,
    conditions: pastConditions,
    labValues,
  };
}

function mapSmokingStatus(raw?: string, transcript = ''): string | undefined {
  const src = `${raw ?? ''} ${transcript}`.toLowerCase();
  if (/\bnever smoked|non.?smoker|does not smoke|doesn't smoke|no smoking\b/i.test(src)) {
    return 'Never';
  }
  if (/\bformer smoker|ex.?smoker|quit smoking|used to smoke\b/i.test(src)) return 'Former';
  if (/\bcurrent smoker|smokes|smoking daily|pack.?year\b/i.test(src)) return 'Current';
  if (/^never$/i.test(raw ?? '')) return 'Never';
  if (/^former$/i.test(raw ?? '')) return 'Former';
  if (/^current$/i.test(raw ?? '')) return 'Current';
  return raw?.trim() || undefined;
}

function mapAlcoholUse(raw?: string, transcript = ''): string | undefined {
  const src = `${raw ?? ''} ${transcript}`.toLowerCase();
  if (/\bno alcohol|does not drink|doesn't drink|nondrinker|non.?drinker|alcohol.?free\b/i.test(src)) {
    return 'None';
  }
  if (/\boccasional|social drinker|rarely drinks\b/i.test(src)) return 'Occasional';
  if (/\bweekly|a few times a week\b/i.test(src)) return 'Weekly';
  if (/\bdaily drinker|drinks daily\b/i.test(src)) return 'Daily';
  if (/^(none|occasional|weekly|daily)$/i.test(raw ?? '')) {
    return (raw ?? '').replace(/^\w/, (c) => c.toUpperCase());
  }
  return raw?.trim() || undefined;
}

function mapDrugUse(transcript = '', saved?: string): string | undefined {
  if (saved?.trim()) return saved;
  const lower = transcript.toLowerCase();
  if (/\bno recreational|denies drug use|no illicit|no cannabis|does not use drugs\b/i.test(lower)) {
    return 'No';
  }
  if (/\bcannabis|marijuana|weed\b/i.test(lower)) return 'Cannabis';
  if (/\brecreational drugs?\b/i.test(lower)) return 'Recreational';
  return undefined;
}

/** Client-side regex extraction — instant pre-fill before server AI responds */
export function extractFromTranscriptLocal(transcript: string): Partial<AiExtractedEntity> {
  const lower = transcript.toLowerCase();
  const result: Partial<AiExtractedEntity> = {};

  const agePatterns = [
    /\b(?:age|aged)\s*(?:is|of)?\s*(\d{1,3})\b/i,
    /\b(\d{1,2})\s*(?:years?\s*old|yrs?\s*old|y\/o|yo)\b/i,
    /\b(?:a|an)\s+(\d{1,2})\s*(?:year|yr)[\s-]*old\b/i,
    /\bpatient\s+is\s+(\d{1,3})\b/i,
    /\bis\s+(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|age|yo)\b/i,
    /\b(\d{1,3})\s+age\b/i,
  ];
  for (const p of agePatterns) {
    const m = transcript.match(p);
    if (m) {
      const age = parseInt(m[1], 10);
      if (age > 0 && age < 130) {
        result.demographics = { ...result.demographics, age };
        break;
      }
    }
  }

  const sex = inferSexFromTranscript(transcript);
  if (sex) {
    result.demographics = { ...result.demographics, sex };
  }

  const pregnancy = mapPregnancyStatus(
    undefined,
    transcript,
    result.demographics?.sex,
  );
  if (pregnancy === 'Pregnant') {
    result.demographics = {
      ...result.demographics,
      sex: result.demographics?.sex || 'Female',
      pregnant: true,
    };
  } else if (pregnancy === 'Not pregnant' || pregnancy === 'Breastfeeding') {
    result.demographics = {
      ...result.demographics,
      sex: result.demographics?.sex || (pregnancy === 'Breastfeeding' ? 'Female' : result.demographics?.sex),
      pregnant: false,
    };
  }

  const smoking = mapSmokingStatus(undefined, transcript);
  if (smoking) result.demographics = { ...result.demographics, smokingStatus: smoking };

  const alcohol = mapAlcoholUse(undefined, transcript);
  if (alcohol) result.demographics = { ...result.demographics, alcoholUse: alcohol };

  const symptoms: AiExtractedEntity['symptoms'] = [];
  if (/cold\s*sore|coldscore|herpes labialis|oral herpes/i.test(lower)) {
    symptoms.push({ symptom: 'Cold sore', confidence: 78 });
  }
  if (/fever/i.test(lower)) symptoms.push({ symptom: 'Fever', confidence: 75 });
  if (/blister|lip lesion|sore on (?:the )?lip/i.test(lower)) {
    symptoms.push({ symptom: 'Lip lesion', confidence: 72 });
  }
  if (/itch|tingl|burn(ing)?/i.test(lower)) {
    symptoms.push({ symptom: 'Prodromal symptoms', confidence: 70 });
  }
  if (symptoms.length) result.symptoms = symptoms;

  const firstSentence = transcript.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length > 8) {
    result.chiefComplaint = firstSentence;
  }

  if (/\b(no known allergies|nkda|nka|no allergies|no known drug allergies)\b/i.test(transcript)) {
    result.allergies = [{ allergen: 'No known allergies', confidence: 88 }];
  } else {
    const allergies = extractAllergiesLocal(transcript);
    if (allergies.length) result.allergies = allergies;
  }

  const meds = extractMedicationsLocal(transcript);
  if (meds.length) result.medications = meds;

  if (/\bno (?:current )?medications|not on any (?:meds|medications)|denies medications\b/i.test(lower)) {
    result.medications = [];
  }

  const labs = extractLabValuesLocal(transcript);
  if (labs.length) result.labValues = labs;

  const vitals = extractVitalsFromTranscript(transcript);
  if (Object.keys(vitals).length) {
    result.demographics = { ...result.demographics, ...vitals };
  }

  result.overallConfidence = 72;
  return sanitizeExtractedEntities(result, transcript);
}

function extractAllergiesLocal(
  transcript: string,
): NonNullable<AiExtractedEntity['allergies']> {
  const found: NonNullable<AiExtractedEntity['allergies']> = [];
  const seen = new Set<string>();
  const allergyChunks = transcript.matchAll(
    /\b(?:allergic\s+to|allergy\s+to|allergies?(?:\s+to|:)|hypersensitiv(?:e|ity)\s+to|intoleran(?:t|ce)\s+to)\s+([^.!?\n]+)/gi,
  );
  for (const match of allergyChunks) {
    // Stop before medication / lab / demographic clauses
    const chunk = (match[1] ?? '').split(
      /\s*(?:,\s*)?(?:currently\s+)?(?:taking|takes|on\s+meds|medications?|and\s+(?:egfr|hba1c|age|years?|weight|smok|history))\b/i,
    )[0];
    chunk.split(/\s*,\s*|\s+and\s+/i).forEach((part) => {
      const rawPart = part.trim();
      let allergyType: 'non_severe' | 'severe' | 'unknown' | undefined;
      let reaction: string | undefined;
      if (
        /\b(anaphylaxi\w*|angioedema|swelling|difficulty\s+breathing|severe)\b/i.test(rawPart)
      ) {
        allergyType = 'severe';
        reaction = 'Severe / immediate';
      } else if (/\b(rash|hives|itch|mild|non[- ]?severe|urticaria)\b/i.test(rawPart)) {
        allergyType = 'non_severe';
        reaction = 'Mild delayed';
      }

      let cleaned = canonicalizeDrugName(
        rawPart
          .replace(
            /\b(?:and|also|severe|mild|moderate|non[- ]?severe|rash|hives|itch(?:ing)?|anaphylaxi\w*|angioedema)\b/gi,
            ' ',
          )
          .replace(/\s+/g, ' ')
          .trim(),
      );
      cleaned =
        cleaned.split(/\b(?:and\s+)?(?:egfr|hba1c|age|years?|weight|smok|currently|taking)\b/i)[0]?.trim() ??
        cleaned;
      if (!looksLikeMedicationName(cleaned) && cleaned.length >= 3) {
        // Allow short allergen labels even if slightly informal
        if (!/^[a-z][a-z0-9\s\-\/']{1,39}$/i.test(cleaned)) return;
        if (/^(has|have|currently|taking)\b/i.test(cleaned)) return;
      }
      if (cleaned.length < 3 || cleaned.length > 40) return;
      if (/^(currently|taking|takes|medications?)\b/i.test(cleaned)) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key) || isNkdaText(cleaned)) return;
      seen.add(key);
      found.push({
        allergen: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
        ...(reaction ? { reaction } : {}),
        ...(allergyType ? { allergyType } : {}),
        confidence: 86,
      });
    });
  }
  return found;
}

function looksLikeMedicationName(name: string): boolean {
  const cleaned = name.trim();
  if (cleaned.length < 3 || cleaned.length > 40) return false;
  if (isLabLikeCondition(cleaned)) return false;
  if (/^(has|have|had|with|without|for|the|a|an|and|also)\b/i.test(cleaned)) return false;
  if (/\b(?:of|is|was|were)\b/i.test(cleaned)) return false;
  // Allow letters, spaces, hyphens, slashes — reject sentences
  if (!/^[a-z][a-z0-9\s\-\/']{1,39}$/i.test(cleaned)) return false;
  return true;
}

/**
 * Current medications ONLY when the transcript explicitly says the patient is
 * taking / on / prescribed them. Drug names mentioned only as allergies are ignored.
 */
function extractMedicationsLocal(transcript: string): NonNullable<AiExtractedEntity['medications']> {
  const found: NonNullable<AiExtractedEntity['medications']> = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    const cleaned = canonicalizeDrugName(name);
    const key = cleaned.toLowerCase();
    if (seen.has(key) || !looksLikeMedicationName(cleaned)) return;
    if (isAllergyOnlyDrugMention(transcript, cleaned)) return;
    if (!isExplicitlyTakingMedication(transcript, cleaned)) return;
    seen.add(key);
    found.push({
      name: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
      confidence: 84,
    });
  };

  const takingMatches = transcript.matchAll(
    /\b(?:currently\s+)?(?:taking|takes|take|using|uses|prescribed|started|(?:is|are|was|were|currently)\s+on)\s+(?!the\b|a\b|an\b)([^.!?\n]+)/gi,
  );
  for (const taking of takingMatches) {
    // Stop at lab / history clauses joined by "and"
    const chunk = (taking[1] ?? '').split(
      /\s+and\s+(?=has\b|have\b|had\b|with\b|egfr\b|hba1c\b|history\b|allerg)/i,
    )[0];
    chunk.split(/\s*,\s*|\s+and\s+/i).forEach((part) => {
      const cleaned = part
        .trim()
        .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu)\b/gi, '')
        .replace(/\b(once|twice|daily|bid|tid|qid|prn|od)\b/gi, '')
        .replace(/\b(?:for|since|because|due to)\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length >= 3 && cleaned.length <= 40) add(cleaned);
    });
  }

  const listMatch = transcript.match(
    /\b(?:current\s+)?(?:medications?|meds|medicines?)\s*[:\-]\s*([^.!?\n]+)/i,
  );
  if (listMatch?.[1]) {
    listMatch[1].split(/\s*,\s*|\s+and\s+/i).forEach((part) => add(part.trim()));
  }

  return found;
}

/** Merge AI entities + saved demographics + local transcript parse */
export function buildDemographicsFromSources(
  entities: AiExtractedEntity | null | undefined,
  saved: Demographics | null | undefined,
  transcript: string,
  options?: { preferAi?: boolean },
): { demo: Demographics; aiFields: Set<keyof Demographics> } {
  const preferAi = options?.preferAi === true;
  const localRaw = transcript ? extractFromTranscriptLocal(transcript) : {};
  // Sanitize AI + local so allergy-only drugs never become current meds and
  // lab markers (eGFR, HbA1c, …) never land in medical history.
  const entitiesSanitized = sanitizeExtractedEntities(entities ?? undefined, transcript);
  const local = sanitizeExtractedEntities(localRaw, transcript);
  // Prefer AI values when present; never let null/empty wipe local pronoun/regex fills
  const aiDemo = {
    age: entitiesSanitized?.demographics?.age ?? local.demographics?.age,
    sex:
      normalizeSex(entitiesSanitized?.demographics?.sex) ??
      normalizeSex(local.demographics?.sex) ??
      inferSexFromTranscript(transcript),
    weight: entitiesSanitized?.demographics?.weight || local.demographics?.weight,
    height: entitiesSanitized?.demographics?.height || local.demographics?.height,
    pulse: entitiesSanitized?.demographics?.pulse || local.demographics?.pulse,
    bloodPressureSystolic:
      entitiesSanitized?.demographics?.bloodPressureSystolic ||
      local.demographics?.bloodPressureSystolic,
    bloodPressureDiastolic:
      entitiesSanitized?.demographics?.bloodPressureDiastolic ||
      local.demographics?.bloodPressureDiastolic,
    pregnant: entitiesSanitized?.demographics?.pregnant ?? local.demographics?.pregnant,
    smokingStatus:
      entitiesSanitized?.demographics?.smokingStatus || local.demographics?.smokingStatus,
    alcoholUse: entitiesSanitized?.demographics?.alcoholUse || local.demographics?.alcoholUse,
  };
  const aiFields = new Set<keyof Demographics>();

  const pick = (key: keyof Demographics, aiVal: string | undefined, savedVal: string | undefined): string => {
    if (preferAi) {
      if (aiVal?.trim()) {
        aiFields.add(key);
        return aiVal;
      }
      if (savedVal?.trim()) return savedVal;
      return '';
    }
    if (savedVal?.trim()) return savedVal;
    if (aiVal?.trim()) {
      aiFields.add(key);
      return aiVal;
    }
    return '';
  };

  let sex = pick('sex', aiDemo.sex, saved?.sex);
  const pregnancyFromAi = mapPregnancyStatus(aiDemo.pregnant, transcript, sex || undefined);
  // "she is pregnant" → force Female + Pregnant when not already Male
  if (pregnancyFromAi === 'Pregnant' || pregnancyFromAi === 'Breastfeeding') {
    if (!sex || sex === 'Other') {
      sex = 'Female';
      if (!saved?.sex) aiFields.add('sex');
    }
  }
  const pregnancyStatus =
    sex === 'Male'
      ? ''
      : pick('pregnancyStatus', pregnancyFromAi, saved?.pregnancyStatus);

  const smoking = mapSmokingStatus(aiDemo.smokingStatus, transcript);
  const alcohol = mapAlcoholUse(aiDemo.alcoholUse, transcript);
  const drugUse = mapDrugUse(transcript, saved?.drugUse);

  const allergyFromAi = entitiesSanitized?.allergies?.length
    ? entitiesSanitized.allergies.map((a) => normalizeAllergyAllergen(a.allergen)).join(', ')
    : local.allergies?.length
      ? local.allergies.map((a) => normalizeAllergyAllergen(a.allergen)).join(', ')
      : '';

  const noneMedsInTranscript =
    /\bno (?:current )?medications|not on any (?:meds|medications)|denies medications\b/i.test(
      transcript,
    );

  const pastConditions = filterPastMedicalConditions(
    entitiesSanitized?.conditions?.length
      ? entitiesSanitized.conditions
      : local.conditions,
    entitiesSanitized?.symptoms ?? local.symptoms,
    entitiesSanitized?.chiefComplaint ?? local.chiefComplaint,
  );

  const medications =
    entitiesSanitized?.medications?.length
      ? entitiesSanitized.medications
      : local.medications ?? [];

  const labValues =
    entitiesSanitized?.labValues?.length
      ? entitiesSanitized.labValues
      : local.labValues ?? [];

  // If saved medicalConditions still contain lab-like noise from older extractions, strip them
  // and promote those markers into labValues when the lab field is empty.
  const savedConditionItems = saved?.medicalConditions?.trim()
    ? parseConditionList(saved.medicalConditions)
    : [];
  const labsFromSavedHistory = savedConditionItems
    .filter((c) => isLabLikeCondition(c.condition))
    .map((c) => extractLabValuesLocal(c.condition)[0] ?? null)
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  const savedConditionsClean = savedConditionItems.length
    ? filterPastMedicalConditions(
        savedConditionItems,
        entitiesSanitized?.symptoms ?? local.symptoms,
        entitiesSanitized?.chiefComplaint ?? local.chiefComplaint,
      )
        .map((c) => c.condition)
        .join(', ')
    : '';

  const mergedLabs = [...labValues];
  const labKeys = new Set(mergedLabs.map((l) => `${l.test.toLowerCase()}:${l.value}`));
  for (const lab of labsFromSavedHistory) {
    const key = `${lab.test.toLowerCase()}:${lab.value}`;
    if (!labKeys.has(key)) {
      labKeys.add(key);
      mergedLabs.push(lab);
    }
  }

  // Strip allergy-only drugs from previously saved medication free-text when transcript proves allergy-only
  let savedMeds = preferAi ? '' : saved?.currentMedications?.trim() || '';
  if (savedMeds && transcript.trim()) {
    const kept = savedMeds
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((name) => {
        if (isAllergyOnlyDrugMention(transcript, name)) return false;
        // Brand resolves of allergy drugs (Novamoxin ← amoxicillin)
        if (
          /novamoxin|amox/i.test(name) &&
          isAllergyOnlyDrugMention(transcript, 'amoxicillin')
        ) {
          return false;
        }
        return true;
      });
    savedMeds = kept.join(', ');
  }

  const allergyFromAiOrSaved = preferAi
    ? allergyFromAi || saved?.allergies?.trim() || ''
    : saved?.allergies?.trim() || allergyFromAi;

  const conditionsFromAi =
    pastConditions.length ? pastConditions.map((c) => c.condition).join(', ') : '';
  const medicalConditionsValue = preferAi
    ? conditionsFromAi || savedConditionsClean
    : savedConditionsClean || conditionsFromAi;

  const labsFromAi =
    mergedLabs.length
      ? mergedLabs
          .map((l) => `${l.test}: ${l.value}${l.unit ? ` ${l.unit}` : ''}`)
          .join('\n')
      : '';
  const labValuesValue = preferAi
    ? labsFromAi || saved?.labValues?.trim() || ''
    : saved?.labValues?.trim() || labsFromAi;

  const medsFromAi = medications.length
    ? medications
        .map((m) => {
          const name = (m.name ?? '').trim();
          if (!name) return '';
          const dose = (m.dose ?? '').trim();
          return dose && !isPlaceholderClinicalValue(dose) ? `${name} ${dose}` : name;
        })
        .filter(Boolean)
        .join(', ')
    : noneMedsInTranscript
      ? 'None'
      : '';
  const currentMedicationsValue = preferAi
    ? medsFromAi || savedMeds
    : savedMeds || medsFromAi;

  const demo: Demographics = {
    age: pick('age', aiDemo.age != null ? String(aiDemo.age) : undefined, saved?.age),
    ageUnit: saved?.ageUnit ?? 'years',
    dateOfBirth: saved?.dateOfBirth ?? '',
    dateOfBirthUnavailable: saved?.dateOfBirthUnavailable,
    sex,
    height: pick('height', aiDemo.height, saved?.height),
    weight: pick('weight', aiDemo.weight, saved?.weight),
    pulse: pick('pulse', aiDemo.pulse, saved?.pulse),
    bloodPressureSystolic: pick(
      'bloodPressureSystolic',
      aiDemo.bloodPressureSystolic,
      saved?.bloodPressureSystolic,
    ),
    bloodPressureDiastolic: pick(
      'bloodPressureDiastolic',
      aiDemo.bloodPressureDiastolic,
      saved?.bloodPressureDiastolic,
    ),
    pregnancyStatus,
    allergies: allergyFromAiOrSaved,
    currentMedications: currentMedicationsValue,
    medicalConditions: medicalConditionsValue,
    surgicalHistory: saved?.surgicalHistory ?? '',
    familyHistory: saved?.familyHistory ?? '',
    smokingStatus: pick('smokingStatus', smoking, saved?.smokingStatus),
    alcoholUse: pick('alcoholUse', alcohol, saved?.alcoholUse),
    drugUse: drugUse ?? '',
    labValues: labValuesValue,
    medicationEntries: preferAi
      ? undefined
      : saved?.medicationEntries?.filter((e) => {
          const label = e.label || e.brandName || e.genericName || '';
          if (!label || !transcript.trim()) return true;
          if (isAllergyOnlyDrugMention(transcript, label)) return false;
          if (
            /novamoxin|amox/i.test(label) &&
            isAllergyOnlyDrugMention(transcript, 'amoxicillin')
          ) {
            return false;
          }
          return true;
        }),
  };

  if (demo.dateOfBirth?.trim() && !demo.dateOfBirthUnavailable) {
    const derived = demographicsAgeFromDob(demo.dateOfBirth);
    if (derived) {
      demo.age = derived.age;
      demo.ageUnit = derived.ageUnit;
    }
  }

  const bmi = computeBmiKgCm(
    parseNumericInput(demo.weight),
    parseNumericInput(demo.height),
  );
  if (bmi != null) {
    demo.bmi = formatBmi(bmi);
  } else if (saved?.bmi?.trim()) {
    demo.bmi = saved.bmi;
  }

  if ((entitiesSanitized?.allergies?.length || local.allergies?.length) && (preferAi || !saved?.allergies)) {
    aiFields.add('allergies');
  }
  if (medications.length && (preferAi || !savedMeds)) aiFields.add('currentMedications');
  if (noneMedsInTranscript && !savedMeds && !medications.length) {
    aiFields.add('currentMedications');
  }
  if (pastConditions.length && (preferAi || !savedConditionsClean)) aiFields.add('medicalConditions');
  if (mergedLabs.length && (preferAi || !saved?.labValues)) aiFields.add('labValues');
  if (aiDemo.age != null && (preferAi || !saved?.age)) aiFields.add('age');
  if (aiDemo.sex && (preferAi || !saved?.sex)) aiFields.add('sex');
  if (pregnancyStatus && (preferAi || !saved?.pregnancyStatus) && sex === 'Female') aiFields.add('pregnancyStatus');
  if (smoking && (preferAi || !saved?.smokingStatus)) aiFields.add('smokingStatus');
  if (alcohol && (preferAi || !saved?.alcoholUse)) aiFields.add('alcoholUse');
  if (drugUse && (preferAi || !saved?.drugUse)) aiFields.add('drugUse');
  if (aiDemo.pulse && (preferAi || !saved?.pulse)) aiFields.add('pulse');
  if (aiDemo.bloodPressureSystolic && (preferAi || !saved?.bloodPressureSystolic)) {
    aiFields.add('bloodPressureSystolic');
  }
  if (aiDemo.bloodPressureDiastolic && (preferAi || !saved?.bloodPressureDiastolic)) {
    aiFields.add('bloodPressureDiastolic');
  }

  return { demo, aiFields };
}

function parseConditionList(text: string): Array<{ condition: string }> {
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((condition) => ({ condition }));
}

export function getFieldConfidence(
  key: keyof Demographics,
  entities: AiExtractedEntity | null | undefined,
  aiFields: Set<keyof Demographics>,
): number | undefined {
  if (!aiFields.has(key)) return undefined;
  if (key === 'age' || key === 'sex') return 85;
  if (key === 'pregnancyStatus') return 80;
  if (key === 'smokingStatus' || key === 'alcoholUse' || key === 'drugUse') return 76;
  if (key === 'allergies') return entities?.allergies?.[0]?.confidence ?? 88;
  if (key === 'currentMedications') return entities?.medications?.[0]?.confidence ?? 85;
  if (key === 'medicalConditions') return entities?.conditions?.[0]?.confidence ?? 82;
  if (key === 'labValues') return entities?.labValues?.[0]?.confidence ?? 80;
  return 78;
}

export function mergeQuestionAnswers(
  questions: ClinicalQuestion[],
  existing: Record<string, QuestionResponse>,
  aiAnswers: Array<{
    id: string;
    answer?: unknown;
    answerText?: string;
    confidence?: number;
    source?: string;
  }>,
  threshold = CONFIDENCE_THRESHOLD,
): Record<string, QuestionResponse> {
  const next = { ...existing };
  for (const q of questions) {
    if (!next[q.id]) {
      next[q.id] = { questionId: q.id, question: q.question, answer: null, answerText: '' };
    }
    const current = next[q.id];
    const existingAnswer = current.answer;
    // Never overwrite pharmacist manual edits
    if (current.source === 'manual') continue;
    if (existingAnswer != null && existingAnswer !== '' && !current.aiAnswered) continue;

    const a = aiAnswers.find((x) => x.id === q.id);
    if (!a || (a.confidence ?? 0) < threshold) continue;

    let answerText = a.answerText ?? String(a.answer ?? '');
    if (!answerText.trim()) continue;

    // Pathway binary questions are always Yes/No (map Present/Absent/Unknown).
    if (q.type === 'YES_NO' || q.type === 'BOOLEAN') {
      const lower = answerText.toLowerCase().trim();
      if (['unknown', 'n/a', 'na', 'unsure', 'not sure'].includes(lower)) continue;
      if (['yes', 'true', 'present', 'positive'].includes(lower)) answerText = 'Yes';
      else if (['no', 'false', 'absent', 'negative'].includes(lower)) answerText = 'No';
    }

    next[q.id] = {
      ...next[q.id],
      answer: answerText,
      answerText,
      confidence: a.confidence,
      source: (a.source as QuestionResponse['source']) ?? 'transcript',
      aiAnswered: true,
    };
  }
  return next;
}

/** True when enough structured data exists to skip a fresh analyze call */
export function hasExtractedData(entities: AiExtractedEntity | null | undefined): boolean {
  if (!entities) return false;
  const demo = entities.demographics;
  return Boolean(
    demo?.age ||
      demo?.sex ||
      demo?.smokingStatus ||
      demo?.alcoholUse ||
      demo?.pregnant != null ||
      (entities.symptoms?.length ?? 0) > 0 ||
      (entities.medications?.length ?? 0) > 0 ||
      (entities.allergies?.length ?? 0) > 0 ||
      (entities.conditions?.length ?? 0) > 0 ||
      (entities.labValues?.length ?? 0) > 0,
  );
}

/** Remaining clinical questions that still need an AI or manual answer */
export function unansweredRequiredQuestions(
  questions: ClinicalQuestion[],
  responses: Record<string, QuestionResponse>,
): ClinicalQuestion[] {
  return questions.filter((q) => {
    if (q.required === false) return false;
    const r = responses[q.id];
    const raw = String(r?.answerText ?? r?.answer ?? '').trim();
    if (!raw) return true;
    const lower = raw.toLowerCase();
    // Treat Unknown / unsure as unanswered so pharmacists must confirm Yes or No
    if (['unknown', 'n/a', 'na', 'unsure', 'not sure'].includes(lower)) return true;
    return false;
  });
}
