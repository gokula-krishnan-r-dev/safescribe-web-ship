import { ROLES, type RoleName } from '@safescript/shared';

const PHARMACIST_ADMIN_ROLES = new Set(['PHARMACY_OWNER', 'PHARMACY_MANAGER']);

/** pg may return enum arrays as `{OWNER,PHARMACIST}` strings rather than JS arrays. */
export function normalizePhixRoles(roles: unknown): string[] {
  if (Array.isArray(roles)) {
    return roles.map((role) => String(role).trim()).filter(Boolean);
  }
  if (typeof roles !== 'string') {
    return [];
  }
  const trimmed = roles.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((role) => role.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((role) => String(role).trim()).filter(Boolean);
    }
  } catch {
    // fall through
  }
  return [trimmed];
}

export function mapPhixRolesToSafescribe(roles: unknown): RoleName {
  if (normalizePhixRoles(roles).some((role) => PHARMACIST_ADMIN_ROLES.has(role))) {
    return ROLES.PHARMACIST_ADMIN;
  }
  return ROLES.PHARMACIST;
}

export function splitDisplayName(displayName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) return { firstName: 'Pharmacy', lastName: 'User' };
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] ?? 'Pharmacy';
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

export function slugifyPharmacyName(name: string, fallbackId: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const suffix = fallbackId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase() || 'phix';
  return `${slug || 'pharmacy'}-${suffix}`;
}

export const PHIX_SYNC_EVENTS = [
  'pharmacy.upsert',
  'pharmacy.verified',
  'pharmacy.suspended',
  'pharmacy.resumed',
  'pharmacy.deleted',
  'user.upsert',
  'user.suspended',
  'user.resumed',
  'user.removed',
  'user.deleted',
  'user.password',
] as const;

export type PhixSyncEventName = (typeof PHIX_SYNC_EVENTS)[number];
