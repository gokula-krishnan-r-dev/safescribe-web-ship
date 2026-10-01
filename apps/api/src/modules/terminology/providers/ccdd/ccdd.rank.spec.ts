import { collapseEquivalentProducts, productVariantKey } from './ccdd.rank';
import type { DrugSearchResult } from '../../drug-search.types';

function item(partial: Partial<DrugSearchResult> & Pick<DrugSearchResult, 'id' | 'brandName'>): DrugSearchResult {
  return {
    label: partial.label ?? partial.brandName,
    source: 'ccdd',
    ...partial,
  };
}

describe('CCDD product variant collapse', () => {
  it('keys the same brand, strength, and form together', () => {
    expect(
      productVariantKey(
        item({
          id: 'ccdd-mp-1',
          brandName: 'METFORMIN',
          strength: '500 mg',
          dosageForm: 'Oral Tablet',
        }),
      ),
    ).toBe('metformin|500 mg|oral tablet');
  });

  it('keeps the higher-scored representative DIN', () => {
    const kept = collapseEquivalentProducts([
      {
        score: 40,
        item: item({
          id: 'ccdd-mp-low',
          brandName: 'METFORMIN',
          strength: '500 mg',
          dosageForm: 'Oral Tablet',
        }),
      },
      {
        score: 90,
        item: item({
          id: 'ccdd-mp-high',
          brandName: 'METFORMIN',
          strength: '500 mg',
          dosageForm: 'Oral Tablet',
        }),
      },
      {
        score: 70,
        item: item({
          id: 'ccdd-mp-850',
          brandName: 'METFORMIN',
          strength: '850 mg',
          dosageForm: 'Oral Tablet',
        }),
      },
    ]);

    expect(kept.map((entry) => entry.item.id)).toEqual(['ccdd-mp-high', 'ccdd-mp-850']);
  });
});
