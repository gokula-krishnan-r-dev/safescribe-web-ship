/** Super Admin platform functions — all still authenticate as SUPER_ADMIN. */

export const SUPER_ADMIN_SCOPES = {
  /** Pharmacy tenants and clinical platform. */
  FULL: 'FULL',
  /** Pharmacies, pharmacist admins, network access, inquiries, activity log. */
  PHARMACY: 'PHARMACY',
  /** Pathways, Safety Alert, assist system, document formats, platform settings. */
  CLINICAL: 'CLINICAL',
} as const;

export type SuperAdminScope = (typeof SUPER_ADMIN_SCOPES)[keyof typeof SUPER_ADMIN_SCOPES];

export const SUPER_ADMIN_SCOPE_LABELS: Record<SuperAdminScope, string> = {
  FULL: 'Pharmacy & Clinical',
  PHARMACY: 'Pharmacy management',
  CLINICAL: 'Clinical management',
};

export const SUPER_ADMIN_SCOPE_DESCRIPTIONS: Record<SuperAdminScope, string> = {
  FULL: 'Manage pharmacies and the clinical platform.',
  PHARMACY: 'Manage pharmacies, pharmacist admins, network access, and activity logs only.',
  CLINICAL: 'Manage clinical pathways, Safety Alert, assist system, and document formats only.',
};

export const PLATFORM_ACCESS = {
  PHARMACY: 'pharmacy',
  CLINICAL: 'clinical',
  FULL: 'full',
} as const;

export type PlatformAccess = (typeof PLATFORM_ACCESS)[keyof typeof PLATFORM_ACCESS];

export type SuperAdminPortalId = 'pharmacy' | 'platform';

export function isSuperAdminScope(value: string | null | undefined): value is SuperAdminScope {
  return (
    value === SUPER_ADMIN_SCOPES.FULL ||
    value === SUPER_ADMIN_SCOPES.PHARMACY ||
    value === SUPER_ADMIN_SCOPES.CLINICAL
  );
}

/**
 * SUPER_ADMIN with a missing scope is treated as FULL so existing accounts keep access.
 * Non–super-admin roles have no platform function.
 */
export function resolveSuperAdminScope(
  role: string | null | undefined,
  scope: string | null | undefined,
): SuperAdminScope | null {
  if (role !== 'SUPER_ADMIN') return null;
  return isSuperAdminScope(scope) ? scope : SUPER_ADMIN_SCOPES.FULL;
}

export function canAccessPharmacyManagement(scope: SuperAdminScope | null | undefined): boolean {
  return scope === SUPER_ADMIN_SCOPES.FULL || scope === SUPER_ADMIN_SCOPES.PHARMACY;
}

export function canAccessClinicalManagement(scope: SuperAdminScope | null | undefined): boolean {
  return scope === SUPER_ADMIN_SCOPES.FULL || scope === SUPER_ADMIN_SCOPES.CLINICAL;
}

export function canManagePlatformAdmins(scope: SuperAdminScope | null | undefined): boolean {
  return scope === SUPER_ADMIN_SCOPES.FULL;
}

export function hasPlatformAccess(
  scope: SuperAdminScope | null | undefined,
  required: PlatformAccess,
): boolean {
  if (required === PLATFORM_ACCESS.FULL) return canManagePlatformAdmins(scope);
  if (required === PLATFORM_ACCESS.PHARMACY) return canAccessPharmacyManagement(scope);
  if (required === PLATFORM_ACCESS.CLINICAL) return canAccessClinicalManagement(scope);
  return false;
}

export function allowedSuperAdminPortals(
  scope: SuperAdminScope | null | undefined,
): SuperAdminPortalId[] {
  const portals: SuperAdminPortalId[] = [];
  if (canAccessPharmacyManagement(scope)) portals.push('pharmacy');
  if (canAccessClinicalManagement(scope)) portals.push('platform');
  return portals;
}

export function defaultSuperAdminPortal(
  scope: SuperAdminScope | null | undefined,
): SuperAdminPortalId {
  return allowedSuperAdminPortals(scope)[0] ?? 'pharmacy';
}

export const PLATFORM_ACCESS_DENIED_MESSAGE =
  'Your platform administrator role does not include access to this area.';
