'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/states';
import {
  PharmacyUserCard,
  type PharmacyUserCardData,
} from '@/features/admin-management/pharmacy-user-card';

interface PharmacyDetailUsersTabProps {
  tenantId: string;
  pharmacyName: string;
  users: PharmacyUserCardData[];
}

export function PharmacyDetailUsersTab({
  tenantId,
  pharmacyName,
  users,
}: PharmacyDetailUsersTabProps) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PharmacyUserCardData | null>(null);
  const [resetTarget, setResetTarget] = useState<PharmacyUserCardData | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['all-platform-users'] });
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/users/${id}`, { status }),
    onSuccess: () => {
      invalidate();
      toast.success('Status updated successfully');
    },
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
      toast.success('Password reset successfully');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manage Pharmacy Users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor roles, access, and engagement across {pharmacyName}.
          </p>
        </div>
        <Link href="/super-admin/pharmacist-admins/create">
          <Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary">
            <Plus className="h-4 w-4" />
            Add New User
          </Button>
        </Link>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="This pharmacy does not have any registered users."
          action={
            <Link href="/super-admin/pharmacist-admins/create">
              <Button>
                <Plus className="h-4 w-4" />
                Add Pharmacy Owner
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {users.map((user) => (
            <PharmacyUserCard
              key={user.id}
              user={user}
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
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove user?"
        description={`Remove ${deleteTarget?.fullName} from this pharmacy?`}
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => {
              setResetTarget(null);
              setNewPassword('');
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Reset password</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Set a new password for {resetTarget.fullName}.
            </p>
            <Input
              type="password"
              className="mt-4"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResetTarget(null);
                  setNewPassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={newPassword.length < 8 || resetMutation.isPending}
                onClick={() =>
                  resetMutation.mutate({ id: resetTarget.id, password: newPassword })
                }
              >
                {resetMutation.isPending ? 'Please wait...' : 'Reset Password'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
