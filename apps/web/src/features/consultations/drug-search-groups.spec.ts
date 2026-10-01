import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DrugSearchResult } from './medication-utils';
import {
  collapseDrugSearchResults,
  flattenDrugBrandGroups,
  formatDrugStrengthOption,
  groupDrugSearchByBrand,
} from './drug-search-groups';

function drug(partial: Partial<DrugSearchResult> & Pick<DrugSearchResult, 'id' | 'brandName'>): DrugSearchResult {
  return {
    label: partial.label ?? partial.brandName,
    source: 'ccdd',
    ...partial,
  };
}

describe('drug search brand grouping', () => {
  const metformin500a = drug({
    id: 'ccdd-mp-1',
    brandName: 'METFORMIN',
    genericName: 'metformin hydrochloride',
    strength: '500 mg',
    dosageForm: 'Oral Tablet',
    codeDisplay: 'DIN: 02233311',
  });
  const metformin500b = drug({
    id: 'ccdd-mp-2',
    brandName: 'METFORMIN',
    genericName: 'metformin hydrochloride',
    strength: '500 mg',
    dosageForm: 'Oral Tablet',
    codeDisplay: 'DIN: 02242995',
  });
  const metformin850 = drug({
    id: 'ccdd-mp-3',
    brandName: 'METFORMIN',
    genericName: 'metformin hydrochloride',
    strength: '850 mg',
    dosageForm: 'Oral Tablet',
  });
  const glucophage500 = drug({
    id: 'ccdd-mp-4',
    brandName: 'GLUCOPHAGE',
    genericName: 'metformin hydrochloride',
    strength: '500 mg',
    dosageForm: 'Oral Tablet',
  });
  const glumetza500 = drug({
    id: 'ccdd-mp-5',
    brandName: 'GLUMETZA',
    genericName: 'metformin hydrochloride',
    strength: '500 mg',
    dosageForm: 'Oral Extended-Release Tablet',
  });

  it('collapses the same brand, strength, and form from different DINs', () => {
    const collapsed = collapseDrugSearchResults([metformin500a, metformin500b, metformin850]);
    assert.equal(collapsed.length, 2);
    assert.equal(collapsed[0].id, 'ccdd-mp-1');
    assert.equal(collapsed[1].strength, '850 mg');
  });

  it('lists every strength of one brand before the next brand', () => {
    const groups = groupDrugSearchByBrand(
      [metformin500a, glucophage500, metformin850, metformin500b, glumetza500],
      'metformin',
    );
    assert.deepEqual(
      groups.map((g) => g.brandName),
      ['METFORMIN', 'GLUCOPHAGE', 'GLUMETZA'],
    );
    assert.deepEqual(
      groups[0].items.map((item) => item.strength),
      ['500 mg', '850 mg'],
    );
    assert.equal(flattenDrugBrandGroups(groups).length, 4);
  });

  it('prefers the brand that matches the query first', () => {
    const groups = groupDrugSearchByBrand(
      [metformin500a, glucophage500, metformin850],
      'glucophage',
    );
    assert.equal(groups[0].brandName, 'GLUCOPHAGE');
    assert.equal(groups[1].brandName, 'METFORMIN');
  });

  it('formats a strength row without repeating the brand', () => {
    assert.equal(formatDrugStrengthOption(metformin500a).title, '500 mg · Oral Tablet');
  });
});
