/**
 * Gestational-age interval comparison for pregnancy rules.
 * Uses structured min/max weeks and explicit inclusive flags — not trimester text.
 */

export interface GestationalInterval {
  minWeeks: number | null;
  minInclusive: boolean;
  maxWeeks: number | null;
  maxInclusive: boolean;
}

export function isWithinGestationalInterval(
  gestationalAgeWeeks: number,
  interval: GestationalInterval,
): boolean {
  const aboveMinimum =
    interval.minWeeks === null ||
    (interval.minInclusive
      ? gestationalAgeWeeks >= interval.minWeeks
      : gestationalAgeWeeks > interval.minWeeks);

  const belowMaximum =
    interval.maxWeeks === null ||
    (interval.maxInclusive
      ? gestationalAgeWeeks <= interval.maxWeeks
      : gestationalAgeWeeks < interval.maxWeeks);

  return aboveMinimum && belowMaximum;
}

export function intervalHasBounds(interval: GestationalInterval | null | undefined): boolean {
  if (!interval) return false;
  return interval.minWeeks != null || interval.maxWeeks != null;
}

/** 27 weeks + 6 days → 27 + 6/7. */
export function completedWeeksPlusDays(weeks: number, days: number): number {
  return weeks + days / 7;
}

/**
 * Parse gestational age from a free-text pregnancy status.
 * Supports "28 weeks", "28w", "27+6", "27 weeks 6 days".
 */
export function parseGestationalAgeWeeks(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return undefined;

  const plusDays = raw.match(/(\d+)\s*\+\s*(\d+)\s*(?:d|days?)?/i);
  if (plusDays) {
    return completedWeeksPlusDays(Number(plusDays[1]), Number(plusDays[2]));
  }

  const weeksAndDays = raw.match(
    /(\d+(?:\.\d+)?)\s*(?:weeks?|wks?|w)\s*(?:and\s*)?(\d+)\s*(?:days?|d)\b/i,
  );
  if (weeksAndDays) {
    return completedWeeksPlusDays(Number(weeksAndDays[1]), Number(weeksAndDays[2]));
  }

  const weeksOnly = raw.match(/(\d+(?:\.\d+)?)\s*(?:weeks?|wks?|w)\b/i);
  if (weeksOnly) return Number(weeksOnly[1]);

  return undefined;
}

export function gestationalIntervalFromPayload(
  payload: Record<string, unknown> | null | undefined,
): GestationalInterval | null {
  if (!payload) return null;
  const minWeeks = parseOptionalFinite(payload.gestational_age_min_weeks);
  const maxWeeks = parseOptionalFinite(payload.gestational_age_max_weeks);
  if (minWeeks == null && maxWeeks == null) return null;
  return {
    minWeeks,
    minInclusive: parseInclusiveFlag(payload.gestational_age_min_inclusive, true),
    maxWeeks,
    maxInclusive: parseInclusiveFlag(payload.gestational_age_max_inclusive, true),
  };
}

/**
 * Fallback when cached rules predate payload hydration.
 * Only well-known governed suffixes — never alert text.
 */
export function gestationalIntervalFromRuleCode(ruleCode: string | undefined): GestationalInterval | null {
  const code = (ruleCode ?? '').toUpperCase();
  if (!code) return null;
  if (/\bGA20-27\b/.test(code) || /GA20-27/.test(code)) {
    return {
      minWeeks: 20,
      minInclusive: true,
      maxWeeks: 28,
      maxInclusive: false,
    };
  }
  if (/GA28-PLUS/.test(code) || /GA28\+/.test(code)) {
    return {
      minWeeks: 28,
      minInclusive: true,
      maxWeeks: null,
      maxInclusive: true,
    };
  }
  return null;
}

function parseOptionalFinite(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function parseInclusiveFlag(value: unknown, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const n = String(value).trim().toUpperCase();
  if (n === 'TRUE' || n === 'YES' || n === '1') return true;
  if (n === 'FALSE' || n === 'NO' || n === '0') return false;
  // Spec: Boolean("FALSE") must not win. Unknown → exclusive max / inclusive min defaults.
  return defaultValue;
}
