import { CalendarDays } from 'lucide-react';
import { PrivacyHeroGraphic } from '@/components/safescribe/privacy/privacy-hero-graphic';
import { privacyHeroCopy } from '@/content/legal/privacy-policy';
import { privacyPolicyMeta } from '@/content/legal/privacy-policy-metadata';

export function PrivacyHero() {
  return (
    <section className="ss-privacy-hero">
      <div className="ss-privacy-hero-copy">
        <p className="ss-about-eyebrow">{privacyHeroCopy.eyebrow}</p>
        <h1>{privacyHeroCopy.headline}</h1>
        <p>{privacyHeroCopy.body}</p>
        <p className="ss-privacy-updated">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Last updated: {privacyPolicyMeta.lastUpdatedLabel}
        </p>
      </div>
      <div className="ss-privacy-hero-visual">
        <PrivacyHeroGraphic />
      </div>
    </section>
  );
}
