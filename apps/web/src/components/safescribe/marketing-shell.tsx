import type { ReactNode } from 'react';
import { PublicFooter } from '@/components/safescribe/public-footer';
import { PublicHeader } from '@/components/safescribe/public-header';
import { landingInter } from '@/components/safescribe/landing-font';
import { cn } from '@/lib/utils';
import type { PublicNavId } from '@/components/safescribe/public-nav';

export function MarketingShell({
  children,
  active = null,
}: {
  children: ReactNode;
  active?: PublicNavId | null;
}) {
  return (
    <div className={cn('ss-landing min-h-screen', landingInter.className)}>
      <PublicHeader active={active} />
      <div className="mx-auto w-full max-w-[640px] flex-1 px-6 py-10 sm:px-8 sm:py-14">{children}</div>
      <PublicFooter />
    </div>
  );
}
