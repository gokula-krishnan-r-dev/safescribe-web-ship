import { createHmac, timingSafeEqual } from 'crypto';

export const PHIX_SYNC_MAX_SKEW_MS = 5 * 60 * 1000;
export const PHIX_SYNC_NONCE_TTL_SECONDS = 10 * 60;

export function phixHmacPayload(timestamp: string, nonce: string, rawBody: string): string {
  return `${timestamp}.${nonce}.${rawBody}`;
}

export function signPhixBody(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(phixHmacPayload(timestamp, nonce, rawBody), 'utf8')
    .digest('hex');
}

export function hexTimingSafeEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    if (left.length === 0 || left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function verifyPhixHmac(input: {
  secret: string;
  signature: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: 'format' | 'skew' | 'signature' } {
  const { secret, signature, timestamp, nonce, rawBody } = input;
  if (!secret || !signature || !timestamp || !nonce) {
    return { ok: false, reason: 'format' };
  }
  if (!/^[0-9]+$/.test(timestamp) || nonce.length < 8 || nonce.length > 128) {
    return { ok: false, reason: 'format' };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'format' };
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - ts) > PHIX_SYNC_MAX_SKEW_MS) {
    return { ok: false, reason: 'skew' };
  }

  const expected = signPhixBody(secret, timestamp, nonce, rawBody);
  if (!hexTimingSafeEqual(expected, signature.toLowerCase())) {
    return { ok: false, reason: 'signature' };
  }
  return { ok: true };
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function secretsEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
