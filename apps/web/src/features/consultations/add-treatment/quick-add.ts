import type { DrugSearchResult } from '../medication-utils';
import { sanitizeDrugSearchResult } from '../medication-utils';

export type AddTreatmentView =
  | 'picker'
  | 'standard-medication-editor'
  | 'compound-editor'
  | 'device-editor';

export type QuickAddSource = 'frequent' | 'condition';
export type MedicationSelectionSource = QuickAddSource | 'search';

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

export interface QuickAddResponse {
  items: QuickAddMedication[];
  total: number;
  pathwayId?: string;
  generatedAt: string;
}

export function normalizeQuickAddKey(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeQuickAddName(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isExcludedQuickAddItem(
  item: QuickAddMedication,
  excludedIds: Iterable<string>,
  excludedNames: Iterable<string>,
): boolean {
  const ids = new Set([...excludedIds].map(normalizeQuickAddKey).filter(Boolean));
  const names = new Set([...excludedNames].map(normalizeQuickAddName).filter(Boolean));
  const concept = normalizeQuickAddKey(item.clinicalDrugConceptId || item.medicationId);
  if (concept && ids.has(concept)) return true;
  return names.has(normalizeQuickAddName(item.displayName));
}

export function filterQuickAddItems(
  items: QuickAddMedication[] | undefined,
  excludedIds: Iterable<string>,
  excludedNames: Iterable<string>,
): QuickAddMedication[] {
  const seen = new Set<string>();
  const out: QuickAddMedication[] = [];
  for (const item of items ?? []) {
    const key = normalizeQuickAddKey(item.clinicalDrugConceptId || item.medicationId);
    if (!key || seen.has(key)) continue;
    if (isExcludedQuickAddItem(item, excludedIds, excludedNames)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function quickAddSecondaryText(item: QuickAddMedication): string {
  return [item.strengthLabel, item.dosageFormLabel].filter(Boolean).join(' · ');
}

export interface RecordQuickAddUsageInput {
  medicationId: string;
  clinicalDrugConceptId: string;
  displayName: string;
  strengthLabel?: string;
  dosageFormLabel?: string;
  genericName?: string;
  terminologySource?: string;
  rxcui?: string;
  ndc?: string;
  selectionSource: MedicationSelectionSource;
}

export function quickAddToDrugSearchResult(item: QuickAddMedication): DrugSearchResult {
  const source =
    item.terminologySource === 'rxnorm' ||
    item.terminologySource === 'openfda' ||
    item.terminologySource === 'ccdd'
      ? item.terminologySource
      : 'ccdd';
  return sanitizeDrugSearchResult({
    id: item.medicationId,
    brandName: item.displayName,
    genericName: item.genericName,
    strength: item.strengthLabel,
    dosageForm: item.dosageFormLabel,
    label: item.displayName,
    source,
    rxcui: item.rxcui,
    ndc: item.ndc,
  });
}

export function drugSearchToUsageInput(
  drug: DrugSearchResult,
  selectionSource: MedicationSelectionSource,
): RecordQuickAddUsageInput {
  const displayName = drug.brandName || drug.genericName || drug.label;
  return {
    medicationId: drug.id,
    clinicalDrugConceptId: drug.id,
    displayName,
    strengthLabel: drug.strength,
    dosageFormLabel: drug.dosageForm,
    genericName: drug.genericName,
    terminologySource: drug.source,
    rxcui: drug.rxcui,
    ndc: drug.ndc,
    selectionSource,
  };
}
