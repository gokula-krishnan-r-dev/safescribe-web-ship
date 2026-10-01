'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, type UserListItem } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';
import { useAllPlatformUsers } from './hooks';
import {
  PharmacyUserCard,
  type PharmacyUserCardData,
} from '@/features/admin-management/pharmacy-user-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RoleFilter = 'all' | 'owners' | 'users';

interface PharmacyUsersGridProps {
  tenantId?: string;
}

function toCardData(user: UserListItem): PharmacyUserCardData {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    roleDisplayName: user.roleDisplayName,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    organization: user.organization,
  };
}

export function PharmacyUsersGrid({ tenantId }: PharmacyUsersGridProps) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PharmacyUserCardData | null>(null);
  const [resetTarget, setResetTarget] = useState<PharmacyUserCardData | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [tenantId, roleFilter, status, search, sortOrder]);

  const { data, isLoading, isError, refetch } = useAllPlatformUsers({
    page,
    limit: 12,
    search,
    status: status || undefined,
    tenantId,
    roleFilter,
    sortOrder,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['all-platform-users'] });
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status: s }: { id: string; status: string }) => api.patch(`/users/${id}`, { status: s }),
    onSuccess: () => { invalidate(); toast.success('Status updated successfully'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success('User removed successfully');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { newPassword: password }),
    onSuccess: () => {
      setResetTarget(null);
      setNewPassword('');
      toast.success('Password reset done. Share the new password securely.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const roleFilters: { id: RoleFilter; label: string }[] = [
    { id: 'all', label: 'All Roles' },
    { id: 'owners', label: 'Pharmacy owners' },
    { id: 'users', label: 'Pharmacy staff' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Manage Pharmacy Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor roles, access, and engagement across your pharmacy team.
            {tenantId ? ' Showing users for the selected pharmacy.' : ' Showing all users on the platform.'}
          </p>
        </div>
        <Link href="/super-admin/pharmacist-admins/create">
          <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary">
            <Plus className="h-4 w-4" />
            Add New User
          </Button>
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-primary">Filter Users</p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name or email…"
            className="max-w-xs"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="PENDING">Pending</option>
          </select>
          <select
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          >
            {roleFilters.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
          <Button
            className="ml-auto"
            onClick={() => {
              setSearchInput('');
              setStatus('');
              setRoleFilter('all');
              setSortOrder('desc');
            }}
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.data.length ? (
        <EmptyState
          title="No users found"
          description="Try changing your filters, or add a new pharmacy owner to get started."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.data.map((user) => (
              <PharmacyUserCard
                key={user.id}
                user={toCardData(user)}
                tenantId={tenantId}
                onSuspend={(u) =>
                  statusMutation.mutate({
                    id: u.id,
                    status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                  })
                }
                onDelete={setDeleteTarget}
                onResetPassword={setResetTarget}
              />
            ))}
          </div>

          {data.meta.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 12 + 1}–{Math.min(page * 12, data.meta.total)} of {data.meta.total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove user?"
        description={`This will permanently remove ${deleteTarget?.fullName ?? 'this user'} from the platform. They will be signed out immediately.`}
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setResetTarget(null); setNewPassword(''); }}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-primary">Reset password</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Set a new password for {resetTarget.fullName}. Share it with them securely.
            </p>
            <Input
              type="password"
              className="mt-4"
              placeholder="New password (at least 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setResetTarget(null); setNewPassword(''); }}>
                Cancel
              </Button>
              <Button
                disabled={newPassword.length < 8 || resetMutation.isPending}
                onClick={() => resetMutation.mutate({ id: resetTarget.id, password: newPassword })}
              >
                {resetMutation.isPending ? 'Resetting…' : 'Reset password'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
