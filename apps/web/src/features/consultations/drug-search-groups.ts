import type { DrugSearchResult } from './medication-utils';
import { omitPlaceholderValue } from './medication-utils';

export type DrugBrandGroup = {
  key: string;
  brandName: string;
  genericName?: string;
  items: DrugSearchResult[];
};

export type GroupedDrugRow =
  | { kind: 'group'; group: DrugBrandGroup }
  | { kind: 'item'; group: DrugBrandGroup; item: DrugSearchResult; index: number };

function normalizeSpace(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function brandLabel(drug: DrugSearchResult): string {
  return (
    omitPlaceholderValue(drug.brandName) ||
    omitPlaceholderValue(drug.genericName) ||
    omitPlaceholderValue(drug.label) ||
    'Medication'
  );
}

/** Collapse manufacturer/DIN duplicates of the same brand + strength + form. */
export function drugVariantKey(drug: DrugSearchResult): string {
  const brand = brandLabel(drug).toLowerCase();
  const strength = normalizeSpace(omitPlaceholderValue(drug.strength)).toLowerCase();
  const form = normalizeSpace(omitPlaceholderValue(drug.dosageForm)).toLowerCase();
  if (strength || form) return `${brand}|${strength}|${form}`;
  return `${brand}|id:${drug.id}`;
}

export function collapseDrugSearchResults(results: DrugSearchResult[]): DrugSearchResult[] {
  const seen = new Set<string>();
  const out: DrugSearchResult[] = [];
  for (const result of results) {
    const key = drugVariantKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(result);
  }
  return out;
}

function strengthSortValue(strength?: string): number {
  if (!strength) return Number.POSITIVE_INFINITY;
  const n = Number.parseFloat(strength.replace(/,/g, ''));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function groupQueryScore(group: DrugBrandGroup, query: string): number {
  if (!query) return 0;
  const brand = group.brandName.toLowerCase();
  const generic = (group.genericName ?? '').toLowerCase();
  if (brand === query || generic === query) return 100;
  if (brand.startsWith(query) || generic.startsWith(query)) return 80;
  if (brand.includes(query) || generic.includes(query)) return 40;
  return 0;
}

/**
 * Group collapsed search hits by brand, with every distinct strength/form of
 * that brand listed before moving to the next brand.
 */
export function groupDrugSearchByBrand(
  results: DrugSearchResult[],
  query = '',
): DrugBrandGroup[] {
  const q = query.trim().toLowerCase();
  const order: string[] = [];
  const groups = new Map<
    string,
    { brandName: string; genericName?: string; seen: Set<string>; items: DrugSearchResult[] }
  >();

  for (const result of collapseDrugSearchResults(results)) {
    const brandName = brandLabel(result);
    const key = brandName.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      const generic = omitPlaceholderValue(result.genericName);
      group = {
        brandName,
        genericName:
          generic && generic.toLowerCase() !== brandName.toLowerCase() ? generic : undefined,
        seen: new Set(),
        items: [],
      };
      groups.set(key, group);
      order.push(key);
    } else if (!group.genericName) {
      const generic = omitPlaceholderValue(result.genericName);
      if (generic && generic.toLowerCase() !== group.brandName.toLowerCase()) {
        group.genericName = generic;
      }
    }

    const variant = drugVariantKey(result);
    if (group.seen.has(variant)) continue;
    group.seen.add(variant);
    group.items.push(result);
  }

  const list: DrugBrandGroup[] = order.map((key) => {
    const group = groups.get(key)!;
    return {
      key,
      brandName: group.brandName,
      genericName: group.genericName,
      items: [...group.items].sort((a, b) => {
        const na = strengthSortValue(a.strength);
        const nb = strengthSortValue(b.strength);
        if (na !== nb) return na - nb;
        return normalizeSpace(a.dosageForm).localeCompare(normalizeSpace(b.dosageForm));
      }),
    };
  });

  return list.sort((a, b) => {
    const scoreDiff = groupQueryScore(b, q) - groupQueryScore(a, q);
    if (scoreDiff !== 0) return scoreDiff;
    return order.indexOf(a.key) - order.indexOf(b.key);
  });
}

export function flattenDrugBrandGroups(groups: DrugBrandGroup[]): DrugSearchResult[] {
  return groups.flatMap((group) => group.items);
}

export function enumerateDrugBrandGroups(groups: DrugBrandGroup[]): GroupedDrugRow[] {
  const rows: GroupedDrugRow[] = [];
  let index = 0;
  for (const group of groups) {
    rows.push({ kind: 'group', group });
    for (const item of group.items) {
      rows.push({ kind: 'item', group, item, index });
      index += 1;
    }
  }
  return rows;
}

export function formatDrugStrengthOption(item: DrugSearchResult): {
  title: string;
  meta?: string;
} {
  const strength = normalizeSpace(omitPlaceholderValue(item.strength));
  const form = normalizeSpace(omitPlaceholderValue(item.dosageForm));
  const title = [strength, form].filter(Boolean).join(' · ');
  if (title) return { title };
  return { title: item.label || item.brandName || 'Medication' };
}
