export const BRANDING_MAX_BYTES = 2 * 1024 * 1024;
export const BRANDING_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);

export type BrandingKind = 'signature' | 'logo';

export function extensionForMime(mime: string): '.png' | '.jpg' {
  return mime.includes('png') ? '.png' : '.jpg';
}

export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

export function signatureObjectKey(tenantId: string | null, userId: string, ext: string): string {
  const tenant = tenantId || 'platform';
  return `users/${tenant}/${userId}/signature${ext}`;
}

export function logoObjectKey(tenantId: string, ext: string): string {
  return `tenants/${tenantId}/logo${ext}`;
}
