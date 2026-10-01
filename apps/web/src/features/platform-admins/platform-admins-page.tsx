'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import { Plus } from 'lucide-react';
import {
  SUPER_ADMIN_SCOPE_DESCRIPTIONS,
  SUPER_ADMIN_SCOPE_LABELS,
  SUPER_ADMIN_SCOPES,
  canManagePlatformAdmins,
  resolveSuperAdminScope,
  type SuperAdminScope,
} from '@safescript/shared';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTableToolbar } from '@/components/shared/data-table-toolbar';
import { Pagination } from '@/components/shared/pagination';
import { UserAvatar } from '@/components/shared/user-avatar';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  UserPasswordDialog,
  type UserPasswordDialogMode,
} from '@/features/users/user-password-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, UserCheck, UserX, KeyRound } from 'lucide-react';

interface PlatformAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: string;
  superAdminScope: SuperAdminScope;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedPlatformAdmins {
  data: PlatformAdmin[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const formSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  superAdminScope: z.enum(['FULL', 'PHARMACY', 'CLINICAL']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
});

type FormData = z.infer<typeof formSchema>;

const SCOPE_OPTIONS = [
  { value: SUPER_ADMIN_SCOPES.FULL, label: SUPER_ADMIN_SCOPE_LABELS.FULL },
  { value: SUPER_ADMIN_SCOPES.PHARMACY, label: SUPER_ADMIN_SCOPE_LABELS.PHARMACY },
  { value: SUPER_ADMIN_SCOPES.CLINICAL, label: SUPER_ADMIN_SCOPE_LABELS.CLINICAL },
];

export function PlatformAdminsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const scope = resolveSuperAdminScope(currentUser?.role, currentUser?.superAdminScope);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<PlatformAdmin | 'create' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformAdmin | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<{
    user: PlatformAdmin;
    mode: UserPasswordDialogMode;
  } | null>(null);

  useEffect(() => {
    if (currentUser && !canManagePlatformAdmins(scope)) {
      router.replace('/super-admin');
    }
  }, [currentUser, scope, router]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryKey = ['platform-admins', { page, search, status }];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set('page', String(page));
      qs.set('limit', '10');
      if (search) qs.set('search', search);
      if (status) qs.set('status', status);
      return api.get<PaginatedPlatformAdmins>(`/platform-admins?${qs}`);
    },
    enabled: canManagePlatformAdmins(scope),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['platform-admins'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/platform-admins/${id}`),
    onSuccess: () => {
      toast.success('Platform administrator removed');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'ACTIVE' | 'SUSPENDED' }) =>
      api.patch(`/platform-admins/${id}`, { status: next }),
    onSuccess: () => {
      toast.success('Status updated');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/platform-admins/${id}/reset-password`, { password }),
    onSuccess: () => {
      toast.success('Password reset. They must sign in again.');
      setPasswordTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const stats = useMemo(() => {
    const rows = data?.data ?? [];
    return {
      total: data?.meta.total ?? 0,
      full: rows.filter((u) => u.superAdminScope === 'FULL').length,
      pharmacy: rows.filter((u) => u.superAdminScope === 'PHARMACY').length,
      clinical: rows.filter((u) => u.superAdminScope === 'CLINICAL').length,
    };
  }, [data]);

  if (!canManagePlatformAdmins(scope)) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Admins"
        description="Create separate Super Admin accounts for pharmacy management, clinical management, or both. Each person signs in with their own credentials and only sees the portals their role allows."
        actions={
          <Button onClick={() => setEditor('create')}>
            <Plus className="h-4 w-4" />
            Add platform admin
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ScopeStat label="Total" value={stats.total} />
        <ScopeStat label="Pharmacy & Clinical" value={stats.full} />
        <ScopeStat label="Pharmacy only" value={stats.pharmacy} />
        <ScopeStat label="Clinical only" value={stats.clinical} />
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <DataTableToolbar
            search={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search name or email"
            status={status}
            onStatusChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            total={data?.meta.total}
          />

          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : !data?.data.length ? (
            <EmptyState
              title="No platform administrators"
              description="Add a Super Admin with pharmacy, clinical, or combined access."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-3 font-medium">Administrator</th>
                    <th className="pb-3 font-medium">Role</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Last sign-in</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((admin) => (
                    <tr key={admin.id} className="border-b border-border/70 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={admin.fullName} />
                          <div>
                            <p className="font-medium text-foreground">{admin.fullName}</p>
                            <p className="text-xs text-muted-foreground">{admin.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium">
                          {SUPER_ADMIN_SCOPE_LABELS[admin.superAdminScope]}
                        </p>
                        <p className="max-w-[220px] text-xs text-muted-foreground">
                          {SUPER_ADMIN_SCOPE_DESCRIPTIONS[admin.superAdminScope]}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={admin.status} />
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {admin.lastLoginAt ? formatDate(admin.lastLoginAt) : 'Never'}
                      </td>
                      <td className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-lg border-border/80 bg-white shadow-none"
                              aria-label="Platform admin actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
                            <DropdownMenuItem onSelect={() => setEditor(admin)}>
                              <Pencil className="h-4 w-4" />
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                setPasswordTarget({ user: admin, mode: 'reset' })
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                              Reset password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                statusMutation.mutate({
                                  id: admin.id,
                                  next: admin.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                                })
                              }
                            >
                              {admin.status === 'ACTIVE' ? (
                                <UserX className="h-4 w-4" />
                              ) : (
                                <UserCheck className="h-4 w-4" />
                              )}
                              {admin.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </DropdownMenuItem>
                            {admin.id !== currentUser?.id ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onSelect={() => setDeleteTarget(admin)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.meta.totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              limit={data.meta.limit}
              onPageChange={setPage}
            />
          ) : null}
        </CardContent>
      </Card>

      <PlatformAdminEditor
        target={editor}
        onClose={() => setEditor(null)}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove platform administrator"
        description={`Remove ${deleteTarget?.fullName ?? 'this administrator'}? They will no longer be able to sign in.`}
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <UserPasswordDialog
        open={!!passwordTarget}
        mode={passwordTarget?.mode ?? 'reset'}
        userName={passwordTarget?.user.fullName ?? ''}
        loading={passwordMutation.isPending}
        onOpenChange={(open) => !open && setPasswordTarget(null)}
        onSubmit={(password) =>
          passwordTarget &&
          passwordMutation.mutate({ id: passwordTarget.user.id, password })
        }
      />
    </div>
  );
}

function ScopeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function PlatformAdminEditor({
  target,
  onClose,
  onSaved,
}: {
  target: PlatformAdmin | 'create' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = target === 'create';
  const open = target !== null;
  const editing = isCreate ? null : target;

  const schema = formSchema.superRefine((data, ctx) => {
    if (isCreate && (!data.password || data.password.length < 8)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Password must be at least 8 characters',
        path: ['password'],
      });
    }
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      superAdminScope: SUPER_ADMIN_SCOPES.FULL,
      status: 'ACTIVE',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editing
        ? {
            email: editing.email,
            password: '',
            firstName: editing.firstName,
            lastName: editing.lastName,
            superAdminScope: editing.superAdminScope,
            status: editing.status as FormData['status'],
          }
        : {
            email: '',
            password: '',
            firstName: '',
            lastName: '',
            superAdminScope: SUPER_ADMIN_SCOPES.FULL,
            status: 'ACTIVE',
          },
    );
  }, [open, editing, reset]);

  const selectedScope = watch('superAdminScope');

  const mutation = useMutation({
    mutationFn: (payload: FormData) => {
      if (isCreate) {
        return api.post('/platform-admins', {
          email: payload.email,
          password: payload.password,
          firstName: payload.firstName,
          lastName: payload.lastName,
          superAdminScope: payload.superAdminScope,
          status: payload.status,
        });
      }
      return api.patch(`/platform-admins/${editing!.id}`, {
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        superAdminScope: payload.superAdminScope,
        status: payload.status,
      });
    },
    onSuccess: () => {
      toast.success(isCreate ? 'Platform administrator created' : 'Platform administrator updated');
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Add platform admin' : 'Edit platform admin'}</DialogTitle>
          <DialogDescription>
            Choose whether this Super Admin can manage pharmacies, the clinical platform, or both.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit((values) => mutation.mutate(values))(e);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName ? (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register('lastName')} />
              {errors.lastName ? (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="off" {...register('email')} />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          {isCreate ? (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="superAdminScope">Platform role</Label>
            <Select id="superAdminScope" options={SCOPE_OPTIONS} {...register('superAdminScope')} />
            <p className="text-xs text-muted-foreground">
              {SUPER_ADMIN_SCOPE_DESCRIPTIONS[selectedScope]}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'SUSPENDED', label: 'Suspended' },
                { value: 'PENDING', label: 'Pending' },
              ]}
              {...register('status')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {isCreate ? 'Create admin' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
