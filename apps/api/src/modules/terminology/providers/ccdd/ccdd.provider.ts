import { Injectable, Logger } from '@nestjs/common';
import {
  DrugSearchOptions,
  DrugSearchProvider,
  DrugSearchPurpose,
  DrugSearchResult,
} from '../../drug-search.types';
import { DrugSearchCache } from '../../cache/drug-search.cache';
import {
  CCDD_PROVIDER_DISPLAY,
  CCDD_PROVIDER_ID,
  CCDD_VALUE_SETS,
  type CcdDConceptType,
} from './ccdd.constants';
import { CcdDAuthService } from './ccdd.auth';
import { CcdDFhirClient, type FhirCoding } from './ccdd.client';
import { CcdDEnricher } from './ccdd.enricher';
import {
  parseMpDisplay,
  parseNtpDisplay,
  parseTmDisplay,
  scoreCcdDResult,
  scoreClinicalRelevance,
  formatGenericDisplay,
  omitPlaceholderValue,
} from './ccdd.parser';
import { collapseEquivalentProducts } from './ccdd.rank';

const SEARCH_CACHE_TTL_SECONDS = 600; // 10 minutes

/**
 * Canadian Clinical Drug Data Set (CCDD) via Infoway FHIR Terminology Server,
 * enriched with SNOMED CT CA (class) + CCDD MP (brand) for the
 * "generic · Brand / class" autocomplete layout.
 */
@Injectable()
export class CcdDDrugSearchProvider implements DrugSearchProvider {
  readonly id = CCDD_PROVIDER_ID;
  readonly displayName = CCDD_PROVIDER_DISPLAY;

  private readonly logger = new Logger(CcdDDrugSearchProvider.name);

  constructor(
    private readonly auth: CcdDAuthService,
    private readonly fhir: CcdDFhirClient,
    private readonly enricher: CcdDEnricher,
    private readonly cache: DrugSearchCache,
  ) {}

  async search(query: string, options: DrugSearchOptions = {}): Promise<DrugSearchResult[]> {
    const q = query.trim();
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);
    const purpose = options.purpose ?? 'medication';

    if (q.length < 2) return [];
    if (!this.auth.credentialsConfigured) {
      this.logger.error('CCDD credentials missing — configure INFOWAY_CLIENT_ID / INFOWAY_CLIENT_SECRET');
      return [];
    }

    const cacheKey = `drug-search:ccdd:v12:${purpose}:${q.toLowerCase()}:${limit}`;
    const cached = await this.cache.getJson<DrugSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const results =
        purpose === 'allergy'
          ? await this.searchAllergy(q, limit)
          : await this.searchMedication(q, limit);

      await this.cache.setJson(cacheKey, results, SEARCH_CACHE_TTL_SECONDS);
      return results;
    } catch (err) {
      this.logger.warn(`CCDD search failed for "${q}"`, err);
      return [];
    }
  }

  async resolve(name: string, purpose: DrugSearchPurpose = 'allergy'): Promise<DrugSearchResult | null> {
    const trimmed = name.trim();
    const looksLikeSubstance = !/\d/.test(trimmed);
    // Current-med list from a transcript usually has no strength — prefer TM
    // so we don't pin a random DIN / manufacturer (often the literal "Unknown").
    if (purpose === 'medication' && looksLikeSubstance) {
      const tm = await this.search(trimmed, { limit: 5, purpose: 'allergy' });
      if (tm.length) return this.pickBest(trimmed, tm);
    }

    const primary: DrugSearchPurpose = purpose === 'medication' ? 'medication' : 'allergy';
    const fallback: DrugSearchPurpose = primary === 'allergy' ? 'medication' : 'allergy';
    const results = await this.search(trimmed, { limit: 5, purpose: primary });
    if (!results.length) {
      const alt = await this.search(trimmed, { limit: 5, purpose: fallback });
      if (!alt.length) return null;
      return this.pickBest(trimmed, alt);
    }
    return this.pickBest(trimmed, results);
  }

  private async searchAllergy(query: string, limit: number): Promise<DrugSearchResult[]> {
    // Fetch extra TM hits so we can re-rank for clinician-friendly order
    const fetchLimit = Math.min(Math.max(limit * 3, 18), 30);
    let concepts = await this.expand('tm', query, fetchLimit);
    let type: CcdDConceptType = 'tm';

    if (!concepts.length) {
      concepts = await this.expand('ntp', query, fetchLimit);
      type = 'ntp';
    }
    if (!concepts.length) {
      concepts = await this.expand('mp', query, fetchLimit);
      type = 'mp';
    }

    const mapped = concepts.map((c) => this.mapConcept(c, type));
    const ranked = this.dedupeRank(query, mapped, fetchLimit);

    const seenNames = new Set<string>();
    const unique: DrugSearchResult[] = [];
    for (const item of ranked) {
      const key = (item.genericName || item.brandName || item.label).toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      unique.push({
        ...item,
        genericName: formatGenericDisplay(item.genericName) ?? item.genericName,
        strength: undefined,
        dosageForm: undefined,
        manufacturer: undefined,
      });
      if (unique.length >= fetchLimit) break;
    }

    const enriched = await this.applyEnrichment(unique);
    return this.rankForClinician(query, enriched, limit);
  }

  private async searchMedication(query: string, limit: number): Promise<DrugSearchResult[]> {
    const fetchCount = Math.min(Math.max(limit * 2, 24), 40);
    const shortQuery = query.length <= 3;

    // Treatment pickers need strength — pull MP/NTP first. TM is fallback only.
    const [mp, ntp, tm] = await Promise.all([
      this.expand('mp', query, shortQuery ? Math.min(12, fetchCount) : fetchCount),
      this.expand('ntp', query, shortQuery ? 10 : Math.min(fetchCount, 18)),
      this.expand('tm', query, shortQuery ? Math.min(6, limit) : Math.min(4, limit)),
    ]);

    const mapped = [
      ...mp.map((c) => this.mapConcept(c, 'mp')),
      ...ntp.map((c) => this.mapConcept(c, 'ntp')),
      ...tm.map((c) => this.mapConcept(c, 'tm')),
    ].filter((item) => !this.isNoisyShortMatch(query, item));

    // Prefer coded products with strength; keep TM only when no strength hits exist
    const withStrength = mapped.filter((i) => Boolean(i.strength?.trim()));
    const withoutStrength = mapped.filter((i) => !i.strength?.trim());
    const pool = withStrength.length
      ? [...withStrength, ...withoutStrength.filter((i) => !i.id.includes('-tm-'))]
      : mapped;

    const ranked = this.dedupeRank(query, pool, Math.min(fetchCount, 40), false);
    const enriched = await this.applyEnrichment(ranked);
    const finalized = this.preferStrengthVariants(enriched);
    return shortQuery
      ? this.rankForClinician(query, finalized, limit)
      : finalized.slice(0, limit);
  }

  /**
   * For treatment search: surface distinct strength/form variants ahead of
   * bare substance rows so pharmacists can pick the correct product.
   */
  private preferStrengthVariants(items: DrugSearchResult[]): DrugSearchResult[] {
    return [...items].sort((a, b) => {
      const aHas = a.strength?.trim() ? 1 : 0;
      const bHas = b.strength?.trim() ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;

      const aMp = a.id.includes('-mp-') ? 2 : a.id.includes('-ntp-') ? 1 : 0;
      const bMp = b.id.includes('-mp-') ? 2 : b.id.includes('-ntp-') ? 1 : 0;
      return bMp - aMp;
    });
  }

  /** Doctor-friendly order: common Canadian substances with brand + short class first */
  private rankForClinician(
    query: string,
    items: DrugSearchResult[],
    limit: number,
  ): DrugSearchResult[] {
    return [...items]
      .sort((a, b) => scoreClinicalRelevance(query, b) - scoreClinicalRelevance(query, a))
      .slice(0, limit);
  }

  /**
   * Attach brand (CCDD MP) + drug class (SNOMED CT CA) so UI can show:
   *   valacyclovir · Valtrex
   *   antiviral
   */
  private async applyEnrichment(items: DrugSearchResult[]): Promise<DrugSearchResult[]> {
    const needsEnrich = items.filter(
      (i) => i.id.includes('-tm-') || !i.drugClass || i.drugClass.startsWith('Manufactured') || i.drugClass.startsWith('Non-proprietary') || i.drugClass.startsWith('Therapeutic'),
    );
    if (!needsEnrich.length) return items.map((i) => this.finalizeLabel(i));

    const generics = needsEnrich
      .map((i) => i.genericName || i.brandName)
      .filter((g): g is string => Boolean(g));

    const enriched = await this.enricher.enrichMany(generics);

    return items.map((item) => {
      const key = (item.genericName || item.brandName || '').toLowerCase();
      const extra = enriched.get(key);
      if (!extra) return this.finalizeLabel(item);

      const isTm = item.id.includes('-tm-');
      const brandFromMp = extra.brandName;
      const generic = item.genericName || (isTm ? item.brandName : item.genericName);

      // For TM rows: only keep a distinctive trade name; never duplicate the generic
      let brandName = item.brandName;
      if (isTm) {
        brandName = brandFromMp || generic || item.brandName;
        if (
          brandName &&
          generic &&
          brandName.toLowerCase() === generic.toLowerCase()
        ) {
          brandName = generic;
        }
      } else if (
        brandFromMp &&
        (!item.brandName || item.brandName.toLowerCase() === (generic ?? '').toLowerCase())
      ) {
        brandName = brandFromMp;
      }

      const structuralClass =
        item.drugClass &&
        !/^(Manufactured product|Non-proprietary product|Therapeutic moiety)$/i.test(item.drugClass)
          ? item.drugClass
          : undefined;

      return this.finalizeLabel({
        ...item,
        genericName: generic,
        brandName: brandName || generic || item.brandName,
        drugClass: extra.drugClass || structuralClass,
        strength: isTm ? undefined : item.strength,
        dosageForm: isTm ? undefined : item.dosageForm,
        manufacturer: isTm ? undefined : item.manufacturer,
      });
    });
  }

  private finalizeLabel(item: DrugSearchResult): DrugSearchResult {
    const generic = formatGenericDisplay(item.genericName) ?? omitPlaceholderValue(item.genericName);
    const brand = omitPlaceholderValue(item.brandName);
    const same = generic && brand && generic.toLowerCase() === brand.toLowerCase();

    const label =
      generic && brand && !same ? `${generic} · ${brand}` : generic || brand || item.label;

    return {
      ...item,
      genericName: generic,
      brandName: same ? generic! : brand || generic || item.brandName,
      label,
      manufacturer: omitPlaceholderValue(item.manufacturer),
      strength: omitPlaceholderValue(item.strength),
      dosageForm: omitPlaceholderValue(item.dosageForm),
      drugClass: omitPlaceholderValue(item.drugClass),
    };
  }

  private isNoisyShortMatch(query: string, item: DrugSearchResult): boolean {
    if (query.length > 3) return false;
    if (item.id.includes('-tm-')) return false;

    const q = query.toLowerCase();
    const brand = item.brandName.toLowerCase();
    const generic = (item.genericName ?? '').toLowerCase();
    const nameHit =
      brand.startsWith(q) ||
      generic.startsWith(q) ||
      brand.split(/[\s\-/]+/).some((t) => t.startsWith(q)) ||
      generic.split(/[\s\-/]+/).some((t) => t.startsWith(q));

    return !nameHit;
  }

  private async expand(type: CcdDConceptType, filter: string, count: number): Promise<FhirCoding[]> {
    return this.fhir.expandValueSet(CCDD_VALUE_SETS[type], filter, count);
  }

  private mapConcept(coding: FhirCoding, type: CcdDConceptType): DrugSearchResult {
    const code = coding.code!;
    const display = coding.display!.trim();

    const parsed =
      type === 'mp'
        ? parseMpDisplay(display)
        : type === 'ntp'
          ? parseNtpDisplay(display)
          : parseTmDisplay(display);

    const typeLabel =
      type === 'mp' ? 'Manufactured product' : type === 'ntp' ? 'Non-proprietary product' : 'Therapeutic moiety';

    const codeDisplay =
      type === 'mp' ? `DIN: ${code}` : type === 'ntp' ? `NTP: ${code}` : `TM: ${code}`;

    return {
      id: `ccdd-${type}-${code}`,
      brandName: parsed.brandName || display,
      genericName: parsed.genericName,
      strength: parsed.strength,
      dosageForm: parsed.dosageForm,
      manufacturer: parsed.manufacturer,
      drugClass: typeLabel,
      label: parsed.label || display,
      source: this.id,
      ndc: type === 'mp' ? code : undefined,
      codeDisplay,
    };
  }

  private dedupeRank(
    query: string,
    items: DrugSearchResult[],
    limit: number,
    preferTm = false,
  ): DrugSearchResult[] {
    const seen = new Set<string>();
    const scored: Array<{ item: DrugSearchResult; score: number }> = [];

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);

      const type = item.id.includes('-mp-') ? 'mp' : item.id.includes('-ntp-') ? 'ntp' : 'tm';
      let score = scoreCcdDResult(query, item.brandName, item.genericName, type);
      if (preferTm && type === 'tm') score += 40;
      if (!preferTm && type === 'tm') score -= 10;

      scored.push({ item, score });
    }

    return collapseEquivalentProducts(scored)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.item);
  }

  private pickBest(name: string, results: DrugSearchResult[]): DrugSearchResult {
    const lower = name.toLowerCase();
    const tmExact = results.find(
      (r) =>
        r.id.includes('-tm-') &&
        (r.genericName?.toLowerCase() === lower || r.brandName.toLowerCase() === lower),
    );
    if (tmExact) return tmExact;

    return (
      results.find(
        (r) =>
          r.brandName.toLowerCase() === lower ||
          r.genericName?.toLowerCase() === lower ||
          r.brandName.toLowerCase().startsWith(lower) ||
          r.genericName?.toLowerCase().startsWith(lower),
      ) ?? results[0]
    );
  }
}
