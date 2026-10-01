import type { DurationUnit, RegimenLineDraft } from './types';
import { findFrequencyOption, parseHourlyInterval } from './frequency-options';

/** Packaged counts where under-dispensing a fraction is unsafe. */
const DISCRETE_UNITS = new Set([
  'tablet',
  'buccal tablet',
  'capsule',
  'patch',
  'suppository',
  'unit',
  'drop',
  'spray',
  'puff',
  'lozenge',
  'wafer',
  'pellet',
  'implant',
  'cartridge',
  'nebule',
  'tampon',
  'ring',
  'stick',
  'strip',
  'pad',
  'packet',
  'package',
  'packag',
  'bag',
  'box',
  'can',
  'bottle',
  'vial',
  'applicator',
  'application',
  'disk',
  'dose',
  'each',
  'insert',
  'pen',
  'inhalation',
  'sniff',
]);

function normalizeUnit(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\(e?s\)/gi, '')
    .replace(/ies$/i, 'y')
    .replace(/s$/i, '');
}

export function isDiscreteQuantityUnit(quantityUnit: string): boolean {
  return DISCRETE_UNITS.has(normalizeUnit(quantityUnit));
}

export function quantityUnitMatchesForm(form: string, quantityUnit: string): boolean {
  const a = normalizeUnit(form);
  const b = normalizeUnit(quantityUnit);
  return Boolean(a && b && a === b);
}

/** Administrations per 24h from the structured frequency list. `null` = unknown. */
export function administrationsPerDay(frequency: string): number | null {
  const catalog = findFrequencyOption(frequency);
  if (catalog) return catalog.perDay;

  const hours = parseHourlyInterval(frequency);
  if (hours != null) {
    const n = 24 / hours;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const f = frequency.trim().toLowerCase().replace(/[–—]/g, '-');
  if (!f) return null;

  const everyHours = f.match(/^every\s+(\d+(?:\.\d+)?)\s*hours?$/);
  if (everyHours) {
    const hours = Number(everyHours[1]);
    if (!Number.isFinite(hours) || hours <= 0) return null;
    const n = 24 / hours;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const everyRange = f.match(
    /^every\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*hours?$/,
  );
  if (everyRange) {
    const hours = Number(everyRange[1]);
    if (!Number.isFinite(hours) || hours <= 0) return null;
    const n = 24 / hours;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const timesDaily = f.match(/^(\d+)\s+times(?: a| daily)?/);
  if (timesDaily) {
    const n = Number(timesDaily[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

export function durationInDays(
  value: string | null,
  unit: DurationUnit | null,
): number | null {
  const raw = value?.trim();
  if (!raw || !unit) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'DAY') return n;
  if (unit === 'WEEK') return n * 7;
  if (unit === 'MONTH') return n * 30;
  return null;
}

function hasDoseRange(line: RegimenLineDraft): boolean {
  return line.doseTo != null && (line.doseTo ?? '').trim() !== '';
}

function lineDose(line: RegimenLineDraft): number | null {
  if (hasDoseRange(line)) return null;
  const from = Number((line.doseFrom ?? '').trim());
  if (!Number.isFinite(from) || from <= 0) return null;
  return from;
}

function lineQuantity(
  line: RegimenLineDraft,
  quantityUnit: string,
): number | null {
  if (line.prn) return null;
  if (!quantityUnitMatchesForm(line.form, quantityUnit)) return null;
  const dose = lineDose(line);
  const perDay = administrationsPerDay(line.frequency);
  const days = durationInDays(line.durationValue, line.durationUnit);
  if (dose == null || perDay == null || days == null) return null;
  const total = dose * perDay * days;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function formatDurationNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) return '';
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export interface CourseDuration {
  value: string;
  unit: DurationUnit;
}

export function formatDurationDisplay(
  value: string | null | undefined,
  unit: DurationUnit | null | undefined,
): string | undefined {
  if (!value?.trim() || !unit) return undefined;
  const word = unit === 'WEEK' ? 'weeks' : unit === 'MONTH' ? 'months' : 'days';
  return `${value.trim()} ${word}`;
}

/** Total course length from sequential schedule durations. */
export function suggestedCourseDuration(lines: RegimenLineDraft[]): CourseDuration | null {
  if (!lines.length) return null;
  const days: number[] = [];
  for (const line of lines) {
    const value = durationInDays(line.durationValue, line.durationUnit);
    if (value == null) return null;
    days.push(value);
  }
  const totalDays = days.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalDays) || totalDays <= 0) return null;
  const units = new Set(lines.map((line) => line.durationUnit));
  if (units.size === 1) {
    const unit = lines[0]?.durationUnit ?? 'DAY';
    const raw = lines.reduce((sum, line) => sum + Number(line.durationValue), 0);
    const value = formatDurationNumber(raw);
    return value ? { value, unit } : null;
  }
  const value = formatDurationNumber(totalDays);
  return value ? { value, unit: 'DAY' } : null;
}

/** Persistable days-supply string: summed sequential duration, else the first line. */
export function formatCourseDurationDisplay(lines: RegimenLineDraft[]): string | undefined {
  const course = suggestedCourseDuration(lines);
  if (course) return formatDurationDisplay(course.value, course.unit);
  return formatDurationDisplay(lines[0]?.durationValue, lines[0]?.durationUnit);
}

/**
 * Suggested dispense amount from the SIG.
 * Sequential schedules are summed. Dose ranges and PRN lines are not guessed.
 * Returns null unless every line can be quantified.
 */
export function suggestedDispenseQuantity(
  lines: RegimenLineDraft[],
  quantityUnit: string,
): number | null {
  if (!(quantityUnit ?? '').trim() || !lines.length) return null;
  let sum = 0;
  for (const line of lines) {
    const qty = lineQuantity(line, quantityUnit);
    if (qty == null) return null;
    sum += qty;
  }
  if (!Number.isFinite(sum) || sum <= 0) return null;
  return sum;
}

export function formatDispenseQuantity(value: number, discrete: boolean): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (discrete) {
    const rounded = Math.ceil(value - 1e-9);
    return String(rounded);
  }
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) return '';
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatSuggestedDispenseQuantity(
  lines: RegimenLineDraft[],
  quantityUnit: string,
): string | null {
  const suggested = suggestedDispenseQuantity(lines, quantityUnit);
  if (suggested == null) return null;
  const formatted = formatDispenseQuantity(
    suggested,
    isDiscreteQuantityUnit(quantityUnit),
  );
  return formatted || null;
}

type QuantityAutoDraft = {
  quantityValue: string;
  quantityUnit: string;
  regimenLines?: RegimenLineDraft[];
  lines?: RegimenLineDraft[];
};

function regimenLinesFromDraft(draft: QuantityAutoDraft): RegimenLineDraft[] {
  return draft.regimenLines ?? draft.lines ?? [];
}

/**
 * Keep quantity in sync with the SIG until the pharmacist types a different value.
 * `lastAutoQty.current` is the last value we wrote (or the matching default).
 * Supports Add Treatment (`regimenLines`) and inline editor (`lines`).
 */
export function withAutoDispenseQuantity<T extends QuantityAutoDraft>(
  draft: T,
  lastAutoQty: { current: string | null },
): T {
  const formatted = formatSuggestedDispenseQuantity(
    regimenLinesFromDraft(draft),
    draft.quantityUnit,
  );
  if (!formatted) return draft;
  const current = (draft.quantityValue ?? '').trim();
  const last = lastAutoQty.current;
  const pharmacistOverride = current !== '' && last != null && current !== last;
  // Preserve override: do not retarget `last` to the new suggestion.
  if (pharmacistOverride) return draft;
  lastAutoQty.current = formatted;
  if (current === formatted) return draft;
  return { ...draft, quantityValue: formatted };
}

/** SIG administration units that must not be copied into the dispense quantity. */
const SIG_ONLY_UNITS = new Set(['application', 'inhalation', 'sniff']);

/**
 * When the dose form is a countable package unit, keep quantity unit aligned
 * until the pharmacist picks a different dispense unit.
 * Application(s) / inhalations stay on the SIG and are never auto-copied to
 * grams, tubes, inhalers, or other package units.
 */
export function withAutoQuantityUnitFromDoseForm<T extends QuantityAutoDraft>(
  draft: T,
  lastAutoUnit: { current: string | null },
): T {
  const form = regimenLinesFromDraft(draft)[0]?.form?.trim() ?? '';
  if (!form || !isDiscreteQuantityUnit(form)) return draft;
  if (SIG_ONLY_UNITS.has(normalizeUnit(form))) return draft;
  const current = (draft.quantityUnit ?? '').trim();
  const last = lastAutoUnit.current;
  const pharmacistOverride = current !== '' && last != null && current !== last;
  if (pharmacistOverride) return draft;
  lastAutoUnit.current = form;
  if (current === form) return draft;
  return { ...draft, quantityUnit: form };
}

/** Apply unit + quantity auto-sync in one pass (production prescription editors). */
export function withAutoPrescriptionSupply<T extends QuantityAutoDraft>(
  draft: T,
  refs: {
    lastAutoQty: { current: string | null };
    lastAutoUnit?: { current: string | null };
  },
): T {
  const withUnit = refs.lastAutoUnit
    ? withAutoQuantityUnitFromDoseForm(draft, refs.lastAutoUnit)
    : draft;
  return withAutoDispenseQuantity(withUnit, refs.lastAutoQty);
}
