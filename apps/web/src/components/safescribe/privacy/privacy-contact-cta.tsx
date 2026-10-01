import { Mail, ShieldCheck } from 'lucide-react';
import { PRIVACY_CONTACT_EMAIL } from '@/content/legal/privacy-policy-metadata';

export function PrivacyContactCta() {
  return (
    <section className="ss-privacy-cta-wrap" aria-labelledby="privacy-contact-heading">
      <div className="ss-privacy-cta">
        <span className="ss-privacy-chip-icon" aria-hidden>
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="privacy-contact-heading">Questions, access requests, or privacy concerns</h2>
          <p>
            Write to the Privacy Officer at PharmaSafe Inc. We typically respond within 1–2 business
            days.
          </p>
        </div>
        <a className="ss-about-btn-primary" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
          <Mail className="h-4 w-4" aria-hidden />
          {PRIVACY_CONTACT_EMAIL}
        </a>
      </div>
    </section>
  );
}
