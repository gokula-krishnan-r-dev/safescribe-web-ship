import {
  detectImageMime,
  extensionForMime,
  logoObjectKey,
  signatureObjectKey,
} from './branding.util';

describe('branding.util', () => {
  it('detects PNG and JPEG magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMime(png)).toBe('image/png');
    expect(detectImageMime(jpeg)).toBe('image/jpeg');
    expect(detectImageMime(Buffer.from([0x00, 0x01]))).toBeNull();
  });

  it('builds tenant-scoped object keys', () => {
    expect(signatureObjectKey('t1', 'u1', '.png')).toBe('users/t1/u1/signature.png');
    expect(signatureObjectKey(null, 'u1', '.jpg')).toBe('users/platform/u1/signature.jpg');
    expect(logoObjectKey('t1', '.png')).toBe('tenants/t1/logo.png');
    expect(extensionForMime('image/png')).toBe('.png');
    expect(extensionForMime('image/jpeg')).toBe('.jpg');
  });
});
