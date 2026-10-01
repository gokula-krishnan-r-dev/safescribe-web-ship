import { CLINICAL_REFERENCE_MASTER } from '@safescript/shared';

export const REFERENCE_AUDIT_MODULE = 'clinical-reference';

export const KNOWN_UNITS = new Set(
  [
    ...CLINICAL_REFERENCE_MASTER.references.map((row) => row.unit),
    ...CLINICAL_REFERENCE_MASTER.targets.map((row) => row.unit),
    'mmHg',
    'mmol/L',
    'µmol/L',
    'umol/L',
    'mL/min/1.73m²',
    'mL/min',
    'g/L',
    'mg/L',
    'ng/mL',
    'nmol/L',
    'pmol/L',
    'IU/L',
    'U/L',
    'x10^9/L',
    'x10⁹/L',
    '%',
    'bpm',
    'kg',
    'cm',
    'years',
    'weeks',
  ].filter((unit): unit is string => Boolean(unit)),
);

export const KNOWN_INPUT_CODES = new Set(
  [
    ...CLINICAL_REFERENCE_MASTER.references.map((row) => row.inputCode),
    ...CLINICAL_REFERENCE_MASTER.targets.map((row) => row.inputCode),
    ...CLINICAL_REFERENCE_MASTER.pediatric.map((row) => row.inputCode),
  ].filter(Boolean),
);

const MEDICATION_SPECIFIC_STRATEGIES = new Set([
  'SAFETY_ENGINE',
  'MEDICATION_SPECIFIC_IF_ANTICOAGULATED',
  'MEDICATION_OR_CONTEXT_SPECIFIC',
]);

export type PublishIssue = {
  code: string;
  message: string;
  recordKey?: string;
};

export function inferSourceType(sourceCode: string): string {
  switch (sourceCode) {
    case 'LAB_RESULT':
    case 'PROV_LAB':
      return 'LABORATORY';
    case 'MCC_ADULT':
    case 'CALIPER_PED':
      return 'REFERENCE_TABLE';
    case 'HC_MONOGRAPH':
      return 'PRODUCT_MONOGRAPH';
    case 'SAFETY_ENGINE':
    case 'NONE':
      return 'OTHER';
    default:
      return 'GUIDELINE';
  }
}

export function strategyBadge(strategy: string, sourceCode?: string | null): string {
  if (sourceCode === 'MCC_ADULT' || (strategy === 'STATIC_REFERENCE' && sourceCode?.includes('MCC'))) {
    return 'Adult fallback';
  }
  if (strategy === 'LAB_SOURCE_FIRST' || strategy === 'LAB_SOURCE_OR_GENERAL' || strategy === 'ACTUAL_LAB_FIRST') {
    return 'Lab interval first';
  }
  if (MEDICATION_SPECIFIC_STRATEGIES.has(strategy)) {
    return 'Medication-specific';
  }
  if (strategy.startsWith('GUIDELINE_TARGET')) {
    return 'Treatment target';
  }
  if (strategy === 'CALIPER_DYNAMIC' || strategy === 'CALIPER_DYNAMIC_IF_AVAILABLE') {
    return 'Pediatric dynamic';
  }
  if (strategy === 'NONE' || strategy === 'NO_REFERENCE_VALUE' || strategy === 'NO_AUTOMATIC_REFERENCE') {
    return 'No static reference';
  }
  return strategy.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase());
}

export function formatReferenceDisplay(row: {
  displayText?: string | null;
  lowerNumeric?: number | null;
  upperNumeric?: number | null;
  operator?: string | null;
  targetValue?: string | number | null;
  unit?: string | null;
}): string {
  if (row.displayText?.trim()) return row.displayText.trim();
  if (row.lowerNumeric != null && row.upperNumeric != null) {
    return `${row.lowerNumeric}–${row.upperNumeric}${row.unit ? ` ${row.unit}` : ''}`;
  }
  if (row.operator && row.targetValue != null && row.targetValue !== '') {
    return `${row.operator}${row.targetValue}${row.unit ? ` ${row.unit}` : ''}`;
  }
  if (row.upperNumeric != null) {
    return `≤${row.upperNumeric}${row.unit ? ` ` + row.unit : ''}`;
  }
  if (row.lowerNumeric != null) {
    return `≥${row.lowerNumeric}${row.unit ? ` ` + row.unit : ''}`;
  }
  return '—';
}

export function stringifyTarget(value: number | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

export function nextReleaseId(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `REFERENCE_RELEASE_${yyyy}_${mm}_${dd}`;
}

export function canonicalFingerprint(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((part) => (part == null ? '' : String(part).trim())).join('|');
}

export function valueFingerprint(row: {
  inputCode: string;
  label: string;
  category?: string | null;
  population: string;
  sex: string;
  context?: string | null;
  referenceStrategy: string;
  referenceKind: string;
  uiUse?: string | null;
  lowerNumeric?: number | null;
  upperNumeric?: number | null;
  operator?: string | null;
  targetValue?: string | null;
  unit?: string | null;
  displayText?: string | null;
  sourceCode?: string | null;
  sourcePriority?: number | null;
  notes?: string | null;
}): string {
  return canonicalFingerprint([
    row.inputCode,
    row.label,
    row.category,
    row.population,
    row.sex,
    row.context,
    row.referenceStrategy,
    row.referenceKind,
    row.uiUse,
    row.lowerNumeric,
    row.upperNumeric,
    row.operator,
    row.targetValue,
    row.unit,
    row.displayText,
    row.sourceCode,
    row.sourcePriority,
    row.notes,
  ]);
}

export function requiresStaticSource(row: {
  referenceStrategy: string;
  referenceKind: string;
  uiUse?: string | null;
  displayText?: string | null;
  lowerNumeric?: number | null;
  upperNumeric?: number | null;
  sourceCode?: string | null;
}): boolean {
  if (row.uiUse?.includes('FALLBACK')) return true;
  if (row.referenceStrategy === 'STATIC_REFERENCE') return true;
  if (row.referenceKind === 'TREATMENT_TARGET' || row.referenceKind === 'THERAPEUTIC_TARGET') return true;
  if (row.lowerNumeric != null || row.upperNumeric != null || row.displayText) return true;
  return false;
}

export function validatePublishSet(input: {
  values: Array<{
    referenceId: string;
    inputCode: string;
    referenceStrategy: string;
    referenceKind: string;
    uiUse?: string | null;
    displayText?: string | null;
    lowerNumeric?: number | null;
    upperNumeric?: number | null;
    sourceCode?: string | null;
    unit?: string | null;
    sourcePriority?: number | null;
  }>;
  targets: Array<{
    targetId: string;
    inputCode: string;
    sourceCode: string;
    unit?: string | null;
  }>;
  pediatric: Array<{
    inputCode: string;
    adultFallbackAllowed: boolean;
  }>;
  sources: Array<{
    sourceCode: string;
    status: string;
  }>;
  knownInputCodes?: Set<string>;
}): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const sourceByCode = new Map(input.sources.map((row) => [row.sourceCode, row]));
  const inputCodes = input.knownInputCodes ?? KNOWN_INPUT_CODES;

  const activeSource = (code: string | null | undefined) => {
    if (!code) return null;
    const source = sourceByCode.get(code);
    if (!source) return { missing: true, archived: false };
    return { missing: false, archived: source.status === 'ARCHIVED' };
  };

  for (const row of input.values) {
    if (!inputCodes.has(row.inputCode)) {
      issues.push({
        code: 'UNKNOWN_INPUT_CODE',
        message: `Reference ${row.referenceId} uses unknown input code ${row.inputCode}.`,
        recordKey: row.referenceId,
      });
    }
    if (row.unit && !KNOWN_UNITS.has(row.unit)) {
      issues.push({
        code: 'INVALID_UNIT',
        message: `Reference ${row.referenceId} has an unrecognized unit (${row.unit}).`,
        recordKey: row.referenceId,
      });
    }
    if (requiresStaticSource(row)) {
      const source = activeSource(row.sourceCode);
      if (!row.sourceCode || source?.missing) {
        issues.push({
          code: 'MISSING_SOURCE',
          message: `Reference ${row.referenceId} requires a valid source before publication.`,
          recordKey: row.referenceId,
        });
      } else if (source?.archived) {
        issues.push({
          code: 'ARCHIVED_SOURCE',
          message: `Reference ${row.referenceId} points to an archived source (${row.sourceCode}).`,
          recordKey: row.referenceId,
        });
      }
    }
    if (
      row.referenceKind === 'GENERAL_REFERENCE' &&
      MEDICATION_SPECIFIC_STRATEGIES.has(row.referenceStrategy) &&
      (row.lowerNumeric != null || row.upperNumeric != null)
    ) {
      issues.push({
        code: 'MEDICATION_THRESHOLD_AS_GENERIC',
        message: `Reference ${row.referenceId} looks like an executable medication threshold classified as a generic range.`,
        recordKey: row.referenceId,
      });
    }
  }

  const priorityKeys = new Map<string, string[]>();
  for (const row of input.values) {
    if (row.sourcePriority == null || !row.sourceCode) continue;
    const key = `${row.inputCode}:${row.sourcePriority}`;
    const existing = priorityKeys.get(key) ?? [];
    existing.push(row.referenceId);
    priorityKeys.set(key, existing);
  }
  for (const [key, ids] of priorityKeys) {
    if (ids.length > 1) {
      issues.push({
        code: 'DUPLICATE_SOURCE_PRIORITY',
        message: `Duplicate source priority ${key} on ${ids.join(', ')}.`,
        recordKey: ids[0],
      });
    }
  }

  for (const row of input.targets) {
    if (!inputCodes.has(row.inputCode)) {
      issues.push({
        code: 'UNKNOWN_INPUT_CODE',
        message: `Target ${row.targetId} uses unknown input code ${row.inputCode}.`,
        recordKey: row.targetId,
      });
    }
    if (row.unit && !KNOWN_UNITS.has(row.unit)) {
      issues.push({
        code: 'INVALID_UNIT',
        message: `Target ${row.targetId} has an unrecognized unit (${row.unit}).`,
        recordKey: row.targetId,
      });
    }
    const source = activeSource(row.sourceCode);
    if (!row.sourceCode || source?.missing) {
      issues.push({
        code: 'MISSING_SOURCE',
        message: `Target ${row.targetId} requires a valid source before publication.`,
        recordKey: row.targetId,
      });
    } else if (source?.archived) {
      issues.push({
        code: 'ARCHIVED_SOURCE',
        message: `Target ${row.targetId} points to an archived source (${row.sourceCode}).`,
        recordKey: row.targetId,
      });
    }
  }

  for (const row of input.pediatric) {
    if (row.adultFallbackAllowed) {
      issues.push({
        code: 'PEDIATRIC_ADULT_FALLBACK',
        message: `Pediatric policy for ${row.inputCode} must not allow adult fallback.`,
        recordKey: row.inputCode,
      });
    }
  }

  return issues;
}

export function pickWorkingRecord<T extends { status: string; versionNumber: number }>(
  rows: T[],
): T | null {
  if (!rows.length) return null;
  const byStatus = (status: string) =>
    rows
      .filter((row) => row.status === status)
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return (
    byStatus('DRAFT') ??
    byStatus('IN_REVIEW') ??
    byStatus('PUBLISHED') ??
    byStatus('ACTIVE') ??
    rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0]
  );
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const total = items.length;
  const start = (safePage - 1) * safeLimit;
  return {
    data: items.slice(start, start + safeLimit),
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export function matchesSearch(haystacks: Array<string | null | undefined>, search?: string): boolean {
  if (!search?.trim()) return true;
  const needle = search.trim().toLowerCase();
  return haystacks.some((value) => value?.toLowerCase().includes(needle));
}
