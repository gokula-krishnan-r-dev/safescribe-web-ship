import {
  adherenceConcerns,
  adherenceIssueLabel,
  effectivenessIssue,
  lookupEffectivenessReasonLabel,
  medicationConcernLabel,
  medicationShortName,
  type RenewMedication,
  type TherapyConditionGroup,
} from '@safescript/shared';

export function documentedFindingLines(group: TherapyConditionGroup): string[] {
  const lines: string[] = [];
  const adherence = adherenceConcerns(group.review);
  if (adherence.length) {
    const first = adherence[0]!;
    const detail = first.details?.trim() || first.otherText?.trim();
    const reason = adherenceIssueLabel(first.issueCategory);
    lines.push(
      detail
        ? `Adherence concern documented — ${detail}`
        : `Adherence concern documented — ${reason}`,
    );
  }
  const effectiveness = effectivenessIssue(group.review);
  if (effectiveness) {
    const reason = lookupEffectivenessReasonLabel(effectiveness.issueCategory);
    const detail = effectiveness.details?.trim() || effectiveness.otherText?.trim();
    lines.push(
      detail
        ? `Effectiveness / stability concern documented — ${detail}`
        : `Effectiveness / stability concern documented — ${reason}`,
    );
  }
  const medication = group.review.issues.filter((issue) => issue.issueType === 'medication_concern');
  if (medication.length) {
    const first = medication[0]!;
    const reason = medicationConcernLabel(first.issueCategory);
    const detail = first.details?.trim() || first.otherText?.trim();
    lines.push(
      detail
        ? `Medication-related concern documented — ${detail}`
        : `Medication-related concern documented — ${reason}`,
    );
  }
  return lines;
}

export function linkedMedicationMutedLabel(medications: RenewMedication[]): string {
  return medications.map((med) => medicationShortName(med)).join(', ');
}
