'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthPageShell } from '@/components/shared/auth-page-shell';
import { BrandMark } from '@/components/shared/brand-mark';
import { api } from '@/lib/api-client';
import { readIpAccessDenied } from '@/lib/ip-access-denied';
import { useAuthStore } from '@/features/auth/auth-store';

export function AccessDeniedContent() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [ipv6Blocked, setIpv6Blocked] = useState(false);
  const [recommendedCidr, setRecommendedCidr] = useState<string | null>(null);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    api.clearTokens();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    const details = readIpAccessDenied();
    setIpv6Blocked(details?.detectedFamily === 'ipv6');
    setRecommendedCidr(details?.recommendedCidr ?? null);
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await logout();
    } catch {
      api.clearTokens();
    }
    router.replace('/login');
  };

  return (
    <AuthPageShell>
      <Card className="w-full max-w-lg overflow-hidden border-border/80 shadow-lg shadow-black/5">
        <div className="h-1.5 bg-primary" />
        <CardHeader className="pb-2 text-center">
          <div className="mx-auto mb-3">
            <BrandMark size="sm" className="mx-auto opacity-90" />
          </div>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200">
            <ShieldX className="h-8 w-8 text-amber-700" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            SafeScribe access unavailable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pb-8">
          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            SafeScribe clinical services can only be accessed from your pharmacy&apos;s registered
            network.
          </p>
          {ipv6Blocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-950">
              <p className="font-semibold">This device connected over IPv6</p>
              {recommendedCidr ? (
                <p className="mt-2 font-mono text-xs font-medium">{recommendedCidr}</p>
              ) : null}
              <p className="mt-2 text-amber-900/90">
                A SafeScribe admin should open Network Access on this same internet and click{' '}
                <span className="font-semibold">Add this network</span>. That registers both IPv4
                and IPv6 so sign-in works.
              </p>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              If your pharmacy&apos;s internet connection has changed, please contact SafeScribe
              support.
            </p>
          )}
          <Button className="w-full gap-2" onClick={handleRetry} disabled={retrying}>
            {retrying ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            Return to sign in
          </Button>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
