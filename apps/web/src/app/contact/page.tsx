import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContactExperience } from '@/components/safescribe/contact-experience';
import { PublicFooter } from '@/components/safescribe/public-footer';
import { PublicHeader } from '@/components/safescribe/public-header';
import { landingInter } from '@/components/safescribe/landing-font';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, organizationJsonLd, publicPageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const metadata: Metadata = publicPageMetadata({
  title: 'Contact',
  description:
    'Contact SafeScribe for product support, a demo, or partnership inquiries. We support pharmacy teams across Canada.',
  path: '/contact',
});

function ContactFallback() {
  return (
    <div className="ss-contact-body">
      <section className="ss-contact-hero">
        <h1>How can we help?</h1>
        <p>
          We&apos;re here to support pharmacists, clinics, and healthcare partners with SafeScribe.
          Reach out and our team will get back to you.
        </p>
      </section>
      <div className="h-40 animate-pulse rounded-2xl bg-white/70" />
    </div>
  );
}

export default function ContactPage() {
  return (
    <main className={cn('ss-landing ss-contact', landingInter.className)}>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Contact', path: '/contact' },
          ]),
        ]}
      />
      <PublicHeader active="contact" />
      <Suspense fallback={<ContactFallback />}>
        <ContactExperience />
      </Suspense>
      <PublicFooter />
    </main>
  );
}
