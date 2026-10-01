import { demographicsAgeFromDob, sanitizeDateOfBirth } from './patient-age';

/** Optional patient vitals stored on consultation demographics JSON */

export interface PatientVitalsFields {
  height?: string;
  weight?: string;
  bmi?: string;
  pulse?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
}

export function parseNumericInput(value: string | undefined | null): number | null {
  if (value == null || !String(value).trim()) return null;
  const n = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** BMI from weight (kg) and height (cm). Returns null when inputs are missing or invalid. */
export function computeBmiKgCm(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (weightKg == null || heightCm == null || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (!Number.isFinite(bmi) || bmi <= 0 || bmi > 200) return null;
  return Math.round(bmi * 10) / 10;
}

export function formatBmi(bmi: number | null | undefined): string {
  if (bmi == null) return '';
  return bmi.toFixed(1);
}

function sanitizeOptionalPositiveNumber(value: unknown): string {
  if (value == null) return '';
  const str = String(value).trim();
  if (!str) return '';
  const n = parseNumericInput(str);
  if (n == null || n <= 0) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function sanitizeOptionalInteger(value: unknown, min: number, max: number): string {
  if (value == null) return '';
  const str = String(value).trim();
  if (!str) return '';
  const n = parseInt(str.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n < min || n > max) return '';
  return String(n);
}

function setOrDelete(
  target: Record<string, unknown>,
  key: string,
  value: string,
): void {
  if (value) target[key] = value;
  else delete target[key];
}

/** Normalize optional vitals on demographics payload; recomputes BMI server-side. */
export function normalizePatientDemographics(
  data: Record<string, unknown> | null | undefined,
  asOf = new Date(),
): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};

  const result: Record<string, unknown> = { ...data };

  const weight = sanitizeOptionalPositiveNumber(data.weight);
  const height = sanitizeOptionalPositiveNumber(data.height);
  const pulse = sanitizeOptionalInteger(data.pulse, 30, 250);
  const systolic = sanitizeOptionalInteger(data.bloodPressureSystolic, 50, 300);
  const diastolic = sanitizeOptionalInteger(data.bloodPressureDiastolic, 30, 200);

  const bmi = formatBmi(
    computeBmiKgCm(parseNumericInput(weight), parseNumericInput(height)),
  );

  setOrDelete(result, 'weight', weight);
  setOrDelete(result, 'height', height);
  setOrDelete(result, 'bmi', bmi);
  setOrDelete(result, 'pulse', pulse);
  setOrDelete(result, 'bloodPressureSystolic', systolic);
  setOrDelete(result, 'bloodPressureDiastolic', diastolic);

  const dobUnavailable =
    data.dateOfBirthUnavailable === true || data.dateOfBirthUnavailable === 'true';
  if (dobUnavailable) {
    result.dateOfBirthUnavailable = true;
    delete result.dateOfBirth;
  } else {
    const dob = sanitizeDateOfBirth(data.dateOfBirth, asOf);
    setOrDelete(result, 'dateOfBirth', dob);
    if (dob) {
      const derived = demographicsAgeFromDob(dob, asOf);
      if (derived) {
        result.age = derived.age;
        result.ageUnit = derived.ageUnit;
      }
      result.dateOfBirthUnavailable = false;
    } else if (data.dateOfBirthUnavailable === false || data.dateOfBirthUnavailable === 'false') {
      result.dateOfBirthUnavailable = false;
    } else {
      delete result.dateOfBirthUnavailable;
    }
  }

  return result;
}

/** Rule-based vitals extraction from free-text transcript. */
export function extractVitalsFromTranscript(transcript: string): Partial<PatientVitalsFields> {
  const text = transcript.trim();
  if (!text) return {};

  const result: Partial<PatientVitalsFields> = {};

  const weightMatch =
    text.match(/\b(?:weight|wt\.?|weighs?)\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)\s*kg\b/i) ??
    text.match(/\b(\d+(?:\.\d+)?)\s*kg\b/i);
  if (weightMatch?.[1]) result.weight = weightMatch[1];

  const heightMatch =
    text.match(/\b(?:height|ht\.?|tall)\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?)\s*cm\b/i) ??
    text.match(/\b(\d{2,3})\s*cm\b/i);
  if (heightMatch?.[1]) result.height = heightMatch[1];

  const bpMatch =
    text.match(
      /\b(?:bp|blood\s*pressure)\s*(?:is|of|:)?\s*(\d{2,3})\s*[/\\]\s*(\d{2,3})\b/i,
    ) ?? text.match(/\b(\d{2,3})\s*[/\\]\s*(\d{2,3})\s*(?:mm\s*hg|mmhg)?\b/i);
  if (bpMatch?.[1] && bpMatch[2]) {
    result.bloodPressureSystolic = bpMatch[1];
    result.bloodPressureDiastolic = bpMatch[2];
  }

  const pulseMatch = text.match(
    /\b(?:pulse|heart\s*rate|hr)\s*(?:is|of|:)?\s*(\d{2,3})\s*(?:bpm)?\b/i,
  );
  if (pulseMatch?.[1]) result.pulse = pulseMatch[1];

  const bmi = computeBmiKgCm(
    parseNumericInput(result.weight),
    parseNumericInput(result.height),
  );
  if (bmi != null) result.bmi = formatBmi(bmi);

  return result;
}
