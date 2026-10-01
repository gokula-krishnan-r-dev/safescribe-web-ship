import { isRenewUiEnabled } from '@safescript/shared';

export function isRenewModuleEnabled(hostname?: string | null): boolean {
  return isRenewUiEnabled({
    hostname:
      hostname ?? (typeof window !== 'undefined' ? window.location.hostname : undefined),
    envFlag: process.env.NEXT_PUBLIC_SAFESCRIBE_RENEW_ENABLED,
  });
}
