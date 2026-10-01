/**
 * Canonical drug search result returned to the web app.
 * Providers map their native payloads into this shape so UI stays provider-agnostic.
 */
export interface DrugSearchResult {
  id: string;
  brandName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  drugClass?: string;
  label: string;
  /** Active terminology provider id, or client-side fallbacks */
  source: string;
  rxcui?: string;
  ndc?: string;
  /** e.g. "DIN: 00628123" */
  codeDisplay?: string;
}

export type DrugSearchPurpose = 'medication' | 'allergy';

export interface DrugSearchOptions {
  limit?: number;
  purpose?: DrugSearchPurpose;
}

/**
 * Pluggable drug terminology backend.
 * Add a new open-source API by implementing this interface and registering it
 * in TerminologyModule — no UI changes required.
 */
export interface DrugSearchProvider {
  /** Stable id used in env + result.source (e.g. "ccdd") */
  readonly id: string;
  /** Human-readable label for UI badges / dropdown headers */
  readonly displayName: string;

  search(query: string, options?: DrugSearchOptions): Promise<DrugSearchResult[]>;

  /**
   * Best-effort resolve of free-text (AI transcript) to a coded entry.
   * `purpose` prefers Therapeutic Moiety for allergies vs DIN/NTP for medications.
   */
  resolve?(
    name: string,
    purpose?: DrugSearchPurpose,
  ): Promise<DrugSearchResult | null>;
}

export const DRUG_SEARCH_PROVIDERS = Symbol('DRUG_SEARCH_PROVIDERS');
