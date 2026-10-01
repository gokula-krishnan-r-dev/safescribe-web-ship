import type { DuplicateMatchType, TreatmentSafetyStatus } from '@safescript/shared';
import { overlayTreatmentSafety } from '@safescript/shared';
import type { TreatmentRecommendation } from '../types';

export interface TreatmentCandidateDuplicate {
  matchType: DuplicateMatchType;
  blocking: boolean;
  existingTreatmentInstanceId?: string;
  existingPathwayOptionId?: string;
  existingDisplayName?: string;
  existingSafetyStatus?: TreatmentSafetyStatus;
  existingBlockingFindingSummary?: string;
}

export interface TreatmentCandidateSafety {
  evaluationId: string;
  consultationId: string;
  treatmentInstanceId: string;
  source: 'SEARCH' | 'QUICK_ADD' | 'MANUAL';
  patientContextVersion: string;
  status: TreatmentSafetyStatus;
  findings?: unknown[];
  evaluatedAt: string;
  allergyBlocked?: boolean;
  allergyWarning?: TreatmentRecommendation['allergyWarning'];
  renalWarning?: TreatmentRecommendation['renalWarning'];
  hepaticWarning?: TreatmentRecommendation['hepaticWarning'];
  pregnancyWarning?: TreatmentRecommendation['pregnancyWarning'];
  interactions?: string[];
  interactionSafetySources?: TreatmentRecommendation['interactionSafetySources'];
  safetySources?: TreatmentRecommendation['safetySources'];
  safetyReviewItems?: TreatmentRecommendation['safetyReviewItems'];
  safetyTier?: TreatmentRecommendation['safetyTier'];
  safetyEngineMeta?: TreatmentRecommendation['safetyEngineMeta'];
}

export interface TreatmentCandidateEvaluateResponse {
  candidate: {
    treatmentInstanceId: string;
    medicationConceptId: string;
    normalizedBaseIngredientConceptIds: string[];
    normalizationStatus: 'RESOLVED' | 'PARTIAL' | 'UNRESOLVED';
    patientContextVersion: string;
  };
  duplicate: TreatmentCandidateDuplicate;
  safety: TreatmentCandidateSafety | null;
}

export function slimTreatmentsForEvaluate(
  treatments: TreatmentRecommendation[],
): Array<Record<string, unknown>> {
  return treatments.map((t) => ({
    medicationName: t.medicationName,
    genericName: t.genericName,
    drugId: t.drugId,
    rxcui: t.rxcui,
    ndc: t.ndc,
    route: t.route,
    pathwayTreatmentId: t.pathwayTreatmentId,
    treatmentInstanceId: t.treatmentInstanceId,
    source: t.source,
    treatmentKind: t.treatmentKind,
    category: t.category,
    allergyBlocked: t.allergyBlocked,
    allergyWarning: t.allergyWarning ? { reason: t.allergyWarning.reason } : undefined,
  }));
}

export function isGuidedDuplicate(
  duplicate: TreatmentCandidateDuplicate,
): boolean {
  return (
    duplicate.matchType === 'EXACT_PATHWAY_OPTION' ||
    (duplicate.blocking && Boolean(duplicate.existingPathwayOptionId))
  );
}

export function applyCandidateSafety(
  recommendation: TreatmentRecommendation,
  result: TreatmentCandidateEvaluateResponse,
): TreatmentRecommendation {
  const safety = result.safety;
  if (!safety) return recommendation;
  const overlaid = overlayTreatmentSafety(
    { ...recommendation } as unknown as Record<string, unknown>,
    {
      allergyBlocked: safety.allergyBlocked,
      allergyWarning: safety.allergyWarning,
      renalWarning: safety.renalWarning,
      hepaticWarning: safety.hepaticWarning,
      pregnancyWarning: safety.pregnancyWarning,
      interactions: safety.interactions ?? [],
      interactionSafetySources: safety.interactionSafetySources,
      safetySources: safety.safetySources,
      safetyReviewItems: safety.safetyReviewItems,
      safetyStatus: safety.status,
      safetyTier: safety.safetyTier,
      safetyEngineMeta: safety.safetyEngineMeta,
    },
  ) as unknown as TreatmentRecommendation;
  return {
    ...overlaid,
    treatmentInstanceId: result.candidate.treatmentInstanceId,
    normalizedBaseIngredientIds: result.candidate.normalizedBaseIngredientConceptIds,
    safetyEvaluationId: safety.evaluationId,
    safetyStatus: safety.status,
    patientContextVersion: result.candidate.patientContextVersion,
    safetyEvaluatedAt: safety.evaluatedAt,
  };
}
