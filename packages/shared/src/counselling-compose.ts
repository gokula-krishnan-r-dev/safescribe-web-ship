import {
  MAX_COUNSELLING_CARD_BULLETS,
  MAX_HOW_TO_USE_TREATMENTS,
  classifyApprovedCounsellingPoint,
  fallbackMedicationUse,
  patientFacingMedicationUseLine,
} from './counselling-payload';
import {
  isGuidanceOutputSection,
  isUsablePatientGuidanceText,
  mapLegacyCategoryToSection,
  type GuidanceOutputSection,
} from './patient-guidance';

export const COUNSELLING_SECTION_KEYS = [
  'howToUse',
  'whatToExpect',
  'selfCare',
  'followUp',
] as const;

export type CounsellingComposeSectionKey = (typeof COUNSELLING_SECTION_KEYS)[number];

export const MAX_COUNSELLING_SENTENCES = 3;
export const MAX_COUNSELLING_SENTENCE_CHARS = 320;

export type HowToUseEntry = {
  treatmentId: string;
  displayName: string;
  directions: string;
  line: string;
};

/** Collapse patient directions to a single professional line (no bullet splitting). */
export function compactCounsellingLine(text: string): string {
  return String(text ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[•\u2022]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namedHowToUseLine(displayName: string, directions: string): string {
  const name = compactCounsellingLine(displayName);
  const dir = compactCounsellingLine(directions);
  if (!name) return dir;
  if (!dir) return name;
  if (dir.toLowerCase().includes(name.toLowerCase())) return dir;
  return `${name}: ${dir}`;
}

/** Split prose into complete sentence strings (max length enforced). */
export function splitCounsellingSentences(text: string): string[] {
  const cleaned = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[•\-\u2022]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const parts: string[] = [];
  // Prefer Intl.Segmenter when available (Node 20+ / modern browsers)
  try {
    const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    if (typeof Seg === 'function') {
      const segmenter = new Seg('en-CA', { granularity: 'sentence' });
      for (const { segment } of segmenter.segment(cleaned)) {
        const s = segment.trim();
        if (s) parts.push(s);
      }
    }
  } catch {
    // fall through
  }

  if (!parts.length) {
    for (const chunk of cleaned.split(/(?<=[.!?])\s+/)) {
      const s = chunk.trim();
      if (s) parts.push(s);
    }
  }

  return parts
    .map((s) => {
      let sentence = s.trim();
      if (!/[.!?]$/.test(sentence)) sentence = `${sentence}.`;
      if (sentence.length > MAX_COUNSELLING_SENTENCE_CHARS) {
        sentence = `${sentence.slice(0, MAX_COUNSELLING_SENTENCE_CHARS - 1).trim()}…`;
      }
      return sentence;
    })
    .filter(Boolean);
}

export function clampCounsellingSentences(
  sentences: string[],
  max = MAX_COUNSELLING_SENTENCES,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of sentences) {
    for (const s of splitCounsellingSentences(raw)) {
      const key = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export type CounsellingComposeTreatment = {
  id?: string;
  displayName: string;
  category?: string;
  dose?: string | null;
  route?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  patientDirections?: string | null;
};

export type CounsellingComposePathwayRow = {
  id?: string;
  category: string;
  point: string;
  detail?: string | null;
  outputSection?: string | null;
  archivedAt?: string | Date | null;
};

export type CounsellingComposeInput = {
  conditionName: string;
  pediatric?: boolean;
  treatments: CounsellingComposeTreatment[];
  pathwayRows: CounsellingComposePathwayRow[];
};

export type CounsellingComposedSections = Record<
  CounsellingComposeSectionKey,
  string[]
>;

function formatDuration(duration: string): string {
  const d = duration.trim();
  if (/^\d+(\.\d+)?$/.test(d)) {
    return Number(d) === 1 ? '1 day' : `${d} days`;
  }
  return d;
}

function joinList(names: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  if (!unique.length) return '';
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
}

function cleanConditionName(name: string): string | null {
  const t = name.replace(/\s+/g, ' ').trim();
  if (!t || /^your symptoms$/i.test(t)) return null;
  return t;
}

function namedMedicines(
  input: CounsellingComposeInput,
): CounsellingComposeTreatment[] {
  return input.treatments.filter((t) => {
    if (!t.displayName?.trim()) return false;
    return (t.category ?? 'PRESCRIPTION') !== 'NON_DRUG';
  });
}

/**
 * Consultation-grounded copy when the pathway has no expected-response points.
 * Uses confirmed condition + selected medicines only — never invents a healing timeline.
 */
export function fallbackWhatToExpect(
  input: CounsellingComposeInput,
): string[] {
  const condition = cleanConditionName(input.conditionName);
  const meds = namedMedicines(input);
  const names = joinList(meds.map((t) => t.displayName));
  const sentences: string[] = [];

  if (names && condition) {
    sentences.push(
      `With ${names}, ${condition} may start to settle as the medicine is used as directed.`,
    );
  } else if (names) {
    sentences.push(
      `Symptoms may start to settle as ${names} is used as directed.`,
    );
  } else if (condition) {
    sentences.push(
      `How ${condition} settles can vary from person to person.`,
    );
  }

  const durations = [
    ...new Set(
      meds
        .map((t) => cleanRegimenPart(t.duration))
        .filter((d): d is string => Boolean(d))
        .map((d) => formatDuration(d)),
    ),
  ];
  if (durations.length === 1 && sentences.length) {
    sentences.push(
      `This course is prescribed for ${durations[0]}. Improvement may continue after the last dose.`,
    );
  } else if (sentences.length === 1) {
    sentences.push(
      'How quickly that happens can vary from person to person.',
    );
  }

  return clampCounsellingSentences(
    sentences,
    MAX_COUNSELLING_CARD_BULLETS.EXPECTED_RESPONSE,
  );
}

/** Drop placeholder regimen values that produce “as directed for As directed”. */
function cleanRegimenPart(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  if (!t) return null;
  if (
    /^(as\s+directed|as\s+needed|n\/?a|tbd|none|null|undefined|-|—)$/i.test(t)
  ) {
    return null;
  }
  return t;
}

function destinationForGuidanceRow(
  row: CounsellingComposePathwayRow,
): 'medication_use' | GuidanceOutputSection | null {
  if (row.archivedAt) return null;
  if (isGuidanceOutputSection(row.outputSection)) return row.outputSection;

  const text = row.detail?.trim() || row.point?.trim() || '';
  const classified = classifyApprovedCounsellingPoint(row.category, text);
  if (classified === 'expected_response') return 'what_to_expect';
  if (classified === 'self_care') return 'self_care';
  if (classified === 'follow_up' || classified === 'safety_net') return 'follow_up';
  if (classified === 'medication_use' || classified === 'precaution') {
    return 'medication_use';
  }
  if (/handout/i.test(row.category ?? '')) return null;
  return mapLegacyCategoryToSection(row.category);
}

function toSelectedPayload(t: CounsellingComposeTreatment, index: number) {
  const directions = compactCounsellingLine(
    t.patientDirections || t.instructions || '',
  );
  return {
    treatment_id: t.id ?? t.displayName ?? `t-${index}`,
    display_name: compactCounsellingLine(t.displayName),
    dose: t.dose ?? undefined,
    route: t.route ?? undefined,
    frequency: t.frequency ?? undefined,
    duration: t.duration ?? undefined,
    ...(directions ? { directions, patient_directions: directions } : {}),
  };
}

/**
 * One professional line per selected medicine: treatment name + compact
 * patient directions. Does not split SIG sentences into extra bullets.
 */
export function buildHowToUseEntries(
  input: CounsellingComposeInput,
): HowToUseEntry[] {
  const meds = input.treatments.filter(
    (t) => (t.category ?? 'PRESCRIPTION') !== 'NON_DRUG',
  );
  const out: HowToUseEntry[] = [];
  const seen = new Set<string>();

  for (const [index, t] of meds.slice(0, MAX_HOW_TO_USE_TREATMENTS).entries()) {
    const displayName = compactCounsellingLine(t.displayName);
    if (!displayName) continue;
    const directions = compactCounsellingLine(
      patientFacingMedicationUseLine(toSelectedPayload(t, index), {
        pediatric: Boolean(input.pediatric),
      }),
    );
    if (!directions) continue;
    const line = namedHowToUseLine(displayName, directions);
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      treatmentId: t.id ?? displayName,
      displayName,
      directions,
      line,
    });
  }

  if (out.length) return out;

  return fallbackMedicationUse(meds.map((t, i) => toSelectedPayload(t, i))).map(
    (line, i) => {
      const displayName = compactCounsellingLine(meds[i]?.displayName ?? '');
      return {
        treatmentId: meds[i]?.id ?? (displayName || `t-${i}`),
        displayName,
        directions: compactCounsellingLine(line),
        line: namedHowToUseLine(displayName, line),
      };
    },
  );
}

function buildHowToUse(input: CounsellingComposeInput): string[] {
  return buildHowToUseEntries(input).map((entry) => entry.line);
}

/**
 * Compose four counselling sections from confirmed treatments + approved
 * Patient Guidance rows. Deterministic — no LLM. Cards 2–4 stay empty when
 * the pathway has no matching approved points (never invent clinical advice).
 */
export function composeCounsellingSections(
  input: CounsellingComposeInput,
): CounsellingComposedSections {
  const buckets: Record<GuidanceOutputSection, string[]> = {
    what_to_expect: [],
    self_care: [],
    follow_up: [],
  };

  for (const row of input.pathwayRows) {
    const dest = destinationForGuidanceRow(row);
    const text = (row.detail?.trim() || row.point?.trim() || '').trim();
    if (!dest || !isUsablePatientGuidanceText(text)) continue;
    if (dest === 'medication_use') continue;
    buckets[dest].push(text);
  }

  return {
    howToUse: buildHowToUse(input),
    whatToExpect: clampCounsellingSentences(
      buckets.what_to_expect,
      MAX_COUNSELLING_CARD_BULLETS.EXPECTED_RESPONSE,
    ),
    selfCare: clampCounsellingSentences(
      buckets.self_care,
      MAX_COUNSELLING_CARD_BULLETS.SELF_CARE,
    ),
    followUp: clampCounsellingSentences(
      buckets.follow_up,
      MAX_COUNSELLING_CARD_BULLETS.FOLLOW_UP,
    ),
  };
}
