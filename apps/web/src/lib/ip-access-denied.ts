const STORAGE_KEY = 'safescribe.ip-access-denied';

export interface IpAccessDeniedDetails {
  detectedFamily?: 'ipv4' | 'ipv6' | null;
  recommendedCidr?: string | null;
  dualStack?: string | null;
}

export function rememberIpAccessDenied(error: unknown) {
  if (typeof window === 'undefined' || !error || typeof error !== 'object') return;
  const err = error as IpAccessDeniedDetails & { error?: string };
  if (err.error && err.error !== 'IP_ACCESS_DENIED') return;
  const details: IpAccessDeniedDetails = {
    detectedFamily: err.detectedFamily ?? null,
    recommendedCidr: err.recommendedCidr ?? null,
    dualStack: err.dualStack ?? null,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readIpAccessDenied(): IpAccessDeniedDetails | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IpAccessDeniedDetails;
  } catch {
    return null;
  }
}
