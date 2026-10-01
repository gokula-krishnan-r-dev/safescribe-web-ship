import { toIsoCalendarDate, type RenewMedication } from '@safescript/shared';

export function formatFillDate(value?: string | null): string | null {
  if (!value?.trim()) return null;
  return toIsoCalendarDate(value) ?? value.trim();
}

export function unidentified(value?: string | number | null): boolean {
  return value == null || (typeof value === 'string' && !value.trim());
}

export function displayOrUnidentified(value?: string | number | null): string {
  if (unidentified(value)) return 'Not identified';
  return String(value);
}

const DRAFT_PREFIX = 'safescribe:renew-draft:';

export function readRenewDraft(consultationId: string): unknown | null {
  if (typeof window === 'undefined' || !consultationId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${DRAFT_PREFIX}${consultationId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeRenewDraft(consultationId: string, value: unknown) {
  if (typeof window === 'undefined' || !consultationId) return;
  try {
    window.sessionStorage.setItem(`${DRAFT_PREFIX}${consultationId}`, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function medicationRowKey(med: RenewMedication) {
  return med.id;
}
