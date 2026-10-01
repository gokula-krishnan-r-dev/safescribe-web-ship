/** Dedup / cache helpers for Patient Care Summary Cloud Translation. */

export const HANDOUT_TRANSLATION_CACHE_PREFIX = 'handout:tr:v1';

export function handoutTranslationCacheKey(
  sourceHash: string,
  language: string,
  model: string,
): string {
  return `${HANDOUT_TRANSLATION_CACHE_PREFIX}:${sourceHash}:${language}:${model}`;
}

/**
 * Translate unique non-empty strings once, then restore original order.
 * Empty / whitespace-only units never leave the server.
 */
export function collapseTranslateBatch(texts: string[]): {
  unique: string[];
  expand: (translatedUnique: string[]) => string[];
} {
  const unique: string[] = [];
  const indexOf: number[] = [];
  const seen = new Map<string, number>();

  for (const text of texts) {
    if (!text.trim()) {
      indexOf.push(-1);
      continue;
    }
    let idx = seen.get(text);
    if (idx === undefined) {
      idx = unique.length;
      unique.push(text);
      seen.set(text, idx);
    }
    indexOf.push(idx);
  }

  return {
    unique,
    expand: (translatedUnique) =>
      indexOf.map((i) => (i < 0 ? '' : (translatedUnique[i] ?? ''))),
  };
}

export function isRetryableTranslateError(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? Number((err as { code?: unknown }).code)
      : Number.NaN;
  // gRPC: 4 DEADLINE_EXCEEDED, 8 RESOURCE_EXHAUSTED, 13 INTERNAL, 14 UNAVAILABLE
  if ([4, 8, 13, 14].includes(code)) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /429|503|500|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED/i.test(
    message,
  );
}

export function translateErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (code !== undefined && code !== null && String(code).length) {
      return String(code);
    }
  }
  return 'unknown';
}

/** Log-safe GCP/gRPC error summary. Never includes request contents. */
export function translateErrorSummary(err: unknown): string {
  const code = translateErrorCode(err);
  const rawMessage =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : String(err ?? '');
  const message = sanitizeTranslateErrorText(rawMessage);
  const reason = googleErrorReason(err);
  const parts = [`code=${code}`];
  if (reason) parts.push(`reason=${reason}`);
  if (message) parts.push(message.slice(0, 400));
  return parts.join(' ');
}

function googleErrorReason(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const details = (err as { details?: unknown }).details;
  const blobs = Array.isArray(details) ? details : details ? [details] : [];
  for (const item of blobs) {
    if (item && typeof item === 'object' && 'reason' in item) {
      const reason = String((item as { reason?: unknown }).reason ?? '').trim();
      if (reason) return reason;
    }
  }
  const status = (err as { statusDetails?: unknown }).statusDetails;
  const statusBlobs = Array.isArray(status) ? status : [];
  for (const item of statusBlobs) {
    if (item && typeof item === 'object' && 'reason' in item) {
      const reason = String((item as { reason?: unknown }).reason ?? '').trim();
      if (reason) return reason;
    }
  }
  return '';
}

function sanitizeTranslateErrorText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[redacted-pem]')
    .replace(/\s+/g, ' ')
    .trim();
}
