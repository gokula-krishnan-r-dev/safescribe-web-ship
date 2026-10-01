/**
 * Structured renal dosing for pathway treatments.
 * Machine-readable rules are matched deterministically; free-text is display-only.
 */

export type RenalDosingBasis = 'CrCl' | 'eGFR' | 'NONE';

/** Authoritative source measure (may differ from operational match basis). */
export type RenalSourceBasis = 'CrCl' | 'eGFR' | 'OTHER' | 'NONE';

export const RENAL_DOSE_UNITS = ['mg', 'mcg', 'g', 'mL', 'units'] as const;
export type RenalDoseUnit = (typeof RENAL_DOSE_UNITS)[number];

export const RENAL_DURATION_UNITS = ['Days', 'Weeks', 'Months'] as const;
export type RenalDurationUnit = (typeof RENAL_DURATION_UNITS)[number];

export const RENAL_RULE_FREQUENCIES = [
  'Once daily',
  'Twice daily (BID)',
  'Three times daily (TID)',
  'Divided TID',
  'Four times daily (QID)',
  'Five times daily',
  'Every 4 hours',
  'Every 6 hours',
  'Every 8 hours',
  'Every 12 hours',
  'At bedtime',
  'As needed (PRN)',
  'Once weekly',
  'Single dose',
  'Other',
] as const;

export interface RenalDosingRule {
  min: number | null;
  minInclusive: boolean;
  max: number | null;
  maxInclusive: boolean;
  doseAmount: number;
  doseUnit: RenalDoseUnit;
  frequency: string;
  duration: number;
  durationUnit: RenalDurationUnit;
  totalDoses: number | null;
  directions: string;
}

export type ParseRenalRulesResult =
  | { ok: true; rules: RenalDosingRule[] }
  | { ok: false; error: string; rules: RenalDosingRule[] };

export interface RenalRulesValidationIssue {
  path: string;
  message: string;
}

export function parseFieldLine(line: string): { key: string; value: string } | null {
  const firstColon = line.indexOf(':');
  const altColon = firstColon === -1 ? line.indexOf('：') : firstColon;
  if (altColon === -1) return null;
  const key = line.slice(0, altColon).trim();
  if (!key || key.startsWith('#') || key.startsWith('|')) return null;
  return {
    key,
    value: line.slice(altColon + 1).trim(),
  };
}

export function splitConfiguration(value?: string | null): string[] {
  return (value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseRenalDosingBasis(raw?: string | null): RenalDosingBasis | null {
  const value = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return null;
  if (/^(none|n\/a|na|no|not applicable)$/i.test(value)) return 'NONE';
  if (/\begfr\b/.test(value) || value === 'egfr') return 'eGFR';
  if (/\bcrcl\b/.test(value) || /creatinine\s+clearance/.test(value) || value === 'crcl') {
    return 'CrCl';
  }
  return null;
}

export function parseRenalSourceBasis(raw?: string | null): RenalSourceBasis | null {
  const value = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return null;
  if (/^(none|n\/a|na|no|not applicable)$/i.test(value)) return 'NONE';
  if (/\begfr\b/.test(value) || value === 'egfr') return 'eGFR';
  if (/\bcrcl\b/.test(value) || /creatinine\s+clearance/.test(value) || value === 'crcl') {
    return 'CrCl';
  }
  if (/^other$/.test(value)) return 'OTHER';
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unwrapJsonCandidate(raw: string): string {
  let value = raw.trim();
  if (!value) return '';
  value = value.replace(/^[“”]/g, '"').replace(/[“”]/g, '"');
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value);
  if (fence) value = fence[1].trim();
  if (
    (value.startsWith('`') && value.endsWith('`')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function sliceJsonArray(source: string): string | null {
  if (!source.startsWith('[')) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(0, i + 1);
    }
  }
  return null;
}

export function extractMarkdownField(block: string, names: string[]): string {
  const wanted = names.map((name) => name.toLowerCase());
  for (const line of block.replace(/\r\n/g, '\n').split('\n')) {
    const parsed = parseFieldLine(line.replace(/^\s*[-*]\s+/, ''));
    if (!parsed) continue;
    if (wanted.includes(parsed.key.toLowerCase())) return parsed.value;
  }
  return '';
}

export function extractJsonArrayField(block: string, names: string[]): string {
  const text = block.replace(/\r\n/g, '\n');
  for (const name of names) {
    const re = new RegExp(`^${escapeRegExp(name)}\\s*[:：]\\s*`, 'im');
    const match = re.exec(text);
    if (!match) continue;
    const rest = text.slice(match.index + match[0].length);
    const candidate = unwrapJsonCandidate(rest.trimStart().replace(/\n```[\s\S]*$/, '').trim());
    const start = candidate.indexOf('[');
    if (start === -1) {
      const firstLine = rest.split('\n')[0]?.trim() ?? '';
      return unwrapJsonCandidate(firstLine);
    }
    return sliceJsonArray(candidate.slice(start)) ?? unwrapJsonCandidate(candidate);
  }
  return '';
}

function isDoseUnit(value: unknown): value is RenalDoseUnit {
  return typeof value === 'string' && (RENAL_DOSE_UNITS as readonly string[]).includes(value);
}

function isDurationUnit(value: unknown): value is RenalDurationUnit {
  if (typeof value !== 'string') return false;
  const key = value.trim().toLowerCase();
  if (key.startsWith('day')) return true;
  if (key.startsWith('week')) return true;
  if (key.startsWith('month')) return true;
  return (RENAL_DURATION_UNITS as readonly string[]).includes(value);
}

function normalizeDurationUnit(value: string): RenalDurationUnit | null {
  const key = value.trim().toLowerCase();
  if (key.startsWith('week')) return 'Weeks';
  if (key.startsWith('month')) return 'Months';
  if (key.startsWith('day')) return 'Days';
  if ((RENAL_DURATION_UNITS as readonly string[]).includes(value.trim())) {
    return value.trim() as RenalDurationUnit;
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  return asFiniteNumber(value);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function coerceRule(raw: unknown, index: number): { rule?: RenalDosingRule; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `Rule ${index + 1} is not an object` };
  }
  const row = raw as Record<string, unknown>;
  const doseAmount = asFiniteNumber(row.doseAmount);
  const duration = asFiniteNumber(row.duration);
  const doseUnitRaw = typeof row.doseUnit === 'string' ? row.doseUnit.trim() : '';
  const durationUnitRaw = typeof row.durationUnit === 'string' ? row.durationUnit.trim() : '';
  const frequency = typeof row.frequency === 'string' ? row.frequency.trim() : '';
  const directions = typeof row.directions === 'string' ? row.directions.trim() : '';
  if (doseAmount == null || doseAmount <= 0) {
    return { error: `Rule ${index + 1}: doseAmount must be greater than 0` };
  }
  if (!isDoseUnit(doseUnitRaw)) {
    return { error: `Rule ${index + 1}: unsupported doseUnit` };
  }
  if (!frequency) {
    return { error: `Rule ${index + 1}: frequency is required` };
  }
  if (duration == null || duration <= 0) {
    return { error: `Rule ${index + 1}: duration must be greater than 0` };
  }
  if (!isDurationUnit(durationUnitRaw)) {
    return { error: `Rule ${index + 1}: unsupported durationUnit` };
  }
  if (!directions) {
    return { error: `Rule ${index + 1}: directions are required` };
  }
  const durationUnit = normalizeDurationUnit(durationUnitRaw);
  if (!durationUnit) {
    return { error: `Rule ${index + 1}: unsupported durationUnit` };
  }
  const totalDoses = asNullableNumber(row.totalDoses);
  if (row.totalDoses != null && (totalDoses == null || totalDoses <= 0)) {
    return { error: `Rule ${index + 1}: totalDoses must be a positive number or null` };
  }
  return {
    rule: {
      min: asNullableNumber(row.min),
      minInclusive: asBoolean(row.minInclusive, true),
      max: asNullableNumber(row.max),
      maxInclusive: asBoolean(row.maxInclusive, false),
      doseAmount,
      doseUnit: doseUnitRaw,
      frequency,
      duration,
      durationUnit,
      totalDoses,
      directions,
    },
  };
}

export function parseRenalDosingRulesJson(raw: unknown): ParseRenalRulesResult {
  if (raw == null || raw === '') {
    return { ok: true, rules: [] };
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const json = unwrapJsonCandidate(raw);
    if (!json || json === '[]') return { ok: true, rules: [] };
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, error: 'Renal dosing rules must be valid JSON', rules: [] };
    }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Renal dosing rules must be a JSON array', rules: [] };
  }
  const rules: RenalDosingRule[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = coerceRule(parsed[i], i);
    if (result.error || !result.rule) {
      return { ok: false, error: result.error ?? `Rule ${i + 1} is invalid`, rules: [] };
    }
    rules.push(result.rule);
  }
  return { ok: true, rules };
}

function rangeIsEmpty(rule: RenalDosingRule): boolean {
  if (rule.min == null || rule.max == null) return false;
  if (rule.min < rule.max) return false;
  if (rule.min > rule.max) return true;
  return !(rule.minInclusive && rule.maxInclusive);
}

function boundStart(rule: RenalDosingRule): { value: number; exclusive: boolean } {
  if (rule.min == null) return { value: Number.NEGATIVE_INFINITY, exclusive: false };
  return { value: rule.min, exclusive: !rule.minInclusive };
}

function boundEnd(rule: RenalDosingRule): { value: number; exclusive: boolean } {
  if (rule.max == null) return { value: Number.POSITIVE_INFINITY, exclusive: false };
  return { value: rule.max, exclusive: !rule.maxInclusive };
}

/** True when the end of A is at or before the start of B (no overlap). */
function endsAtOrBefore(
  end: { value: number; exclusive: boolean },
  start: { value: number; exclusive: boolean },
): boolean {
  if (end.value < start.value) return true;
  if (end.value > start.value) return false;
  return end.exclusive || start.exclusive;
}

export function rangesOverlap(a: RenalDosingRule, b: RenalDosingRule): boolean {
  return !(
    endsAtOrBefore(boundEnd(a), boundStart(b)) || endsAtOrBefore(boundEnd(b), boundStart(a))
  );
}

export function validateRenalDosingRules(rules: RenalDosingRule[]): RenalRulesValidationIssue[] {
  const issues: RenalRulesValidationIssue[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const path = `renalDosingRules.${i}`;
    if (rangeIsEmpty(rule)) {
      issues.push({ path, message: `Rule ${i + 1} has an empty range` });
    }
    const knownFrequency = RENAL_RULE_FREQUENCIES.some(
      (item) => item.toLowerCase() === rule.frequency.toLowerCase(),
    );
    if (!knownFrequency && rule.frequency.length < 3) {
      issues.push({ path, message: `Rule ${i + 1} has an unsupported frequency` });
    }
  }
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (rangesOverlap(rules[i], rules[j])) {
        issues.push({
          path: `renalDosingRules.${i}`,
          message: `Rules ${i + 1} and ${j + 1} have overlapping ranges`,
        });
      }
    }
  }
  return issues;
}

export function matchesRule(value: number, rule: RenalDosingRule): boolean {
  const minOk =
    rule.min === null || (rule.minInclusive ? value >= rule.min : value > rule.min);
  const maxOk =
    rule.max === null || (rule.maxInclusive ? value <= rule.max : value < rule.max);
  return minOk && maxOk;
}

export function getApplicableRule(
  value: number,
  rules: RenalDosingRule[],
): RenalDosingRule | null {
  const matches = rules.filter((rule) => matchesRule(value, rule));
  if (matches.length !== 1) return null;
  return matches[0];
}

export function formatRenalRangeLabel(
  rule: RenalDosingRule,
  basis: Exclude<RenalDosingBasis, 'NONE'> = 'CrCl',
): string {
  const unit = basis === 'eGFR' ? 'mL/min/1.73 m²' : 'mL/min';
  let range: string;
  if (rule.min == null && rule.max != null) {
    range = `${rule.maxInclusive ? '≤' : '<'}${rule.max}`;
  } else if (
    rule.min === 0 &&
    rule.minInclusive &&
    rule.max != null &&
    !rule.maxInclusive
  ) {
    range = `<${rule.max}`;
  } else if (rule.max == null && rule.min != null) {
    range = `${rule.minInclusive ? '≥' : '>'}${rule.min}`;
  } else if (rule.min != null && rule.max != null) {
    const left = rule.minInclusive ? String(rule.min) : `>${rule.min}`;
    const right = rule.maxInclusive ? String(rule.max) : `<${rule.max}`;
    range = `${left} to ${right}`;
  } else {
    range = 'all';
  }
  return `${basis} ${range} ${unit}`;
}

export function formatRenalRuleSummary(rule: RenalDosingRule): string {
  const dose = `${rule.doseAmount} ${rule.doseUnit}`;
  const parts = [dose, rule.frequency];
  if (rule.totalDoses != null) {
    parts.push(`${rule.totalDoses} dose${rule.totalDoses === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function inferRenalDosingBasisFromReason(
  reason?: string | null,
): Exclude<RenalDosingBasis, 'NONE'> | null {
  const text = (reason ?? '').toLowerCase();
  if (/\begfr\b/.test(text)) return 'eGFR';
  if (/\bcrcl\b/.test(text) || /creatinine\s+clearance/.test(text)) return 'CrCl';
  return null;
}

export interface ExtractedRenalDosing {
  renalAdjustment: 'Yes' | 'No' | '';
  renalAdjustmentReason: string;
  /** Authoritative source measure (CrCl / eGFR / OTHER / NONE). */
  renalSourceBasis: RenalSourceBasis | null;
  /** Operational match basis used by SafeScribe (prefer eGFR for new imports). */
  renalDosingBasis: RenalDosingBasis | null;
  renalDosingRules: RenalDosingRule[];
  parseError: string | null;
}

export function extractRenalDosingFromMarkdown(block: string): ExtractedRenalDosing {
  const flagRaw = extractMarkdownField(block, ['Renal adjustment', 'Renal flag']);
  const flag = /^\s*yes\s*$/i.test(flagRaw)
    ? 'Yes'
    : /^\s*no\s*$/i.test(flagRaw)
      ? 'No'
      : '';
  const reason = extractMarkdownField(block, ['Renal reason', 'Renal adjustment reason']);
  const sourceRaw = extractMarkdownField(block, ['Renal source basis', 'Source basis']);
  const basisRaw = extractMarkdownField(block, ['Renal dosing basis']);
  const jsonRaw = extractJsonArrayField(block, ['Renal dosing rules']);
  const parsed = parseRenalDosingRulesJson(jsonRaw);
  let sourceBasis = parseRenalSourceBasis(sourceRaw);
  let basis = parseRenalDosingBasis(basisRaw);

  if (flag === 'No') {
    return {
      renalAdjustment: 'No',
      renalAdjustmentReason: '',
      renalSourceBasis: 'NONE',
      renalDosingBasis: 'NONE',
      renalDosingRules: [],
      parseError: null,
    };
  }

  // New prompt contract: source basis + operational eGFR rules.
  // Legacy imports often only set "Renal dosing basis: CrCl|eGFR".
  if (!sourceBasis && (basis === 'CrCl' || basis === 'eGFR')) {
    sourceBasis = basis;
  }
  if (!sourceBasis) {
    const inferred = inferRenalDosingBasisFromReason(reason);
    if (inferred) sourceBasis = inferred;
  }

  if (!basis && parsed.ok && parsed.rules.length > 0) {
    // Prefer eGFR when reason/rules describe eGFR; otherwise keep legacy CrCl match.
    basis =
      sourceBasis === 'eGFR' || /\begfr\b/i.test(reason)
        ? 'eGFR'
        : inferRenalDosingBasisFromReason(reason) ??
          (sourceBasis === 'CrCl' ? 'CrCl' : 'eGFR');
  }

  // When source basis is present and rules exist, operational basis is eGFR
  // (SafeScribe pharmacist-facing match), unless legacy-only CrCl rules were imported.
  if (
    sourceBasis &&
    sourceBasis !== 'NONE' &&
    parsed.ok &&
    parsed.rules.length > 0 &&
    (basis === 'eGFR' || basis === null || /\begfr\b/i.test(reason))
  ) {
    basis = 'eGFR';
  }

  if (flag === 'Yes' && !basis) {
    basis = inferRenalDosingBasisFromReason(reason);
  }

  return {
    renalAdjustment: flag,
    renalAdjustmentReason: reason,
    renalSourceBasis: sourceBasis,
    renalDosingBasis: basis,
    renalDosingRules: parsed.ok ? parsed.rules : [],
    parseError: parsed.ok ? null : parsed.error,
  };
}

export function normalizeStoredRenalDosing(input: {
  renalAdjustment?: string | null;
  renalAdjustmentReason?: string | null;
  renalDosingBasis?: string | null;
  renalDosingRules?: unknown;
}): {
  renalDosingBasis: RenalDosingBasis;
  renalDosingRules: RenalDosingRule[];
  parseError: string | null;
} {
  const yes = /^\s*yes\s*$/i.test(input.renalAdjustment ?? '');
  if (!yes) {
    return { renalDosingBasis: 'NONE', renalDosingRules: [], parseError: null };
  }
  const parsed = parseRenalDosingRulesJson(input.renalDosingRules);
  const basis =
    parseRenalDosingBasis(input.renalDosingBasis) ??
    (parsed.ok && parsed.rules.length > 0
      ? inferRenalDosingBasisFromReason(input.renalAdjustmentReason) ?? 'CrCl'
      : 'NONE');
  return {
    renalDosingBasis: basis ?? 'NONE',
    renalDosingRules: parsed.ok ? parsed.rules : [],
    parseError: parsed.ok ? null : parsed.error,
  };
}

export const VALACYCLOVIR_COLD_SORE_RENAL_RULES: RenalDosingRule[] = [
  {
    min: 50,
    minInclusive: true,
    max: null,
    maxInclusive: false,
    doseAmount: 2000,
    doseUnit: 'mg',
    frequency: 'Twice daily (BID)',
    duration: 1,
    durationUnit: 'Days',
    totalDoses: 2,
    directions: 'Take 2000 mg by mouth every 12 hours for 2 doses.',
  },
  {
    min: 30,
    minInclusive: true,
    max: 50,
    maxInclusive: false,
    doseAmount: 1000,
    doseUnit: 'mg',
    frequency: 'Twice daily (BID)',
    duration: 1,
    durationUnit: 'Days',
    totalDoses: 2,
    directions: 'Take 1000 mg by mouth every 12 hours for 2 doses.',
  },
  {
    min: 10,
    minInclusive: true,
    max: 30,
    maxInclusive: false,
    doseAmount: 500,
    doseUnit: 'mg',
    frequency: 'Twice daily (BID)',
    duration: 1,
    durationUnit: 'Days',
    totalDoses: 2,
    directions: 'Take 500 mg by mouth every 12 hours for 2 doses.',
  },
  {
    min: 0,
    minInclusive: true,
    max: 10,
    maxInclusive: false,
    doseAmount: 500,
    doseUnit: 'mg',
    frequency: 'Single dose',
    duration: 1,
    durationUnit: 'Days',
    totalDoses: 1,
    directions: 'Take 500 mg by mouth once.',
  },
];
