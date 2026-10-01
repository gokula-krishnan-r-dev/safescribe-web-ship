import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { inferCcdDProductPresentation } from '@/features/consultations/add-treatment/constants';
import { digitsOnly } from './medication-capture-utils';
import {
  deriveReviewStatus,
  type RenewMedication,
} from '@safescript/shared';

export function newRenewMedicationId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `rmed_${crypto.randomUUID().slice(0, 12)}`
    : `rmed_${Date.now()}`;
}

export function drugDin(drug: DrugSearchResult): string | null {
  return digitsOnly(drug.codeDisplay) || digitsOnly(drug.ndc);
}

export function drugProductTitle(drug: DrugSearchResult): string {
  const label = drug.label?.trim();
  if (label) return label;
  return [drug.brandName, drug.strength, drug.dosageForm].filter(Boolean).join(' ').trim() || 'Medication';
}

export function productPresentationFromDrug(
  drug: Pick<DrugSearchResult, 'dosageForm' | 'label' | 'brandName' | 'genericName'>,
) {
  return inferCcdDProductPresentation(
    drug.dosageForm,
    [drug.label, drug.brandName, drug.genericName].filter(Boolean).join(' '),
  );
}

export function inferredRouteFromProduct(
  drug: Pick<DrugSearchResult, 'dosageForm' | 'label' | 'brandName' | 'genericName'>,
): string | null {
  const fromForm = productPresentationFromDrug(drug).route.trim();
  if (fromForm) return fromForm;
  const haystack = `${drug.dosageForm ?? ''} ${drug.label ?? ''}`;
  if (/\boral\b/i.test(haystack)) return 'Oral';
  if (/\btopical\b/i.test(haystack)) return 'Topical';
  if (
    /\binhal/i.test(haystack) ||
    /\b(hfa|mdi|dpi|puffer|diskus|ellipta|respimat)\b/i.test(haystack)
  ) {
    return 'Inhalation';
  }
  if (/\bnasal\b/i.test(haystack)) return 'Nasal';
  if (/\bophthalm|\beye\b/i.test(haystack)) return 'Ophthalmic';
  return null;
}

export function inferredDoseUnitFromProduct(
  drug: Pick<DrugSearchResult, 'dosageForm' | 'label' | 'brandName' | 'genericName'>,
): string | null {
  const doseForm = productPresentationFromDrug(drug).doseForm.trim().toLowerCase();
  const haystack = `${drug.dosageForm ?? ''} ${drug.label ?? ''} ${drug.brandName ?? ''} ${drug.genericName ?? ''}`;
  if (doseForm.includes('puff') || /\b(hfa|mdi|dpi|puffer|diskus|ellipta|respimat)\b/i.test(haystack)) {
    return 'puff';
  }
  if (doseForm.includes('tablet')) return 'tablet';
  if (doseForm.includes('capsule')) return 'capsule';
  if (doseForm.includes('drop')) return 'drop';
  if (doseForm.includes('spray')) return 'spray';
  if (doseForm.includes('patch')) return 'patch';
  if (doseForm.includes('inhalation')) return 'inhalation';
  if (doseForm.includes('ml')) return 'mL';
  return null;
}

export function drugMetaLine(drug: DrugSearchResult): string {
  const din = drugDin(drug);
  const form = drug.dosageForm?.trim();
  const route = inferredRouteFromProduct(drug);
  return [drug.genericName?.trim(), din ? `DIN ${din}` : null, form, route].filter(Boolean).join(' · ');
}

export function medicationIdentityTitle(med: RenewMedication): string {
  return (
    med.productIdentity?.sourceDisplayName?.trim() ||
    med.productIdentity?.productName?.trim() ||
    med.raw.medicationText?.trim() ||
    [med.normalized.brandName, med.normalized.strength, med.normalized.dosageForm]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'Untitled medication'
  );
}

export function resolveMedicationSigDefaults(med: RenewMedication | null | undefined): {
  route?: string;
  doseUnit?: string;
  dosageForm?: string;
  label?: string;
} {
  if (!med) return {};
  const dosageForm =
    med.normalized.dosageForm?.trim() || med.clinicalIdentity?.dosageForm?.trim() || undefined;
  const label = med.raw.medicationText?.trim() || med.productIdentity?.sourceDisplayName?.trim();
  const presentation = inferCcdDProductPresentation(
    dosageForm,
    [label, med.normalized.brandName, med.normalized.genericName, dosageForm].filter(Boolean).join(' '),
  );
  const route =
    med.normalized.route?.trim() ||
    med.clinicalIdentity?.route?.trim() ||
    presentation.route.trim() ||
    inferredRouteFromProduct({
      dosageForm,
      label: label ?? '',
      brandName: med.normalized.brandName ?? '',
      genericName: med.normalized.genericName ?? undefined,
    }) ||
    undefined;
  const doseUnit =
    med.normalized.doseUnit?.trim() ||
    inferredDoseUnitFromProduct({
      dosageForm,
      label: label ?? '',
      brandName: med.normalized.brandName ?? '',
      genericName: med.normalized.genericName ?? undefined,
    }) ||
    undefined;
  return { route: route || undefined, doseUnit: doseUnit || undefined, dosageForm, label };
}

export function medicationIdentityMeta(med: RenewMedication): string {
  const din = med.normalized.din || med.productIdentity?.din;
  return [
    med.normalized.genericName?.trim() || med.clinicalIdentity?.ingredientNames[0],
    din ? `DIN ${din}` : null,
    med.normalized.dosageForm?.trim(),
    med.normalized.route?.trim() || med.clinicalIdentity?.route?.trim(),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function isVerifiedProduct(med: RenewMedication | null | undefined): boolean {
  if (!med) return false;
  if (med.identityVerificationStatus === 'UNVERIFIED') return false;
  if (med.identityVerificationStatus === 'VERIFIED') return true;
  return med.ccddMatchStatus === 'matched' || Boolean(med.normalized.din);
}

export function sourceBadge(drug: DrugSearchResult): 'DPD' | null {
  if (drugDin(drug) || drug.source === 'ccdd') return 'DPD';
  return null;
}

export function shouldPreserveDirections(previous: RenewMedication, next: DrugSearchResult): boolean {
  const oldIngredient =
    previous.clinicalIdentity?.ingredientIds[0] ||
    previous.normalized.genericName?.trim().toLowerCase() ||
    '';
  const newIngredient = (next.genericName || next.id).trim().toLowerCase();
  const oldStrength = (previous.normalized.strength || previous.clinicalIdentity?.strength || '')
    .trim()
    .toLowerCase();
  const newStrength = (next.strength || '').trim().toLowerCase();
  const oldForm = (previous.normalized.dosageForm || previous.clinicalIdentity?.dosageForm || '')
    .trim()
    .toLowerCase();
  const newForm = (next.dosageForm || '').trim().toLowerCase();
  const sameIngredient =
    Boolean(oldIngredient) &&
    (oldIngredient === next.id || oldIngredient === newIngredient);
  return sameIngredient && oldStrength === newStrength && oldForm === newForm;
}

export function applyDrugToMedication(
  previous: RenewMedication | null,
  drug: DrugSearchResult,
): RenewMedication {
  const din = drugDin(drug);
  const presentation = productPresentationFromDrug(drug);
  const route = inferredRouteFromProduct(drug);
  const keepDirections = previous ? shouldPreserveDirections(previous, drug) : false;
  const base = previous ?? emptyManualMedication();
  const next: RenewMedication = {
    ...base,
    source: { type: 'manual_search' },
    raw: {
      ...base.raw,
      medicationText: drugProductTitle(drug),
      directionsText: keepDirections ? base.raw.directionsText : base.raw.directionsText,
    },
    normalized: {
      ...base.normalized,
      medicationConceptId: drug.id,
      brandName: drug.brandName || null,
      genericName: drug.genericName || null,
      strength: drug.strength || null,
      dosageForm: drug.dosageForm || presentation.productForm || null,
      din,
      route: route || (keepDirections ? base.normalized.route : null),
      quantityUnit:
        presentation.quantityUnit ||
        (keepDirections ? base.normalized.quantityUnit : null),
      doseUnit:
        inferredDoseUnitFromProduct(drug) ||
        (keepDirections ? base.normalized.doseUnit : null),
      directions: keepDirections ? base.normalized.directions : null,
      directionsNormalized: keepDirections ? base.normalized.directionsNormalized : null,
      frequency: keepDirections ? base.normalized.frequency : null,
      dose: keepDirections ? base.normalized.dose : null,
    },
    confidence: { medication: 1, strength: drug.strength ? 1 : null },
    reviewStatus: 'confirmed',
    ccddMatchStatus: drug.source === 'ccdd' || drug.source === 'rxnorm' ? 'matched' : 'unmatched',
    ccddCandidates: [],
    resolutionStatus: 'AUTO_RESOLVED',
    pharmacistEdited: true,
    identityVerificationStatus: 'VERIFIED',
    directionsStatus: keepDirections ? base.directionsStatus : undefined,
    productIdentity: {
      sourceDisplayName: drugProductTitle(drug),
      productName: drug.brandName || drug.label,
      brandName: drug.brandName || null,
      din,
      matchMethod: 'PHARMACIST_SELECTED',
      matchConfidence: 1,
    },
    clinicalIdentity: {
      ingredientIds: [drug.id],
      ingredientNames: drug.genericName ? [drug.genericName] : [],
      strength: drug.strength ?? null,
      dosageForm: drug.dosageForm ?? null,
      route,
      ccddClinicalConceptId: drug.id,
    },
  };
  next.reviewStatus = deriveReviewStatus(next);
  next.reviewStatus = 'confirmed';
  return next;
}

export function emptyManualMedication(): RenewMedication {
  return {
    id: newRenewMedicationId(),
    source: { type: 'manual_search' },
    raw: {},
    normalized: {},
    confidence: {},
    reviewStatus: 'not_reviewed',
    ccddMatchStatus: 'unmatched',
    resolutionStatus: 'UNRESOLVED',
    pharmacistEdited: true,
    identityVerificationStatus: 'UNVERIFIED',
  };
}

export function applyNonDpdIdentity(
  previous: RenewMedication | null,
  fields: { name: string; strength?: string; dosageForm?: string; route?: string },
): RenewMedication {
  const base = previous ?? emptyManualMedication();
  const name = fields.name.trim();
  return {
    ...base,
    source: { type: 'manual_search' },
    raw: { ...base.raw, medicationText: name },
    normalized: {
      ...base.normalized,
      medicationConceptId: null,
      brandName: name || null,
      genericName: null,
      strength: fields.strength?.trim() || null,
      dosageForm: fields.dosageForm?.trim() || null,
      route: fields.route?.trim() || null,
      din: null,
    },
    ccddMatchStatus: 'unmatched',
    ccddCandidates: [],
    resolutionStatus: 'UNRESOLVED',
    identityVerificationStatus: 'UNVERIFIED',
    pharmacistEdited: true,
    productIdentity: {
      sourceDisplayName: name,
      productName: name,
      brandName: name,
      din: null,
      matchMethod: 'UNRESOLVED',
      matchConfidence: 0,
    },
    clinicalIdentity: {
      ingredientIds: [],
      ingredientNames: name ? [name] : [],
      strength: fields.strength?.trim() || null,
      dosageForm: fields.dosageForm?.trim() || null,
      route: fields.route?.trim() || null,
    },
  };
}
