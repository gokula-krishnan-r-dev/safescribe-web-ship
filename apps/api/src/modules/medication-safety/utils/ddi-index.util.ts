import { normalizeDrugKey } from './drug-name.util';
import type { CachedSafetyRule } from '../medication-safety.types';

export interface DdiRuleEntry {
  rule: CachedSafetyRule;
  drugA: string;
  drugB: string;
}

/** Bidirectional pair key for deduplication. */
export function ddiPairKey(drugA: string, drugB: string): string {
  const [a, b] = [normalizeDrugKey(drugA), normalizeDrugKey(drugB)].sort();
  return `${a}|${b}`;
}

/**
 * Build an index: normalized drug token -> DDI rules touching that drug.
 * Enables O(tokens × rules_per_drug) instead of O(all_rules × all_med_pairs).
 */
export function buildDdiIndex(rules: CachedSafetyRule[]): Map<string, DdiRuleEntry[]> {
  const index = new Map<string, DdiRuleEntry[]>();

  for (const rule of rules) {
    if (rule.ruleType !== 'DRUG_INTERACTION' || !rule.ddiDetail) continue;
    const entry: DdiRuleEntry = {
      rule,
      drugA: normalizeDrugKey(rule.ddiDetail.drugA),
      drugB: normalizeDrugKey(rule.ddiDetail.drugB),
    };
    for (const drug of [entry.drugA, entry.drugB]) {
      if (!drug) continue;
      const list = index.get(drug) ?? [];
      list.push(entry);
      index.set(drug, list);
    }
  }

  return index;
}
