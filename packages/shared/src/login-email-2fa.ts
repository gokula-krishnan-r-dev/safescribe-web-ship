/** Structured codes for email-based login two-factor verification. */
export const LOGIN_EMAIL_2FA = {
  REQUIRED: 'LOGIN_EMAIL_2FA_REQUIRED',
  INVALID_OR_EXPIRED: 'LOGIN_EMAIL_2FA_INVALID_OR_EXPIRED',
  RESEND_COOLDOWN: 'LOGIN_EMAIL_2FA_RESEND_COOLDOWN',
} as const;

export type LoginEmail2faCode = (typeof LOGIN_EMAIL_2FA)[keyof typeof LOGIN_EMAIL_2FA];

/** Roles that must complete email verification after password login. */
export const LOGIN_EMAIL_2FA_ROLES = {
  PHARMACIST_ADMIN: 'PHARMACIST_ADMIN',
  PHARMACIST: 'PHARMACIST',
} as const;

export function requiresLoginEmail2fa(role: string): boolean {
  return (
    role === LOGIN_EMAIL_2FA_ROLES.PHARMACIST_ADMIN ||
    role === LOGIN_EMAIL_2FA_ROLES.PHARMACIST
  );
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}***@${domain}`;
}

export interface LoginEmail2faChallengeResponse {
  requiresEmailVerification: true;
  challengeId: string;
  emailMasked: string;
  expiresInSeconds: number;
  mailed: boolean;
}
