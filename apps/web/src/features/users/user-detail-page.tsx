'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import {
  Pencil,
  Trash2,
  KeyRound,
  LockKeyhole,
  UserCheck,
  UserX,
  Building2,
  Mail,
  Clock,
  Shield,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser, useLoginHistory, useUserAuditLogs } from './hooks';
import { UserPasswordDialog, type UserPasswordDialogMode } from './user-password-dialog';
import type { UserModuleConfig } from './config';

interface UserDetailPageProps {
  config: UserModuleConfig;
  userId: string;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export function UserDetailPage({ config, userId }: UserDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError, refetch } = useUser(userId);
  const { data: loginHistory } = useLoginHistory(userId);
  const { data: auditData } = useUserAuditLogs(userId);
  const [showDelete, setShowDelete] = useState(false);
  const [passwordMode, setPasswordMode] = useState<UserPasswordDialogMode | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user', userId] });
    queryClient.invalidateQueries({ queryKey: [config.listEndpoint] });
  };

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/users/${userId}`),
    onSuccess: () => {
      toast.success('Removed successfully');
      router.push(config.basePath);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/users/${userId}`, { status }),
    onSuccess: () => { invalidate(); toast.success('Status updated successfully'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const resetPwMutation = useMutation({
    mutationFn: (password: string) => api.post(`/users/${userId}/reset-password`, { password }),
    onSuccess: () => {
      setPasswordMode(null);
      toast.success('Password updated. Share it securely with the user.');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (isLoading) return <PageSkeleton />;
  if (isError || !user) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title={user.fullName}
        description={user.email}
        breadcrumbs={[
          { label: config.title, href: config.basePath },
          { label: user.fullName },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${config.basePath}/${userId}/edit`}>
              <Button variant="outline"><Pencil className="h-4 w-4" />Edit</Button>
            </Link>
            <Button
              variant="outline"
              onClick={() =>
                statusMutation.mutate(user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
              }
            >
              {user.status === 'ACTIVE' ? (
                <><UserX className="h-4 w-4" />Deactivate</>
              ) : (
                <><UserCheck className="h-4 w-4" />Activate</>
              )}
            </Button>
            <Button variant="outline" onClick={() => setPasswordMode('change')}>
              <LockKeyhole className="h-4 w-4" />Change password
            </Button>
            <Button variant="outline" onClick={() => setPasswordMode('reset')}>
              <KeyRound className="h-4 w-4" />Reset password
            </Button>
            <Button variant="destructive" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-4 w-4" />Remove
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Shield} label="Role" value={user.roleDisplayName} />
            <InfoRow icon={Building2} label="Pharmacy" value={user.organization ?? '—'} />
            <InfoRow icon={Clock} label="Status" value={<StatusBadge status={user.status} />} />
            <InfoRow icon={Clock} label="Last sign-in" value={formatDate(user.lastLoginAt)} />
            <InfoRow icon={Clock} label="Created" value={formatDate(user.createdAt)} />
            <InfoRow icon={Clock} label="Updated" value={formatDate(user.updatedAt)} />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Sign-in history</CardTitle>
            </CardHeader>
            <CardContent>
              {!loginHistory?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No sign-in activity yet</p>
              ) : (
                <div className="space-y-2">
                  {loginHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                      <div>
                        <StatusBadge status={entry.success ? 'SUCCESS' : 'FAILED'} />
                        <span className="ml-2 text-muted-foreground">{entry.ipAddress ?? 'IP not recorded'}</span>
                      </div>
                      <span className="text-muted-foreground">{formatDate(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Activity trail</CardTitle>
            </CardHeader>
            <CardContent>
              {!auditData?.data.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {auditData.data.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">{log.action}</span>
                        <span className="ml-2 text-muted-foreground">· {log.module}</span>
                      </div>
                      <span className="text-muted-foreground">{formatDate(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={`Remove ${config.singularTitle}?`}
        description={`This will permanently remove ${user.fullName}. They will be signed out immediately. This cannot be undone.`}
        confirmLabel="Remove"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />

      <UserPasswordDialog
        open={!!passwordMode}
        mode={passwordMode ?? 'change'}
        userName={user.fullName}
        loading={resetPwMutation.isPending}
        onOpenChange={(open) => !open && setPasswordMode(null)}
        onSubmit={(password) => resetPwMutation.mutate(password)}
      />
    </div>
  );
}
