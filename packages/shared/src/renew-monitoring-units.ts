/**
 * Renew Step 3 — analyte / unit compatibility gate.
 * Never compare a result to a reference unless analyte identity and unit are compatible.
 */

export type UnitDimension =
  | 'mass_concentration'
  | 'substance_concentration'
  | 'cell_count'
  | 'ratio'
  | 'mass_to_molar_ratio'
  | 'pressure'
  | 'time'
  | 'flow_rate'
  | 'dimensionless'
  | 'other';

export type ResultValidationStatus =
  | 'VALID'
  | 'MISSING_UNIT'
  | 'UNIT_MISMATCH'
  | 'ANALYTE_MISMATCH'
  | 'AMBIGUOUS_ANALYTE'
  | 'CONVERSION_REQUIRED'
  | 'CONVERSION_FAILED'
  | 'NOT_EVALUABLE';

export type UnitConversionType = 'MULTIPLY' | 'DIVIDE';

export interface UnitConversionRule {
  fromUnit: string;
  toUnit: string;
  conversionType: UnitConversionType;
  factor: number;
}

export interface MonitoringUnitDefinition {
  inputCode: string;
  canonicalUnit: string;
  acceptedUnits: readonly string[];
  unitDimension: UnitDimension;
  conversions: readonly UnitConversionRule[];
}

export interface UnitCompatibilityResult {
  status: ResultValidationStatus;
  compatible: boolean;
  expectedUnit: string | null;
  detectedUnit: string | null;
  canonicalUnit: string | null;
  unitDimension: UnitDimension | null;
  /** Numeric value converted to the canonical unit when conversion was applied. */
  canonicalNumeric: number | null;
  canonicalSecondary: number | null;
  detail: string | null;
}

/** Explicit aliases only — never invent equivalence between unrelated units. */
const UNIT_ALIASES: Record<string, string> = {
  'mmol/l': 'mmol/L',
  'mmol/L': 'mmol/L',
  'meq/l': 'mEq/L',
  'meq/L': 'mEq/L',
  'mEq/l': 'mEq/L',
  'mEq/L': 'mEq/L',
  'umol/l': 'µmol/L',
  'umol/L': 'µmol/L',
  'µmol/l': 'µmol/L',
  'µmol/L': 'µmol/L',
  'pmol/l': 'pmol/L',
  'pmol/L': 'pmol/L',
  'nmol/l': 'nmol/L',
  'nmol/L': 'nmol/L',
  'g/l': 'g/L',
  'g/L': 'g/L',
  'g/dl': 'g/dL',
  'g/dL': 'g/dL',
  'mg/dl': 'mg/dL',
  'mg/dL': 'mg/dL',
  'mg/l': 'mg/L',
  'mg/L': 'mg/L',
  'mg/mmol': 'mg/mmol',
  'mg/g': 'mg/g',
  'leu/ul': 'Leu/µL',
  'leu/µl': 'Leu/µL',
  'leu/uL': 'Leu/µL',
  'Leu/uL': 'Leu/µL',
  'Leu/µL': 'Leu/µL',
  'cells/ul': 'cells/µL',
  'cells/µl': 'cells/µL',
  'cells/µL': 'cells/µL',
  mmhg: 'mmHg',
  mmHg: 'mmHg',
  bpm: 'bpm',
  '%': '%',
  'miu/l': 'mIU/L',
  'mIU/L': 'mIU/L',
  'uiu/ml': 'µIU/mL',
  'µiu/ml': 'µIU/mL',
  'µIU/mL': 'µIU/mL',
  'ml/min': 'mL/min',
  'mL/min': 'mL/min',
  'ml/min/1.73m2': 'mL/min/1.73m²',
  'ml/min/1.73m²': 'mL/min/1.73m²',
  'mL/min/1.73m2': 'mL/min/1.73m²',
  'mL/min/1.73m²': 'mL/min/1.73m²',
  weeks: 'weeks',
  week: 'weeks',
};

const UNIT_DIMENSIONS: Record<string, UnitDimension> = {
  'mmol/L': 'substance_concentration',
  'mEq/L': 'substance_concentration',
  'µmol/L': 'substance_concentration',
  'pmol/L': 'substance_concentration',
  'nmol/L': 'substance_concentration',
  'mIU/L': 'substance_concentration',
  'µIU/mL': 'substance_concentration',
  'g/L': 'mass_concentration',
  'g/dL': 'mass_concentration',
  'mg/dL': 'mass_concentration',
  'mg/L': 'mass_concentration',
  'Leu/µL': 'cell_count',
  'cells/µL': 'cell_count',
  'mg/mmol': 'mass_to_molar_ratio',
  'mg/g': 'mass_to_molar_ratio',
  mmHg: 'pressure',
  bpm: 'dimensionless',
  '%': 'dimensionless',
  'mL/min': 'flow_rate',
  'mL/min/1.73m²': 'flow_rate',
  weeks: 'time',
};

const INPUT_CODE_ALIASES: Record<string, string> = {
  HR: 'HEART_RATE',
  CREATININE: 'SERUM_CREATININE',
  B12: 'VITAMIN_B12',
  VIT_B12: 'VITAMIN_B12',
  LIPID_PROFILE: 'LDL_C',
};

function canonicalInputCode(inputCode: string): string {
  const upper = inputCode.trim().toUpperCase();
  return INPUT_CODE_ALIASES[upper] ?? upper;
}

/**
 * Governed input definitions. Conversions are explicit only — no free-form AI conversion.
 * Creatinine: mg/dL × 88.4 = µmol/L (conventional SI conversion).
 */
const INPUT_UNIT_DEFINITIONS: Record<string, MonitoringUnitDefinition> = {
  POTASSIUM: {
    inputCode: 'POTASSIUM',
    canonicalUnit: 'mmol/L',
    acceptedUnits: ['mmol/L', 'mEq/L'],
    unitDimension: 'substance_concentration',
    conversions: [
      { fromUnit: 'mEq/L', toUnit: 'mmol/L', conversionType: 'MULTIPLY', factor: 1 },
      { fromUnit: 'mmol/L', toUnit: 'mEq/L', conversionType: 'MULTIPLY', factor: 1 },
    ],
  },
  SODIUM: {
    inputCode: 'SODIUM',
    canonicalUnit: 'mmol/L',
    acceptedUnits: ['mmol/L', 'mEq/L'],
    unitDimension: 'substance_concentration',
    conversions: [
      { fromUnit: 'mEq/L', toUnit: 'mmol/L', conversionType: 'MULTIPLY', factor: 1 },
      { fromUnit: 'mmol/L', toUnit: 'mEq/L', conversionType: 'MULTIPLY', factor: 1 },
    ],
  },
  HEMOGLOBIN: {
    inputCode: 'HEMOGLOBIN',
    canonicalUnit: 'g/L',
    acceptedUnits: ['g/L', 'g/dL'],
    unitDimension: 'mass_concentration',
    conversions: [
      { fromUnit: 'g/dL', toUnit: 'g/L', conversionType: 'MULTIPLY', factor: 10 },
      { fromUnit: 'g/L', toUnit: 'g/dL', conversionType: 'DIVIDE', factor: 10 },
    ],
  },
  VITAMIN_B12: {
    inputCode: 'VITAMIN_B12',
    canonicalUnit: 'pmol/L',
    acceptedUnits: ['pmol/L'],
    unitDimension: 'substance_concentration',
    conversions: [],
  },
  URINE_ACR: {
    inputCode: 'URINE_ACR',
    canonicalUnit: 'mg/mmol',
    acceptedUnits: ['mg/mmol'],
    unitDimension: 'mass_to_molar_ratio',
    conversions: [],
  },
  SERUM_CREATININE: {
    inputCode: 'SERUM_CREATININE',
    canonicalUnit: 'µmol/L',
    acceptedUnits: ['µmol/L', 'mg/dL'],
    unitDimension: 'substance_concentration',
    conversions: [
      { fromUnit: 'mg/dL', toUnit: 'µmol/L', conversionType: 'MULTIPLY', factor: 88.4 },
      { fromUnit: 'µmol/L', toUnit: 'mg/dL', conversionType: 'DIVIDE', factor: 88.4 },
    ],
  },
  CREATININE: {
    inputCode: 'CREATININE',
    canonicalUnit: 'µmol/L',
    acceptedUnits: ['µmol/L', 'mg/dL'],
    unitDimension: 'substance_concentration',
    conversions: [
      { fromUnit: 'mg/dL', toUnit: 'µmol/L', conversionType: 'MULTIPLY', factor: 88.4 },
      { fromUnit: 'µmol/L', toUnit: 'mg/dL', conversionType: 'DIVIDE', factor: 88.4 },
    ],
  },
  TSH: {
    inputCode: 'TSH',
    canonicalUnit: 'mIU/L',
    acceptedUnits: ['mIU/L', 'µIU/mL'],
    unitDimension: 'substance_concentration',
    conversions: [
      { fromUnit: 'µIU/mL', toUnit: 'mIU/L', conversionType: 'MULTIPLY', factor: 1 },
      { fromUnit: 'mIU/L', toUnit: 'µIU/mL', conversionType: 'MULTIPLY', factor: 1 },
    ],
  },
  EGFR: {
    inputCode: 'EGFR',
    canonicalUnit: 'mL/min/1.73m²',
    acceptedUnits: ['mL/min/1.73m²', 'mL/min'],
    unitDimension: 'flow_rate',
    conversions: [
      // Same numeric interpretation for pharmacy monitoring — preserve value.
      { fromUnit: 'mL/min', toUnit: 'mL/min/1.73m²', conversionType: 'MULTIPLY', factor: 1 },
      { fromUnit: 'mL/min/1.73m²', toUnit: 'mL/min', conversionType: 'MULTIPLY', factor: 1 },
    ],
  },
  BP: {
    inputCode: 'BP',
    canonicalUnit: 'mmHg',
    acceptedUnits: ['mmHg'],
    unitDimension: 'pressure',
    conversions: [],
  },
  HR: {
    inputCode: 'HR',
    canonicalUnit: 'bpm',
    acceptedUnits: ['bpm'],
    unitDimension: 'dimensionless',
    conversions: [],
  },
  A1C: {
    inputCode: 'A1C',
    canonicalUnit: '%',
    acceptedUnits: ['%'],
    unitDimension: 'dimensionless',
    conversions: [],
  },
  INR: {
    inputCode: 'INR',
    canonicalUnit: '',
    acceptedUnits: [],
    unitDimension: 'dimensionless',
    conversions: [],
  },
};

function compactUnitKey(raw: string): string {
  return raw
    .trim()
    .replace(/\u00b5/g, 'µ')
    .replace(/\u03bc/g, 'µ')
    .replace(/\s+/g, '')
    .replace(/²/g, '2');
}

/** Normalize display units to a canonical spelling when known. */
export function normalizeMonitoringUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const direct = UNIT_ALIASES[trimmed] ?? UNIT_ALIASES[trimmed.toLowerCase()];
  if (direct) return direct;

  const compact = compactUnitKey(trimmed);
  const compactLower = compact.toLowerCase();
  for (const [alias, canonical] of Object.entries(UNIT_ALIASES)) {
    if (compactUnitKey(alias).toLowerCase() === compactLower) return canonical;
  }
  return trimmed;
}

export function unitDimensionOf(unit: string | null | undefined): UnitDimension | null {
  const normalized = normalizeMonitoringUnit(unit);
  if (!normalized) return null;
  return UNIT_DIMENSIONS[normalized] ?? null;
}

export function monitoringUnitDefinition(
  inputCode: string,
  fallbackCanonicalUnit?: string | null,
): MonitoringUnitDefinition {
  const canonicalCode = canonicalInputCode(inputCode);
  const known = INPUT_UNIT_DEFINITIONS[canonicalCode] ?? INPUT_UNIT_DEFINITIONS[inputCode.trim().toUpperCase()];
  if (known) {
    return {
      ...known,
      inputCode: canonicalCode,
    };
  }

  const canonicalUnit = normalizeMonitoringUnit(fallbackCanonicalUnit) ?? (fallbackCanonicalUnit?.trim() || '');
  const dimension = unitDimensionOf(canonicalUnit) ?? 'other';
  return {
    inputCode: canonicalCode,
    canonicalUnit,
    acceptedUnits: canonicalUnit ? [canonicalUnit] : [],
    unitDimension: dimension,
    conversions: [],
  };
}

function unitsEqual(a: string | null, b: string | null): boolean {
  const left = normalizeMonitoringUnit(a);
  const right = normalizeMonitoringUnit(b);
  if (!left || !right) return false;
  return left === right || compactUnitKey(left).toLowerCase() === compactUnitKey(right).toLowerCase();
}

function findConversion(
  definition: MonitoringUnitDefinition,
  fromUnit: string,
  toUnit: string,
): UnitConversionRule | null {
  const from = normalizeMonitoringUnit(fromUnit);
  const to = normalizeMonitoringUnit(toUnit);
  if (!from || !to) return null;
  if (unitsEqual(from, to)) {
    return { fromUnit: from, toUnit: to, conversionType: 'MULTIPLY', factor: 1 };
  }
  return (
    definition.conversions.find(
      (rule) => unitsEqual(rule.fromUnit, from) && unitsEqual(rule.toUnit, to),
    ) ?? null
  );
}

function applyConversion(value: number, rule: UnitConversionRule): number {
  if (rule.conversionType === 'DIVIDE') return value / rule.factor;
  return value * rule.factor;
}

function isAcceptedUnit(definition: MonitoringUnitDefinition, unit: string): boolean {
  const normalized = normalizeMonitoringUnit(unit);
  if (!normalized) return false;
  if (definition.acceptedUnits.some((accepted) => unitsEqual(accepted, normalized))) return true;
  if (unitsEqual(definition.canonicalUnit, normalized)) return true;
  return false;
}

/**
 * Validate that a patient result unit can be compared to the monitoring input's reference.
 * Converts to the canonical unit only when an explicit conversion rule exists.
 */
export function validateMonitoringResultUnit(args: {
  inputCode: string;
  resultUnit?: string | null;
  /** Library / reference canonical unit fallback when no governed definition exists. */
  expectedUnit?: string | null;
  numericValue?: number | null;
  secondaryNumericValue?: number | null;
}): UnitCompatibilityResult {
  const definition = monitoringUnitDefinition(args.inputCode, args.expectedUnit);
  const expectedUnit = normalizeMonitoringUnit(definition.canonicalUnit || args.expectedUnit) ?? null;
  const detectedUnit = normalizeMonitoringUnit(args.resultUnit);

  if (!expectedUnit && !definition.acceptedUnits.length) {
    // Dimensionless / unitless analytes (e.g. INR) — treat empty unit as valid.
    if (!detectedUnit) {
      return {
        status: 'VALID',
        compatible: true,
        expectedUnit: null,
        detectedUnit: null,
        canonicalUnit: null,
        unitDimension: definition.unitDimension,
        canonicalNumeric: args.numericValue ?? null,
        canonicalSecondary: args.secondaryNumericValue ?? null,
        detail: null,
      };
    }
  }

  if (!detectedUnit) {
    // Unitless analytes (INR) — empty unit is valid.
    if (!expectedUnit && definition.unitDimension === 'dimensionless') {
      return {
        status: 'VALID',
        compatible: true,
        expectedUnit: null,
        detectedUnit: null,
        canonicalUnit: null,
        unitDimension: definition.unitDimension,
        canonicalNumeric: args.numericValue ?? null,
        canonicalSecondary: args.secondaryNumericValue ?? null,
        detail: null,
      };
    }
    return {
      status: 'MISSING_UNIT',
      compatible: false,
      expectedUnit,
      detectedUnit: null,
      canonicalUnit: expectedUnit,
      unitDimension: definition.unitDimension,
      canonicalNumeric: null,
      canonicalSecondary: null,
      detail: expectedUnit ? `Expected unit: ${expectedUnit}` : 'Unit required',
    };
  }

  if (!expectedUnit) {
    return {
      status: 'NOT_EVALUABLE',
      compatible: false,
      expectedUnit: null,
      detectedUnit,
      canonicalUnit: null,
      unitDimension: unitDimensionOf(detectedUnit),
      canonicalNumeric: null,
      canonicalSecondary: null,
      detail: 'Unable to interpret',
    };
  }

  const expectedDimension = definition.unitDimension || unitDimensionOf(expectedUnit);
  const resultDimension = unitDimensionOf(detectedUnit);

  // Exact canonical match — compare as-is.
  if (unitsEqual(detectedUnit, expectedUnit)) {
    return {
      status: 'VALID',
      compatible: true,
      expectedUnit,
      detectedUnit,
      canonicalUnit: expectedUnit,
      unitDimension: expectedDimension,
      canonicalNumeric: args.numericValue ?? null,
      canonicalSecondary: args.secondaryNumericValue ?? null,
      detail: null,
    };
  }

  // Explicit conversion / accepted alternate (may cross unit dimensions, e.g. creatinine).
  const conversion = findConversion(definition, detectedUnit, expectedUnit);
  const accepted = isAcceptedUnit(definition, detectedUnit);

  if (conversion && (accepted || Boolean(conversion))) {
    if (args.numericValue == null) {
      return {
        status: 'VALID',
        compatible: true,
        expectedUnit,
        detectedUnit,
        canonicalUnit: expectedUnit,
        unitDimension: expectedDimension,
        canonicalNumeric: null,
        canonicalSecondary: null,
        detail: null,
      };
    }
    try {
      const canonicalNumeric = applyConversion(args.numericValue, conversion);
      const canonicalSecondary =
        args.secondaryNumericValue == null
          ? null
          : applyConversion(args.secondaryNumericValue, conversion);
      if (!Number.isFinite(canonicalNumeric)) {
        return {
          status: 'CONVERSION_FAILED',
          compatible: false,
          expectedUnit,
          detectedUnit,
          canonicalUnit: expectedUnit,
          unitDimension: expectedDimension,
          canonicalNumeric: null,
          canonicalSecondary: null,
          detail: `Expected unit: ${expectedUnit}`,
        };
      }
      return {
        status: 'VALID',
        compatible: true,
        expectedUnit,
        detectedUnit,
        canonicalUnit: expectedUnit,
        unitDimension: expectedDimension,
        canonicalNumeric,
        canonicalSecondary,
        detail: null,
      };
    } catch {
      return {
        status: 'CONVERSION_FAILED',
        compatible: false,
        expectedUnit,
        detectedUnit,
        canonicalUnit: expectedUnit,
        unitDimension: expectedDimension,
        canonicalNumeric: null,
        canonicalSecondary: null,
        detail: `Expected unit: ${expectedUnit}`,
      };
    }
  }

  // Dimension gate — only after no accepted conversion path.
  if (
    resultDimension &&
    expectedDimension &&
    expectedDimension !== 'other' &&
    resultDimension !== expectedDimension
  ) {
    return {
      status: 'UNIT_MISMATCH',
      compatible: false,
      expectedUnit,
      detectedUnit,
      canonicalUnit: expectedUnit,
      unitDimension: expectedDimension,
      canonicalNumeric: null,
      canonicalSecondary: null,
      detail: `Expected unit: ${expectedUnit}`,
    };
  }

  return {
    status: 'UNIT_MISMATCH',
    compatible: false,
    expectedUnit,
    detectedUnit,
    canonicalUnit: expectedUnit,
    unitDimension: expectedDimension,
    canonicalNumeric: null,
    canonicalSecondary: null,
    detail: `Expected unit: ${expectedUnit}`,
  };
}

export function canCompareResultToReference(args: {
  inputCode: string;
  resultUnit?: string | null;
  referenceUnit?: string | null;
  expectedUnit?: string | null;
}): boolean {
  const validation = validateMonitoringResultUnit({
    inputCode: args.inputCode,
    resultUnit: args.resultUnit,
    expectedUnit: args.expectedUnit ?? args.referenceUnit,
  });
  if (!validation.compatible) return false;
  const referenceUnit = normalizeMonitoringUnit(args.referenceUnit);
  if (!referenceUnit) return true;
  return unitsEqual(referenceUnit, validation.canonicalUnit ?? validation.expectedUnit);
}

/** Units shown in the result editor — canonical first, then accepted alternates. */
export function acceptedUnitsForMonitoringInput(
  inputCode: string,
  fallbackCanonicalUnit?: string | null,
): string[] {
  const definition = monitoringUnitDefinition(inputCode, fallbackCanonicalUnit);
  const units: string[] = [];
  const add = (raw: string | null | undefined) => {
    const unit = normalizeMonitoringUnit(raw) ?? raw?.trim();
    if (unit && !units.includes(unit)) units.push(unit);
  };
  add(definition.canonicalUnit);
  for (const unit of definition.acceptedUnits) add(unit);
  add(fallbackCanonicalUnit);
  return units;
}

export function isUnitValidationBlocking(status: ResultValidationStatus | null | undefined): boolean {
  return (
    status === 'UNIT_MISMATCH' ||
    status === 'MISSING_UNIT' ||
    status === 'CONVERSION_FAILED' ||
    status === 'ANALYTE_MISMATCH' ||
    status === 'AMBIGUOUS_ANALYTE' ||
    status === 'CONVERSION_REQUIRED' ||
    status === 'NOT_EVALUABLE'
  );
}

export function unitValidationBadge(status: ResultValidationStatus): {
  badgeLabel: string;
  detail: string;
} {
  switch (status) {
    case 'UNIT_MISMATCH':
      return { badgeLabel: 'Result/unit mismatch', detail: 'Expected unit' };
    case 'MISSING_UNIT':
      return { badgeLabel: 'Unit required', detail: 'Unit required' };
    case 'ANALYTE_MISMATCH':
      return { badgeLabel: 'Result may belong to another test', detail: 'Confirm the test identity' };
    case 'AMBIGUOUS_ANALYTE':
      return { badgeLabel: 'Confirm test identity', detail: 'Confirm the test identity' };
    case 'CONVERSION_FAILED':
    case 'CONVERSION_REQUIRED':
    case 'NOT_EVALUABLE':
      return { badgeLabel: 'Unable to interpret', detail: 'Unable to interpret' };
    default:
      return { badgeLabel: 'Unable to interpret', detail: 'Unable to interpret' };
  }
}
