import type { ClinicalTreatment, TreatmentCategory } from '@/features/pathways/types';
import type { TreatmentLibraryDetailResponse, TreatmentLibraryVersion } from './types';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function yesNo(flag: unknown): string {
  if (flag === true || flag === 'Yes') return 'Yes';
  if (flag === false || flag === 'No') return 'No';
  return '';
}

export function libraryVersionToClinicalTreatment(
  detail: TreatmentLibraryDetailResponse,
  version?: TreatmentLibraryVersion | null,
): ClinicalTreatment {
  const payload = (version?.payload ?? detail.workingVersion?.payload ?? {}) as Record<
    string,
    unknown
  >;
  const extras = (payload.extras ?? {}) as Record<string, unknown>;
  const safety = (payload.safety ?? {}) as Record<string, unknown>;
  const medication = (payload.medication ?? extras.medicationConcept ?? {}) as Record<
    string,
    unknown
  >;
  const category = (asString(payload.category) || 'PRESCRIPTION') as TreatmentCategory;

  return {
    id: detail.item.id,
    pathwayId: '',
    category,
    recommendationLevel: 'FIRST_LINE',
    medicationName: asString(payload.displayName) || detail.item.displayName,
    genericName: asString(payload.genericName) || detail.item.genericName || null,
    brandName: asString(payload.brandName) || detail.item.brandName || null,
    strength: asString(payload.strength) || detail.item.strength || null,
    dose: asString(payload.dose) || null,
    route: asString(payload.routeDisplay) || detail.item.routeDisplay || null,
    frequency: asString(payload.frequency) || null,
    duration: asString(payload.duration) || null,
    quantity: asString(payload.quantity) || null,
    directions: asString(payload.directions) || null,
    maxDose: asString(payload.maxDose) || null,
    eligibility: asString(payload.eligibility) || null,
    clinicalIndication: asString(payload.clinicalIndication) || null,
    clinicalNotes: asString(payload.clinicalNotes) || null,
    guidelineReference: asString(payload.guidelineReference) || null,
    evidenceStrength: asString(payload.evidenceStrength) || null,
    renalAdjustment: yesNo(safety.renalAdjustment),
    hepaticAdjustment: yesNo(safety.hepaticAdjustment),
    pregnancyNotes: yesNo(safety.pregnancyConsideration),
    breastfeedingNotes: yesNo(safety.lactationConsideration),
    pregnancyReason: asString(safety.pregnancyReason),
    renalAdjustmentReason: asString(safety.renalReason),
    renalDosingBasis: asString(safety.renalDosingBasis) || null,
    renalDosingRules: Array.isArray(safety.renalDosingRules) ? safety.renalDosingRules : [],
    hepaticAdjustmentReason: asString(safety.hepaticReason),
    monitoringReason: asString(safety.labMonitoringReason),
    counsellingNotes: asString(payload.counsellingNotes) || null,
    followUpAdvice: asString(safety.monitoringText) || asString(payload.followUpAdvice) || null,
    ageRestriction: asString(payload.ageRestriction) || null,
    provinceAvailability: 'ALL',
    warnings: [],
    interactions: [],
    monitoring: yesNo(safety.labMonitoringNeeded),
    isAiGenerated: false,
    approved: detail.item.status === 'APPROVED',
    isActive: !detail.item.isRetired,
    archivedAt: detail.item.isRetired ? detail.item.updatedAt : null,
    displayOrder: 1,
    createdAt: detail.item.createdAt,
    metadata: {
      ...extras,
      population: payload.population ?? extras.population ?? detail.item.population,
      matchStatus: payload.matchStatus ?? detail.item.matchStatus,
      productForm: payload.productFormDisplay ?? detail.item.productFormDisplay,
      regimens: payload.regimens ?? extras.regimens,
      medicationConcept: medication,
      lactationReason: asString(safety.lactationReason),
    },
  };
}

export function approvedLibraryToPrefill(
  detail: TreatmentLibraryDetailResponse,
): ClinicalTreatment & {
  librarySource: {
    treatmentLibraryItemId: string;
    treatmentLibraryVersionId: string;
    sourceVersionNumber: number;
    sourcePayloadHash: string;
    sourceSnapshot: Record<string, unknown>;
  };
} {
  const version =
    detail.versions.find((v) => v.id === detail.item.currentApprovedVersionId) ??
    detail.versions.find((v) => v.status === 'APPROVED') ??
    detail.workingVersion;
  const treatment = libraryVersionToClinicalTreatment(detail, version);
  return {
    ...treatment,
    id: '',
    approved: false,
    librarySource: {
      treatmentLibraryItemId: detail.item.id,
      treatmentLibraryVersionId: version?.id ?? '',
      sourceVersionNumber: version?.versionNumber ?? detail.item.approvedVersionNumber ?? 1,
      sourcePayloadHash: version?.payloadHash ?? '',
      sourceSnapshot: (version?.payload ?? {}) as Record<string, unknown>,
    },
  };
}
