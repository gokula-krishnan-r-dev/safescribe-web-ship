import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileText, LifeBuoy, Shield } from 'lucide-react';
import { PublicFooter } from '@/components/safescribe/public-footer';
import { PublicHeader } from '@/components/safescribe/public-header';
import { landingInter } from '@/components/safescribe/landing-font';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, publicPageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';

export const metadata: Metadata = publicPageMetadata({
  title: 'Resources',
  description: 'Privacy, safety, and support resources for SafeScribe pharmacy teams.',
  path: '/resources',
});

const resources = [
  {
    href: '/privacy',
    icon: Shield,
    title: 'Privacy & Security',
    body: 'How consultation information is deleted on completion or by the end of the day, and the full Privacy & Security Policy.',
  },
  {
    href: '/terms',
    icon: FileText,
    title: 'Terms of Service',
    body: 'The terms that govern use of SafeScribe by pharmacy organizations.',
  },
  {
    href: '/contact',
    icon: LifeBuoy,
    title: 'Contact support',
    body: 'Product questions, demos, and partnership inquiries.',
  },
] as const;

export default function ResourcesPage() {
  return (
    <div className={cn('ss-landing ss-about', landingInter.className)}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/resources' },
        ])}
      />
      <PublicHeader />
      <main className="ss-about-shell py-12 sm:py-16">
        <p className="ss-about-eyebrow">Resources</p>
        <h1 className="mt-2 max-w-2xl text-[34px] font-bold tracking-[-0.03em] text-[#06244A] sm:text-[42px]">
          Guides and policies for pharmacy teams
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-[#425A78]">
          Clinical documentation stays in your workflow. These pages cover how we handle privacy,
          safety, and support.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {resources.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="ss-about-pillar flex h-full flex-col no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
              >
                <span className="ss-about-icon-wrap" aria-hidden>
                  <item.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h2 className="mt-4 text-[17px] font-semibold text-[#06244A]">{item.title}</h2>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[#60738E]">{item.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium text-[#087DB5]">
                  Open
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}
