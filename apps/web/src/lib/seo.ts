import type { Metadata } from 'next';

export const SITE_NAME = 'SafeScribe';
export const SITE_TAGLINE = 'Clinical intelligence for pharmacists';
export const SITE_DESCRIPTION =
  'Assess confidently. Prescribe safely. Document faster. SafeScribe helps Canadian pharmacists capture consultations, follow clinical pathways, and generate accurate documentation.';
export const SITE_KEYWORDS = [
  'SafeScribe',
  'pharmacist prescribing',
  'pharmacy clinical documentation',
  'minor ailment prescribing Canada',
  'pharmacist clinical pathway',
  'pharmacy consultation software',
  'Canadian pharmacy software',
];

export const BRAND_MARK_PATH = '/safescribe-mark.png';

/** Production origin. Preview deploys use VERCEL_URL; local uses WEB_URL. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.WEB_URL;
  if (explicit?.trim()) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://safescribe.ca';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

export const PUBLIC_INDEX_PATHS = [
  { path: '/', title: 'SafeScribe — Clinical intelligence for pharmacists', changeFrequency: 'weekly' as const, priority: 1 },
  { path: '/about', title: 'About SafeScribe', changeFrequency: 'monthly' as const, priority: 0.8 },
  { path: '/contact', title: 'Contact SafeScribe', changeFrequency: 'monthly' as const, priority: 0.8 },
  { path: '/privacy', title: 'Privacy & Security', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/terms', title: 'Terms of Service', changeFrequency: 'monthly' as const, priority: 0.5 },
  { path: '/resources', title: 'Resources', changeFrequency: 'monthly' as const, priority: 0.5 },
  { path: '/request-access', title: 'Request access', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/activate', title: 'Activate SafeScribe', changeFrequency: 'weekly' as const, priority: 0.9 },
];

const NOINDEX: Metadata['robots'] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false, noimageindex: true },
};

function absoluteTitle(title: string): string {
  if (
    title === SITE_NAME ||
    title.startsWith(`${SITE_NAME} `) ||
    title.endsWith(` · ${SITE_NAME}`) ||
    title.endsWith(` | ${SITE_NAME}`) ||
    title.endsWith(` — ${SITE_NAME}`)
  ) {
    return title;
  }
  return `${title} · ${SITE_NAME}`;
}

export function publicPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const site = getSiteUrl();
  const url = `${site}${opts.path === '/' ? '' : opts.path}`;
  const index = opts.index !== false;
  const title = absoluteTitle(opts.title);

  return {
    title: { absolute: title },
    description: opts.description,
    alternates: { canonical: opts.path },
    robots: index
      ? { index: true, follow: true }
      : NOINDEX,
    openGraph: {
      title,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      locale: 'en_CA',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: opts.description,
    },
  };
}

export const privateRobots: Metadata['robots'] = NOINDEX;

export function organizationJsonLd() {
  const site = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: site,
    logo: `${site}${BRAND_MARK_PATH}`,
    description: SITE_DESCRIPTION,
    areaServed: { '@type': 'Country', name: 'Canada' },
  };
}

export function softwareJsonLd() {
  const site = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web',
    url: site,
    image: `${site}${BRAND_MARK_PATH}`,
    description: SITE_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/OnlineOnly',
      url: `${site}/activate`,
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'Pharmacists',
      geographicArea: { '@type': 'Country', name: 'Canada' },
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  const site = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${site}${item.path === '/' ? '' : item.path}`,
    })),
  };
}
