import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGeneratedSearchText,
  ingredientMatches,
  isProductCompatible,
  pickPreferredCandidateId,
  rankCompatibleCandidates,
  strengthsEqual,
  type CompatibleProductCandidate,
} from './adjusted-regimen-product';

const valacyclovir = {
  ingredient: 'valacyclovir',
  targetStrength: { value: 500, unit: 'mg' },
  form: 'Tablet',
  route: 'Oral',
  currentBrand: 'VALTREX',
};

function candidate(
  overrides: Partial<CompatibleProductCandidate> &
    Pick<CompatibleProductCandidate, 'productId' | 'displayName' | 'genericName'>,
): CompatibleProductCandidate {
  return {
    strength: { value: 500, unit: 'mg' },
    strengthDisplay: '500 mg',
    formDisplay: 'Tablet',
    routeDisplay: 'Oral',
    label: overrides.displayName,
    compatibility: 'COMPATIBLE',
    catalogue: {},
    ...overrides,
  };
}

describe('adjusted regimen product matching', () => {
  it('builds search text from ingredient, target strength, and form', () => {
    assert.equal(
      buildGeneratedSearchText(valacyclovir),
      'valacyclovir 500 mg tablet',
    );
  });

  it('accepts 500 mg and rejects the 1 g product', () => {
    assert.equal(strengthsEqual('500 mg', valacyclovir.targetStrength), true);
    assert.equal(strengthsEqual('0.5 g', valacyclovir.targetStrength), true);
    assert.equal(strengthsEqual('1 g', valacyclovir.targetStrength), false);
  });

  it('matches valacyclovir and VALTREX by ingredient', () => {
    assert.equal(
      ingredientMatches(
        { genericName: 'valacyclovir', brandName: 'VALTREX', label: 'VALTREX 500 mg tablet' },
        'valacyclovir',
      ),
      true,
    );
    assert.equal(
      ingredientMatches({ genericName: 'acyclovir', label: 'acyclovir 400 mg' }, 'valacyclovir'),
      false,
    );
  });

  it('keeps only products that can represent the adjusted 500 mg tablet', () => {
    assert.equal(
      isProductCompatible(
        {
          genericName: 'valacyclovir',
          brandName: 'VALTREX',
          label: 'VALTREX 500 mg tablet',
          strength: '500 mg',
          dosageForm: 'Tablet',
          routeDisplay: 'Oral',
        },
        valacyclovir,
      ),
      true,
    );
    assert.equal(
      isProductCompatible(
        {
          genericName: 'valacyclovir',
          label: 'valacyclovir 1 g tablet',
          strength: '1 g',
          dosageForm: 'Tablet',
          routeDisplay: 'Oral',
        },
        valacyclovir,
      ),
      false,
    );
  });

  it('prefers a single generic when branded equivalents are also listed', () => {
    const ranked = rankCompatibleCandidates(
      [
        candidate({
          productId: 'brand',
          displayName: 'VALTREX 500 mg tablet',
          genericName: 'valacyclovir',
          brandName: 'VALTREX',
        }),
        candidate({
          productId: 'generic',
          displayName: 'Valacyclovir 500 mg tablet',
          genericName: 'valacyclovir',
          brandName: 'valacyclovir',
        }),
      ],
      valacyclovir,
    );
    assert.equal(ranked[0].productId, 'generic');
    assert.equal(pickPreferredCandidateId(ranked), 'generic');
  });

  it('matches aspirin 81 mg without accepting 325 mg', () => {
    const aspirin = {
      ingredient: 'aspirin',
      targetStrength: { value: 81, unit: 'mg' },
      form: 'Tablet',
    };
    assert.equal(
      isProductCompatible(
        {
          genericName: 'aspirin',
          brandName: 'ASA',
          strength: '81 mg',
          dosageForm: 'Tablet',
        },
        aspirin,
      ),
      true,
    );
    assert.equal(
      isProductCompatible(
        {
          genericName: 'aspirin',
          strength: '325 mg',
          dosageForm: 'Tablet',
        },
        aspirin,
      ),
      false,
    );
  });
});
