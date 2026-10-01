import type { ProposedPrescription } from '@safescript/shared';
import type { TreatmentRecommendation } from '@/features/consultations/types';
import { buildDeterministicSig } from './map-drug-to-proposed';

function parseQuantity(raw?: string | number | null): number | string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw).trim();
  if (!text) return null;
  const match = text.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return text;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : text;
}

/** Map Prescribe Add-treatment output into Adapt's proposed prescription. */
export function treatmentRecommendationToProposedPrescription(
  treatment: TreatmentRecommendation,
): ProposedPrescription {
  const quantity = parseQuantity(treatment.quantity);

  const dose =
    treatment.dose?.trim() ||
    [treatment.doseAmount, treatment.doseUnit].filter(Boolean).join(' ').trim() ||
    treatment.strength?.trim() ||
    '';

  const dosageForm =
    treatment.productForm?.trim() ||
    treatment.doseUnit?.trim() ||
    '';

  const frequency = treatment.frequency?.trim() || '';
  const route = treatment.route?.trim() || 'By mouth';
  const sig =
    treatment.patientDirections?.trim() ||
    treatment.instructions?.trim() ||
    buildDeterministicSig({ dose, dosageForm, route, frequency });

  return {
    drugId: treatment.drugId,
    drugName:
      treatment.displayName?.trim() ||
      treatment.medicationName?.trim() ||
      treatment.terminologyLabel?.trim() ||
      '',
    genericName: treatment.genericName,
    brandName: treatment.brandName,
    strength: treatment.strength,
    dosageForm,
    dose,
    frequency,
    route: route === 'Oral' ? 'By mouth' : route,
    quantity,
    quantityUnit: treatment.quantityUnit,
    refills: treatment.refills ?? 0,
    sig,
  };
}
