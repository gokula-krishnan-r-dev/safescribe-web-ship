import {
  ACCESS_REQUEST_MATCH_TYPES,
  licenceNumbersMatch,
  normalizeAccessEmail,
  normalizeAccessPhone,
  pharmacyNamesMatch,
  type AccessRequestMatchType,
} from '@safescript/shared';

export interface PharmacyMatchCandidate {
  id: string;
  name: string;
  pharmacyLicenseNumber: string | null;
  phone: string | null;
  phixCustomer: boolean;
  emails?: string[];
}

export interface PharmacyMatchResult {
  matchType: AccessRequestMatchType;
  pharmacyId?: string;
  confidence?: 'high' | 'medium' | 'low';
  reasons: string[];
}

export function findExistingPharmacyMatch(input: {
  licenceNumber: string;
  pharmacyName: string;
  email: string;
  phone: string | null;
  candidates: PharmacyMatchCandidate[];
}): PharmacyMatchResult {
  const licence = input.licenceNumber.trim();
  const email = normalizeAccessEmail(input.email);
  const phone = normalizeAccessPhone(input.phone);

  if (licence) {
    const exact = input.candidates.find(
      (row) =>
        Boolean(row.pharmacyLicenseNumber) &&
        licenceNumbersMatch(row.pharmacyLicenseNumber ?? '', licence),
    );
    if (exact) {
      return {
        matchType: exact.phixCustomer
          ? ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT
          : ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT,
        pharmacyId: exact.id,
        confidence: 'high',
        reasons: exact.phixCustomer
          ? ['Exact Alberta licence number match', 'Existing PhIX pharmacy']
          : ['Exact Alberta licence number match'],
      };
    }
  }

  const possible = input.candidates.find((row) => {
    const nameMatches = pharmacyNamesMatch(row.name, input.pharmacyName);
    if (!nameMatches) return false;
    const emailMatches = (row.emails ?? []).some((value) => normalizeAccessEmail(value) === email);
    const phoneMatches = Boolean(phone && normalizeAccessPhone(row.phone) === phone);
    return emailMatches || phoneMatches;
  });

  if (possible) {
    const reasons: string[] = ['Normalized pharmacy name match'];
    if ((possible.emails ?? []).some((value) => normalizeAccessEmail(value) === email)) {
      reasons.push('Same work email');
    }
    if (phone && normalizeAccessPhone(possible.phone) === phone) {
      reasons.push('Same phone number');
    }
    return {
      matchType: ACCESS_REQUEST_MATCH_TYPES.POSSIBLE,
      pharmacyId: possible.id,
      confidence: 'medium',
      reasons,
    };
  }

  return { matchType: ACCESS_REQUEST_MATCH_TYPES.NONE, reasons: [] };
}
