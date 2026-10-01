import Link from 'next/link';
import { BrandLockup } from '@/components/safescribe/brand-lockup';

export function BrandHeader() {
  return (
    <header className="ss-brand-header">
      <Link
        href="/"
        aria-label="SafeScribe home"
        className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
      >
        <BrandLockup variant="header" priority />
      </Link>
    </header>
  );
}
