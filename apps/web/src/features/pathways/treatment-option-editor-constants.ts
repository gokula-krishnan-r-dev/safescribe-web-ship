/** Controlled lists for the Admin Treatment Option Editor (spec v1.0). */

export const EDITOR_RECOMMENDATION_LEVELS = [
  { value: 'FIRST_LINE', label: 'Preferred' },
  { value: 'ALTERNATIVE', label: 'Alternative' },
  { value: 'SECOND_LINE', label: 'Use with caution' },
] as const;

export const DOSE_UNITS = [
  { value: 'mg', label: 'mg' },
  { value: 'g', label: 'g' },
  { value: 'mcg', label: 'mcg' },
  { value: 'mg/kg', label: 'mg/kg' },
  { value: 'mg/kg/day', label: 'mg/kg/day' },
  { value: 'mg/kg/dose', label: 'mg/kg/dose' },
  { value: 'mL', label: 'mL' },
  { value: '%', label: '%' },
  { value: 'IU', label: 'IU' },
  { value: 'units', label: 'units' },
  { value: 'application', label: 'application' },
  { value: 'other', label: 'Other' },
] as const;

export const FREQUENCY_OPTIONS = [
  { value: 'Once daily', label: 'Once daily' },
  { value: 'Twice daily (BID)', label: 'Twice daily (BID)' },
  { value: 'Three times daily (TID)', label: 'Three times daily (TID)' },
  { value: 'Divided TID', label: 'Divided TID' },
  { value: 'Four times daily (QID)', label: 'Four times daily (QID)' },
  { value: 'Every 6 hours', label: 'Every 6 hours' },
  { value: 'Every 8 hours', label: 'Every 8 hours' },
  { value: 'Every 12 hours', label: 'Every 12 hours' },
  { value: 'At bedtime', label: 'At bedtime' },
  { value: 'As needed (PRN)', label: 'As needed (PRN)' },
  { value: 'Once weekly', label: 'Once weekly' },
  { value: 'Single dose', label: 'Single dose' },
  { value: 'other', label: 'Other' },
] as const;

export const DURATION_OPTIONS = [
  { value: '1 day', label: '1 day' },
  { value: '3 days', label: '3 days' },
  { value: '5 days', label: '5 days' },
  { value: '7 days', label: '7 days' },
  { value: '10 days', label: '10 days' },
  { value: '14 days', label: '14 days' },
  { value: '21 days', label: '21 days' },
  { value: '28 days', label: '28 days' },
  { value: '30 days', label: '30 days' },
  { value: 'Until resolved', label: 'Until resolved' },
  { value: 'As directed', label: 'As directed' },
  { value: 'other', label: 'Other' },
] as const;

export const DURATION_UNITS = [
  { value: 'Days', label: 'Days' },
  { value: 'Weeks', label: 'Weeks' },
  { value: 'Months', label: 'Months' },
] as const;

export type TreatmentEditorMode = 'draft' | 'validate' | 'submit';

export interface TreatmentRegimenDraft {
  id: string;
  label: string;
  /** Clinical instruction, e.g. "Apply a thin layer". */
  dose: string;
  administrationUnit: string;
  productForm: string;
  frequency: string;
  route: string;
  durationValue: string;
  durationUnit: string;
}

export function createEmptyRegimen(index = 0): TreatmentRegimenDraft {
  return {
    id: `regimen-${Date.now()}-${index}`,
    label: index === 0 ? 'Standard' : `Regimen ${index + 1}`,
    dose: '',
    administrationUnit: '',
    productForm: '',
    frequency: '',
    route: '',
    durationValue: '',
    durationUnit: '',
  };
}

export function composeDoseDisplay(dose: string, unit: string): string {
  const d = dose.trim();
  const u = unit.trim();
  if (!d) return '';
  if (!u || u === 'other') return d;
  if (d.toLowerCase().includes(u.toLowerCase())) return d;
  if (/[a-zA-Z]/.test(d) && !/^\d/.test(d)) return d;
  return `${d} ${u}`;
}

export function composeRegimenDoseDisplay(regimen: TreatmentRegimenDraft): string {
  return composeDoseDisplay(regimen.dose, regimen.administrationUnit);
}

export function parseDuration(raw?: string | null): {
  durationValue: string;
  durationUnit: string;
} {
  const value = raw?.trim() ?? '';
  if (!value) return { durationValue: '', durationUnit: '' };
  const match = /^(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)\b/i.exec(
    value,
  );
  if (match) {
    const n = match[1];
    const unit = match[2].toLowerCase();
    if (unit.startsWith('week')) return { durationValue: n, durationUnit: 'Weeks' };
    if (unit.startsWith('month')) return { durationValue: n, durationUnit: 'Months' };
    return { durationValue: n, durationUnit: 'Days' };
  }
  return { durationValue: value, durationUnit: 'Days' };
}

export function composeDuration(value: string, unit: string): string {
  const n = value.trim();
  const u = unit.trim();
  if (!n) return '';
  if (!u) return n;
  if (!/^\d/.test(n)) return n;
  return `${n} ${u.toLowerCase()}`;
}

export function composeAdminDirections(regimen: TreatmentRegimenDraft): string {
  const dose = regimen.dose.trim();
  if (!dose && !regimen.frequency && !regimen.durationValue) return '';
  const freq = regimen.frequency.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
  const duration = composeDuration(regimen.durationValue, regimen.durationUnit);
  const durationPhrase = duration
    ? /^\d/.test(duration)
      ? `for up to ${duration}`
      : duration
    : '';

  if (/[a-zA-Z]/.test(dose) && !/^\d/.test(dose)) {
    let instruction = dose.replace(/\.$/, '');
    if (
      regimen.route.toLowerCase() === 'topical' &&
      /^apply\b/i.test(instruction) &&
      !/affected area/i.test(instruction)
    ) {
      instruction = `${instruction} to the affected area`;
    }
    const parts = [instruction];
    if (freq && !instruction.toLowerCase().includes(freq.split(' ')[0] ?? '')) {
      parts.push(freq);
    }
    if (durationPhrase && !instruction.toLowerCase().includes('week') && !instruction.toLowerCase().includes('day')) {
      parts.push(durationPhrase);
    }
    const sentence = parts.filter(Boolean).join(' ');
    return sentence.endsWith('.') ? sentence : `${sentence}.`;
  }

  const parts = [dose];
  if (regimen.administrationUnit) parts.push(regimen.administrationUnit.toLowerCase());
  if (regimen.route) parts.push(regimen.route.toLowerCase());
  if (freq) parts.push(freq);
  if (durationPhrase) parts.push(durationPhrase);
  const sentence = parts.filter(Boolean).join(' ');
  if (!sentence) return '';
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + (sentence.endsWith('.') ? '' : '.');
}

export function parseDoseAndUnit(raw?: string | null): { dose: string; unit: string } {
  const value = raw?.trim() ?? '';
  if (!value) return { dose: '', unit: '' };
  return { dose: value, unit: '' };
}
