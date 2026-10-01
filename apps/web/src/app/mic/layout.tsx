import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { privateRobots } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'SafeScribe Mic',
  robots: privateRobots,
  referrer: 'no-referrer',
};

/**
 * Minimal layout for the phone companion — no app chrome, no analytics.
 * Security headers are strengthened in next.config where possible.
 */
export default function MicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-foreground antialiased">
      {children}
    </div>
  );
}
