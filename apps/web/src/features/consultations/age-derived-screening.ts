/**
 * Derive Yes/No answers for age-gated safety screening questions from
 * patient demographics (Assessment step Age field).
 *
 * Deterministic and pathway-text based — never invents questions.
 */

export type AgeGateKind =
  | 'younger_than' // age < threshold → Yes
  | 'or_younger' // age ≤ threshold → Yes
  | 'older_than' // age > threshold → Yes
  | 'or_older'; // age ≥ threshold → Yes

export interface AgeGateCriterion {
  kind: AgeGateKind;
  thresholdYears: number;
}

export type AgeDerivedScreenAnswer = 'yes' | 'no';

/** Convert demographics age (+ unit) to decimal years. */
export function ageInYears(
  age?: string | number | null,
  ageUnit?: 'years' | 'months' | string | null,
): number | null {
  if (age === null || age === undefined || age === '') return null;
  const n = typeof age === 'number' ? age : Number(String(age).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  if (ageUnit === 'months') return n / 12;
  return n;
}

/**
 * Parse an age-gate criterion from pathway red-flag question text.
 * Returns null when the question is not an age gate (most screening items).
 */
export function parseAgeGateCriterion(question: string): AgeGateCriterion | null {
  const q = String(question ?? '').trim();
  if (!q) return null;

  // Prefer inclusive phrasings first so "12 or younger" ≠ "younger than 12"
  const orYounger = q.match(
    /(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yo|y\.?o\.?)?(?:\s+of\s+age)?\s+or\s+younger\b/i,
  );
  if (orYounger) {
    return { kind: 'or_younger', thresholdYears: Number(orYounger[1]) };
  }

  const orOlder = q.match(
    /(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yo|y\.?o\.?)?(?:\s+of\s+age)?\s+or\s+older\b/i,
  );
  if (orOlder) {
    return { kind: 'or_older', thresholdYears: Number(orOlder[1]) };
  }

  const lte = q.match(/(?:≤|<=)\s*(\d+(?:\.\d+)?)/);
  if (lte) {
    return { kind: 'or_younger', thresholdYears: Number(lte[1]) };
  }

  const gte = q.match(/(?:≥|>=)\s*(\d+(?:\.\d+)?)/);
  if (gte) {
    return { kind: 'or_older', thresholdYears: Number(gte[1]) };
  }

  const younger = q.match(
    /(?:younger\s+than|under|less\s+than|below|aged?\s+under|age\s*[<＜])\s*(\d+(?:\.\d+)?)/i,
  );
  if (younger) {
    return { kind: 'younger_than', thresholdYears: Number(younger[1]) };
  }

  const older = q.match(
    /(?:older\s+than|over|greater\s+than|aged?\s+over|age\s*[>＞])\s*(\d+(?:\.\d+)?)/i,
  );
  if (older) {
    return { kind: 'older_than', thresholdYears: Number(older[1]) };
  }

  return null;
}

export function evaluateAgeGate(
  criterion: AgeGateCriterion,
  years: number,
): AgeDerivedScreenAnswer {
  const t = criterion.thresholdYears;
  switch (criterion.kind) {
    case 'younger_than':
      return years < t ? 'yes' : 'no';
    case 'or_younger':
      return years <= t ? 'yes' : 'no';
    case 'older_than':
      return years > t ? 'yes' : 'no';
    case 'or_older':
      return years >= t ? 'yes' : 'no';
    default:
      return 'no';
  }
}

export interface AgeDerivedFill {
  id: string;
  answer: AgeDerivedScreenAnswer;
  criterion: AgeGateCriterion;
  ageYears: number;
}

/**
 * For each screening item whose question is an age gate, derive Yes/No from
 * patient age. Items that are not age gates are omitted.
 */
export function deriveAgeGateAnswers(
  items: ReadonlyArray<{ id: string; question: string }>,
  age?: string | number | null,
  ageUnit?: 'years' | 'months' | string | null,
): AgeDerivedFill[] {
  const years = ageInYears(age, ageUnit);
  if (years === null) return [];

  const out: AgeDerivedFill[] = [];
  for (const item of items) {
    const criterion = parseAgeGateCriterion(item.question);
    if (!criterion || !Number.isFinite(criterion.thresholdYears)) continue;
    out.push({
      id: item.id,
      answer: evaluateAgeGate(criterion, years),
      criterion,
      ageYears: years,
    });
  }
  return out;
}

/** Human-readable chip for auto-filled age answers. */
export function formatAgeDerivedHint(ageYears: number, ageUnit?: string | null): string {
  if (ageUnit === 'months') {
    const months = Math.round(ageYears * 12);
    return `From patient age (${months} mo)`;
  }
  const rounded =
    Number.isInteger(ageYears) || Math.abs(ageYears - Math.round(ageYears)) < 1e-9
      ? String(Math.round(ageYears))
      : ageYears.toFixed(1).replace(/\.0$/, '');
  const unit = rounded === '1' ? 'year' : 'years';
  return `From patient age (${rounded} ${unit})`;
}
