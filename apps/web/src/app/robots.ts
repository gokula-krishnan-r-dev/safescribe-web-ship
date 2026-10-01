import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/pharmacist',
          '/pharmacist/',
          '/admin',
          '/admin/',
          '/super-admin',
          '/super-admin/',
          '/auth/',
          '/mic/',
          '/verify-network/',
          '/forgot-password',
          '/reset-password',
          '/access-denied',
          '/unauthorized',
          '/professional-use-acknowledgement',
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
