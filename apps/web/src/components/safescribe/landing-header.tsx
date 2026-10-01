import Link from 'next/link';
import { BrandLockup } from '@/components/safescribe/brand-lockup';
import { LANDING_NAV } from '@/components/safescribe/public-nav';

export function LandingHeader() {
  return (
    <header className="ss-landing-header">
      <div className="ss-landing-header-inner">
        <Link
          href="/"
          aria-label="SafeScribe home"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
        >
          <BrandLockup variant="header" priority />
        </Link>

        <nav aria-label="Primary" className="ss-landing-nav">
          <ul className="ss-landing-nav-list">
            {LANDING_NAV.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="ss-public-nav-link ss-landing-nav-link"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
