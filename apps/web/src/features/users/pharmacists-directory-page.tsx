'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import { api } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { useUsersList, type UserListParams } from '@/features/users/hooks';
import { PHARMACIST_CONFIG } from '@/features/users/config';
import { PharmacistTeamCard } from '@/features/users/pharmacist-team-card';
import type { UserListItem } from '@/lib/api-client';

export function PharmacistsDirectoryPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [params, setParams] = useState<UserListParams>({
    page: 1,
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserListItem | null>(null);
  const [resetTarget, setResetTarget] = useState<UserListItem | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () => setParams((p) => ({ ...p, search: searchInput, page: 1 })),
      300,
    );
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch, isFetching } = useUsersList(
    PHARMACIST_CONFIG,
    params,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [PHARMACIST_CONFIG.listEndpoint] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success('Pharmacist removed');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/users/${id}`, { status }),
    onSuccess: (_, vars) => {
      invalidate();
      setSuspendTarget(null);
      toast.success(vars.status === 'ACTIVE' ? 'Pharmacist reactivated' : 'Pharmacist suspended');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const resetLinkMutation = useMutation({
    mutationFn: (email: string) => api.post('/auth/forgot-password', { email }),
    onSuccess: () => {
      setResetTarget(null);
      toast.success('Password reset link sent if that account can receive email.', { announce: true });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const resetFilters = () => {
    setSearchInput('');
    setParams({ page: 1, limit: 12, sortBy: 'createdAt', sortOrder: 'desc' });
  };

  const busy =
    deleteMutation.isPending || statusMutation.isPending || resetLinkMutation.isPending;
  const page = params.page ?? 1;
  const totalPages = data?.meta.totalPages ?? 1;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-[#0f3f3c] sm:text-[32px]">
            Manage Pharmacy Users
          </h1>
          <p className="mt-1.5 max-w-2xl text-[14.5px] text-[#5b7a76]">
            Monitor roles, access, and engagement across your pharmacy team.
          </p>
        </div>
        <Link href={`${PHARMACIST_CONFIG.basePath}/create`}>
          <Button className="h-11 rounded-xl px-5 shadow-sm shadow-primary/20">
            <Plus className="h-4 w-4" />
            Add New User
          </Button>
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-[#d7e0e3] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
        <p className="mb-3 text-[15px] font-bold text-[#0f3f3c]">Filter Users</p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name or email…"
            className="h-10 max-w-xs rounded-[10px] border-[#d7e0e3] bg-white"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search pharmacists"
          />
          <Select
            className="h-10 w-[9.5rem] rounded-[10px] border-[#d7e0e3] bg-white"
            value={params.status ?? ''}
            onChange={(e) =>
              setParams((p) => ({ ...p, status: e.target.value || undefined, page: 1 }))
            }
            aria-label="Filter by status"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'SUSPENDED', label: 'Suspended' },
              { value: 'PENDING', label: 'Pending' },
            ]}
          />
          <Select
            className="h-10 w-[9.5rem] rounded-[10px] border-[#d7e0e3] bg-white"
            defaultValue=""
            aria-label="Filter by role"
            options={[
              { value: '', label: 'All Roles' },
              { value: 'pharmacist', label: 'Pharmacist' },
            ]}
          />
          <Select
            className="h-10 w-[8.5rem] rounded-[10px] border-[#d7e0e3] bg-white"
            value={params.sortOrder ?? 'desc'}
            onChange={(e) =>
              setParams((p) => ({
                ...p,
                sortOrder: e.target.value as 'asc' | 'desc',
                page: 1,
              }))
            }
            aria-label="Sort users"
            options={[
              { value: 'desc', label: 'Newest' },
              { value: 'asc', label: 'Oldest' },
            ]}
          />
          <Button
            type="button"
            className="ml-auto h-10 rounded-xl px-5"
            onClick={resetFilters}
          >
            Reset Filters
          </Button>
        </div>
      </section>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[250px] animate-pulse rounded-2xl bg-[#e7f4f2]"
            />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data?.data.length ? (
        <EmptyState
          title="No pharmacists yet"
          description="Add a pharmacist to give them access to consultations for this pharmacy."
          action={
            <Link href={`${PHARMACIST_CONFIG.basePath}/create`}>
              <Button>
                <Plus className="h-4 w-4" />
                Add New User
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div
            className={
              isFetching
                ? 'grid gap-4 opacity-70 transition-opacity sm:grid-cols-2 xl:grid-cols-3'
                : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
            }
          >
            {data.data.map((user) => (
              <PharmacistTeamCard
                key={user.id}
                user={user}
                basePath={PHARMACIST_CONFIG.basePath}
                busy={busy}
                onSuspend={setSuspendTarget}
                onRemove={setDeleteTarget}
                onSendReset={setResetTarget}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-[#5b7a76]">
                Showing {(page - 1) * 12 + 1}–
                {Math.min(page * 12, data.meta.total)} of {data.meta.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={page <= 1}
                  onClick={() => setParams((p) => ({ ...p, page: page - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={page >= totalPages}
                  onClick={() => setParams((p) => ({ ...p, page: page + 1 }))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove pharmacist?"
        description={`This will permanently remove ${deleteTarget?.fullName ?? 'this pharmacist'} from your pharmacy. They will be signed out immediately.`}
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
        title={
          suspendTarget?.status === 'ACTIVE' ? 'Suspend pharmacist?' : 'Reactivate pharmacist?'
        }
        description={
          suspendTarget?.status === 'ACTIVE'
            ? `${suspendTarget.fullName} will not be able to sign in until you reactivate the account.`
            : `${suspendTarget?.fullName ?? 'This pharmacist'} will be able to sign in again.`
        }
        confirmLabel={suspendTarget?.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
        variant={suspendTarget?.status === 'ACTIVE' ? 'destructive' : 'default'}
        loading={statusMutation.isPending}
        onConfirm={() =>
          suspendTarget &&
          statusMutation.mutate({
            id: suspendTarget.id,
            status: suspendTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
          })
        }
      />

      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Send password reset link?"
        description={`A reset link will be emailed to ${resetTarget?.email ?? 'this pharmacist'} if mail is configured for this pharmacy.`}
        confirmLabel="Send link"
        variant="default"
        loading={resetLinkMutation.isPending}
        onConfirm={() => resetTarget && resetLinkMutation.mutate(resetTarget.email)}
      />
    </div>
  );
}
