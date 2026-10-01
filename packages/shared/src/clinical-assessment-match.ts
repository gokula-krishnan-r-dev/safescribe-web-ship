/**
 * Step 2: map pharmacist-authored assessment text to at most one approved pathway.
 * This is terminology/pathway matching — not diagnosis and not ranking.
 */

export type PathwayMatchStatus = 'matched' | 'none' | 'ambiguous';

export type PathwayMatchMethod =
  | 'exact_alias'
  | 'canonical_name'
  | 'normalized_alias'
  | 'prefix'
  | 'token'
  | 'fuzzy'
  | 'resource';

export interface AssessmentPathwayCandidate {
  id: string;
  name: string;
  condition?: string | null;
  category?: string | null;
  description?: string | null;
  aiSummary?: string | null;
  notes?: string | null;
  guidelineSource?: string | null;
  routingAliases?: string[] | null;
  routingPresentingComplaints?: string[] | null;
  routingContextTerms?: string[] | null;
  routingDescription?: string | null;
  differentials?: unknown;
  redFlags?: unknown;
  conceptLabels?: string[] | null;
}

export interface PathwayMatchCandidate {
  pathwayId: string;
  score: number;
  matchMethod: PathwayMatchMethod;
}

export interface SinglePathwayMatch {
  status: PathwayMatchStatus;
  pathwayId: string | null;
  matchMethod: PathwayMatchMethod | null;
  normalizedAssessment: string;
  /** Ranked pathways above the match threshold (1 when unique, 2+ when ambiguous). */
  candidates: PathwayMatchCandidate[];
}

const SYNONYM_GROUPS: string[][] = [
  ['cold sore', 'cold sores', 'herpes labialis', 'herpes labial', 'fever blister', 'fever blisters', 'oral herpes'],
  [
    'uti',
    'urinary tract infection',
    'acute cystitis',
    'uncomplicated cystitis',
    'acute uncomplicated cystitis',
    'cystitis',
    'bladder infection',
  ],
  ['migraine', 'migraines', 'migraine headache'],
  ['strep throat', 'streptococcal pharyngitis', 'group a strep'],
  ['impetigo', 'nonbullous impetigo'],
  ['allergic rhinitis', 'hay fever'],
  ['common cold', 'upper respiratory infection', 'uri', 'viral uri'],
  [
    'emergency contraception',
    'emergency contraceptive',
    'plan b',
    'morning after pill',
    'levonorgestrel ec',
  ],
  ['acne', 'acne vulgaris'],
  ['gerd', 'acid reflux', 'gastroesophageal reflux', 'heartburn'],
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'onto',
  'are',
  'was',
  'were',
  'of',
  'on',
  'in',
  'at',
  'to',
  'a',
  'an',
  'or',
  'by',
]);

const JSON_LABEL_KEYS = new Set([
  'name',
  'title',
  'label',
  'text',
  'condition',
  'displayName',
  'heading',
  'citationTitle',
]);

const MIN_MATCH_SCORE = 480;
const UNIQUE_MARGIN = 70;

type WeightedPhrase = {
  text: string;
  compact: string;
  tokens: string[];
  weight: number;
  source: 'canonical' | 'alias' | 'resource';
};

function normalizeAssessment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bsore(s)?\b/g, 'sore')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: string): string {
  return value.replace(/\s+/g, '');
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function expandTerms(normalized: string): string[] {
  const compact = compactText(normalized);
  const terms = new Set<string>([normalized]);
  if (compact && compact !== normalized) terms.add(compact);
  for (const group of SYNONYM_GROUPS) {
    const hit = group.some((term) => {
      const compactTerm = compactText(term);
      // Exact / compact equality covers short aliases like "uti".
      if (normalized === term || compact === compactTerm) return true;
      // Short aliases may appear inside longer synonym phrases.
      if (normalized.length <= 4 && normalized.length >= 2) {
        if (term.includes(normalized) || compactTerm.includes(compact)) return true;
      }
      // Longer queries that are a prefix of a synonym phrase (e.g. "urinary tract").
      if (normalized.length >= 5 && (term.startsWith(normalized) || compactTerm.startsWith(compact))) {
        return true;
      }
      // Query contains a full synonym phrase (e.g. "acute uti cystitis" contains "uti").
      if (normalized.length >= 5 && term.length >= 3 && normalized.includes(term)) {
        return true;
      }
      return false;
    });
    if (!hit) continue;
    for (const term of group) {
      terms.add(term);
      terms.add(compactText(term));
    }
  }
  return [...terms].filter(Boolean);
}

function damerau(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const prevPrev = new Array<number>(bl + 1).fill(0);
  const prev = Array.from({ length: bl + 1 }, (_, i) => i);
  const curr = new Array<number>(bl + 1).fill(0);
  for (let i = 1; i <= al; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j] ?? 0, (prevPrev[j - 2] ?? 0) + 1);
      }
    }
    for (let j = 0; j <= bl; j += 1) {
      prevPrev[j] = prev[j] ?? 0;
      prev[j] = curr[j] ?? 0;
    }
  }
  return prev[bl] ?? Math.max(al, bl);
}

function allowedDistance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  return 3;
}

function tokenMatches(queryTok: string, candidateTok: string): boolean {
  if (queryTok === candidateTok) return true;
  if (candidateTok.startsWith(queryTok) && queryTok.length >= 3) return true;
  const minShare = Math.max(5, Math.ceil(queryTok.length * 0.72));
  if (queryTok.startsWith(candidateTok) && candidateTok.length >= minShare) return true;
  const max = allowedDistance(Math.min(queryTok.length, candidateTok.length));
  if (!max) return false;
  if (Math.abs(queryTok.length - candidateTok.length) > max) return false;
  return damerau(queryTok, candidateTok) <= max;
}

function tokenCoverage(queryTokens: string[], hayTokens: string[]): number {
  if (!queryTokens.length || !hayTokens.length) return 0;
  let matched = 0;
  for (const queryTok of queryTokens) {
    if (hayTokens.some((hayTok) => tokenMatches(queryTok, hayTok))) matched += 1;
  }
  return matched / queryTokens.length;
}

function collectJsonLabels(value: unknown, out: string[], depth = 0): void {
  if (out.length >= 48 || depth > 6 || value == null) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.length >= 3 && text.length <= 100) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLabels(item, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (JSON_LABEL_KEYS.has(key) && typeof nested === 'string') {
      const text = nested.trim();
      if (text.length >= 3 && text.length <= 120) out.push(text);
      continue;
    }
    if (typeof nested === 'string') continue;
    collectJsonLabels(nested, out, depth + 1);
  }
}

function pushPhrase(
  phrases: WeightedPhrase[],
  seen: Set<string>,
  raw: string,
  weight: number,
  source: WeightedPhrase['source'],
) {
  const text = normalizeAssessment(raw);
  if (!text || seen.has(`${source}:${text}`)) return;
  seen.add(`${source}:${text}`);
  phrases.push({
    text,
    compact: compactText(text),
    tokens: tokenize(text),
    weight,
    source,
  });
}

function pathwaySearchDocument(pathway: AssessmentPathwayCandidate): {
  phrases: WeightedPhrase[];
  tokens: string[];
} {
  const phrases: WeightedPhrase[] = [];
  const seen = new Set<string>();
  pushPhrase(phrases, seen, pathway.name, 12, 'canonical');
  pushPhrase(phrases, seen, pathway.condition ?? '', 12, 'canonical');
  for (const alias of pathway.routingAliases ?? []) {
    pushPhrase(phrases, seen, alias, 11, 'alias');
  }
  for (const complaint of pathway.routingPresentingComplaints ?? []) {
    pushPhrase(phrases, seen, complaint, 10, 'alias');
  }
  for (const term of pathway.routingContextTerms ?? []) {
    pushPhrase(phrases, seen, term, 7, 'resource');
  }
  pushPhrase(phrases, seen, pathway.category ?? '', 6, 'resource');
  pushPhrase(phrases, seen, pathway.routingDescription ?? '', 5, 'resource');
  pushPhrase(phrases, seen, pathway.guidelineSource ?? '', 4, 'resource');
  for (const blob of [pathway.description, pathway.aiSummary, pathway.notes]) {
    const snippet = (blob ?? '').trim().slice(0, 240);
    pushPhrase(phrases, seen, snippet, 4, 'resource');
  }
  for (const label of pathway.conceptLabels ?? []) {
    pushPhrase(phrases, seen, label, 6, 'resource');
  }
  const jsonLabels: string[] = [];
  collectJsonLabels(pathway.differentials, jsonLabels);
  collectJsonLabels(pathway.redFlags, jsonLabels);
  for (const label of jsonLabels) {
    pushPhrase(phrases, seen, label, 6, 'resource');
  }
  const tokens = [...new Set(phrases.flatMap((phrase) => phrase.tokens))];
  return { phrases, tokens };
}

function methodFor(score: number, source: WeightedPhrase['source'] | 'corpus'): PathwayMatchMethod {
  if (score >= 990) return source === 'canonical' ? 'canonical_name' : 'exact_alias';
  if (score >= 960) return 'normalized_alias';
  if (score >= 800) return 'prefix';
  if (score >= 720) return 'token';
  if (source === 'corpus' || source === 'resource') return score >= 620 ? 'resource' : 'fuzzy';
  return 'fuzzy';
}

function scorePhrase(
  query: string,
  compactQuery: string,
  queryTokens: string[],
  phrase: WeightedPhrase,
): number {
  if (!phrase.text) return 0;
  if (query === phrase.text) {
    return (phrase.source === 'alias' ? 1015 : 1005) + phrase.weight;
  }
  // Short clinical aliases (uti, uri, ec) against compact phrase tokens / aliases.
  if (compactQuery.length >= 2 && compactQuery.length <= 4) {
    if (phrase.compact === compactQuery) {
      return (phrase.source === 'alias' ? 1010 : 1000) + phrase.weight;
    }
    if (phrase.tokens.some((tok) => tok === compactQuery)) {
      return 960 + phrase.weight;
    }
  }
  if (compactQuery && phrase.compact && compactQuery === phrase.compact && phrase.compact.length >= 5) {
    return 980 + phrase.weight;
  }
  if (phrase.compact.length >= 5 && compactQuery.length >= 3) {
    if (phrase.compact.startsWith(compactQuery)) {
      return 820 + Math.min(compactQuery.length, 12) + phrase.weight;
    }
    // Contained compact substring: "contraception" inside "emergencycontraception".
    if (
      compactQuery.length >= 5 &&
      phrase.compact.includes(compactQuery) &&
      compactQuery.length / phrase.compact.length >= 0.35
    ) {
      return 760 + Math.min(compactQuery.length, 14) + phrase.weight;
    }
    const minPhraseShare = Math.max(6, Math.ceil(compactQuery.length * 0.72));
    if (compactQuery.startsWith(phrase.compact) && phrase.compact.length >= minPhraseShare) {
      return 780 + phrase.weight;
    }
    const max = allowedDistance(Math.max(phrase.compact.length, compactQuery.length));
    if (
      max > 0 &&
      Math.abs(phrase.compact.length - compactQuery.length) <= max + 1
    ) {
      const distance = damerau(compactQuery, phrase.compact);
      if (distance > 0 && distance <= max) {
        return 700 - distance * 35 + phrase.weight;
      }
    }
  }
  if (queryTokens.length && phrase.tokens.length) {
    const coverage = tokenCoverage(queryTokens, phrase.tokens);
    if (coverage === 1) return 750 + phrase.weight + queryTokens.length * 8;
    if (coverage >= 0.6 && queryTokens.length >= 2) return Math.round(520 * coverage) + phrase.weight;
    // Single distinctive query token that appears inside a multi-word pathway title.
    if (
      queryTokens.length === 1 &&
      queryTokens[0] &&
      queryTokens[0].length >= 5 &&
      phrase.tokens.some((tok) => tokenMatches(queryTokens[0]!, tok))
    ) {
      return 720 + phrase.weight;
    }
  }
  if (query.length >= 4 && phrase.text.startsWith(query)) {
    return 730 + phrase.weight;
  }
  // Whole-phrase contains query (space-aware): "contraception" ⊂ "emergency contraception".
  if (query.length >= 5 && phrase.text.includes(query)) {
    return 715 + phrase.weight + Math.min(query.length, 12);
  }
  return 0;
}

function isOriginalQueryTerm(term: string, query: string, compactQuery: string): boolean {
  return term === query || compactText(term) === compactQuery;
}

function bestPathwayScore(
  query: string,
  compactQuery: string,
  queryTokens: string[],
  expanded: string[],
  pathway: AssessmentPathwayCandidate,
): { score: number; method: PathwayMatchMethod } {
  const doc = pathwaySearchDocument(pathway);
  let best = 0;
  let source: WeightedPhrase['source'] | 'corpus' = 'resource';
  for (const term of expanded) {
    const compactTerm = compactText(term);
    const termTokens = tokenize(term);
    const originalTerm = isOriginalQueryTerm(term, query, compactQuery);
    for (const phrase of doc.phrases) {
      // Synonym expansion is only for pharmacist-facing titles/aliases.
      // Differentials and other resource labels often name competing diagnoses
      // (e.g. yeast lists "Urinary Tract Infection") — matching expanded synonyms
      // against those creates false positives for short aliases like "uti".
      if (!originalTerm && phrase.source === 'resource') continue;
      const score = scorePhrase(term, compactTerm, termTokens, phrase);
      if (score > best) {
        best = score;
        source = phrase.source;
      }
    }
  }
  // Corpus token coverage uses the pharmacist's typed tokens only (not expanded synonyms).
  const coverage = tokenCoverage(queryTokens, doc.tokens);
  if (queryTokens.length >= 1 && coverage === 1) {
    const resourceScore = 640 + queryTokens.length * 20;
    if (resourceScore > best) {
      best = resourceScore;
      source = 'corpus';
    }
  } else if (queryTokens.length >= 2 && coverage >= 0.7) {
    const resourceScore = Math.round(500 * coverage);
    if (resourceScore > best) {
      best = resourceScore;
      source = 'corpus';
    }
  }
  return { score: best, method: methodFor(best, source) };
}

export function pathwayDisplayLabel(pathway: Pick<AssessmentPathwayCandidate, 'name' | 'condition'>): string {
  const name = pathway.name?.trim() || '';
  const condition = pathway.condition?.trim() || '';
  if (!name) return condition || 'Unknown pathway';
  if (!condition || name.toLowerCase() === condition.toLowerCase()) return name;
  if (name.toLowerCase().includes(condition.toLowerCase())) return name;
  if (condition.toLowerCase().includes(name.toLowerCase())) return condition;
  return `${name} (${condition})`;
}

export function matchSingleApprovedPathway(
  assessmentText: string,
  pathways: AssessmentPathwayCandidate[],
): SinglePathwayMatch {
  const normalizedAssessment = normalizeAssessment(assessmentText);
  if (!normalizedAssessment || normalizedAssessment.length < 2) {
    return {
      status: 'none',
      pathwayId: null,
      matchMethod: null,
      normalizedAssessment,
      candidates: [],
    };
  }

  const compactQuery = compactText(normalizedAssessment);
  const queryTokens = tokenize(normalizedAssessment);
  const expanded = expandTerms(normalizedAssessment);
  const scored = pathways
    .map((pathway) => {
      const result = bestPathwayScore(
        normalizedAssessment,
        compactQuery,
        queryTokens,
        expanded,
        pathway,
      );
      return { id: pathway.id, ...result };
    })
    .filter((item) => item.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  if (!scored.length) {
    return {
      status: 'none',
      pathwayId: null,
      matchMethod: null,
      normalizedAssessment,
      candidates: [],
    };
  }

  const best = scored[0]!;
  const second = scored[1];
  const strong = (score: number) => score >= 900;
  const uniqueWinner =
    !second ||
    best.score - second.score >= UNIQUE_MARGIN ||
    (strong(best.score) && !strong(second.score)) ||
    (best.score >= 960 && second.score < 900);

  const candidates: PathwayMatchCandidate[] = scored.slice(0, 6).map((item) => ({
    pathwayId: item.id,
    score: item.score,
    matchMethod: item.method,
  }));

  if (!uniqueWinner) {
    return {
      status: 'ambiguous',
      pathwayId: null,
      matchMethod: null,
      normalizedAssessment,
      candidates,
    };
  }

  return {
    status: 'matched',
    pathwayId: best.id,
    matchMethod: best.method,
    normalizedAssessment,
    candidates: candidates.slice(0, 1),
  };
}

export type StoredClinicalAssessment = {
  assessmentText: string;
  normalizedAssessment?: string;
  assessmentSource?: string;
  matchedPathwayId?: string | null;
  matchedPathwayVersion?: string | null;
  matchMethod?: string | null;
  matchStatus?: PathwayMatchStatus;
  routeSelected?: 'structured_pathway' | 'clinical_judgment' | null;
  selectedBy?: string;
  confirmedAt?: string | null;
  evidenceSnapshot?: unknown;
  updatedAt?: string;
};

export function readClinicalAssessment(aiAnalysis: unknown): StoredClinicalAssessment | null {
  const raw =
    aiAnalysis && typeof aiAnalysis === 'object'
      ? (aiAnalysis as { clinicalAssessment?: unknown }).clinicalAssessment
      : undefined;
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<StoredClinicalAssessment>;
  return {
    assessmentText: typeof value.assessmentText === 'string' ? value.assessmentText : '',
    normalizedAssessment: value.normalizedAssessment,
    assessmentSource: value.assessmentSource ?? 'pharmacist',
    matchedPathwayId: value.matchedPathwayId ?? null,
    matchedPathwayVersion: value.matchedPathwayVersion ?? null,
    matchMethod: value.matchMethod ?? null,
    matchStatus: value.matchStatus,
    routeSelected: value.routeSelected ?? null,
    selectedBy: value.selectedBy ?? 'pharmacist',
    confirmedAt: value.confirmedAt ?? null,
    evidenceSnapshot: value.evidenceSnapshot,
    updatedAt: value.updatedAt,
  };
}

export function consultationNoteSnapshotText(input: {
  presentingConcern?: string | null;
  items?: Array<{ text?: string } | string>;
  transcript?: string | null;
}): { summary: string; presentingConcern: string; items: string[] } {
  const presentingConcern = (input.presentingConcern ?? '').trim();
  const items = (input.items ?? [])
    .map((item) => (typeof item === 'string' ? item : item.text ?? ''))
    .map((text) => text.trim())
    .filter(Boolean);
  const parts = [presentingConcern, ...items].filter(Boolean);
  if (parts.length) {
    return { summary: parts.join(' · '), presentingConcern, items };
  }
  const transcript = (input.transcript ?? '').trim();
  const firstLine = transcript.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  return {
    summary: firstLine,
    presentingConcern: firstLine,
    items: [],
  };
}
