import {
  emptyAdaptPayload,
  parseAdaptPayload,
  type AdaptPayload,
  type RenewMedication,
} from '@safescript/shared';

const ADAPT_DRAFT_PREFIX = 'safescript.adapt.draft:';

export function readAdaptDraft(consultationId: string, jurisdiction = 'AB'): AdaptPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${ADAPT_DRAFT_PREFIX}${consultationId}`);
    if (!raw) return null;
    return parseAdaptPayload(JSON.parse(raw), jurisdiction);
  } catch {
    return null;
  }
}

export function writeAdaptDraft(consultationId: string, payload: AdaptPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${ADAPT_DRAFT_PREFIX}${consultationId}`, JSON.stringify(payload));
  } catch {
    /* quota or storage error */
  }
}

export function clearAdaptDraft(consultationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${ADAPT_DRAFT_PREFIX}${consultationId}`);
  } catch {
    /* ignore */
  }
}

export function formatPrescriptionDate(isoDate?: string | null): string {
  if (!isoDate) return 'Not recorded';
  try {
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) return isoDate;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word) || word.toLowerCase() === 'mg' || word.toLowerCase() === 'mcg') {
        return word.toLowerCase() === 'mg' || word.toLowerCase() === 'mcg'
          ? word.toLowerCase()
          : word;
      }
      if (word === word.toUpperCase() && word.length <= 4 && /[A-Z]/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Primary line: "Metformin 500 mg tablet"
 * Secondary line: "Oral tablet"
 */
export function formatMedicationDisplay(med: RenewMedication): {
  title: string;
  dosageForm: string;
  directions: string;
  hasDirections: boolean;
  quantity: string | null;
  prescriber: string;
  dateWritten: string;
} {
  const brand = med.normalized.brandName?.trim();
  const generic = med.normalized.genericName?.trim();
  const strength = med.normalized.strength?.trim();
  const rawForm =
    med.normalized.dosageForm?.trim() ||
    med.clinicalIdentity?.dosageForm?.trim() ||
    '';

  const dosageForm = rawForm
    ? titleCaseWords(rawForm)
    : 'Tablet';

  // Short form token for the primary line (e.g. "tablet" from "Oral tablet")
  const formToken = (rawForm.split(/\s+/).pop() || 'tablet').toLowerCase();

  let name = brand || generic || med.raw.medicationText || 'Medication';
  name = titleCaseWords(name);

  const parts: string[] = [name];
  if (strength && !name.toLowerCase().includes(strength.toLowerCase())) {
    parts.push(strength);
  }
  if (formToken && !parts.join(' ').toLowerCase().includes(formToken)) {
    parts.push(formToken);
  }

  const directionsRaw =
    med.normalized.directions?.trim() || med.raw.directionsText?.trim() || '';
  const hasDirections = directionsRaw.length > 0;

  const qty =
    med.normalized.quantity != null ? `Qty: ${med.normalized.quantity}` : null;

  const prescriber = med.normalized.prescriberName?.trim() || 'Not recorded';

  const dateWritten = formatPrescriptionDate(
    med.normalized.prescribedDate || med.normalized.lastFillDate,
  );

  return {
    title: parts.join(' '),
    dosageForm,
    directions: directionsRaw,
    hasDirections,
    quantity: qty,
    prescriber,
    dateWritten,
  };
}
