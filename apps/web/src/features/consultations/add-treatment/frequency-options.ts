export interface FrequencyOption {
  code: string;
  description: string;
  /** Canonical stored value shown in the combobox. */
  value: string;
  /** Administrations per 24h for dispense math. `null` = not a daily countable SIG. */
  perDay: number | null;
  custom?: boolean;
}

function option(
  code: string,
  description: string,
  perDay: number | null,
  extra?: Partial<FrequencyOption>,
): FrequencyOption {
  return {
    code,
    description,
    value: `${code} - ${description}`,
    perDay,
    ...extra,
  };
}

/**
 * Pharmacist SIG frequencies. Order matches the clinical picker:
 * common daily codes first, then interval / weekly / other codes from the
 * attached production screenshot.
 */
export const FREQUENCY_CATALOG: readonly FrequencyOption[] = [
  option('QD', 'Once daily', 1),
  option('BID', 'Two times daily', 2),
  option('TID', 'Three times daily', 3),
  option('QID', 'Four times daily', 4),
  option('QHS', 'Every day at bedtime', 1),
  option('Q2H', 'Every 2 hours', 12),
  option('QAM', 'Every morning', 1),
  option('QPM', 'Every evening', 1),
  option('QNOON', 'Every day at noon', 1),
  option('ONCE', 'One time only', 1),
  option('STAT', 'Now', 1),
  option('21/28D', '21 out of 28 Days', 1),
  option('Q1-2H', 'Every 1 to 2 hours', 24),
  option('Q2-3H', 'Every 2 to 3 hours', 12),
  option('Q3D', 'Every 3 days', null),
  option('Q3H', 'Every 3 hours', 8),
  option('Q3-4H', 'Every 3 to 4 hours', 8),
  option('Q4H', 'Every 4 hours', 6),
  option('Q4-6H', 'Every 4 to 6 hours', 6),
  option('Q6H', 'Every 6 hours', 4),
  option('Q6-8H', 'Every 6 to 8 hours', 4),
  option('Q8H', 'Every 8 hours', 3),
  option('Q12H', 'Every 12 hours', 2),
  option('AT_ONSET', 'At symptom onset', null),
  option('FIRST_SIGN', 'At the first sign of symptoms', null),
  option('ASDIR', 'As directed', null),
  option('2x/week', 'Twice/Week', null),
  option('1x/week', 'Once a week', null),
  option('1x/6day', 'Once every 6 days', null),
  option('1x/5day', 'Once every five days', null),
  option('1x/year', 'Once every year', null),
  option('5ID', '5 times a day', 5),
  option('Q12W', 'Every 12 weeks', null),
  option('Q2W', 'Every 2 weeks', null),
  option('Q3L', 'Every 3 months', null),
  option('Q3W', 'Every 3 weeks', null),
  option('Q36H', 'Every 36 hours', null),
  option('Q4W', 'Every 4 weeks', null),
  option('Q5M', 'Every 5 minutes', null),
  option('Q5W', 'Every 5 weeks', null),
  option('Q6W', 'Every 6 weeks', null),
  option('Q7W', 'Every 7 weeks', null),
  option('Q8W', 'Every 8 weeks', null),
  option('MWF', 'Mon,Wed,Fri', null),
  option('TTSS', 'Tue,Thur,Sat,Sun', null),
  option('OTH', 'Other', null, { custom: true }),
] as const;

export const FREQUENCY_OPTIONS = FREQUENCY_CATALOG.map((item) => item.value);

export const FREQUENCY_SELECT_OPTIONS = FREQUENCY_CATALOG.map((item) => ({
  value: item.value,
  label: item.value,
  code: item.code,
  description: item.description,
}));

const OTHER_OPTION = FREQUENCY_CATALOG.find((item) => item.custom) ?? option('OTH', 'Other', null, { custom: true });
export const OTHER_FREQUENCY_VALUE = OTHER_OPTION.value;

function normalizeFrequencyKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

const FREQUENCY_INDEX: Map<string, FrequencyOption> = (() => {
  const index = new Map<string, FrequencyOption>();
  const set = (key: string, item: FrequencyOption) => {
    const normalized = normalizeFrequencyKey(key);
    if (normalized && !index.has(normalized)) index.set(normalized, item);
  };

  for (const item of FREQUENCY_CATALOG) {
    set(item.value, item);
    set(item.code, item);
    set(item.description, item);
  }

  const aliases: Array<[string, string]> = [
    ['once daily', 'QD'],
    ['daily', 'QD'],
    ['twice daily', 'BID'],
    ['twice daily (bid)', 'BID'],
    ['single dose', 'ONCE'],
    ['one time only', 'ONCE'],
    ['every 4 hours', 'Q4H'],
    ['every 6 hours', 'Q6H'],
    ['every 8 hours', 'Q8H'],
    ['every 12 hours', 'Q12H'],
    ['five times daily', '5ID'],
    ['5 times a day', '5ID'],
    ['two times daily', 'BID'],
    ['three times daily', 'TID'],
    ['four times daily', 'QID'],
    ['at bedtime', 'QHS'],
    ['bedtime', 'QHS'],
    ['every 6-8 hours', 'Q6-8H'],
    ['every 6 – 8 hours', 'Q6-8H'],
    ['as directed', 'ASDIR'],
    ['other', 'OTH'],
    ['at symptom onset', 'AT_ONSET'],
    ['at migraine onset', 'AT_ONSET'],
    ['at onset', 'AT_ONSET'],
    ['at the first sign of symptoms', 'FIRST_SIGN'],
    ['q6h', 'Q6H'],
    ['q8h', 'Q8H'],
    ['q12h', 'Q12H'],
    ['qhs', 'QHS'],
    ['qid', 'QID'],
    ['tid', 'TID'],
    ['bid', 'BID'],
    ['qd', 'QD'],
  ];
  const byCode = new Map(FREQUENCY_CATALOG.map((item) => [item.code.toUpperCase(), item]));
  for (const [alias, code] of aliases) {
    const item = byCode.get(code.toUpperCase());
    if (item) set(alias, item);
  }
  return index;
})();

export function findFrequencyOption(raw?: string | null): FrequencyOption | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  return FREQUENCY_INDEX.get(normalizeFrequencyKey(value));
}

/** Canonical combobox value, keeping unknown custom SIG text intact. */
export function resolveFrequencyValue(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return findFrequencyOption(value)?.value ?? value;
}

export function isCustomFrequency(raw?: string | null): boolean {
  const value = (raw ?? '').trim();
  if (!value) return false;
  const match = findFrequencyOption(value);
  if (!match) return true;
  return Boolean(match.custom);
}

export function isOtherFrequencyPlaceholder(raw?: string | null): boolean {
  const value = (raw ?? '').trim();
  if (!value) return false;
  const match = findFrequencyOption(value);
  return Boolean(match?.custom) && normalizeFrequencyKey(value) === normalizeFrequencyKey(match!.value);
}

/** Whole-hour interval from QnH / “Every N hours”. Null when the value is not a fixed hourly schedule. */
export function parseHourlyInterval(raw?: string | null): number | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const match =
    value.match(/^Q(\d+)H(?:\s*-\s*Every\s+\d+\s+hours?)?$/i) ??
    value.match(/^every\s+(\d+)\s+hours?$/i);
  if (!match) return null;
  const hours = Number(match[1]);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) return null;
  return hours;
}

export function frequencyComboboxValue(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const match = findFrequencyOption(value);
  if (!match) return OTHER_OPTION.value;
  if (match.custom && normalizeFrequencyKey(value) !== normalizeFrequencyKey(match.value)) {
    return OTHER_OPTION.value;
  }
  return match.value;
}

export function frequencyDirectionPhrase(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const match = findFrequencyOption(value);
  if (match) {
    if (match.custom && normalizeFrequencyKey(value) !== normalizeFrequencyKey(match.value)) {
      return value;
    }
    return match.description;
  }
  const hours = parseHourlyInterval(value);
  if (hours != null) return hours === 1 ? 'every hour' : `every ${hours} hours`;
  return value;
}
