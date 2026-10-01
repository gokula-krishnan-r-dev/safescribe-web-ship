'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  const showDetails =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_SHOW_ERROR_DETAILS === 'true';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-center text-muted-foreground">
        We could not load this page. Please try again. If the problem continues, contact your
        administrator.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      {showDetails && error.message && (
        <p className="mt-3 max-w-lg break-words rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-left font-mono text-[11px] text-muted-foreground">
          {error.message}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>Try Again</Button>
        <Link href="/pharmacist/consultations">
          <Button variant="outline">Back to consultations</Button>
        </Link>
        <Link href="/login">
          <Button variant="ghost">Go to Sign In</Button>
        </Link>
      </div>
    </div>
  );
}
