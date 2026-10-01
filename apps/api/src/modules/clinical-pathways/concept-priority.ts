/**
 * Curate clinical concepts to a production-ready shortlist for pathway authoring.
 * Pharmacist pathways work best with a focused set of high-value concepts.
 */

export const MAX_CLINICAL_CONCEPTS = 20;

/** Category priority for pharmacist minor-ailment pathways (lower = more important). */
const CATEGORY_RANK: Record<string, number> = {
  RED_FLAG: 0,
  ELIGIBILITY: 1,
  DIFFERENTIAL: 2,
  TREATMENT: 3,
  DIAGNOSIS: 4,
  SYMPTOM: 5,
  HISTORY: 6,
  COUNSELLING: 7,
  FOLLOW_UP: 8,
  LAB: 9,
  PHYSICAL_EXAM: 10,
  OTHER: 11,
};

const IMPORTANCE_RANK: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export interface RankableConcept {
  category: string;
  label: string;
  importance?: string | null;
  confidence?: number | null;
}

function importanceRank(v?: string | null) {
  return IMPORTANCE_RANK[String(v || 'MEDIUM').toUpperCase()] ?? 1;
}

function categoryRank(v?: string | null) {
  return CATEGORY_RANK[String(v || 'OTHER').toUpperCase()] ?? 11;
}

/** Soft per-category caps so the shortlist stays clinically balanced. */
const CATEGORY_SOFT_CAP: Record<string, number> = {
  RED_FLAG: 5,
  ELIGIBILITY: 3,
  DIFFERENTIAL: 3,
  TREATMENT: 3,
  DIAGNOSIS: 2,
  SYMPTOM: 3,
  HISTORY: 2,
  COUNSELLING: 2,
  FOLLOW_UP: 2,
  LAB: 1,
  PHYSICAL_EXAM: 1,
  OTHER: 1,
};

/**
 * Rank and keep the most important concepts (default max 20).
 * Prefers HIGH importance + safety categories, with soft per-category caps.
 */
export function selectTopConcepts<T extends RankableConcept>(
  concepts: T[],
  max = MAX_CLINICAL_CONCEPTS,
): T[] {
  if (concepts.length <= max) return concepts;

  const sorted = [...concepts].sort((a, b) => {
    const byImp = importanceRank(a.importance) - importanceRank(b.importance);
    if (byImp !== 0) return byImp;
    const byCat = categoryRank(a.category) - categoryRank(b.category);
    if (byCat !== 0) return byCat;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  const selected: T[] = [];
  const perCat = new Map<string, number>();
  const deferred: T[] = [];

  for (const c of sorted) {
    if (selected.length >= max) break;
    const cat = String(c.category || 'OTHER').toUpperCase();
    const used = perCat.get(cat) ?? 0;
    const soft = CATEGORY_SOFT_CAP[cat] ?? 1;
    if (used >= soft) {
      deferred.push(c);
      continue;
    }
    selected.push(c);
    perCat.set(cat, used + 1);
  }

  for (const c of deferred) {
    if (selected.length >= max) break;
    selected.push(c);
  }

  return selected;
}
