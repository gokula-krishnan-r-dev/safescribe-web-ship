import type { FieldErrors, RegimenLineDraft, TreatmentDraft } from './types';
import { doseRangeInvalid } from './directions';
import { isOtherFrequencyPlaceholder } from './frequency-options';

export function validateDraft(draft: TreatmentDraft): FieldErrors {
  const errors: FieldErrors = {};
  const qty = Number(draft.quantityValue);
  if (!draft.quantityValue.trim() || !Number.isFinite(qty) || qty <= 0) {
    errors.quantityValue = 'Enter a quantity greater than zero.';
  }
  if (!draft.quantityUnit.trim()) {
    errors.quantityUnit = 'Select a quantity unit.';
  }
  if (!Number.isInteger(draft.refills) || draft.refills < 0) {
    errors.refills = 'Refills must be zero or a positive whole number.';
  }
  if (!draft.patientDirections.trim()) {
    errors.patientDirections = 'Patient directions are required.';
  }

  if (draft.kind === 'MEDICATION') {
    if (!draft.medicationDisplay.trim()) {
      errors.medicationDisplay = 'Select a medication.';
    }
    if (!draft.route.trim()) errors.route = 'Select a route.';
    validateRegimen(draft.regimenLines, errors);
  }

  if (draft.kind === 'CUSTOM_COMPOUND') {
    if (!draft.compoundLabel.trim()) {
      errors.compoundLabel = 'Enter a compound name / label.';
    }
    if (!draft.compoundIngredientsText.trim()) {
      errors.compoundIngredientsText = 'Enter the compound ingredients.';
    }
    if (!draft.route.trim()) errors.route = 'Select a route.';
    validateRegimen(draft.regimenLines, errors);
  }

  if (draft.kind === 'DEVICE') {
    if (!draft.deviceName.trim()) {
      errors.deviceName = 'Enter or select a device name.';
    }
  }

  return errors;
}

function validateRegimen(lines: RegimenLineDraft[], errors: FieldErrors) {
  if (!lines.length) {
    errors.regimenLines = 'Add at least one dose line.';
    return;
  }
  lines.forEach((line, idx) => {
    if (!line.doseFrom.trim()) {
      errors[`regimenLines.${idx}.doseFrom`] = 'Enter a dose.';
    }
    if (line.doseTo != null) {
      const rangeErr = doseRangeInvalid(line.doseFrom, line.doseTo);
      if (rangeErr) errors[`regimenLines.${idx}.doseTo`] = rangeErr;
    }
    if (!line.form.trim()) {
      errors[`regimenLines.${idx}.form`] = 'Select a form.';
    }
    if (!line.frequency.trim() || isOtherFrequencyPlaceholder(line.frequency)) {
      errors[`regimenLines.${idx}.frequency`] = line.frequency.trim()
        ? 'Enter a custom frequency.'
        : 'Select a frequency.';
    }
    if (lines.length > 1) {
      const n = Number(line.durationValue);
      if (!line.durationValue?.trim() || !Number.isFinite(n) || n <= 0) {
        errors[`regimenLines.${idx}.durationValue`] =
          'Enter how long this schedule should be taken.';
      }
      if (!line.durationUnit) {
        errors[`regimenLines.${idx}.durationUnit`] = 'Select a duration unit.';
      }
    } else {
      if (!line.durationValue?.trim()) {
        errors[`regimenLines.${idx}.durationValue`] = 'Enter how many days, weeks, or months.';
      }
      if (line.durationValue?.trim() && !line.durationUnit) {
        errors[`regimenLines.${idx}.durationUnit`] = 'Select a duration unit.';
      }
    }
  });
}
