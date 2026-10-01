'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ErrorState } from '@/components/shared/states';
import { PageSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuditLog } from '@/features/users/hooks';
import { formatDate } from '@/lib/utils';

export function AuditLogDetailPage({ id }: { id: string }) {
  const { data: log, isLoading, isError, refetch } = useAuditLog(id);

  if (isLoading) return <PageSkeleton />;
  if (isError || !log) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div>
      <PageHeader
        title={log.action}
        description={`${log.module} · ${formatDate(log.createdAt)}`}
        breadcrumbs={[
          { label: 'Activity log', href: '/super-admin/audit-logs' },
          { label: log.action },
        ]}
        actions={
          <Link href="/super-admin/audit-logs">
            <Button variant="outline"><ArrowLeft className="h-4 w-4" />Back</Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Event details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Result</span><StatusBadge status={log.status} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">User</span><span className="font-medium">{log.userName ?? 'System'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{log.userRole ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pharmacy</span><span>{log.organization ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IP address</span><span>{log.ipAddress ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Browser</span><span className="max-w-[200px] truncate text-right">{log.userAgent ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Device</span><span>{log.deviceInfo ?? '—'}</span></div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Changes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {log.previousValue ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Before</p>
                <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(log.previousValue, null, 2)}</pre>
              </div>
            ) : null}
            {log.newValue ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">After</p>
                <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(log.newValue, null, 2)}</pre>
              </div>
            ) : null}
            {!log.previousValue && !log.newValue && (
              <p className="text-sm text-muted-foreground">No changes were recorded for this event</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
