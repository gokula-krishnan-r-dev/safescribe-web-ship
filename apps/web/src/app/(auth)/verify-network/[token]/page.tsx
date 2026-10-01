'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2, ShieldAlert, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AuthPageShell } from '@/components/shared/auth-page-shell';
import { BrandMark } from '@/components/shared/brand-mark';
import { api } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

type Screen =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      pharmacyName: string;
      detectedIp: string | null;
      recommendedCidr?: string | null;
      family?: 'ipv4' | 'ipv6' | null;
    }
  | { kind: 'success'; pharmacyName: string; detectedIp: string; cidr?: string }
  | { kind: 'error'; message: string };

export default function VerifyNetworkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .get<{
        pharmacyName: string;
        detectedIp: string | null;
        recommendedCidr?: string | null;
        family?: 'ipv4' | 'ipv6' | null;
      }>(`/network-verify/${token}`)
      .then((data) => {
        if (!cancelled) {
          setScreen({
            kind: 'ready',
            pharmacyName: data.pharmacyName,
            detectedIp: data.detectedIp,
            recommendedCidr: data.recommendedCidr,
            family: data.family,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setScreen({ kind: 'error', message: getErrorMessage(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    setConfirming(true);
    try {
      const data = await api.post<{ pharmacyName: string; detectedIp: string; cidr?: string }>(
        `/network-verify/${token}/confirm`,
      );
      setScreen({
        kind: 'success',
        pharmacyName: data.pharmacyName,
        detectedIp: data.detectedIp,
        cidr: data.cidr,
      });
    } catch (err) {
      setScreen({ kind: 'error', message: getErrorMessage(err) });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AuthPageShell>
      <Card className="w-full max-w-lg overflow-hidden rounded-2xl border-border/80 shadow-lg">
        <div className="h-1.5 bg-primary" />
        <CardContent className="space-y-5 p-8">
          <BrandMark size="sm" className="mx-auto" />

          {screen.kind === 'loading' ? (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Detecting this pharmacy network…
            </div>
          ) : null}

          {screen.kind === 'error' ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
                <ShieldAlert className="h-7 w-7 text-amber-700" />
              </div>
              <h1 className="text-xl font-bold">This link cannot be used</h1>
              <p className="text-sm text-muted-foreground">{screen.message}</p>
              <Link href="/login">
                <Button variant="outline">Close</Button>
              </Link>
            </div>
          ) : null}

          {screen.kind === 'ready' ? (
            <div className="space-y-5">
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">Verify pharmacy network</h1>
                <p className="mt-2 text-base font-semibold text-primary">{screen.pharmacyName}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Please confirm that you are currently using a computer connected to this
                  pharmacy&apos;s regular internet connection.
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {screen.family === 'ipv6' ? 'Stable pharmacy network' : 'Detected public IP'}
                </p>
                <p className="mt-1 flex items-center justify-center gap-2 font-mono text-lg font-semibold break-all">
                  <Wifi className="h-4 w-4 shrink-0 text-primary" />
                  {screen.recommendedCidr || screen.detectedIp || 'Not detected'}
                </p>
                {screen.family === 'ipv6' && screen.detectedIp ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Current device address {screen.detectedIp} changes often. SafeScribe will
                    register this pharmacy&apos;s IPv6 site so the same internet keeps working.
                  </p>
                ) : null}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                This network will be submitted to SafeScribe Admin for approval.
              </p>
              <Button className="w-full" onClick={confirm} disabled={confirming || !screen.detectedIp}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm pharmacy network
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Do not confirm this network if you are currently at home or another location.
              </p>
              <div className="text-center">
                <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                  Cancel
                </Link>
              </div>
            </div>
          ) : null}

          {screen.kind === 'success' ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                <CheckCircle2 className="h-7 w-7 text-emerald-700" />
              </div>
              <h1 className="text-xl font-bold">Pharmacy network submitted</h1>
              <p className="font-mono text-lg font-semibold break-all">
                {screen.cidr || screen.detectedIp}
              </p>
              <p className="text-sm text-muted-foreground">
                Your network information has been sent to SafeScribe for approval.
              </p>
              <p className="text-sm text-muted-foreground">You may close this window.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
