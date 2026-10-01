/**
 * Treatment Library — reusable clinically reviewed regimens.
 * CCDD/DPD remains the medication identity source; this module stores regimens.
 */

export const TREATMENT_LIBRARY_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'CHANGES_REQUESTED',
  'RETIRED',
] as const;

export type TreatmentLibraryStatus = (typeof TREATMENT_LIBRARY_STATUSES)[number];

export const TREATMENT_LIBRARY_MATCH_STATUSES = [
  'MATCHED',
  'INCOMPLETE',
  'UNMATCHED',
] as const;

export type TreatmentLibraryMatchStatus =
  (typeof TREATMENT_LIBRARY_MATCH_STATUSES)[number];

export const TREATMENT_LIBRARY_POPULATIONS = [
  'ADULT',
  'PEDIATRIC',
  'WEIGHT_BASED',
  'OTHER',
] as const;

export type TreatmentLibraryPopulation =
  (typeof TREATMENT_LIBRARY_POPULATIONS)[number];

export const TREATMENT_LIBRARY_LINK_STATUSES = [
  'LINKED',
  'DETACHED',
  'MANUAL',
] as const;

export type TreatmentLibraryLinkStatus =
  (typeof TREATMENT_LIBRARY_LINK_STATUSES)[number];

export const TREATMENT_LIBRARY_LIST_TABS = [
  'all',
  'approved',
  'drafts',
  'needs_review',
] as const;

export type TreatmentLibraryListTab = (typeof TREATMENT_LIBRARY_LIST_TABS)[number];

export const TREATMENT_LIBRARY_UI = {
  title: 'Treatment Library',
  subtitle: 'Create and manage reusable, clinically reviewed treatment regimens.',
  newTreatment: 'New treatment',
  banner:
    'Submit drafts for clinical review, then approve to publish. Approved treatments appear in pathway Add from Treatment Library. Pathway-specific changes do not alter the library source.',
  searchPlaceholder: 'Search by medication, brand, form or regimen...',
  emptyTitle: 'No treatments in the library yet',
  emptyBody: 'Create a reusable regimen to prefill pathway treatment options.',
  noResultsTitle: 'No treatments match these filters',
  noResultsBody: 'Try a different search or clear filters to see all treatments.',
} as const;

export const TREATMENT_LIBRARY_POPULATION_LABELS: Record<
  TreatmentLibraryPopulation,
  string
> = {
  ADULT: 'Adult',
  PEDIATRIC: 'Pediatric',
  WEIGHT_BASED: 'Weight-based',
  OTHER: 'Other',
};

export const TREATMENT_LIBRARY_MATCH_LABELS: Record<
  TreatmentLibraryMatchStatus,
  string
> = {
  MATCHED: 'CCDD / DPD matched',
  INCOMPLETE: 'Match incomplete',
  UNMATCHED: 'Unmatched',
};

export const TREATMENT_LIBRARY_PAGE_SIZES = [25, 50, 100] as const;
export const TREATMENT_LIBRARY_DEFAULT_PAGE_SIZE = 25;

export const TREATMENT_LIBRARY_PATHWAY_UI = {
  modalTitle: 'Add from Treatment Library',
  modalSubtitle:
    'Select an approved regimen to add to this pathway. You can review and modify it before saving.',
  footerNote:
    'A versioned copy will be added. Pathway-specific fields can be changed next.',
  reviewAction: 'Review selected treatment',
  emptyCategory:
    'No approved treatments are available in the Treatment Library for this category.',
  emptySearch: 'No approved treatments match your search.',
  loadError: 'Treatment Library results could not be loaded.',
  alreadyInPathway: 'Already in pathway',
  versionUpdate: 'Version update available',
  similarExists: 'Similar treatment already exists',
  matchIncomplete: 'Medication match incomplete',
  createManually: 'Create treatment manually',
  fromLibrary: 'From Treatment Library',
  removeLinkTitle: 'Remove the Treatment Library link?',
  removeLinkBody:
    'The current values will remain in this pathway as a custom treatment, but future library updates will no longer be available.',
} as const;

export type PathwayLibraryUsageState =
  | { state: 'not_used' }
  | { state: 'exact_version'; pathwayTreatmentId: string }
  | {
      state: 'older_version';
      pathwayTreatmentId: string;
      currentVersionNumber: number;
    }
  | {
      state: 'similar_treatment';
      pathwayTreatmentId: string;
      reasonCode: string;
    };

export function canonicalRegimenKey(input: {
  genericName?: string | null;
  productForm?: string | null;
  route?: string | null;
}): string {
  return [input.genericName, input.productForm, input.route]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

export function resolvePathwayLibraryUsage(
  item: {
    id: string;
    approvedVersionNumber: number | null;
    genericName?: string | null;
    productFormDisplay?: string | null;
    routeDisplay?: string | null;
  },
  pathwayTreatments: Array<{
    id: string;
    treatmentLibraryItemId?: string | null;
    sourceVersionNumber?: number | null;
    genericName?: string | null;
    route?: string | null;
    productForm?: string | null;
  }>,
): PathwayLibraryUsageState {
  const sameItem = pathwayTreatments.find((t) => t.treatmentLibraryItemId === item.id);
  if (sameItem) {
    const usedVersion = sameItem.sourceVersionNumber ?? 0;
    const approved = item.approvedVersionNumber ?? 0;
    if (approved > 0 && usedVersion > 0 && usedVersion < approved) {
      return {
        state: 'older_version',
        pathwayTreatmentId: sameItem.id,
        currentVersionNumber: usedVersion,
      };
    }
    return { state: 'exact_version', pathwayTreatmentId: sameItem.id };
  }

  const itemKey = canonicalRegimenKey({
    genericName: item.genericName,
    productForm: item.productFormDisplay,
    route: item.routeDisplay,
  });
  if (!itemKey) return { state: 'not_used' };
  const similar = pathwayTreatments.find(
    (t) =>
      t.treatmentLibraryItemId !== item.id &&
      canonicalRegimenKey({
        genericName: t.genericName,
        productForm: t.productForm,
        route: t.route,
      }) === itemKey,
  );
  if (similar) {
    return {
      state: 'similar_treatment',
      pathwayTreatmentId: similar.id,
      reasonCode: 'same_ingredient_form_route',
    };
  }
  return { state: 'not_used' };
}

export function canSelectLibraryResult(input: {
  usageState?: string | null;
  category?: string | null;
  matchStatus?: string | null;
}): boolean {
  if (input.usageState === 'exact_version' || input.usageState === 'older_version') {
    return false;
  }
  if (
    (input.category === 'PRESCRIPTION' || input.category === 'OTC') &&
    input.matchStatus !== 'MATCHED'
  ) {
    return false;
  }
  return true;
}

export function formatLibraryResultTitle(
  displayName: string,
  strength?: string | null,
): string {
  const name = displayName.trim();
  const value = String(strength ?? '').trim();
  if (!value) return name;
  if (name.toLowerCase().includes(value.toLowerCase())) return name;
  return `${name} ${value}`;
}

export function isPersistedPathwayTreatment(id?: string | null): boolean {
  return Boolean(id && String(id).trim());
}

export const PATHWAY_OWNED_TREATMENT_KEYS = [
  'recommendationLevel',
  'displayOrder',
  'provinceAvailability',
  'clinicalNotes',
  'eligibility',
  'counsellingNotes',
  'followUpAdvice',
  'clinicalIndication',
] as const;

export type PathwayOwnedTreatmentFields = {
  recommendationLevel?: string | null;
  displayOrder?: number | null;
  provinceAvailability?: string | null;
  clinicalNotes?: string | null;
  eligibility?: string | null;
  counsellingNotes?: string | null;
  followUpAdvice?: string | null;
  clinicalIndication?: string | null;
};

export function mergePathwayOwnedFields<T extends Record<string, unknown>>(
  libraryPrefill: T,
  owned?: PathwayOwnedTreatmentFields | null,
): T {
  if (!owned) return libraryPrefill;
  const next = { ...libraryPrefill };
  for (const key of PATHWAY_OWNED_TREATMENT_KEYS) {
    const value = owned[key];
    if (value !== undefined && value !== null && value !== '') {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export function libraryOwnedOverrides(
  snapshot: Record<string, unknown> | null | undefined,
  reviewed: {
    duration?: string | null;
    directions?: string | null;
    dose?: string | null;
    frequency?: string | null;
    route?: string | null;
    strength?: string | null;
  },
): Record<string, string> {
  if (!snapshot) return {};
  const pairs: Array<[keyof typeof reviewed, string]> = [
    ['duration', 'duration'],
    ['directions', 'directions'],
    ['dose', 'dose'],
    ['frequency', 'frequency'],
    ['route', 'routeDisplay'],
    ['strength', 'strength'],
  ];
  const out: Record<string, string> = {};
  for (const [reviewedKey, snapKey] of pairs) {
    const next = String(reviewed[reviewedKey] ?? '').trim();
    const prev = String(snapshot[snapKey] ?? snapshot[reviewedKey] ?? '').trim();
    if (next && prev && next !== prev) out[reviewedKey] = next;
  }
  return out;
}

export function sanitizeTreatmentLibrarySearch(raw?: string | null): string {
  return String(raw ?? '')
    .trim()
    .slice(0, 120)
    .replace(/[%_*\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function treatmentLibraryTabWhere(
  tab: TreatmentLibraryListTab | string | undefined,
): { listStatus?: TreatmentLibraryStatus | { in: TreatmentLibraryStatus[] } } {
  if (tab === 'approved') return { listStatus: 'APPROVED' };
  if (tab === 'drafts') return { listStatus: 'DRAFT' };
  if (tab === 'needs_review') {
    return { listStatus: { in: ['IN_REVIEW', 'CHANGES_REQUESTED'] } };
  }
  return {};
}

export function buildTreatmentLibrarySearchText(input: {
  displayName?: string;
  genericName?: string;
  brandName?: string;
  strength?: string;
  productFormDisplay?: string;
  routeDisplay?: string;
  regimenLabel?: string;
  ingredientName?: string;
}): string {
  return [
    input.displayName,
    input.genericName,
    input.brandName,
    input.ingredientName,
    input.strength,
    input.productFormDisplay,
    input.routeDisplay,
    input.regimenLabel,
  ]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}
