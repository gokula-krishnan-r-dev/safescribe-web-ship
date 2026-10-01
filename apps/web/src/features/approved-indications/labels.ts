export type MappingLevel =
  | 'therapeutic_moiety'
  | 'ingredient'
  | 'ingredient_combination'
  | 'clinical_drug'
  | 'product';

export type RelationshipType =
  | 'approved_indication'
  | 'guideline_supported'
  | 'off_label'
  | 'other';

export type MappingStatus = 'approved' | 'retired';

export type JurisdictionCode = 'CA' | 'AB' | 'BC' | 'ON';

export const MAPPING_LEVEL_OPTIONS: { value: MappingLevel; label: string }[] = [
  { value: 'therapeutic_moiety', label: 'Therapeutic moiety' },
  { value: 'ingredient', label: 'Ingredient' },
  { value: 'ingredient_combination', label: 'Ingredient combination' },
  { value: 'clinical_drug', label: 'Clinical drug' },
  { value: 'product', label: 'Product' },
];

export const RELATIONSHIP_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'approved_indication', label: 'Approved indication' },
  { value: 'guideline_supported', label: 'Guideline-supported' },
  { value: 'off_label', label: 'Off-label' },
  { value: 'other', label: 'Other' },
];

export const JURISDICTION_OPTIONS: { value: JurisdictionCode | ''; label: string }[] = [
  { value: '', label: 'All jurisdictions' },
  { value: 'CA', label: 'Canada' },
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'ON', label: 'Ontario' },
];

export const JURISDICTION_FORM_OPTIONS = JURISDICTION_OPTIONS.filter((o) => o.value !== '');

export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'approved', label: 'Approved' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All' },
];

export function formatMappingLevel(level: string | null | undefined): string {
  const hit = MAPPING_LEVEL_OPTIONS.find((o) => o.value === level);
  if (hit) return hit.label;
  if (!level) return '—';
  return level.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRelationshipType(type: string | null | undefined): string {
  const hit = RELATIONSHIP_OPTIONS.find((o) => o.value === type);
  if (hit) return hit.label;
  if (!type) return '—';
  return type.replace(/_/g, ' ');
}

export function formatJurisdiction(code: string | null | undefined): string {
  const hit = JURISDICTION_OPTIONS.find((o) => o.value === code);
  if (hit && hit.value) return hit.label;
  if (code === 'CA') return 'Canada';
  return code?.trim() || '—';
}

export function formatMappingStatus(status: string | null | undefined, active?: boolean): MappingStatus {
  if (status === 'retired') return 'retired';
  if (status === 'approved') return 'approved';
  if (active === false) return 'retired';
  return 'approved';
}

export function relationshipBadgeClass(type: string | null | undefined): string {
  switch (type) {
    case 'approved_indication':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-100';
    case 'guideline_supported':
      return 'bg-sky-50 text-sky-800 ring-sky-100';
    case 'off_label':
      return 'bg-amber-50 text-amber-900 ring-amber-100';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

export function ccddDisplayId(conceptId: string): string {
  const raw = conceptId.replace(/^ccdd[-:]/i, '').trim();
  return raw || conceptId;
}

export type PageTab = 'approved' | 'review' | 'coverage' | 'versions';

export const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: 'approved', label: 'Approved' },
  { id: 'review', label: 'Review Queue' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'versions', label: 'Version History' },
];

export function parsePageTab(raw: string | null): PageTab {
  if (raw === 'review' || raw === 'coverage' || raw === 'versions') return raw;
  return 'approved';
}
