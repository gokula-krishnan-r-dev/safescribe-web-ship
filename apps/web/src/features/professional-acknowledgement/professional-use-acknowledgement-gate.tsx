'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  PROFESSIONAL_ACK_BODY,
  PROFESSIONAL_ACK_HEADING,
  PROFESSIONAL_ACK_SAVE_ERROR,
  PROFESSIONAL_ACK_SIGN_OUT_SOURCE,
  isProfessionalAckRole,
  pharmacistNeedsAcknowledgement,
  professionalAckDefaultReturnTo,
  sanitizeReturnTo,
  type ProfessionalAcknowledgementStatus,
} from '@safescript/shared';
import { useAuthStore } from '@/features/auth/auth-store';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { api } from '@/lib/api-client';
import { ProfessionalUseAcknowledgementModal } from './professional-use-acknowledgement-modal';

export function ProfessionalUseAcknowledgementGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, isAuthenticated, logout, setUser } = useAuthStore();
  const [status, setStatus] = useState<ProfessionalAcknowledgementStatus | null>(
    user?.professionalAcknowledgement ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const returnTo = sanitizeReturnTo(
    searchParams.get('returnTo'),
    professionalAckDefaultReturnTo(user?.role),
    user?.role,
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (!isProfessionalAckRole(user.role)) {
      router.replace('/');
      return;
    }
    if (
      user.professionalAcknowledgement &&
      !pharmacistNeedsAcknowledgement(user.professionalAcknowledgement)
    ) {
      router.replace(returnTo);
    }
  }, [isLoading, isAuthenticated, user, router, returnTo]);

  useEffect(() => {
    if (!user || !isProfessionalAckRole(user.role)) return;
    let cancelled = false;
    api
      .get<ProfessionalAcknowledgementStatus>('/professional-use-acknowledgement')
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setUser({ ...user, professionalAcknowledgement: next });
        if (!pharmacistNeedsAcknowledgement(next)) {
          router.replace(returnTo);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus(
            user.professionalAcknowledgement ?? {
              required: true,
              acknowledged: false,
              version: '',
              heading: PROFESSIONAL_ACK_HEADING,
              body: PROFESSIONAL_ACK_BODY,
            },
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // Intentionally depend on user id only — avoid refetch loops from setUser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const acknowledge = async () => {
    if (submitting.current || saving) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ acknowledged: boolean; version: string }>(
        '/professional-use-acknowledgement',
      );
      if (user) {
        const next: ProfessionalAcknowledgementStatus = {
          required: false,
          acknowledged: true,
          version: res.version,
          heading: status?.heading ?? PROFESSIONAL_ACK_HEADING,
          body: status?.body ?? PROFESSIONAL_ACK_BODY,
        };
        setUser({ ...user, professionalAcknowledgement: next });
      }
      router.replace(returnTo);
    } catch {
      setError(PROFESSIONAL_ACK_SAVE_ERROR);
      submitting.current = false;
      setSaving(false);
    }
  };

  const signOut = async () => {
    await logout({ source: PROFESSIONAL_ACK_SIGN_OUT_SOURCE });
    router.replace('/login');
  };

  if (
    isLoading ||
    !user ||
    !isProfessionalAckRole(user.role) ||
    (user.professionalAcknowledgement &&
      !pharmacistNeedsAcknowledgement(user.professionalAcknowledgement))
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const copy = {
    heading: status?.heading ?? PROFESSIONAL_ACK_HEADING,
    body: status?.body ?? PROFESSIONAL_ACK_BODY,
  };

  return (
    <>
      <DashboardLayout role={user.role} shellOnly>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            SafeScribe is ready once professional use is acknowledged.
          </p>
        </div>
      </DashboardLayout>
      <ProfessionalUseAcknowledgementModal
        copy={copy}
        saving={saving}
        error={error}
        onAcknowledge={acknowledge}
        onSignOut={signOut}
      />
    </>
  );
}
