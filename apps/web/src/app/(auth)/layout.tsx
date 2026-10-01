import type { Metadata } from 'next';
import { privateRobots, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
  robots: privateRobots,
  referrer: 'no-referrer',
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
