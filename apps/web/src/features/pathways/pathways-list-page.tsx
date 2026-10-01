'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FlaskConical,
  Plus,
  Search,
  FileText,
  AlertCircle,
  Loader2,
  Cpu,
  CheckCircle2,
  BookOpen,
  Trash2,
  Eye,
  MoreHorizontal,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PathwayStatusBadge } from './pathway-status-badge';
import { CreatePathwayModal } from './create-pathway-modal';
import { usePathways, usePathwayStats, useDeletePathway } from './hooks';
import type { PathwayStatus, PathwayListItem } from './types';
import { countUnpublishedPathways } from './pathway-utils';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Pagination } from '@/components/shared/pagination';

const PAGE_SIZE = 10;

const STATUS_FILTERS: { label: string; value: PathwayStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Live', value: 'PUBLISHED' },
  { label: 'Not Live', value: 'UNPUBLISHED' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Being Prepared', value: 'AI_PROCESSING' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export function PathwaysListPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PathwayStatus | ''>('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PathwayListItem | null>(null);

  // Debounce search to avoid refetching on every keystroke
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: pathways, isLoading, isFetching } = usePathways({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: statusFilter || undefined,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });

  const { data: stats } = usePathwayStats();
  const deleteMutation = useDeletePathway();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Pathway deleted.');
      setDeleteTarget(null);
    } catch {
      toast.error('Could not delete pathway. Please try again.');
    }
  };

  const openPathway = (id: string) => {
    router.push(`/super-admin/pathways/${id}`);
  };

  return (
    <div className="flex min-h-full flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <FlaskConical className="h-4.5 w-4.5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Clinical Pathways</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload clinical guides and publish pathways for your pharmacists to use in consultations.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          New Pathway
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats?.total ?? 0, icon: BookOpen, color: 'text-slate-600' },
          {
            label: 'Not Live',
            value: countUnpublishedPathways(stats?.byStatus),
            icon: AlertCircle,
            color: 'text-amber-600',
          },
          {
            label: 'Live',
            value: stats?.byStatus?.PUBLISHED ?? 0,
            icon: CheckCircle2,
            color: 'text-green-600',
          },
          {
            label: 'Being Prepared',
            value: stats?.byStatus?.AI_PROCESSING ?? 0,
            icon: Cpu,
            color: 'text-blue-600',
          },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4 p-4 shadow-none">
            <div className={cn('rounded-lg bg-muted/60 p-2', stat.color)}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Table card */}
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardContent className="p-0">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-4 sm:px-5">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by pathway name, condition, or province…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
                aria-label="Search pathways"
              />
            </div>
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/30 p-1"
              role="tablist"
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === f.value}
                  onClick={() => {
                    setStatusFilter(f.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                    statusFilter === f.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={6} />
            </div>
          ) : !pathways?.items?.length ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <FlaskConical className="mb-4 h-10 w-10 text-muted-foreground/40" />
              <p className="text-base font-medium text-muted-foreground">No pathways found</p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                {search || statusFilter
                  ? 'Try a different search or status filter'
                  : 'Create your first clinical pathway to get started'}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreate(true)} className="mt-4 gap-2" size="sm">
                  <Plus className="h-4 w-4" />
                  Create Pathway
                </Button>
              )}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'overflow-x-auto transition-opacity',
                  isFetching && !isLoading && 'opacity-60',
                )}
              >
                <table className="w-full min-w-[720px] text-sm" aria-label="Clinical pathways">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">
                        Pathway
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">
                        Status
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell sm:px-5">
                        Province
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell sm:px-5">
                        Type
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell sm:px-5">
                        Content
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell sm:px-5">
                        Guide
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {pathways.items.map((pathway) => {
                      const isProcessing = pathway.status === 'AI_PROCESSING';
                      const doc = pathway.documents?.[0];
                      return (
                        <tr
                          key={pathway.id}
                          className="group cursor-pointer transition-colors hover:bg-muted/30"
                          onClick={() => openPathway(pathway.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openPathway(pathway.id);
                            }
                          }}
                          tabIndex={0}
                          aria-label={`Open pathway ${pathway.name}`}
                        >
                          <td className="px-4 py-3.5 sm:px-5">
                            <div className="min-w-0 max-w-[280px]">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-semibold text-foreground">
                                  {pathway.name}
                                </p>
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                                  v{pathway.version}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {pathway.condition}
                              </p>
                              {isProcessing && (
                                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Preparing from guide…
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 sm:px-5">
                            <PathwayStatusBadge status={pathway.status} />
                          </td>
                          <td className="hidden px-4 py-3.5 text-muted-foreground md:table-cell sm:px-5">
                            <span className="line-clamp-2 max-w-[140px] text-xs">
                              {pathway.province || '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3.5 text-muted-foreground lg:table-cell sm:px-5">
                            <span className="line-clamp-2 max-w-[160px] text-xs">
                              {pathway.category || '—'}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3.5 xl:table-cell sm:px-5">
                            <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                              <span className="rounded-md bg-muted/70 px-1.5 py-0.5 tabular-nums">
                                {pathway._count.questions} Q
                              </span>
                              <span className="rounded-md bg-muted/70 px-1.5 py-0.5 tabular-nums">
                                {pathway._count.rules} R
                              </span>
                              <span className="rounded-md bg-muted/70 px-1.5 py-0.5 tabular-nums">
                                {pathway._count.treatments} Tx
                              </span>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3.5 lg:table-cell sm:px-5">
                            {doc ? (
                              <span className="inline-flex max-w-[180px] items-center gap-1.5 text-xs text-muted-foreground">
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{doc.fileName}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">No guide</span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3.5 text-right sm:px-5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="hidden h-8 gap-1.5 text-primary sm:inline-flex"
                                onClick={() => openPathway(pathway.id)}
                              >
                                Review
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    aria-label={`Actions for ${pathway.name}`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openPathway(pathway.id)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View & review
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/super-admin/pathway-qa?pathwayId=${pathway.id}`)}
                                  >
                                    <ClipboardCheck className="mr-2 h-4 w-4" />
                                    Run test cases
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget(pathway)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-border/60 px-4 py-3 sm:px-5">
                <Pagination
                  page={pathways.page}
                  totalPages={pathways.totalPages}
                  total={pathways.total}
                  limit={pathways.limit}
                  onPageChange={setPage}
                />
                {pathways.totalPages <= 1 && pathways.total > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Showing{' '}
                    <span className="font-medium text-foreground">{pathways.total}</span> pathway
                    {pathways.total === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CreatePathwayModal open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove this pathway?"
        description={`Are you sure you want to remove "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
