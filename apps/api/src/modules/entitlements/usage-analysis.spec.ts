import {
  bucketCountsByLocalDate,
  localCalendarDate,
  pharmacyUsageHealth,
  utilizationPercent,
} from '@safescript/shared';

describe('pharmacy usage health', () => {
  it('flags exhausted and nearly exhausted pharmacies', () => {
    expect(
      pharmacyUsageHealth({ active: true, unlimited: false, allowed: false, remaining: 0 }),
    ).toBe('at_limit');
    expect(
      pharmacyUsageHealth({ active: true, unlimited: false, allowed: true, remaining: 2 }),
    ).toBe('tight');
    expect(
      pharmacyUsageHealth({ active: true, unlimited: false, allowed: true, remaining: 6 }),
    ).toBe('ok');
    expect(
      pharmacyUsageHealth({ active: false, unlimited: false, allowed: false, remaining: 0 }),
    ).toBe('inactive');
  });

  it('computes utilization without dividing by zero', () => {
    expect(utilizationPercent(8, 10)).toBe(80);
    expect(utilizationPercent(3, null)).toBeNull();
    expect(utilizationPercent(1, 0)).toBeNull();
  });
});

describe('local date bucketing', () => {
  it('keeps Edmonton evening on the previous local calendar day vs UTC', () => {
    const utcMorning = new Date('2026-08-15T02:00:00.000Z');
    expect(localCalendarDate(utcMorning, 'America/Edmonton')).toBe('2026-08-14');
  });

  it('fills empty days in a 7-day trend', () => {
    const now = new Date('2026-08-15T18:00:00.000Z');
    const trend = bucketCountsByLocalDate(
      ['2026-08-15T12:00:00.000Z', '2026-08-15T13:00:00.000Z'],
      'America/Toronto',
      7,
      now,
    );
    expect(trend).toHaveLength(7);
    expect(trend[trend.length - 1]).toEqual({ date: '2026-08-15', used: 2 });
    expect(trend[0]?.used).toBe(0);
  });
});
