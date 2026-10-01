import {
  findProductUseMapping,
  inferProductForm,
  type ProductUseMapping,
} from '@/features/pathways/product-use-mapping';
import type { AdministrationAction } from './types';

const VERB_TO_ACTION: Record<string, AdministrationAction> = {
  Take: 'TAKE',
  Apply: 'APPLY',
  Spray: 'SPRAY',
  Inhale: 'INHALE',
  Instill: 'INSTILL',
  Inject: 'INJECT',
  Insert: 'INSERT',
  Rinse: 'RINSE',
  Gargle: 'GARGLE',
};

export function administrationActionFromMapping(
  mapping?: ProductUseMapping | null,
): AdministrationAction {
  if (!mapping?.sigVerb) return 'REVIEW_REQUIRED';
  return VERB_TO_ACTION[mapping.sigVerb] ?? 'REVIEW_REQUIRED';
}

export function resolveAdministrationAction(input: {
  productForm?: string | null;
  route?: string | null;
  medicationHaystack?: string;
}): { action: AdministrationAction; label: string } {
  const form =
    input.productForm?.trim() ||
    inferProductForm(input.medicationHaystack ?? '') ||
    '';
  const route = input.route?.trim() ?? '';
  if (!form && !route) {
    return { action: 'REVIEW_REQUIRED', label: 'Administration instruction requires review' };
  }
  const mapping = form ? findProductUseMapping(form, route) : null;
  const action = administrationActionFromMapping(mapping);
  if (action !== 'REVIEW_REQUIRED') {
    const label =
      mapping?.sigVerb ??
      ({
        TAKE: 'Take',
        APPLY: 'Apply',
        SPRAY: 'Spray',
        INHALE: 'Inhale',
        INSTILL: 'Instill',
        INJECT: 'Inject',
        INSERT: 'Insert',
        RINSE: 'Rinse',
        GARGLE: 'Gargle',
      }[action] as string);
    return { action, label };
  }
  const fallback = fallbackActionFromRoute(route);
  if (fallback) {
    return fallback;
  }
  return { action: 'REVIEW_REQUIRED', label: 'Administration instruction requires review' };
}

function fallbackActionFromRoute(route: string): { action: AdministrationAction; label: string } | null {
  const r = route.trim().toLowerCase();
  if (!r) return null;
  if (/^(oral|po|by mouth|mouth\/throat|sublingual|buccal|translingual)/.test(r)) {
    return { action: 'TAKE', label: 'Take' };
  }
  if (/^(topical|apply externally|transdermal|wound|mucous membrane)/.test(r)) {
    return { action: 'APPLY', label: 'Apply' };
  }
  if (/^(inhalation|nasal|ventimask|rebreather mask)/.test(r)) {
    return { action: 'INHALE', label: 'Inhale' };
  }
  if (/^(nasal)/.test(r)) {
    return { action: 'SPRAY', label: 'Spray' };
  }
  if (/^(ophthalmic|otic)/.test(r)) {
    return { action: 'INSTILL', label: 'Instill' };
  }
  if (/^(rectal|vaginal|urethral)/.test(r)) {
    return { action: 'INSERT', label: 'Insert' };
  }
  if (/^(irrigation|gu irrigant|rinse|mouth\/throat)/.test(r)) {
    return { action: 'RINSE', label: 'Rinse' };
  }
  if (/inject|intravenous|intramuscular|subcutaneous|intradermal|epidural|intra/.test(r)) {
    return { action: 'INJECT', label: 'Inject' };
  }
  return null;
}
