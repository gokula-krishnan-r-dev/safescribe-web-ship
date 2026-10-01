/** Alberta launch complimentary-access registration. */

import { formatDocumentFaxNumber } from './pcp-communication';

export const ACCESS_REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
  NEEDS_REVIEW: 'needs_review',
  EXISTING_MATCH: 'existing_match',
} as const;

export type AccessRequestStatus =
  (typeof ACCESS_REQUEST_STATUSES)[keyof typeof ACCESS_REQUEST_STATUSES];

export const ACCESS_REQUEST_STATUS_LABELS: Record<AccessRequestStatus, string> = {
  pending: 'Pending Review',
  approved: 'Activated',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
  needs_review: 'Needs Review',
  existing_match: 'Existing Match',
};

export const ACCESS_REQUEST_MATCH_TYPES = {
  NONE: 'none',
  PHIX_EXACT: 'phix_exact',
  SAFESCRIBE_EXACT: 'safescribe_exact',
  POSSIBLE: 'possible',
} as const;

export type AccessRequestMatchType =
  (typeof ACCESS_REQUEST_MATCH_TYPES)[keyof typeof ACCESS_REQUEST_MATCH_TYPES];

export const ACCESS_REQUEST_MATCH_LABELS: Record<AccessRequestMatchType, string> = {
  none: 'NEW',
  phix_exact: 'PHIX MATCH',
  safescribe_exact: 'EXISTING MATCH',
  possible: 'POSSIBLE MATCH',
};

export const ACCESS_REQUEST_TABS = {
  ALL: 'all',
  PENDING: 'pending',
  NEW: 'new',
  EXISTING: 'existing',
  ACTIVATED: 'activated',
  REJECTED: 'rejected',
} as const;

export type AccessRequestTab = (typeof ACCESS_REQUEST_TABS)[keyof typeof ACCESS_REQUEST_TABS];

export const ACCESS_REQUEST_TAB_LABELS: Record<AccessRequestTab, string> = {
  all: 'All Requests',
  pending: 'Pending Review',
  new: 'New Pharmacies',
  existing: 'Existing Matches',
  activated: 'Activated',
  rejected: 'Rejected',
};

export const ACCESS_REQUEST_SOURCES = {
  ALBERTA_QR_LAUNCH: 'alberta_qr_launch',
} as const;

export type AccessRequestSource =
  (typeof ACCESS_REQUEST_SOURCES)[keyof typeof ACCESS_REQUEST_SOURCES];

export const ACCESS_REQUEST_SOURCE_LABELS: Record<string, string> = {
  [ACCESS_REQUEST_SOURCES.ALBERTA_QR_LAUNCH]: 'Alberta Launch',
};

export const ACCESS_REQUEST_PROVINCE = 'AB';

export const ACCESS_REQUEST_LIMITS = {
  PHARMACY_NAME: 160,
  LICENCE_NUMBER: 64,
  CONTACT_NAME: 120,
  EMAIL: 254,
  PHONE: 32,
  NOTES: 2000,
  UTM: 80,
  USER_AGENT: 512,
  HONEYPOT: 200,
  REJECT_REASON: 160,
} as const;

export const ACCESS_REQUEST_ERRORS = {
  NETWORK_CHANGED: 'NETWORK_CHANGED',
  NETWORK_REQUIRED: 'NETWORK_REQUIRED',
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
  EXACT_MATCH_EXISTS: 'EXACT_MATCH_EXISTS',
} as const;

export const ACCESS_REQUEST_REJECT_REASONS = [
  { value: 'invalid_licence', label: 'Invalid licence' },
  { value: 'unable_to_verify', label: 'Unable to verify pharmacy' },
  { value: 'duplicate_request', label: 'Duplicate request' },
  { value: 'not_eligible', label: 'Not eligible' },
  { value: 'other', label: 'Other' },
] as const;

export function isAccessRequestStatus(value: string): value is AccessRequestStatus {
  return Object.values(ACCESS_REQUEST_STATUSES).includes(value as AccessRequestStatus);
}

export function isAccessRequestMatchType(value: string): value is AccessRequestMatchType {
  return Object.values(ACCESS_REQUEST_MATCH_TYPES).includes(value as AccessRequestMatchType);
}

export function accessRequestStatusLabel(status: string): string {
  return isAccessRequestStatus(status) ? ACCESS_REQUEST_STATUS_LABELS[status] : status;
}

export function accessRequestMatchLabel(matchType: string | null | undefined): string {
  if (matchType && isAccessRequestMatchType(matchType)) {
    return ACCESS_REQUEST_MATCH_LABELS[matchType];
  }
  return ACCESS_REQUEST_MATCH_LABELS.none;
}

export function accessRequestSourceLabel(
  source?: string | null,
  utm?: { source?: string | null; medium?: string | null },
): string {
  const medium = (utm?.medium ?? '').trim().toLowerCase();
  const utmSource = (utm?.source ?? '').trim().toLowerCase();
  if (!source || source === ACCESS_REQUEST_SOURCES.ALBERTA_QR_LAUNCH) {
    if (medium === 'qr' || utmSource === 'fax') return 'QR Code — Alberta Launch';
    return 'Web Form — Alberta Launch';
  }
  return ACCESS_REQUEST_SOURCE_LABELS[source] ?? source;
}

export function formatAccessRequestId(requestNumber: number | null | undefined): string {
  const n = Number(requestNumber);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `REQ-${String(Math.trunc(n)).padStart(6, '0')}`;
}

export function parseAccessRequestId(value: string): number | null {
  const trimmed = value.trim().toUpperCase();
  const match = /^REQ-?0*([0-9]+)$/.exec(trimmed);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAccessEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLicenceNumber(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function licenceNumbersMatch(a: string, b: string): boolean {
  return normalizeLicenceNumber(a).toLowerCase() === normalizeLicenceNumber(b).toLowerCase();
}

/** Store Canadian numbers as 10–15 digits when possible. */
export function normalizeAccessPhone(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

export function isValidOptionalPhone(value: string | null | undefined): boolean {
  const normalized = normalizeAccessPhone(value);
  if (normalized == null) return true;
  return normalized.length >= 10 && normalized.length <= 15;
}

export function formatCanadianPhoneDisplay(value: string | null | undefined): string {
  return formatDocumentFaxNumber(value) ?? '';
}

export function normalizePharmacyNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function pharmacyNamesMatch(a: string, b: string): boolean {
  return normalizePharmacyNameForMatch(a) === normalizePharmacyNameForMatch(b);
}

export function accessRequestDisplayStatus(input: {
  status: string;
  matchType?: string | null;
}): string {
  if (input.status === ACCESS_REQUEST_STATUSES.APPROVED) return ACCESS_REQUEST_STATUS_LABELS.approved;
  if (input.status === ACCESS_REQUEST_STATUSES.REJECTED) return ACCESS_REQUEST_STATUS_LABELS.rejected;
  if (input.status === ACCESS_REQUEST_STATUSES.NEEDS_REVIEW) {
    return ACCESS_REQUEST_STATUS_LABELS.needs_review;
  }
  if (
    input.matchType === ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT ||
    input.matchType === ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT
  ) {
    return ACCESS_REQUEST_STATUS_LABELS.existing_match;
  }
  if (input.matchType === ACCESS_REQUEST_MATCH_TYPES.POSSIBLE) {
    return ACCESS_REQUEST_MATCH_LABELS.possible;
  }
  return ACCESS_REQUEST_STATUS_LABELS.pending;
}

export function isExactPharmacyMatch(matchType: string | null | undefined): boolean {
  return (
    matchType === ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT ||
    matchType === ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT
  );
}
