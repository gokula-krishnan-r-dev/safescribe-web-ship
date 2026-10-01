import { Request } from 'express';
import { isCloudflareIp } from './cloudflare-ips';
import { isPrivateOrReservedIp } from './ip-matcher';

function normalizeIp(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function headerValue(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (typeof raw === 'string') return normalizeIp(raw.split(',')[0]);
  if (Array.isArray(raw) && raw[0]) return normalizeIp(String(raw[0]).split(',')[0]);
  return null;
}

function forwardedIps(req: Request): string[] {
  const forwarded = req.headers['x-forwarded-for'];
  const parts: string[] = [];
  if (typeof forwarded === 'string') {
    parts.push(...forwarded.split(','));
  } else if (Array.isArray(forwarded)) {
    parts.push(...forwarded.flatMap((value) => value.split(',')));
  }
  return parts.map((part) => normalizeIp(part)).filter((ip): ip is string => Boolean(ip));
}

export function isUsablePublicClientIp(ip: string): boolean {
  return !isPrivateOrReservedIp(ip) && !isCloudflareIp(ip);
}

export function getClientIp(req: Request): string | undefined {
  const xReal = headerValue(req, 'x-real-ip');
  const cfConnecting = headerValue(req, 'cf-connecting-ip');

  if (xReal && isUsablePublicClientIp(xReal)) {
    return xReal;
  }

  // Cloudflare is in front of nginx: X-Real-IP is still a CF edge until real_ip is applied.
  if (xReal && isCloudflareIp(xReal) && cfConnecting && isUsablePublicClientIp(cfConnecting)) {
    return cfConnecting;
  }
  if (cfConnecting && isUsablePublicClientIp(cfConnecting)) {
    return cfConnecting;
  }

  for (const ip of forwardedIps(req)) {
    if (isUsablePublicClientIp(ip)) return ip;
  }

  const fallback = normalizeIp(req.ip) ?? normalizeIp(req.socket?.remoteAddress) ?? undefined;
  if (fallback && isUsablePublicClientIp(fallback)) return fallback;
  return fallback;
}

export function getClientInfo(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  };
}
