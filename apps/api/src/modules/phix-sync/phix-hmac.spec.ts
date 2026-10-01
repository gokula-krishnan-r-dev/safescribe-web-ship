import {
  hexTimingSafeEqual,
  signPhixBody,
  verifyPhixHmac,
} from './phix-hmac';

describe('phix HMAC', () => {
  const secret = 'integration-hmac-secret-min-32-chars!!';
  const timestamp = String(Date.now());
  const nonce = 'nonce-abc-12345';
  const body = '{"event":"pharmacy.upsert"}';

  it('accepts a matching signature within skew', () => {
    const signature = signPhixBody(secret, timestamp, nonce, body);
    expect(
      verifyPhixHmac({
        secret,
        signature,
        timestamp,
        nonce,
        rawBody: body,
        nowMs: Number(timestamp),
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a bad signature, stale timestamp, and malformed headers', () => {
    const signature = signPhixBody(secret, timestamp, nonce, body);
    expect(
      verifyPhixHmac({
        secret,
        signature: '00'.repeat(32),
        timestamp,
        nonce,
        rawBody: body,
        nowMs: Number(timestamp),
      }).ok,
    ).toBe(false);
    expect(
      verifyPhixHmac({
        secret,
        signature,
        timestamp: String(Number(timestamp) - 10 * 60 * 1000),
        nonce,
        rawBody: body,
        nowMs: Number(timestamp),
      }),
    ).toEqual({ ok: false, reason: 'skew' });
    expect(
      verifyPhixHmac({
        secret,
        signature,
        timestamp: 'nope',
        nonce,
        rawBody: body,
      }),
    ).toEqual({ ok: false, reason: 'format' });
  });

  it('compares hex signatures in constant time', () => {
    const a = signPhixBody(secret, timestamp, nonce, body);
    expect(hexTimingSafeEqual(a, a)).toBe(true);
    expect(hexTimingSafeEqual(a, 'ab')).toBe(false);
  });
});
