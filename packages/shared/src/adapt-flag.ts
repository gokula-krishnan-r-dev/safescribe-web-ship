import {
  parseEnabledFlag,
  RENEW_PRODUCTION_HOSTS,
  RENEW_SHOWCASE_HOSTS,
} from './renew-flag';

/**
 * UI gate for Adapt (aligned with Renew):
 * - staging + local: always on
 * - production marketing hosts: on only when env flag is explicitly true
 * - preview / other hosts: env flag (default off)
 */
export function isAdaptUiEnabled(opts: {
  hostname?: string | null;
  envFlag?: string | null;
}): boolean {
  const host = (opts.hostname ?? '').split(':')[0]?.toLowerCase() ?? '';
  if ((RENEW_SHOWCASE_HOSTS as readonly string[]).includes(host)) return true;
  if ((RENEW_PRODUCTION_HOSTS as readonly string[]).includes(host)) {
    return parseEnabledFlag(opts.envFlag, false);
  }
  return parseEnabledFlag(opts.envFlag, false);
}
