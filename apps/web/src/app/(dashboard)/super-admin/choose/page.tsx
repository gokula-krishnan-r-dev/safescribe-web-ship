'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthPageShell } from '@/components/shared/auth-page-shell';
import { SuperAdminPortalChooser } from '@/features/super-admin-portal/portal-chooser';
import {
  getPortalHome,
  writeStoredPortal,
} from '@/features/super-admin-portal/portal';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  allowedSuperAdminPortals,
  ROLES,
  SUPER_ADMIN_ACCESS_PATH,
  resolveSuperAdminScope,
} from '@safescript/shared';
import { Loader2 } from 'lucide-react';

/**
 * Authenticated portal picker — switch between Pharmacy Management and Clinical Platform.
 */
export default function SuperAdminChoosePortalPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuthStore();
  const scope = resolveSuperAdminScope(user?.role, user?.superAdminScope);
  const allowed = allowedSuperAdminPortals(scope);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(SUPER_ADMIN_ACCESS_PATH);
      return;
    }
    if (!isLoading && user && user.role !== ROLES.SUPER_ADMIN) {
      router.replace('/unauthorized');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthPageShell>
      <SuperAdminPortalChooser
        hrefForPortal={(portal) => getPortalHome(portal)}
        onSelectPortal={(portal) => writeStoredPortal(portal)}
        allowedPortals={allowed}
        subtitle="You are signed in. Open the control plane your role allows."
        showWorkspaceLoginLink={false}
      />
    </AuthPageShell>
  );
}
