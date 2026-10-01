import Link from 'next/link';
import { Scale } from 'lucide-react';

export function AlbertaTermsCallout() {
  return (
    <section className="ss-privacy-alberta ss-terms-alberta" aria-labelledby="alberta-terms-heading">
      <div className="ss-privacy-alberta-inner">
        <span className="ss-privacy-alberta-icon" aria-hidden>
          <Scale className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="alberta-terms-heading">Important for Alberta customers</h2>
          <p>
            The Terms are governed by the laws of Alberta and applicable federal laws of Canada.
            Alberta healthcare organizations may also have separate privacy and health-information
            obligations. See Privacy &amp; Security for SafeScribe&apos;s Alberta-specific privacy
            information.
          </p>
        </div>
        <Link href="/privacy#alberta" className="ss-privacy-alberta-btn">
          Learn more
        </Link>
      </div>
    </section>
  );
}
