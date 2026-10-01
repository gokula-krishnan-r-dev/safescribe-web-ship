/**
 * Pharmacy-local calendar windows for usage limits.
 * Daily/monthly allowances reset in the pharmacy timezone, not UTC midnight.
 */

export interface ZonedPeriodWindow {
  start: Date;
  end: Date;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Milliseconds to add to UTC to obtain wall-clock time in `timeZone`. */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const zoned = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  return asUtc - date.getTime();
}

function startOfZonedCalendarDay(now: Date, timeZone: string, dayOffset = 0): Date {
  const offset = timeZoneOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset);
  const startUtcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + dayOffset,
  );
  return new Date(startUtcMs - offset);
}

function startOfZonedCalendarMonth(now: Date, timeZone: string): Date {
  const offset = timeZoneOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset);
  const startUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return new Date(startUtcMs - offset);
}

export function usagePeriodWindow(
  now: Date,
  timeZone: string,
  period: string,
): ZonedPeriodWindow {
  const tz = timeZone.trim() || 'America/Edmonton';
  if (period === 'monthly') {
    const start = startOfZonedCalendarMonth(now, tz);
    const offset = timeZoneOffsetMs(start, tz);
    const local = new Date(start.getTime() + offset);
    const nextMonthUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1);
    const end = new Date(nextMonthUtc - offset);
    return { start, end };
  }

  const start = startOfZonedCalendarDay(now, tz);
  const end = startOfZonedCalendarDay(now, tz, 1);
  return { start, end };
}

export function remainingAllowance(
  included: number | null | undefined,
  used: number,
): { remaining: number | null; unlimited: boolean; allowed: boolean } {
  if (included == null) {
    return { remaining: null, unlimited: true, allowed: true };
  }
  const remaining = Math.max(0, included - used);
  return { remaining, unlimited: false, allowed: remaining > 0 };
}
