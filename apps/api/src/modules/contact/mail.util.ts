import { createHmac, timingSafeEqual } from 'crypto';

const SVIX_TOLERANCE_SECONDS = 300;

export function isEnvFlagEnabled(
  value: string | undefined | null,
  fallback = false,
): boolean {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

export function stripEnvQuotes(value: string | undefined | null): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
}

/** Accepts `Name <email@domain>` or a bare address. */
export function parseFromAddress(raw: string): {
  from: string;
  email: string;
} | null {
  const value = stripEnvQuotes(raw);
  if (!value) return null;
  const angled = /^(.+?)\s*<([^>]+)>$/.exec(value);
  const email = (angled ? angled[2] : value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = angled ? angled[1].trim().replace(/^["']|["']$/g, '') : '';
  return {
    from: name ? `${name} <${email}>` : email,
    email,
  };
}

export interface ResendEnvInput {
  RESEND_ENABLED?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SMTP_FROM?: string;
  RESEND_WEBHOOK_SECRET?: string;
}

export interface ResolvedResendConfig {
  enabled: boolean;
  apiKey: string;
  from: string;
  fromEmail: string;
  webhookSecret: string;
}

/**
 * Canonical Resend env parsing. Keys and From addresses may arrive quoted from
 * systemd/env files; the API key must be a live `re_` token.
 */
export function resolveResendConfig(env: ResendEnvInput): ResolvedResendConfig {
  const enabled = isEnvFlagEnabled(env.RESEND_ENABLED, false);
  const apiKey = stripEnvQuotes(env.RESEND_API_KEY);
  const parsedFrom = parseFromAddress(env.RESEND_FROM_EMAIL || env.SMTP_FROM || '');
  return {
    enabled,
    apiKey,
    from: parsedFrom?.from ?? '',
    fromEmail: parsedFrom?.email ?? '',
    webhookSecret: stripEnvQuotes(env.RESEND_WEBHOOK_SECRET),
  };
}

export function assertResendConfig(
  config: ResolvedResendConfig,
  opts: { required: boolean },
): string[] {
  if (!opts.required && !config.enabled) return [];
  const errors: string[] = [];
  if (!config.apiKey.startsWith('re_')) {
    errors.push('RESEND_API_KEY must be a Resend API key (starts with re_)');
  }
  if (!config.fromEmail) {
    errors.push(
      'RESEND_FROM_EMAIL must be a verified sender such as Safescript <noreply@phix.now>',
    );
  }
  if (config.webhookSecret && !config.webhookSecret.startsWith('whsec_')) {
    errors.push('RESEND_WEBHOOK_SECRET must be a Resend/Svix secret (starts with whsec_)');
  }
  return errors;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function htmlParagraphs(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br />');
}

export function isRetryableMailError(
  statusCode: number | undefined | null,
): boolean {
  if (statusCode == null) return true;
  return statusCode === 429 || statusCode >= 500;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifies a Resend (Svix) webhook signature against the raw body.
 * https://resend.com/docs/webhooks/verify-webhooks-requests
 */
export function verifyResendWebhookSignature(input: {
  payload: string;
  secret: string;
  id?: string;
  timestamp?: string;
  signature?: string;
  nowSeconds?: number;
}): boolean {
  const secret = stripEnvQuotes(input.secret);
  const id = (input.id ?? '').trim();
  const timestamp = (input.timestamp ?? '').trim();
  const signatureHeader = (input.signature ?? '').trim();
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SVIX_TOLERANCE_SECONDS) return false;

  const secretPart = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretPart, 'base64');
  } catch {
    return false;
  }
  if (!secretBytes.length) return false;

  const expected = createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${input.payload}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  return signatureHeader.split(' ').some((part) => {
    const sig = part.startsWith('v1,') ? part.slice(3) : part;
    const provided = Buffer.from(sig);
    if (provided.length !== expectedBuf.length) return false;
    try {
      return timingSafeEqual(provided, expectedBuf);
    } catch {
      return false;
    }
  });
}
