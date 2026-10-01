import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterQuickAddItems,
  isExcludedQuickAddItem,
  normalizeQuickAddKey,
  quickAddSecondaryText,
  quickAddToDrugSearchResult,
  drugSearchToUsageInput,
  type QuickAddMedication,
} from './quick-add';

function item(patch: Partial<QuickAddMedication> = {}): QuickAddMedication {
  return {
    medicationId: 'med_acetaminophen',
    clinicalDrugConceptId: 'cd_acetaminophen',
    displayName: 'Acetaminophen oral liquid',
    strengthLabel: '160 mg/5 mL',
    dosageFormLabel: 'Oral liquid',
    source: 'frequent',
    ...patch,
  };
}

describe('quick-add client helpers', () => {
  it('formats strength and dosage form as secondary text', () => {
    assert.equal(quickAddSecondaryText(item()), '160 mg/5 mL · Oral liquid');
  });

  it('excludes guided and in-plan concepts', () => {
    assert.equal(
      isExcludedQuickAddItem(item(), ['cd_acetaminophen'], []),
      true,
    );
    assert.equal(
      isExcludedQuickAddItem(item({ displayName: 'Cetirizine oral solution' }), [], [
        'cetirizine oral solution',
      ]),
      true,
    );
    assert.equal(isExcludedQuickAddItem(item(), ['other'], ['ibuprofen']), false);
  });

  it('deduplicates and drops excluded rows', () => {
    const filtered = filterQuickAddItems(
      [
        item(),
        item({ medicationId: 'dup', displayName: 'Acetaminophen duplicate' }),
        item({
          medicationId: 'med_ibu',
          clinicalDrugConceptId: 'cd_ibuprofen',
          displayName: 'Ibuprofen oral suspension',
        }),
      ],
      ['cd_ibuprofen'],
      [],
    );
    assert.deepEqual(
      filtered.map((row) => row.clinicalDrugConceptId),
      ['cd_acetaminophen'],
    );
  });

  it('maps a quick-add row to search identity without copying a regimen', () => {
    const result = quickAddToDrugSearchResult({
      medicationId: 'med_123',
      clinicalDrugConceptId: 'cd_456',
      displayName: 'Ibuprofen oral suspension',
      strengthLabel: '100 mg/5 mL',
      dosageFormLabel: 'Oral liquid',
      source: 'frequent',
      usageCount: 12,
      lastUsedAt: '2026-08-21T16:00:00Z',
    });
    assert.equal(result.id, 'med_123');
    assert.equal(result.brandName, 'Ibuprofen oral suspension');
    assert.equal(result.strength, '100 mg/5 mL');
    assert.equal(result.dosageForm, 'Oral liquid');
    assert.equal('dose' in result, false);
    assert.equal('patientDirections' in result, false);
    assert.equal(JSON.stringify(result).includes('CCDD'), false);
  });

  it('records identity-only usage from a search result', () => {
    const usage = drugSearchToUsageInput(
      {
        id: 'med_123',
        brandName: 'Ibuprofen oral suspension',
        genericName: 'Ibuprofen',
        strength: '100 mg/5 mL',
        dosageForm: 'Oral liquid',
        label: 'Ibuprofen oral suspension',
        source: 'ccdd',
      },
      'frequent',
    );
    assert.equal(usage.medicationId, 'med_123');
    assert.equal(usage.selectionSource, 'frequent');
    assert.equal('patientDirections' in usage, false);
    assert.equal('quantity' in usage, false);
  });
});
