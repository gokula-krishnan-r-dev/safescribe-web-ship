/**
 * Canonical medication identity + duplicate classification for treatment
 * selection. Display-name equality is never the primary match.
 *
 * Salt/synonym handling follows the existing token model used by the Safety
 * Engine (parenthetical ingredients + formulation/salt tokens dropped) so
 * `oseltamivir`, `oseltamivir phosphate`, and
 * `oseltamivir (oseltamivir phosphate)` resolve to the same base ingredient.
 */

export type DuplicateMatchType =
  | 'EXACT_PATHWAY_OPTION'
  | 'EXACT_SELECTED_TREATMENT'
  | 'SAME_INGREDIENT_SAME_ROUTE'
  | 'RELATED_INGREDIENT_DIFFERENT_ROUTE'
  | 'NONE';

export type TreatmentSafetyStatus = 'CLEAR' | 'REVIEW_REQUIRED' | 'AVOID';

export type TreatmentEntrySource = 'PATHWAY' | 'SEARCH' | 'QUICK_ADD' | 'MANUAL';

export interface MedicationIdentityInput {
  medicationName: string;
  genericName?: string | null;
  drugId?: string | null;
  rxcui?: string | null;
  ndc?: string | null;
  route?: string | null;
  pathwayTreatmentId?: string | null;
  treatmentInstanceId?: string | null;
  source?: string | null;
  treatmentKind?: string | null;
  allergyBlocked?: boolean | null;
  allergyWarningReason?: string | null;
}

export interface TreatmentDuplicateResult {
  matchType: DuplicateMatchType;
  blocking: boolean;
  existingTreatmentInstanceId?: string;
  existingPathwayOptionId?: string;
  existingDisplayName?: string;
  existingSafetyStatus?: TreatmentSafetyStatus;
  existingBlockingFindingSummary?: string;
}

const SALT_AND_FORM_TOKENS = new Set([
  'and',
  'or',
  'with',
  'plus',
  'hcl',
  'hci',
  'hydrochloride',
  'hydrobromide',
  'maleate',
  'succinate',
  'tartrate',
  'citrate',
  'fumarate',
  'acetate',
  'phosphate',
  'phosphates',
  'sulfate',
  'sulphate',
  'sodium',
  'potassium',
  'calcium',
  'magnesium',
  'mg',
  'mcg',
  'g',
  'ml',
  'tablet',
  'tablets',
  'capsule',
  'capsules',
  'oral',
  'injection',
  'suspension',
  'solution',
  'cream',
  'ointment',
  'gel',
  'lotion',
  'topical',
  'usp',
  'bp',
  'for',
  'the',
  'in',
  'of',
  'generics',
  'generic',
  'brand',
  'brands',
  'preparation',
  'products',
  'product',
  'systemic',
  'strength',
  'release',
  'extended',
  'immediate',
]);

export function normalizeMedicationKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushToken(out: string[], seen: Set<string>, raw: string) {
  const key = normalizeMedicationKey(raw);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(key);
}

/** Expand a display/generic label into comparable tokens, including parenthetical salts. */
export function expandMedicationTokens(...values: Array<string | null | undefined>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (!raw?.trim()) continue;
    pushToken(keys, seen, raw);
    for (const part of raw.split(/[,;/|&+]|(?:\sand\s)|(?:\sor\s)|(?:\swith\s)|(?:\splus\s)/i)) {
      pushToken(keys, seen, part);
      const paren = part.match(/\(([^)]+)\)/g) ?? [];
      for (const p of paren) pushToken(keys, seen, p.replace(/[()]/g, ''));
      pushToken(keys, seen, part.replace(/\([^)]*\)/g, ' '));
    }
    const normalized = normalizeMedicationKey(raw);
    for (const piece of normalized.split(/\s+/)) {
      if (piece.length >= 4 && !SALT_AND_FORM_TOKENS.has(piece) && !/^\d/.test(piece)) {
        pushToken(keys, seen, piece);
      }
    }
  }
  return keys;
}

/** Significant base-ingredient keys (salts, forms, and strength tokens removed). */
export function baseIngredientKeys(...values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const token of expandMedicationTokens(...values)) {
    if (!token || SALT_AND_FORM_TOKENS.has(token)) continue;
    if (token.includes(' ')) {
      for (const piece of token.split(/\s+/)) {
        if (piece.length >= 4 && !SALT_AND_FORM_TOKENS.has(piece) && !/^\d/.test(piece)) {
          out.add(piece);
        }
      }
      continue;
    }
    if (token.length >= 4 && !/^\d/.test(token)) out.add(token);
  }
  return Array.from(out).sort();
}

export type RouteFamily =
  | 'oral'
  | 'topical'
  | 'inhaled'
  | 'injectable'
  | 'ophthalmic'
  | 'otic'
  | 'rectal'
  | 'vaginal'
  | 'transdermal'
  | 'unspecified';

export function routeFamily(route?: string | null): RouteFamily {
  const r = normalizeMedicationKey(route ?? '');
  if (!r) return 'unspecified';
  if (/\b(oral|mouth|enteral|\bpo\b|per os)\b/.test(r) || r === 'po') return 'oral';
  if (/\b(topical|skin|cream|ointment|gel|lotion)\b/.test(r)) return 'topical';
  if (/\b(inhal|nebuli|nasal)\b/.test(r)) return 'inhaled';
  if (/\b(iv|im|sc|subcut|inject|parenteral|intravenous|intramuscular)\b/.test(r)) {
    return 'injectable';
  }
  if (/\b(eye|ophth)\b/.test(r)) return 'ophthalmic';
  if (/\b(ear|otic)\b/.test(r)) return 'otic';
  if (/\b(rectal|\bpr\b)\b/.test(r)) return 'rectal';
  if (/\b(vaginal)\b/.test(r)) return 'vaginal';
  if (/\b(transdermal|patch)\b/.test(r)) return 'transdermal';
  return 'unspecified';
}

function sameCodedId(a?: string | null, b?: string | null): boolean {
  const left = a?.trim();
  const right = b?.trim();
  return Boolean(left && right && left === right);
}

function ingredientSetsEqual(a: string[], b: string[]): boolean {
  if (!a.length || !b.length || a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

function ingredientSetSubset(smaller: string[], larger: string[]): boolean {
  if (!smaller.length || !larger.length) return false;
  return smaller.every((k) => larger.includes(k));
}

function routesBlockAsSame(a: RouteFamily, b: RouteFamily): boolean {
  if (a === 'unspecified' || b === 'unspecified') return true;
  return a === b;
}

function routesMeaningfullyDifferent(a: RouteFamily, b: RouteFamily): boolean {
  return a !== 'unspecified' && b !== 'unspecified' && a !== b;
}

export function isStandardMedication(input: MedicationIdentityInput): boolean {
  const kind = String(input.treatmentKind ?? 'MEDICATION').toUpperCase();
  return kind !== 'DEVICE' && kind !== 'CUSTOM_COMPOUND' && kind !== 'NON_DRUG';
}

export function isPathwayGuidedOption(input: MedicationIdentityInput): boolean {
  return Boolean(input.pathwayTreatmentId?.trim()) || input.source === 'pathway';
}

export function isPharmacistAddedMedication(input: MedicationIdentityInput): boolean {
  if (isPathwayGuidedOption(input)) return false;
  const source = String(input.source ?? '').toLowerCase();
  return (
    source === 'manual' ||
    source === 'ccdd' ||
    source === 'rxnorm' ||
    source === 'openfda' ||
    source === 'search' ||
    source === 'quick_add' ||
    !source
  );
}

type IdentityMatchKind = 'exact' | 'same-ingredient' | 'related-route' | 'none';

function matchIdentities(
  candidate: MedicationIdentityInput,
  existing: MedicationIdentityInput,
): IdentityMatchKind {
  if (!isStandardMedication(candidate) || !isStandardMedication(existing)) return 'none';

  const candidateRoute = routeFamily(candidate.route);
  const existingRoute = routeFamily(existing.route);
  const candidateKeys = baseIngredientKeys(candidate.medicationName, candidate.genericName);
  const existingKeys = baseIngredientKeys(existing.medicationName, existing.genericName);

  const codedExact =
    sameCodedId(candidate.drugId, existing.drugId) ||
    sameCodedId(candidate.rxcui, existing.rxcui) ||
    sameCodedId(candidate.ndc, existing.ndc) ||
    sameCodedId(candidate.pathwayTreatmentId, existing.pathwayTreatmentId);

  const sameIngredientSet = ingredientSetsEqual(candidateKeys, existingKeys);
  const overlappingSubset =
    ingredientSetSubset(candidateKeys, existingKeys) ||
    ingredientSetSubset(existingKeys, candidateKeys);

  if (codedExact && routesBlockAsSame(candidateRoute, existingRoute)) return 'exact';
  if (sameIngredientSet && routesBlockAsSame(candidateRoute, existingRoute)) return 'exact';
  if (overlappingSubset && routesBlockAsSame(candidateRoute, existingRoute)) {
    return sameIngredientSet ? 'exact' : 'same-ingredient';
  }
  if (
    (codedExact || sameIngredientSet || overlappingSubset) &&
    routesMeaningfullyDifferent(candidateRoute, existingRoute)
  ) {
    return 'related-route';
  }
  return 'none';
}

function displayNameOf(item: MedicationIdentityInput): string {
  return (item.genericName?.trim() || item.medicationName.trim() || 'this treatment');
}

function safetyStatusOf(item: MedicationIdentityInput): TreatmentSafetyStatus | undefined {
  if (item.allergyBlocked) return 'AVOID';
  if (item.allergyWarningReason?.trim()) return 'REVIEW_REQUIRED';
  return undefined;
}

function resultFor(
  matchType: DuplicateMatchType,
  existing: MedicationIdentityInput,
  blocking: boolean,
): TreatmentDuplicateResult {
  return {
    matchType,
    blocking,
    existingTreatmentInstanceId: existing.treatmentInstanceId?.trim() || undefined,
    existingPathwayOptionId: existing.pathwayTreatmentId?.trim() || undefined,
    existingDisplayName: displayNameOf(existing),
    existingSafetyStatus: safetyStatusOf(existing),
    existingBlockingFindingSummary: existing.allergyWarningReason?.trim() || undefined,
  };
}

const NONE: TreatmentDuplicateResult = { matchType: 'NONE', blocking: false };

/**
 * Compare a candidate against all guided pathway options and all current
 * plan treatments. Pathway matches win so Avoid-catalog options cannot be
 * bypassed by a pharmacist-added copy.
 */
export function classifyTreatmentDuplicate(
  candidate: MedicationIdentityInput,
  opts: {
    pathwayOptions: MedicationIdentityInput[];
    planTreatments: MedicationIdentityInput[];
  },
): TreatmentDuplicateResult {
  if (!isStandardMedication(candidate)) return NONE;
  if (!candidate.medicationName.trim() && !candidate.genericName?.trim() && !candidate.drugId) {
    return NONE;
  }

  let related: { item: MedicationIdentityInput; from: 'pathway' | 'plan' } | null = null;

  for (const option of opts.pathwayOptions) {
    const kind = matchIdentities(candidate, option);
    if (kind === 'exact') {
      return resultFor('EXACT_PATHWAY_OPTION', option, true);
    }
    if (kind === 'same-ingredient') {
      return resultFor('SAME_INGREDIENT_SAME_ROUTE', option, true);
    }
    if (kind === 'related-route' && !related) {
      related = { item: option, from: 'pathway' };
    }
  }

  for (const item of opts.planTreatments) {
    const kind = matchIdentities(candidate, item);
    if (kind === 'exact') {
      return resultFor(
        isPathwayGuidedOption(item) ? 'EXACT_PATHWAY_OPTION' : 'EXACT_SELECTED_TREATMENT',
        item,
        true,
      );
    }
    if (kind === 'same-ingredient') {
      return resultFor('SAME_INGREDIENT_SAME_ROUTE', item, true);
    }
    if (kind === 'related-route' && !related) {
      related = { item, from: isPathwayGuidedOption(item) ? 'pathway' : 'plan' };
    }
  }

  if (related) {
    return resultFor('RELATED_INGREDIENT_DIFFERENT_ROUTE', related.item, false);
  }

  return NONE;
}

export function identityFromTreatmentRecord(
  record: Record<string, unknown>,
): MedicationIdentityInput {
  const allergy = record.allergyWarning as { reason?: string } | undefined;
  return {
    medicationName: String(record.medicationName ?? record.displayName ?? ''),
    genericName: record.genericName != null ? String(record.genericName) : undefined,
    drugId: record.drugId != null ? String(record.drugId) : undefined,
    rxcui: record.rxcui != null ? String(record.rxcui) : undefined,
    ndc: record.ndc != null ? String(record.ndc) : undefined,
    route: record.route != null ? String(record.route) : undefined,
    pathwayTreatmentId:
      record.pathwayTreatmentId != null ? String(record.pathwayTreatmentId) : undefined,
    treatmentInstanceId:
      record.treatmentInstanceId != null ? String(record.treatmentInstanceId) : undefined,
    source: record.source != null ? String(record.source) : undefined,
    treatmentKind:
      record.treatmentKind != null
        ? String(record.treatmentKind)
        : record.category != null
          ? String(record.category)
          : undefined,
    allergyBlocked: record.allergyBlocked === true,
    allergyWarningReason: allergy?.reason,
  };
}

/**
 * Prefer guided pathway rows. Drop pharmacist-added standard medications that
 * duplicate a pathway option or an earlier pharmacist-added row.
 */
export function dropPharmacistAddedDuplicates<T extends Record<string, unknown>>(
  treatments: T[],
): { kept: T[]; dropped: T[]; indexMap: number[] } {
  const identities = treatments.map(identityFromTreatmentRecord);
  const pathwayOptions = identities.filter(isPathwayGuidedOption);
  const kept: T[] = [];
  const dropped: T[] = [];
  const indexMap: number[] = [];
  const keptPharmacist: MedicationIdentityInput[] = [];

  for (let i = 0; i < treatments.length; i++) {
    const identity = identities[i];
    if (!isStandardMedication(identity) || isPathwayGuidedOption(identity)) {
      indexMap[i] = kept.length;
      kept.push(treatments[i]);
      continue;
    }
    const duplicate = classifyTreatmentDuplicate(identity, {
      pathwayOptions,
      planTreatments: keptPharmacist,
    });
    if (duplicate.blocking) {
      indexMap[i] = -1;
      dropped.push(treatments[i]);
      continue;
    }
    indexMap[i] = kept.length;
    kept.push(treatments[i]);
    keptPharmacist.push(identity);
  }

  return { kept, dropped, indexMap };
}

export function remapSelectedIndexes(
  selectedIndexes: number[],
  indexMap: number[],
): number[] {
  const next = new Set<number>();
  for (const index of selectedIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= indexMap.length) continue;
    const mapped = indexMap[index];
    if (mapped >= 0) next.add(mapped);
  }
  return [...next].sort((a, b) => a - b);
}
