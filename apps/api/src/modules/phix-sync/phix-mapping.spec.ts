import { ROLES } from '@safescript/shared';
import { mapPhixRolesToSafescribe, slugifyPharmacyName, splitDisplayName } from './phix-mapping';

describe('phix mapping', () => {
  it('maps owners and managers to pharmacist admin', () => {
    expect(mapPhixRolesToSafescribe(['PHARMACY_OWNER'])).toBe(ROLES.PHARMACIST_ADMIN);
    expect(mapPhixRolesToSafescribe(['PHARMACIST', 'PHARMACY_MANAGER'])).toBe(
      ROLES.PHARMACIST_ADMIN,
    );
    expect(mapPhixRolesToSafescribe(['PHARMACIST', 'TECHNICIAN'])).toBe(ROLES.PHARMACIST);
    expect(mapPhixRolesToSafescribe([])).toBe(ROLES.PHARMACIST);
    expect(mapPhixRolesToSafescribe('{PHARMACY_OWNER,PHARMACIST}')).toBe(ROLES.PHARMACIST_ADMIN);
    expect(mapPhixRolesToSafescribe('{TECHNICIAN}')).toBe(ROLES.PHARMACIST);
  });

  it('splits display names and slugs pharmacy names', () => {
    expect(splitDisplayName('Jane Marie Doe')).toEqual({
      firstName: 'Jane',
      lastName: 'Marie Doe',
    });
    expect(splitDisplayName('Ada')).toEqual({ firstName: 'Ada', lastName: 'Ada' });
    expect(splitDisplayName('')).toEqual({ firstName: 'Pharmacy', lastName: 'User' });
    expect(slugifyPharmacyName('Chappelle Pharmacy', 'clxyz1234567')).toMatch(
      /^chappelle-pharmacy-/,
    );
  });
});
