import { Injectable, Logger } from '@nestjs/common';
import {
  DrugSearchPurpose,
  DrugSearchResult,
} from './drug-search.types';
import { DrugSearchRegistry } from './providers/drug-search.registry';

/**
 * Orchestrates drug terminology search via the active {@link DrugSearchProvider}.
 * External APIs (CCDD today; others later) plug in through the registry —
 * this service stays stable for controllers and callers.
 */
@Injectable()
export class TerminologyService {
  private readonly logger = new Logger(TerminologyService.name);

  constructor(private readonly registry: DrugSearchRegistry) {}

  async searchDrugs(
    query: string,
    limit = 12,
    purpose: DrugSearchPurpose = 'medication',
  ): Promise<DrugSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const provider = this.registry.getActive();
    try {
      return await provider.search(q, { limit, purpose });
    } catch (err) {
      this.logger.warn(`${provider.id} search failed`, err);
      return [];
    }
  }

  /** Same as searchDrugs, but catalogue failures propagate to the caller. */
  async searchDrugsStrict(
    query: string,
    limit = 12,
    purpose: DrugSearchPurpose = 'medication',
  ): Promise<DrugSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    return this.registry.getActive().search(q, { limit, purpose });
  }

  /** Resolve a free-text drug name (from AI transcript) to best terminology match */
  async resolveDrugName(
    name: string,
    purpose: DrugSearchPurpose = 'allergy',
  ): Promise<DrugSearchResult | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const provider = this.registry.getActive();
    try {
      if (provider.resolve) {
        const resolved = await provider.resolve(trimmed, purpose);
        if (resolved) return resolved;
      } else {
        const results = await provider.search(trimmed, { limit: 3, purpose });
        if (results.length) return results[0];
      }
    } catch (err) {
      this.logger.warn(`${provider.id} resolve failed for "${trimmed}"`, err);
    }

    // Uncoded free-text fallback so AI prefill still works offline / on miss
    return {
      id: `text-${trimmed.toLowerCase().replace(/\s+/g, '-')}`,
      brandName: trimmed,
      label: trimmed,
      source: 'manual',
    };
  }

  async resolveDrugNames(
    names: string[],
    purpose: DrugSearchPurpose = 'allergy',
  ): Promise<DrugSearchResult[]> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    const resolved = await Promise.all(unique.map((n) => this.resolveDrugName(n, purpose)));
    return resolved.filter((r): r is DrugSearchResult => r != null);
  }

  getActiveProviderMeta(): { id: string; displayName: string } {
    const p = this.registry.getActive();
    return { id: p.id, displayName: p.displayName };
  }
}
