import { uniqueIdList } from '@safescript/shared';
import type { ClinicalTreatment, PathwayEvidenceMapping, RecommendationLevel } from '../types';

export const TREATMENTS_SUBTITLE =
  'Prescription → OTC → Supplements. First-line options are shown when evidence supports them.';

export const TREATMENTS_BANNER =
  'Add evidence for each treatment option and for the section. This information supports clinical decision-making and documentation.';

export const LINE_OF_THERAPY_OPTIONS: Array<{ value: RecommendationLevel; label: string }> = [
  { value: 'FIRST_LINE', label: 'First-line' },
  { value: 'ALTERNATIVE', label: 'Alternative' },
  { value: 'ADJUNCTIVE', label: 'Adjunct' },
  { value: 'SUPPORTIVE_CARE', label: 'Suitable' },
];

export function lineOfTherapyLabel(level?: string | null): string {
  switch (level) {
    case 'FIRST_LINE':
      return 'First-line';
    case 'ADJUNCTIVE':
      return 'Adjunct';
    case 'SUPPORTIVE_CARE':
    case 'SPECIALIST':
      return 'Suitable';
    case 'SECOND_LINE':
    case 'ALTERNATIVE':
      return 'Alternative';
    default:
      return 'First-line';
  }
}

export function isFirstLine(level?: string | null): boolean {
  return level === 'FIRST_LINE';
}

export function linkedIdsForTreatment(
  item: Pick<ClinicalTreatment, 'id' | 'evidenceRefIds'>,
  mappings: PathwayEvidenceMapping[] = [],
): string[] {
  return uniqueIdList([
    ...(item.evidenceRefIds ?? []),
    ...mappings
      .filter(
        (m) =>
          m.section === 'treatment_options' &&
          m.mappingType === 'treatment' &&
          m.targetId === item.id,
      )
      .map((m) => m.referenceId),
  ]);
}

export function sectionEvidenceIds(mappings: PathwayEvidenceMapping[] = []): string[] {
  return uniqueIdList(
    mappings
      .filter((m) => m.section === 'treatment_options' && m.mappingType === 'section')
      .map((m) => m.referenceId),
  );
}

export function treatmentRegimenSummary(t: Pick<ClinicalTreatment, 'dose' | 'frequency' | 'duration' | 'directions'>): string {
  const structured = [t.dose, t.frequency, t.duration].filter((part) => part?.trim()).join(' · ');
  if (structured) return structured;
  return t.directions?.trim() || '';
}
