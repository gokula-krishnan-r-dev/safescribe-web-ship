import { Injectable, Logger } from '@nestjs/common';
import { INFOWAY_FHIR_BASE } from './ccdd.constants';
import { CcdDAuthService } from './ccdd.auth';

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirValueSetExpansion {
  resourceType?: string;
  expansion?: {
    total?: number;
    contains?: FhirCoding[];
  };
  issue?: Array<{ severity?: string; diagnostics?: string }>;
}

export interface FhirLookupResult {
  code?: string;
  display?: string;
  /** property code → values (parent may appear multiple times) */
  properties: Record<string, string[]>;
}

@Injectable()
export class CcdDFhirClient {
  private readonly logger = new Logger(CcdDFhirClient.name);

  constructor(private readonly auth: CcdDAuthService) {}

  /**
   * ValueSet $expand with filter — primary search primitive for CCDD / SNOMED.
   * @see https://ontoserver.csiro.au/docs/4.1/api-fhir.html
   */
  async expandValueSet(
    valueSetUrl: string,
    filter: string,
    count: number,
  ): Promise<FhirCoding[]> {
    const token = await this.auth.getAccessToken();
    const url = new URL(`${INFOWAY_FHIR_BASE}/ValueSet/$expand`);
    url.searchParams.set('url', valueSetUrl);
    url.searchParams.set('filter', filter);
    url.searchParams.set('count', String(count));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/fhir+json',
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`$expand failed (${res.status}) for ${valueSetUrl}: ${text.slice(0, 180)}`);
      return [];
    }

    const data = (await res.json()) as FhirValueSetExpansion;
    if (data.issue?.some((i) => i.severity === 'error')) {
      this.logger.warn(`$expand reported error: ${data.issue[0]?.diagnostics ?? 'unknown'}`);
      return [];
    }

    return (data.expansion?.contains ?? []).filter((c) => c.code && c.display);
  }

  /** CodeSystem $lookup — used for SNOMED parent / disposition enrichment */
  async lookup(system: string, code: string): Promise<FhirLookupResult | null> {
    try {
      const token = await this.auth.getAccessToken();
      const url = new URL(`${INFOWAY_FHIR_BASE}/CodeSystem/$lookup`);
      url.searchParams.set('system', system);
      url.searchParams.set('code', code);

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/fhir+json',
        },
        signal: AbortSignal.timeout(6_000),
      });

      if (!res.ok) return null;

      const data = (await res.json()) as {
        parameter?: Array<{
          name?: string;
          valueString?: string;
          valueCode?: string;
          part?: Array<{
            name?: string;
            valueCode?: string;
            valueString?: string;
            valueBoolean?: boolean;
          }>;
        }>;
      };

      const properties: Record<string, string[]> = {};
      let display: string | undefined;
      let lookedUpCode: string | undefined;

      for (const p of data.parameter ?? []) {
        if (p.name === 'display' && p.valueString) display = p.valueString;
        if (p.name === 'code' && p.valueCode) lookedUpCode = p.valueCode;
        if (p.name === 'property' && p.part) {
          let propCode: string | undefined;
          let propValue: string | undefined;
          for (const part of p.part) {
            if (part.name === 'code') propCode = part.valueCode;
            if (part.name === 'value') {
              propValue = part.valueCode ?? part.valueString ?? (part.valueBoolean != null ? String(part.valueBoolean) : undefined);
            }
          }
          if (propCode && propValue) {
            (properties[propCode] ??= []).push(propValue);
          }
        }
      }

      return { code: lookedUpCode ?? code, display, properties };
    } catch (err) {
      this.logger.warn(`$lookup failed for ${system}|${code}`, err);
      return null;
    }
  }
}
