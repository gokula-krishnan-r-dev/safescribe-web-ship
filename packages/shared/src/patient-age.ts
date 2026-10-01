/** Date of birth stored on consultation demographics JSON (ISO YYYY-MM-DD). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AGE_YEARS = 120;
const PEDIATRIC_MONTHS_THRESHOLD = 24;

export type AgeUnit = 'years' | 'months' | 'weeks' | 'days';

export function isoDateLocal(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDateLocal(iso: string | null | undefined): Date | null {
  const raw = String(iso ?? '').trim();
  if (!ISO_DATE.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

const MONTH_TOKEN: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** Calendar date in yyyy-mm-dd. Accepts ISO dates and Kroll-style dd-MMM-yyyy. */
export function toIsoCalendarDate(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return parseIsoDateLocal(isoPrefix[1]) ? isoPrefix[1] : null;
  const kroll = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (kroll) {
    const month = MONTH_TOKEN[kroll[2].toLowerCase()];
    if (!month) return null;
    return toIsoCalendarDate(`${kroll[3]}-${month}-${kroll[1].padStart(2, '0')}`);
  }
  return null;
}

export function isoCalendarDateError(
  value: string | null | undefined,
  opts?: { required?: boolean; max?: string; min?: string },
): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return opts?.required ? 'Required' : null;
  if (!ISO_DATE.test(raw)) {
    return raw.length >= 10
      ? 'Enter a valid date (yyyy-mm-dd).'
      : 'Enter a complete date (yyyy-mm-dd).';
  }
  if (!parseIsoDateLocal(raw)) return 'Enter a valid date (yyyy-mm-dd).';
  if (opts?.max && raw > opts.max) return 'Date cannot be in the future.';
  if (opts?.min && raw < opts.min) return 'Enter a realistic date.';
  return null;
}

/** Keep yyyy-mm-dd while typing digits. */
export function formatIsoDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function isoDateYearsAgo(years: number, asOf = new Date()): string {
  return isoDateLocal(new Date(asOf.getFullYear() - years, asOf.getMonth(), asOf.getDate()));
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateOfBirthError(
  iso: string | null | undefined,
  asOf = new Date(),
): string | null {
  const raw = String(iso ?? '').trim();
  if (!raw) return 'Required';
  const birth = parseIsoDateLocal(raw);
  if (!birth) return 'Enter a valid date.';
  const today = startOfLocalDay(asOf);
  if (birth > today) return 'Date of birth cannot be in the future.';
  if (birth.getFullYear() < 1900) return 'Enter a realistic date of birth.';
  const oldest = new Date(today.getFullYear() - MAX_AGE_YEARS, today.getMonth(), today.getDate());
  if (birth < oldest) return 'Enter a realistic date of birth.';
  return null;
}

export function sanitizeDateOfBirth(
  value: unknown,
  asOf = new Date(),
): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return dateOfBirthError(raw, asOf) ? '' : raw;
}

export function agePartsFromDateOfBirth(
  iso: string,
  asOf = new Date(),
): { years: number; months: number } | null {
  const birth = parseIsoDateLocal(iso);
  if (!birth) return null;
  const today = startOfLocalDay(asOf);
  if (birth > today) return null;

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalMonths = years * 12 + months;
  return { years: Math.max(0, years), months: Math.max(0, totalMonths) };
}

export function demographicsAgeFromDob(
  iso: string,
  asOf = new Date(),
): { age: string; ageUnit: AgeUnit } | null {
  const birth = parseIsoDateLocal(iso);
  if (!birth) return null;
  const today = startOfLocalDay(asOf);
  if (birth > today) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const completedDays = Math.floor((today.getTime() - birth.getTime()) / dayMs);
  if (completedDays < 28) {
    return { age: String(Math.max(0, completedDays)), ageUnit: 'days' };
  }

  const parts = agePartsFromDateOfBirth(iso, asOf);
  if (!parts) return null;
  if (parts.months < PEDIATRIC_MONTHS_THRESHOLD) {
    return { age: String(parts.months), ageUnit: 'months' };
  }
  return { age: String(parts.years), ageUnit: 'years' };
}

/** Decimal years from DOB — preferred for age-gated safety checks. */
export function ageYearsFromDateOfBirth(
  iso: string | null | undefined,
  asOf = new Date(),
): number | null {
  const birth = parseIsoDateLocal(iso);
  if (!birth || dateOfBirthError(iso, asOf)) return null;
  const ms = startOfLocalDay(asOf).getTime() - birth.getTime();
  if (ms < 0) return null;
  return Math.round((ms / (365.25 * 24 * 60 * 60 * 1000)) * 1000) / 1000;
}

export function ageYearsFromDemographics(
  demo: {
    age?: string | number | null;
    ageUnit?: string | null;
    dateOfBirth?: string | null;
    dateOfBirthUnavailable?: boolean | null;
  },
  asOf = new Date(),
): number | null {
  if (!demo.dateOfBirthUnavailable) {
    const fromDob = ageYearsFromDateOfBirth(demo.dateOfBirth, asOf);
    if (fromDob != null) return fromDob;
  }
  if (demo.age == null || demo.age === '') return null;
  const n = typeof demo.age === 'number' ? demo.age : Number(String(demo.age).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = String(demo.ageUnit ?? 'years').toLowerCase();
  if (unit.startsWith('d')) return n / 365.25;
  if (unit.startsWith('w')) return (n * 7) / 365.25;
  if (unit.startsWith('m')) return n / 12;
  return n;
}

export function formatAgeDisplay(age?: string | null, unit?: string | null): string {
  const raw = String(age ?? '').trim();
  if (!raw) return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const u = String(unit ?? 'years').toLowerCase();
  if (u.startsWith('d')) return `${n} ${n === 1 ? 'day' : 'days'}`;
  if (u.startsWith('w')) return `${n} ${n === 1 ? 'week' : 'weeks'}`;
  if (u.startsWith('m')) return `${n} ${n === 1 ? 'month' : 'months'}`;
  return `${n} ${n === 1 ? 'year' : 'years'}`;
}

/**
 * DOB is optional only when the pharmacist marks it unavailable (or legacy
 * records already have age and no date of birth).
 */
export function isDateOfBirthUnavailable(demo: {
  dateOfBirth?: string | null;
  dateOfBirthUnavailable?: boolean | null;
  age?: string | number | null;
}): boolean {
  if (demo.dateOfBirthUnavailable === true) return true;
  if (demo.dateOfBirthUnavailable === false) return false;
  if (String(demo.dateOfBirth ?? '').trim()) return false;
  return demo.age != null && String(demo.age).trim() !== '';
}

export function isDateOfBirthReady(demo: {
  dateOfBirth?: string | null;
  dateOfBirthUnavailable?: boolean | null;
  age?: string | number | null;
}): boolean {
  if (isDateOfBirthUnavailable(demo)) {
    return demo.age != null && String(demo.age).trim() !== '';
  }
  return dateOfBirthError(demo.dateOfBirth) == null;
}
