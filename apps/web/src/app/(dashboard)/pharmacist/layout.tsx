'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/auth-store';
import { pharmacistNeedsAcknowledgement, professionalAckHref, ROLES } from '@safescript/shared';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Loader2 } from 'lucide-react';

export default function PharmacistLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user && user.role !== ROLES.PHARMACIST) {
      router.push('/unauthorized');
      return;
    }
    if (pharmacistNeedsAcknowledgement(user?.professionalAcknowledgement)) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(professionalAckHref(returnTo));
    }
  }, [isLoading, isAuthenticated, user, router, pathname]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pharmacistNeedsAcknowledgement(user.professionalAcknowledgement)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <DashboardLayout role={ROLES.PHARMACIST}>{children}</DashboardLayout>;
}
