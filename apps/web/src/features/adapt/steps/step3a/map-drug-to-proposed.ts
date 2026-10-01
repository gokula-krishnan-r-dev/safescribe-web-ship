import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import {
  drugProductTitle,
  inferredRouteFromProduct,
} from '@/features/renew/steps/medication-regimen-model';
import type { ProposedPrescription } from '@safescript/shared';

export function buildDeterministicSig(params: {
  dose?: string;
  dosageForm?: string;
  route?: string;
  frequency?: string;
}): string {
  const form = (params.dosageForm || 'tablet').toLowerCase();
  const route = (params.route || 'By mouth').toLowerCase();
  const freq = (params.frequency || 'once daily').toLowerCase();
  const dosePart = params.dose?.trim() ? ` (${params.dose.trim()})` : '';
  return `Take 1 ${form}${dosePart} ${route} ${freq}`;
}

/** Map a catalogue DrugSearchResult into a ProposedPrescription. */
export function mapDrugToProposedPrescription(
  drug: DrugSearchResult,
  defaults?: Partial<ProposedPrescription>,
): ProposedPrescription {
  const drugName = drugProductTitle(drug);
  const strength = drug.strength?.trim() || '';
  const dosageForm = drug.dosageForm?.trim() || 'tablet';
  const route =
    inferredRouteFromProduct(drug) ||
    defaults?.route ||
    'By mouth';
  const frequency = defaults?.frequency || 'Once daily';
  const dose = strength || defaults?.dose || '';

  return {
    drugId: drug.id,
    drugName,
    genericName: drug.genericName,
    brandName: drug.brandName,
    strength,
    dosageForm,
    dose,
    frequency,
    route: route === 'Oral' ? 'By mouth' : route,
    quantity: defaults?.quantity ?? 30,
    quantityUnit: defaults?.quantityUnit,
    refills: defaults?.refills ?? 1,
    sig: buildDeterministicSig({
      dose,
      dosageForm,
      route: route === 'Oral' ? 'By mouth' : route,
      frequency,
    }),
  };
}

export function hasProposedPrescriptionEdits(
  proposed: ProposedPrescription | undefined | null,
): boolean {
  if (!proposed) return false;
  return Boolean(
    proposed.drugName?.trim() ||
      proposed.dose?.trim() ||
      (proposed.sig?.trim() && proposed.sig.trim().length > 0),
  );
}
