/**
 * Optional Documentation-stage DOB versus confirmed intake age.
 * Date-only (YYYY-MM-DD). Never use timezone-shifted Date parsing for DOB.
 */

import {
  dateOfBirthError,
  formatAgeDisplay,
  isDateOfBirthUnavailable,
  parseIsoDateLocal,
  sanitizeDateOfBirth,
  type AgeUnit,
} from './patient-age';

export const CONFIRMED_AGE_UNITS = ['YEAR', 'MONTH', 'WEEK', 'DAY'] as const;
export type ConfirmedAgeUnit = (typeof CONFIRMED_AGE_UNITS)[number];

export type OptionalDobStatus =
  | 'NOT_ENTERED'
  | 'EDITING'
  | 'INVALID'
  | 'MATCH'
  | 'MISMATCH';

export type AgeCaptureMode = 'DOB' | 'MANUAL_AGE';

export interface ConfirmedAge {
  value: number;
  unit: ConfirmedAgeUnit;
  source?: 'DOB' | 'MANUAL';
  asOfDate: string;
}

export interface OptionalDobValidationResult {
  status: OptionalDobStatus;
  dob?: string;
  message?: string;
  errorCode?: string;
  derivedAge?: ConfirmedAge;
  recordedAge?: ConfirmedAge;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toConfirmedAgeUnit(unit: string | null | undefined): ConfirmedAgeUnit {
  const raw = String(unit ?? 'years').trim().toLowerCase();
  if (raw.startsWith('d')) return 'DAY';
  if (raw.startsWith('w')) return 'WEEK';
  if (raw.startsWith('m')) return 'MONTH';
  return 'YEAR';
}

export function confirmedAgeUnitToLegacy(unit: ConfirmedAgeUnit): AgeUnit {
  if (unit === 'DAY') return 'days';
  if (unit === 'WEEK') return 'weeks';
  if (unit === 'MONTH') return 'months';
  return 'years';
}

export function parseConfirmedAgeValue(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function formatConfirmedAge(age: Pick<ConfirmedAge, 'value' | 'unit'>): string {
  return formatAgeDisplay(String(age.value), confirmedAgeUnitToLegacy(age.unit));
}

/** Calendar date (YYYY-MM-DD) for an instant in a pharmacy timezone. */
export function calendarDateInTimeZone(
  instant: Date | string,
  timeZone?: string | null,
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const tz = String(timeZone ?? '').trim() || undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    /* unknown IANA zone — fall through */
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function partsFromIso(iso: string): { year: number; month: number; day: number } | null {
  if (!ISO_DATE.test(iso)) return null;
  const birth = parseIsoDateLocal(iso);
  if (!birth) return null;
  return {
    year: birth.getFullYear(),
    month: birth.getMonth() + 1,
    day: birth.getDate(),
  };
}

export function completedYears(dobIso: string, asOfIso: string): number | null {
  const dob = partsFromIso(dobIso);
  const asOf = partsFromIso(asOfIso);
  if (!dob || !asOf) return null;
  let years = asOf.year - dob.year;
  const birthdayOccurred =
    asOf.month > dob.month || (asOf.month === dob.month && asOf.day >= dob.day);
  if (!birthdayOccurred) years -= 1;
  return Math.max(0, years);
}

export function completedMonths(dobIso: string, asOfIso: string): number | null {
  const dob = partsFromIso(dobIso);
  const asOf = partsFromIso(asOfIso);
  if (!dob || !asOf) return null;
  let months = (asOf.year - dob.year) * 12 + (asOf.month - dob.month);
  if (asOf.day < dob.day) months -= 1;
  return Math.max(0, months);
}

export function completedDays(dobIso: string, asOfIso: string): number | null {
  const dob = partsFromIso(dobIso);
  const asOf = partsFromIso(asOfIso);
  if (!dob || !asOf) return null;
  const start = Date.UTC(dob.year, dob.month - 1, dob.day);
  const end = Date.UTC(asOf.year, asOf.month - 1, asOf.day);
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function completedAgeInUnit(
  dobIso: string,
  asOfIso: string,
  unit: ConfirmedAgeUnit,
): number | null {
  if (unit === 'YEAR') return completedYears(dobIso, asOfIso);
  if (unit === 'MONTH') return completedMonths(dobIso, asOfIso);
  if (unit === 'WEEK') {
    const days = completedDays(dobIso, asOfIso);
    return days == null ? null : Math.floor(days / 7);
  }
  return completedDays(dobIso, asOfIso);
}

export function ageCaptureModeFromDemographics(demo: {
  dateOfBirth?: string | null;
  dateOfBirthUnavailable?: boolean | null;
  age?: string | number | null;
}): AgeCaptureMode {
  return isDateOfBirthUnavailable(demo) ? 'MANUAL_AGE' : 'DOB';
}

export function recordedAgeFromDemographics(
  demo: {
    age?: string | number | null;
    ageUnit?: string | null;
    dateOfBirth?: string | null;
    dateOfBirthUnavailable?: boolean | null;
  },
  asOfDate: string,
): ConfirmedAge | null {
  const value = parseConfirmedAgeValue(demo.age);
  if (value == null) return null;
  const unit = toConfirmedAgeUnit(demo.ageUnit);
  return {
    value,
    unit,
    source: ageCaptureModeFromDemographics(demo) === 'DOB' ? 'DOB' : 'MANUAL',
    asOfDate,
  };
}

export type RecordedAgeOrigin = 'intake' | 'conversation';

const NARRATIVE_AGE_PATTERNS: RegExp[] = [
  /\bage\s*(?:of|:)?\s*(\d{1,3})\b/i,
  /\b(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|y\/o|yo)\b/i,
  /\baged\s+(\d{1,3})\b/i,
];

/** Conservative age from conversation / presenting-concern text. Ignores doses and durations. */
export function statedAgeFromNarrative(
  text: string | null | undefined,
  asOfDate: string,
): ConfirmedAge | null {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  for (const pattern of NARRATIVE_AGE_PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;
    const value = parseConfirmedAgeValue(match[1]);
    if (value == null || value > 120) continue;
    return { value, unit: 'YEAR', source: 'MANUAL', asOfDate };
  }
  return null;
}

export function recordedAgeForDocumentation(input: {
  demographics: DemographicsAgeFields;
  consultationDate: string;
  narrative?: string | null;
}): { age: ConfirmedAge; origin: RecordedAgeOrigin } | null {
  const fromDemo = recordedAgeFromDemographics(input.demographics, input.consultationDate);
  if (fromDemo) return { age: fromDemo, origin: 'intake' };
  const fromText = statedAgeFromNarrative(input.narrative, input.consultationDate);
  if (fromText) return { age: fromText, origin: 'conversation' };
  return null;
}

export function documentationDobFieldError(
  result: OptionalDobValidationResult,
  origin: RecordedAgeOrigin = 'intake',
): string | null {
  if (result.status === 'INVALID') {
    return result.message ?? 'Enter a valid date of birth.';
  }
  if (result.status !== 'MISMATCH' || !result.derivedAge || !result.recordedAge) {
    return null;
  }
  const derived = formatConfirmedAge(result.derivedAge);
  const recorded = formatConfirmedAge(result.recordedAge);
  if (origin === 'conversation') {
    return `This date of birth is ${derived} as of this consultation, which does not match the age of ${recorded} mentioned in the conversation summary.`;
  }
  return `This date of birth is ${derived} as of this consultation, but ${recorded} was recorded at intake.`;
}

/**
 * Client/server shared validator. Empty is valid.
 * Incomplete dates stay `EDITING` while typing; call `settleOptionalDobResult`
 * after blur or pause to surface a format error.
 * Authoritative commit still requires the backend.
 */
export function validateOptionalDob(input: {
  dob: string | null | undefined;
  recordedAge: ConfirmedAge;
  consultationDate: string;
}): OptionalDobValidationResult {
  const raw = String(input.dob ?? '').trim();
  if (!raw) return { status: 'NOT_ENTERED' };
  if (!ISO_DATE.test(raw)) {
    if (raw.length < 10) return { status: 'EDITING', dob: raw };
    return {
      status: 'INVALID',
      dob: raw,
      errorCode: 'INVALID_FORMAT',
      message: 'Enter a valid date of birth in YYYY-MM-DD format.',
    };
  }

  const asOf = parseIsoDateLocal(input.consultationDate);
  const dobErr = dateOfBirthError(raw, asOf ?? undefined);
  if (dobErr === 'Enter a valid date.') {
    return {
      status: 'INVALID',
      dob: raw,
      errorCode: 'INVALID_CALENDAR_DATE',
      message: 'Enter a valid date of birth in YYYY-MM-DD format.',
    };
  }
  if (dobErr === 'Date of birth cannot be in the future.') {
    return {
      status: 'INVALID',
      dob: raw,
      errorCode: 'DOB_AFTER_CONSULTATION',
      message: 'Date of birth cannot be after the consultation date.',
    };
  }
  if (dobErr) {
    return {
      status: 'INVALID',
      dob: raw,
      errorCode: 'IMPLAUSIBLE_DOB',
      message: dobErr,
    };
  }

  const derivedValue = completedAgeInUnit(raw, input.consultationDate, input.recordedAge.unit);
  if (derivedValue == null) {
    return {
      status: 'INVALID',
      dob: raw,
      errorCode: 'INVALID_CALENDAR_DATE',
      message: 'Enter a valid date of birth in YYYY-MM-DD format.',
    };
  }

  const derivedAge: ConfirmedAge = {
    value: derivedValue,
    unit: input.recordedAge.unit,
    source: 'DOB',
    asOfDate: input.consultationDate,
  };

  if (derivedValue !== input.recordedAge.value) {
    return {
      status: 'MISMATCH',
      dob: raw,
      derivedAge,
      recordedAge: input.recordedAge,
    };
  }

  return {
    status: 'MATCH',
    dob: raw,
    derivedAge,
    recordedAge: input.recordedAge,
  };
}

export const INCOMPLETE_DOB_MESSAGE =
  'Enter a valid date of birth in YYYY-MM-DD format.';

/**
 * After the pharmacist pauses or leaves the field, a partial date is an error.
 * While they are still typing, `validateOptionalDob` stays on EDITING.
 */
export function settleOptionalDobResult(
  result: OptionalDobValidationResult,
  opts?: { settled?: boolean },
): OptionalDobValidationResult {
  if (result.status !== 'EDITING' || !opts?.settled) return result;
  const raw = String(result.dob ?? '').trim();
  if (!raw) return { status: 'NOT_ENTERED' };
  return {
    status: 'INVALID',
    dob: raw,
    errorCode: 'INCOMPLETE_DOB',
    message: INCOMPLETE_DOB_MESSAGE,
  };
}

export function optionalDobBlocksDocumentActions(
  status: OptionalDobStatus,
): boolean {
  return status === 'MISMATCH' || status === 'INVALID' || status === 'EDITING';
}

export function mismatchAlertCopy(result: OptionalDobValidationResult): {
  heading: string;
  message: string;
  support: string;
} | null {
  if (result.status !== 'MISMATCH' || !result.derivedAge || !result.recordedAge) {
    return null;
  }
  return {
    heading: 'DOB doesn’t match the recorded age',
    message: `This DOB indicates an age of ${formatConfirmedAge(result.derivedAge)}, but ${formatConfirmedAge(result.recordedAge)} was recorded at intake.`,
    support: 'Correct the date or remove it before creating documents.',
  };
}

export function patientSnapshotVersion(
  updatedAt: Date | string | null | undefined,
): number {
  if (!updatedAt) return 0;
  const t =
    updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt));
  return Number.isFinite(t) ? t : 0;
}

export type DemographicsAgeFields = {
  age?: string | number | null;
  ageUnit?: string | null;
  dateOfBirth?: string | null;
  dateOfBirthUnavailable?: boolean | null;
  originalManualAge?: { value?: number; unit?: string } | null;
};

/** DOB that is safe to persist on documents / the patient snapshot. */
export function committedOptionalDob(input: {
  draftDob?: string | null;
  demographics: DemographicsAgeFields;
  consultationDate: string;
}): string {
  const mode = ageCaptureModeFromDemographics(input.demographics);
  const confirmed = String(input.demographics.dateOfBirth ?? '').trim();
  if (mode === 'DOB') return confirmed;
  const recorded = recordedAgeFromDemographics(input.demographics, input.consultationDate);
  if (!recorded) return '';
  const result = validateOptionalDob({
    dob: input.draftDob,
    recordedAge: recorded,
    consultationDate: input.consultationDate,
  });
  return result.status === 'MATCH' ? String(result.dob ?? '').trim() : '';
}

/** Document-header DOB: keep a valid pharmacist-entered date, else intake DOB. */
export function seedDocumentationDateOfBirth(input: {
  storedDob?: string | null;
  demographics: DemographicsAgeFields;
  consultationDate: string;
}): string {
  const asOf = parseIsoDateLocal(input.consultationDate) ?? undefined;
  const stored = sanitizeDateOfBirth(input.storedDob, asOf);
  if (stored) return stored;
  return sanitizeDateOfBirth(input.demographics.dateOfBirth, asOf);
}

export function stripUncommittedPatientDob<T extends Record<string, unknown>>(
  documentation: T,
  demographics: DemographicsAgeFields,
  consultationDate: string,
): T {
  const patientInfoRaw = documentation.patientInfo ?? documentation.patient;
  if (!patientInfoRaw || typeof patientInfoRaw !== 'object' || Array.isArray(patientInfoRaw)) {
    return documentation;
  }
  const patientInfo = patientInfoRaw as Record<string, unknown>;
  const draft =
    typeof patientInfo.dateOfBirth === 'string' ? patientInfo.dateOfBirth : '';
  const committed = seedDocumentationDateOfBirth({
    storedDob: draft,
    demographics,
    consultationDate,
  });
  if (String(draft).trim() === committed) return documentation;
  const nextInfo = { ...patientInfo };
  if (committed) nextInfo.dateOfBirth = committed;
  else delete nextInfo.dateOfBirth;
  return { ...documentation, patientInfo: nextInfo };
}

export function unresolvedOptionalDobMessage(
  documentation: Record<string, unknown> | null | undefined,
  demographics: DemographicsAgeFields,
  consultationDate: string,
): string | null {
  const patientInfoRaw = documentation?.patientInfo ?? documentation?.patient;
  if (!patientInfoRaw || typeof patientInfoRaw !== 'object' || Array.isArray(patientInfoRaw)) {
    return null;
  }
  const draft = String(
    (patientInfoRaw as { dateOfBirth?: unknown }).dateOfBirth ?? '',
  ).trim();
  if (!draft) return null;
  if (ageCaptureModeFromDemographics(demographics) !== 'MANUAL_AGE') return null;
  const recorded = recordedAgeFromDemographics(demographics, consultationDate);
  if (!recorded) return null;
  const result = validateOptionalDob({
    dob: draft,
    recordedAge: recorded,
    consultationDate,
  });
  if (result.status === 'MATCH' || result.status === 'NOT_ENTERED') return null;
  return 'Resolve the date of birth and recorded age before creating documents.';
}
