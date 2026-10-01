'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, Building2, ClipboardList, ArrowRight, Plus, Mail, Network, Shield, Gauge } from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { writeStoredPortal } from '@/features/super-admin-portal/portal';
import { useContactInquirySummary } from '@/features/contact-inquiries/hooks';
import { canManagePlatformAdmins, resolveSuperAdminScope } from '@safescript/shared';

export default function SuperAdminDashboard() {
  const user = useAuthStore((s) => s.user);
  const showPlatformAdmins = canManagePlatformAdmins(
    resolveSuperAdminScope(user?.role, user?.superAdminScope),
  );

  useEffect(() => {
    writeStoredPortal('pharmacy');
  }, []);

  const { data: admins, isLoading: adminsLoading } = useQuery({
    queryKey: ['pharmacist-admins-stats'],
    queryFn: () => api.get<{ meta: { total: number } }>('/users/pharmacist-admins?limit=1'),
  });

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get<unknown[]>('/tenants'),
  });

  const { data: audits, isLoading: auditsLoading } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => api.get<{ meta: { total: number } }>('/audit-logs?limit=1'),
  });

  const { data: inquiries, isLoading: inquiriesLoading } = useContactInquirySummary();

  const stats = [
    { label: 'Pharmacist Admins', value: admins?.meta?.total ?? 0, href: '/super-admin/pharmacist-admins', icon: Users, loading: adminsLoading, accent: 'primary' as const },
    { label: 'Pharmacies', value: tenants?.length ?? 0, href: '/super-admin/management?section=pharmacies&tenant=all', icon: Building2, loading: tenantsLoading, accent: 'success' as const },
    { label: 'New inquiries', value: inquiries?.new ?? 0, href: '/super-admin/contact-inquiries', icon: Mail, loading: inquiriesLoading, accent: 'warning' as const },
    { label: 'Activity Log', value: audits?.meta?.total ?? 0, href: '/super-admin/audit-logs', icon: ClipboardList, loading: auditsLoading, accent: 'muted' as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pharmacy Management"
        description={`Welcome back, ${user?.firstName}. Manage pharmacies, pharmacist admins, network access, contact inquiries, and platform activity.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) =>
          stat.loading ? (
            <Skeleton key={stat.label} className="h-[88px] rounded-xl" />
          ) : (
            <Link key={stat.label} href={stat.href} className="block transition-transform hover:scale-[1.01]">
              <StatCard label={stat.label} value={stat.value} icon={stat.icon} accent={stat.accent} />
            </Link>
          ),
        )}
      </div>

      <Card className="border-border/80 shadow-md shadow-black/[0.03] dark:shadow-black/20">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Quick tasks</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/super-admin/pharmacist-admins/create">
            <Button className="shadow-md shadow-primary/20">
              <Plus className="h-4 w-4" />
              Add Pharmacist Admin
            </Button>
          </Link>
          <Link href="/super-admin/management">
            <Button variant="outline" className="border-border/80 shadow-none">
              Manage Pharmacies
            </Button>
          </Link>
          <Link href="/super-admin/network-access">
            <Button variant="outline" className="border-border/80 shadow-none">
              <Network className="h-4 w-4" />
              Network Access
            </Button>
          </Link>
          <Link href="/super-admin/usage">
            <Button variant="outline" className="border-border/80 shadow-none">
              <Gauge className="h-4 w-4" />
              Pharmacy usage
            </Button>
          </Link>
          <Link href="/super-admin/contact-inquiries">
            <Button variant="outline" className="border-border/80 shadow-none">
              Contact inbox
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/super-admin/audit-logs">
            <Button variant="outline" className="border-border/80 shadow-none">
              View Activity Log
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {showPlatformAdmins ? (
            <Link href="/super-admin/platform-admins">
              <Button variant="outline" className="border-border/80 shadow-none">
                <Shield className="h-4 w-4" />
                Platform Admins
              </Button>
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {/* <Card className="border-border/80">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted-foreground">
            Need pathways, Safety Alert, assist system, or document formats?
          </p>
          <Link href="/super-admin/platform" onClick={() => writeStoredPortal('platform')}>
            <Button variant="outline">
              <FlaskConical className="h-4 w-4" />
              Switch to Clinical Platform
            </Button>
          </Link>
        </CardContent>
      </Card> */}
    </div>
  );
}
