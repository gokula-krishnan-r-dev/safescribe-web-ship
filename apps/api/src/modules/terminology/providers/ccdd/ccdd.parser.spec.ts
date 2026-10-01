import {
  parseMpDisplay,
  parseNtpDisplay,
  scoreClinicalRelevance,
  omitPlaceholderValue,
} from './ccdd.parser';

describe('CCDD display parser — strength', () => {
  it('extracts strength from manufactured product displays', () => {
    const parsed = parseMpDisplay(
      'NORVASC (amlodipine (amlodipine besylate) 5 mg oral tablet) PFIZER CANADA ULC',
    );
    expect(parsed.brandName).toBe('NORVASC');
    expect(parsed.strength).toBe('5 mg');
    expect(parsed.dosageForm?.toLowerCase()).toContain('tablet');
    expect(parsed.genericName?.toLowerCase()).toContain('amlodipine');
    expect(parsed.genericName?.toLowerCase()).not.toContain('besylate');
  });

  it('extracts strength from NTP displays', () => {
    const parsed = parseNtpDisplay('amlodipine 10 mg oral tablet');
    expect(parsed.strength).toBe('10 mg');
    expect(parsed.dosageForm?.toLowerCase()).toContain('tablet');
  });

  it('omits CCDD manufacturer Unknown from manufactured products', () => {
    const parsed = parseMpDisplay(
      'METFORMIN (metformin hydrochloride 500 mg oral tablet) Unknown',
    );
    expect(parsed.genericName?.toLowerCase()).toContain('metformin');
    expect(parsed.manufacturer).toBeUndefined();
    expect(parsed.label.toLowerCase()).not.toContain('unknown');
    expect(parsed.brandName?.toLowerCase()).not.toBe('unknown');
  });

  it('does not treat Unknown as a brand when it is the MP display prefix', () => {
    const parsed = parseMpDisplay(
      'Unknown (metformin hydrochloride 500 mg oral tablet) APOTEX INC',
    );
    expect(parsed.brandName?.toLowerCase()).not.toBe('unknown');
    expect(parsed.genericName?.toLowerCase()).toContain('metformin');
    expect(parsed.manufacturer).toBe('APOTEX INC');
  });

  it('ranks products with strength higher for clinical relevance', () => {
    const withStrength = scoreClinicalRelevance('norvasc', {
      genericName: 'amlodipine',
      brandName: 'NORVASC',
      drugClass: 'calcium channel blocker',
      strength: '5 mg',
    });
    const without = scoreClinicalRelevance('norvasc', {
      genericName: 'amlodipine',
      brandName: 'NORVASC',
      drugClass: 'calcium channel blocker',
    });
    expect(withStrength).toBeGreaterThan(without);
  });

  it('treats CCDD Unknown as an absent value', () => {
    expect(omitPlaceholderValue('Unknown')).toBeUndefined();
    expect(omitPlaceholderValue('n/a')).toBeUndefined();
    expect(omitPlaceholderValue('APOTEX INC')).toBe('APOTEX INC');
  });
});
