import { Injectable, Logger } from '@nestjs/common';
import { DrugSearchCache } from '../../cache/drug-search.cache';
import {
  CCDD_VALUE_SETS,
  SNOMED_SUBSTANCE_ECL,
  SNOMED_SYSTEM,
} from './ccdd.constants';
import { CcdDFhirClient } from './ccdd.client';
import { parseMpDisplay } from './ccdd.parser';

export interface SubstanceEnrichment {
  brandName?: string;
  drugClass?: string;
}

/** House / generic-label brands — deprioritize when a distinctive trade name exists */
const GENERIC_HOUSE_BRAND = /^(apo|pms|teva|sandoz|ran|ratio|mylan|act|gd|jamp|pro|van|mar|ntp|mint|aurovitas|sipres)-/i;

/** Chemical scaffold parents — prefer therapeutic action parents instead */
const CHEMICAL_PARENT =
  /tetrazole|pyrrole|imidazole|thiazole|furan|benzene|nucleoside analog|compound|substance|agent$/i;

/** Prefer these pharmacological-action style parents */
const THERAPEUTIC_PARENT =
  /antiviral|antagonist|inhibitor|antibiotic|sedative|analgesic|blocker|agonist|penicillin|benzodiazepine|diuretic|anticoagulant|antidepressant|antipsychotic|antifungal|antihistamine|bronchodilator|corticosteroid|opioid|nsaid|statin|arb|ace /i;

/**
 * Map verbose SNOMED / ATC class names → short clinical labels (screenshot style).
 */
const CLASS_SHORT_LABELS: Array<[RegExp, string]> = [
  [/angiotensin ii receptor/i, 'ARB'],
  [/hmg[- ]?coa reductase/i, 'statin'],
  [/benzodiazepine/i, 'benzodiazepine'],
  [/antiviral/i, 'antiviral'],
  [/aminopenicillin|penicillin/i, 'penicillin'],
  [/nucleosides and nucleotides/i, 'antiviral'],
  [/ace inhibitor/i, 'ACE inhibitor'],
  [/calcium channel/i, 'calcium channel blocker'],
  [/beta[- ]?block/i, 'beta blocker'],
  [/proton pump/i, 'PPI'],
  [/corticosteroid/i, 'corticosteroid'],
  [/glycopeptide antibiotic/i, 'glycopeptide antibiotic'],
  [/phosphodiesterase\s*5/i, 'PDE5 inhibitor'],
  [/angiogenesis inhibitor/i, 'kinase inhibitor'],
  [/nicotinic receptor agonist/i, 'nicotinic agonist'],
  [/peptide hormone/i, 'hormone'],
  [/histone deacetylase/i, 'anticonvulsant'],
  [/betamethasone ester/i, 'corticosteroid'],
  [/non[- ]?steroidal anti[- ]?inflammatory|nsaid/i, 'NSAID'],
  [/selective serotonin reuptake/i, 'SSRI'],
];

const ENRICH_CACHE_TTL = 86_400; // 24h — brands/classes are stable

/**
 * Enriches CCDD Therapeutic Moiety hits with:
 * 1. Brand name — from CCDD Manufactured Products (MP)
 * 2. Drug class — from SNOMED CT CA substance parents (Infoway)
 *
 * Produces the screenshot layout:  generic · Brand  /  class
 */
@Injectable()
export class CcdDEnricher {
  private readonly logger = new Logger(CcdDEnricher.name);

  constructor(
    private readonly fhir: CcdDFhirClient,
    private readonly cache: DrugSearchCache,
  ) {}

  async enrichMany(generics: string[]): Promise<Map<string, SubstanceEnrichment>> {
    const unique = [...new Set(generics.map((g) => g.trim().toLowerCase()).filter(Boolean))];
    const out = new Map<string, SubstanceEnrichment>();

    await Promise.all(
      unique.map(async (key) => {
        const original = generics.find((g) => g.trim().toLowerCase() === key) ?? key;
        const enriched = await this.enrichOne(original);
        out.set(key, enriched);
      }),
    );

    return out;
  }

  async enrichOne(genericName: string): Promise<SubstanceEnrichment> {
    const key = `drug-search:enrich:v4:${genericName.trim().toLowerCase()}`;
    const cached = await this.cache.getJson<SubstanceEnrichment>(key);
    if (cached) return cached;

    const [brandName, drugClass] = await Promise.all([
      this.lookupBrand(genericName),
      this.lookupDrugClass(genericName),
    ]);

    const result: SubstanceEnrichment = { brandName, drugClass };
    await this.cache.setJson(key, result, ENRICH_CACHE_TTL);
    return result;
  }

  /** Pick a distinctive trade name from CCDD Manufactured Products */
  private async lookupBrand(genericName: string): Promise<string | undefined> {
    try {
      const products = await this.fhir.expandValueSet(CCDD_VALUE_SETS.mp, genericName, 12);
      if (!products.length) return undefined;

      const brands = products
        .map((p) => parseMpDisplay(p.display ?? '').brandName)
        .filter((b): b is string => Boolean(b?.trim()));

      return pickBestBrand(brands, genericName);
    } catch (err) {
      this.logger.warn(`Brand enrichment failed for "${genericName}"`, err);
      return undefined;
    }
  }

  /** Resolve short clinical class via SNOMED CT CA substance parents */
  private async lookupDrugClass(genericName: string): Promise<string | undefined> {
    try {
      const hits = await this.fhir.expandValueSet(SNOMED_SUBSTANCE_ECL, genericName, 5);
      if (!hits.length) return this.lookupAtcFallback(genericName);

      const exact =
        hits.find((h) => (h.display ?? '').toLowerCase() === genericName.toLowerCase()) ?? hits[0];

      const lookup = await this.fhir.lookup(SNOMED_SYSTEM, exact.code!);
      const parentCodes = lookup?.properties?.parent ?? [];
      if (!parentCodes.length) return this.lookupAtcFallback(genericName);

      const parentNames = (
        await Promise.all(
          parentCodes.slice(0, 4).map(async (code) => {
            const p = await this.fhir.lookup(SNOMED_SYSTEM, code);
            return p?.display;
          }),
        )
      ).filter((n): n is string => Boolean(n));

      const picked = pickBestClassParent(parentNames);
      if (picked) return picked;

      return this.lookupAtcFallback(genericName);
    } catch (err) {
      this.logger.warn(`SNOMED class enrichment failed for "${genericName}"`, err);
      return this.lookupAtcFallback(genericName);
    }
  }

  /** NIH RxClass ATC — open fallback when SNOMED parents are sparse */
  private async lookupAtcFallback(genericName: string): Promise<string | undefined> {
    try {
      const url = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json?drugName=${encodeURIComponent(genericName)}&relaSource=ATC`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return undefined;

      const data = (await res.json()) as {
        rxclassDrugInfoList?: {
          rxclassDrugInfo?: Array<{
            minConcept?: { name?: string };
            rxclassMinConceptItem?: { className?: string };
          }>;
        };
      };

      const infos = data.rxclassDrugInfoList?.rxclassDrugInfo ?? [];
      const exact =
        infos.find((i) => i.minConcept?.name?.toLowerCase() === genericName.toLowerCase()) ??
        infos[0];
      const raw = exact?.rxclassMinConceptItem?.className;
      return raw ? shortenClassLabel(raw) : undefined;
    } catch {
      return undefined;
    }
  }
}

export function pickBestBrand(brands: string[], genericName: string): string | undefined {
  const generic = genericName.toLowerCase().trim();
  const unique = [...new Set(brands.map((b) => b.trim()).filter(Boolean))].filter(
    (brand) => !/^(unknown|n\/a|unspecified|not specified)$/i.test(brand),
  );
  if (!unique.length) return undefined;

  const scored = unique.map((brand) => {
    const b = brand.toLowerCase();
    let score = 0;
    if (b === generic) score -= 50;
    if (b.includes(generic) && b !== generic) score -= 15; // APO-VALACYCLOVIR
    if (GENERIC_HOUSE_BRAND.test(brand)) score -= 25;
    // Prefer compact trade names (VALTREX, LIPITOR) over long formal labels
    if (brand.length > 28) score -= 20;
    if (/\b(injection|usp|tablet|capsule|cream)\b/i.test(brand)) score -= 30;
    if (brand.length <= 12) score += 8;
    if (/^[A-Z0-9][A-Z0-9\- ]+$/.test(brand) && brand.length <= 14) score += 12;
    return { brand, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  // Skip when best is effectively the generic name / unusable
  if (!best || best.score < -20) return undefined;
  if (best.brand.toLowerCase() === generic) return undefined;

  return titleCaseBrand(best.brand);
}

export function pickBestClassParent(parents: string[]): string | undefined {
  if (!parents.length) return undefined;

  const scored = parents.map((p) => {
    let score = 0;
    if (THERAPEUTIC_PARENT.test(p)) score += 20;
    if (CHEMICAL_PARENT.test(p)) score -= 15;
    // Prefer concise labels
    score -= Math.max(0, p.length - 28) * 0.2;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return shortenClassLabel(scored[0].p);
}

export function shortenClassLabel(raw: string): string {
  const trimmed = raw.trim();
  for (const [re, label] of CLASS_SHORT_LABELS) {
    if (re.test(trimmed)) return label;
  }
  // Drop trailing "plain/derivatives/sedative" noise for cleaner UI
  return trimmed
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\b(plain|derivatives|sedative)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function titleCaseBrand(brand: string): string {
  // Screenshot style: VALTREX → Valtrex (force readable trade-name casing)
  if (/^[A-Z0-9][A-Z0-9\- ]*$/.test(brand) && brand.length <= 24) {
    return brand
      .toLowerCase()
      .split(/([\s\-]+)/)
      .map((part) =>
        /^[\s\-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join('');
  }
  return brand;
}
