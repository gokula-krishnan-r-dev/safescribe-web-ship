import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { AccessDeniedContent } from './access-denied-content';
import { privateRobots } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Access denied',
  robots: privateRobots,
};

export default function AccessDeniedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AccessDeniedContent />
    </Suspense>
  );
}
