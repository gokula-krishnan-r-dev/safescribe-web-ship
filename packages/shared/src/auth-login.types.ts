/** Login entry channels — Super Admin may only authenticate via admin_access. */

export const LOGIN_CHANNELS = {
  /** Pharmacist / Pharmacist Admin pharmacy workspace login (`/login`). */
  PHARMACY: 'pharmacy',
  /** Exclusive Super Admin entry (`/auth/admin/access`). */
  SUPER_ADMIN_ACCESS: 'super_admin_access',
} as const;

export type LoginChannel = (typeof LOGIN_CHANNELS)[keyof typeof LOGIN_CHANNELS];

/** Canonical Super Admin sign-in path (web). */
export const SUPER_ADMIN_ACCESS_PATH = '/auth/admin/access';

/**
 * Absolute authenticated session lifetime from login.
 * Refresh rotation must not extend past this window.
 */
export const AUTH_SESSION_MAX_DAYS = 7;
export const AUTH_SESSION_MAX_MS = AUTH_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
export const AUTH_SESSION_MAX_SECONDS = AUTH_SESSION_MAX_DAYS * 24 * 60 * 60;

export function authSessionExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + AUTH_SESSION_MAX_MS);
}
