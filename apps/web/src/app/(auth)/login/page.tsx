import type { Metadata } from 'next';
import { LandingLoginPage } from '@/components/safescribe/landing-login-page';
import { publicPageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo';

/** Same product page as `/` — canonicalise to home so search engines do not index a duplicate. */
export const metadata: Metadata = publicPageMetadata({
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  path: '/',
  index: false,
});

export default function LoginPage() {
  return <LandingLoginPage />;
}
