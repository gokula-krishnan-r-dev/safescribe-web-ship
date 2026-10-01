import Link from 'next/link';
import { BrandLockup } from '@/components/safescribe/brand-lockup';

const footerLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
] as const;

export function PublicFooter({ current }: { current?: (typeof footerLinks)[number]['href'] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="ss-public-footer">
      <div className="ss-public-footer-inner">
        <div>
          <BrandLockup variant="header" />
          <p className="mt-2 text-[13px] text-[#60738E]">Built in Canada for Canadian pharmacy practice.</p>
          <p className="mt-1 text-[13px] text-[#60738E]">© {year} PharmaSafe Inc.</p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {footerLinks.map((link, index) => (
            <span key={link.href} className="flex items-center gap-3">
              {index > 0 ? <span className="text-[#C5D3DF]" aria-hidden>|</span> : null}
              <Link
                href={link.href}
                aria-current={current === link.href ? 'page' : undefined}
                className="text-[#425A78] transition-colors hover:text-[#087DB5] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40 aria-[current=page]:font-semibold aria-[current=page]:text-[#06244A] aria-[current=page]:underline aria-[current=page]:underline-offset-4"
              >
                {link.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
