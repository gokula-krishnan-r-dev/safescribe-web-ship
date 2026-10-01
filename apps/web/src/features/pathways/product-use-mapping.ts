/**
 * Versioned product-form / route / administration-unit mapping.
 * Shared by the clinical-admin treatment editor. Never default missing
 * data to Tablet(s) or Oral.
 */

export const PRODUCT_USE_MAPPING_VERSION = 1;

export interface ProductUseMapping {
  productForm: string;
  route: string;
  allowedAdministrationUnits: string[];
  preferredAdministrationUnit: string;
  allowedQuantityUnits: string[];
  preferredQuantityUnit: string;
  sigVerb: string;
}

export const PRODUCT_FORMS = [
  'Tablet',
  'Capsule',
  'Cream',
  'Ointment',
  'Gel',
  'Foam',
  'Solution',
  'Drop',
  'Spray',
  'Nasal spray',
  'Metered-dose inhaler',
  'Patch',
  'Suppository',
  'Lozenge',
  'Injection',
] as const;

export type ProductFormName = (typeof PRODUCT_FORMS)[number];

export const PRODUCT_USE_MAPPINGS: ProductUseMapping[] = [
  {
    productForm: 'Tablet',
    route: 'Oral',
    allowedAdministrationUnits: ['Tablet(s)'],
    preferredAdministrationUnit: 'Tablet(s)',
    allowedQuantityUnits: ['Tablet(s)'],
    preferredQuantityUnit: 'Tablet(s)',
    sigVerb: 'Take',
  },
  {
    productForm: 'Capsule',
    route: 'Oral',
    allowedAdministrationUnits: ['Capsule(s)'],
    preferredAdministrationUnit: 'Capsule(s)',
    allowedQuantityUnits: ['Capsule(s)'],
    preferredQuantityUnit: 'Capsule(s)',
    sigVerb: 'Take',
  },
  {
    productForm: 'Cream',
    route: 'Topical',
    allowedAdministrationUnits: ['Application(s)'],
    preferredAdministrationUnit: 'Application(s)',
    allowedQuantityUnits: ['g', 'Tube(s)'],
    preferredQuantityUnit: 'g',
    sigVerb: 'Apply',
  },
  {
    productForm: 'Ointment',
    route: 'Topical',
    allowedAdministrationUnits: ['Application(s)'],
    preferredAdministrationUnit: 'Application(s)',
    allowedQuantityUnits: ['g', 'Tube(s)'],
    preferredQuantityUnit: 'g',
    sigVerb: 'Apply',
  },
  {
    productForm: 'Gel',
    route: 'Topical',
    allowedAdministrationUnits: ['Application(s)'],
    preferredAdministrationUnit: 'Application(s)',
    allowedQuantityUnits: ['g', 'Tube(s)'],
    preferredQuantityUnit: 'g',
    sigVerb: 'Apply',
  },
  {
    productForm: 'Foam',
    route: 'Topical',
    allowedAdministrationUnits: ['Application(s)'],
    preferredAdministrationUnit: 'Application(s)',
    allowedQuantityUnits: ['g', 'Canister(s)'],
    preferredQuantityUnit: 'g',
    sigVerb: 'Apply',
  },
  {
    productForm: 'Solution',
    route: 'Ophthalmic',
    allowedAdministrationUnits: ['Drop(s)'],
    preferredAdministrationUnit: 'Drop(s)',
    allowedQuantityUnits: ['mL', 'Bottle(s)'],
    preferredQuantityUnit: 'mL',
    sigVerb: 'Instill',
  },
  {
    productForm: 'Solution',
    route: 'Otic',
    allowedAdministrationUnits: ['Drop(s)'],
    preferredAdministrationUnit: 'Drop(s)',
    allowedQuantityUnits: ['mL', 'Bottle(s)'],
    preferredQuantityUnit: 'mL',
    sigVerb: 'Instill',
  },
  {
    productForm: 'Solution',
    route: 'Oral',
    allowedAdministrationUnits: ['Bag(s)', 'Packet(s)', 'Package(s)', 'Bottle', 'mL', 'Litre(s)'],
    preferredAdministrationUnit: 'Bag(s)',
    allowedQuantityUnits: ['Bag(s)', 'Packet(s)', 'Package(s)', 'Bottle', 'Box(es)'],
    preferredQuantityUnit: 'Bag(s)',
    sigVerb: 'Take',
  },
  {
    productForm: 'Drop',
    route: 'Ophthalmic',
    allowedAdministrationUnits: ['Drop(s)'],
    preferredAdministrationUnit: 'Drop(s)',
    allowedQuantityUnits: ['mL', 'Bottle(s)'],
    preferredQuantityUnit: 'mL',
    sigVerb: 'Instill',
  },
  {
    productForm: 'Drop',
    route: 'Otic',
    allowedAdministrationUnits: ['Drop(s)'],
    preferredAdministrationUnit: 'Drop(s)',
    allowedQuantityUnits: ['mL', 'Bottle(s)'],
    preferredQuantityUnit: 'mL',
    sigVerb: 'Instill',
  },
  {
    productForm: 'Metered-dose inhaler',
    route: 'Inhalation',
    allowedAdministrationUnits: ['Puff(s)'],
    preferredAdministrationUnit: 'Puff(s)',
    allowedQuantityUnits: ['Inhaler(s)'],
    preferredQuantityUnit: 'Inhaler(s)',
    sigVerb: 'Inhale',
  },
  {
    productForm: 'Nasal spray',
    route: 'Nasal',
    allowedAdministrationUnits: ['Spray(s)'],
    preferredAdministrationUnit: 'Spray(s)',
    allowedQuantityUnits: ['Bottle(s)'],
    preferredQuantityUnit: 'Bottle(s)',
    sigVerb: 'Spray',
  },
  {
    productForm: 'Spray',
    route: 'Topical',
    allowedAdministrationUnits: ['Spray(s)', 'Application(s)'],
    preferredAdministrationUnit: 'Spray(s)',
    allowedQuantityUnits: ['Bottle(s)'],
    preferredQuantityUnit: 'Bottle(s)',
    sigVerb: 'Apply',
  },
  {
    productForm: 'Patch',
    route: 'Transdermal',
    allowedAdministrationUnits: ['Patch(es)'],
    preferredAdministrationUnit: 'Patch(es)',
    allowedQuantityUnits: ['Patch(es)'],
    preferredQuantityUnit: 'Patch(es)',
    sigVerb: 'Apply',
  },
  {
    productForm: 'Suppository',
    route: 'Rectal',
    allowedAdministrationUnits: ['Suppository(ies)'],
    preferredAdministrationUnit: 'Suppository(ies)',
    allowedQuantityUnits: ['Suppository(ies)'],
    preferredQuantityUnit: 'Suppository(ies)',
    sigVerb: 'Insert',
  },
  {
    productForm: 'Lozenge',
    route: 'Oral',
    allowedAdministrationUnits: ['Lozenge(s)'],
    preferredAdministrationUnit: 'Lozenge(s)',
    allowedQuantityUnits: ['Lozenge(s)'],
    preferredQuantityUnit: 'Lozenge(s)',
    sigVerb: 'Take',
  },
  {
    productForm: 'Injection',
    route: 'Intramuscular',
    allowedAdministrationUnits: ['mL', 'Unit'],
    preferredAdministrationUnit: 'mL',
    allowedQuantityUnits: ['Vial(s)'],
    preferredQuantityUnit: 'Vial(s)',
    sigVerb: 'Inject',
  },
  {
    productForm: 'Injection',
    route: 'Subcutaneous',
    allowedAdministrationUnits: ['mL', 'Unit'],
    preferredAdministrationUnit: 'mL',
    allowedQuantityUnits: ['Vial(s)'],
    preferredQuantityUnit: 'Vial(s)',
    sigVerb: 'Inject',
  },
];

function haystack(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Infer pharmaceutical form from CCDD/DPD text. Returns null when unknown — never Tablet. */
export function inferProductForm(
  dosageForm?: string,
  extra?: string,
): ProductFormName | null {
  const f = haystack(dosageForm, extra);
  if (!f) return null;
  if (/\bfoams?\b/.test(f)) return 'Foam';
  if (/\bcreams?\b/.test(f)) return 'Cream';
  if (/\bointments?\b/.test(f)) return 'Ointment';
  if (/\bgels?\b/.test(f)) return 'Gel';
  if (
    /\b(hfa|mdi|dpi|puffer|inhaler|diskus|ellipta|respimat|turbuhaler|genuair|breezhaler|accuhaler)\b/.test(f) ||
    /\binhalation aerosol\b/.test(f) ||
    /\baerosols?\b/.test(f) ||
    /\b(mdi|metered[-\s]?dose)\b/.test(f)
  ) {
    return 'Metered-dose inhaler';
  }
  if (/\bnasal\s+sprays?\b/.test(f)) return 'Nasal spray';
  if (/\bpatches?\b|\btransdermal\b/.test(f)) return 'Patch';
  if (/\bsuppositor/.test(f)) return 'Suppository';
  if (/\blozenges?\b/.test(f)) return 'Lozenge';
  if (/\b(drops?|ophthalm|otic)\b/.test(f) && /\b(solution|drop)/.test(f)) return 'Drop';
  if (/\bdrops?\b/.test(f)) return 'Drop';
  if (/\bsprays?\b/.test(f)) return 'Spray';
  if (/\b(solutions?|suspensions?)\b/.test(f)) return 'Solution';
  if (/\b(inject|vial|intramuscular|subcut)\b/.test(f)) return 'Injection';
  if (/\bcapsules?\b/.test(f)) return 'Capsule';
  if (/\b(tablets?|caplets?)\b/.test(f)) return 'Tablet';
  return null;
}

export function routesForProductForm(productForm: string): string[] {
  const form = productForm.trim();
  const routes = PRODUCT_USE_MAPPINGS.filter((m) => m.productForm === form).map(
    (m) => m.route,
  );
  return [...new Set(routes)];
}

export function findProductUseMapping(
  productForm: string,
  route: string,
): ProductUseMapping | null {
  const form = productForm.trim();
  const rt = route.trim();
  return (
    PRODUCT_USE_MAPPINGS.find(
      (m) =>
        m.productForm.toLowerCase() === form.toLowerCase() &&
        m.route.toLowerCase() === rt.toLowerCase(),
    ) ?? null
  );
}

export function administrationUnitsFor(
  productForm: string,
  route: string,
): string[] {
  const mapping = findProductUseMapping(productForm, route);
  if (mapping) return mapping.allowedAdministrationUnits;
  const byForm = PRODUCT_USE_MAPPINGS.filter(
    (m) => m.productForm.toLowerCase() === productForm.trim().toLowerCase(),
  );
  if (byForm.length === 1) return byForm[0].allowedAdministrationUnits;
  return [];
}

export function preferredAdministrationUnit(
  productForm: string,
  route: string,
): string {
  return (
    findProductUseMapping(productForm, route)?.preferredAdministrationUnit ?? ''
  );
}

export function titleCaseRoute(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (value === value.toLowerCase()) {
    return value.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return value;
}

export function validateProductUse(
  productForm: string,
  route: string,
  administrationUnit: string,
): string | null {
  if (!productForm.trim()) return 'Product form is required';
  if (!route.trim()) return 'Route is required';
  const mapping = findProductUseMapping(productForm, route);
  if (!mapping) {
    return `${productForm} is not compatible with ${route}`;
  }
  if (
    administrationUnit.trim() &&
    !mapping.allowedAdministrationUnits.some(
      (u) => u.toLowerCase() === administrationUnit.trim().toLowerCase(),
    )
  ) {
    return `${administrationUnit} is not used with ${productForm} (${route})`;
  }
  return null;
}

/** Mass/strength units are not administration units (Tablet(s), Application(s), …). */
export function isMassOrDoseUnit(unit?: string | null): boolean {
  const value = unit?.trim() ?? '';
  if (!value) return false;
  return /^(mg|g|mcg|µg|ug|ml|%|iu|units|mg\/kg(?:\/(?:day|dose))?)$/i.test(value);
}

export const MAPPED_ROUTES = [
  ...new Set(PRODUCT_USE_MAPPINGS.map((m) => m.route)),
];

/**
 * Keep form, route, and administration unit compatible.
 * Never invent Tablet or Oral when the pair is missing or contradictory.
 */
export function reconcileRegimenUse(input: {
  productForm: string;
  route: string;
  administrationUnit: string;
}): { productForm: string; route: string; administrationUnit: string } {
  const productForm = input.productForm.trim();
  const compatibleRoutes = productForm ? routesForProductForm(productForm) : [];
  let route = titleCaseRoute(input.route);
  if (
    productForm &&
    route &&
    compatibleRoutes.length &&
    !compatibleRoutes.some((r) => r.toLowerCase() === route.toLowerCase())
  ) {
    route = compatibleRoutes.length === 1 ? compatibleRoutes[0] : '';
  } else if (productForm && !route && compatibleRoutes.length === 1) {
    route = compatibleRoutes[0];
  }

  const allowedUnits = administrationUnitsFor(productForm, route);
  let administrationUnit = input.administrationUnit.trim();
  if (isMassOrDoseUnit(administrationUnit)) {
    administrationUnit = '';
  }
  if (
    administrationUnit &&
    allowedUnits.length &&
    !allowedUnits.some((u) => u.toLowerCase() === administrationUnit.toLowerCase())
  ) {
    administrationUnit = preferredAdministrationUnit(productForm, route);
  }
  if (!administrationUnit) {
    administrationUnit = preferredAdministrationUnit(productForm, route);
  }
  return { productForm, route, administrationUnit };
}
