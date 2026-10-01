/**
 * Super Admin portals after exclusive sign-in at `/auth/admin/access`.
 * - Pharmacy Management  → /super-admin
 * - Clinical Platform    → /super-admin/platform
 */

import { SUPER_ADMIN_ACCESS_PATH, SUPER_ADMIN_SCOPES, type SuperAdminScope, allowedSuperAdminPortals, isSuperAdminScope } from '@safescript/shared';

export type SuperAdminPortal = 'pharmacy' | 'platform';

export const SUPER_ADMIN_PORTAL_KEY = 'safescribe.superAdminPortal';

export const SUPER_ADMIN_PORTALS = {
  pharmacy: {
    id: 'pharmacy' as const,
    name: 'Pharmacy Management',
    shortName: 'Pharmacy',
    description:
      'Manage pharmacies, pharmacist admins, launch requests, contact inquiries, and platform activity logs.',
    loginPath: SUPER_ADMIN_ACCESS_PATH,
    homePath: '/super-admin',
    choosePath: '/super-admin/choose',
  },
  platform: {
    id: 'platform' as const,
    name: 'Clinical Platform',
    shortName: 'Clinical',
    description:
      'Clinical pathways, pathway test cases, reference and reviewer libraries, Safety Alert, assist system, document formats, and platform settings.',
    loginPath: SUPER_ADMIN_ACCESS_PATH,
    homePath: '/super-admin/platform',
    choosePath: '/super-admin/choose',
  },
} as const;

/** Routes that belong to the Clinical Platform portal. */
const PLATFORM_ROUTE_PREFIXES = [
  '/super-admin/platform',
  '/super-admin/pathways',
  '/super-admin/pathway-qa',
  '/super-admin/treatment-library',
  '/super-admin/approved-indications',
  '/super-admin/reference-library',
  '/super-admin/reviewer-library',
  '/super-admin/safety-engine',
  '/super-admin/ai-system',
  '/super-admin/doc-download-format',
  '/super-admin/doc-format',
  '/super-admin/settings',
  '/super-admin/allergy-rules',
] as const;

export function resolvePortalFromPath(pathname: string): SuperAdminPortal {
  if (
    PLATFORM_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return 'platform';
  }
  return 'pharmacy';
}

export function readStoredPortal(): SuperAdminPortal | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUPER_ADMIN_PORTAL_KEY);
    if (raw === 'pharmacy' || raw === 'platform') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredPortal(portal: SuperAdminPortal) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SUPER_ADMIN_PORTAL_KEY, portal);
  } catch {
    /* ignore */
  }
}

export function getPortalHome(portal: SuperAdminPortal): string {
  return SUPER_ADMIN_PORTALS[portal].homePath;
}

export function getPortalLogin(_portal?: SuperAdminPortal): string {
  return SUPER_ADMIN_ACCESS_PATH;
}

export function resolvePostLoginPath(
  portal?: SuperAdminPortal | null,
  scope?: SuperAdminScope | null,
): string {
  const resolved = isSuperAdminScope(scope) ? scope : SUPER_ADMIN_SCOPES.FULL;
  const allowed = allowedSuperAdminPortals(resolved);
  const allowedSet = new Set(allowed);

  if (portal && allowedSet.has(portal)) return getPortalHome(portal);

  const stored = readStoredPortal();
  if (stored && allowedSet.has(stored)) return getPortalHome(stored);

  if (allowed.length > 1) return '/super-admin/choose';
  return getPortalHome(allowed[0] ?? 'pharmacy');
}
