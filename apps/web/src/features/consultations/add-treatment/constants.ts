import type { DurationUnit, RegimenLineDraft } from './types';
import { resolveFormValue } from './form-options';
import {
  findProductUseMapping,
  inferProductForm,
  preferredAdministrationUnit,
  routesForProductForm,
} from '@/features/pathways/product-use-mapping';

export { FREQUENCY_OPTIONS } from './frequency-options';
export {
  FORM_OPTIONS,
  QUANTITY_UNITS,
  type QuantityUnit,
  quantityUnitSelectOptions,
} from './form-options';
export { ROUTE_OPTIONS, resolveRouteValue, routeSelectOptions } from './route-options';

export const MAX_REGIMEN_LINES = 10;

export const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'DAY', label: 'Days' },
  { value: 'WEEK', label: 'Weeks' },
  { value: 'MONTH', label: 'Months' },
];

export const DEVICE_DURATION_OPTIONS = [
  'Ongoing',
  '7 days',
  '14 days',
  '30 days',
  '90 days',
  'Until replaced',
] as const;

export const DEVICE_SCHEDULE_OPTIONS = [
  'With each inhaler dose',
  'Daily',
  'Twice daily',
  'As needed',
  'With each treatment',
  'As directed',
] as const;

export const DEVICE_SIZE_OPTIONS = [
  'Adult',
  'Child',
  'Paediatric',
  'Infant',
  'One size',
] as const;

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyRegimenLine(
  defaults?: Partial<RegimenLineDraft>,
): RegimenLineDraft {
  return {
    clientId: defaults?.clientId || newClientId(),
    sequence: defaults?.sequence ?? 1,
    doseFrom: defaults?.doseFrom ?? '',
    doseTo: defaults?.doseTo ?? null,
    form: defaults?.form ?? '',
    frequency: defaults?.frequency ?? '',
    prn: defaults?.prn ?? false,
    durationValue: defaults?.durationValue ?? null,
    durationUnit: defaults?.durationUnit ?? 'DAY',
  };
}

export interface CcdDPresentation {
  productForm: string;
  doseForm: string;
  quantityUnit: string;
  route: string;
}

/**
 * Map a CCDD dosage form onto administration unit, quantity unit, and route.
 * Never invent Tablet(s) or Oral when the form is unknown.
 */
export function inferCcdDProductPresentation(
  dosageForm?: string,
  extra?: string,
): CcdDPresentation {
  const productForm = inferProductForm(dosageForm, extra);
  if (!productForm) {
    return { productForm: '', doseForm: '', quantityUnit: '', route: '' };
  }
  const routes = routesForProductForm(productForm);
  const route = routes.length === 1 ? routes[0] : routes[0] ?? '';
  const mapping = route ? findProductUseMapping(productForm, route) : null;
  return {
    productForm,
    doseForm:
      mapping?.preferredAdministrationUnit ??
      preferredAdministrationUnit(productForm, route),
    quantityUnit: mapping?.preferredQuantityUnit ?? '',
    route,
  };
}

export function inferFormFromDosage(dosageForm?: string, extra?: string): string {
  return inferCcdDProductPresentation(dosageForm, extra).doseForm;
}

export function inferRouteLabel(dosageForm?: string, extra?: string): string {
  return inferCcdDProductPresentation(dosageForm, extra).route;
}

export function inferQuantityUnit(
  form: string,
  kind: 'MEDICATION' | 'CUSTOM_COMPOUND' | 'DEVICE',
  dosageForm?: string,
): string {
  if (kind === 'DEVICE') return 'Device(s)';
  if (dosageForm?.trim()) {
    return inferCcdDProductPresentation(dosageForm).quantityUnit;
  }
  const f = resolveFormValue(form) || form;
  if (f === 'Application(s)' || f === 'Cream') return 'g';
  if (f === 'mL' || f === 'Cubic centimeter') return 'mL';
  if (f === 'Patch(es)') return 'Patch(es)';
  if (f === 'Capsule(s)') return 'Capsule(s)';
  if (f === 'Drop(s)') return 'Bottle';
  if (f === 'Puffs' || f === 'Inhalation(s)') return 'Device(s)';
  if (f === 'Spray(s)') return 'Bottle';
  if (f === 'Suppositories') return 'Suppositories';
  if (f === 'Lozenge(s)') return 'Lozenge(s)';
  if (f === 'Vial(s)') return 'Vial(s)';
  if (f === 'Tube') return 'Tube';
  return f || '';
}
