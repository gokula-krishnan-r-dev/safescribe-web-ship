/** Production marketing hosts — Renew follows the env flag (off unless explicitly enabled). */
export const RENEW_PRODUCTION_HOSTS = [
  'safescribe.ca',
  'www.safescribe.ca',
  'app.safescribe.ca',
] as const;

/** Staging + local hosts always showcase Renew. */
export const RENEW_SHOWCASE_HOSTS = [
  'staging.safescribe.ca',
  'localhost',
  '127.0.0.1',
] as const;

export function parseEnabledFlag(value: string | null | undefined, fallback = true): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return fallback;
}

/**
 * UI gate for Renew:
 * - staging + local: always on
 * - production marketing hosts: on only when env flag is explicitly true
 * - preview / other hosts: env flag (default on)
 */
export function isRenewUiEnabled(opts: {
  hostname?: string | null;
  envFlag?: string | null;
}): boolean {
  const host = (opts.hostname ?? '').split(':')[0]?.toLowerCase() ?? '';
  if ((RENEW_SHOWCASE_HOSTS as readonly string[]).includes(host)) return true;
  if ((RENEW_PRODUCTION_HOSTS as readonly string[]).includes(host)) {
    return parseEnabledFlag(opts.envFlag, false);
  }
  return parseEnabledFlag(opts.envFlag, true);
}
