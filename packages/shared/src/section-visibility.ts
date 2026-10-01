/** Pathway assessment section conditional visibility. */

export type SectionVisibilityField = 'demographics.sex' | 'demographics.age';

export type SectionVisibilityOperator = 'eq' | 'neq' | 'in' | 'gte' | 'lte';

export interface SectionVisibilityCondition {
  field: SectionVisibilityField;
  operator: SectionVisibilityOperator;
  value: string | number | string[];
}

export interface SectionVisibility {
  /** All conditions must match (AND). Empty / missing = always visible. */
  all?: SectionVisibilityCondition[];
}

export interface SectionVisibilityContext {
  sex?: string | null;
  age?: number | string | null;
}

export function isSectionVisible(
  visibility: SectionVisibility | null | undefined,
  ctx: SectionVisibilityContext,
): boolean {
  if (!visibility?.all?.length) return true;
  return visibility.all.every((condition) => evaluateCondition(condition, ctx));
}

function evaluateCondition(
  condition: SectionVisibilityCondition,
  ctx: SectionVisibilityContext,
): boolean {
  const raw =
    condition.field === 'demographics.sex'
      ? ctx.sex
      : condition.field === 'demographics.age'
        ? ctx.age
        : undefined;

  if (raw == null || raw === '') return false;

  const value = condition.value;
  switch (condition.operator) {
    case 'eq':
      return String(raw).toLowerCase() === String(value).toLowerCase();
    case 'neq':
      return String(raw).toLowerCase() !== String(value).toLowerCase();
    case 'in': {
      const list = Array.isArray(value) ? value : [value];
      return list.map((v) => String(v).toLowerCase()).includes(String(raw).toLowerCase());
    }
    case 'gte':
      return Number(raw) >= Number(value);
    case 'lte':
      return Number(raw) <= Number(value);
    default:
      return true;
  }
}

/** Presets for admin UI */
export const SECTION_VISIBILITY_PRESETS = [
  { id: 'always', label: 'Always show', visibility: null },
  {
    id: 'male',
    label: 'Only when sex is Male',
    visibility: {
      all: [{ field: 'demographics.sex', operator: 'eq', value: 'Male' }],
    } satisfies SectionVisibility,
  },
  {
    id: 'female',
    label: 'Only when sex is Female',
    visibility: {
      all: [{ field: 'demographics.sex', operator: 'eq', value: 'Female' }],
    } satisfies SectionVisibility,
  },
  {
    id: 'other',
    label: 'Only when sex is Other',
    visibility: {
      all: [{ field: 'demographics.sex', operator: 'eq', value: 'Other' }],
    } satisfies SectionVisibility,
  },
] as const;

export function matchVisibilityPresetId(
  visibility: SectionVisibility | null | undefined,
): string {
  if (!visibility?.all?.length) return 'always';
  const sexEq = visibility.all.find(
    (c) => c.field === 'demographics.sex' && c.operator === 'eq',
  );
  if (!sexEq) return 'always';
  const v = String(sexEq.value).toLowerCase();
  if (v === 'male') return 'male';
  if (v === 'female') return 'female';
  if (v === 'other') return 'other';
  return 'always';
}
