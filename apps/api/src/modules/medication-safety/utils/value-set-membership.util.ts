/**
 * Deterministic clinical value-set membership.
 * Join by exact code + version. INCLUDE then EXCLUDE. Never alias, display-name, or fuzzy merge.
 */

import type { CachedValueSet, CachedValueSetMember } from '../medication-safety.types';
import {
  isTopicalProductName,
  normalizeDrugKey,
  significantDrugTokens,
} from './drug-name.util';

export type ValueSetKey = `${string}::${string}`;

export type MembershipReason =
  | 'INCLUDED'
  | 'EXCLUDED'
  | 'NO_INCLUDE_MEMBERSHIP'
  | 'ROUTE_NOT_APPLICABLE'
  | 'FORM_NOT_APPLICABLE'
  | 'VALUE_SET_NOT_FOUND'
  | 'VERSION_NOT_FOUND';

export interface MembershipDecision {
  matched: boolean;
  reason: MembershipReason;
  includeRowId?: string;
  excludeRowId?: string;
  matchedIngredientId?: string;
}

export function makeValueSetKey(code: string, version: string): ValueSetKey {
  return `${code.trim()}::${version.trim()}` as ValueSetKey;
}

export function isGovernedValueSetCode(code: string | undefined): boolean {
  return /^(VS-|VALUE[_-]?SET)/i.test((code ?? '').trim());
}

function stripIngredientPrefix(code: string): string {
  return normalizeDrugKey(code.replace(/^(ING|SEL|RXCUI|DIN|NPN)[-_]?/i, ' '));
}

function ingredientIdentityTokens(
  productName: string,
  genericName: string | undefined,
  ingredients: string[],
): { tokens: Set<string>; codes: Set<string> } {
  const tokens = new Set<string>();
  const codes = new Set<string>();
  const push = (raw: string) => {
    const key = normalizeDrugKey(raw);
    if (!key) return;
    tokens.add(key);
    codes.add(`ING-${key.replace(/\s+/g, '-').toUpperCase()}`);
  };

  for (const ing of ingredients) push(ing);
  if (genericName) {
    for (const t of significantDrugTokens(genericName)) push(t);
    push(genericName);
  }
  for (const t of significantDrugTokens(productName, genericName ?? '')) push(t);

  return { tokens, codes };
}

function memberIngredientKeys(member: CachedValueSetMember): string[] {
  const keys: string[] = [];
  for (const raw of [
    member.memberLocalCode,
    member.terminologyConceptCode,
    member.memberDisplayName,
    member.terminologyDisplayName,
  ]) {
    if (!raw?.trim()) continue;
    const text = String(raw).trim();
    if (isGovernedValueSetCode(text)) continue;
    const norm = normalizeDrugKey(text);
    if (!norm || norm.length < 4) continue;
    keys.push(norm);
    const stripped = stripIngredientPrefix(text);
    if (stripped && stripped !== norm) keys.push(stripped);
  }
  return keys;
}

function memberHitsIngredient(
  member: CachedValueSetMember,
  tokens: Set<string>,
  codes: Set<string>,
): { hit: boolean; matchedIngredientId?: string } {
  const local = member.memberLocalCode?.trim();
  if (local && codes.has(local.toUpperCase())) {
    return { hit: true, matchedIngredientId: local.toUpperCase() };
  }

  for (const key of memberIngredientKeys(member)) {
    if (tokens.has(key)) {
      return {
        hit: true,
        matchedIngredientId: local?.toUpperCase() || `ING-${key.replace(/\s+/g, '-').toUpperCase()}`,
      };
    }
  }
  return { hit: false };
}

export function inferProductRoute(
  productName: string,
  explicitRoute?: string | null,
): 'TOPICAL' | 'SYSTEMIC' | 'UNKNOWN' {
  if (isTopicalProductName(productName) || isTopicalProductName(explicitRoute ?? '')) {
    return 'TOPICAL';
  }
  const route = (explicitRoute ?? '').trim();
  if (route && /\b(oral|po|systemic|enteral|by mouth|swallowed)\b/i.test(route)) {
    return 'SYSTEMIC';
  }
  if (route) return 'SYSTEMIC';
  return 'UNKNOWN';
}

function routeScopeApplies(
  scope: string | null | undefined,
  productRoute: 'TOPICAL' | 'SYSTEMIC' | 'UNKNOWN',
): boolean {
  const s = (scope ?? '').trim().toUpperCase();
  if (!s || s === 'ALL' || s === 'ANY' || s === 'NONE') return true;
  if (/(TOPICAL|NON[_\s-]?SYSTEMIC|CUTANEOUS|DERMAL|TRANSDERMAL)/.test(s)) {
    return productRoute === 'TOPICAL';
  }
  if (/(SYSTEMIC|ORAL|PO|ENTERAL|PARENTERAL)/.test(s)) {
    return productRoute !== 'TOPICAL';
  }
  return true;
}

function impliedSystemicRoute(vs: CachedValueSet): string | null {
  if (/SYSTEMIC/i.test(vs.valueSetCode) || /SYSTEMIC/i.test(vs.displayName ?? '')) {
    return 'SYSTEMIC';
  }
  return null;
}

function findValueSet(
  valueSets: CachedValueSet[],
  valueSetCode: string,
  valueSetVersion: string | null | undefined,
): { vs?: CachedValueSet; reason?: MembershipReason } {
  const code = valueSetCode.trim();
  if (!code) return { reason: 'VALUE_SET_NOT_FOUND' };

  const sameCode = valueSets.filter((vs) => vs.valueSetCode === code);
  if (!sameCode.length) return { reason: 'VALUE_SET_NOT_FOUND' };

  const version = valueSetVersion?.trim() || '';
  if (version) {
    const exact = sameCode.find((vs) => vs.valueSetVersion === version);
    if (!exact) return { reason: 'VERSION_NOT_FOUND' };
    return { vs: exact };
  }

  if (sameCode.length === 1) return { vs: sameCode[0] };
  return { reason: 'VERSION_NOT_FOUND' };
}

export function resolveValueSetMembership(input: {
  valueSets: CachedValueSet[];
  valueSetCode: string;
  valueSetVersion?: string | null;
  ingredients: string[];
  productName: string;
  genericName?: string;
  route?: string | null;
}): MembershipDecision {
  const { vs, reason } = findValueSet(
    input.valueSets,
    input.valueSetCode,
    input.valueSetVersion,
  );
  if (!vs) {
    return { matched: false, reason: reason ?? 'VALUE_SET_NOT_FOUND' };
  }

  const productRoute = inferProductRoute(input.productName, input.route);
  const setRouteScope = vs.routeScope || impliedSystemicRoute(vs);
  if (!routeScopeApplies(setRouteScope, productRoute)) {
    return { matched: false, reason: 'ROUTE_NOT_APPLICABLE' };
  }

  const { tokens, codes } = ingredientIdentityTokens(
    input.productName,
    input.genericName,
    input.ingredients,
  );

  const applicable = (m: CachedValueSetMember) => routeScopeApplies(m.routeScope, productRoute);

  let excludeRowId: string | undefined;
  let excludeIngredient: string | undefined;
  for (const member of vs.members) {
    if (member.membershipAction !== 'EXCLUDE') continue;
    if (!applicable(member)) continue;
    const hit = memberHitsIngredient(member, tokens, codes);
    if (hit.hit) {
      excludeRowId = member.memberRowId ?? member.memberLocalCode ?? undefined;
      excludeIngredient = hit.matchedIngredientId;
      break;
    }
  }
  if (excludeRowId) {
    return {
      matched: false,
      reason: 'EXCLUDED',
      excludeRowId,
      matchedIngredientId: excludeIngredient,
    };
  }

  let includeRowId: string | undefined;
  let includeIngredient: string | undefined;
  for (const member of vs.members) {
    if (member.membershipAction !== 'INCLUDE') continue;
    if (!applicable(member)) continue;
    const hit = memberHitsIngredient(member, tokens, codes);
    if (hit.hit) {
      includeRowId = member.memberRowId ?? member.memberLocalCode ?? undefined;
      includeIngredient = hit.matchedIngredientId;
      break;
    }
  }

  if (!includeRowId) {
    const hadInclude = vs.members.some((m) => m.membershipAction === 'INCLUDE');
    if (hadInclude && productRoute === 'TOPICAL') {
      const systemicOnly = vs.members
        .filter((m) => m.membershipAction === 'INCLUDE')
        .every((m) => !routeScopeApplies(m.routeScope, 'TOPICAL'));
      if (systemicOnly || !routeScopeApplies(setRouteScope, 'TOPICAL')) {
        return { matched: false, reason: 'ROUTE_NOT_APPLICABLE' };
      }
    }
    return { matched: false, reason: 'NO_INCLUDE_MEMBERSHIP' };
  }

  return {
    matched: true,
    reason: 'INCLUDED',
    includeRowId,
    matchedIngredientId: includeIngredient,
  };
}
