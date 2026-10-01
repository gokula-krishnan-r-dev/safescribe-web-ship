'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  ACCESS_REQUEST_STATUS_LABELS,
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TAB_LABELS,
  ACCESS_REQUEST_TABS,
  formatCanadianPhoneDisplay,
  type AccessRequestTab,
} from '@safescript/shared';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  XCircle,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, getInitials } from '@/lib/utils';
import { getPublicApiUrl } from '@/lib/api-url';
import { AccessRequestDetailPanel } from './access-request-detail-panel';
import { MatchBadge, RequestStatusBadge } from './access-request-badges';
import {
  accessRequestExportQuery,
  useAccessRequests,
  type AccessRequestListItem,
} from './hooks';

const QUEUE_TABS: AccessRequestTab[] = [
  ACCESS_REQUEST_TABS.ALL,
  ACCESS_REQUEST_TABS.PENDING,
  ACCESS_REQUEST_TABS.NEW,
  ACCESS_REQUEST_TABS.EXISTING,
  ACCESS_REQUEST_TABS.ACTIVATED,
  ACCESS_REQUEST_TABS.REJECTED,
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(ACCESS_REQUEST_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export function AccessRequestsPage() {
  const [params, setParams] = useState<{
    page: number;
    limit: number;
    search: string;
    status: string;
    tab: AccessRequestTab;
    source: string;
    province: string;
  }>({
    page: 1,
    limit: 25,
    search: '',
    status: '',
    tab: ACCESS_REQUEST_TABS.ALL,
    source: '',
    province: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => ({ ...p, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch, isFetching } = useAccessRequests(params);
  const summary = data?.summary;
  const counts = data?.counts;

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const qs = accessRequestExportQuery(params);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/access-requests/export?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'safescribe-access-requests.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded', { announce: true });
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

  const start = data?.meta.total ? (data.meta.page - 1) * data.meta.limit + 1 : 0;
  const end = data ? Math.min(data.meta.page * data.meta.limit, data.meta.total) : 0;

  return (
    <div className="flex h-full min-h-0">
      <div className="page-gradient min-w-0 flex-1 overflow-auto p-6 sm:p-8">
        <PageHeader
          title="SafeScribe Access Requests"
          description="Review and activate complimentary SafeScribe access requests."
          breadcrumbs={[{ label: 'Access Requests' }]}
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="Pending Review"
            value={summary?.pendingReview ?? 0}
            hint="New access requests"
            icon={Clock}
            tone="sky"
          />
          <SummaryCard
            label="Existing Matches"
            value={summary?.existingMatches ?? 0}
            hint="Need linking / review"
            icon={UserRound}
            tone="amber"
          />
          <SummaryCard
            label="Activated Today"
            value={summary?.activatedToday ?? 0}
            hint="Access activated"
            icon={CheckCircle2}
            tone="emerald"
          />
          <SummaryCard
            label="New Pharmacies Activated"
            value={summary?.newPharmaciesActivated ?? 0}
            hint="Created from this queue"
            icon={Building2}
            tone="teal"
          />
          <SummaryCard
            label="Rejected"
            value={summary?.rejected ?? 0}
            hint="Declined requests"
            icon={XCircle}
            tone="rose"
          />
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {QUEUE_TABS.map((tab) => {
                  const count = counts?.[tab] ?? 0;
                  const active = params.tab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setParams((p) => ({ ...p, tab, page: 1 }))}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {ACCESS_REQUEST_TAB_LABELS[tab]}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px text-[11px] font-semibold',
                          active ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void handleExport()}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
                  <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-b border-border p-4">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by pharmacy name, owner, licence or ID…"
                  className="pl-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <Select
                value={params.source}
                onChange={(e) => setParams((p) => ({ ...p, source: e.target.value, page: 1 }))}
                options={[
                  { value: '', label: 'All sources' },
                  { value: 'qr', label: 'QR Code — Alberta Launch' },
                  { value: 'web', label: 'Web Form — Alberta Launch' },
                ]}
              />
              <Select
                value={params.status}
                onChange={(e) => setParams((p) => ({ ...p, status: e.target.value, page: 1 }))}
                options={STATUS_FILTER_OPTIONS}
              />
              <Select
                value={params.province}
                onChange={(e) => setParams((p) => ({ ...p, province: e.target.value, page: 1 }))}
                options={[
                  { value: '', label: 'All provinces' },
                  { value: 'AB', label: 'Alberta' },
                ]}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Toggle extra filters"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {filtersOpen ? (
              <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                Filters apply to the current tab. Search matches pharmacy, licence, contact, email, or request ID.
              </p>
            ) : null}

            {isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={8} />
              </div>
            ) : isError ? (
              <div className="p-4">
                <ErrorState onRetry={() => void refetch()} />
              </div>
            ) : !data?.data.length ? (
              <div className="p-4">
                <EmptyState
                  title="No access requests"
                  description="New registrations from safescribe.ca/activate will appear here until they are approved or rejected."
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Request</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Owner / Manager</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Registered</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((row) => (
                        <RequestRow
                          key={row.id}
                          row={row}
                          selected={selectedId === row.id}
                          onOpen={() => setSelectedId(row.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                  <p>
                    Showing {start} to {end} of {data.meta.total}
                    {isFetching ? ' · updating' : ''}
                  </p>
                  <Pagination
                    page={params.page}
                    totalPages={data.meta.totalPages}
                    onPage={(page) => setParams((p) => ({ ...p, page }))}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedId ? (
        <div className="hidden h-full lg:block">
          <AccessRequestDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      ) : null}

      {selectedId ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedId(null)} />
          <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-hidden bg-card shadow-2xl">
            <AccessRequestDetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'sky' | 'amber' | 'emerald' | 'teal' | 'rose';
}) {
  const tones = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    teal: 'bg-primary/10 text-primary',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function RequestRow({
  row,
  selected,
  onOpen,
}: {
  row: AccessRequestListItem;
  selected: boolean;
  onOpen: () => void;
}) {
  const pending = row.status === ACCESS_REQUEST_STATUSES.PENDING;
  return (
    <tr
      className={cn(
        'cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/50',
        pending && 'bg-primary/[0.03]',
        selected && 'bg-primary/10',
      )}
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <p className={cn('text-foreground', pending && 'font-semibold')}>{row.pharmacyName}</p>
        <p className="text-xs text-muted-foreground">
          Licence {row.licenceNumber} · {row.province}
        </p>
        <div className="mt-1.5">
          <MatchBadge matchType={row.matchType} />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {getInitials(row.contactName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-foreground">{row.contactName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
            <p className="text-xs text-muted-foreground">{formatCanadianPhoneDisplay(row.phone) || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{row.sourceLabel}</td>
      <td className="px-4 py-3">
        <RequestStatusBadge status={row.status} matchType={row.matchType} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
        {formatDistanceToNow(new Date(row.submittedAt), { addSuffix: true })}
      </td>
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" aria-label="View request" onClick={onOpen}>
            <Eye className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>View details</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const pages = visiblePages(page, totalPages);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((item, index) =>
        item === '…' ? (
          <span key={`ellipsis-${index}`} className="px-1">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? 'default' : 'outline'}
            size="sm"
            className="min-w-8"
            onClick={() => onPage(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function visiblePages(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items = new Set([1, totalPages, page, page - 1, page + 1].filter((n) => n >= 1 && n <= totalPages));
  const sorted = [...items].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && n - prev > 1) out.push('…');
    out.push(n);
  }
  return out;
}
