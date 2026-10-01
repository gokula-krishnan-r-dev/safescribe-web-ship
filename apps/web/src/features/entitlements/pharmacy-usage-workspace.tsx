'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  Gauge,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PHARMACY_USAGE_HEALTH_LABEL,
  pharmacyUsageHealth,
  type PharmacyUsageHealth,
} from '@safescript/shared';
import { PrescribeUsageMeter } from './prescribe-usage-meter';
import { PharmacyEntitlementPanel } from './pharmacy-entitlement-panel';
import {
  usePharmacyUsageAnalysis,
  usePharmacyUsageOverview,
  type PharmacyUsageOverviewRow,
} from './hooks';

type HealthFilter = 'all' | PharmacyUsageHealth;

const FILTERS: { id: HealthFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'at_limit', label: 'Limit reached' },
  { id: 'tight', label: 'Almost full' },
  { id: 'ok', label: 'On track' },
  { id: 'inactive', label: 'Off' },
];

function healthBadge(health: PharmacyUsageHealth) {
  if (health === 'at_limit') return 'destructive' as const;
  if (health === 'tight') return 'warning' as const;
  if (health === 'inactive') return 'outline' as const;
  if (health === 'unlimited') return 'success' as const;
  return 'success' as const;
}

function formatDayLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function roleLabel(role: string) {
  if (role === 'PHARMACIST_ADMIN') return 'Pharmacy admin';
  if (role === 'PHARMACIST') return 'Pharmacist';
  return role;
}

export function PharmacyUsageWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('tenant');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HealthFilter>('all');
  const { data, isLoading, isError, refetch } = usePharmacyUsageOverview();

  const filtered = useMemo(() => {
    const rows = data?.pharmacies ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.health !== filter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.adminName?.toLowerCase().includes(q) ||
        row.timezone.toLowerCase().includes(q)
      );
    });
  }, [data?.pharmacies, search, filter]);

  useEffect(() => {
    if (!data?.pharmacies.length) return;
    if (selectedId && data.pharmacies.some((row) => row.tenantId === selectedId)) return;
    const preferred =
      filtered[0]?.tenantId ?? data.pharmacies[0]?.tenantId;
    if (preferred) {
      router.replace(`/super-admin/usage?tenant=${preferred}`);
    }
  }, [data?.pharmacies, filtered, selectedId, router]);

  const selected =
    data?.pharmacies.find((row) => row.tenantId === selectedId) ?? null;

  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col md:min-h-full md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card md:w-[22rem] md:border-b-0 md:border-r">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Pharmacy usage</h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Today’s Prescribe assessments by pharmacy. Limits reset at local midnight.
          </p>
          {data ? (
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <SummaryChip label="Today" value={data.summary.assessmentsToday} />
              <SummaryChip label="At limit" value={data.summary.atLimitCount} warn={data.summary.atLimitCount > 0} />
              <SummaryChip label="Almost full" value={data.summary.nearingLimitCount} warn={data.summary.nearingLimitCount > 0} />
            </dl>
          ) : null}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search pharmacies…"
              className="border-border/80 bg-background pl-9 shadow-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                  filter === item.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : isError ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">Could not load usage.</p>
              <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No pharmacies match this search.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((row) => (
                <PharmacyUsageListItem
                  key={row.tenantId}
                  row={row}
                  selected={selectedId === row.tenantId}
                  onSelect={() => router.replace(`/super-admin/usage?tenant=${row.tenantId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="page-gradient min-h-0 flex-1 overflow-auto p-6 sm:p-8">
        {selected ? (
          <PharmacyUsageDetail row={selected} />
        ) : (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Gauge className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Select a pharmacy</h1>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Usage is counted once per consultation when the clinical assessment starts.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums', warn && 'text-amber-800')}>{value}</p>
    </div>
  );
}

function PharmacyUsageListItem({
  row,
  selected,
  onSelect,
}: {
  row: PharmacyUsageOverviewRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const included = row.snapshot.included;
  const pct = row.utilizationPct ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all',
        selected ? 'list-item-active' : 'hover:bg-muted/80',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium">{row.name}</p>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
            {row.snapshot.unlimited ? row.snapshot.used : `${row.snapshot.used}/${included ?? 0}`}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.adminName ?? 'No admin assigned yet'}
        </p>
        {!row.snapshot.unlimited && included != null ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                row.health === 'at_limit'
                  ? 'bg-amber-500'
                  : row.health === 'tight'
                    ? 'bg-primary/80'
                    : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={healthBadge(row.health)} className="px-1.5 py-0 text-[10px] font-medium">
            {PHARMACY_USAGE_HEALTH_LABEL[row.health]}
          </Badge>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" />
            {row.pharmacistCount}
          </span>
        </div>
      </div>
    </button>
  );
}

function PharmacyUsageDetail({ row }: { row: PharmacyUsageOverviewRow }) {
  const { data, isLoading, isError, refetch } = usePharmacyUsageAnalysis(row.tenantId);
  const snapshot = data?.snapshot ?? row.snapshot;
  const health = pharmacyUsageHealth(snapshot);
  const trendMax = Math.max(1, ...(data?.trend.map((d) => d.used) ?? [0]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Prescribe usage
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{row.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.adminName ?? 'No pharmacy admin assigned'} · {row.timezone.replace(/_/g, ' ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          <Badge variant={healthBadge(health)}>{PHARMACY_USAGE_HEALTH_LABEL[health]}</Badge>
        </div>
      </header>

      {health === 'at_limit' ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This pharmacy has used today’s included assessments. Existing consultations stay open.
            The count resets at local midnight.
          </p>
        </div>
      ) : null}

      <PrescribeUsageMeter snapshot={snapshot} />

      <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Last 7 days</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Counted assessments in this pharmacy’s local calendar.
        </p>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Could not load the 7-day trend.</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-2">
            {(data?.trend ?? []).map((day) => (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <p className="text-[11px] font-semibold tabular-nums text-foreground">{day.used}</p>
                <div className="flex h-20 w-full items-end justify-center">
                  <div
                    className="w-full max-w-[28px] rounded-t-md bg-primary/80"
                    style={{ height: `${Math.max(6, Math.round((day.used / trendMax) * 100))}%` }}
                    title={`${day.used} on ${day.date}`}
                  />
                </div>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {formatDayLabel(day.date)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Who used assessments today</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shared pharmacy limit — names help you see who started counted work today.
        </p>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !data?.pharmacists.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No counted assessments so far today.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/70">
            {data.pharmacists.map((person) => (
              <li key={person.userId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{person.fullName}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel(person.role)}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {person.used}
                  <span className="ml-1 text-xs font-medium text-muted-foreground">
                    {person.used === 1 ? 'assessment' : 'assessments'}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border/80 bg-card px-4 py-2 shadow-sm">
        <PharmacyEntitlementPanel tenantId={row.tenantId} />
      </section>
    </div>
  );
}
