import type { Metadata } from 'next';
import { AlbertaTermsCallout } from '@/components/safescribe/terms/alberta-terms-callout';
import { KeyThingsToKnow } from '@/components/safescribe/terms/key-things-to-know';
import { TermsContactCta } from '@/components/safescribe/terms/terms-contact-cta';
import { TermsExperience } from '@/components/safescribe/terms/terms-experience';
import { TermsHero } from '@/components/safescribe/terms/terms-hero';
import { PublicFooter } from '@/components/safescribe/public-footer';
import { PublicHeader } from '@/components/safescribe/public-header';
import { landingInter } from '@/components/safescribe/landing-font';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, publicPageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const metadata: Metadata = publicPageMetadata({
  title: 'Terms of Service',
  description:
    'These Terms govern access to and use of SafeScribe. By creating an account or using the Service, you agree to be bound by them.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <div className={cn('ss-landing ss-privacy ss-terms', landingInter.className)}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Terms of Service', path: '/terms' },
        ])}
      />
      <PublicHeader />
      <main>
        <TermsHero />
        <KeyThingsToKnow />
        <TermsExperience />
        <AlbertaTermsCallout />
        <TermsContactCta />
      </main>
      <PublicFooter current="/terms" />
    </div>
  );
}
