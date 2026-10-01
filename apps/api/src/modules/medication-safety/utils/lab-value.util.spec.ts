import {
  compareLabValue,
  mergeLabObservations,
  normalizeObservationKey,
  parseLabValuesText,
  resolveLabThreshold,
} from './lab-value.util';

describe('lab-value.util', () => {
  it('parses eGFR from free text', () => {
    const labs = parseLabValuesText('eGFR: 28 mL/min\nCreatinine: 1.8 mg/dL');
    expect(labs.find((l) => l.key === 'egfr')?.value).toBe(28);
    expect(labs.find((l) => l.key === 'creatinine')?.value).toBe(1.8);
  });

  it('compares LT threshold at boundary', () => {
    expect(compareLabValue(29, 'LT', 30)).toBe(true);
    expect(compareLabValue(30, 'LT', 30)).toBe(false);
  });

  it('compares LTE threshold at boundary', () => {
    expect(compareLabValue(30, 'LTE', 30)).toBe(true);
    expect(compareLabValue(31, 'LTE', 30)).toBe(false);
  });

  it('compares BETWEEN range inclusively', () => {
    expect(compareLabValue(5, 'BETWEEN', 3, 7)).toBe(true);
    expect(compareLabValue(2, 'BETWEEN', 3, 7)).toBe(false);
  });

  it('resolves ABOVE_ULN potassium defaults when thresholds missing', () => {
    const r = resolveLabThreshold({
      comparator: 'BETWEEN',
      thresholdLow: null,
      thresholdHigh: null,
      observationDisplay: 'Potassium [Moles/volume] in Serum or Plasma',
      referenceLimitDirection: 'ABOVE_UPPER_LIMIT',
    });
    expect(r.resolved).toBe(true);
    expect(r.comparator).toBe('GTE');
    expect(r.thresholdLow).toBe(5.0);
    expect(compareLabValue(5.8, r.comparator, r.thresholdLow, r.thresholdHigh)).toBe(true);
    expect(compareLabValue(5.0, r.comparator, r.thresholdLow, r.thresholdHigh)).toBe(true);
    expect(compareLabValue(4.9, r.comparator, r.thresholdLow, r.thresholdHigh)).toBe(false);
  });

  it('normalizes GT when only thresholdHigh was stored', () => {
    const r = resolveLabThreshold({
      comparator: 'GT',
      thresholdLow: null,
      thresholdHigh: 1.5,
      observationDisplay: 'Lithium',
    });
    expect(r.thresholdLow).toBe(1.5);
    expect(compareLabValue(1.6, r.comparator, r.thresholdLow, r.thresholdHigh)).toBe(true);
  });

  it('merges structured labs over text', () => {
    const merged = mergeLabObservations(
      [{ name: 'eGFR', value: '45', unit: 'mL/min' }],
      'eGFR: 28 mL/min',
    );
    expect(merged.find((l) => l.key === 'egfr')?.value).toBe(45);
  });

  it('normalizes observation aliases', () => {
    expect(normalizeObservationKey('Estimated GFR')).toBe('egfr');
    expect(normalizeObservationKey('K')).toBe('potassium');
    expect(normalizeObservationKey('ALT')).toBe('alt');
    expect(
      normalizeObservationKey('Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'),
    ).toBe('alt');
    expect(normalizeObservationKey('AST')).toBe('ast');
    expect(
      normalizeObservationKey('Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma'),
    ).toBe('ast');
  });
});
