'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDate } from '@/lib/utils';
import { DATASET_REGISTRY, type DatasetKey } from './dataset-registry';
import {
  useExportReferencePack,
  useImportReferencePack,
  usePediatricPolicies,
  usePediatricPolicy,
  usePublishReferenceRelease,
  useReferenceRecordAction,
  useReferenceReleases,
  useReferenceSource,
  useReferenceSources,
  useReferenceSummary,
  useReferenceValue,
  useReferenceValues,
  useTreatmentTarget,
  useTreatmentTargets,
  type PediatricPolicyRow,
  type ReferenceSourceRow,
  type ReferenceStatus,
  type ReferenceValueRow,
  type TreatmentTargetRow,
} from './clinical-reference-hooks';

const PAGE_SIZE = 12;

type TabKey = 'overview' | 'values' | 'targets' | 'pediatric' | 'sources' | 'releases';
type Kind = 'values' | 'targets' | 'pediatric' | 'sources';

const DATASET_TAB: Partial<Record<DatasetKey, TabKey>> = {
  'reference-target-values': 'overview',
  'reference-general-values': 'values',
  'reference-treatment-targets': 'targets',
  'reference-pediatric': 'pediatric',
  'reference-sources': 'sources',
  'reference-releases': 'releases',
};

function compactDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as {
    message?: unknown;
    issues?: Array<{ message: string }>;
  };
  if (Array.isArray(e.issues) && e.issues.length) {
    return e.issues.map((issue) => issue.message).join(' ');
  }
  if (e.message && typeof e.message === 'object' && !Array.isArray(e.message)) {
    const nested = e.message as { message?: string; issues?: Array<{ message: string }> };
    if (Array.isArray(nested.issues) && nested.issues.length) {
      return nested.issues.map((issue) => issue.message).join(' ');
    }
    if (nested.message) return nested.message;
  }
  if (Array.isArray(e.message)) return e.message.filter(Boolean).join('; ');
  if (typeof e.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function strategyBadge(strategy: string, sourceCode?: string | null): string {
  if (sourceCode === 'MCC_ADULT' || (strategy === 'STATIC_REFERENCE' && sourceCode?.includes('MCC'))) {
    return 'Adult fallback';
  }
  if (strategy === 'LAB_SOURCE_FIRST' || strategy === 'LAB_SOURCE_OR_GENERAL' || strategy === 'ACTUAL_LAB_FIRST') {
    return 'Lab interval first';
  }
  if (strategy.includes('SAFETY') || strategy.includes('MEDICATION')) return 'Medication-specific';
  if (strategy.startsWith('GUIDELINE_TARGET')) return 'Treatment target';
  if (strategy.includes('CALIPER')) return 'Pediatric dynamic';
  if (strategy.includes('NONE') || strategy.includes('NO_REFERENCE')) return 'No static reference';
  return strategy.replaceAll('_', ' ');
}

function formatRange(row: {
  displayText?: string | null;
  lowerNumeric?: number | null;
  upperNumeric?: number | null;
  operator?: string | null;
  targetValue?: string | null;
  unit?: string | null;
}): string {
  if (row.displayText?.trim()) return row.displayText.trim();
  if (row.lowerNumeric != null && row.upperNumeric != null) {
    return `${row.lowerNumeric}–${row.upperNumeric}${row.unit ? ` ${row.unit}` : ''}`;
  }
  if (row.operator && row.targetValue) return `${row.operator}${row.targetValue}${row.unit ? ` ${row.unit}` : ''}`;
  return '—';
}

function StatusPill({ status }: { status: ReferenceStatus }) {
  const tone =
    status === 'PUBLISHED' || status === 'ACTIVE'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === 'DRAFT'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : status === 'IN_REVIEW'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-border text-muted-foreground';
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold uppercase tracking-wide', tone)}>
      {status === 'ACTIVE' ? 'Published' : status.replace('_', ' ')}
    </Badge>
  );
}

export function ClinicalReferencePanel({
  datasetKey,
  onSelectDataset,
}: {
  datasetKey: DatasetKey;
  onSelectDataset?: (key: DatasetKey) => void;
}) {
  const tab = DATASET_TAB[datasetKey] ?? 'overview';
  const def = DATASET_REGISTRY[datasetKey];
  const summary = useReferenceSummary();
  const importPack = useImportReferencePack();
  const publish = usePublishReferenceRelease();
  const exportPack = useExportReferencePack();
  const [publishOpen, setPublishOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const go = (key: DatasetKey) => onSelectDataset?.(key);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Clinical Safety · Reference & Target Values
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{def.label}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{def.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 shadow-none" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button
            variant="outline"
            className="h-10 shadow-none"
            onClick={async () => {
              try {
                const pack = await exportPack.mutateAsync();
                const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${pack.releaseId ?? 'reference-pack'}.json`;
                link.click();
                URL.revokeObjectURL(url);
                toast.success('Published pack exported.', { announce: true });
              } catch (error) {
                toast.error(errorMessage(error, 'Export failed.'));
              }
            }}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button className="h-10" onClick={() => setPublishOpen(true)}>
            Publish release
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-semibold">Published release:</span>{' '}
            {summary.data?.publishedRelease?.releaseId ?? 'None'}
            {' · '}
            <span className="font-semibold">Last published:</span>{' '}
            {compactDate(summary.data?.publishedRelease?.publishedAt)}
            {' · '}
            <span className="font-semibold">Draft changes:</span> {summary.data?.draftChanges ?? 0}
            {summary.data?.inReviewChanges ? ` · In review: ${summary.data.inReviewChanges}` : ''}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Published records are read-only. Edit creates a draft copy.
          </span>
        </div>
      </div>

      {tab === 'overview' ? (
        <OverviewCards summary={summary.data} onOpen={go} onImport={() => setImportOpen(true)} />
      ) : null}
      {tab === 'values' ? <ValuesTable /> : null}
      {tab === 'targets' ? <TargetsTable /> : null}
      {tab === 'pediatric' ? <PediatricTable /> : null}
      {tab === 'sources' ? <SourcesTable /> : null}
      {tab === 'releases' ? <ReleasesTable /> : null}

      <ConfirmDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Reference Values Master?"
        description="The first import publishes the governed pack. Later imports never overwrite published records — they create draft replacements only."
        confirmLabel="Import pack"
        variant="default"
        loading={importPack.isPending}
        onConfirm={async () => {
          try {
            const result = await importPack.mutateAsync();
            toast.success(result.message, { announce: true });
            setImportOpen(false);
          } catch (error) {
            toast.error(errorMessage(error, 'Import failed.'));
          }
        }}
      />
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish reference release?"
        description="Creates an immutable REFERENCE_RELEASE snapshot from approved in-review records. Pharmacist consultations already completed keep their original release."
        confirmLabel="Publish"
        variant="default"
        loading={publish.isPending}
        onConfirm={async () => {
          try {
            await publish.mutateAsync({});
            toast.success('Reference release published.', { announce: true });
            setPublishOpen(false);
          } catch (error) {
            toast.error(errorMessage(error, 'Publish was blocked.'));
          }
        }}
      />
    </div>
  );
}

function OverviewCards({
  summary,
  onOpen,
  onImport,
}: {
  summary?: ReturnType<typeof useReferenceSummary>['data'];
  onOpen: (key: DatasetKey) => void;
  onImport: () => void;
}) {
  const empty = !summary?.publishedRelease && !summary?.counts.values;
  return (
    <div className="space-y-4">
      {empty ? (
        <EmptyState
          title="No published reference repository yet"
          description="Import the governed Reference Values Master to create REFERENCE_RELEASE_2026_09_05. This layer is shared across Renew, Prescribe and future pathways — not a Renew-only table."
          action={
            <Button type="button" onClick={onImport}>
              Import Reference Values Master
            </Button>
          }
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NavCard
          title="General Reference Values"
          description="Laboratory and vital references, including MCC adult fallback intervals."
          count={summary?.counts.values}
          onClick={() => onOpen('reference-general-values')}
        />
        <NavCard
          title="Treatment Targets"
          description="Guideline targets such as A1C, blood pressure, lipids and urate."
          count={summary?.counts.targets}
          onClick={() => onOpen('reference-treatment-targets')}
        />
        <NavCard
          title="Pediatric References"
          description="CALIPER / medication-specific pediatric policy. Adult fallback is never allowed."
          count={summary?.counts.pediatric}
          onClick={() => onOpen('reference-pediatric')}
        />
        <NavCard
          title="Source Library"
          description="Diabetes Canada, Hypertension Canada, MCC, CALIPER and laboratory catalogues."
          count={summary?.counts.sources}
          onClick={() => onOpen('reference-sources')}
        />
        <NavCard
          title="Releases / Version History"
          description="Immutable published snapshots used by the pharmacist resolver."
          onClick={() => onOpen('reference-releases')}
        />
      </div>
    </div>
  );
}

function NavCard({
  title,
  description,
  count,
  onClick,
}: {
  title: string;
  description: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{title}</p>
        {count != null ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

function TableShell({
  columns,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  children,
  page,
  totalPages,
  total,
  onPageChange,
  search,
  onSearch,
  status,
  onStatus,
}: {
  columns: string[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearch: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
}) {
  const [searchInput, setSearchInput] = useState(search);
  if (error) return <ErrorState title="Couldn’t load reference records" onRetry={onRetry} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch(searchInput.trim())}
            className="h-10 border-border/80 bg-background pl-9 shadow-none"
            placeholder="Search…"
          />
        </div>
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-none"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="ACTIVE">Published sources</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">In review</option>
        </select>
        <Button variant="outline" className="h-10 shadow-none" onClick={() => onSearch(searchInput.trim())}>
          Search
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : total === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="px-3 py-2.5 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{children}</tbody>
              </table>
            </div>
            <div className="border-t border-border px-3 py-2">
              <Pagination page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE} onPageChange={onPageChange} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ValuesTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useReferenceValues({ page, limit: PAGE_SIZE, search, status: status === 'ACTIVE' ? 'PUBLISHED' : status });
  return (
    <>
      <TableShell
        columns={['Input', 'Population', 'Reference', 'Unit', 'Strategy', 'Source', 'Status', 'Updated', 'Actions']}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No general reference values"
        emptyDescription="Import the Reference Values Master to publish potassium, A1C, MCC fallbacks and related records."
        page={page}
        totalPages={query.data?.meta.totalPages ?? 1}
        total={query.data?.meta.total ?? 0}
        onPageChange={setPage}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        status={status}
        onStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        {(query.data?.data ?? []).map((row) => (
          <tr key={row.id} className="border-b border-border/70 last:border-0">
            <td className="px-3 py-2.5 font-medium">{row.label}</td>
            <td className="px-3 py-2.5">{row.population}</td>
            <td className="px-3 py-2.5">{formatRange(row)}</td>
            <td className="px-3 py-2.5">{row.unit || '—'}</td>
            <td className="px-3 py-2.5">
              <Badge variant="outline" className="text-[10px]">
                {strategyBadge(row.referenceStrategy, row.sourceCode)}
              </Badge>
            </td>
            <td className="px-3 py-2.5">{row.sourceCode || '—'}</td>
            <td className="px-3 py-2.5">
              <StatusPill status={row.status} />
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">{compactDate(row.updatedAt)}</td>
            <td className="px-3 py-2.5">
              <Button size="sm" variant="outline" className="h-8 shadow-none" onClick={() => setOpenId(row.id)}>
                View
              </Button>
            </td>
          </tr>
        ))}
      </TableShell>
      <RecordDialog kind="values" id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function TargetsTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useTreatmentTargets({ page, limit: PAGE_SIZE, search, status: status === 'ACTIVE' ? 'PUBLISHED' : status });
  return (
    <>
      <TableShell
        columns={['Input', 'Clinical context', 'Target', 'Population', 'Source', 'Status', 'Updated', 'Actions']}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No treatment targets"
        emptyDescription="Import guideline targets such as Diabetes Canada A1C and Hypertension Canada BP."
        page={page}
        totalPages={query.data?.meta.totalPages ?? 1}
        total={query.data?.meta.total ?? 0}
        onPageChange={setPage}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        status={status}
        onStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        {(query.data?.data ?? []).map((row) => (
          <tr key={row.id} className="border-b border-border/70 last:border-0">
            <td className="px-3 py-2.5 font-medium">{row.label}</td>
            <td className="px-3 py-2.5">{row.clinicalContext.replaceAll('_', ' ')}</td>
            <td className="max-w-[18rem] px-3 py-2.5">{row.displayText}</td>
            <td className="px-3 py-2.5">{row.population}</td>
            <td className="px-3 py-2.5">{row.sourceCode}</td>
            <td className="px-3 py-2.5">
              <StatusPill status={row.status} />
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">{compactDate(row.updatedAt)}</td>
            <td className="px-3 py-2.5">
              <Button size="sm" variant="outline" className="h-8 shadow-none" onClick={() => setOpenId(row.id)}>
                View
              </Button>
            </td>
          </tr>
        ))}
      </TableShell>
      <RecordDialog kind="targets" id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function PediatricTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = usePediatricPolicies({ page, limit: PAGE_SIZE, search, status: status === 'ACTIVE' ? 'PUBLISHED' : status });
  return (
    <>
      <TableShell
        columns={['Input', 'Strategy', 'Preferred source', 'Adult fallback', 'Status', 'Updated', 'Actions']}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No pediatric policies"
        emptyDescription="Import pediatric CALIPER and medication-specific policies. Adult MCC fallback stays off."
        page={page}
        totalPages={query.data?.meta.totalPages ?? 1}
        total={query.data?.meta.total ?? 0}
        onPageChange={setPage}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        status={status}
        onStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        {(query.data?.data ?? []).map((row) => (
          <tr key={row.id} className="border-b border-border/70 last:border-0">
            <td className="px-3 py-2.5 font-medium">{row.label || row.inputCode}</td>
            <td className="px-3 py-2.5">{strategyBadge(row.strategy, row.preferredSource)}</td>
            <td className="px-3 py-2.5">{row.preferredSource || '—'}</td>
            <td className="px-3 py-2.5">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
                Never allowed
              </Badge>
            </td>
            <td className="px-3 py-2.5">
              <StatusPill status={row.status} />
            </td>
            <td className="px-3 py-2.5 text-muted-foreground">{compactDate(row.updatedAt)}</td>
            <td className="px-3 py-2.5">
              <Button size="sm" variant="outline" className="h-8 shadow-none" onClick={() => setOpenId(row.id)}>
                View
              </Button>
            </td>
          </tr>
        ))}
      </TableShell>
      <RecordDialog kind="pediatric" id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function SourcesTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useReferenceSources({ page, limit: PAGE_SIZE, search, status });
  return (
    <>
      <TableShell
        columns={['Source', 'Type', 'Version', 'Last reviewed', 'Next review', 'Status', 'Actions']}
        loading={query.isLoading}
        error={query.isError}
        onRetry={() => void query.refetch()}
        emptyTitle="No sources"
        emptyDescription="Import the source library for MCC, CALIPER, Diabetes Canada and provincial lab catalogues."
        page={page}
        totalPages={query.data?.meta.totalPages ?? 1}
        total={query.data?.meta.total ?? 0}
        onPageChange={setPage}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        status={status}
        onStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        {(query.data?.data ?? []).map((row) => {
          const due =
            row.nextReviewDueAt && new Date(row.nextReviewDueAt).getTime() < Date.now();
          return (
            <tr key={row.id} className="border-b border-border/70 last:border-0">
              <td className="px-3 py-2.5">
                <p className="font-medium">{row.sourceName}</p>
                <p className="text-[11px] text-muted-foreground">{row.sourceCode}</p>
              </td>
              <td className="px-3 py-2.5">{row.sourceType.replaceAll('_', ' ')}</td>
              <td className="px-3 py-2.5">{row.version || '—'}</td>
              <td className="px-3 py-2.5">{compactDate(row.lastReviewedAt)}</td>
              <td className="px-3 py-2.5">
                {due ? (
                  <Badge variant="warning" className="text-[10px]">
                    Review due
                  </Badge>
                ) : (
                  compactDate(row.nextReviewDueAt)
                )}
              </td>
              <td className="px-3 py-2.5">
                <StatusPill status={row.status} />
              </td>
              <td className="px-3 py-2.5">
                <Button size="sm" variant="outline" className="h-8 shadow-none" onClick={() => setOpenId(row.id)}>
                  View
                </Button>
              </td>
            </tr>
          );
        })}
      </TableShell>
      <RecordDialog kind="sources" id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function ReleasesTable() {
  const query = useReferenceReleases();
  if (query.isError) return <ErrorState title="Couldn’t load releases" onRetry={() => void query.refetch()} />;
  if (query.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Loading release history…
      </div>
    );
  }
  const rows = query.data?.data ?? [];
  if (!rows.length) {
    return (
      <EmptyState
        title="No reference releases yet"
        description="Import the governed pack to create the first immutable REFERENCE_RELEASE."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            {['Release', 'Status', 'Published', 'Records', 'Notes'].map((column) => (
              <th key={column} className="px-3 py-2.5">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/70 last:border-0">
              <td className="px-3 py-2.5">
                <p className="font-medium">{row.releaseId}</p>
                {row.isActive ? (
                  <p className="text-[11px] font-semibold text-emerald-700">Active pointer</p>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <StatusPill status={row.status} />
              </td>
              <td className="px-3 py-2.5">{formatDate(row.publishedAt)}</td>
              <td className="px-3 py-2.5 tabular-nums">
                {row._count
                  ? `${row._count.values} values · ${row._count.targets} targets · ${row._count.pediatric} pediatric · ${row._count.sources} sources`
                  : '—'}
              </td>
              <td className="max-w-[20rem] px-3 py-2.5 text-muted-foreground">{row.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordDialog({
  kind,
  id,
  onClose,
}: {
  kind: Kind;
  id: string | null;
  onClose: () => void;
}) {
  const action = useReferenceRecordAction(kind);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'submit' | 'approve' | 'return'>(null);
  const [activeId, setActiveId] = useState<string | null>(id);

  useEffect(() => {
    setActiveId(id);
    setEdit(false);
    setConfirm(null);
  }, [id]);

  const value = useReferenceValue(kind === 'values' ? activeId : null);
  const target = useTreatmentTarget(kind === 'targets' ? activeId : null);
  const pediatric = usePediatricPolicy(kind === 'pediatric' ? activeId : null);
  const source = useReferenceSource(kind === 'sources' ? activeId : null);

  const record = (value.data ?? target.data ?? pediatric.data ?? source.data) as
    | ReferenceValueRow
    | TreatmentTargetRow
    | PediatricPolicyRow
    | ReferenceSourceRow
    | undefined;
  const loading = value.isLoading || target.isLoading || pediatric.isLoading || source.isLoading;
  const status = record?.status;
  const isDraft = status === 'DRAFT';
  const isReview = status === 'IN_REVIEW';
  const published = status === 'PUBLISHED' || status === 'ACTIVE';

  const run = async (
    next: 'draft' | 'submit-review' | 'approve' | 'return-draft' | 'delete' | 'patch',
    body?: Record<string, unknown>,
  ) => {
    if (!activeId) return;
    try {
      const result = (await action.mutateAsync({
        id: activeId,
        action: next,
        body,
      })) as { id?: string };
      if (next === 'draft' && result.id) {
        setActiveId(result.id);
        setEdit(true);
        toast.success('Draft copy created. Published record was not changed.', { announce: true });
        return;
      }
      toast.success('Saved.', { announce: true });
      setConfirm(null);
      if (next === 'delete') onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not update that record.'));
    }
  };

  return (
    <>
      <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record detail</DialogTitle>
            <DialogDescription>
              Published values cannot be edited in place. Create a draft, submit for review, then publish a release.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading record…
            </div>
          ) : record ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={record.status} />
                <span className="text-[12px] text-muted-foreground">v{record.versionNumber}</span>
                {record.reviewApprovedAt ? (
                  <Badge variant="success">Approved for next release</Badge>
                ) : null}
              </div>
              {edit && isDraft ? (
                <DraftForm
                  key={record.id}
                  kind={kind}
                  record={record}
                  saving={action.isPending}
                  onSave={(body) => void run('patch', body)}
                />
              ) : (
                <RecordRead kind={kind} record={record} />
              )}
              {record.history?.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Version history
                  </p>
                  <ul className="space-y-1 text-[12px] text-muted-foreground">
                    {record.history.map((item) => (
                      <li key={item.id}>
                        v{item.versionNumber} · {item.status.replace('_', ' ')} · {compactDate(item.updatedAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Record not found.</p>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {published ? (
              <>
                <Button variant="outline" onClick={() => void run('draft')} disabled={action.isPending}>
                  Edit draft
                </Button>
                {(record as ReferenceValueRow).source?.sourceUrl ? (
                  <a
                    href={(record as ReferenceValueRow).source!.sourceUrl!}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'shadow-none')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View source
                  </a>
                ) : null}
              </>
            ) : null}
            {isDraft ? (
              <>
                <Button variant="outline" onClick={() => setEdit((value) => !value)}>
                  {edit ? 'View' : 'Edit'}
                </Button>
                <Button variant="outline" onClick={() => setConfirm('submit')}>
                  Submit for review
                </Button>
                <Button variant="destructive" onClick={() => setConfirm('delete')}>
                  Delete draft
                </Button>
              </>
            ) : null}
            {isReview ? (
              <>
                <Button onClick={() => setConfirm('approve')}>Approve</Button>
                <Button variant="outline" onClick={() => setConfirm('return')}>
                  Return to draft
                </Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={() => setConfirm(null)}
        title="Delete this draft?"
        description="Published records are never deleted. Only this unpublished draft will be removed."
        confirmLabel="Delete draft"
        loading={action.isPending}
        onConfirm={() => void run('delete')}
      />
      <ConfirmDialog
        open={confirm === 'submit'}
        onOpenChange={() => setConfirm(null)}
        title="Submit for clinical review?"
        description="The draft becomes read-only until it is approved or returned."
        confirmLabel="Submit"
        variant="default"
        loading={action.isPending}
        onConfirm={() => void run('submit-review')}
      />
      <ConfirmDialog
        open={confirm === 'approve'}
        onOpenChange={() => setConfirm(null)}
        title="Approve for the next release?"
        description="This does not publish immediately. Use Publish release to create an immutable snapshot."
        confirmLabel="Approve"
        variant="default"
        loading={action.isPending}
        onConfirm={() => void run('approve')}
      />
      <ConfirmDialog
        open={confirm === 'return'}
        onOpenChange={() => setConfirm(null)}
        title="Return to draft?"
        description="The reviewer can send this record back so the author can edit it again."
        confirmLabel="Return"
        variant="default"
        loading={action.isPending}
        onConfirm={() => void run('return-draft')}
      />
    </>
  );
}

function RecordRead({
  kind,
  record,
}: {
  kind: Kind;
  record: ReferenceValueRow | TreatmentTargetRow | PediatricPolicyRow | ReferenceSourceRow;
}) {
  if (kind === 'values') {
    const row = record as ReferenceValueRow;
    return (
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <Field label="Input" value={`${row.label} (${row.inputCode})`} />
        <Field label="Reference id" value={row.referenceId} />
        <Field label="Population / sex" value={`${row.population} / ${row.sex}`} />
        <Field label="Display" value={formatRange(row)} />
        <Field label="Strategy" value={strategyBadge(row.referenceStrategy, row.sourceCode)} />
        <Field label="Kind" value={row.referenceKind.replaceAll('_', ' ')} />
        <Field label="Source" value={row.source?.sourceName ?? row.sourceCode ?? '—'} />
        <Field label="Notes" value={row.notes ?? '—'} />
      </dl>
    );
  }
  if (kind === 'targets') {
    const row = record as TreatmentTargetRow;
    return (
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <Field label="Input" value={`${row.label} (${row.inputCode})`} />
        <Field label="Context" value={row.clinicalContext.replaceAll('_', ' ')} />
        <Field label="Target" value={row.displayText} />
        <Field label="Source" value={row.source?.sourceName ?? row.sourceCode} />
        <Field label="Notes" value={row.notes ?? '—'} />
      </dl>
    );
  }
  if (kind === 'pediatric') {
    const row = record as PediatricPolicyRow;
    return (
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <Field label="Input" value={`${row.label || row.inputCode}`} />
        <Field label="Strategy" value={strategyBadge(row.strategy, row.preferredSource)} />
        <Field label="Preferred source" value={row.preferredSource ?? '—'} />
        <Field label="Adult fallback" value="Never allowed" />
        <Field label="Implementation" value={row.implementationNote ?? '—'} />
      </dl>
    );
  }
  const row = record as ReferenceSourceRow;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 text-sm">
      <Field label="Name" value={row.sourceName} />
      <Field label="Code" value={row.sourceCode} />
      <Field label="Type" value={row.sourceType.replaceAll('_', ' ')} />
      <Field label="Publisher" value={row.publisher ?? '—'} />
      <Field label="Version" value={row.version ?? '—'} />
      <Field label="Use" value={row.useCase ?? '—'} />
      <Field label="URL" value={row.sourceUrl ?? '—'} />
      <Field label="Notes" value={row.notes ?? '—'} />
    </dl>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function DraftForm({
  kind,
  record,
  saving,
  onSave,
}: {
  kind: Kind;
  record: ReferenceValueRow | TreatmentTargetRow | PediatricPolicyRow | ReferenceSourceRow;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const initial = useMemo(() => record, [record]);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const seed = (): Record<string, string> => {
      if (kind === 'values') {
        const row = initial as ReferenceValueRow;
        return {
          displayText: row.displayText ?? '',
          unit: row.unit ?? '',
          notes: row.notes ?? '',
          sourceCode: row.sourceCode ?? '',
          population: row.population,
        };
      }
      if (kind === 'targets') {
        const row = initial as TreatmentTargetRow;
        return {
          displayText: row.displayText,
          notes: row.notes ?? '',
          sourceCode: row.sourceCode,
          clinicalContext: row.clinicalContext,
        };
      }
      if (kind === 'pediatric') {
        const row = initial as PediatricPolicyRow;
        return {
          strategy: row.strategy,
          preferredSource: row.preferredSource ?? '',
          implementationNote: row.implementationNote ?? '',
        };
      }
      const row = initial as ReferenceSourceRow;
      return {
        sourceName: row.sourceName,
        version: row.version ?? '',
        sourceUrl: row.sourceUrl ?? '',
        notes: row.notes ?? '',
        lastReviewedAt: row.lastReviewedAt?.slice(0, 10) ?? '',
        nextReviewDueAt: row.nextReviewDueAt?.slice(0, 10) ?? '',
      };
    };
    return seed();
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body: Record<string, unknown> = { ...form };
        if (kind === 'pediatric') body.adultFallbackAllowed = false;
        onSave(body);
      }}
    >
      {Object.entries(form).map(([key, value]) => (
        <div key={key} className={key === 'notes' || key === 'implementationNote' || key === 'displayText' ? 'sm:col-span-2' : ''}>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{key}</Label>
          {key === 'notes' || key === 'implementationNote' ? (
            <Textarea value={value} onChange={(e) => set(key, e.target.value)} className="mt-1" />
          ) : (
            <Input value={value} onChange={(e) => set(key, e.target.value)} className="mt-1" />
          )}
        </div>
      ))}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </form>
  );
}
