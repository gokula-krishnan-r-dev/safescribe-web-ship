import {
  allowedSuperAdminPortals,
  canAccessClinicalManagement,
  canAccessPharmacyManagement,
  canManagePlatformAdmins,
  defaultSuperAdminPortal,
  hasPlatformAccess,
  PLATFORM_ACCESS,
  resolveSuperAdminScope,
  SUPER_ADMIN_SCOPES,
} from './super-admin-scope';

describe('super admin platform scope', () => {
  it('treats a legacy SUPER_ADMIN with no stored scope as full access', () => {
    expect(resolveSuperAdminScope('SUPER_ADMIN', null)).toBe(SUPER_ADMIN_SCOPES.FULL);
    expect(resolveSuperAdminScope('SUPER_ADMIN', undefined)).toBe(SUPER_ADMIN_SCOPES.FULL);
  });

  it('does not invent a platform scope for tenant roles', () => {
    expect(resolveSuperAdminScope('PHARMACIST', 'FULL')).toBeNull();
    expect(resolveSuperAdminScope('PHARMACIST_ADMIN', null)).toBeNull();
  });

  it('keeps pharmacy-only accounts out of clinical management', () => {
    const scope = SUPER_ADMIN_SCOPES.PHARMACY;
    expect(canAccessPharmacyManagement(scope)).toBe(true);
    expect(canAccessClinicalManagement(scope)).toBe(false);
    expect(canManagePlatformAdmins(scope)).toBe(false);
    expect(hasPlatformAccess(scope, PLATFORM_ACCESS.CLINICAL)).toBe(false);
    expect(allowedSuperAdminPortals(scope)).toEqual(['pharmacy']);
    expect(defaultSuperAdminPortal(scope)).toBe('pharmacy');
  });

  it('keeps clinical-only accounts out of pharmacy management', () => {
    const scope = SUPER_ADMIN_SCOPES.CLINICAL;
    expect(canAccessClinicalManagement(scope)).toBe(true);
    expect(canAccessPharmacyManagement(scope)).toBe(false);
    expect(hasPlatformAccess(scope, PLATFORM_ACCESS.PHARMACY)).toBe(false);
    expect(allowedSuperAdminPortals(scope)).toEqual(['platform']);
    expect(defaultSuperAdminPortal(scope)).toBe('platform');
  });

  it('lets full admins use both portals and manage other platform admins', () => {
    const scope = SUPER_ADMIN_SCOPES.FULL;
    expect(hasPlatformAccess(scope, PLATFORM_ACCESS.PHARMACY)).toBe(true);
    expect(hasPlatformAccess(scope, PLATFORM_ACCESS.CLINICAL)).toBe(true);
    expect(hasPlatformAccess(scope, PLATFORM_ACCESS.FULL)).toBe(true);
    expect(allowedSuperAdminPortals(scope)).toEqual(['pharmacy', 'platform']);
  });
});
