import { CalendarDays } from 'lucide-react';
import { TermsHeroGraphic } from '@/components/safescribe/terms/terms-hero-graphic';
import { termsHeroCopy, termsMeta } from '@/content/legal/terms-metadata';

export function TermsHero() {
  return (
    <section className="ss-privacy-hero">
      <div className="ss-privacy-hero-copy">
        <p className="ss-about-eyebrow">{termsHeroCopy.eyebrow}</p>
        <h1>{termsHeroCopy.headline}</h1>
        <p>{termsHeroCopy.body}</p>
        <p className="ss-privacy-updated">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Effective {termsMeta.lastUpdatedLabel} · Last updated: {termsMeta.lastUpdatedLabel}
        </p>
      </div>
      <div className="ss-privacy-hero-visual">
        <TermsHeroGraphic />
      </div>
    </section>
  );
}
