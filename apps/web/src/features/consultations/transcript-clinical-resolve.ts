import {
  applyAllergyType,
  allergyTypeFromEntry,
  type AllergyTypeId,
} from './allergy-type-dialog';
import type { AllergyDrugEntry } from './allergy-search-field';
import { resultToAllergyEntry } from './allergy-search-field';
import type { DrugSearchResult } from './medication-utils';

export type AllergyAiHint = {
  allergen?: string;
  reaction?: string;
  allergyType?: string;
  confidence?: number;
};

const SEVERE_RE =
  /\b(anaphylaxi\w*|anaphylactic|angioedema|swelling\s+of\s+(?:the\s+)?(?:face|lips|throat|tongue)|throat\s+swelling|difficulty\s+breathing|shortness\s+of\s+breath|can'?t\s+breathe|cannot\s+breathe|wheez(?:e|ing)|severe\s+(?:rash|reaction|allergy)|steven(?:s)?[- ]?johnson|toxic\s+epidermal)\b/i;

const NON_SEVERE_RE =
  /\b(rash|hives|urticaria|itch(?:ing|y)?|prurit\w*|mild\s+(?:rash|reaction|allergy)|non[- ]?severe|stomach\s+upset|nausea|gi\s+upset)\b/i;

function normalizeAllergyTypeToken(raw?: string | null): AllergyTypeId | null {
  const t = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!t) return null;
  if (t === 'severe' || t === 'anaphylaxis' || t === 'high') return 'severe';
  if (
    t === 'non_severe' ||
    t === 'nonsevere' ||
    t === 'mild' ||
    t === 'moderate' ||
    t === 'low'
  ) {
    return 'non_severe';
  }
  if (t === 'unknown' || t === 'reaction_unknown' || t === 'unsure') return 'unknown';
  return null;
}

/** Window of transcript text around an allergen mention for severity cues. */
function transcriptWindow(transcript: string, allergen: string): string {
  const t = transcript.trim();
  const a = allergen.trim();
  if (!t || !a) return '';
  const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`.{0,90}\\b${escaped}\\b.{0,90}`, 'i');
  const m = t.match(re);
  return m?.[0] ?? '';
}

/**
 * Classify allergy type from AI hints + transcript context.
 * Prefer explicit AI allergyType, then reaction text, then local transcript cues.
 * Defaults to `unknown` when evidence is insufficient (pharmacist can confirm).
 */
export function inferAllergyType(opts: {
  allergen: string;
  transcript?: string;
  reaction?: string;
  allergyType?: string | null;
}): AllergyTypeId {
  const fromAi = normalizeAllergyTypeToken(opts.allergyType);
  if (fromAi) return fromAi;

  const reaction = (opts.reaction ?? '').trim();
  if (reaction) {
    if (SEVERE_RE.test(reaction) || /\bsevere\b/i.test(reaction)) return 'severe';
    if (NON_SEVERE_RE.test(reaction)) return 'non_severe';
    const fromReaction = normalizeAllergyTypeToken(reaction);
    if (fromReaction) return fromReaction;
    if (/^unknown$/i.test(reaction) || /reaction\s+unknown/i.test(reaction)) {
      return 'unknown';
    }
  }

  const window = transcriptWindow(opts.transcript ?? '', opts.allergen);
  if (window) {
    if (SEVERE_RE.test(window)) return 'severe';
    if (NON_SEVERE_RE.test(window)) return 'non_severe';
  }

  return 'unknown';
}

export function applyInferredAllergyType(
  entry: AllergyDrugEntry,
  opts: {
    allergen?: string;
    transcript?: string;
    reaction?: string;
    allergyType?: string | null;
  },
): AllergyDrugEntry {
  if (allergyTypeFromEntry(entry) != null) return entry;
  const type = inferAllergyType({
    allergen: opts.allergen || entry.drug,
    transcript: opts.transcript,
    reaction: opts.reaction || entry.reaction,
    allergyType: opts.allergyType,
  });
  return applyAllergyType(entry, type);
}

/**
 * Map free-text allergen names → CCDD (or fallback) entries with typed severity.
 * `resolved` must align 1:1 with `names` (API returns one result per unique name in order).
 */
export function buildResolvedAllergyEntries(opts: {
  names: string[];
  resolved: DrugSearchResult[];
  transcript?: string;
  aiHints?: AllergyAiHint[];
}): AllergyDrugEntry[] {
  const hintByKey = new Map<string, AllergyAiHint>();
  for (const hint of opts.aiHints ?? []) {
    const key = (hint.allergen ?? '').trim().toLowerCase();
    if (key) hintByKey.set(key, hint);
  }

  const out: AllergyDrugEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < opts.names.length; i++) {
    const name = opts.names[i]?.trim();
    const result = opts.resolved[i];
    if (!name || !result) continue;

    const base = {
      ...resultToAllergyEntry(result),
      // Mark AI/transcript provenance while preserving coded ids on the entry
      source: 'transcript' as const,
    };
    const hint = hintByKey.get(name.toLowerCase());
    const entry = applyInferredAllergyType(base, {
      allergen: name,
      transcript: opts.transcript,
      reaction: hint?.reaction,
      allergyType: hint?.allergyType,
    });

    const dedupeKey = (entry.genericName || entry.drug).toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(entry);
  }

  return out;
}

export function collectAllergyNamesToResolve(opts: {
  aiAllergies?: AllergyAiHint[];
  freeText?: string;
  existing?: AllergyDrugEntry[];
}): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const push = (raw?: string) => {
    const n = (raw ?? '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(n);
  };

  for (const a of opts.aiAllergies ?? []) push(a.allergen);
  for (const e of opts.existing ?? []) {
    if (e.source === 'transcript' || !e.source) push(e.drug);
  }
  if (opts.freeText?.trim() && !opts.freeText.includes('|')) {
    for (const part of opts.freeText.split(/[,;]/)) push(part);
  }

  return names;
}
