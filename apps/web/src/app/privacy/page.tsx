import type { Metadata } from 'next';
import { AlbertaResponsibilityCallout } from '@/components/safescribe/privacy/alberta-callout';
import { ConsultationLifecycle } from '@/components/safescribe/privacy/consultation-lifecycle';
import { PrivacyContactCta } from '@/components/safescribe/privacy/privacy-contact-cta';
import { PrivacyHero } from '@/components/safescribe/privacy/privacy-hero';
import { PrivacyPolicyContent } from '@/components/safescribe/privacy/privacy-policy-content';
import { PrivacyPolicyNav } from '@/components/safescribe/privacy/privacy-policy-nav';
import { PrivacyTrustChips } from '@/components/safescribe/privacy/privacy-trust-chips';
import { PublicFooter } from '@/components/safescribe/public-footer';
import { PublicHeader } from '@/components/safescribe/public-header';
import { landingInter } from '@/components/safescribe/landing-font';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, publicPageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const metadata: Metadata = publicPageMetadata({
  title: 'Privacy & Security',
  description:
    'SafeScribe deletes consultation information when the healthcare professional completes the consultation, or automatically by the end of the day, whichever occurs first. Built in Canada for Canadian pharmacy practice.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className={cn('ss-landing ss-privacy', landingInter.className)}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Privacy & Security', path: '/privacy' },
        ])}
      />
      <PublicHeader />
      <main>
        <PrivacyHero />
        <PrivacyTrustChips />
        <ConsultationLifecycle />
        <div className="ss-privacy-layout-wrap" id="privacy-policy">
          <div className="ss-privacy-layout">
            <PrivacyPolicyNav />
            <PrivacyPolicyContent />
          </div>
        </div>
        <AlbertaResponsibilityCallout />
        <PrivacyContactCta />
      </main>
      <PublicFooter current="/privacy" />
    </div>
  );
}
