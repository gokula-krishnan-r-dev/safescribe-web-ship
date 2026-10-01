import { ACCESS_REQUEST_MATCH_TYPES } from '@safescript/shared';
import { findExistingPharmacyMatch } from './find-pharmacy-match';

describe('findExistingPharmacyMatch', () => {
  const shoppers = {
    id: 't1',
    name: 'Shoppers Drug Mart #1234',
    pharmacyLicenseNumber: '1234567',
    phone: '7805550100',
    phixCustomer: true,
    emails: ['manager@shoppers.ca'],
  };

  it('classifies an exact PhIX licence match', () => {
    const result = findExistingPharmacyMatch({
      licenceNumber: '1234567',
      pharmacyName: 'Shoppers',
      email: 'other@example.com',
      phone: null,
      candidates: [shoppers],
    });
    expect(result.matchType).toBe(ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT);
    expect(result.pharmacyId).toBe('t1');
    expect(result.confidence).toBe('high');
  });

  it('classifies an exact SafeScribe licence match', () => {
    const result = findExistingPharmacyMatch({
      licenceNumber: '999',
      pharmacyName: 'Main Street Pharmacy',
      email: 'a@b.ca',
      phone: null,
      candidates: [{ ...shoppers, pharmacyLicenseNumber: '999', phixCustomer: false }],
    });
    expect(result.matchType).toBe(ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT);
  });

  it('requires email or phone in addition to name for a possible match', () => {
    const nameOnly = findExistingPharmacyMatch({
      licenceNumber: 'nope',
      pharmacyName: 'Shoppers Drug Mart #1234',
      email: 'nobody@example.com',
      phone: null,
      candidates: [shoppers],
    });
    expect(nameOnly.matchType).toBe(ACCESS_REQUEST_MATCH_TYPES.NONE);

    const withEmail = findExistingPharmacyMatch({
      licenceNumber: 'nope',
      pharmacyName: 'Shoppers Drug Mart #1234',
      email: 'manager@shoppers.ca',
      phone: null,
      candidates: [shoppers],
    });
    expect(withEmail.matchType).toBe(ACCESS_REQUEST_MATCH_TYPES.POSSIBLE);
    expect(withEmail.pharmacyId).toBe('t1');
  });
});
