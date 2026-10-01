import type { Metadata } from 'next';
import { LandingLoginPage } from '@/components/safescribe/landing-login-page';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationJsonLd, publicPageMetadata, softwareJsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo';

export const metadata: Metadata = publicPageMetadata({
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  path: '/',
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), softwareJsonLd()]} />
      <LandingLoginPage />
    </>
  );
}
