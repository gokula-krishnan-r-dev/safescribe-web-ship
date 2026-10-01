import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SafeScribeMark } from '@/components/safescribe/safe-scribe-mark';
import { BOOK_DEMO_HREF } from '@/components/safescribe/public-nav';

export function AboutCta() {
  return (
    <section className="ss-about-cta-wrap">
      <div className="ss-about-cta">
        <SafeScribeMark size={64} />
        <div className="ss-about-cta-copy">
          <h2>See how SafeScribe fits into your pharmacy workflow</h2>
          <p>From consultation to clinical decision support and documentation.</p>
        </div>
        <div className="ss-about-cta-actions">
          <Link href={BOOK_DEMO_HREF} className="ss-about-btn-primary">
            Book a demo
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/contact" className="ss-about-btn-secondary">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}
