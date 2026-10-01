'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Building2,
  Mail,
  Phone,
  Printer,
  Search,
  Users,
  UserCheck,
  UserRound,
} from 'lucide-react';
import { useTenants } from './hooks';
import { StatusBadge } from '@/components/shared/status-badge';
import { StatCard } from '@/components/shared/stat-card';
import { Pagination } from '@/components/shared/pagination';
import { UserAvatar } from '@/components/shared/user-avatar';
import { formatDate } from '@/lib/utils';
import { formatDocumentFaxNumber } from '@safescript/shared';
import { ErrorState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { TenantListItem } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

interface AllPharmaciesOverviewProps {
  onSelectTenant: (tenantId: string) => void;
  onViewStaff: (tenantId: string) => void;
}

export function AllPharmaciesOverview({
  onSelectTenant,
  onViewStaff,
}: AllPharmaciesOverviewProps) {
  const { data: tenants, isLoading, isError, refetch } = useTenants();
  const [nameQuery, setNameQuery] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const activeCount = tenants?.filter((t) => t.status === 'ACTIVE').length ?? 0;
  const phixCount = tenants?.filter((t) => t.phixCustomer).length ?? 0;

  const filtered = useMemo(() => {
    const rows = tenants ?? [];
    const name = nameQuery.trim().toLowerCase();
    const email = emailQuery.trim().toLowerCase();
    const next = rows.filter((tenant) => {
      if (status && tenant.status !== status) return false;
      if (source === 'phix' && !tenant.phixCustomer) return false;
      if (source === 'direct' && tenant.phixCustomer) return false;
      if (name) {
        const haystack = [
          tenant.name,
          tenant.slug,
          tenant.pharmacyLicenseNumber ?? '',
          tenant.phone ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(name)) return false;
      }
      if (email) {
        const owner = `${tenant.admin?.fullName ?? ''} ${tenant.admin?.email ?? ''}`.toLowerCase();
        if (!owner.includes(email)) return false;
      }
      return true;
    });
    next.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return next;
  }, [tenants, nameQuery, emailQuery, status, source, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const resetFilters = () => {
    setNameQuery('');
    setEmailQuery('');
    setStatus('');
    setSource('');
    setPage(1);
  };

  const hasFilters = Boolean(nameQuery || emailQuery || status || source);

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Pharmacies registered
            <span className="ml-2 font-semibold text-primary">
              {isLoading ? '…' : tenants?.length ?? 0}
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {filtered.length === (tenants?.length ?? 0)
              ? `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}`
              : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length} matching · ${tenants?.length ?? 0} total`}
          </p>
        </div>
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filtered.length}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          hideSummary
          className="sm:justify-end"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total pharmacies"
          value={tenants?.length ?? '—'}
          icon={Building2}
          accent="primary"
        />
        <StatCard label="Active" value={activeCount} icon={UserCheck} accent="success" />
        <StatCard label="Phix customers" value={phixCount} icon={Users} accent="muted" />
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/80 bg-white shadow-sm shadow-black/[0.03]">
        <CardContent className="p-0">
          <div className="border-b border-border/60 bg-muted/20 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FilterField label="Pharmacy">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={nameQuery}
                    onChange={(e) => {
                      setNameQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by name, ID, or phone…"
                    className="h-10 border-border/80 bg-background pl-9 shadow-none"
                  />
                </div>
              </FilterField>
              <FilterField label="Status">
                <Select
                  className="h-10 border-border/80 bg-background shadow-none"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: '', label: 'All statuses' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'SUSPENDED', label: 'Suspended' },
                  ]}
                />
              </FilterField>
              <FilterField label="Source">
                <Select
                  className="h-10 border-border/80 bg-background shadow-none"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setPage(1);
                  }}
                  options={[
                    { value: '', label: 'All sources' },
                    { value: 'phix', label: 'Phix customer' },
                    { value: 'direct', label: 'Direct / SafeScribe' },
                  ]}
                />
              </FilterField>
              <FilterField label="Owner / manager email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={emailQuery}
                    onChange={(e) => {
                      setEmailQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search by owner name or email…"
                    className="h-10 border-border/80 bg-background pl-9 shadow-none"
                  />
                </div>
              </FilterField>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-border/80 bg-background shadow-none"
                onClick={() => setSortOrder((value) => (value === 'asc' ? 'desc' : 'asc'))}
              >
                <ArrowUpDown className="h-4 w-4" />
                {sortOrder === 'asc' ? 'Name A–Z' : 'Name Z–A'}
              </Button>
              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : !pageRows.length ? (
            <div className="px-5 py-12 text-center">
              <p className="font-medium text-foreground">No pharmacies match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different name, owner email, status, or source.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Pharmacy
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Owner / manager
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Team
                      </th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Allowance
                      </th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {pageRows.map((tenant) => (
                      <tr key={tenant.id} className="align-top hover:bg-muted/30">
                        <td className="px-5 py-4">
                          <PharmacyIdentity tenant={tenant} />
                        </td>
                        <td className="px-5 py-4">
                          <OwnerCell
                            tenant={tenant}
                            onViewStaff={() => onViewStaff(tenant.id)}
                          />
                        </td>
                        <td className="px-5 py-4">
                          <TeamCell tenant={tenant} />
                        </td>
                        <td className="px-5 py-4">
                          <AllowanceCell tenant={tenant} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onSelectTenant(tenant.id)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-border lg:hidden">
                {pageRows.map((tenant) => (
                  <article key={tenant.id} className="space-y-4 px-5 py-4">
                    <PharmacyIdentity tenant={tenant} />
                    <OwnerCell tenant={tenant} onViewStaff={() => onViewStaff(tenant.id)} />
                    <div className="grid grid-cols-2 gap-3">
                      <TeamCell tenant={tenant} />
                      <AllowanceCell tenant={tenant} />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => onSelectTenant(tenant.id)}
                    >
                      View pharmacy
                    </Button>
                  </article>
                ))}
              </div>

              <div className="border-t border-border/60 px-5 py-4">
                <Pagination
                  page={currentPage}
                  totalPages={totalPages}
                  total={filtered.length}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function PharmacyIdentity({ tenant }: { tenant: TenantListItem }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{tenant.name}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">ID {tenant.slug}</p>
        </div>
      </div>
      {tenant.pharmacyLicenseNumber && (
        <p className="pl-12 text-xs text-muted-foreground">
          Licence {tenant.pharmacyLicenseNumber}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-12 text-xs text-muted-foreground">
        {tenant.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {formatDocumentFaxNumber(tenant.phone) ?? tenant.phone}
          </span>
        )}
        {tenant.faxNumber && (
          <span className="inline-flex items-center gap-1">
            <Printer className="h-3 w-3" />
            {formatDocumentFaxNumber(tenant.faxNumber) ?? tenant.faxNumber}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-12">
        <StatusBadge status={tenant.status} />
        {tenant.phixCustomer && (
          <Badge variant="warning" className="font-medium">
            Phix
          </Badge>
        )}
      </div>
    </div>
  );
}

function OwnerCell({
  tenant,
  onViewStaff,
}: {
  tenant: TenantListItem;
  onViewStaff: () => void;
}) {
  if (!tenant.admin) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No owner assigned</p>
        <button
          type="button"
          onClick={onViewStaff}
          className="text-sm font-medium text-primary hover:underline"
        >
          View staff
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2.5">
        <UserAvatar name={tenant.admin.fullName} size="sm" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
            {tenant.admin.fullName}
          </p>
          <p className="truncate text-xs text-muted-foreground">{tenant.admin.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last sign-in{' '}
            {tenant.admin.lastLoginAt ? formatDate(tenant.admin.lastLoginAt) : 'never'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewStaff}
        className="text-sm font-medium text-primary hover:underline"
      >
        View staff
      </button>
    </div>
  );
}

function TeamCell({ tenant }: { tenant: TenantListItem }) {
  const pharmacists = tenant.pharmacistCount ?? 0;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-foreground">
        {pharmacists} {pharmacists === 1 ? 'pharmacist' : 'pharmacists'}
      </p>
      <p className="text-xs text-muted-foreground">
        {tenant.userCount} {tenant.userCount === 1 ? 'user' : 'users'} in total
      </p>
    </div>
  );
}

function AllowanceCell({ tenant }: { tenant: TenantListItem }) {
  const prescribe = tenant.prescribe;
  if (!prescribe) {
    return (
      <div className="space-y-1">
        <Badge variant="outline">Not configured</Badge>
        <p className="text-xs text-muted-foreground">Set daily Prescribe allowance</p>
      </div>
    );
  }

  const included =
    prescribe.included == null ? 'Unlimited' : `${prescribe.included}/${prescribe.period}`;

  return (
    <div className="space-y-1">
      <Badge variant={prescribe.active ? 'success' : 'destructive'}>
        {prescribe.active ? 'Active' : 'Inactive'}
      </Badge>
      <p className={cn('text-sm font-medium', prescribe.active ? 'text-foreground' : 'text-muted-foreground')}>
        {included}
      </p>
      {tenant.phixCustomer && (
        <p className="text-xs text-muted-foreground">Phix complimentary access</p>
      )}
    </div>
  );
}
