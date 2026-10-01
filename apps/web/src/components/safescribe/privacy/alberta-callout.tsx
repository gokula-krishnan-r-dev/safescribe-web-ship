import Link from 'next/link';
import { Scale } from 'lucide-react';

export function AlbertaResponsibilityCallout() {
  return (
    <section className="ss-privacy-alberta" aria-labelledby="alberta-callout-heading">
      <div className="ss-privacy-alberta-inner">
        <span className="ss-privacy-alberta-icon" aria-hidden>
          <Scale className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="alberta-callout-heading">Important for Alberta customers</h2>
          <p>
            Alberta HIA custodians remain responsible for Privacy Impact Assessments, Information
            Manager Agreements, collection notices, and any required automated-system log. That
            one-year custodian log is separate from SafeScribe&apos;s temporary consultation deletion.
          </p>
        </div>
        <Link href="#alberta" className="ss-privacy-alberta-btn">
          Learn more
        </Link>
      </div>
    </section>
  );
}
