import type { PathwayQaCase, PathwayQaMatchSuggestion } from './pathway-qa.types';

const STOP = new Set([
  'the',
  'and',
  'of',
  'a',
  'an',
  'for',
  'to',
  'in',
  'non',
  'type',
]);

const ALIASES: Record<string, string[]> = {
  uti: ['cystitis', 'uncomplicated cystitis'],
  aom: ['otitis media'],
  aoe: ['otitis externa'],
  cap: ['pneumonia', 'community acquired pneumonia'],
  gerd: ['gastroesophageal', 'reflux'],
  ed: ['erectile dysfunction'],
  vvc: ['vulvovaginal', 'yeast'],
  hsv: ['herpes', 'labialis', 'cold sores'],
  gas: ['streptococcal', 'pharyngitis'],
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[()[\]{},./\\|+]+/g, ' ')
    .replace(/['’]/g, '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function expand(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const token of tokens) {
    for (const alias of ALIASES[token] ?? []) {
      for (const piece of tokenize(alias)) out.add(piece);
    }
  }
  return out;
}

export function scoreConditionMatch(left: string, right: string): number {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return 0;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.92;

  const aTokens = expand(tokenize(a));
  const bTokens = expand(tokenize(b));
  if (!aTokens.size || !bTokens.size) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = overlap / union;
  const coverage = overlap / Math.min(aTokens.size, bTokens.size);
  return Math.max(jaccard, coverage * 0.9);
}

export function matchPathwayCondition(
  pathwayName: string,
  pathwayCondition: string,
  cases: PathwayQaCase[],
): { condition: string | null; score: number; suggestions: PathwayQaMatchSuggestion[] } {
  const counts = new Map<string, number>();
  for (const item of cases) {
    counts.set(item.condition, (counts.get(item.condition) ?? 0) + 1);
  }
  const unique = [...counts.keys()];
  const scored = unique
    .map((condition) => ({
      condition,
      score: Math.max(
        scoreConditionMatch(pathwayCondition, condition),
        scoreConditionMatch(pathwayName, condition) * 0.96,
      ),
      caseCount: counts.get(condition) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const accepted = best && best.score >= 0.55 ? best : null;
  return {
    condition: accepted?.condition ?? null,
    score: accepted?.score ?? best?.score ?? 0,
    suggestions: scored.slice(0, 5),
  };
}
