'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from '@/lib/notify';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import {
  LOGIN_UI,
  ROLES,
  mapPharmacyLoginError,
  professionalAckDefaultReturnTo,
  professionalAckHref,
} from '@safescript/shared';
import { AuthPageShell } from '@/components/shared/auth-page-shell';
import { BrandMark } from '@/components/shared/brand-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import { rememberIpAccessDenied } from '@/lib/ip-access-denied';

type Screen =
  | { kind: 'verifying' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function VerifyLoginPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const verifyLoginEmail = useAuthStore((s) => s.verifyLoginEmail);
  const [screen, setScreen] = useState<Screen>({ kind: 'verifying' });

  useEffect(() => {
    if (!token) {
      setScreen({ kind: 'error', message: LOGIN_UI.email2faInvalid });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await verifyLoginEmail(token);
        if (cancelled) return;
        setScreen({ kind: 'success' });
        toast.success('Welcome back!', { announce: true });
        const user = useAuthStore.getState().user;
        if (user?.role === ROLES.PHARMACIST_ADMIN) {
          router.replace(professionalAckHref(undefined, undefined, ROLES.PHARMACIST_ADMIN));
        } else if (user?.role === ROLES.PHARMACIST) {
          router.replace(professionalAckHref(professionalAckDefaultReturnTo(ROLES.PHARMACIST)));
        } else {
          router.replace('/login');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const mapped = mapPharmacyLoginError(err);
        if (mapped.kind === 'access-denied') {
          rememberIpAccessDenied(err);
          api.clearTokens();
          useAuthStore.setState({ user: null, isAuthenticated: false });
          router.replace('/access-denied');
          return;
        }
        setScreen({
          kind: 'error',
          message: mapped.kind === 'message' ? mapped.message : LOGIN_UI.email2faInvalid,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, verifyLoginEmail, router]);

  return (
    <AuthPageShell>
      <Card className="w-full max-w-lg overflow-hidden rounded-2xl border-border/80 shadow-lg">
        <div className="h-1.5 bg-primary" />
        <CardContent className="space-y-5 p-8">
          <BrandMark size="sm" className="mx-auto" />

          {screen.kind === 'verifying' ? (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">{LOGIN_UI.email2faVerifying}</p>
            </div>
          ) : null}

          {screen.kind === 'success' ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                <CheckCircle2 className="h-7 w-7 text-emerald-700" />
              </div>
              <p className="text-sm text-muted-foreground">{LOGIN_UI.email2faSuccess}</p>
            </div>
          ) : null}

          {screen.kind === 'error' ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
                <ShieldAlert className="h-7 w-7 text-amber-700" />
              </div>
              <p className="text-sm text-muted-foreground">{screen.message}</p>
              <Link href="/login">
                <Button className="w-full">Back to sign in</Button>
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
