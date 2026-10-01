import type { DrugSearchResult } from './medication-utils';
import type { TreatmentRecommendation } from './types';
import { TREATMENT_SAFETY_OVERLAY_KEYS } from '@safescript/shared';
import {
  administrationUnitsFor,
  findProductUseMapping,
  inferProductForm,
  isMassOrDoseUnit,
  reconcileRegimenUse,
  routesForProductForm,
  titleCaseRoute,
} from '@/features/pathways/product-use-mapping';

export function isInstructionalDose(raw?: string | null): boolean {
  const value = raw?.trim() ?? '';
  if (!value) return false;
  if (/^\d/.test(value)) return false;
  return /[a-zA-Z]/.test(value);
}

function inferProductFormFromAdministrationUnit(unit?: string | null): string {
  const u = (unit ?? '').trim().toLowerCase();
  if (!u) return '';
  if (/tablet|caplet/.test(u)) return 'Tablet';
  if (/capsule/.test(u)) return 'Capsule';
  if (/application|cream|ointment|gel|foam/.test(u)) return 'Cream';
  if (/puff|inhalation|nebule/.test(u)) return 'Metered-dose inhaler';
  if (/drop/.test(u)) return 'Drop';
  if (/spray/.test(u)) return 'Spray';
  if (/patch/.test(u)) return 'Patch';
  if (/suppositor/.test(u)) return 'Suppository';
  if (/lozenge|wafer/.test(u)) return 'Lozenge';
  if (/bag|packet|package|sachet|bottle|vial|cup|can/.test(u)) return 'Solution';
  return '';
}

export interface PharmacistProductUse {
  productForm: string;
  route: string;
  administrationUnit: string;
  allowedRoutes: string[];
  allowedAdministrationUnits: string[];
  allowedQuantityUnits: string[];
  preferredQuantityUnit: string;
}

export function resolvePharmacistProductUse(
  treatment: TreatmentRecommendation,
): PharmacistProductUse {
  const hay = [
    treatment.productForm,
    treatment.doseUnit,
    treatment.strength,
    treatment.brandName,
    treatment.genericName,
    treatment.medicationName,
  ]
    .filter(Boolean)
    .join(' ');
  const productForm =
    treatment.productForm?.trim() ||
    inferProductFormFromAdministrationUnit(treatment.doseUnit) ||
    inferProductForm(treatment.doseUnit, hay) ||
    inferProductForm(hay) ||
    '';
  const allowedRoutes = productForm ? routesForProductForm(productForm) : [];
  const reconciled = reconcileRegimenUse({
    productForm,
    route: treatment.route ?? '',
    administrationUnit: isMassOrDoseUnit(treatment.doseUnit)
      ? ''
      : (treatment.doseUnit ?? ''),
  });
  const mapping = findProductUseMapping(reconciled.productForm, reconciled.route);
  return {
    productForm: reconciled.productForm,
    route: reconciled.route || titleCaseRoute(treatment.route),
    administrationUnit: reconciled.administrationUnit,
    allowedRoutes: reconciled.productForm
      ? routesForProductForm(reconciled.productForm)
      : allowedRoutes,
    allowedAdministrationUnits: administrationUnitsFor(
      reconciled.productForm,
      reconciled.route,
    ),
    allowedQuantityUnits: mapping?.allowedQuantityUnits ?? [],
    preferredQuantityUnit: mapping?.preferredQuantityUnit ?? '',
  };
}

export function applyMedicationProductChange(
  treatment: TreatmentRecommendation,
  drug: DrugSearchResult,
): TreatmentRecommendation {
  const next: TreatmentRecommendation = {
    ...treatment,
    brandName: drug.brandName || undefined,
    genericName: drug.genericName,
    medicationName: drug.brandName || drug.genericName || drug.label,
    displayName: drug.brandName || drug.genericName || drug.label,
    strength: drug.strength,
    productForm: inferProductForm(drug.dosageForm, drug.label) ?? '',
    route: '',
    doseUnit: '',
    pharmacistModified: true,
    source: drug.source === 'transcript' ? 'manual' : drug.source,
    drugId: drug.id,
    rxcui: drug.rxcui,
    ndc: drug.ndc,
    manufacturer: drug.manufacturer,
    terminologyLabel: drug.label,
  };
  for (const key of TREATMENT_SAFETY_OVERLAY_KEYS) {
    delete (next as unknown as Record<string, unknown>)[key];
  }
  const resolved = resolvePharmacistProductUse(next);
  return {
    ...next,
    productForm: resolved.productForm || undefined,
    route: resolved.route || undefined,
    doseUnit: resolved.administrationUnit || undefined,
    quantityUnit: resolved.preferredQuantityUnit || treatment.quantityUnit,
    allowedRoutes: resolved.allowedRoutes,
  };
}

export function medicationPrimaryName(treatment: TreatmentRecommendation): string {
  return (
    treatment.brandName?.trim() ||
    treatment.genericName?.trim() ||
    treatment.medicationName.trim()
  );
}

export function medicationSecondaryName(treatment: TreatmentRecommendation): string {
  const generic = treatment.genericName?.trim() ?? '';
  const brand = treatment.brandName?.trim() ?? '';
  const strength = treatment.strength?.trim() ?? '';
  if (brand && generic && generic.toLowerCase() !== brand.toLowerCase()) {
    return [generic, strength].filter(Boolean).join(' ');
  }
  if (strength && !brand) return strength;
  if (strength && brand && !generic) return strength;
  return strength && !generic.toLowerCase().includes(strength.toLowerCase())
    ? strength
    : '';
}
