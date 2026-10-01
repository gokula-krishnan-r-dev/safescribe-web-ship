export const RENEW_EXTRACT_REDIS_PREFIX = 'renew-med-extract:v3:';

export const RENEW_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const RENEW_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const RENEW_PDF_EXTENSIONS = new Set(['.pdf']);

export const RENEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const RENEW_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const RENEW_EXTRACT_MAX_FILES = 8;
