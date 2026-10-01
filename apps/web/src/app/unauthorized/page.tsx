import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { privateRobots } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Access not allowed',
  robots: privateRobots,
};

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Access not allowed</h1>
      <p className="text-muted-foreground">You do not have permission to view this page.</p>
      <Link href="/login">
        <Button>Back to Sign In</Button>
      </Link>
    </div>
  );
}
