/** Server-owned professional-use acknowledgement copy and gate helpers. */

export const PROFESSIONAL_ACK_VERSION = '2026-08-16-v1';

/** Redis TTL for the current-login acknowledgement flag (covers remember-me sessions). */
export const PROFESSIONAL_ACK_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const PROFESSIONAL_ACK_HEADING = 'Professional use acknowledgement';

export const PROFESSIONAL_ACK_BODY =
  'SafeScribe supports clinical decision-making and documentation but does not replace your professional judgment. You remain responsible for all prescribing decisions.';

export const PROFESSIONAL_ACK_SOURCE = 'post_login_gate';

export const PROFESSIONAL_ACK_PATH = '/professional-use-acknowledgement';

/** Post-login Prescribe workspace — never a stale consultation deep-link. */
export const PROFESSIONAL_ACK_DEFAULT_RETURN_TO = '/pharmacist/consultations';

/** Pharmacy admin home opens the Prescribe workspace after acknowledgement. */
export const PROFESSIONAL_ACK_ADMIN_RETURN_TO = '/admin';

const PROFESSIONAL_ACK_ROLES = new Set(['PHARMACIST', 'PHARMACIST_ADMIN']);

export const PROFESSIONAL_ACK_SAVE_ERROR =
  "We couldn't save your acknowledgement. Please try again.";

export const PROFESSIONAL_ACK_EVENTS = {
  REQUIRED: 'professional_ack_required',
  ACCEPTED: 'professional_ack_accepted',
  SAVE_FAILED: 'professional_ack_save_failed',
  SIGN_OUT: 'professional_ack_sign_out',
} as const;

export const PROFESSIONAL_ACK_AUDIT_MODULE = 'professional_acknowledgement';

export const PROFESSIONAL_ACK_SIGN_OUT_SOURCE = 'professional_ack_gate';

export interface ProfessionalAcknowledgementStatus {
  required: boolean;
  acknowledged: boolean;
  version: string;
  heading: string;
  body: string;
}

const BLOCKED_RETURN_PREFIXES = [
  PROFESSIONAL_ACK_PATH,
  '/login',
  '/auth',
  '/forgot-password',
  '/reset-password',
  '/access-denied',
  '/verify-network',
] as const;

function decodeReturnTo(raw: string): string | null {
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
}

export function isProfessionalAckRole(role: string | null | undefined): boolean {
  return Boolean(role && PROFESSIONAL_ACK_ROLES.has(role));
}

export function professionalAckDefaultReturnTo(role?: string | null): string {
  return role === 'PHARMACIST_ADMIN'
    ? PROFESSIONAL_ACK_ADMIN_RETURN_TO
    : PROFESSIONAL_ACK_DEFAULT_RETURN_TO;
}

function isAllowedReturnPath(pathOnly: string, role?: string | null): boolean {
  const pharmacistPath =
    pathOnly === '/pharmacist' || pathOnly.startsWith('/pharmacist/');
  const adminPath = pathOnly === '/admin' || pathOnly.startsWith('/admin/');
  if (role === 'PHARMACIST_ADMIN') return adminPath;
  if (role === 'PHARMACIST') return pharmacistPath;
  return pharmacistPath || adminPath;
}

/**
 * Allow only internal pharmacist and pharmacy-admin paths. Reject absolute URLs,
 * protocol-relative URLs, auth routes, and the acknowledgement route itself.
 * Pharmacy admins are never sent to /pharmacist (that layout rejects them).
 */
export function sanitizeReturnTo(
  raw: unknown,
  fallback = PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
  role?: string | null,
): string {
  const resolvedFallback = role ? professionalAckDefaultReturnTo(role) : fallback;
  if (typeof raw !== 'string') return resolvedFallback;
  const value = decodeReturnTo(raw);
  if (!value) return resolvedFallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return resolvedFallback;
  if (!trimmed.startsWith('/')) return resolvedFallback;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return resolvedFallback;
  if (trimmed.includes('://') || trimmed.includes('\\')) return resolvedFallback;
  if (/[<>'"\s]/.test(trimmed)) return resolvedFallback;

  const [pathWithQuery] = trimmed.split('#');
  const [pathOnly, ...queryParts] = (pathWithQuery ?? '').split('?');
  if (!pathOnly) return resolvedFallback;
  if (pathOnly.includes('..')) return resolvedFallback;
  if (!isAllowedReturnPath(pathOnly, role)) {
    return resolvedFallback;
  }
  for (const blocked of BLOCKED_RETURN_PREFIXES) {
    if (pathOnly === blocked || pathOnly.startsWith(`${blocked}/`)) return resolvedFallback;
  }
  const search = queryParts.length ? `?${queryParts.join('?')}` : '';
  return `${pathOnly}${search}`;
}

export function professionalAckHref(
  returnTo?: unknown,
  fallback = PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
  role?: string | null,
): string {
  const safe = sanitizeReturnTo(
    returnTo,
    role ? professionalAckDefaultReturnTo(role) : fallback,
    role,
  );
  return `${PROFESSIONAL_ACK_PATH}?returnTo=${encodeURIComponent(safe)}`;
}

export function pharmacistNeedsAcknowledgement(
  status: ProfessionalAcknowledgementStatus | null | undefined,
): boolean {
  return Boolean(status?.required && !status.acknowledged);
}

export function isProfessionalAckExemptApiPath(originalUrl: string): boolean {
  const raw = originalUrl.split('?')[0] ?? '';
  const path = raw.replace(/^\/api\/v1/, '') || '/';
  if (path === '/health' || path.startsWith('/health/')) return true;
  if (path.startsWith('/auth')) return true;
  if (path.startsWith('/professional-use-acknowledgement')) return true;
  if (path === '/contact' || path.startsWith('/contact/')) return true;
  if (path.startsWith('/network-verify')) return true;
  if (path.startsWith('/integrations/phix')) return true;
  return false;
}
