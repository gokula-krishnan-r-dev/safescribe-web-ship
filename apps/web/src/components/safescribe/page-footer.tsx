import Link from 'next/link';

const footerLinks = [
  { href: '/privacy', label: 'Privacy & Security' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/contact', label: 'Contact' },
] as const;

export function PageFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="ss-page-footer">
      <div className="ss-page-footer-inner">
        <p className="text-[13px] text-[#60738E]">© {year} SafeScribe. All rights reserved.</p>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {footerLinks.map((link, index) => (
            <span key={link.href} className="flex items-center gap-3">
              {index > 0 ? <span className="text-[#C5D3DF]" aria-hidden>|</span> : null}
              <Link
                href={link.href}
                className="text-[#425A78] transition-colors hover:text-[#087DB5] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
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
