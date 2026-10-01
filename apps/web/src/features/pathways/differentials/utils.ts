import { uniqueIdList } from '@safescript/shared';
import type { DifferentialDiagnosis, PathwayEvidenceMapping } from '../types';

export const DIFFERENTIALS_SUBTITLE =
  'Alternative conditions to consider and rule out before proceeding through this pathway.';

export const DIFFERENTIALS_BANNER =
  'Review relevant alternative diagnoses. This section supports clinical reasoning and does not replace your clinical judgment.';

export function duplicateDifferentialTitle(title: string): string {
  const trimmed = title.trim();
  return /\bcopy$/i.test(trimmed) ? trimmed : `${trimmed} Copy`;
}

export function linkedIdsForDifferential(
  item: Pick<DifferentialDiagnosis, 'id' | 'evidenceRefIds'>,
  mappings: PathwayEvidenceMapping[] = [],
): string[] {
  return uniqueIdList([
    ...(item.evidenceRefIds ?? []),
    ...mappings
      .filter(
        (m) =>
          m.section === 'differential_review' &&
          m.mappingType === 'differential' &&
          m.targetId === item.id,
      )
      .map((m) => m.referenceId),
  ]);
}

export function sectionEvidenceIds(mappings: PathwayEvidenceMapping[] = []): string[] {
  return uniqueIdList(
    mappings
      .filter((m) => m.section === 'differential_review' && m.mappingType === 'section')
      .map((m) => m.referenceId),
  );
}

export function toDifferentialPayload(item: DifferentialDiagnosis) {
  return {
    id: item.id || undefined,
    condition: item.condition,
    question: item.question?.trim() || null,
    whyItMatters: item.whyItMatters?.trim() || null,
    suggestedPathway: item.suggestedPathway?.trim() || null,
    distinguishingFeatures: item.distinguishingFeatures?.trim() || null,
    keySymptoms: item.keySymptoms?.trim() || null,
    recommendedAction: item.recommendedAction?.trim() || null,
    likelihood: item.likelihood ?? null,
    required: item.required !== false,
    evidenceRefIds: uniqueIdList(item.evidenceRefIds ?? []),
  };
}
