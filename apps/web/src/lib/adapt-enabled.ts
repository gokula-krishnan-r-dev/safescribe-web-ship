import { isAdaptUiEnabled } from '@safescript/shared';

export function isAdaptModuleEnabled(hostname?: string | null): boolean {
  return isAdaptUiEnabled({
    hostname:
      hostname ?? (typeof window !== 'undefined' ? window.location.hostname : undefined),
    envFlag: process.env.NEXT_PUBLIC_SAFESCRIBE_ADAPT_ENABLED,
  });
}
