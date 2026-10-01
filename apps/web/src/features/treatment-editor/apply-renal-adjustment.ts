import type { DurationUnit } from '@/features/consultations/add-treatment/types';
import { resolveFrequencyValue } from '@/features/consultations/add-treatment/frequency-options';
import {
  applyInlineDraft,
  generateInlineDirections,
  hydrateInlineDraft,
  normalizeInlineDraft,
  type InlinePrescriptionDraft,
} from '@/features/consultations/inline-prescription';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import {
  applyMedicationProductChange,
  medicationPrimaryName,
} from '@/features/consultations/pharmacist-product-use';
import type { TreatmentRecommendation } from '@/features/consultations/types';
import {
  buildRenalSafetyView,
  type RenalSafetySource,
  type RenalSafetyView,
} from './renal-safety-model';

export function applyRenalAdjustmentToDraft(
  draft: InlinePrescriptionDraft,
  view: Pick<RenalSafetyView, 'apply' | 'applicableRule'>,
): InlinePrescriptionDraft | null {
  const tablets = view.apply?.tabletCount;
  const rule = view.applicableRule;
  if (!tablets || !draft.lines[0] || !rule) return null;
  const durationUnit: DurationUnit | null =
    rule.durationUnit === 'Weeks'
      ? 'WEEK'
      : rule.durationUnit === 'Months'
        ? 'MONTH'
        : rule.durationUnit === 'Days'
          ? 'DAY'
          : draft.lines[0].durationUnit;
  const frequency = rule.frequency
    ? resolveFrequencyValue(rule.frequency.replace(/\s*\([^)]*\)\s*/g, ' ').trim()) ||
      resolveFrequencyValue(rule.frequency)
    : draft.lines[0].frequency;
  const lines = draft.lines.map((line, idx) =>
    idx === 0
      ? {
          ...line,
          doseFrom: String(tablets),
          doseTo: null,
          frequency: frequency || line.frequency,
          durationValue: rule.duration != null ? String(rule.duration) : line.durationValue,
          durationUnit: durationUnit ?? line.durationUnit,
        }
      : line,
  );
  const nextDraft = {
    ...draft,
    lines,
    directionsMode: 'MANUAL' as const,
    patientDirections:
      rule.directions || generateInlineDirections({ ...draft, lines, directionsMode: 'AUTO' }),
  };
  return normalizeInlineDraft(nextDraft);
}

export function composeAdjustedRegimenTreatment(input: {
  treatment: TreatmentRecommendation;
  drug: DrugSearchResult;
  source: Omit<RenalSafetySource, 'productStrength' | 'productLabel' | 'regimenSource'>;
}):
  | { ok: true; treatment: TreatmentRecommendation; draft: InlinePrescriptionDraft; view: RenalSafetyView }
  | { ok: false; error: string } {
  const nextTreatment = applyMedicationProductChange(input.treatment, input.drug);
  const view = buildRenalSafetyView({
    ...input.source,
    regimenSource: 'STANDARD',
    productStrength: nextTreatment.strength,
    productLabel: medicationPrimaryName(nextTreatment),
  });
  if (view.apply?.productMismatch || view.state === 'PRODUCT_REQUIRED' || !view.apply?.tabletCount) {
    return {
      ok: false,
      error: 'The selected product is not compatible with the adjusted regimen.',
    };
  }
  const hydrated = hydrateInlineDraft(nextTreatment);
  const adjusted = applyRenalAdjustmentToDraft(hydrated, view);
  if (!adjusted) {
    return {
      ok: false,
      error: 'The selected product is not compatible with the adjusted regimen.',
    };
  }
  return { ok: true, treatment: nextTreatment, draft: adjusted, view };
}

export function persistAdjustedRegimen(
  treatment: TreatmentRecommendation,
  draft: InlinePrescriptionDraft,
  view: RenalSafetyView,
): TreatmentRecommendation {
  const updated = applyInlineDraft(treatment, draft);
  updated.regimenSource = 'RENAL_ADJUSTED';
  updated.pharmacistModified = true;
  if (view.patient) {
    updated.renalBasisUsed = view.patient.basis;
    updated.renalValueUsed = view.patient.value;
  }
  return updated;
}
