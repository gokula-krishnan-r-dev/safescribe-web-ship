import type { MetadataRoute } from 'next';
import { getSiteUrl, PUBLIC_INDEX_PATHS } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const lastModified = new Date();
  return PUBLIC_INDEX_PATHS.map((entry) => ({
    url: `${site}${entry.path === '/' ? '' : entry.path}`,
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
