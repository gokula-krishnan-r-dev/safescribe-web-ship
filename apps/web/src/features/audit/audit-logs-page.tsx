'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Download, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '@/lib/notify';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuditLogs } from '@/features/users/hooks';
import { formatDate } from '@/lib/utils';
import { getPublicApiUrl } from '@/lib/api-url';

export function AuditLogsPage() {
  const [params, setParams] = useState({
    page: 1,
    limit: 20,
    search: '',
    module: '',
    action: '',
    from: '',
    to: '',
  });
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => ({ ...p, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch, isFetching } = useAuditLogs(params);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v && qs.set(k, String(v)));
      const res = await fetch(
        `${getPublicApiUrl()}/api/v1/audit-logs/export?${qs}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-logs.csv';
      a.click();
      toast.success('Export downloaded — check your downloads folder', { announce: true });
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="A full record of sign-ins, account changes, and security events on the platform"
        breadcrumbs={[{ label: 'Activity log' }]}
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3 border-b border-border p-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activity…"
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Input
              type="date"
              className="w-40"
              value={params.from}
              onChange={(e) => setParams((p) => ({ ...p, from: e.target.value, page: 1 }))}
            />
            <Input
              type="date"
              className="w-40"
              value={params.to}
              onChange={(e) => setParams((p) => ({ ...p, to: e.target.value, page: 1 }))}
            />
            <select
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
              value={params.module}
              onChange={(e) => setParams((p) => ({ ...p, module: e.target.value, page: 1 }))}
            >
              <option value="">All areas</option>
              <option value="auth">Sign-in & security</option>
              <option value="users">Users</option>
            </select>
          </div>

          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} /></div>
          ) : isError ? (
            <div className="p-4"><ErrorState onRetry={() => refetch()} /></div>
          ) : !data?.data.length ? (
            <div className="p-4"><EmptyState title="No activity found" description="Try a different search or date range." /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pharmacy</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Area</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Result</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">View</th>
                    </tr>
                  </thead>
                  <tbody className={isFetching ? 'opacity-60' : ''}>
                    {data.data.map((log) => (
                      <tr key={log.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium">{log.userName ?? 'System'}</div>
                          <div className="text-xs text-muted-foreground">{log.userRole}</div>
                        </td>
                        <td className="px-4 py-3.5">{log.organization ?? '—'}</td>
                        <td className="px-4 py-3.5 font-medium">{log.action}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">{log.module}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={log.status} /></td>
                        <td className="px-4 py-3.5 text-right">
                          <Link href={`/super-admin/audit-logs/${log.id}`}>
                            <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.meta.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Page {params.page} of {data.meta.totalPages} ({data.meta.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={params.page <= 1}
                      onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}>
                      <ChevronLeft className="h-4 w-4" />Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={params.page >= data.meta.totalPages}
                      onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}>
                      Next<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
