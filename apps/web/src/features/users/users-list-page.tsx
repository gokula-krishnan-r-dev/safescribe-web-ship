'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Download,
  Building2,
  Users,
  UserCheck,
  UserX,
  Clock,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { exportToCsv } from '@/lib/export';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTableToolbar } from '@/components/shared/data-table-toolbar';
import { TableRowActions } from '@/components/shared/table-row-actions';
import { Pagination } from '@/components/shared/pagination';
import { StatCard } from '@/components/shared/stat-card';
import { UserAvatar } from '@/components/shared/user-avatar';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useUsersList, type UserListParams } from '@/features/users/hooks';
import {
  UserPasswordDialog,
  type UserPasswordDialogMode,
} from '@/features/users/user-password-dialog';
import type { UserModuleConfig } from '@/features/users/config';
import type { UserListItem } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface UsersListPageProps {
  config: UserModuleConfig;
}

export function UsersListPage({ config }: UsersListPageProps) {
  const queryClient = useQueryClient();
  const [params, setParams] = useState<UserListParams>({
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<{
    user: UserListItem;
    mode: UserPasswordDialogMode;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => ({ ...p, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch, isFetching } = useUsersList(config, params);

  const stats = useMemo(() => {
    if (!data?.data) return { total: 0, active: 0, suspended: 0, pending: 0 };
    return {
      total: data.meta.total,
      active: data.data.filter((u) => u.status === 'ACTIVE').length,
      suspended: data.data.filter((u) => u.status === 'SUSPENDED').length,
      pending: data.data.filter((u) => u.status === 'PENDING').length,
    };
  }, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [config.listEndpoint] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success(`${config.singularTitle} removed successfully`);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/users/${id}`, { status }),
    onSuccess: () => {
      invalidate();
      toast.success('Status updated successfully');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      setPasswordTarget(null);
      toast.success('Password updated. Share it securely with the user.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleExport = () => {
    if (!data?.data.length) {
      toast.error('Nothing to export yet. Add some users first.');
      return;
    }
    exportToCsv(
      `${config.type}-export.csv`,
      ['Name', 'Email', 'Pharmacy', 'Status', 'Last Sign-in', 'Created'],
      data.data.map((u) => [
        u.fullName,
        u.email,
        u.organization ?? '',
        u.status,
        u.lastLoginAt ? formatDate(u.lastLoginAt) : '',
        formatDate(u.createdAt),
      ]),
    );
    toast.success('Export downloaded — check your downloads folder', { announce: true });
  };

  const resetFilters = () => {
    setSearchInput('');
    setParams({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        description={config.description}
        breadcrumbs={[{ label: config.title }]}
        actions={
          <>
            <Button
              variant="outline"
              onClick={handleExport}
              className="border-border/80 bg-card shadow-none"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Link href={`${config.basePath}/create`}>
              <Button className="shadow-md shadow-primary/20">
                <Plus className="h-4 w-4" />
                Add {config.singularTitle}
              </Button>
            </Link>
          </>
        }
      />

      {!isLoading && data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total" value={stats.total} icon={Users} accent="primary" />
          <StatCard label="Active" value={stats.active} icon={UserCheck} accent="success" />
          <StatCard
            label={config.type === 'pharmacist' ? 'Inactive' : 'Suspended'}
            value={stats.suspended}
            icon={UserX}
            accent="warning"
          />
          <StatCard label="Pending" value={stats.pending} icon={Clock} accent="muted" />
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl border-border/80 bg-white shadow-sm shadow-black/[0.03]">
        <CardContent className="p-0">
          <div className="border-b border-border/60 bg-muted/20 px-5 py-5">
            <DataTableToolbar
              search={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Search by name or email…"
              status={params.status ?? ''}
              onStatusChange={(v) => setParams((p) => ({ ...p, status: v || undefined, page: 1 }))}
              statusOptions={
                config.type === 'pharmacist'
                  ? [
                      { value: '', label: 'All statuses' },
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'SUSPENDED', label: 'Inactive' },
                      { value: 'PENDING', label: 'Pending' },
                    ]
                  : undefined
              }
              sortOrder={params.sortOrder}
              onSortToggle={() =>
                setParams((p) => ({
                  ...p,
                  sortOrder: p.sortOrder === 'desc' ? 'asc' : 'desc',
                }))
              }
              onReset={resetFilters}
              total={data?.meta.total}
            />
          </div>

          {isLoading ? (
            <div className="p-6"><TableSkeleton rows={6} /></div>
          ) : isError ? (
            <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>
          ) : !data?.data.length ? (
            <div className="p-6">
              <EmptyState
                action={
                  <Link href={`${config.basePath}/create`}>
                    <Button>Add {config.singularTitle}</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              <div className={cn('overflow-x-auto', isFetching && 'opacity-60 transition-opacity')}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        User
                      </th>
                      {config.showOrganization && (
                        <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Pharmacy
                        </th>
                      )}
                      <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Status
                      </th>
                      <th className="hidden px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">
                        Last sign-in
                      </th>
                      <th className="hidden px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
                        Created
                      </th>
                      <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.data.map((user) => (
                      <tr key={user.id} className="data-table-row group">
                        <td className="px-5 py-4">
                          <Link
                            href={`${config.basePath}/${user.id}`}
                            className="flex items-center gap-3 hover:opacity-80"
                          >
                            <UserAvatar name={user.fullName} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground group-hover:text-primary">
                                {user.fullName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </Link>
                        </td>
                        {config.showOrganization && (
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{user.organization ?? '—'}</span>
                            </div>
                          </td>
                        )}
                        <td className="px-5 py-4">
                          <StatusBadge
                            status={
                              config.type === 'pharmacist' && user.status === 'SUSPENDED'
                                ? 'INACTIVE'
                                : user.status
                            }
                          />
                        </td>
                        <td className="hidden px-5 py-4 text-muted-foreground md:table-cell">
                          {formatDate(user.lastLoginAt)}
                        </td>
                        <td className="hidden px-5 py-4 text-muted-foreground lg:table-cell">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-5 py-4">
                          <TableRowActions
                            viewHref={`${config.basePath}/${user.id}`}
                            editHref={`${config.basePath}/${user.id}/edit`}
                            status={user.status}
                            isStatusPending={statusMutation.isPending}
                            onToggleStatus={() =>
                              statusMutation.mutate({
                                id: user.id,
                                status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                              })
                            }
                            onChangePassword={() =>
                              setPasswordTarget({ user, mode: 'change' })
                            }
                            onResetPassword={() =>
                              setPasswordTarget({ user, mode: 'reset' })
                            }
                            onDelete={() => setDeleteTarget(user)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-border/60 bg-muted/10 px-5 py-4">
                <Pagination
                  page={params.page ?? 1}
                  totalPages={data.meta.totalPages}
                  total={data.meta.total}
                  limit={params.limit ?? 10}
                  onPageChange={(page) => setParams((p) => ({ ...p, page }))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Remove ${config.singularTitle}?`}
        description={`This will permanently remove ${deleteTarget?.fullName} from the system. They will be signed out immediately. This cannot be undone.`}
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <UserPasswordDialog
        open={!!passwordTarget}
        mode={passwordTarget?.mode ?? 'change'}
        userName={passwordTarget?.user.fullName ?? 'this user'}
        loading={passwordMutation.isPending}
        onOpenChange={(open) => !open && setPasswordTarget(null)}
        onSubmit={(password) => {
          if (!passwordTarget) return;
          passwordMutation.mutate({ id: passwordTarget.user.id, password });
        }}
      />
    </div>
  );
}
