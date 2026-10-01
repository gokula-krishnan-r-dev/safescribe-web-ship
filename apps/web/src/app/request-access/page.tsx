import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/safescribe/marketing-shell';
import { publicPageMetadata } from '@/lib/seo';

export const metadata: Metadata = publicPageMetadata({
  title: 'Request access',
  description:
    'Request access to SafeScribe for your licensed pharmacy. New accounts are created by your pharmacy administrator.',
  path: '/request-access',
});

export default function RequestAccessPage() {
  return (
    <MarketingShell>
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-[#087DB5]">Access</p>
      <h1 className="mt-2 text-[32px] font-bold tracking-[-0.03em] text-[#06244A]">Request access</h1>
      <p className="mt-4 text-[16px] leading-relaxed text-[#425A78]">
        SafeScribe is available to licensed pharmacies. New accounts are created by your pharmacy
        administrator — they can invite pharmacists from the organization workspace.
      </p>
      <p className="mt-3 text-[16px] leading-relaxed text-[#425A78]">
        If your pharmacy does not yet use SafeScribe,{' '}
        <Link href="/contact" className="font-medium text-[#087DB5] hover:text-[#066A9A]">
          contact us
        </Link>{' '}
        to get started.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-gradient-to-r from-[#063B5D] to-[#005E78] px-5 text-[15px] font-semibold text-white hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
      >
        Back to log in
      </Link>
    </MarketingShell>
  );
}
