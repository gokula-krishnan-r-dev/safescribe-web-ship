import {
  completedWeeksPlusDays,
  gestationalIntervalFromRuleCode,
  isWithinGestationalInterval,
  parseGestationalAgeWeeks,
} from './gestational-interval.util';
import {
  parseSpreadsheetBoolean,
  parseSpreadsheetNumber,
} from '@/modules/clinical-repository/contracts/workbook-registry';

describe('gestational interval', () => {
  const ga20to27 = {
    minWeeks: 20,
    minInclusive: true,
    maxWeeks: 28,
    maxInclusive: false,
  };
  const ga28plus = {
    minWeeks: 28,
    minInclusive: true,
    maxWeeks: null,
    maxInclusive: true,
  };

  it('matches 20 inclusive and 27.9, not 28, for GA20-27', () => {
    expect(isWithinGestationalInterval(19.9, ga20to27)).toBe(false);
    expect(isWithinGestationalInterval(20, ga20to27)).toBe(true);
    expect(isWithinGestationalInterval(27.9, ga20to27)).toBe(true);
    expect(isWithinGestationalInterval(28, ga20to27)).toBe(false);
  });

  it('matches 28 and 39 for GA28-PLUS only', () => {
    expect(isWithinGestationalInterval(27.9, ga28plus)).toBe(false);
    expect(isWithinGestationalInterval(28, ga28plus)).toBe(true);
    expect(isWithinGestationalInterval(39, ga28plus)).toBe(true);
  });

  it('treats 27 weeks 6 days as below 28 and 28+0 as 28', () => {
    expect(isWithinGestationalInterval(completedWeeksPlusDays(27, 6), ga20to27)).toBe(true);
    expect(isWithinGestationalInterval(completedWeeksPlusDays(28, 0), ga20to27)).toBe(false);
    expect(isWithinGestationalInterval(completedWeeksPlusDays(28, 0), ga28plus)).toBe(true);
  });

  it('parses weeks from status text', () => {
    expect(parseGestationalAgeWeeks('28 weeks')).toBe(28);
    expect(parseGestationalAgeWeeks('28w')).toBe(28);
    expect(parseGestationalAgeWeeks('27+6')).toBeCloseTo(completedWeeksPlusDays(27, 6));
  });

  it('reads bounded intervals from governed rule codes when payload is missing', () => {
    expect(gestationalIntervalFromRuleCode('SS-PREG-SYSTEMIC-NSAID-GA20-27')).toEqual(ga20to27);
    expect(gestationalIntervalFromRuleCode('SS-PREG-SYSTEMIC-NSAID-GA28-PLUS')?.minWeeks).toBe(28);
  });
});

describe('parseSpreadsheetBoolean', () => {
  it.each([
    [true, true],
    [false, false],
    ['TRUE', true],
    ['FALSE', false],
    ['YES', true],
    ['NO', false],
    [1, true],
    [0, false],
  ])('parses %p as %s', (input, expected) => {
    expect(parseSpreadsheetBoolean(input, 'field')).toBe(expected);
  });

  it('does not treat the string FALSE as true', () => {
    expect(Boolean('FALSE')).toBe(true);
    expect(parseSpreadsheetBoolean('FALSE', 'gestational_age_max_inclusive')).toBe(false);
  });

  it('rejects unexpected values', () => {
    expect(() => parseSpreadsheetBoolean('unexpected', 'field')).toThrow(/Invalid Boolean/);
  });
});

describe('parseSpreadsheetNumber', () => {
  it('parses numeric strings', () => {
    expect(parseSpreadsheetNumber('28', 'weeks')).toBe(28);
    expect(parseSpreadsheetNumber('', 'weeks')).toBeNull();
  });

  it('rejects invalid numbers', () => {
    expect(() => parseSpreadsheetNumber('not-a-number', 'weeks')).toThrow(/Invalid number/);
  });
});
