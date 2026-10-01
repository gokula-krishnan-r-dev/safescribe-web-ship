/**
 * Renew workflow-configuration matching.
 * Spreadsheet IDs such as RAMIPRIL / ACE_INHIBITOR are aliases, not CCDD codes.
 * Safety thresholds never live here — this only decides what Step 3 should collect.
 */

export const RENEW_WORKFLOW_REQUIREMENTS = ['REQUIRED', 'RELEVANT', 'CONDITIONAL'] as const;
export type RenewWorkflowRequirement = (typeof RENEW_WORKFLOW_REQUIREMENTS)[number];

export const RENEW_MISSING_ACTIONS = ['NONE', 'REVIEW', 'REFER', 'BLOCK'] as const;
export type RenewMissingAction = (typeof RENEW_MISSING_ACTIONS)[number];

export const RENEW_APPLIES_TO_TYPES = ['CLASS', 'INGREDIENT'] as const;
export type RenewAppliesToType = (typeof RENEW_APPLIES_TO_TYPES)[number];

export const RENEW_INPUT_CATEGORIES = ['PATIENT_CONTEXT', 'VITAL', 'LAB', 'QUESTION'] as const;
export type RenewInputCategory = (typeof RENEW_INPUT_CATEGORIES)[number];

export const RENEW_DATA_TYPES = [
  'INTEGER',
  'DECIMAL',
  'TEXT',
  'BOOLEAN',
  'ENUM',
  'DATE',
  'COMPOSITE',
] as const;
export type RenewDataType = (typeof RENEW_DATA_TYPES)[number];

export const RENEW_UI_COMPONENTS = [
  'NUMBER_INPUT',
  'TEXT_INPUT',
  'SINGLE_SELECT',
  'YES_NO',
  'DATE_INPUT',
  'LAB_INPUT',
  'BP_INPUT',
] as const;
export type RenewUiComponent = (typeof RENEW_UI_COMPONENTS)[number];

export const RENEW_QUESTION_ACTIONS = ['REVIEW', 'REFER', 'BLOCK'] as const;
export type RenewQuestionAction = (typeof RENEW_QUESTION_ACTIONS)[number];

const REQUIREMENT_RANK: Record<string, number> = {
  REQUIRED: 3,
  RELEVANT: 2,
  CONDITIONAL: 1,
  RECOMMENDED: 2,
};

const MISSING_ACTION_RANK: Record<string, number> = {
  BLOCK: 4,
  REFER: 3,
  REVIEW: 2,
  NONE: 1,
};

export function normalizeRenewAlias(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/+\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function renewAliasTokens(value: string | null | undefined): string[] {
  const normalized = normalizeRenewAlias(value);
  if (!normalized) return [];
  const tokens = normalized.split(' ').filter((token) => token.length >= 3);
  return [...new Set([normalized.replace(/\s+/g, '_'), normalized.replace(/\s+/g, ''), ...tokens])];
}

/** True when a captured medication's ingredient keys match a spreadsheet ingredient_id. */
export function ingredientAliasMatches(
  appliesToId: string | null | undefined,
  medicationKeys: Iterable<string>,
): boolean {
  if (!appliesToId?.trim()) return false;
  const wanted = new Set(renewAliasTokens(appliesToId));
  if (!wanted.size) return false;
  for (const key of medicationKeys) {
    for (const token of renewAliasTokens(key)) {
      if (wanted.has(token)) return true;
    }
  }
  return false;
}

/**
 * Same clinical concept, different catalog codes (workbook HTN vs older HYPERTENSION).
 * Used when matching monitoring/question indication_id — never to merge distinct workbook IDs.
 */
export const INDICATION_CODE_ALIASES: Record<string, string[]> = {
  HTN: ['HYPERTENSION', 'HIGH_BLOOD_PRESSURE'],
  HYPERTENSION: ['HTN', 'HIGH_BLOOD_PRESSURE'],
  HF: ['HEART_FAILURE', 'CHF', 'CONGESTIVE_HEART_FAILURE'],
  HEART_FAILURE: ['HF', 'CHF'],
  AF: ['ATRIAL_FIBRILLATION', 'AFIB'],
  ATRIAL_FIBRILLATION: ['AF', 'AFIB'],
  T2DM: ['TYPE_2_DIABETES', 'DIABETES_T2', 'NIDDM'],
  T1DM: ['TYPE_1_DIABETES', 'DIABETES_T1', 'IDDM'],
  MDD: ['DEPRESSION', 'MAJOR_DEPRESSION'],
  DEPRESSION: ['MDD'],
  GAD: ['ANXIETY', 'GENERALIZED_ANXIETY'],
  ANXIETY: ['GAD'],
  EPILEPSY: ['SEIZURE', 'SEIZURE_DISORDER'],
  SEIZURE: ['EPILEPSY'],
  MIGRAINE_PROPHYLAXIS: ['MIGRAINE'],
  MIGRAINE: ['MIGRAINE_PROPHYLAXIS'],
  PUD: ['GI_PROTECTION', 'PEPTIC_ULCER'],
  GI_PROTECTION: ['PUD'],
  NVP: ['NAUSEA_VOMITING_PREGNANCY'],
};

export function expandIndicationCodes(codes: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    out.add(code);
    for (const alias of INDICATION_CODE_ALIASES[code] ?? []) {
      out.add(alias.toUpperCase());
    }
  }
  return [...out];
}

export function aliasesForIndicationCode(
  indicationId: string,
  indicationName?: string | null,
): string[] {
  const code = indicationId.trim().toUpperCase();
  const aliases = [
    code,
    code.replace(/_/g, ' '),
    ...(INDICATION_CODE_ALIASES[code] ?? []),
    ...(indicationName ? [indicationName] : []),
  ];
  return [...new Set(aliases.map((value) => value.trim()).filter(Boolean))];
}

export function indicationMatches(
  ruleIndicationId: string | null | undefined,
  medicationIndicationCodes: Iterable<string>,
): boolean {
  const rule = (ruleIndicationId ?? 'ANY').trim().toUpperCase();
  if (!rule || rule === 'ANY') return true;
  const wanted = new Set(expandIndicationCodes(medicationIndicationCodes));
  if (wanted.has(rule)) return true;
  for (const equivalent of expandIndicationCodes([rule])) {
    if (wanted.has(equivalent)) return true;
  }
  const ruleNormalized = normalizeRenewAlias(rule);
  for (const code of wanted) {
    if (normalizeRenewAlias(code) === ruleNormalized) return true;
  }
  return false;
}

export function strongerRequirement(a: string, b: string): string {
  return (REQUIREMENT_RANK[a.toUpperCase()] ?? 0) >= (REQUIREMENT_RANK[b.toUpperCase()] ?? 0) ? a : b;
}

export function strongerMissingAction(a: string, b: string): string {
  return (MISSING_ACTION_RANK[a.toUpperCase()] ?? 0) >= (MISSING_ACTION_RANK[b.toUpperCase()] ?? 0)
    ? a
    : b;
}

export function shortestFreshness(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

export function toRenewValueShape(dataType: string, uiComponent: string): string {
  const ui = uiComponent.trim().toUpperCase();
  const type = dataType.trim().toUpperCase();
  if (ui === 'BP_INPUT' || type === 'COMPOSITE') return 'SYSTOLIC_DIASTOLIC';
  if (ui === 'YES_NO' || type === 'BOOLEAN') return 'YES_NO';
  if (type === 'INTEGER') return 'NUMBER';
  if (type === 'DECIMAL') return 'NUMERIC';
  return 'TEXT';
}

export function parseEnumDisplayOptions(display: string | null | undefined): string[] {
  if (!display?.trim()) return [];
  return display
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function answersMatchTrigger(answer: string | null | undefined, trigger: string): boolean {
  const left = normalizeRenewAlias(answer).replace(/\s+/g, '');
  const right = normalizeRenewAlias(trigger).replace(/\s+/g, '');
  if (!left || !right) return false;
  if (left === right) return true;
  if ((left === 'yes' || left === 'y' || left === 'true') && (right === 'yes' || right === 'y' || right === 'true')) {
    return true;
  }
  return false;
}

export const INPUT_CODE_ALIASES: Record<string, string[]> = {
  BP: ['blood pressure', 'bp', 'sbp', 'dbp'],
  HEART_RATE: ['heart rate', 'pulse', 'hr'],
  EGFR: ['egfr', 'estimated gfr', 'gfr'],
  SERUM_CREATININE: ['creatinine', 'scr', 'creat', 'serum creatinine'],
  CRCL: ['creatinine clearance', 'crcl', 'cockcroft'],
  POTASSIUM: ['potassium', 'k', 'k+'],
  TSH: ['tsh', 'thyroid stimulating hormone'],
  A1C: ['a1c', 'hba1c', 'hemoglobin a1c'],
  INR: ['inr', 'international normalized ratio'],
  PSA: ['psa', 'prostate specific antigen'],
  WEIGHT: ['weight', 'wt', 'body weight'],
  GESTATIONAL_AGE: ['gestational age', 'ga'],
  PREGNANCY_STATUS: ['pregnant', 'pregnancy', 'pregnancy status'],
  ALT: ['alt', 'alanine aminotransferase', 'sgpt'],
  AST: ['ast', 'aspartate aminotransferase', 'sgot'],
  LDL_C: ['ldl', 'ldl-c', 'ldl cholesterol'],
  HDL_C: ['hdl', 'hdl-c', 'hdl cholesterol'],
  URINE_ACR: ['acr', 'albumin creatinine ratio', 'urine acr'],
  ANC: ['anc', 'absolute neutrophil count', 'neutrophils'],
};

export function defaultAliasesForInput(code: string, label: string): string[] {
  const extras = INPUT_CODE_ALIASES[code] ?? [];
  return [...new Set([code.toLowerCase().replace(/_/g, ' '), label.toLowerCase(), ...extras])];
}
