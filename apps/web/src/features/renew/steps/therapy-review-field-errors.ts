import {
  therapyReviewFieldErrors,
  type TherapyConditionGroup,
  type TherapyReviewFieldError,
} from '@safescript/shared';

export function visibleReviewFieldErrors(
  group: TherapyConditionGroup,
  pendingAdherenceNo: boolean,
  pendingEffectiveness: 'no' | 'unable_to_assess' | null,
  pendingMedicationYes: boolean,
): TherapyReviewFieldError[] {
  const errors = therapyReviewFieldErrors(group.review, group.medicationIds.length).filter((row) => {
    if (pendingAdherenceNo && row.field === 'adherence') return false;
    if (pendingEffectiveness && row.field === 'effectiveness') return false;
    if (pendingMedicationYes && row.field === 'medicationConcern') return false;
    return true;
  });
  if (pendingAdherenceNo) {
    errors.push({
      field: 'adherence',
      message: 'Document the adherence concern, then save it.',
    });
  }
  if (pendingEffectiveness) {
    errors.push({
      field: 'effectiveness',
      message: 'Document the effectiveness concern, then save it.',
    });
  }
  if (pendingMedicationYes) {
    errors.push({
      field: 'medicationConcern',
      message: 'Document the medication-related concern, then save it.',
    });
  }
  return errors;
}
