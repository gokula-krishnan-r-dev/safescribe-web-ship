import { getClientIp, isUsablePublicClientIp } from './client-info';
import { isCloudflareIp } from './cloudflare-ips';

function fakeReq(headers: Record<string, string>, ip = '127.0.0.1'): any {
  return {
    headers,
    ip,
    socket: { remoteAddress: ip },
  };
}

describe('isCloudflareIp', () => {
  it('detects Cloudflare edge addresses', () => {
    expect(isCloudflareIp('104.22.66.45')).toBe(true);
    expect(isCloudflareIp('172.67.161.99')).toBe(true);
  });

  it('allows public documentation IPs', () => {
    expect(isCloudflareIp('203.0.113.10')).toBe(false);
    expect(isCloudflareIp('198.51.100.10')).toBe(false);
  });
});

describe('getClientIp', () => {
  it('prefers nginx X-Real-IP when it is a public subscriber address', () => {
    expect(
      getClientIp(
        fakeReq({
          'x-real-ip': '203.0.113.10',
          'cf-connecting-ip': '203.0.113.10',
          'x-forwarded-for': '203.0.113.10, 104.22.66.45',
        }),
      ),
    ).toBe('203.0.113.10');
  });

  it('unwraps Cloudflare when X-Real-IP is still an edge address', () => {
    expect(
      getClientIp(
        fakeReq({
          'x-real-ip': '104.22.66.45',
          'cf-connecting-ip': '203.0.113.10',
          'x-forwarded-for': '203.0.113.10, 104.22.66.45',
        }),
      ),
    ).toBe('203.0.113.10');
  });

  it('skips Cloudflare hops in X-Forwarded-For', () => {
    expect(
      getClientIp(
        fakeReq({
          'x-forwarded-for': '203.0.113.10, 104.22.66.45',
        }),
      ),
    ).toBe('203.0.113.10');
  });

  it('marks Cloudflare edges as unusable for pharmacy allowlists', () => {
    expect(isUsablePublicClientIp('104.22.66.45')).toBe(false);
    expect(isUsablePublicClientIp('203.0.113.10')).toBe(true);
  });
});
