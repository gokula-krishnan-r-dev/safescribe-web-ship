'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  History,
  Loader2,
  Package,
  Pill,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
import {
  useActiveTerminology,
  useSnapshotTerminology,
  useTerminologyConcepts,
  useTerminologyReleases,
} from './clinical-repository-hooks';

const PAGE_SIZE = 15;

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function conceptTypeBadge(type: string) {
  const t = type.toUpperCase();
  if (t.includes('INGREDIENT')) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (t.includes('PRODUCT') || t.includes('DRUG')) {
    return 'bg-sky-50 text-sky-800 border-sky-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

type View = 'sync' | 'history' | 'compare' | 'unresolved';

export function TerminologySyncPanel({ view = 'sync' }: { view?: View }) {
  const { data: summary, isLoading: summaryLoading } = useActiveTerminology();
  const snapshot = useSnapshotTerminology();
  const releasesQuery = useTerminologyReleases(view === 'history' || view === 'sync');

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [confirmResync, setConfirmResync] = useState(false);

  const conceptsQuery = useTerminologyConcepts({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    enabled: view === 'sync' || view === 'compare',
  });

  const active = summary?.active ?? null;
  const lastSynced = summary?.lastSyncedAt ?? null;
  const isStale = Boolean(summary?.isStale);
  const resyncing = snapshot.isPending;

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleResync = async () => {
    try {
      const result = await snapshot.mutateAsync(undefined);
      setConfirmResync(false);
      toast.success(
        `Terminology resynced — ${result.ok} concepts updated` +
          (result.failed ? `, ${result.failed} failed` : ''),
      );
      setPage(1);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Resync failed. Check Infoway CCDD credentials and try again.';
      toast.error(message);
    }
  };

  if (view === 'unresolved') {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Unresolved concepts</CardTitle>
          <CardDescription>
            Concepts that could not be matched to CCDD during import or sync will appear
            here. Run a Resync first, then re-check workbook imports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No unresolved queue yet"
            description="When a workbook selector or sync query cannot resolve, it will be listed here for review."
          />
        </CardContent>
      </Card>
    );
  }

  if (view === 'history') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sync history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Terminology releases pinned for Safety Alert evaluation.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setConfirmResync(true)}
            disabled={resyncing}
            className="gap-1.5"
          >
            {resyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Resync now
          </Button>
        </div>

        {releasesQuery.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (releasesQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No releases yet"
            description="Run Resync to create the first terminology pin from CCDD."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Release</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Concepts</th>
                  <th className="px-4 py-3 font-semibold">CCDD</th>
                  <th className="px-4 py-3 font-semibold">Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {releasesQuery.data?.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{r.releaseKey}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.createdBy
                          ? `${r.createdBy.firstName} ${r.createdBy.lastName}`
                          : 'System'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                          r.status === 'ACTIVE'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-600',
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.conceptCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.ccddVersion}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatRelative(r.downloadedAt ?? r.activatedAt ?? r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ResyncConfirm
          open={confirmResync}
          loading={resyncing}
          onOpenChange={setConfirmResync}
          onConfirm={() => void handleResync()}
        />
      </div>
    );
  }

  // sync + compare share the concept browser; compare focuses on current pin
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {view === 'compare' ? 'Release comparison' : 'Terminology synchronization'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {view === 'compare'
              ? 'Review the active pin and concept inventory. Full release-to-release diffs land as more releases are synced.'
              : 'Browse the locally pinned CCDD concepts used by Safety Alert. Resync periodically so allergy and interaction matching stay current.'}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() => setConfirmResync(true)}
          disabled={resyncing}
          className="h-11 shrink-0 gap-2 px-5"
        >
          {resyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {resyncing ? 'Resyncing…' : 'Resync from CCDD'}
        </Button>
      </div>

      {summaryLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Database}
            label="Active release"
            value={active?.releaseKey ?? 'Not pinned'}
            hint={active?.ccddVersion ?? 'Run Resync to create a pin'}
          />
          <StatCard
            icon={Pill}
            label="Concepts"
            value={String(summary?.conceptCount ?? 0)}
            hint={`${summary?.ingredientCount ?? 0} ingredients · ${summary?.productCount ?? 0} products`}
          />
          <StatCard
            icon={Package}
            label="Ingredient links"
            value={String(summary?.edgeCount ?? 0)}
            hint="Medication ↔ ingredient edges"
          />
          <StatCard
            icon={isStale ? AlertTriangle : CheckCircle2}
            label="Last synced"
            value={formatRelative(lastSynced)}
            hint={
              isStale
                ? `Older than ${summary?.recommendedResyncDays ?? 14} days — resync recommended`
                : lastSynced
                  ? formatDate(lastSynced)
                  : 'No sync yet'
            }
            tone={isStale ? 'warn' : 'ok'}
          />
        </div>
      )}

      {isStale ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Terminology pin is getting stale
              </p>
              <p className="text-[13px] text-amber-800/90">
                Recommended refresh every {summary?.recommendedResyncDays ?? 14} days so
                Safety Alert matching stays aligned with Infoway CCDD.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-50"
            onClick={() => setConfirmResync(true)}
            disabled={resyncing}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Resync now
          </Button>
        </div>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Synced concepts
              </CardTitle>
              <CardDescription>
                What SafeScribe currently has pinned for runtime safety matching
                (no live Infoway call during consultations).
              </CardDescription>
            </div>
            <div className="flex w-full max-w-md gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch();
                  }}
                  placeholder="Search name, code, DIN…"
                  className="pl-9"
                />
              </div>
              <Button type="button" variant="outline" onClick={handleSearch}>
                Search
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {conceptsQuery.isLoading ? (
            <Skeleton className="h-56 w-full rounded-lg" />
          ) : (conceptsQuery.data?.data.length ?? 0) === 0 ? (
            <EmptyState
              title={active ? 'No concepts match' : 'No terminology pin yet'}
              description={
                active
                  ? 'Try a different search, or Resync to refresh the inventory.'
                  : 'Click Resync from CCDD to pull medication concepts into SafeScribe.'
              }
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border/70">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/70 bg-muted/25 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Name</th>
                      <th className="px-3 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold">Source</th>
                      <th className="hidden px-3 py-2.5 font-semibold md:table-cell">
                        Form / DIN
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {conceptsQuery.data?.data.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/15">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-foreground">
                            {c.preferredNameEn}
                          </p>
                          {c.brandName ? (
                            <p className="text-[11px] text-muted-foreground">
                              Brand: {c.brandName}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              'inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                              conceptTypeBadge(c.conceptType),
                            )}
                          >
                            {c.conceptType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-[12px] text-foreground/90">
                            {c.sourceSystem.includes('ccdd') ||
                            c.sourceSystem.includes('infoway')
                              ? 'CCDD'
                              : c.sourceSystem === 'safescribe-local'
                                ? 'Local'
                                : c.sourceSystem}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {c.sourceCode}
                          </p>
                        </td>
                        <td className="hidden px-3 py-2.5 text-[12px] text-muted-foreground md:table-cell">
                          {c.doseFormDisplay || '—'}
                          {c.dinCodes?.length
                            ? ` · DIN ${c.dinCodes.slice(0, 2).join(', ')}`
                            : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(conceptsQuery.data?.meta.totalPages ?? 0) > 1 ? (
                <Pagination
                  page={page}
                  totalPages={conceptsQuery.data?.meta.totalPages ?? 1}
                  total={conceptsQuery.data?.meta.total ?? 0}
                  limit={PAGE_SIZE}
                  onPageChange={setPage}
                />
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  Showing {conceptsQuery.data?.data.length ?? 0} of{' '}
                  {conceptsQuery.data?.meta.total ?? 0} concepts
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {view === 'compare' && (releasesQuery.data?.length ?? 0) > 0 ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Recent releases
            </CardTitle>
            <CardDescription>
              Active vs prior pins. Detailed field-level diffs will appear as more
              releases accumulate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {releasesQuery.data?.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold">{r.releaseKey}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {r.conceptCount} concepts · {r.ccddVersion}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                      r.status === 'ACTIVE'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600',
                    )}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ResyncConfirm
        open={confirmResync}
        loading={resyncing}
        onOpenChange={setConfirmResync}
        onConfirm={() => void handleResync()}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'ok' | 'warn';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card px-4 py-3.5 shadow-sm',
        tone === 'warn' && 'border-amber-200 bg-amber-50/40',
        tone === 'ok' && 'border-emerald-200/80',
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-1.5 truncate text-[17px] font-bold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ResyncConfirm({
  open,
  loading,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  const tip = useMemo(
    () =>
      'SafeScribe will refresh the active terminology pin from Infoway CCDD (or local seed if credentials are offline). Consultations keep using the previous pin until this finishes.',
    [],
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resync terminology from CCDD?"
      description={tip}
      confirmLabel="Resync now"
      variant="default"
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
