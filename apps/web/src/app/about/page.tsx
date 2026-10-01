import type { Metadata } from 'next';
import { AboutCta } from '@/components/safescribe/about/about-cta';
import { AboutHero } from '@/components/safescribe/about/about-hero';
import { ApproachSection } from '@/components/safescribe/about/approach-section';
import { CanadianRoots } from '@/components/safescribe/about/canadian-roots';
import { PrivacyTrust } from '@/components/safescribe/about/privacy-trust';
import { WhySafeScribe } from '@/components/safescribe/about/why-safescribe';
import { PublicFooter } from '@/components/safescribe/public-footer';
import { PublicHeader } from '@/components/safescribe/public-header';
import { landingInter } from '@/components/safescribe/landing-font';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, organizationJsonLd, publicPageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const metadata: Metadata = publicPageMetadata({
  title: 'About',
  description:
    'SafeScribe is a clinical intelligence platform for pharmacists, built in Canada to support assessment, prescribing, and documentation with greater safety, clarity, and efficiency.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div className={cn('ss-landing ss-about', landingInter.className)}>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'About', path: '/about' },
          ]),
        ]}
      />
      <PublicHeader active="about" />
      <main>
        <AboutHero />
        <WhySafeScribe />
        <ApproachSection />
        <CanadianRoots />
        <PrivacyTrust />
        <AboutCta />
      </main>
      <PublicFooter />
    </div>
  );
}
