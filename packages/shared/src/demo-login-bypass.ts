/**
 * Demo / walkthrough accounts that skip login email 2FA after a valid password.
 * Password is still required. Set DEMO_LOGIN_BYPASS_EMAILS=none to disable.
 */
export const DEFAULT_DEMO_LOGIN_BYPASS_EMAILS = [
  'pharmacist@demo-pharmacy.com',
  'admin@demo-pharmacy.com',
  'admin@safescript.com',
  'pharmacy-admin@safescript.com',
  'clinical-admin@safescript.com',
] as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseDemoLoginBypassEmails(raw?: string | null): string[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return [...DEFAULT_DEMO_LOGIN_BYPASS_EMAILS];
  }
  if (trimmed.toLowerCase() === 'none' || trimmed === '-') {
    return [];
  }
  const extras = trimmed
    .split(/[,;\n]/)
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
  return [...new Set([...DEFAULT_DEMO_LOGIN_BYPASS_EMAILS, ...extras])];
}

export function isDemoLoginBypassEmail(
  email: string,
  rawEnv?: string | null,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return parseDemoLoginBypassEmails(rawEnv).includes(normalized);
}

export function shouldChallengeLoginEmail2fa(input: {
  enabled: boolean;
  role: string;
  email: string;
  bypassEmails?: string | null;
  requiresRole: (role: string) => boolean;
}): boolean {
  if (!input.enabled) return false;
  if (!input.requiresRole(input.role)) return false;
  if (isDemoLoginBypassEmail(input.email, input.bypassEmails)) return false;
  return true;
}
