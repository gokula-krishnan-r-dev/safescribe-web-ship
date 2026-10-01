import {
  makeValueSetKey,
  resolveValueSetMembership,
} from './value-set-membership.util';
import type { CachedValueSet } from '../medication-safety.types';

function member(
  action: 'INCLUDE' | 'EXCLUDE',
  localCode: string,
  display: string,
  routeScope = 'ALL',
): CachedValueSet['members'][0] {
  return {
    membershipAction: action,
    memberLocalCode: localCode,
    memberDisplayName: display,
    memberRowId: `${action}-${localCode}`,
    routeScope,
  };
}

const SS_NSAIDS: CachedValueSet = {
  valueSetCode: 'VS-SS-NSAIDS',
  valueSetVersion: '1.0-draft',
  displayName: 'Systemic NSAIDs',
  members: [
    member('INCLUDE', 'ING-IBUPROFEN', 'Ibuprofen'),
    member('INCLUDE', 'ING-NAPROXEN', 'Naproxen'),
    member('INCLUDE', 'ING-DICLOFENAC', 'Diclofenac'),
  ],
};

const SYSTEMIC_NSAIDS: CachedValueSet = {
  valueSetCode: 'VS-SYSTEMIC-NSAIDS',
  valueSetVersion: '1.0',
  displayName: 'Systemic NSAIDs',
  routeScope: 'SYSTEMIC',
  members: [
    member('INCLUDE', 'ING-IBUPROFEN', 'Ibuprofen'),
    member('INCLUDE', 'ING-NAPROXEN', 'Naproxen'),
    member('INCLUDE', 'ING-DICLOFENAC', 'Diclofenac', 'SYSTEMIC'),
    member('EXCLUDE', 'ING-ACETAMINOPHEN', 'Acetaminophen'),
  ],
};

const VALUE_SETS = [SS_NSAIDS, SYSTEMIC_NSAIDS];

function decide(
  productName: string,
  valueSetCode: string,
  valueSetVersion: string,
  extra?: { genericName?: string; ingredients?: string[]; route?: string },
) {
  return resolveValueSetMembership({
    valueSets: VALUE_SETS,
    valueSetCode,
    valueSetVersion,
    ingredients: extra?.ingredients ?? [],
    productName,
    genericName: extra?.genericName,
    route: extra?.route,
  });
}

describe('value-set membership (exact code + version)', () => {
  it('does not merge VS-SS-NSAIDS with VS-SYSTEMIC-NSAIDS', () => {
    expect(makeValueSetKey('VS-SS-NSAIDS', '1.0-draft')).not.toBe(
      makeValueSetKey('VS-SYSTEMIC-NSAIDS', '1.0'),
    );
    expect(
      resolveValueSetMembership({
        valueSets: VALUE_SETS,
        valueSetCode: 'VS-SS-NSAIDS',
        valueSetVersion: '1.0',
        ingredients: ['ibuprofen'],
        productName: 'Ibuprofen',
        route: 'Oral',
      }).reason,
    ).toBe('VERSION_NOT_FOUND');
  });

  it('VS-01: oral acetaminophen is not in VS-SS-NSAIDS', () => {
    const result = decide('Acetaminophen', 'VS-SS-NSAIDS', '1.0-draft', {
      genericName: 'acetaminophen',
      ingredients: ['acetaminophen'],
      route: 'Oral',
    });
    expect(result.matched).toBe(false);
    expect(result.reason).toBe('NO_INCLUDE_MEMBERSHIP');
  });

  it('VS-02: oral acetaminophen is excluded from VS-SYSTEMIC-NSAIDS', () => {
    const result = decide('Acetaminophen', 'VS-SYSTEMIC-NSAIDS', '1.0', {
      genericName: 'acetaminophen',
      ingredients: ['acetaminophen'],
      route: 'Oral',
    });
    expect(result.matched).toBe(false);
    expect(result.reason).toBe('EXCLUDED');
  });

  it('VS-03: oral ibuprofen is in VS-SS-NSAIDS', () => {
    const result = decide('Ibuprofen', 'VS-SS-NSAIDS', '1.0-draft', {
      genericName: 'ibuprofen',
      ingredients: ['ibuprofen'],
      route: 'Oral',
    });
    expect(result.matched).toBe(true);
    expect(result.reason).toBe('INCLUDED');
    expect(result.includeRowId).toBeDefined();
  });

  it('VS-04: topical diclofenac is not a systemic NSAID', () => {
    const result = decide('Diclofenac cream', 'VS-SYSTEMIC-NSAIDS', '1.0', {
      genericName: 'diclofenac',
      ingredients: ['diclofenac'],
      route: 'Topical',
    });
    expect(result.matched).toBe(false);
    expect(result.reason).toBe('ROUTE_NOT_APPLICABLE');
  });

  it('VS-05: oral diclofenac is a systemic NSAID', () => {
    const result = decide('Diclofenac', 'VS-SYSTEMIC-NSAIDS', '1.0', {
      genericName: 'diclofenac',
      ingredients: ['diclofenac'],
      route: 'Oral',
    });
    expect(result.matched).toBe(true);
    expect(result.reason).toBe('INCLUDED');
  });

  it('VS-06: acetaminophen/codeine is not in VS-SS-NSAIDS', () => {
    const result = decide('Acetaminophen/codeine', 'VS-SS-NSAIDS', '1.0-draft', {
      ingredients: ['acetaminophen', 'codeine'],
      route: 'Oral',
    });
    expect(result.matched).toBe(false);
  });

  it('VS-07: acetaminophen/ibuprofen matches VS-SS-NSAIDS because of ibuprofen', () => {
    const result = decide('Acetaminophen/ibuprofen', 'VS-SS-NSAIDS', '1.0-draft', {
      ingredients: ['acetaminophen', 'ibuprofen'],
      route: 'Oral',
    });
    expect(result.matched).toBe(true);
    expect(result.matchedIngredientId).toMatch(/IBUPROFEN/i);
  });

  it('does not treat an EXCLUDE row as membership', () => {
    const onlyExclude: CachedValueSet = {
      valueSetCode: 'VS-SYSTEMIC-NSAIDS',
      valueSetVersion: '1.0',
      displayName: 'Systemic NSAIDs',
      members: [member('EXCLUDE', 'ING-ACETAMINOPHEN', 'Acetaminophen')],
    };
    const result = resolveValueSetMembership({
      valueSets: [onlyExclude],
      valueSetCode: 'VS-SYSTEMIC-NSAIDS',
      valueSetVersion: '1.0',
      ingredients: ['acetaminophen'],
      productName: 'Acetaminophen',
      route: 'Oral',
    });
    expect(result.matched).toBe(false);
    expect(result.reason).toBe('EXCLUDED');
  });

  it('does not match value sets by display name', () => {
    const result = resolveValueSetMembership({
      valueSets: VALUE_SETS,
      valueSetCode: 'Systemic NSAIDs',
      valueSetVersion: '1.0-draft',
      ingredients: ['ibuprofen'],
      productName: 'Ibuprofen',
      route: 'Oral',
    });
    expect(result.matched).toBe(false);
    expect(result.reason).toBe('VALUE_SET_NOT_FOUND');
  });
});
