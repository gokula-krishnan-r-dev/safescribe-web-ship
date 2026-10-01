/**
 * Medication product matching / clinical normalization for Renew.
 * Preserve source product identity. Normalize underneath. Ask the pharmacist
 * only when remaining candidates are clinically distinct.
 */

import { lookupMedicationProductPrefix } from './medication-product-prefixes';

export const MEDICATION_RESOLVER_VERSION = '2.0';

export type MedicationMatchMethod =
  | 'DIN_EXACT'
  | 'PRODUCT_NAME_EXACT'
  | 'PRODUCT_NAME_STRENGTH'
  | 'GENERIC_NORMALIZED'
  | 'PHARMACIST_SELECTED'
  | 'UNRESOLVED';

export type MedicationResolutionStatus =
  | 'AUTO_RESOLVED'
  | 'PHARMACIST_REVIEW_REQUIRED'
  | 'UNRESOLVED';

export type MedicationReleaseType = 'IMMEDIATE' | 'EXTENDED' | 'DELAYED' | 'UNKNOWN';

export interface MedicationProductIdentity {
  sourceDisplayName: string;
  productName?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  din?: string | null;
  dpdProductId?: string | null;
  ccddManufacturedProductId?: string | null;
  matchMethod: MedicationMatchMethod;
  matchConfidence: number;
  isExplicitProduct?: boolean;
}

export interface MedicationClinicalIdentity {
  ingredientIds: string[];
  ingredientNames: string[];
  strength?: string | null;
  route?: string | null;
  dosageForm?: string | null;
  releaseType?: MedicationReleaseType | null;
  ccddClinicalConceptId?: string | null;
  drugClassIds?: string[];
}

export interface MedicationResolverCandidate {
  id: string;
  label: string;
  brandName?: string | null;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  route?: string | null;
  din?: string | null;
  manufacturer?: string | null;
  conceptType?: 'mp' | 'ntp' | 'tm' | 'unknown';
  codeDisplay?: string | null;
}

export interface ExtractedMedicationInput {
  rawName: string;
  din?: string | null;
  brandName?: string | null;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  route?: string | null;
}

export interface ParsedProductName {
  rawName: string;
  normalizedName: string;
  manufacturerPrefix?: string;
  manufacturerName?: string;
  baseIngredientCandidate?: string;
  isExplicitProduct: boolean;
}

export interface ResolvedMedicationCandidate extends MedicationResolverCandidate {
  clinicalDifference?: string | null;
  pharmacistDisplayName: string;
  pharmacistDetail: string;
}

export interface MedicationResolution {
  status: MedicationResolutionStatus;
  reason?: 'CLINICALLY_DISTINCT_MATCHES' | 'EXACT_PRODUCT_NOT_FOUND' | 'NO_MATCH';
  displayName: string;
  productIdentity: MedicationProductIdentity;
  clinicalIdentity: MedicationClinicalIdentity;
  selectedCandidate?: MedicationResolverCandidate | null;
  candidates: ResolvedMedicationCandidate[];
  trace: {
    resolverVersion: string;
    matchMethod: MedicationMatchMethod;
    candidateCountRaw: number;
    candidateCountAfterProductFilter: number;
    candidateCountClinicallyDistinct: number;
    autoResolved: boolean;
  };
}

const STRENGTH_TOKEN_RE =
  /\b\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:mg|mcg|ug|µg|g|ml|iu|units?|%)\b/gi;
const FORM_TOKEN_RE =
  /\b(tabs?|tablets?|caps?|capsules?|chewable|odt|xr|xl|er|sr|cr|dr|ir|ec|hctz|oral|delayed[\s-]?release|extended[\s-]?release|immediate[\s-]?release|enteric[\s-]?coated|film[\s-]?coated)\b/gi;

export function normalizeProductName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[™®]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectConceptType(id: string | null | undefined): 'mp' | 'ntp' | 'tm' | 'unknown' {
  if (!id) return 'unknown';
  if (id.includes('-mp-')) return 'mp';
  if (id.includes('-ntp-')) return 'ntp';
  if (id.includes('-tm-')) return 'tm';
  return 'unknown';
}

export function parseProductName(rawName: string): ParsedProductName {
  const raw = rawName.trim();
  const normalizedName = normalizeProductName(raw);
  const hyphen = raw.match(/^([A-Za-z]{2,10})\s*[-–]\s*([A-Za-z].+)$/);
  const spaced = raw.match(/^([A-Za-z]{2,10})\s+([A-Za-z].+)$/);
  const prefixToken = hyphen?.[1] ?? null;
  const known = prefixToken ? lookupMedicationProductPrefix(prefixToken) : null;
  const hyphenatedHouseBrand = Boolean(hyphen && prefixToken && prefixToken.length <= 8);

  const withoutStrength = normalizedName
    .replace(STRENGTH_TOKEN_RE, ' ')
    .replace(FORM_TOKEN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const ingredientGuess = known
    ? withoutStrength.replace(new RegExp(`^${known.prefix}\\s*-?\\s*`, 'i'), '').trim()
    : withoutStrength.replace(/^[A-Z]{2,10}\s*-?\s*/, '').trim();

  return {
    rawName: raw,
    normalizedName: withoutStrength || normalizedName,
    manufacturerPrefix: known?.prefix ?? (hyphenatedHouseBrand ? prefixToken!.toUpperCase() : undefined),
    manufacturerName: known?.manufacturerName,
    baseIngredientCandidate: ingredientGuess ? ingredientGuess.toLowerCase() : undefined,
    isExplicitProduct: Boolean(known || hyphenatedHouseBrand),
  };
}

export function inferReleaseType(form?: string | null): MedicationReleaseType {
  const text = (form ?? '').toLowerCase();
  if (/\b(er|xr|xl|sr|cr|extended|sustained|controlled|long[\s-]?acting)\b/.test(text)) {
    return 'EXTENDED';
  }
  if (/\b(dr|delayed|enteric)\b/.test(text)) return 'DELAYED';
  if (/\b(ir|immediate)\b/.test(text)) return 'IMMEDIATE';
  return 'UNKNOWN';
}

export function dosageFormFamily(form?: string | null): string {
  const text = (form ?? '').toLowerCase();
  if (/\binject|pen|syringe|vial\b/.test(text)) return 'injection';
  if (/\bcapsule|cap\b/.test(text)) return 'capsule';
  if (/\btablet|tab\b/.test(text)) return 'tablet';
  if (/\bsuspension|solution|syrup|liquid\b/.test(text)) return 'liquid';
  if (/\bcream|ointment|gel|lotion\b/.test(text)) return 'topical';
  if (/\binhaler|puff|spray\b/.test(text)) return 'inhaled';
  return text.replace(/[^a-z0-9]+/g, ' ').trim() || 'unknown';
}

export function normalizeStrengthSignature(strength?: string | null): string | null {
  if (!strength?.trim()) return null;
  return strength
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/µg/g, 'mcg')
    .replace(/micrograms?/g, 'mcg')
    .replace(/milligrams?/g, 'mg');
}

function ingredientTokens(...values: Array<string | null | undefined>): string[] {
  const skip = new Set([
    'oral',
    'tablet',
    'tablets',
    'tab',
    'capsule',
    'capsules',
    'cap',
    'mg',
    'mcg',
    'ml',
    'delayed',
    'extended',
    'release',
    'enteric',
    'coated',
    'film',
  ]);
  const out = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const cleaned = value
      .toLowerCase()
      .replace(/[™®]/g, '')
      .replace(/[-_/(),]+/g, ' ')
      .replace(/\d+(?:\.\d+)?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    for (const token of cleaned.split(' ')) {
      if (token.length < 3 || skip.has(token)) continue;
      out.add(token);
    }
  }
  return [...out].sort();
}

export function clinicalKey(candidate: Pick<MedicationResolverCandidate, 'genericName' | 'brandName' | 'strength' | 'dosageForm' | 'route'>): string {
  return [
    ingredientTokens(candidate.genericName, candidate.brandName).join('+') || 'unknown',
    normalizeStrengthSignature(candidate.strength) || '',
    (candidate.route ?? 'oral').toLowerCase().replace(/[^a-z]/g, '') || '',
    inferReleaseType(candidate.dosageForm),
    dosageFormFamily(candidate.dosageForm),
  ].join('|');
}

export function strengthEquivalent(a?: string | null, b?: string | null): boolean {
  const left = normalizeStrengthSignature(a);
  const right = normalizeStrengthSignature(b);
  if (!left || !right) return true;
  return left === right;
}

export function dosageFormCompatible(a?: string | null, b?: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return true;
  const left = dosageFormFamily(a);
  const right = dosageFormFamily(b);
  if (left === 'unknown' || right === 'unknown') return true;
  return left === right;
}

export function routeCompatible(a?: string | null, b?: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return true;
  const left = a.toLowerCase().replace(/[^a-z]/g, '');
  const right = b.toLowerCase().replace(/[^a-z]/g, '');
  return left === right || left.includes(right) || right.includes(left);
}

function coreProductName(name: string): string {
  return normalizeProductName(name)
    .replace(STRENGTH_TOKEN_RE, ' ')
    .replace(FORM_TOKEN_RE, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameProductIdentity(candidateName: string, inputProductName: string): boolean {
  const a = coreProductName(candidateName);
  const b = coreProductName(inputProductName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
  const compactA = a.replace(/[\s-]+/g, '');
  const compactB = b.replace(/[\s-]+/g, '');
  return compactA === compactB;
}

function candidateProductName(candidate: MedicationResolverCandidate): string {
  return candidate.brandName || candidate.label || candidate.genericName || '';
}

export function collapseEquivalentCandidates(
  candidates: MedicationResolverCandidate[],
): MedicationResolverCandidate[][] {
  const groups = new Map<string, MedicationResolverCandidate[]>();
  for (const candidate of candidates) {
    const key = clinicalKey(candidate);
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }
  return [...groups.values()];
}

export function scoreMedicationMatch(
  candidate: MedicationResolverCandidate,
  input: ExtractedMedicationInput,
  parsed: ParsedProductName,
): number {
  let score = 0;
  const din = (input.din ?? '').replace(/\D/g, '');
  const candidateDin = (candidate.din ?? '').replace(/\D/g, '');
  if (din && candidateDin && din === candidateDin) score += 100;
  if (sameProductIdentity(candidateProductName(candidate), parsed.normalizedName)) score += 60;
  if (strengthEquivalent(candidate.strength, input.strength) && input.strength) score += 20;
  if (routeCompatible(candidate.route, input.route) && input.route) score += 10;
  if (dosageFormCompatible(candidate.dosageForm, input.dosageForm) && input.dosageForm) score += 10;
  if (
    parsed.manufacturerPrefix &&
    normalizeProductName(candidateProductName(candidate)).startsWith(parsed.manufacturerPrefix)
  ) {
    score += 20;
  }
  if (
    parsed.baseIngredientCandidate &&
    (candidate.genericName ?? '').toLowerCase().includes(parsed.baseIngredientCandidate.split(' ')[0] ?? '')
  ) {
    score += 10;
  }
  const type = candidate.conceptType ?? detectConceptType(candidate.id);
  if (parsed.isExplicitProduct && type === 'mp') score += 15;
  if (!parsed.isExplicitProduct && type === 'ntp') score += 15;
  if (!parsed.isExplicitProduct && type === 'mp') score -= 8;
  if (type === 'tm' && input.strength) score -= 12;

  if (
    parsed.isExplicitProduct &&
    !sameProductIdentity(candidateProductName(candidate), parsed.normalizedName) &&
    lookupMedicationProductPrefix(candidateProductName(candidate).split(/[\s-]/)[0] ?? '')
  ) {
    score -= 50;
  }
  if (input.strength && candidate.strength && !strengthEquivalent(candidate.strength, input.strength)) {
    score -= 100;
  }
  if (inferReleaseType(input.dosageForm) !== 'UNKNOWN' && inferReleaseType(candidate.dosageForm) !== 'UNKNOWN') {
    if (inferReleaseType(input.dosageForm) !== inferReleaseType(candidate.dosageForm)) score -= 100;
  }
  return score;
}

function selectPreferredProduct(group: MedicationResolverCandidate[], input: ExtractedMedicationInput, parsed: ParsedProductName) {
  return [...group].sort((a, b) => scoreMedicationMatch(b, input, parsed) - scoreMedicationMatch(a, input, parsed))[0];
}

function pharmacistDisplayName(candidate: MedicationResolverCandidate): string {
  const generic = candidate.genericName?.trim();
  const brand = candidate.brandName?.trim();
  if (generic && brand && generic.toLowerCase() !== brand.toLowerCase()) {
    return `${generic} · ${brand}`;
  }
  return brand || generic || candidate.label;
}

function pharmacistDetail(candidate: MedicationResolverCandidate): string {
  const parts = [
    candidate.genericName,
    candidate.strength,
    candidate.dosageForm,
    candidate.din ? `DIN: ${candidate.din}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function clinicalDifferenceForGroup(
  group: MedicationResolverCandidate[],
  allGroups: MedicationResolverCandidate[][],
): string | null {
  if (allGroups.length < 2) return null;
  const sample = group[0];
  if (!sample) return null;
  const release = inferReleaseType(sample.dosageForm);
  const releases = new Set(allGroups.map((g) => inferReleaseType(g[0]?.dosageForm)));
  if (releases.size > 1 && release !== 'UNKNOWN') {
    return release === 'EXTENDED'
      ? 'Extended release'
      : release === 'DELAYED'
        ? 'Delayed release'
        : 'Immediate release';
  }
  const forms = new Set(allGroups.map((g) => dosageFormFamily(g[0]?.dosageForm)));
  if (forms.size > 1) return sample.dosageForm || dosageFormFamily(sample.dosageForm);
  const salts = new Set(
    allGroups.map((g) => ingredientTokens(g[0]?.genericName, g[0]?.brandName).join(' ')),
  );
  if (salts.size > 1) return sample.genericName || sample.brandName || null;
  return sample.dosageForm || sample.strength || null;
}

function clinicalIdentityFrom(
  candidate: MedicationResolverCandidate | null,
  input: ExtractedMedicationInput,
  parsed: ParsedProductName,
): MedicationClinicalIdentity {
  const ingredientNames = candidate
    ? ingredientTokens(candidate.genericName).length
      ? [candidate.genericName!.split(/[,(]/)[0]!.trim().toLowerCase()]
      : parsed.baseIngredientCandidate
        ? [parsed.baseIngredientCandidate]
        : []
    : parsed.baseIngredientCandidate
      ? [parsed.baseIngredientCandidate]
      : [];
  return {
    ingredientIds: candidate?.id ? [candidate.id] : [],
    ingredientNames,
    strength: candidate?.strength ?? input.strength ?? null,
    route: candidate?.route ?? input.route ?? null,
    dosageForm: candidate?.dosageForm ?? input.dosageForm ?? null,
    releaseType: inferReleaseType(candidate?.dosageForm ?? input.dosageForm),
    ccddClinicalConceptId: candidate?.id ?? null,
    drugClassIds: [],
  };
}

function emptyClinical(input: ExtractedMedicationInput, parsed: ParsedProductName): MedicationClinicalIdentity {
  return clinicalIdentityFrom(null, input, parsed);
}

function compatibleWithInput(candidate: MedicationResolverCandidate, input: ExtractedMedicationInput): boolean {
  return (
    strengthEquivalent(candidate.strength, input.strength) &&
    dosageFormCompatible(candidate.dosageForm, input.dosageForm) &&
    routeCompatible(candidate.route, input.route)
  );
}

function dinOf(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function toResolved(
  candidate: MedicationResolverCandidate,
  difference?: string | null,
): ResolvedMedicationCandidate {
  return {
    ...candidate,
    clinicalDifference: difference ?? null,
    pharmacistDisplayName: pharmacistDisplayName(candidate),
    pharmacistDetail: pharmacistDetail(candidate),
  };
}

function autoResolve(
  input: ExtractedMedicationInput,
  parsed: ParsedProductName,
  candidate: MedicationResolverCandidate,
  method: MedicationMatchMethod,
  confidence: number,
  rawCount: number,
  productFilterCount: number,
  distinctCount: number,
): MedicationResolution {
  const productName = parsed.isExplicitProduct
    ? coreProductName(parsed.normalizedName)
    : coreProductName(candidate.brandName || parsed.normalizedName);
  return {
    status: 'AUTO_RESOLVED',
    displayName: [candidate.brandName || input.rawName, candidate.strength, candidate.dosageForm]
      .filter(Boolean)
      .join(' '),
    productIdentity: {
      sourceDisplayName: input.rawName,
      productName,
      brandName: candidate.brandName ?? null,
      manufacturer: candidate.manufacturer ?? parsed.manufacturerName ?? null,
      din: candidate.din ?? input.din ?? null,
      ccddManufacturedProductId: (candidate.conceptType ?? detectConceptType(candidate.id)) === 'mp' ? candidate.id : null,
      matchMethod: method,
      matchConfidence: confidence,
      isExplicitProduct: parsed.isExplicitProduct,
    },
    clinicalIdentity: clinicalIdentityFrom(candidate, input, parsed),
    selectedCandidate: candidate,
    candidates: [],
    trace: {
      resolverVersion: MEDICATION_RESOLVER_VERSION,
      matchMethod: method,
      candidateCountRaw: rawCount,
      candidateCountAfterProductFilter: productFilterCount,
      candidateCountClinicallyDistinct: distinctCount,
      autoResolved: true,
    },
  };
}

function unresolvedResult(
  input: ExtractedMedicationInput,
  parsed: ParsedProductName,
  reason: MedicationResolution['reason'],
  rawCount: number,
  productFilterCount: number,
  clinicalFrom?: MedicationResolverCandidate | null,
): MedicationResolution {
  return {
    status: 'UNRESOLVED',
    reason,
    displayName: input.rawName,
    productIdentity: {
      sourceDisplayName: input.rawName,
      productName: parsed.normalizedName,
      brandName: input.brandName ?? null,
      manufacturer: parsed.manufacturerName ?? null,
      din: input.din ?? null,
      matchMethod: 'UNRESOLVED',
      matchConfidence: 0,
      isExplicitProduct: parsed.isExplicitProduct,
    },
    clinicalIdentity: clinicalIdentityFrom(clinicalFrom ?? null, input, parsed),
    selectedCandidate: null,
    candidates: [],
    trace: {
      resolverVersion: MEDICATION_RESOLVER_VERSION,
      matchMethod: 'UNRESOLVED',
      candidateCountRaw: rawCount,
      candidateCountAfterProductFilter: productFilterCount,
      candidateCountClinicallyDistinct: 0,
      autoResolved: false,
    },
  };
}

function reviewResult(
  input: ExtractedMedicationInput,
  parsed: ParsedProductName,
  groups: MedicationResolverCandidate[][],
  rawCount: number,
  productFilterCount: number,
): MedicationResolution {
  const candidates = groups.map((group) => {
    const preferred = selectPreferredProduct(group, input, parsed)!;
    return toResolved(preferred, clinicalDifferenceForGroup(group, groups));
  });
  return {
    status: 'PHARMACIST_REVIEW_REQUIRED',
    reason: 'CLINICALLY_DISTINCT_MATCHES',
    displayName: input.rawName,
    productIdentity: {
      sourceDisplayName: input.rawName,
      productName: parsed.normalizedName,
      brandName: input.brandName ?? null,
      din: input.din ?? null,
      matchMethod: 'UNRESOLVED',
      matchConfidence: 0.4,
      isExplicitProduct: parsed.isExplicitProduct,
    },
    clinicalIdentity: emptyClinical(input, parsed),
    selectedCandidate: null,
    candidates,
    trace: {
      resolverVersion: MEDICATION_RESOLVER_VERSION,
      matchMethod: 'UNRESOLVED',
      candidateCountRaw: rawCount,
      candidateCountAfterProductFilter: productFilterCount,
      candidateCountClinicallyDistinct: groups.length,
      autoResolved: false,
    },
  };
}

export function resolveMedicationFromCandidates(
  input: ExtractedMedicationInput,
  rawCandidates: MedicationResolverCandidate[],
): MedicationResolution {
  const parsed = parseProductName(input.brandName || input.rawName);
  const unique = new Map<string, MedicationResolverCandidate>();
  for (const candidate of rawCandidates) {
    unique.set(candidate.id, {
      ...candidate,
      conceptType: candidate.conceptType ?? detectConceptType(candidate.id),
    });
  }
  const candidates = [...unique.values()];
  const rawCount = candidates.length;

  const din = dinOf(input.din);
  if (din) {
    const exact = candidates.find((c) => dinOf(c.din) === din);
    if (exact) {
      return autoResolve(input, parsed, exact, 'DIN_EXACT', 1, rawCount, 1, 1);
    }
  }

  const productName = parsed.normalizedName;
  const sameProduct = candidates.filter((c) =>
    sameProductIdentity(candidateProductName(c), productName),
  );
  const compatibleSameProduct = sameProduct.filter((c) => compatibleWithInput(c, input));

  if (parsed.isExplicitProduct) {
    const pool = compatibleSameProduct.length ? compatibleSameProduct : sameProduct;
    if (!pool.length) {
      const genericClinical = collapseEquivalentCandidates(
        candidates.filter((c) => compatibleWithInput(c, input)),
      );
      const clinicalHit =
        genericClinical.length === 1 ? selectPreferredProduct(genericClinical[0], input, parsed) : null;
      return unresolvedResult(input, parsed, 'EXACT_PRODUCT_NOT_FOUND', rawCount, 0, clinicalHit);
    }
    const groups = collapseEquivalentCandidates(pool);
    if (groups.length === 1 && groups[0]) {
      const preferred = selectPreferredProduct(groups[0], input, parsed)!;
      return autoResolve(
        input,
        parsed,
        preferred,
        input.strength ? 'PRODUCT_NAME_STRENGTH' : 'PRODUCT_NAME_EXACT',
        0.95,
        rawCount,
        pool.length,
        1,
      );
    }
    return reviewResult(input, parsed, groups, rawCount, pool.length);
  }

  if (compatibleSameProduct.length === 1 && compatibleSameProduct[0]) {
    return autoResolve(
      input,
      parsed,
      compatibleSameProduct[0],
      'PRODUCT_NAME_EXACT',
      0.95,
      rawCount,
      1,
      1,
    );
  }

  const genericPool = candidates.filter((c) => compatibleWithInput(c, input));
  const inputMatchesIngredient = genericPool.some((candidate) => {
    const generic = candidate.genericName?.trim();
    if (!generic) return false;
    return (
      sameProductIdentity(generic, productName) ||
      productName.toLowerCase().includes(generic.toLowerCase()) ||
      generic.toLowerCase().includes(productName.toLowerCase())
    );
  });

  if (!inputMatchesIngredient && genericPool.length) {
    const clinicalGroups = collapseEquivalentCandidates(genericPool);
    const clinicalHit =
      clinicalGroups.length === 1
        ? selectPreferredProduct(clinicalGroups[0]!, input, parsed)
        : null;
    return unresolvedResult(input, parsed, 'EXACT_PRODUCT_NOT_FOUND', rawCount, 0, clinicalHit);
  }

  const groups = collapseEquivalentCandidates(genericPool);
  if (groups.length === 1 && groups[0]) {
    const preferred = selectPreferredProduct(groups[0], input, parsed)!;
    return autoResolve(input, parsed, preferred, 'GENERIC_NORMALIZED', 0.9, rawCount, genericPool.length, 1);
  }
  if (groups.length > 1) {
    return reviewResult(input, parsed, groups, rawCount, genericPool.length);
  }
  return unresolvedResult(input, parsed, 'NO_MATCH', rawCount, genericPool.length);
}

export function shouldPromptMedicationMatch(status?: MedicationResolutionStatus | null): boolean {
  return status === 'PHARMACIST_REVIEW_REQUIRED';
}

export function shouldOpenMedicationMatchDialog(med: {
  resolutionStatus?: MedicationResolutionStatus | null;
  ccddMatchStatus?: string | null;
  productIdentity?: { isExplicitProduct?: boolean } | null;
}): boolean {
  if (med.resolutionStatus === 'PHARMACIST_REVIEW_REQUIRED') return true;
  if (med.resolutionStatus === 'UNRESOLVED' && med.productIdentity?.isExplicitProduct) return true;
  if (!med.resolutionStatus && med.ccddMatchStatus === 'ambiguous') return true;
  return false;
}

export function pharmacistCodeLabel(din?: string | null, codeDisplay?: string | null): string | null {
  if (din?.trim()) return `DIN: ${din.replace(/\D/g, '')}`;
  const display = codeDisplay?.trim() ?? '';
  if (!display) return null;
  if (/\b(NTP|TM|CCDD|MP)\b/i.test(display)) return null;
  if (/^DIN/i.test(display)) {
    const digits = display.replace(/DIN[:\s]*/i, '').replace(/\D/g, '');
    return digits ? `DIN: ${digits}` : null;
  }
  return null;
}
