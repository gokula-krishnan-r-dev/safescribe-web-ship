import { normalizeDrugKey } from './drug-name.util';

export interface CachedClassTaxonomyEntry {
  className: string;
  parentClass: string | null;
  therapeuticGroup: string | null;
  riskTags: string[];
}

export interface CachedClassIndex {
  /** Drug/ingredient token → direct assigned class names (normalized). */
  drugToDirectClasses: Record<string, string[]>;
  /** Class name → taxonomy metadata. */
  taxonomy: Record<string, CachedClassTaxonomyEntry>;
  /** Drug token → brand aliases for matching (normalized). */
  brandAliases: Record<string, string[]>;
}

export function parseRiskTags(value: string | undefined): string[] {
  if (!value?.trim() || value.trim() === '—' || value.trim() === '-') return [];
  return value
    .split(/[,;|]/)
    .map((t) => normalizeDrugKey(t))
    .filter(Boolean);
}

export function parseBrandList(value: string | undefined): string[] {
  if (!value?.trim() || value.trim() === '—' || value.trim() === '-') return [];
  return value
    .split(/[,;|]/)
    .map((t) => normalizeDrugKey(t))
    .filter(Boolean);
}

/** Collect direct classes for entity tokens (drug names, ingredients). */
export function resolveDirectClasses(
  tokens: string[],
  drugToDirectClasses: Record<string, string[]>,
): Set<string> {
  const classes = new Set<string>();
  for (const token of tokens) {
    const key = normalizeDrugKey(token);
    if (!key) continue;
    for (const cls of drugToDirectClasses[key] ?? []) {
      classes.add(cls);
    }
  }
  return classes;
}

/** Walk parent_class chain to include all ancestor classes. */
export function expandClassAncestors(
  directClasses: Set<string>,
  taxonomy: Record<string, CachedClassTaxonomyEntry>,
): Set<string> {
  const expanded = new Set<string>(directClasses);
  const queue = [...directClasses];
  const visited = new Set<string>();

  while (queue.length) {
    const cls = queue.shift()!;
    if (visited.has(cls)) continue;
    visited.add(cls);

    const entry = taxonomy[cls];
    if (!entry?.parentClass) continue;

    const parent = normalizeDrugKey(entry.parentClass);
    if (!parent) continue;

    if (!expanded.has(parent)) {
      expanded.add(parent);
      queue.push(parent);
    }
  }

  return expanded;
}

/** Full expanded class set for an entity (direct + parent classes). */
export function resolveExpandedClasses(
  tokens: string[],
  index: CachedClassIndex,
): Set<string> {
  const direct = resolveDirectClasses(tokens, index.drugToDirectClasses);
  return expandClassAncestors(direct, index.taxonomy);
}

/**
 * True when a MEMBER_OF_CLASS concept matches entity classes.
 * Matches direct class, parent class, or when concept is an ancestor of a direct class.
 */
export function classConceptMatches(
  conceptText: string,
  entityExpandedClasses: Set<string>,
): boolean {
  const concept = normalizeDrugKey(conceptText);
  if (!concept) return false;
  return entityExpandedClasses.has(concept);
}

export function buildClassIndex(input: {
  taxonomyRows: Array<{
    className: string;
    parentClass?: string | null;
    therapeuticGroup?: string | null;
    riskTags?: string[];
  }>;
  catalogRows: Array<{
    drugName: string;
    className: string;
    ingredient?: string | null;
    commonBrands?: string[];
  }>;
  membershipRows: Array<{ drugName: string; className: string }>;
}): CachedClassIndex {
  const taxonomy: Record<string, CachedClassTaxonomyEntry> = {};
  for (const row of input.taxonomyRows) {
    const className = normalizeDrugKey(row.className);
    if (!className) continue;
    taxonomy[className] = {
      className,
      parentClass: row.parentClass ? normalizeDrugKey(row.parentClass) : null,
      therapeuticGroup: row.therapeuticGroup?.trim() || null,
      riskTags: row.riskTags ?? [],
    };
  }

  const drugToDirectClasses: Record<string, string[]> = {};
  const brandAliases: Record<string, string[]> = {};

  const assignClass = (drugToken: string, className: string) => {
    const drug = normalizeDrugKey(drugToken);
    const cls = normalizeDrugKey(className);
    if (!drug || !cls) return;
    if (!drugToDirectClasses[drug]) drugToDirectClasses[drug] = [];
    if (!drugToDirectClasses[drug].includes(cls)) {
      drugToDirectClasses[drug].push(cls);
    }
  };

  for (const row of input.catalogRows) {
    const cls = normalizeDrugKey(row.className);
    assignClass(row.drugName, cls);
    if (row.ingredient) assignClass(row.ingredient, cls);
    const drugKey = normalizeDrugKey(row.drugName);
    if (row.commonBrands?.length) {
      brandAliases[drugKey] = row.commonBrands.map((b) => normalizeDrugKey(b));
      for (const brand of row.commonBrands) {
        assignClass(brand, cls);
      }
    }
  }

  for (const row of input.membershipRows) {
    assignClass(row.drugName, row.className);
  }

  return { drugToDirectClasses, taxonomy, brandAliases };
}

export function resolveDrugFromCatalog(
  productName: string,
  genericName: string | undefined,
  brandAliases: Record<string, string[]>,
): string | null {
  const product = normalizeDrugKey(productName);
  const generic = genericName ? normalizeDrugKey(genericName) : '';

  for (const [drugKey, brands] of Object.entries(brandAliases)) {
    if (product === drugKey || generic === drugKey) return drugKey;
    if (brands.some((b) => product === b || (generic && generic === b))) return drugKey;
    // Substring brand match only for substantial tokens (avoid "ace" ⊂ acetaminophen).
    if (
      brands.some(
        (b) =>
          b.length >= 5 &&
          (product === b ||
            (generic && generic === b) ||
            (product.length >= 5 && (product.includes(b) || b.includes(product))) ||
            (generic.length >= 5 && (generic.includes(b) || b.includes(generic)))),
      )
    ) {
      return drugKey;
    }
  }
  return null;
}
