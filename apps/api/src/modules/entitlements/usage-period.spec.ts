import { usagePeriodWindow, remainingAllowance } from '@safescript/shared';

describe('usagePeriodWindow', () => {
  it('uses pharmacy-local midnight rather than UTC', () => {
    // 15 Aug 2026 02:00 UTC is still 14 Aug evening in Edmonton (UTC-6 in summer).
    const now = new Date('2026-08-15T02:00:00.000Z');
    const { start, end } = usagePeriodWindow(now, 'America/Edmonton', 'daily');
    expect(start.toISOString()).toBe('2026-08-14T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-15T06:00:00.000Z');
  });

  it('opens a monthly window on the 1st in the pharmacy timezone', () => {
    const now = new Date('2026-08-17T18:00:00.000Z');
    const { start } = usagePeriodWindow(now, 'America/Toronto', 'monthly');
    expect(start.toISOString()).toBe('2026-08-01T04:00:00.000Z');
  });
});

describe('remainingAllowance', () => {
  it('treats null included as unlimited', () => {
    expect(remainingAllowance(null, 50)).toEqual({
      remaining: null,
      unlimited: true,
      allowed: true,
    });
  });

  it('blocks when used meets the included quantity', () => {
    expect(remainingAllowance(10, 10)).toEqual({
      remaining: 0,
      unlimited: false,
      allowed: false,
    });
    expect(remainingAllowance(10, 8).remaining).toBe(2);
  });
});
