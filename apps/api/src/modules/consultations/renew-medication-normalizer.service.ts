import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TerminologyService } from '@/modules/terminology/terminology.service';
import type { DrugSearchResult } from '@/modules/terminology/drug-search.types';
import type {
  ExtractedMedicationInput,
  MedicationResolverCandidate,
  MedicationResolution,
  RenewCcddCandidate,
  RenewMedication,
  RenewMedicationSourceType,
  ResolvedMedicationCandidate,
} from '@safescript/shared';
import {
  deriveReviewStatus,
  detectConceptType,
  parseProductName,
  resolveMedicationFromCandidates,
} from '@safescript/shared';

const SEARCH_CONCURRENCY = 6;

function dinFromResult(result: DrugSearchResult): string | null {
  const display = result.codeDisplay ?? '';
  const match = display.match(/DIN[:\s]*([0-9]{6,8})/i);
  if (match?.[1]) return match[1];
  if (result.ndc && /^\d{6,8}$/.test(result.ndc)) return result.ndc;
  return null;
}

function toResolverCandidate(result: DrugSearchResult): MedicationResolverCandidate {
  return {
    id: result.id,
    label: result.label,
    brandName: result.brandName || null,
    genericName: result.genericName || null,
    strength: result.strength || null,
    dosageForm: result.dosageForm || null,
    din: dinFromResult(result),
    manufacturer: result.manufacturer || null,
    conceptType: detectConceptType(result.id),
    codeDisplay: result.codeDisplay || null,
  };
}

function toCcddCandidate(result: ResolvedMedicationCandidate): RenewCcddCandidate {
  return {
    id: result.id,
    label: result.label,
    brandName: result.brandName || null,
    genericName: result.genericName || null,
    strength: result.strength || null,
    dosageForm: result.dosageForm || null,
    din: result.din || null,
    codeDisplay: result.codeDisplay || null,
    clinicalDifference: result.clinicalDifference ?? null,
    pharmacistDisplayName: result.pharmacistDisplayName,
    pharmacistDetail: result.pharmacistDetail,
  };
}

function skipTerminologySearch(med: RenewMedication): boolean {
  if (med.pharmacistEdited && med.ccddMatchStatus === 'matched' && med.normalized.medicationConceptId) {
    return true;
  }
  if (med.resolutionStatus === 'AUTO_RESOLVED' && med.productIdentity) return true;
  if (med.resolutionStatus === 'PHARMACIST_REVIEW_REQUIRED' && (med.ccddCandidates?.length ?? 0) > 0) {
    return true;
  }
  if (med.resolutionStatus === 'UNRESOLVED' && med.productIdentity?.matchMethod === 'UNRESOLVED') {
    return true;
  }
  return false;
}

function extractedInput(med: RenewMedication): ExtractedMedicationInput {
  return {
    rawName:
      med.raw.medicationText ||
      med.normalized.brandName ||
      med.normalized.genericName ||
      '',
    din: med.normalized.din,
    brandName: med.normalized.brandName,
    genericName: med.normalized.genericName,
    strength: med.normalized.strength,
    dosageForm: med.normalized.dosageForm,
    route: med.normalized.route,
  };
}

function searchQueriesFor(med: RenewMedication): string[] {
  const input = extractedInput(med);
  const parsed = parseProductName(input.brandName || input.rawName);
  const queries = new Set<string>();
  const din = (input.din ?? '').replace(/\D/g, '');
  if (din.length >= 6) queries.add(din);
  const productQuery = [parsed.normalizedName, input.strength].filter(Boolean).join(' ').trim();
  if (productQuery.length >= 2) queries.add(productQuery);
  if (parsed.isExplicitProduct && parsed.baseIngredientCandidate) {
    const clinical = [parsed.baseIngredientCandidate, input.strength].filter(Boolean).join(' ').trim();
    if (clinical.length >= 2) queries.add(clinical);
  } else if (!parsed.isExplicitProduct) {
    const generic = [input.genericName || input.rawName, input.strength, input.dosageForm]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (generic.length >= 2) queries.add(generic);
  }
  return [...queries];
}

@Injectable()
export class RenewMedicationNormalizerService {
  private readonly logger = new Logger(RenewMedicationNormalizerService.name);

  constructor(private readonly terminology: TerminologyService) {}

  newId() {
    return `rmed_${randomBytes(8).toString('hex')}`;
  }

  fromDrugSearch(
    result: DrugSearchResult,
    extras: {
      sourceType?: RenewMedicationSourceType;
      directions?: string | null;
      quantity?: number | null;
      quantityUnit?: string | null;
      prescriberName?: string | null;
      lastFillDate?: string | null;
      prescribedDate?: string | null;
    } = {},
  ): RenewMedication {
    const din = dinFromResult(result);
    const med: RenewMedication = {
      id: this.newId(),
      source: { type: extras.sourceType ?? 'manual_search' },
      raw: {
        medicationText: result.label,
      },
      normalized: {
        medicationConceptId: result.id,
        din,
        brandName: result.brandName || null,
        genericName: result.genericName || null,
        strength: result.strength || null,
        dosageForm: result.dosageForm || null,
        directions: extras.directions ?? null,
        quantity: extras.quantity ?? null,
        quantityUnit: extras.quantityUnit ?? null,
        prescriberName: extras.prescriberName ?? null,
        prescribedDate: extras.prescribedDate ?? null,
        lastFillDate: extras.lastFillDate ?? null,
      },
      confidence: {
        medication: 1,
        strength: result.strength ? 1 : null,
      },
      reviewStatus: 'not_reviewed',
      ccddMatchStatus: result.source === 'ccdd' || result.source === 'rxnorm' ? 'matched' : 'unmatched',
      ccddCandidates: [],
      resolutionStatus: 'AUTO_RESOLVED',
      productIdentity: {
        sourceDisplayName: result.label,
        productName: result.brandName || result.label,
        brandName: result.brandName || null,
        din,
        matchMethod: 'PHARMACIST_SELECTED',
        matchConfidence: 1,
      },
      clinicalIdentity: {
        ingredientIds: [result.id],
        ingredientNames: result.genericName ? [result.genericName] : [],
        strength: result.strength ?? null,
        dosageForm: result.dosageForm ?? null,
        ccddClinicalConceptId: result.id,
      },
      pharmacistEdited: extras.sourceType === 'manual_search',
    };
    med.reviewStatus = deriveReviewStatus(med);
    return med;
  }

  async normalizeMany(items: RenewMedication[]): Promise<RenewMedication[]> {
    const queryLists = items.map((item) => (skipTerminologySearch(item) ? [] : searchQueriesFor(item)));
    const unique = [...new Set(queryLists.flat())];
    const resultsByQuery = new Map<string, DrugSearchResult[]>();

    for (let i = 0; i < unique.length; i += SEARCH_CONCURRENCY) {
      const chunk = unique.slice(i, i + SEARCH_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((query) => this.terminology.searchDrugs(query, 12, 'medication')),
      );
      chunk.forEach((query, index) => {
        resultsByQuery.set(query, chunkResults[index] ?? []);
      });
    }

    return items.map((item, index) => {
      if (skipTerminologySearch(item)) return item;
      const queries = queryLists[index] ?? [];
      const pool = new Map<string, DrugSearchResult>();
      for (const query of queries) {
        for (const result of resultsByQuery.get(query) ?? []) {
          pool.set(result.id, result);
        }
      }
      return this.applyResolution(
        item,
        resolveMedicationFromCandidates(extractedInput(item), [...pool.values()].map(toResolverCandidate)),
      );
    });
  }

  async normalizeOne(med: RenewMedication): Promise<RenewMedication> {
    const [resolved] = await this.normalizeMany([med]);
    return resolved ?? med;
  }

  private applyResolution(med: RenewMedication, resolution: MedicationResolution): RenewMedication {
    if (med.normalized.medicationConceptId && med.ccddMatchStatus === 'matched' && med.pharmacistEdited) {
      return med;
    }

    const selected = resolution.selectedCandidate;
    const next: RenewMedication = {
      ...med,
      raw: {
        ...med.raw,
        medicationText: med.raw.medicationText || resolution.productIdentity.sourceDisplayName,
      },
      normalized: {
        ...med.normalized,
        medicationConceptId: selected?.id ?? med.normalized.medicationConceptId ?? null,
        din: resolution.productIdentity.din ?? med.normalized.din,
        brandName:
          resolution.productIdentity.isExplicitProduct
            ? resolution.productIdentity.brandName ?? med.normalized.brandName
            : med.normalized.brandName || resolution.productIdentity.brandName || null,
        genericName:
          resolution.clinicalIdentity.ingredientNames[0] ??
          selected?.genericName ??
          med.normalized.genericName,
        strength: resolution.clinicalIdentity.strength ?? med.normalized.strength,
        dosageForm: resolution.clinicalIdentity.dosageForm ?? med.normalized.dosageForm,
        route: resolution.clinicalIdentity.route ?? med.normalized.route,
      },
      productIdentity: resolution.productIdentity,
      clinicalIdentity: resolution.clinicalIdentity,
      resolutionStatus: resolution.status,
      ccddMatchStatus:
        resolution.status === 'AUTO_RESOLVED'
          ? 'matched'
          : resolution.status === 'PHARMACIST_REVIEW_REQUIRED'
            ? 'ambiguous'
            : 'unmatched',
      ccddCandidates:
        resolution.status === 'PHARMACIST_REVIEW_REQUIRED'
          ? resolution.candidates.map(toCcddCandidate)
          : [],
    };
    next.reviewStatus = deriveReviewStatus(next);
    if (resolution.status === 'UNRESOLVED' && resolution.reason === 'EXACT_PRODUCT_NOT_FOUND') {
      this.logger.debug(
        `Exact product not found for "${resolution.productIdentity.sourceDisplayName}" — keeping extracted name`,
      );
    }
    return next;
  }
}
