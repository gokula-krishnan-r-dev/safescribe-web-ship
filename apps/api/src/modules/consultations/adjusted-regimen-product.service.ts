import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  buildGeneratedSearchText,
  buildRenalRecommendationId,
  formatAdjustedStrength,
  getApplicableRule,
  isProductCompatible,
  parseRenalDosingRulesJson,
  pickPreferredCandidateId,
  rankCompatibleCandidates,
  selectLatestLabValues,
  type AdjustedProductConstraints,
  type CompatibleProductCandidate,
  type RenalDosingBasis,
} from '@safescript/shared';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { TerminologyService } from '@/modules/terminology/terminology.service';
import type { DrugSearchResult } from '@/modules/terminology/drug-search.types';
import { ConsultationsService } from './consultations.service';

const CRCL = /\bcrcl\b|\bcreatinine\s+clearance\b/i;
const EGFR = /\begfr\b|\bestimated\s+gfr\b/i;

type TreatmentRecord = {
  medicationName?: string;
  genericName?: string;
  brandName?: string;
  displayName?: string;
  strength?: string;
  productForm?: string;
  doseUnit?: string;
  route?: string;
  patientDirections?: string;
  instructions?: string;
  pharmacistModified?: boolean;
  regimenSource?: string;
  treatmentInstanceId?: string;
  pathwayTreatmentId?: string;
  drugId?: string;
  renalDosingBasis?: RenalDosingBasis | string | null;
  renalDosingRules?: unknown;
  renalAdjustmentRequired?: boolean;
  renalWarning?: { active?: boolean };
};

export type AdjustedProductSelectionContext = {
  recommendationId: string;
  recommendationType: 'RENAL';
  treatmentKey: string;
  currentRegimenLabel: 'Current pathway regimen' | 'Current prescribed regimen';
  currentProductDisplay: string;
  currentRegimenDisplay: { primary: string };
  adjustedRegimenDisplay: { primary: string; supporting?: string };
  generatedSearchText: string;
  preferredCandidateId?: string;
  candidates: CompatibleProductCandidate[];
};

@Injectable()
export class AdjustedRegimenProductService {
  private readonly logger = new Logger(AdjustedRegimenProductService.name);

  constructor(
    private readonly consultations: ConsultationsService,
    private readonly terminology: TerminologyService,
  ) {}

  async getCandidates(
    consultationId: string,
    user: RequestUser,
    input: {
      treatmentKey: string;
      query?: string | null;
      recommendationId?: string | null;
    },
  ): Promise<AdjustedProductSelectionContext> {
    const consultation = await this.consultations.findOne(consultationId, user);
    const treatment = this.findTreatment(consultation.treatmentPlan, input.treatmentKey);
    if (!treatment) {
      throw new NotFoundException('Treatment not found on this consultation');
    }

    const constraints = this.constraintsFrom(treatment, consultation);
    if (!constraints) {
      throw new UnprocessableEntityException({
        code: 'REGIMEN_NO_LONGER_APPLICABLE',
        message:
          'The treatment or safety information changed. Review the latest recommendation before applying this regimen.',
      });
    }

    const generatedSearchText = buildGeneratedSearchText(constraints.product);
    const recommendationId = constraints.recommendationId;
    if (
      input.recommendationId &&
      input.recommendationId !== recommendationId
    ) {
      throw new UnprocessableEntityException({
        code: 'RECOMMENDATION_STALE',
        message:
          'The treatment or safety information changed. Review the latest recommendation before applying this regimen.',
      });
    }

    const searchText = compact(input.query) || generatedSearchText;
    let matches: DrugSearchResult[] = [];
    try {
      matches = await this.terminology.searchDrugsStrict(searchText, 24, 'medication');
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'adjusted_regimen_candidate_search_failed',
          consultationId,
        }),
        err,
      );
      throw new UnprocessableEntityException({
        code: 'MEDICATION_SOURCE_UNAVAILABLE',
        message: 'Compatible products could not be loaded. Check your connection and try again.',
      });
    }

    const mapped = matches
      .filter((product) =>
        isProductCompatible(
          {
            genericName: product.genericName,
            brandName: product.brandName,
            label: product.label,
            strength: product.strength,
            dosageForm: product.dosageForm,
            routeDisplay: inferRoute(product),
          },
          constraints.product,
        ),
      )
      .map((product) => this.toCandidate(product, constraints.product));

    const candidates = rankCompatibleCandidates(mapped, constraints.product);
    const preferredCandidateId = pickPreferredCandidateId(candidates);

    this.logger.log(
      JSON.stringify({
        event: 'adjusted_regimen_candidate_search_succeeded',
        candidateCountBucket: bucket(candidates.length),
        preferredOffered: Boolean(preferredCandidateId),
        queryChanged: Boolean(compact(input.query)),
      }),
    );

    const modified =
      treatment.pharmacistModified === true ||
      treatment.regimenSource === 'PHARMACIST_MODIFIED';

    return {
      recommendationId,
      recommendationType: 'RENAL',
      treatmentKey: input.treatmentKey,
      currentRegimenLabel: modified
        ? 'Current prescribed regimen'
        : 'Current pathway regimen',
      currentProductDisplay: currentProductDisplay(treatment),
      currentRegimenDisplay: {
        primary:
          compact(treatment.patientDirections) ||
          compact(treatment.instructions) ||
          'Current regimen',
      },
      adjustedRegimenDisplay: {
        primary: constraints.directions,
        supporting: constraints.reasonDisplay,
      },
      generatedSearchText,
      preferredCandidateId,
      candidates,
    };
  }

  private findTreatment(plan: unknown, key: string): TreatmentRecord | null {
    const needle = compact(key);
    if (!needle) return null;
    const records = collectTreatments(plan);
    return (
      records.find((row, index) => treatmentKeysFor(row, index).includes(needle)) ??
      records.find((row) => matchesTreatmentNameKey(row, needle)) ??
      null
    );
  }

  private constraintsFrom(
    treatment: TreatmentRecord,
    consultation: { demographics?: unknown },
  ): {
    product: AdjustedProductConstraints;
    directions: string;
    reasonDisplay?: string;
    recommendationId: string;
  } | null {
    const parsed = parseRenalDosingRulesJson(treatment.renalDosingRules);
    if (!parsed.ok || !parsed.rules.length) return null;
    const basis =
      treatment.renalDosingBasis === 'CrCl' || treatment.renalDosingBasis === 'eGFR'
        ? treatment.renalDosingBasis
        : undefined;
    const metric = extractRenalMetric(consultation.demographics, basis);
    if (!metric || (basis && metric.basis !== basis)) return null;
    const rule = getApplicableRule(metric.value, parsed.rules);
    if (!rule) return null;
    const ingredient =
      compact(treatment.genericName) ||
      compact(treatment.medicationName) ||
      compact(treatment.displayName);
    if (!ingredient) return null;
    const key = treatmentKey(treatment);
    return {
      product: {
        ingredient,
        targetStrength: { value: rule.doseAmount, unit: rule.doseUnit },
        form: inferForm(treatment),
        route: compact(treatment.route) || undefined,
        currentBrand: compact(treatment.brandName) || undefined,
      },
      directions: compact(rule.directions),
      reasonDisplay: `Recommended for ${metric.basis} ${metric.displayValue} ${metric.unit}`,
      recommendationId: buildRenalRecommendationId({
        treatmentKey: key,
        doseAmount: rule.doseAmount,
        doseUnit: rule.doseUnit,
        min: rule.min,
        max: rule.max,
      }),
    };
  }

  private toCandidate(
    product: DrugSearchResult,
    constraints: AdjustedProductConstraints,
  ): CompatibleProductCandidate {
    const generic = compact(product.genericName) || constraints.ingredient;
    const brand = compact(product.brandName);
    const strengthDisplay =
      compact(product.strength) || formatAdjustedStrength(constraints.targetStrength);
    const formDisplay = compact(product.dosageForm) || constraints.form || 'Tablet';
    const displayName =
      compact(product.label) ||
      [brand && brand.toLowerCase() !== generic.toLowerCase() ? brand : generic, strengthDisplay, formDisplay]
        .filter(Boolean)
        .join(' ');
    return {
      productId: product.id,
      din: product.codeDisplay,
      brandName: brand || undefined,
      genericName: generic,
      displayName,
      strength: constraints.targetStrength,
      strengthDisplay,
      formDisplay,
      routeDisplay: inferRoute(product) || constraints.route || 'Oral',
      manufacturer: compact(product.manufacturer) || undefined,
      source: product.source,
      label: product.label,
      compatibility: 'COMPATIBLE',
      preferenceReason: brand && fold(brand) !== fold(generic) ? 'Brand match' : 'Exact generic match',
      catalogue: {
        id: product.id,
        brandName: product.brandName,
        genericName: product.genericName,
        strength: product.strength,
        dosageForm: product.dosageForm,
        manufacturer: product.manufacturer,
        drugClass: product.drugClass,
        label: product.label,
        source: product.source,
        rxcui: product.rxcui,
        ndc: product.ndc,
        codeDisplay: product.codeDisplay,
      },
    };
  }
}

function collectTreatments(plan: unknown): TreatmentRecord[] {
  if (!plan || typeof plan !== 'object') return [];
  const record = plan as Record<string, unknown>;
  const bags = [
    record.selectedTreatments,
    record.recommendedTreatments,
    record.selectedItemsSnapshot,
  ];
  const out: TreatmentRecord[] = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const row of bag) {
      if (row && typeof row === 'object') out.push(row as TreatmentRecord);
    }
  }
  return out;
}

function treatmentKey(row: TreatmentRecord): string {
  return (
    compact(row.treatmentInstanceId) ||
    compact(row.pathwayTreatmentId) ||
    compact(row.drugId) ||
    compact(row.displayName) ||
    compact(row.medicationName)
  );
}

function treatmentKeysFor(row: TreatmentRecord, index: number): string[] {
  const names = [row.displayName, row.medicationName, row.genericName, row.brandName]
    .map(compact)
    .filter(Boolean);
  return Array.from(
    new Set(
      [
        compact(row.treatmentInstanceId),
        compact(row.pathwayTreatmentId),
        compact(row.drugId),
        ...names,
        ...names.map((name) => `${name}-${index}`),
      ].filter(Boolean),
    ),
  );
}

function matchesTreatmentNameKey(row: TreatmentRecord, key: string): boolean {
  const names = [row.displayName, row.medicationName, row.genericName, row.brandName]
    .map(compact)
    .filter(Boolean);
  return names.some((name) => {
    if (key === name) return true;
    if (!key.startsWith(`${name}-`)) return false;
    return /^\d+$/.test(key.slice(name.length + 1));
  });
}

function currentProductDisplay(treatment: TreatmentRecord): string {
  const name =
    compact(treatment.displayName) ||
    compact(treatment.brandName) ||
    compact(treatment.genericName) ||
    compact(treatment.medicationName);
  const strength = compact(treatment.strength);
  const form = inferForm(treatment);
  return [name, strength, form].filter(Boolean).join(' ');
}

function inferForm(treatment: TreatmentRecord): string | undefined {
  const explicit = compact(treatment.productForm);
  if (explicit) return explicit;
  const hay = [treatment.doseUnit, treatment.strength, treatment.medicationName]
    .map(compact)
    .join(' ')
    .toLowerCase();
  if (/tablet|caplet/.test(hay)) return 'Tablet';
  if (/capsule/.test(hay)) return 'Capsule';
  return undefined;
}

function inferRoute(product: DrugSearchResult): string | undefined {
  const hay = `${product.dosageForm ?? ''} ${product.label ?? ''}`.toLowerCase();
  if (/\boral\b|\btablet\b|\bcapsule\b/.test(hay)) return 'Oral';
  return undefined;
}

function extractRenalMetric(
  demographics: unknown,
  preferred?: 'CrCl' | 'eGFR',
): { basis: 'CrCl' | 'eGFR'; value: number; unit: string; displayValue: string } | null {
  const demo = (demographics ?? {}) as {
    labValues?: string;
    extractedLabValues?: Array<{
      test?: string;
      value?: string;
      unit?: string;
      observedDate?: string;
    }>;
    labEntries?: Array<{ name?: string; value?: string; unit?: string }>;
  };
  const blobs: Array<{ test: string; value: string; unit?: string; observedDate?: string }> = [];
  for (const lab of demo.extractedLabValues ?? []) {
    if (lab.test?.trim() && lab.value) {
      blobs.push({
        test: lab.test,
        value: String(lab.value),
        unit: lab.unit,
        observedDate: lab.observedDate,
      });
    }
  }
  for (const lab of demo.labEntries ?? []) {
    if (lab.name && lab.value) blobs.push({ test: lab.name, value: String(lab.value), unit: lab.unit });
  }
  const freeText = compact(demo.labValues);
  if (freeText) {
    const re =
      /\b(e\s*GFR|eGFR|CrCl|creatinine clearance)\b[^\d]{0,12}(\d+(?:\.\d+)?)(?:\s*(mL\/min(?:\/1\.73\s*m²?)?))?/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(freeText))) {
      blobs.push({ test: match[1], value: match[2], unit: match[3] || undefined });
    }
  }
  const parsed = selectLatestLabValues(blobs)
    .map((lab) => {
      const basis: 'CrCl' | 'eGFR' | undefined = CRCL.test(lab.test)
        ? 'CrCl'
        : EGFR.test(lab.test)
          ? 'eGFR'
          : undefined;
      const value = Number(String(lab.value).replace(/,/g, ''));
      if (!basis || !Number.isFinite(value)) return null;
      return {
        basis,
        value,
        unit: compact(lab.unit) || (basis === 'eGFR' ? 'mL/min/1.73 m²' : 'mL/min'),
        displayValue: String(value),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (!parsed.length) return null;
  if (preferred) return parsed.find((row) => row.basis === preferred) ?? parsed[0];
  return parsed[0];
}

function compact(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fold(value: string): string {
  return compact(value).toLowerCase();
}

function bucket(count: number): '0' | '1' | '2-5' | '6+' {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  return '6+';
}
