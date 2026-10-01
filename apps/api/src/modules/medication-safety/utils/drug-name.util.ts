/**
 * Shared drug-name normalization for medication safety CDS.
 */

const NON_INGREDIENT_TOKENS = new Set([
  'and', 'or', 'with', 'plus', 'hcl', 'hci', 'hydrochloride', 'hydrobromide',
  'maleate', 'succinate', 'tartrate', 'citrate', 'fumarate', 'acetate',
  'phosphate', 'phosphates', 'sulfate', 'sulphate',
  'sodium', 'potassium', 'calcium', 'magnesium',
  'mg', 'mcg', 'g', 'ml', 'tablet', 'tablets', 'capsule', 'capsules', 'oral', 'injection',
  'suspension', 'solution', 'cream', 'ointment', 'gel', 'lotion', 'topical', 'usp', 'bp',
  'for', 'the', 'in', 'of', 'generics', 'generic', 'brand', 'brands', 'preparation',
  'products', 'product', 'systemic', 'strength', 'prescription', 'nonprescription',
  'non', 'otc',
  'nasal', 'intranasal', 'nostril', 'spray', 'rapimelt', 'odt', 'melt', 'wafer',
  'film', 'subcut', 'subcutaneous', 'injectable', 'inhaler', 'puff', 'puffs',
  'drop', 'drops', 'otic', 'ophthalmic', 'patch', 'dermal',
]);

export function normalizeDrugKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitAllergyInputs(input: string[]): string[] {
  const values = new Set<string>();
  for (const item of input) {
    if (item.includes('|') || item.includes(';')) {
      for (const entry of item.split(';')) {
        const drug = entry.split('|')[0]?.trim();
        if (drug && !isNkda(drug)) values.add(drug);
      }
      continue;
    }
    for (const part of item.split(/[,;]/)) {
      const trimmed = part.trim();
      if (trimmed && !isNkda(trimmed)) values.add(trimmed);
    }
  }
  return Array.from(values);
}

export function isNkda(value: string): boolean {
  const n = normalizeDrugKey(value);
  return (
    !n ||
    n === 'nkda' ||
    n === 'nka' ||
    n.includes('no known allerg') ||
    n.includes('no known drug allerg') ||
    n === 'none' ||
    n === 'nil'
  );
}

export function expandDrugTokens(...values: string[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const key = normalizeDrugKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
    const ingredient = resolveBrandToIngredient(key);
    if (ingredient && ingredient !== key && !seen.has(ingredient)) {
      seen.add(ingredient);
      keys.push(ingredient);
    }
  };

  for (const raw of values) {
    if (!raw?.trim()) continue;
    push(raw);
    for (const part of raw.split(/[,;/|&+]|(?:\sand\s)|(?:\sor\s)|(?:\swith\s)|(?:\splus\s)/i)) {
      push(part);
      const paren = part.match(/\(([^)]+)\)/g) ?? [];
      for (const p of paren) push(p.replace(/[()]/g, ''));
      push(part.replace(/\([^)]*\)/g, ' '));
    }
    const normalized = normalizeDrugKey(raw);
    for (const piece of normalized.split(/\s+/)) {
      if (piece.length >= 4 && !NON_INGREDIENT_TOKENS.has(piece) && !/^\d/.test(piece)) {
        push(piece);
      }
    }
  }
  return keys;
}

export function containsIngredient(haystack: string, needle: string): boolean {
  const h = normalizeDrugKey(haystack);
  const n = normalizeDrugKey(needle);
  if (!h || !n || n.length < 4) return false;
  if (h === n) return true;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
  if (re.test(h)) return true;
  const tokens = h.split(/\s+/);
  return tokens.some((t) => t === n || (n.length >= 6 && (t.startsWith(n) || (n.startsWith(t) && t.length >= 6))));
}

export function drugTokensForMed(
  productName: string,
  genericName?: string,
  ingredients: string[] = [],
): string[] {
  const tokens = new Set<string>();
  for (const t of [
    ...expandDrugTokens(productName, genericName ?? ''),
    ...ingredients.map((i) => normalizeDrugKey(i)),
  ]) {
    if (t) tokens.add(t);
  }
  return Array.from(tokens);
}

export function medicationMatchesDrug(
  productName: string,
  genericName: string | undefined,
  ingredients: string[],
  drugName: string,
  opts?: { ignoreRoute?: boolean },
): boolean {
  const needle = normalizeDrugKey(drugName);
  if (!needle) return false;
  // Systemic dose / renal / hepatic rules must not fire on topicals.
  // Allergy and cross-reactivity are route-independent (spec ALG-X01/X02).
  if (
    !opts?.ignoreRoute &&
    isTopicalProductName(productName) &&
    !isTopicalProductName(drugName) &&
    !/\btopical\b/i.test(drugName)
  ) {
    return false;
  }
  const expandedNeedle = resolveBrandToIngredient(needle);
  const haystacks = [productName, genericName ?? '', ...ingredients];
  return haystacks.some((h) => {
    const key = normalizeDrugKey(h);
    const expandedHay = resolveBrandToIngredient(key);
    return (
      key === needle ||
      key === expandedNeedle ||
      expandedHay === needle ||
      expandedHay === expandedNeedle ||
      containsIngredient(h, needle) ||
      containsIngredient(h, expandedNeedle) ||
      containsIngredient(expandedNeedle, h)
    );
  });
}

/** Common CA brand → ingredient aliases when the catalog has not resolved the product. */
const BRAND_TO_INGREDIENT: Record<string, string> = {
  maxalt: 'rizatriptan',
  zomig: 'zolmitriptan',
  imitrex: 'sumatriptan',
  amerge: 'naratriptan',
  relpax: 'eletriptan',
  axert: 'almotriptan',
  frova: 'frovatriptan',
  zofran: 'ondansetron',
  abreva: 'docosanol',
  zovirax: 'acyclovir',
  valtrex: 'valacyclovir',
  famvir: 'famciclovir',
  advil: 'ibuprofen',
  motrin: 'ibuprofen',
  nuprin: 'ibuprofen',
  tylenol: 'acetaminophen',
  panadol: 'acetaminophen',
  aleve: 'naproxen',
  canesten: 'clotrimazole',
  diflucan: 'fluconazole',
  prilosec: 'omeprazole',
  nexium: 'esomeprazole',
  pantoloc: 'pantoprazole',
  pepcid: 'famotidine',
  plavix: 'clopidogrel',
  zocor: 'simvastatin',
  altace: 'ramipril',
  norvasc: 'amlodipine',
  glucophage: 'metformin',
  lamisil: 'terbinafine',
  aldactone: 'spironolactone',
  benadryl: 'diphenhydramine',
  sudafed: 'pseudoephedrine',
};

export function resolveBrandToIngredient(token: string): string {
  const key = normalizeDrugKey(token);
  if (!key) return key;
  if (BRAND_TO_INGREDIENT[key]) return BRAND_TO_INGREDIENT[key];
  const first = key.split(/\s+/)[0] ?? key;
  return BRAND_TO_INGREDIENT[first] ?? key;
}

/** Canonical ingredient identity for a product display name (brand or generic). */
export function canonicalIngredientKey(
  productName: string,
  genericName?: string,
): string {
  if (genericName?.trim()) {
    const fromGeneric = resolveBrandToIngredient(genericName);
    if (fromGeneric) return fromGeneric;
  }
  return resolveBrandToIngredient(productName);
}

/** Formulation markers used for topical vs systemic routing. */
export function isTopicalProductName(name: string): boolean {
  const n = normalizeDrugKey(name);
  if (!n) return false;
  // Intranasal migraine products are systemic — "spray" alone is not dermatologic.
  if (/\b(nasal|intranasal|nostril)\b/.test(n)) return false;
  return /\b(cream|ointment|gel|lotion|topical|patch|dermal|spray)\b/.test(n);
}

/**
 * Significant single-token drug roots (filters formulation noise such as
 * "generics", "cream", strength numbers).
 */
export function significantDrugTokens(...values: string[]): string[] {
  const out = new Set<string>();
  for (const t of expandDrugTokens(...values)) {
    if (!t || NON_INGREDIENT_TOKENS.has(t)) continue;
    // Prefer single-word tokens over multi-word product phrases.
    if (t.includes(' ')) {
      for (const piece of t.split(/\s+/)) {
        if (
          piece.length >= 5 &&
          !NON_INGREDIENT_TOKENS.has(piece) &&
          !/^\d/.test(piece)
        ) {
          out.add(piece);
        }
      }
      continue;
    }
    if (t.length >= 5 && !/^\d/.test(t)) out.add(t);
  }
  return Array.from(out);
}

/**
 * Attribute a finding only to the product it implicated. Does not spill across
 * different products that merely share label words (e.g. "generics").
 */
export function findingsApplyToProduct(
  implicatedProductName: string,
  medicationName: string,
  genericName?: string,
): boolean {
  const implicated = implicatedProductName.trim();
  if (!implicated) return false;
  const candidates = [medicationName, genericName ?? ''].map((s) => s.trim()).filter(Boolean);
  if (!candidates.length) return false;

  const stripParens = (s: string) =>
    normalizeDrugKey(s.replace(/\([^)]*\)/g, ' ').replace(/®|™/g, ' '));

  const implicatedKey = normalizeDrugKey(implicated);
  const implicatedCore = stripParens(implicated);
  const implicatedIngredient = canonicalIngredientKey(implicated);

  for (const name of candidates) {
    const nameKey = normalizeDrugKey(name);
    const nameCore = stripParens(name);
    if (nameKey && (nameKey === implicatedKey || nameCore === implicatedCore)) return true;
    // Product line variants: "Acyclovir" ↔ "Acyclovir Oral" / "Acyclovir 5% Cream"
    // must still respect topical vs systemic routing.
    const aTopical = isTopicalProductName(implicated);
    const bTopical = isTopicalProductName(name) || isTopicalProductName(genericName ?? '');
    if (aTopical !== bTopical) continue;

    const candidateIngredient = canonicalIngredientKey(name, genericName);
    if (
      implicatedIngredient &&
      candidateIngredient &&
      implicatedIngredient === candidateIngredient
    ) {
      return true;
    }

    const aRoots = significantDrugTokens(implicated).map(resolveBrandToIngredient);
    const bRoots = significantDrugTokens(name, genericName ?? '').map(resolveBrandToIngredient);
    if (!aRoots.length || !bRoots.length) continue;
    const shareIngredient = aRoots.some((r) => bRoots.includes(r));
    if (shareIngredient) return true;
  }
  return false;
}
