'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Stethoscope,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import {
  useDebouncedValue,
  useIndicationCandidates,
  useIndicationCoverage,
  useIndicationMappingMutations,
  useIndicationMappings,
  useIndicationVersions,
  usePendingCandidateCount,
  type IndicationMapping,
  type IndicationRepositoryVersion,
} from './hooks';
import {
  JURISDICTION_OPTIONS,
  MAPPING_LEVEL_OPTIONS,
  PAGE_TABS,
  RELATIONSHIP_OPTIONS,
  STATUS_FILTER_OPTIONS,
  ccddDisplayId,
  formatJurisdiction,
  formatMappingLevel,
  formatMappingStatus,
  formatRelationshipType,
  parsePageTab,
  relationshipBadgeClass,
  type PageTab,
} from './labels';
import { MappingFormDialog } from './mapping-dialogs';
import { MappingDetailsPanel } from './mapping-details-panel';

const TEAL = 'bg-[#0F6F6B] hover:bg-[#0b5451]';

export function ApprovedIndicationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = useMemo(() => parsePageTab(searchParams.get('tab')), [searchParams]);

  const setTab = useCallback(
    (next: PageTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'approved');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed default tab once
  }, []);

  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<IndicationMapping | null>(null);
  const [detailsMapping, setDetailsMapping] = useState<IndicationMapping | null>(null);

  const pendingCountQuery = usePendingCandidateCount();
  const mutations = useIndicationMappingMutations();

  const openCreate = () => {
    setEditingMapping(null);
    setMappingDialogOpen(true);
  };

  const openEdit = (row: IndicationMapping) => {
    setEditingMapping(row);
    setMappingDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef8f7] text-[#0F6F6B]">
              <Stethoscope className="h-[18px] w-[18px]" />
            </span>
            <h1 className="text-2xl font-semibold text-[#102a43]">Approved Indications</h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#617184]">
            Manage the medication–indication mappings used by Adapt, Renew and Prescribe. Mappings
            connect CCDD medication concepts with SNOMED CT indications and include source,
            jurisdiction, version and audit information.
          </p>
        </div>
        <Button type="button" className={cn('h-10 rounded-lg', TEAL)} onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add mapping
        </Button>
      </header>

      <nav className="flex flex-wrap items-center gap-1 border-b border-[#edf3f4]">
        {PAGE_TABS.map((item) => {
          const active = tab === item.id;
          const badge =
            item.id === 'review' && (pendingCountQuery.data ?? 0) > 0
              ? pendingCountQuery.data
              : null;
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-[#0F6F6B] text-[#0F6F6B]'
                  : 'border-transparent text-[#617184] hover:text-[#102a43]',
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {badge != null ? (
                <Badge className="h-5 min-w-[1.25rem] rounded-full border-0 bg-[#eef8f7] px-1.5 text-[11px] font-semibold text-[#0F6F6B]">
                  {badge}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </nav>

      {tab === 'approved' ? <ApprovedTab onEdit={openEdit} onDetails={setDetailsMapping} /> : null}
      {tab === 'review' ? <ReviewQueueTab /> : null}
      {tab === 'coverage' ? <CoverageTab /> : null}
      {tab === 'versions' ? <VersionHistoryTab /> : null}

      <MappingFormDialog
        open={mappingDialogOpen}
        mode={editingMapping ? 'edit' : 'create'}
        initial={editingMapping}
        saving={
          mutations.createMapping.isPending || mutations.updateMapping.isPending
        }
        onClose={() => setMappingDialogOpen(false)}
        onSave={async (body) => {
          try {
            if (editingMapping) {
              await mutations.updateMapping.mutateAsync({ id: editingMapping.id, body });
              toast.success('Indication mapping saved.');
            } else {
              await mutations.createMapping.mutateAsync(body);
              toast.success('Indication mapping saved.');
            }
            setMappingDialogOpen(false);
          } catch (error) {
            toastError(error, 'Could not save mapping');
          }
        }}
      />

      <MappingDetailsPanel
        mapping={detailsMapping}
        open={Boolean(detailsMapping)}
        onClose={() => setDetailsMapping(null)}
      />
    </div>
  );
}

function ApprovedTab({
  onEdit,
  onDetails,
}: {
  onEdit: (row: IndicationMapping) => void;
  onDetails: (row: IndicationMapping) => void;
}) {
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 300);
  const [page, setPage] = useState(1);
  const [jurisdiction, setJurisdiction] = useState('');
  const [relationshipType, setRelationshipType] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('approved');

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, jurisdiction, relationshipType, level, status]);

  const { data, isLoading, isError } = useIndicationMappings({
    q: debouncedQ,
    page,
    limit: 20,
    jurisdiction,
    relationshipType,
    medicationMappingLevel: level,
    status,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;

  const hasFilters = Boolean(jurisdiction || relationshipType || level || status !== 'approved');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9aa3]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search medication (e.g. amoxicillin) or indication (e.g. otitis media)…"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Jurisdiction"
            value={jurisdiction}
            onChange={setJurisdiction}
            options={JURISDICTION_OPTIONS}
          />
          <FilterSelect
            label="Relationship"
            value={relationshipType}
            onChange={setRelationshipType}
            options={[{ value: '', label: 'All relationships' }, ...RELATIONSHIP_OPTIONS]}
          />
          <FilterSelect
            label="Level"
            value={level}
            onChange={setLevel}
            options={[{ value: '', label: 'All levels' }, ...MAPPING_LEVEL_OPTIONS]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={STATUS_FILTER_OPTIONS}
          />
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-[#0F6F6B]"
              onClick={() => {
                setJurisdiction('');
                setRelationshipType('');
                setLevel('');
                setStatus('approved');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <MappingsTable
        loading={isLoading}
        error={isError}
        rows={rows}
        onEdit={onEdit}
        onDetails={onDetails}
      />

      {meta && meta.total > 0 ? (
        <PaginationFooter meta={meta} page={page} onPageChange={setPage} noun="mappings" />
      ) : null}
    </div>
  );
}

function MappingsTable({
  loading,
  error,
  rows,
  onEdit,
  onDetails,
}: {
  loading: boolean;
  error: boolean;
  rows: IndicationMapping[];
  onEdit: (row: IndicationMapping) => void;
  onDetails: (row: IndicationMapping) => void;
}) {
  if (loading) {
    return <TableShell message="Loading mappings…" spinner />;
  }
  if (error) {
    return (
      <TableShell message="Could not load mappings. Check that the indication mappings API is available." />
    );
  }
  if (!rows.length) {
    return (
      <TableShell message="No approved mappings yet. Run the Approved Indications bootstrap seed, use + Add mapping, or approve items from the Review Queue." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e4ecef] bg-white">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-[#f7fbfb] text-[11px] uppercase tracking-wide text-[#7b8b94]">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Medication</th>
            <th className="px-3 py-2.5 font-semibold">Indication</th>
            <th className="px-3 py-2.5 font-semibold">Level</th>
            <th className="px-3 py-2.5 font-semibold">Relationship</th>
            <th className="px-3 py-2.5 font-semibold">Source</th>
            <th className="px-3 py-2.5 font-semibold">Jurisdiction</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const uiStatus = formatMappingStatus(row.status);
            return (
              <tr key={row.id} className="border-t border-[#edf3f4] align-top">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-[#102a43]">{row.medicationDisplayName}</p>
                  <p className="mt-0.5 text-[11px] text-[#7b8b94]">
                    {formatMappingLevel(row.medicationMappingLevel)} · CCDD:{' '}
                    {ccddDisplayId(row.medicationConceptId)}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-[#102a43]">{row.indicationDisplayName}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#7b8b94]">
                    SNOMED CT: {row.indicationConceptId}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-[#52677a]">
                  {formatMappingLevel(row.medicationMappingLevel)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                      relationshipBadgeClass(row.relationshipType),
                    )}
                  >
                    {formatRelationshipType(row.relationshipType)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[#52677a]">
                  {row.sourceLabel?.trim() ? (
                    row.sourceLabel
                  ) : (
                    <span className="text-[#8a9aa3]">Not linked</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[#52677a]">
                  {formatJurisdiction(row.jurisdiction)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      uiStatus === 'approved'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {uiStatus === 'approved' ? 'Approved' : 'Retired'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Edit mapping"
                      onClick={() => onEdit(row)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="View details"
                      onClick={() => onDetails(row)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewQueueTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useIndicationCandidates({
    status: 'pending',
    page,
    limit: 20,
  });
  const mutations = useIndicationMappingMutations();
  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      {isLoading ? <TableShell message="Loading review queue…" spinner /> : null}
      {isError ? (
        <TableShell message="Could not load candidates. The review queue API may not be deployed yet." />
      ) : null}
      {!isLoading && !isError && !rows.length ? (
        <TableShell message="Review Queue is empty — that is expected until pharmacists select a SNOMED indication that is not yet in the Approved repository (Adapt indication picker). Candidates are not auto-imported from CCDD/SNOMED." />
      ) : null}
      {!isLoading && !isError && rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-[#e4ecef] bg-white">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-[#f7fbfb] text-[11px] uppercase tracking-wide text-[#7b8b94]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Medication</th>
                <th className="px-3 py-2.5 font-semibold">Suggested indication</th>
                <th className="px-3 py-2.5 font-semibold">Source</th>
                <th className="px-3 py-2.5 font-semibold">Observations</th>
                <th className="px-3 py-2.5 font-semibold">Last seen</th>
                <th className="px-3 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf3f4] align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-[#102a43]">
                      {row.medicationDisplayName ?? row.medicationConceptId}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#7b8b94]">
                      {formatMappingLevel(row.medicationMappingLevel)} · CCDD:{' '}
                      {ccddDisplayId(row.medicationConceptId)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-[#102a43]">
                      {row.indicationDisplayName ?? row.indicationConceptId}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#7b8b94]">
                      SNOMED CT: {row.indicationConceptId}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 capitalize text-[#52677a]">
                    {(row.sourceType ?? 'unknown').replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-2.5 text-[#52677a]">{row.usageCount ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[#52677a]">
                    {row.lastSeenAt ? formatDate(row.lastSeenAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={mutations.rejectCandidate.isPending}
                        onClick={async () => {
                          try {
                            await mutations.rejectCandidate.mutateAsync(row.id);
                            toast.success('Candidate rejected');
                          } catch (error) {
                            toastError(error, 'Could not reject candidate');
                          }
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className={TEAL}
                        disabled={mutations.approveCandidate.isPending}
                        onClick={async () => {
                          try {
                            await mutations.approveCandidate.mutateAsync(row.id);
                            toast.success('Mapping approved from candidate');
                          } catch (error) {
                            toastError(error, 'Could not approve candidate');
                          }
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {meta && meta.total > 0 ? (
        <PaginationFooter meta={meta} page={page} onPageChange={setPage} noun="candidates" />
      ) : null}
    </div>
  );
}

function CoverageTab() {
  const { data, isLoading, isError } = useIndicationCoverage();

  if (isLoading) {
    return <TableShell message="Loading coverage metrics…" spinner />;
  }
  if (isError || !data) {
    return (
      <TableShell message="Coverage metrics are unavailable until the coverage API is configured." />
    );
  }

  const kpis: { label: string; value: number; hint?: string }[] = [
    { label: 'Medications encountered', value: data.medicationsEncountered },
    { label: 'With approved mappings', value: data.withApprovedMappings },
    { label: 'Needs review', value: data.needsReview },
    { label: 'No approved mappings', value: data.noApprovedMappings },
    { label: 'Pending relationships', value: data.pendingRelationships },
    { label: 'Approved relationships', value: data.approvedRelationships },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-xl border border-[#e4ecef] bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[#7b8b94]">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#102a43]">{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

function VersionHistoryTab() {
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState('');
  const { data, isLoading, isError } = useIndicationVersions({ page, limit: 20 });
  const mutations = useIndicationMappingMutations();
  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-[#e4ecef] bg-white p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#7b8b94]">
            Publish repository version
          </span>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Optional change summary (e.g. Q3 Health Canada PM updates)"
            className="h-10"
          />
        </label>
        <Button
          type="button"
          className={cn('h-10 shrink-0 rounded-lg', TEAL)}
          disabled={mutations.publishVersion.isPending}
          onClick={async () => {
            try {
              await mutations.publishVersion.mutateAsync(summary);
              toast.success('Indication repository version published');
              setSummary('');
            } catch (error) {
              toastError(error, 'Could not publish version');
            }
          }}
        >
          {mutations.publishVersion.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : null}
          Publish version
        </Button>
      </div>

      {isLoading ? <TableShell message="Loading version history…" spinner /> : null}
      {isError ? (
        <TableShell message="Version history is unavailable until the versions API is configured." />
      ) : null}
      {!isLoading && !isError && !rows.length ? (
        <TableShell message="No published repository versions yet. Publish a snapshot to record the current approved mappings." />
      ) : null}
      {!isLoading && !isError && rows.length ? (
        <div className="overflow-hidden rounded-xl border border-[#e4ecef] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f7fbfb] text-[11px] uppercase tracking-wide text-[#7b8b94]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Version</th>
                <th className="px-3 py-2.5 font-semibold">Published</th>
                <th className="px-3 py-2.5 font-semibold">Published by</th>
                <th className="px-3 py-2.5 font-semibold">Changes</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <VersionRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {meta && meta.total > 0 ? (
        <PaginationFooter meta={meta} page={page} onPageChange={setPage} noun="versions" />
      ) : null}
    </div>
  );
}

function VersionRow({ row }: { row: IndicationRepositoryVersion }) {
  const changes =
    row.changesSummary?.trim() ||
    [
      row.addedCount != null ? `${row.addedCount} added` : null,
      row.updatedCount != null ? `${row.updatedCount} updated` : null,
      row.retiredCount != null ? `${row.retiredCount} retired` : null,
    ]
      .filter(Boolean)
      .join(' · ') ||
    '—';

  return (
    <tr className="border-t border-[#edf3f4]">
      <td className="px-3 py-2.5 font-medium text-[#102a43]">{row.version}</td>
      <td className="px-3 py-2.5 text-[#52677a]">{formatDate(row.publishedAt)}</td>
      <td className="px-3 py-2.5 text-[#52677a]">
        {row.publishedByName ?? row.publishedBy ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-[#52677a]">{changes}</td>
      <td className="px-3 py-2.5 capitalize text-[#52677a]">{row.status}</td>
    </tr>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="w-[160px]">
      <label className="sr-only">{label}</label>
      <Select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options}
      />
    </div>
  );
}

function PaginationFooter({
  meta,
  page,
  onPageChange,
  noun,
}: {
  meta: { page: number; limit: number; total: number; totalPages: number };
  page: number;
  onPageChange: (p: number) => void;
  noun: string;
}) {
  const from = (page - 1) * meta.limit + 1;
  const to = Math.min(page * meta.limit, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#617184]">
      <span>
        Showing {from}–{to} of {meta.total} {noun}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="tabular-nums">
          Page {page} of {meta.totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= meta.totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function TableShell({
  message,
  spinner,
}: {
  message: string;
  spinner?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-10 text-center text-sm text-[#617184]',
        spinner && 'border-solid border-[#e4ecef] bg-white',
      )}
    >
      {spinner ? <Loader2 className="h-4 w-4 animate-spin text-[#0F6F6B]" /> : null}
      {!spinner ? <MapPin className="h-4 w-4 text-[#8a9aa3]" /> : null}
      {message}
    </div>
  );
}
