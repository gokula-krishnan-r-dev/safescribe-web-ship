import {
  isOtherFrequencyPlaceholder,
  parseHourlyInterval,
} from '../consultations/add-treatment/frequency-options';
import type { TimingPreset, TimingPresetGroup } from './types';

export type CustomTimingPeriod = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

const ACTION_ONLY_FREQUENCY = '';

function preset(
  id: string,
  code: string,
  label: string,
  group: TimingPresetGroup,
  frequencyValue: string,
  perDay: number | null,
  extra?: Partial<TimingPreset>,
): TimingPreset {
  return {
    id,
    code,
    label,
    group,
    frequencyValue,
    perDay,
    ...extra,
  };
}

/** Central timing catalogue — plain-language labels, mapped to legacy frequency values. */
export const TIMING_PRESETS: readonly TimingPreset[] = [
  preset('ONCE_ONLY', 'ONCE', 'Once only', 'COMMON', 'ONCE - One time only', 1),
  preset('ONCE_DAILY', 'QD', 'Once daily', 'COMMON', 'QD - Once daily', 1),
  preset('TWICE_DAILY', 'BID', 'Twice daily', 'COMMON', 'BID - Two times daily', 2),
  preset('THREE_TIMES_DAILY', 'TID', 'Three times daily', 'COMMON', 'TID - Three times daily', 3),
  preset('FOUR_TIMES_DAILY', 'QID', 'Four times daily', 'COMMON', 'QID - Four times daily', 4),
  preset('EVERY_MORNING', 'QAM', 'Every morning', 'TIME_OF_DAY', 'QAM - Every morning', 1),
  preset('AT_NOON', 'QNOON', 'At noon', 'TIME_OF_DAY', 'QNOON - Every day at noon', 1),
  preset('EVERY_EVENING', 'QPM', 'Every evening', 'TIME_OF_DAY', 'QPM - Every evening', 1),
  preset('AT_BEDTIME', 'QHS', 'At bedtime', 'TIME_OF_DAY', 'QHS - Every day at bedtime', 1),
  preset('EVERY_2_HOURS', 'Q2H', 'Every 2 hours', 'INTERVAL', 'Q2H - Every 2 hours', 12),
  preset('EVERY_3_HOURS', 'Q3H', 'Every 3 hours', 'INTERVAL', 'Q3H - Every 3 hours', 8),
  preset('EVERY_4_HOURS', 'Q4H', 'Every 4 hours', 'INTERVAL', 'Q4H - Every 4 hours', 6),
  preset('EVERY_6_HOURS', 'Q6H', 'Every 6 hours', 'INTERVAL', 'Q6H - Every 6 hours', 4),
  preset('EVERY_8_HOURS', 'Q8H', 'Every 8 hours', 'INTERVAL', 'Q8H - Every 8 hours', 3),
  preset('EVERY_12_HOURS', 'Q12H', 'Every 12 hours', 'INTERVAL', 'Q12H - Every 12 hours', 2),
  preset('EVERY_24_HOURS', 'Q24H', 'Every 24 hours', 'INTERVAL', 'Q24H - Every 24 hours', 1),
  preset(
    'CUSTOM_HOURLY_INTERVAL',
    'CUSTOM_HOURLY',
    'Every ___ hours',
    'CUSTOM',
    ACTION_ONLY_FREQUENCY,
    null,
    { custom: true },
  ),
  preset(
    'AT_SYMPTOM_ONSET',
    'AT_ONSET',
    'At symptom onset',
    'EVENT',
    'AT_ONSET - At symptom onset',
    null,
  ),
  preset(
    'AT_FIRST_SIGN_OF_SYMPTOMS',
    'FIRST_SIGN',
    'At the first sign of symptoms',
    'EVENT',
    'FIRST_SIGN - At the first sign of symptoms',
    null,
  ),
  preset('ONCE_WEEKLY', '1x/week', 'Once weekly', 'CALENDAR', '1x/week - Once a week', null),
  preset('TWICE_WEEKLY', '2x/week', 'Twice weekly', 'CALENDAR', '2x/week - Twice/Week', null),
  preset(
    'CUSTOM_SCHEDULE',
    'OTH',
    'Custom timing or frequency…',
    'CUSTOM',
    ACTION_ONLY_FREQUENCY,
    null,
    { custom: true },
  ),
] as const;

const PRESET_BY_ID = new Map(TIMING_PRESETS.map((p) => [p.id, p]));
const PRESET_BY_CODE = new Map(TIMING_PRESETS.map((p) => [p.code.toUpperCase(), p]));

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

const FREQUENCY_INDEX = (() => {
  const index = new Map<string, TimingPreset>();
  const add = (key: string, presetItem: TimingPreset) => {
    const normalized = normalizeKey(key);
    if (normalized && !index.has(normalized)) index.set(normalized, presetItem);
  };

  for (const item of TIMING_PRESETS) {
    add(item.id, item);
    add(item.code, item);
    // Action-only custom rows are menu entries, not stored frequencies.
    if (item.custom) continue;
    add(item.label, item);
    add(item.frequencyValue, item);
  }

  const legacyAliases: Array<[string, string]> = [
    ['once daily', 'ONCE_DAILY'],
    ['daily', 'ONCE_DAILY'],
    ['twice daily', 'TWICE_DAILY'],
    ['two times daily', 'TWICE_DAILY'],
    ['three times daily', 'THREE_TIMES_DAILY'],
    ['four times daily', 'FOUR_TIMES_DAILY'],
    ['at bedtime', 'AT_BEDTIME'],
    ['bedtime', 'AT_BEDTIME'],
    ['every morning', 'EVERY_MORNING'],
    ['every evening', 'EVERY_EVENING'],
    ['at symptom onset', 'AT_SYMPTOM_ONSET'],
    ['at migraine onset', 'AT_SYMPTOM_ONSET'],
    ['at onset', 'AT_SYMPTOM_ONSET'],
    ['once only', 'ONCE_ONLY'],
    ['single dose', 'ONCE_ONLY'],
    ['every 6 hours', 'EVERY_6_HOURS'],
    ['every 8 hours', 'EVERY_8_HOURS'],
    ['every 4 hours', 'EVERY_4_HOURS'],
    ['every 12 hours', 'EVERY_12_HOURS'],
    ['q6h', 'EVERY_6_HOURS'],
    ['q8h', 'EVERY_8_HOURS'],
    ['q4h', 'EVERY_4_HOURS'],
    ['q12h', 'EVERY_12_HOURS'],
    ['qd', 'ONCE_DAILY'],
    ['bid', 'TWICE_DAILY'],
    ['tid', 'THREE_TIMES_DAILY'],
    ['qid', 'FOUR_TIMES_DAILY'],
    ['qhs', 'AT_BEDTIME'],
    ['once weekly', 'ONCE_WEEKLY'],
  ];

  for (const [alias, id] of legacyAliases) {
    const item = PRESET_BY_ID.get(id);
    if (item) add(alias, item);
  }

  return index;
})();

export function getTimingPreset(id: string): TimingPreset | undefined {
  return PRESET_BY_ID.get(id);
}

export function getTimingPresetByCode(code: string): TimingPreset | undefined {
  return PRESET_BY_CODE.get(code.toUpperCase());
}

export function resolveTimingPreset(raw?: string | null): TimingPreset | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  return FREQUENCY_INDEX.get(normalizeKey(value));
}

export function presetIdFromFrequency(raw?: string | null): string | undefined {
  return resolveTimingPreset(raw)?.id;
}

export function frequencyValueFromPresetId(id: string): string {
  return getTimingPreset(id)?.frequencyValue ?? '';
}

const STANDARD_HOURLY_PRESET_ID: Record<number, string> = {
  2: 'EVERY_2_HOURS',
  3: 'EVERY_3_HOURS',
  4: 'EVERY_4_HOURS',
  6: 'EVERY_6_HOURS',
  8: 'EVERY_8_HOURS',
  12: 'EVERY_12_HOURS',
  24: 'EVERY_24_HOURS',
};

export function hourlyTimingLabel(hours: number): string {
  return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
}

/** Persist a resolved hourly interval, never the “Every ___ hours” placeholder. */
export function frequencyValueFromHours(hours: number): string {
  const presetId = STANDARD_HOURLY_PRESET_ID[hours];
  const presetItem = presetId ? getTimingPreset(presetId) : undefined;
  if (presetItem && !presetItem.custom) return presetItem.frequencyValue;
  return `Q${hours}H - Every ${hours} hours`;
}

function isPlaceholderTimingValue(raw?: string | null): boolean {
  const value = (raw ?? '').trim();
  if (!value || isOtherFrequencyPlaceholder(value)) return true;
  const key = normalizeKey(value);
  return key === 'every ___ hours' || key === 'custom timing or frequency…';
}

export function buildCustomTimingLabel(count: number, period: CustomTimingPeriod): string {
  if (period === 'HOUR') return hourlyTimingLabel(count);
  if (period === 'DAY') {
    if (count === 1) return 'Every day';
    if (count === 2) return 'Every other day';
    return `Every ${count} days`;
  }
  if (period === 'WEEK') return count === 1 ? 'Every week' : `Every ${count} weeks`;
  return count === 1 ? 'Every month' : `Every ${count} months`;
}

export function parseCustomTimingDraft(raw?: string | null): {
  count: number;
  period: CustomTimingPeriod;
  label: string;
} {
  const value = (raw ?? '').trim();
  if (!value || isPlaceholderTimingValue(value)) {
    return { count: 2, period: 'DAY', label: '' };
  }

  const hours = parseHourlyInterval(value);
  if (hours != null) {
    return { count: hours, period: 'HOUR', label: hourlyTimingLabel(hours) };
  }

  const every = value.match(/^every\s+(\d+)\s+(hours?|days?|weeks?|months?)$/i);
  if (every) {
    const count = Number(every[1]);
    const unit = every[2].toLowerCase();
    const period: CustomTimingPeriod = unit.startsWith('hour')
      ? 'HOUR'
      : unit.startsWith('day')
        ? 'DAY'
        : unit.startsWith('week')
          ? 'WEEK'
          : 'MONTH';
    return { count, period, label: buildCustomTimingLabel(count, period) };
  }

  if (/^every other day$/i.test(value)) {
    return { count: 2, period: 'DAY', label: 'Every other day' };
  }
  if (/^every day$/i.test(value)) {
    return { count: 1, period: 'DAY', label: 'Every day' };
  }
  if (/^every week$/i.test(value) || /^once weekly$/i.test(value)) {
    return { count: 1, period: 'WEEK', label: 'Every week' };
  }
  if (/^every month$/i.test(value) || /^once monthly$/i.test(value)) {
    return { count: 1, period: 'MONTH', label: 'Once monthly' };
  }
  if (/^three times weekly$/i.test(value)) {
    return { count: 3, period: 'WEEK', label: 'Three times weekly' };
  }

  return { count: 2, period: 'DAY', label: value };
}

export function frequencyValueFromCustomTiming(
  count: number,
  period: CustomTimingPeriod,
  label: string,
): string {
  const trimmed = label.trim();
  if (period === 'HOUR') {
    const generated = buildCustomTimingLabel(count, 'HOUR');
    if (!trimmed || normalizeKey(trimmed) === normalizeKey(generated)) {
      return frequencyValueFromHours(count);
    }
  }
  return trimmed;
}

export function timingLabelFromFrequency(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value || isPlaceholderTimingValue(value)) return '';

  const hours = parseHourlyInterval(value);
  if (hours != null) {
    const presetId = STANDARD_HOURLY_PRESET_ID[hours];
    const standard = presetId ? getTimingPreset(presetId) : undefined;
    if (standard && !standard.custom) return standard.label;
    return hourlyTimingLabel(hours);
  }

  const presetItem = resolveTimingPreset(value);
  if (presetItem && !presetItem.custom) return presetItem.label;

  const dash = value.indexOf(' - ');
  return dash >= 0 ? value.slice(dash + 3) : value;
}

/** Which menu row should appear selected for the stored frequency. */
export function selectedTimingPresetId(raw?: string | null): string | undefined {
  const value = (raw ?? '').trim();
  if (!value || isPlaceholderTimingValue(value)) return undefined;

  const hours = parseHourlyInterval(value);
  if (hours != null) {
    const presetId = STANDARD_HOURLY_PRESET_ID[hours];
    const standard = presetId ? getTimingPreset(presetId) : undefined;
    if (standard && !standard.custom) return standard.id;
    return 'CUSTOM_HOURLY_INTERVAL';
  }

  const presetItem = resolveTimingPreset(value);
  if (presetItem && !presetItem.custom) return presetItem.id;
  return 'CUSTOM_SCHEDULE';
}

/** Default common alternatives when pathway config is absent. */
export const DEFAULT_COMMON_TIMING_IDS = [
  'ONCE_ONLY',
  'ONCE_DAILY',
  'TWICE_DAILY',
  'EVERY_6_HOURS',
  'EVERY_8_HOURS',
] as const;

export function timingPresetsByGroup(): Record<TimingPresetGroup, TimingPreset[]> {
  const groups: Record<TimingPresetGroup, TimingPreset[]> = {
    COMMON: [],
    TIME_OF_DAY: [],
    INTERVAL: [],
    EVENT: [],
    CALENDAR: [],
    CUSTOM: [],
  };
  for (const p of TIMING_PRESETS) {
    groups[p.group].push(p);
  }
  return groups;
}

export const TIMING_GROUP_LABELS: Record<TimingPresetGroup, string> = {
  COMMON: 'Daily schedules',
  TIME_OF_DAY: 'Time of day',
  INTERVAL: 'Hourly intervals',
  EVENT: 'Symptom or event based',
  CALENDAR: 'Weekly and monthly',
  CUSTOM: 'Custom',
};
