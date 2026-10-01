'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PharmacyListSidebar } from './pharmacy-list-sidebar';
import { PharmacyDetailView } from './pharmacy-detail-view';
import { PharmacyUsersGrid } from './pharmacy-users-grid';
import { AllPharmaciesOverview } from './all-pharmacies-overview';
import { ManagementSectionBar } from './management-section-bar';

export type AdminSection = 'pharmacies' | 'users';

export function AdminManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = (searchParams.get('section') as AdminSection) || 'pharmacies';
  const selectedTenantId = searchParams.get('tenant');
  const isAllSelected = !selectedTenantId || selectedTenantId === 'all';

  useEffect(() => {
    if (!searchParams.get('section')) {
      router.replace('/super-admin/management?section=pharmacies&tenant=all');
    }
  }, [searchParams, router]);

  const setSection = (s: AdminSection) => {
    const params = new URLSearchParams();
    params.set('section', s);
    params.set('tenant', 'all');
    router.push(`${pathname}?${params.toString()}`);
  };

  const selectTenant = (tenantId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', section);
    params.set('tenant', tenantId);
    router.push(`${pathname}?${params.toString()}`);
  };

  const viewStaff = (tenantId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', 'users');
    params.set('tenant', tenantId);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col">
      <ManagementSectionBar section={section} onSectionChange={setSection} />

      <div className="flex min-h-0 flex-1">
        <PharmacyListSidebar
          section={section}
          selectedTenantId={isAllSelected ? 'all' : selectedTenantId}
          onSelectTenant={selectTenant}
        />

        <main className="page-gradient flex-1 overflow-auto p-6 sm:p-8">
          {section === 'pharmacies' && isAllSelected && (
            <AllPharmaciesOverview
              onSelectTenant={selectTenant}
              onViewStaff={viewStaff}
            />
          )}
          {section === 'pharmacies' && !isAllSelected && selectedTenantId && (
            <PharmacyDetailView tenantId={selectedTenantId} onBack={() => selectTenant('all')} />
          )}
          {section === 'users' && (
            <PharmacyUsersGrid tenantId={isAllSelected ? undefined : selectedTenantId ?? undefined} />
          )}
        </main>
      </div>
    </div>
  );
}
