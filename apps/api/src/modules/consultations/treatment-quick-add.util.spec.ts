import {
  clampQuickAddLimit,
  collectExclusionKeys,
  filterExcludedAndDedup,
  isResolvableConceptId,
  normalizeConceptKey,
  sortRankedUsage,
  toQuickAddMedication,
  treatmentPlanCatalog,
} from './treatment-quick-add.util';

describe('treatment quick-add ranking helpers', () => {
  it('clamps the visible result limit to 1–20', () => {
    expect(clampQuickAddLimit(undefined)).toBe(3);
    expect(clampQuickAddLimit(0)).toBe(1);
    expect(clampQuickAddLimit(3)).toBe(3);
    expect(clampQuickAddLimit(50)).toBe(20);
  });

  it('rejects unresolved concept identifiers', () => {
    expect(isResolvableConceptId('ccdd-123')).toBe(true);
    expect(isResolvableConceptId('')).toBe(false);
    expect(isResolvableConceptId('unknown')).toBe(false);
  });

  it('ranks by use count then most recent use', () => {
    const ranked = sortRankedUsage([
      {
        clinicalDrugConceptId: 'a',
        medicationId: 'a',
        displayName: 'A',
        usageCount: 2,
        lastUsedAt: new Date('2026-08-01'),
      },
      {
        clinicalDrugConceptId: 'b',
        medicationId: 'b',
        displayName: 'B',
        usageCount: 4,
        lastUsedAt: new Date('2026-07-01'),
      },
      {
        clinicalDrugConceptId: 'c',
        medicationId: 'c',
        displayName: 'C',
        usageCount: 2,
        lastUsedAt: new Date('2026-08-20'),
      },
    ]);
    expect(ranked.map((r) => r.clinicalDrugConceptId)).toEqual(['b', 'c', 'a']);
  });

  it('excludes guided catalog and in-plan medications by concept then name', () => {
    const excluded = collectExclusionKeys([
      [{ medicationName: 'Ibuprofen oral suspension', drugId: 'cd_ibuprofen' }],
      [{ displayName: 'Cetirizine oral solution' }],
    ]);
    const items = filterExcludedAndDedup(
      [
        {
          medicationId: 'cd_ibuprofen',
          clinicalDrugConceptId: 'cd_ibuprofen',
          displayName: 'Ibuprofen oral suspension',
          source: 'frequent',
        },
        {
          medicationId: 'cd_acetaminophen',
          clinicalDrugConceptId: 'cd_acetaminophen',
          displayName: 'Acetaminophen oral liquid',
          source: 'frequent',
        },
        {
          medicationId: 'cd_cetirizine',
          clinicalDrugConceptId: 'cd_cetirizine',
          displayName: 'Cetirizine oral solution',
          source: 'frequent',
        },
        {
          medicationId: 'cd_acetaminophen',
          clinicalDrugConceptId: 'cd_acetaminophen',
          displayName: 'Acetaminophen duplicate',
          source: 'frequent',
        },
      ],
      excluded,
    );
    expect(items.map((i) => i.clinicalDrugConceptId)).toEqual(['cd_acetaminophen']);
  });

  it('does not drop distinct strengths when only a name-level guided option exists without a concept id', () => {
    const excluded = collectExclusionKeys([[{ medicationName: 'Ibuprofen' }]]);
    const kept = filterExcludedAndDedup(
      [
        {
          medicationId: 'ibu-100',
          clinicalDrugConceptId: 'ibu-100',
          displayName: 'Ibuprofen oral suspension',
          source: 'condition',
        },
      ],
      excluded,
    );
    expect(kept).toHaveLength(1);
  });

  it('reads the saved treatment catalog from the plan payload', () => {
    expect(treatmentPlanCatalog({ recommendedTreatments: [{ drugId: 'x' }] })).toEqual([
      { drugId: 'x' },
    ]);
    expect(treatmentPlanCatalog(null)).toEqual([]);
  });

  it('omits ranking metadata from the pharmacist-facing mapping defaults', () => {
    const mapped = toQuickAddMedication(
      {
        clinicalDrugConceptId: 'cd_1',
        medicationId: 'cd_1',
        displayName: 'Acetaminophen oral liquid',
        strengthLabel: '160 mg/5 mL',
        dosageFormLabel: 'Oral liquid',
        usageCount: 9,
        lastUsedAt: new Date('2026-08-21T16:00:00Z'),
      },
      'frequent',
    );
    expect(mapped.displayName).toBe('Acetaminophen oral liquid');
    expect(mapped.strengthLabel).toBe('160 mg/5 mL');
    expect(normalizeConceptKey(mapped.clinicalDrugConceptId)).toBe('cd_1');
  });
});
