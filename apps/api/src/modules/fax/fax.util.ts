/**
 * Normalize pharmacist-entered fax numbers to E.164 when possible (NANP + others).
 */
export function normalizeFaxNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return hasPlus ? `+${digits}` : digits;
  }

  // North American 10-digit → +1
  if (digits.length === 10) return `+1${digits}`;
  // 11-digit starting with 1 → +1…
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return hasPlus || digits.length > 11 ? `+${digits}` : `+${digits}`;
}

export function stripPdfDataUrl(base64OrDataUrl: string): string {
  const s = base64OrDataUrl.trim();
  const marker = 'base64,';
  const idx = s.indexOf(marker);
  if (s.startsWith('data:') && idx >= 0) return s.slice(idx + marker.length);
  return s.replace(/\s+/g, '');
}

export function decodePdfBase64(base64OrDataUrl: string): Buffer {
  const b64 = stripPdfDataUrl(base64OrDataUrl);
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 5 || buf.subarray(0, 5).toString('utf8') !== '%PDF-') {
    throw new Error('Invalid PDF payload');
  }
  return buf;
}

/** Max decoded PDF size accepted for fax (iFax request limit is 20MB). */
export const MAX_FAX_PDF_BYTES = 15 * 1024 * 1024;
