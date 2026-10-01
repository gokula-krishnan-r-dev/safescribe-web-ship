/**
 * Compatible-product matching for a patient-specific adjusted regimen.
 * Filters and ranks catalogue results; does not decide clinical substitution.
 */

export type AdjustedStrength = {
  value: number;
  unit: string;
};

export type AdjustedProductConstraints = {
  ingredient: string;
  targetStrength: AdjustedStrength;
  form?: string;
  route?: string;
  currentBrand?: string;
};

export type CompatibleProductCandidate = {
  productId: string;
  din?: string;
  brandName?: string;
  genericName: string;
  displayName: string;
  strength: AdjustedStrength;
  strengthDisplay: string;
  formDisplay: string;
  routeDisplay: string;
  manufacturer?: string;
  source?: string;
  label: string;
  compatibility: 'COMPATIBLE';
  preferenceReason?: string;
  /** Catalogue payload the client uses to apply the product. */
  catalogue: Record<string, unknown>;
};

export function compactAdjustedText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function foldAdjustedText(value: string | null | undefined): string {
  return compactAdjustedText(value)
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function toMilligrams(value: number, unit: string): number | null {
  const u = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (u === 'mg' || u === 'milligram' || u === 'milligrams') return value;
  if (u === 'g' || u === 'gram' || u === 'grams') return value * 1000;
  if (u === 'mcg' || u === 'µg' || u === 'ug') return value / 1000;
  return null;
}

export function parseMassAmount(
  raw: string | null | undefined,
): { value: number; unit: string } | null {
  const text = compactAdjustedText(raw);
  const match = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|ug)\b/i);
  if (!match) return null;
  const unit = match[2].toLowerCase() === 'g' ? 'g' : match[2];
  return { value: Number(match[1]), unit };
}

export function strengthsEqual(
  productStrength: string | null | undefined,
  target: AdjustedStrength,
): boolean {
  const parsed = parseMassAmount(productStrength);
  if (!parsed) return false;
  const productMg = toMilligrams(parsed.value, parsed.unit);
  const targetMg = toMilligrams(target.value, target.unit);
  if (productMg == null || targetMg == null) {
    return (
      parsed.value === target.value &&
      foldAdjustedText(parsed.unit) === foldAdjustedText(target.unit)
    );
  }
  return Math.abs(productMg - targetMg) < 0.05;
}

function tokenSet(value: string): Set<string> {
  return new Set(foldAdjustedText(value).split(' ').filter((t) => t.length > 1));
}

export function ingredientMatches(
  product: { genericName?: string; brandName?: string; label?: string },
  ingredient: string,
): boolean {
  const needle = foldAdjustedText(ingredient);
  if (!needle) return false;
  const hay = foldAdjustedText(
    [product.genericName, product.brandName, product.label].filter(Boolean).join(' '),
  );
  if (!hay) return false;
  if (hay.includes(needle)) return true;
  const needles = needle.split(' ').filter(Boolean);
  const tokens = tokenSet(hay);
  return needles.every((part) => tokens.has(part));
}

function normalizeFormToken(value: string): string {
  return foldAdjustedText(value)
    .replace(/\boral\b/g, '')
    .replace(/\bfilm coated\b/g, '')
    .replace(/\bdelayed release\b/g, 'dr')
    .replace(/\bextended release\b/g, 'er')
    .replace(/\btablets\b/g, 'tablet')
    .replace(/\bcapsules\b/g, 'capsule')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formMatches(
  productForm: string | null | undefined,
  targetForm: string | null | undefined,
): boolean {
  const target = normalizeFormToken(targetForm ?? '');
  if (!target) return true;
  const product = normalizeFormToken(productForm ?? '');
  if (!product) return true;
  return product.includes(target) || target.includes(product);
}

export function routeMatches(
  productRoute: string | null | undefined,
  targetRoute: string | null | undefined,
): boolean {
  const target = foldAdjustedText(targetRoute);
  if (!target) return true;
  const product = foldAdjustedText(productRoute);
  if (!product) return true;
  const aliases: Record<string, string[]> = {
    oral: ['oral', 'po', 'by mouth', 'mouth'],
    topical: ['topical', 'skin'],
    vaginal: ['vaginal'],
    rectal: ['rectal'],
  };
  for (const group of Object.values(aliases)) {
    const tHit = group.some((a) => target.includes(a));
    const pHit = group.some((a) => product.includes(a));
    if (tHit) return pHit;
  }
  return product.includes(target) || target.includes(product);
}

export function isProductCompatible(
  product: {
    genericName?: string;
    brandName?: string;
    label?: string;
    strength?: string;
    dosageForm?: string;
    formDisplay?: string;
    routeDisplay?: string;
  },
  constraints: AdjustedProductConstraints,
): boolean {
  if (!ingredientMatches(product, constraints.ingredient)) return false;
  if (!strengthsEqual(product.strength, constraints.targetStrength)) return false;
  if (!formMatches(product.dosageForm || product.formDisplay, constraints.form)) {
    return false;
  }
  if (!routeMatches(product.routeDisplay, constraints.route)) return false;
  return true;
}

export function buildGeneratedSearchText(constraints: AdjustedProductConstraints): string {
  const strength = `${formatStrengthValue(constraints.targetStrength.value)} ${constraints.targetStrength.unit}`;
  const form = compactAdjustedText(constraints.form).toLowerCase();
  return [compactAdjustedText(constraints.ingredient).toLowerCase(), strength, form]
    .filter(Boolean)
    .join(' ');
}

function formatStrengthValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

export function isGenericProduct(product: {
  genericName?: string;
  brandName?: string;
  displayName?: string;
}): boolean {
  const generic = foldAdjustedText(product.genericName);
  const brand = foldAdjustedText(product.brandName);
  if (!brand) return true;
  return Boolean(generic) && brand === generic;
}

export function rankCompatibleCandidates<T extends CompatibleProductCandidate>(
  candidates: T[],
  constraints: AdjustedProductConstraints,
): T[] {
  const currentBrand = foldAdjustedText(constraints.currentBrand);
  return [...candidates].sort((a, b) => {
    const aGeneric = isGenericProduct(a) ? 0 : 1;
    const bGeneric = isGenericProduct(b) ? 0 : 1;
    if (aGeneric !== bGeneric) return aGeneric - bGeneric;
    if (currentBrand) {
      const aBrand = foldAdjustedText(a.brandName) === currentBrand ? 0 : 1;
      const bBrand = foldAdjustedText(b.brandName) === currentBrand ? 0 : 1;
      if (aBrand !== bBrand) return aBrand - bBrand;
    }
    return compactAdjustedText(a.displayName).localeCompare(
      compactAdjustedText(b.displayName),
    );
  });
}

export function pickPreferredCandidateId(
  candidates: CompatibleProductCandidate[],
): string | undefined {
  if (candidates.length === 1) return candidates[0].productId;
  const generics = candidates.filter((c) => isGenericProduct(c));
  if (generics.length === 1) return generics[0].productId;
  return undefined;
}

export function buildRenalRecommendationId(input: {
  treatmentKey: string;
  doseAmount: number;
  doseUnit: string;
  min: number | null;
  max: number | null;
}): string {
  return `renal:${input.treatmentKey}:${input.min ?? ''}-${input.max ?? ''}:${input.doseAmount}${input.doseUnit}`;
}

export function formatAdjustedStrength(strength: AdjustedStrength): string {
  return `${formatStrengthValue(strength.value)} ${strength.unit}`;
}
