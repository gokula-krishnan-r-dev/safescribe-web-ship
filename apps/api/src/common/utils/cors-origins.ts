export const DEFAULT_WEB_ORIGINS = [
  'https://safescribe.ca',
  'https://www.safescribe.ca',
  'https://app.safescribe.ca',
  'https://staging.safescribe.ca',
  'https://safescribe-web.vercel.app',
];

export function parseOriginList(...values: Array<string | undefined>): string[] {
  const origins = new Set<string>(DEFAULT_WEB_ORIGINS);
  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(',')) {
      const origin = part.trim().replace(/\/$/, '');
      if (origin) origins.add(origin);
    }
  }
  return [...origins];
}

export function isAllowedCorsOrigin(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
}
