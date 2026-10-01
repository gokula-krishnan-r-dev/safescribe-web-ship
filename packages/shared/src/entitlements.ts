/** Module-agnostic SafeScribe entitlements and pharmacy usage limits. */

export const SAFESCRIBE_MODULES = {
  PRESCRIBE: 'prescribe',
  RENEW: 'renew',
  ADAPT: 'adapt',
  CACP: 'cacp',
  FOLLOW_UP: 'follow_up',
} as const;

export type SafeScribeModule =
  (typeof SAFESCRIBE_MODULES)[keyof typeof SAFESCRIBE_MODULES];

export const ENTITLEMENT_PERIODS = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
} as const;

export type EntitlementPeriod =
  (typeof ENTITLEMENT_PERIODS)[keyof typeof ENTITLEMENT_PERIODS];

export const USAGE_EVENT_TYPES = {
  ASSESSMENT_STARTED: 'assessment_started',
} as const;

export const ACCESS_DENIAL_CODES = {
  MODULE_NOT_ENTITLED: 'MODULE_NOT_ENTITLED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
  PROFESSIONAL_ACK_REQUIRED: 'PROFESSIONAL_ACK_REQUIRED',
} as const;

export const DEFAULT_PRESCRIBE_DAILY_INCLUDED = 10;
export const DEFAULT_PHARMACY_TIMEZONE = 'America/Edmonton';

export const PHARMACY_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Vancouver', label: 'Pacific — Vancouver' },
  { value: 'America/Edmonton', label: 'Mountain — Edmonton' },
  { value: 'America/Regina', label: 'Saskatchewan — Regina' },
  { value: 'America/Winnipeg', label: 'Central — Winnipeg' },
  { value: 'America/Toronto', label: 'Eastern — Toronto' },
  { value: 'America/Halifax', label: 'Atlantic — Halifax' },
  { value: 'America/St_Johns', label: 'Newfoundland — St. John’s' },
  { value: 'America/Whitehorse', label: 'Yukon — Whitehorse' },
];

export const MODULE_LABELS: Record<string, string> = {
  [SAFESCRIBE_MODULES.PRESCRIBE]: 'Prescribe',
  [SAFESCRIBE_MODULES.RENEW]: 'Renew',
  [SAFESCRIBE_MODULES.ADAPT]: 'Adapt',
  [SAFESCRIBE_MODULES.CACP]: 'CACP',
  [SAFESCRIBE_MODULES.FOLLOW_UP]: 'Follow-up',
};

export interface EntitlementUsageSnapshot {
  module: string;
  moduleLabel: string;
  active: boolean;
  period: EntitlementPeriod | string;
  /** Null means unlimited. */
  included: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  allowed: boolean;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  resetsAt: string;
}

export function isSafeScribeModule(value: string): value is SafeScribeModule {
  return Object.values(SAFESCRIBE_MODULES).includes(value as SafeScribeModule);
}

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export type PharmacyUsageHealth = 'inactive' | 'unlimited' | 'at_limit' | 'tight' | 'ok';

export const PHARMACY_USAGE_HEALTH_LABEL: Record<PharmacyUsageHealth, string> = {
  inactive: 'Off',
  unlimited: 'Unlimited',
  at_limit: 'Limit reached',
  tight: 'Almost full',
  ok: 'On track',
};

export function pharmacyUsageHealth(
  snapshot: Pick<EntitlementUsageSnapshot, 'active' | 'unlimited' | 'allowed' | 'remaining'>,
): PharmacyUsageHealth {
  if (!snapshot.active) return 'inactive';
  if (snapshot.unlimited) return 'unlimited';
  if (!snapshot.allowed || (snapshot.remaining ?? 0) <= 0) return 'at_limit';
  if ((snapshot.remaining ?? 0) <= 2) return 'tight';
  return 'ok';
}

export function utilizationPercent(used: number, included: number | null | undefined): number | null {
  if (included == null || included <= 0) return null;
  return Math.min(100, Math.round((used / included) * 100));
}

/** YYYY-MM-DD in the pharmacy timezone. */
export function localCalendarDate(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone.trim() || DEFAULT_PHARMACY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_PHARMACY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

export function lastLocalDateKeys(now: Date, timeZone: string, days: number): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let i = days - 1; i >= 0; i--) {
    const probe = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = localCalendarDate(probe, timeZone);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function bucketCountsByLocalDate(
  occurredAt: Array<Date | string>,
  timeZone: string,
  days: number,
  now = new Date(),
): Array<{ date: string; used: number }> {
  const keys = lastLocalDateKeys(now, timeZone, days);
  const counts = new Map(keys.map((key) => [key, 0]));
  for (const raw of occurredAt) {
    const date = typeof raw === 'string' ? new Date(raw) : raw;
    if (Number.isNaN(date.getTime())) continue;
    const key = localCalendarDate(date, timeZone);
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((date) => ({ date, used: counts.get(date) ?? 0 }));
}
