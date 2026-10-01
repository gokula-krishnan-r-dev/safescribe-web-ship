export type QuickAddSource = 'frequent' | 'condition';

export interface QuickAddMedication {
  medicationId: string;
  clinicalDrugConceptId: string;
  displayName: string;
  strengthLabel?: string;
  dosageFormLabel?: string;
  genericName?: string;
  terminologySource?: string;
  rxcui?: string;
  ndc?: string;
  source: QuickAddSource;
  usageCount?: number;
  lastUsedAt?: string;
}

export interface RankedUsageRow {
  clinicalDrugConceptId: string;
  medicationId: string;
  displayName: string;
  strengthLabel?: string | null;
  dosageFormLabel?: string | null;
  genericName?: string | null;
  terminologySource?: string | null;
  rxcui?: string | null;
  ndc?: string | null;
  usageCount: number;
  lastUsedAt: Date;
}

export interface ExclusionKeys {
  conceptIds: Set<string>;
  names: Set<string>;
}

const PLACEHOLDER_RE =
  /^(unknown(?:\s+dose)?|n\/a|n\.a\.|na|unspecified|not specified|none|null|-)$/i;

export function normalizeConceptKey(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeMedicationName(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isResolvableConceptId(value?: string | null): boolean {
  const key = normalizeConceptKey(value);
  return key.length >= 2 && !PLACEHOLDER_RE.test(key);
}

export function clampQuickAddLimit(limit?: number, fallback = 3): number {
  if (!Number.isFinite(limit) || limit == null) return fallback;
  return Math.min(20, Math.max(1, Math.trunc(limit)));
}

function optionalLabel(value?: string | null): string | undefined {
  const t = value?.trim();
  if (!t || PLACEHOLDER_RE.test(t)) return undefined;
  return t;
}

export function toQuickAddMedication(
  row: RankedUsageRow,
  source: QuickAddSource,
): QuickAddMedication {
  return {
    medicationId: row.medicationId,
    clinicalDrugConceptId: row.clinicalDrugConceptId,
    displayName: row.displayName,
    strengthLabel: optionalLabel(row.strengthLabel),
    dosageFormLabel: optionalLabel(row.dosageFormLabel),
    genericName: optionalLabel(row.genericName),
    terminologySource: optionalLabel(row.terminologySource) ?? 'ccdd',
    rxcui: optionalLabel(row.rxcui),
    ndc: optionalLabel(row.ndc),
    source,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

export function sortRankedUsage(rows: RankedUsageRow[]): RankedUsageRow[] {
  return [...rows].sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
  });
}

function collectKeysFromUnknown(value: unknown, keys: ExclusionKeys) {
  if (!value || typeof value !== 'object') return;
  const rec = value as Record<string, unknown>;
  const concept =
    rec.clinicalDrugConceptId ??
    rec.drugId ??
    rec.medicationId ??
    (rec.medicationCode && typeof rec.medicationCode === 'object'
      ? (rec.medicationCode as Record<string, unknown>).code
      : undefined);
  if (typeof concept === 'string' && isResolvableConceptId(concept)) {
    keys.conceptIds.add(normalizeConceptKey(concept));
  }
  const metadata = rec.metadata;
  if (metadata && typeof metadata === 'object') {
    const meta = metadata as Record<string, unknown>;
    for (const field of ['drugId', 'medicationId', 'clinicalDrugConceptId', 'ccddId', 'ntpId']) {
      const v = meta[field];
      if (typeof v === 'string' && isResolvableConceptId(v)) {
        keys.conceptIds.add(normalizeConceptKey(v));
      }
    }
  }
  const name = rec.medicationName ?? rec.displayName ?? rec.genericName ?? rec.brandName;
  if (typeof name === 'string' && name.trim()) {
    keys.names.add(normalizeMedicationName(name));
  }
}

export function collectExclusionKeys(sources: unknown[]): ExclusionKeys {
  const keys: ExclusionKeys = { conceptIds: new Set(), names: new Set() };
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const item of source) collectKeysFromUnknown(item, keys);
      continue;
    }
    collectKeysFromUnknown(source, keys);
  }
  return keys;
}

export function treatmentPlanCatalog(plan: unknown): unknown[] {
  if (!plan || typeof plan !== 'object') return [];
  const rec = plan as Record<string, unknown>;
  const recommended = rec.recommendedTreatments;
  return Array.isArray(recommended) ? recommended : [];
}

export function isExcludedMedication(
  item: Pick<QuickAddMedication, 'clinicalDrugConceptId' | 'medicationId' | 'displayName'>,
  excluded: ExclusionKeys,
): boolean {
  const concept = normalizeConceptKey(item.clinicalDrugConceptId || item.medicationId);
  if (concept && excluded.conceptIds.has(concept)) return true;
  const name = normalizeMedicationName(item.displayName);
  return Boolean(name && excluded.names.has(name));
}

export function filterExcludedAndDedup(
  items: QuickAddMedication[],
  excluded: ExclusionKeys,
): QuickAddMedication[] {
  const seen = new Set<string>();
  const out: QuickAddMedication[] = [];
  for (const item of items) {
    if (!isResolvableConceptId(item.clinicalDrugConceptId) && !isResolvableConceptId(item.medicationId)) {
      continue;
    }
    if (isExcludedMedication(item, excluded)) continue;
    const key = normalizeConceptKey(item.clinicalDrugConceptId || item.medicationId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function mergeExclusionKeys(a: ExclusionKeys, b: ExclusionKeys): ExclusionKeys {
  return {
    conceptIds: new Set([...a.conceptIds, ...b.conceptIds]),
    names: new Set([...a.names, ...b.names]),
  };
}
