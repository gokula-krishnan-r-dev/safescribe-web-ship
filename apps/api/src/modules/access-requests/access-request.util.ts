import { stabilizeAllowlistCidr } from '@/common/utils/ip-matcher';

const CAPTURE_TTL_SECONDS = 30 * 60;
const CAPTURE_KEY_PREFIX = 'access-capture:';

export const ACCESS_CAPTURE_TTL_SECONDS = CAPTURE_TTL_SECONDS;

export function accessCaptureKey(token: string): string {
  return `${CAPTURE_KEY_PREFIX}${token}`;
}

/** Treat two public addresses as the same pharmacy network (IPv6 compared at site prefix). */
export function capturedNetworksMatch(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) return false;
  if (left === right) return true;
  try {
    return stabilizeAllowlistCidr(left).cidr === stabilizeAllowlistCidr(right).cidr;
  } catch {
    return false;
  }
}

export function sanitizeUtm(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}
