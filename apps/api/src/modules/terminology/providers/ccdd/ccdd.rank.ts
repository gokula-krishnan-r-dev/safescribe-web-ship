import type { DrugSearchResult } from '../../drug-search.types';

function normalizeSpace(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function productVariantKey(item: DrugSearchResult): string {
  const brand = normalizeSpace(item.brandName || item.genericName).toLowerCase();
  const strength = normalizeSpace(item.strength).toLowerCase();
  const form = normalizeSpace(item.dosageForm).toLowerCase();
  if (brand && (strength || form)) return `${brand}|${strength}|${form}`;
  return item.id;
}

function conceptRank(item: DrugSearchResult): number {
  if (item.id.includes('-mp-')) return 2;
  if (item.id.includes('-ntp-')) return 1;
  return 0;
}

/**
 * Keep one representative product per brand + strength + form so search
 * returns distinct strengths instead of every manufacturer DIN.
 */
export function collapseEquivalentProducts<T extends { item: DrugSearchResult; score: number }>(
  scored: T[],
): T[] {
  const best = new Map<string, T>();
  const order: string[] = [];

  for (const entry of scored) {
    const key = productVariantKey(entry.item);
    const existing = best.get(key);
    if (!existing) {
      best.set(key, entry);
      order.push(key);
      continue;
    }
    if (entry.score > existing.score) {
      best.set(key, entry);
      continue;
    }
    if (entry.score === existing.score && conceptRank(entry.item) > conceptRank(existing.item)) {
      best.set(key, entry);
    }
  }

  return order.map((key) => best.get(key)!);
}
