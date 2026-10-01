import {
  contextChoiceFromAnswer,
  isContextTriggered,
  isYesNoContextQuestion,
  type RenewPatientContextAnswer,
  type RenewPatientContextRequirement,
} from './renew-monitoring';

export const PATIENT_INFO_RESPONSE_TYPES = [
  'YES_NO',
  'NUMBER',
  'NUMBER_WITH_UNIT',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'DATE',
  'TEXT',
  'DERIVED',
  'READ_ONLY',
] as const;
export type PatientInfoResponseType = (typeof PATIENT_INFO_RESPONSE_TYPES)[number];

export type PatientInfoItemStatus =
  | 'UNANSWERED'
  | 'ANSWERED'
  | 'REVIEWED'
  | 'EXCEPTION_REVIEWED'
  | 'UNABLE_TO_ASSESS'
  | 'REMOVED_NOT_RELEVANT';

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 0.3937007874;

export const PATIENT_INFO_UNIT_OPTIONS: Record<string, { canonical: string; options: string[] }> = {
  WEIGHT: { canonical: 'kg', options: ['kg', 'lb'] },
  HEIGHT: { canonical: 'cm', options: ['cm'] },
  GESTATIONAL_AGE: { canonical: 'weeks', options: ['weeks'] },
  INFANT_AGE_DAYS: { canonical: 'days', options: ['days'] },
  AGE: { canonical: 'years', options: ['years'] },
  BMI: { canonical: 'kg/m²', options: ['kg/m²'] },
};

export const PATIENT_INFO_PURPOSE: Record<string, string> = {
  WEIGHT: 'Used for appropriate dosing and assess treatment response.',
  HEIGHT: 'Used with weight to calculate BMI when required.',
  GESTATIONAL_AGE: 'Used for pregnancy-related medication safety.',
  BMI: 'Calculated from weight and height.',
};

const NUMERIC_BOUNDS: Record<string, { min: number; max: number; integer?: boolean }> = {
  WEIGHT: { min: 0.1, max: 700 },
  HEIGHT: { min: 20, max: 280 },
  GESTATIONAL_AGE: { min: 1, max: 45, integer: true },
  INFANT_AGE_DAYS: { min: 0, max: 1100, integer: true },
  AGE: { min: 0, max: 130, integer: true },
};

const STRUCTURED_INPUT_RENDERERS: Record<string, PatientInfoResponseType> = {
  WEIGHT: 'NUMBER_WITH_UNIT',
  HEIGHT: 'NUMBER_WITH_UNIT',
  GESTATIONAL_AGE: 'NUMBER_WITH_UNIT',
  INFANT_AGE_DAYS: 'NUMBER_WITH_UNIT',
  BMI: 'DERIVED',
};

export function resolvePatientInfoRenderer(
  row: Pick<RenewPatientContextRequirement, 'inputCode' | 'valueShape' | 'unit' | 'uiComponent' | 'enumOptions'>,
): PatientInfoResponseType {
  const code = row.inputCode.trim().toUpperCase();
  const ui = (row.uiComponent ?? '').trim().toUpperCase();
  if (code === 'BMI' || ui === 'DERIVED') return 'DERIVED';
  if (code === 'AGE' && ui === 'READ_ONLY') return 'READ_ONLY';
  if (code === 'AGE') return 'NUMBER';
  const structured = STRUCTURED_INPUT_RENDERERS[code];
  if (structured) return structured;
  if (ui === 'NUMBER_WITH_UNIT' || ui === 'NUMBER_INPUT') {
    return row.unit?.trim() || PATIENT_INFO_UNIT_OPTIONS[code] ? 'NUMBER_WITH_UNIT' : 'NUMBER';
  }
  if (isYesNoContextQuestion(row) || ui === 'YES_NO' || row.valueShape === 'YES_NO') return 'YES_NO';
  const enumOptions = (row.enumOptions ?? []).filter((opt) => opt.trim());
  if (ui === 'SINGLE_SELECT' || (enumOptions.length > 0 && row.valueShape === 'TEXT')) return 'SINGLE_SELECT';
  const unitCatalog = PATIENT_INFO_UNIT_OPTIONS[code];
  const hasUnit = Boolean(row.unit?.trim() || unitCatalog);
  if (
    ui === 'NUMBER_WITH_UNIT' ||
    ((row.valueShape === 'NUMERIC' || row.valueShape === 'NUMBER') && hasUnit)
  ) {
    return 'NUMBER_WITH_UNIT';
  }
  if (row.valueShape === 'NUMERIC' || row.valueShape === 'NUMBER' || ui === 'NUMBER') return 'NUMBER';
  if (enumOptions.length > 0) return 'SINGLE_SELECT';
  return 'TEXT';
}

export function patientInfoDisplayUnits(row: Pick<RenewPatientContextRequirement, 'inputCode' | 'unit'>): string[] {
  const catalog = PATIENT_INFO_UNIT_OPTIONS[row.inputCode.trim().toUpperCase()];
  if (catalog) return catalog.options;
  const unit = row.unit?.trim();
  return unit ? [unit] : [];
}

export function patientInfoCanonicalUnit(row: Pick<RenewPatientContextRequirement, 'inputCode' | 'unit'>): string | null {
  const catalog = PATIENT_INFO_UNIT_OPTIONS[row.inputCode.trim().toUpperCase()];
  return catalog?.canonical ?? row.unit?.trim() ?? null;
}

export function convertPatientInfoValue(
  inputCode: string,
  value: number,
  fromUnit: string,
  toUnit: string,
): number {
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (!Number.isFinite(value) || from === to) return value;
  const code = inputCode.trim().toUpperCase();
  if (code === 'WEIGHT') {
    const kg = from === 'lb' || from === 'lbs' ? value / LB_PER_KG : value;
    const next = to === 'lb' || to === 'lbs' ? kg * LB_PER_KG : kg;
    return roundPatientInfoNumber(next, 1);
  }
  if (code === 'HEIGHT') {
    const cm = from === 'in' || from === 'inch' || from === 'inches' ? value / IN_PER_CM : value;
    const next = to === 'in' || to === 'inch' || to === 'inches' ? cm * IN_PER_CM : cm;
    return roundPatientInfoNumber(next, 1);
  }
  return value;
}

export function canonicalPatientInfoNumber(
  inputCode: string,
  value: number,
  enteredUnit: string | null | undefined,
  canonicalUnit: string | null,
): number {
  if (!canonicalUnit || !enteredUnit) return value;
  return convertPatientInfoValue(inputCode, value, enteredUnit, canonicalUnit);
}

export function displayPatientInfoNumber(
  inputCode: string,
  canonicalValue: number,
  displayUnit: string | null | undefined,
  canonicalUnit: string | null,
): number {
  if (!canonicalUnit || !displayUnit) return canonicalValue;
  return convertPatientInfoValue(inputCode, canonicalValue, canonicalUnit, displayUnit);
}

export function roundPatientInfoNumber(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function parsePatientInfoNumber(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/,/g, '');
  if (!trimmed || trimmed === '.' || trimmed === '-') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function patientInfoNumberError(
  inputCode: string,
  value: number | undefined,
): string | null {
  if (value == null) return null;
  const bounds = NUMERIC_BOUNDS[inputCode.trim().toUpperCase()];
  if (!bounds) return value < 0 ? 'Enter a valid number' : null;
  if (bounds.integer && !Number.isInteger(value)) return 'Enter a whole number';
  if (value < bounds.min || value > bounds.max) return `Enter a value between ${bounds.min} and ${bounds.max}`;
  return null;
}

export function isPatientInfoComplete(row: RenewPatientContextRequirement): boolean {
  if (!row.visible) return true;
  const renderer = resolvePatientInfoRenderer(row);
  const choice = contextChoiceFromAnswer(row.answer);
  if (choice === 'unknown') return Boolean(row.answer.unableReasonCode);
  if (renderer === 'DERIVED' || renderer === 'READ_ONLY') return true;
  if (renderer === 'NUMBER' || renderer === 'NUMBER_WITH_UNIT') {
    return row.answer.numericValue != null && !patientInfoNumberError(row.inputCode, row.answer.numericValue);
  }
  if (renderer === 'SINGLE_SELECT' || renderer === 'TEXT' || renderer === 'DATE' || renderer === 'MULTI_SELECT') {
    return Boolean(row.answer.valueText?.trim());
  }
  if (!choice && !row.answer.valueText?.trim()) return false;
  if (isContextTriggered(row)) {
    if (row.answer.followup) return row.answer.followup.completed === true;
    return row.answer.pharmacistConfirmed === true;
  }
  return Boolean(row.answer.valueText?.trim());
}

export function patientInfoItemStatus(row: RenewPatientContextRequirement): PatientInfoItemStatus {
  const choice = contextChoiceFromAnswer(row.answer);
  if (choice === 'unknown') {
    return row.answer.unableReasonCode ? 'UNABLE_TO_ASSESS' : 'UNANSWERED';
  }
  if (!isPatientInfoComplete(row)) return 'UNANSWERED';
  if (isContextTriggered(row) && row.answer.followup?.completed) return 'EXCEPTION_REVIEWED';
  return 'REVIEWED';
}

export function patientInfoStatusLabel(status: PatientInfoItemStatus): string {
  if (status === 'REVIEWED' || status === 'EXCEPTION_REVIEWED') return 'Reviewed';
  if (status === 'UNABLE_TO_ASSESS') return 'Unable to assess';
  if (status === 'REMOVED_NOT_RELEVANT') return 'Removed';
  if (status === 'ANSWERED') return 'Answered';
  return 'Review required';
}

export function derivedBmiFromContext(items: RenewPatientContextRequirement[]): {
  value: number | null;
  label: string;
} {
  const weight = items.find((row) => row.inputCode.toUpperCase() === 'WEIGHT');
  const height = items.find((row) => row.inputCode.toUpperCase() === 'HEIGHT');
  const kg = weight?.answer.numericValue;
  const cm = height?.answer.numericValue;
  if (kg == null || cm == null || kg <= 0 || cm <= 0) {
    return { value: null, label: 'Requires weight and height' };
  }
  const meters = cm / 100;
  const bmi = roundPatientInfoNumber(kg / (meters * meters), 1);
  return { value: bmi, label: `${bmi} kg/m²` };
}

export function formatPatientInfoPriorDate(iso: string | null | undefined): string | null {
  const raw = iso?.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(match[2]) - 1];
  if (!month) return raw;
  return `${Number(match[3])}-${month}-${match[1]}`;
}

export function patientInfoPriorsFromDemographics(demographics: unknown): Record<
  string,
  NonNullable<RenewPatientContextRequirement['priorValue']>
> {
  if (!demographics || typeof demographics !== 'object') return {};
  const src = demographics as Record<string, unknown>;
  const priors: Record<string, NonNullable<RenewPatientContextRequirement['priorValue']>> = {};
  const weight = parseLooseNumber(src.weight ?? src.weightKg);
  const height = parseLooseNumber(src.height ?? src.heightCm);
  const observedDate =
    (typeof src.weightDate === 'string' && src.weightDate) ||
    (typeof src.vitalsObservedDate === 'string' && src.vitalsObservedDate) ||
    null;
  if (weight != null && weight > 0) {
    priors.WEIGHT = {
      numericValue: weight,
      unit: 'kg',
      observedDate,
      sourceLabel: 'From intake',
    };
  }
  if (height != null && height > 0) {
    priors.HEIGHT = {
      numericValue: height,
      unit: 'cm',
      observedDate,
      sourceLabel: 'From intake',
    };
  }
  return priors;
}

export function attachPatientInfoPriors(
  items: RenewPatientContextRequirement[],
  priors: Record<string, NonNullable<RenewPatientContextRequirement['priorValue']>> | undefined,
): RenewPatientContextRequirement[] {
  if (!priors || !Object.keys(priors).length) return items;
  return items.map((row) => {
    const prior = priors[row.inputCode.trim().toUpperCase()];
    return prior ? { ...row, priorValue: row.priorValue ?? prior } : row;
  });
}

function parseLooseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const n = Number(value.trim().replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
