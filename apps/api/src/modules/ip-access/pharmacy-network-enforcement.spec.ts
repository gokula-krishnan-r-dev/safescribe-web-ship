import { isPharmacyIpRestrictionActive } from './pharmacy-network-enforcement';

describe('isPharmacyIpRestrictionActive', () => {
  it('enforces only when the toggle is on and an IP is approved', () => {
    expect(isPharmacyIpRestrictionActive(true, 1)).toBe(true);
    expect(isPharmacyIpRestrictionActive(true, 3)).toBe(true);
  });

  it('allows any location when the toggle is off', () => {
    expect(isPharmacyIpRestrictionActive(false, 0)).toBe(false);
    expect(isPharmacyIpRestrictionActive(false, 2)).toBe(false);
  });

  it('stays open when the toggle is on but no IP is registered yet', () => {
    expect(isPharmacyIpRestrictionActive(true, 0)).toBe(false);
  });
});
