import {
  formatReferenceDisplay,
  inferSourceType,
  nextReleaseId,
  pickWorkingRecord,
  strategyBadge,
  validatePublishSet,
} from './clinical-reference.helpers';

describe('clinical-reference helpers', () => {
  it('maps source codes to governed source types', () => {
    expect(inferSourceType('LAB_RESULT')).toBe('LABORATORY');
    expect(inferSourceType('MCC_ADULT')).toBe('REFERENCE_TABLE');
    expect(inferSourceType('DIAB_CA_2024')).toBe('GUIDELINE');
    expect(inferSourceType('HC_MONOGRAPH')).toBe('PRODUCT_MONOGRAPH');
    expect(inferSourceType('SAFETY_ENGINE')).toBe('OTHER');
  });

  it('labels MCC as adult fallback rather than a normal range', () => {
    expect(strategyBadge('STATIC_REFERENCE', 'MCC_ADULT')).toBe('Adult fallback');
    expect(strategyBadge('LAB_SOURCE_FIRST', null)).toBe('Lab interval first');
    expect(strategyBadge('SAFETY_ENGINE', 'SAFETY_ENGINE')).toBe('Medication-specific');
  });

  it('formats display text without inventing a range', () => {
    expect(formatReferenceDisplay({ displayText: '3.5–5.0 mmol/L' })).toBe('3.5–5.0 mmol/L');
    expect(formatReferenceDisplay({ lowerNumeric: 3.5, upperNumeric: 5, unit: 'mmol/L' })).toBe(
      '3.5–5 mmol/L',
    );
    expect(formatReferenceDisplay({})).toBe('—');
  });

  it('builds a dated release id', () => {
    expect(nextReleaseId(new Date('2026-09-06T12:00:00Z'))).toBe('REFERENCE_RELEASE_2026_09_06');
  });

  it('prefers draft over published when selecting the working record', () => {
    const working = pickWorkingRecord([
      { status: 'PUBLISHED', versionNumber: 1 },
      { status: 'DRAFT', versionNumber: 2 },
    ]);
    expect(working?.status).toBe('DRAFT');
  });

  it('blocks pediatric adult fallback and missing target sources', () => {
    const issues = validatePublishSet({
      values: [
        {
          referenceId: 'REF-001',
          inputCode: 'POTASSIUM',
          referenceStrategy: 'STATIC_REFERENCE',
          referenceKind: 'GENERAL_REFERENCE',
          lowerNumeric: 3.5,
          upperNumeric: 5,
          sourceCode: null,
        },
      ],
      targets: [
        {
          targetId: 'TGT-001',
          inputCode: 'A1C',
          sourceCode: 'MISSING',
        },
      ],
      pediatric: [{ inputCode: 'POTASSIUM', adultFallbackAllowed: true }],
      sources: [{ sourceCode: 'MCC_ADULT', status: 'ACTIVE' }],
    });
    expect(issues.map((issue) => issue.code).sort()).toEqual([
      'MISSING_SOURCE',
      'MISSING_SOURCE',
      'PEDIATRIC_ADULT_FALLBACK',
    ]);
  });
});
