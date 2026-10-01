import type { Consultation } from '../types';
import type { PatientAddress, PatientDocumentInfo } from './types';

/** Canadian provinces / territories for prescription address capture. */
export const CA_PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
] as const;

export type ProvinceCode = (typeof CA_PROVINCES)[number]['value'];

const PROVINCE_LABEL = Object.fromEntries(
  CA_PROVINCES.map((p) => [p.value, p.label]),
) as Record<ProvinceCode, string>;

/** Normalize Canadian postal code to `A1A 1A1` when valid. */
export function normalizePostalCode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    return raw.trim().toUpperCase();
  }
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export function isValidCanadianPostalCode(raw: string): boolean {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(
    compact,
  );
}

const PROVINCE_CODES = new Set<string>(CA_PROVINCES.map((row) => row.value));

const DIRECTIONALS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

const ALWAYS_UPPER = new Set(['PO', 'RR', ...DIRECTIONALS]);

const SMALL_WORDS = new Set([
  'and',
  'or',
  'of',
  'the',
  'at',
  'to',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
]);

const POSTAL_AT_END =
  /(?:^|\s)([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?(\d[ABCEGHJ-NPRSTV-Z]\d)\s*$/i;

function locLower(value: string): string {
  return value.toLocaleLowerCase('en-CA');
}

function locUpper(value: string): string {
  return value.toLocaleUpperCase('en-CA');
}

function isCivicNumber(value: string): boolean {
  return /^\d+[A-Za-z]?$/i.test(value.trim());
}

function titleCaseWord(word: string, index: number, lastIndex: number): string {
  if (!word) return word;
  if (/^\d+[A-Za-z]$/i.test(word)) {
    return `${word.slice(0, -1)}${locUpper(word.slice(-1))}`;
  }
  if (/\d/.test(word) && !/[A-Za-z]/i.test(word)) return word;

  const alpha = word.replace(/[^A-Za-z]/g, '');
  const alphaUpper = locUpper(alpha);
  if (ALWAYS_UPPER.has(alphaUpper) && alpha.length <= 3) {
    return word.replace(alpha, alphaUpper);
  }

  const isEdge = index === 0 || index === lastIndex;
  if (!isEdge && SMALL_WORDS.has(locLower(word))) return locLower(word);

  if (word.includes('-')) {
    return word.split('-').map((part) => titleCaseWord(part, 0, 0)).join('-');
  }
  if (word.includes("'")) {
    return word.split("'").map((part) => titleCaseWord(part, 0, 0)).join("'");
  }

  return `${locUpper(word[0] ?? '')}${locLower(word.slice(1))}`;
}

function formatAddressSegment(segment: string): string {
  const words = segment.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const alpha = word.replace(/[^A-Za-z]/g, '');
      if (
        index === words.length - 1 &&
        alpha.length === 2 &&
        PROVINCE_CODES.has(locUpper(alpha))
      ) {
        return locUpper(alpha);
      }
      return titleCaseWord(word, index, words.length - 1);
    })
    .join(' ');
}

/**
 * Format a free-text patient address on blur: title case, Canada/US punctuation,
 * province codes, and postal codes. Does not invent missing city/province parts.
 */
export function formatPatientAddressLine(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';

  let working = collapsed;
  let postal = '';
  const postalMatch = working.match(POSTAL_AT_END);
  if (postalMatch && postalMatch.index !== undefined) {
    postal = normalizePostalCode(`${postalMatch[1]}${postalMatch[2]}`);
    working = working
      .slice(0, postalMatch.index)
      .trim()
      .replace(/[,\s;]+$/g, '');
  }

  let parts = working
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2 && isCivicNumber(parts[0] ?? '')) {
    parts = [`${parts[0]} ${parts[1]}`, ...parts.slice(2)];
  }

  const formatted = parts.map(formatAddressSegment).filter(Boolean);
  if (postal) {
    if (formatted.length) {
      formatted[formatted.length - 1] = `${formatted[formatted.length - 1]} ${postal}`;
    } else {
      formatted.push(postal);
    }
  }
  return formatted.join(', ');
}

export function emptyAddress(): PatientAddress {
  return {
    street: '',
    unit: '',
    city: '',
    province: '',
    postalCode: '',
  };
}

export function addressFromPatientInfo(
  info?: PatientDocumentInfo | null,
): PatientAddress {
  if (info?.addressLines) {
    return {
      street: info.addressLines.street ?? '',
      unit: info.addressLines.unit ?? '',
      city: info.addressLines.city ?? '',
      province: info.addressLines.province ?? '',
      postalCode: info.addressLines.postalCode ?? '',
    };
  }
  return emptyAddress();
}

/** Multi-line address for PDFs / clinical headers. */
export function formatPatientAddress(
  address?: PatientAddress | null,
  fallbackLegacy?: string,
): string {
  if (!address) return fallbackLegacy?.trim() || '';

  const street = address.street?.trim() ?? '';
  const unit = address.unit?.trim() ?? '';
  const city = address.city?.trim() ?? '';
  const province = address.province?.trim() ?? '';
  const postal = address.postalCode?.trim()
    ? normalizePostalCode(address.postalCode)
    : '';

  const line1 = [unit ? `Unit ${unit}` : null, street || null]
    .filter(Boolean)
    .join(' · ');
  const provinceLabel =
    province && province in PROVINCE_LABEL
      ? PROVINCE_LABEL[province as ProvinceCode]
      : province;
  const line2 = [city, provinceLabel, postal].filter(Boolean).join(', ');

  const formatted = [line1, line2].filter(Boolean).join('\n');
  return formatted || fallbackLegacy?.trim() || '';
}

/** Single-line address for compact document headers. */
export function formatPatientAddressInline(
  address?: PatientAddress | null,
  fallbackLegacy?: string,
): string {
  return formatPatientAddress(address, fallbackLegacy)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Persist-ready patient info: structured address + canonical `address` string
 * used by PDF builders and legacy consumers.
 */
export function finalizePatientDocumentInfo(
  partial: PatientDocumentInfo,
): PatientDocumentInfo {
  const addressLines = partial.addressLines
    ? {
        street: partial.addressLines.street?.trim() || undefined,
        unit: partial.addressLines.unit?.trim() || undefined,
        city: partial.addressLines.city?.trim() || undefined,
        province: partial.addressLines.province?.trim() || undefined,
        postalCode: partial.addressLines.postalCode?.trim()
          ? normalizePostalCode(partial.addressLines.postalCode)
          : undefined,
      }
    : undefined;

  const hasStructured = Boolean(
    addressLines &&
      (addressLines.street ||
        addressLines.unit ||
        addressLines.city ||
        addressLines.province ||
        addressLines.postalCode),
  );

  const address = hasStructured
    ? formatPatientAddress(addressLines!)
    : formatPatientAddressLine(partial.address ?? '') || undefined;

  return {
    ...partial,
    name: partial.name?.trim() || undefined,
    dateOfBirth: partial.dateOfBirth?.trim() || undefined,
    patientId: partial.patientId?.trim() || undefined,
    phone: partial.phone?.trim() || undefined,
    addressLines: hasStructured ? addressLines : undefined,
    address,
  };
}

/** True when the consultation includes a selected prescription treatment. */
export function consultationHasPrescription(
  consultation: Consultation,
): boolean {
  const plan = consultation.treatmentPlan as
    | {
        recommendedTreatments?: Array<{ category?: string; medicationName?: string }>;
        selectedTreatments?: Array<{ category?: string; medicationName?: string }>;
        selectedItemsSnapshot?: Array<{ category?: string; medicationName?: string }>;
        selectedIndex?: number;
        selectedIndexes?: number[];
      }
    | undefined;

  const isRx = (t?: { category?: string; medicationName?: string } | null) =>
    Boolean(t?.medicationName?.trim()) &&
    (t?.category ?? 'PRESCRIPTION') === 'PRESCRIPTION';

  const snapshot = plan?.selectedTreatments ?? plan?.selectedItemsSnapshot;
  if (Array.isArray(snapshot) && snapshot.length) {
    return snapshot.some(isRx);
  }

  const all = plan?.recommendedTreatments ?? [];
  if (!all.length) return false;

  const rawIndexes =
    Array.isArray(plan?.selectedIndexes) && plan.selectedIndexes.length
      ? plan.selectedIndexes
      : typeof plan?.selectedIndex === 'number' && plan.selectedIndex >= 0
        ? [plan.selectedIndex]
        : [];

  const selected = rawIndexes
    .filter((i) => Number.isInteger(i) && i >= 0 && i < all.length)
    .map((i) => all[i]);

  return selected.some(isRx);
}
