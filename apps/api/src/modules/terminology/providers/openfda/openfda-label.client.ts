import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Raw OpenFDA drug label result (subset of fields we use). */
export interface OpenFdaLabelResult {
  id?: string;
  set_id?: string;
  effective_time?: string;
  version?: string;
  boxed_warning?: string[];
  contraindications?: string[];
  warnings?: string[];
  warnings_and_cautions?: string[];
  precautions?: string[];
  drug_interactions?: string[];
  adverse_reactions?: string[];
  dosage_and_administration?: string[];
  indications_and_usage?: string[];
  information_for_patients?: string[];
  patient_information?: string[];
  use_in_specific_populations?: string[];
  description?: string[];
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_type?: string[];
    route?: string[];
    substance_name?: string[];
    pharm_class_epc?: string[];
    pharm_class_cs?: string[];
    application_number?: string[];
    spl_set_id?: string[];
  };
}

interface CacheEntry {
  expiresAt: number;
  value: OpenFdaLabelResult | null;
}

/**
 * OpenFDA Drug Label API client.
 * Public endpoint — optional OPENFDA_API_KEY raises rate limits.
 * @see https://open.fda.gov/apis/drug/label/
 */
@Injectable()
export class OpenFdaLabelClient {
  private readonly logger = new Logger(OpenFdaLabelClient.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 6 * 60 * 60 * 1000; // 6h

  constructor(private readonly config: ConfigService) {}

  async fetchLabel(drugName: string): Promise<OpenFdaLabelResult | null> {
    const q = drugName.trim().toLowerCase();
    if (q.length < 2) return null;

    const cached = this.cache.get(q);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const apiKey = this.config.get<string>('OPENFDA_API_KEY')?.trim();
    const escaped = q.replace(/"/g, '');
    // OpenFDA uses +OR+ between field clauses; quotes help phrase match.
    const search = [
      `openfda.generic_name:"${escaped}"`,
      `openfda.brand_name:"${escaped}"`,
      `openfda.substance_name:"${escaped}"`,
    ].join('+OR+');

    const qs = `search=${search}&limit=1${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`;
    const url = `https://api.fda.gov/drug/label.json?${qs}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);

      if (res.status === 404) {
        this.cache.set(q, { value: null, expiresAt: Date.now() + this.ttlMs });
        return null;
      }
      if (!res.ok) {
        this.logger.warn(`OpenFDA label HTTP ${res.status} for "${drugName}"`);
        return null;
      }

      const body = (await res.json()) as { results?: OpenFdaLabelResult[] };
      const label = body.results?.[0] ?? null;
      this.cache.set(q, { value: label, expiresAt: Date.now() + this.ttlMs });
      return label;
    } catch (err) {
      this.logger.warn(`OpenFDA label fetch failed for "${drugName}"`, err);
      return null;
    }
  }
}
