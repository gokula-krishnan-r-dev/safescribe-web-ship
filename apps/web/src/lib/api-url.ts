/**
 * Public Nest API base URL (no trailing slash).
 *
 * Browser hostname wins so one Vercel production deployment can serve both
 * production (safescribe.ca) and staging (staging.safescribe.ca) frontends.
 */
const PRODUCTION_API = 'https://api.safescribe.ca';
const STAGING_API = 'https://api-staging.safescribe.ca';

const HOST_API: Record<string, string> = {
  'safescribe.ca': PRODUCTION_API,
  'www.safescribe.ca': PRODUCTION_API,
  'app.safescribe.ca': PRODUCTION_API,
  'staging.safescribe.ca': STAGING_API,
};

export function getPublicApiUrl(): string {
  if (typeof window !== 'undefined') {
    const mapped = HOST_API[window.location.hostname];
    if (mapped) return mapped;
  }

  const configured = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_API;
  }

  return 'http://localhost:3001';
}
