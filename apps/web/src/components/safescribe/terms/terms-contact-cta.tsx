import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { PRIVACY_CONTACT_EMAIL } from '@/content/legal/privacy-policy-metadata';

export function TermsContactCta() {
  return (
    <section className="ss-privacy-cta-wrap" aria-labelledby="terms-contact-heading">
      <div className="ss-privacy-cta">
        <span className="ss-privacy-chip-icon" aria-hidden>
          <Mail className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="terms-contact-heading">Questions about these Terms?</h2>
          <p>
            Legal and Terms inquiries can be submitted through the Contact page. Privacy questions
            may be sent to {PRIVACY_CONTACT_EMAIL}. We typically respond within 1–2 business days.
          </p>
        </div>
        <Link href="/contact" className="ss-about-btn-primary">
          Contact us
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
