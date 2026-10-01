'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  ROLES,
  SUPER_ADMIN_ACCESS_PATH,
  allowedSuperAdminPortals,
  canAccessClinicalManagement,
  canAccessPharmacyManagement,
  defaultSuperAdminPortal,
  resolveSuperAdminScope,
} from '@safescript/shared';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Loader2 } from 'lucide-react';
import {
  getPortalHome,
  writeStoredPortal,
  resolvePortalFromPath,
} from '@/features/super-admin-portal/portal';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useAuthStore();
  const isChooser = pathname === '/super-admin/choose';
  const scope = resolveSuperAdminScope(user?.role, user?.superAdminScope);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(SUPER_ADMIN_ACCESS_PATH);
      return;
    }
    if (!isLoading && user && user.role !== ROLES.SUPER_ADMIN) {
      router.push('/unauthorized');
    }
  }, [isLoading, isAuthenticated, user, router]);

  useEffect(() => {
    if (isLoading || !user || user.role !== ROLES.SUPER_ADMIN) return;

    if (isChooser) {
      const allowed = allowedSuperAdminPortals(scope);
      if (allowed.length < 2) {
        router.replace(getPortalHome(defaultSuperAdminPortal(scope)));
      }
      return;
    }

    const portal = resolvePortalFromPath(pathname);
    if (portal === 'pharmacy' && !canAccessPharmacyManagement(scope)) {
      router.replace('/super-admin/platform');
      return;
    }
    if (portal === 'platform' && !canAccessClinicalManagement(scope)) {
      router.replace('/super-admin');
    }
  }, [isLoading, user, pathname, isChooser, scope, router]);

  useEffect(() => {
    if (!pathname || isChooser) return;
    const portal = resolvePortalFromPath(pathname);
    if (portal === 'pharmacy' && !canAccessPharmacyManagement(scope)) return;
    if (portal === 'platform' && !canAccessClinicalManagement(scope)) return;
    writeStoredPortal(portal);
  }, [pathname, isChooser, scope]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isChooser) {
    return <>{children}</>;
  }

  return <DashboardLayout role={ROLES.SUPER_ADMIN}>{children}</DashboardLayout>;
}
