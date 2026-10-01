import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivateLanding } from '@/features/activate/activate-landing';
import { landingInter } from '@/components/safescribe/landing-font';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, organizationJsonLd, publicPageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const metadata: Metadata = publicPageMetadata({
  title: 'Activate SafeScribe',
  description:
    'Register an Alberta pharmacy for complimentary SafeScribe access. Clinical decision support and documentation for Alberta pharmacists.',
  path: '/activate',
});

function ActivateFallback() {
  return (
    <div className="ss-activate">
      <div className="ss-activate-header">
        <div className="ss-activate-header-inner">
          <div className="h-10 w-40 animate-pulse rounded-md bg-[#d9e4e9]" />
        </div>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <div className={cn('ss-activate-root', landingInter.className)}>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Activate', path: '/activate' },
          ]),
        ]}
      />
      <Suspense fallback={<ActivateFallback />}>
        <ActivateLanding />
      </Suspense>
    </div>
  );
}
