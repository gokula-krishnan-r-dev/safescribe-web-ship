'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState, ErrorState } from '@/components/shared/states';
import {
  useClinicalEvidence,
  useClinicalTestCases,
  useClinicalValueSets,
  datasetKeyToRenewWorkflow,
  useRenewWorkflowRows,
  clinicalRepoKeys,
} from './clinical-repository-hooks';
import { useDrugCatalog, useDrugClasses, useSafetyRules } from './hooks';
import { DATASET_REGISTRY, type DatasetKey } from './dataset-registry';
import { SafetyRuleDetailDialog } from './safety-rule-detail-dialog';
import { EditableRulesTable } from './editable-rules-table';
import { RenewWorkflowTable } from './renew-workflow-panel';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

function useClinicalTestInputs(params: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: [...clinicalRepoKeys.all, 'test-inputs', params] as const,
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          recordId?: string | null;
          inputBundleKey?: string | null;
          inputType?: string | null;
          entityRole?: string | null;
          contentStatus?: string | null;
        }>;
        meta: { total: number };
      }>(`/admin/clinical-repository/test-inputs${query ? `?${query}` : ''}`),
  });
}
const PAGE_SIZE = 10;

interface Props {
  datasetKey: DatasetKey;
  onOpenImport?: () => void;
}

export function RepositoryDatasetPanel({ datasetKey, onOpenImport }: Props) {
  const def = DATASET_REGISTRY[datasetKey];
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [viewRuleId, setViewRuleId] = useState<string | null>(null);

  // Reset paging when dataset changes
  const [prevKey, setPrevKey] = useState(datasetKey);
  if (prevKey !== datasetKey) {
    setPrevKey(datasetKey);
    setPage(1);
    setSearch('');
    setSearchInput('');
    setSeverityFilter('');
  }

  const rulesQuery = useSafetyRules({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    ruleType: def.ruleType,
  });

  const draftRulesQuery = useSafetyRules({
    page: 1,
    limit: 1,
    ruleType: def.ruleType,
    status: 'DRAFT',
  });

  const approvedRulesQuery = useSafetyRules({
    page: 1,
    limit: 1,
    ruleType: def.ruleType,
    status: 'APPROVED',
  });

  const allRulesForStats = useSafetyRules({
    page: 1,
    limit: 1,
    ruleType: def.ruleType,
  });

  const drugCatalog = useDrugCatalog({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  const drugClasses = useDrugClasses({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  const valueSets = useClinicalValueSets({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  const evidence = useClinicalEvidence({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  const testCases = useClinicalTestCases({ page, limit: PAGE_SIZE });
  const testInputs = useClinicalTestInputs({ page, limit: PAGE_SIZE });
  const workflowDataset = datasetKeyToRenewWorkflow(datasetKey);
  const workflowQuery = useRenewWorkflowRows(
    workflowDataset ?? 'inputs',
    { page, limit: PAGE_SIZE, search: search || undefined },
    Boolean(workflowDataset),
  );

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const stats = useMemo(() => {
    if (def.source === 'rules') {
      return [
        {
          label: 'Published rules',
          value: rulesQuery.data?.total ?? '—',
          hint: 'Active in this release',
        },
        {
          label: 'Draft / approved',
          value: `${draftRulesQuery.data?.total ?? 0} / ${approvedRulesQuery.data?.total ?? 0}`,
          hint: 'Awaiting publish',
        },
        {
          label: 'Total versions',
          value: allRulesForStats.data?.total ?? '—',
          hint: 'All statuses',
        },
      ];
    }
    if (def.source === 'drug-catalog') {
      return [
        { label: 'Catalogue entries', value: drugCatalog.data?.total ?? '—', hint: 'Synced medications' },
        { label: 'Page', value: String(page), hint: 'Current view' },
        { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
      ];
    }
    if (def.source === 'drug-classes') {
      return [
        { label: 'Drug classes', value: drugClasses.data?.total ?? '—', hint: 'Taxonomy rows' },
        { label: 'Page', value: String(page), hint: 'Current view' },
        { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
      ];
    }
    if (def.source === 'value-sets') {
      return [
        { label: 'Value sets', value: valueSets.data?.meta.total ?? '—', hint: 'Governed sets' },
        { label: 'Page', value: String(page), hint: 'Current view' },
        { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
      ];
    }
    if (def.source === 'evidence') {
      return [
        { label: 'Evidence links', value: evidence.data?.meta.total ?? '—', hint: 'Linked sources' },
        { label: 'Page', value: String(page), hint: 'Current view' },
        { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
      ];
    }
    if (def.source === 'test-cases') {
      return [
        { label: 'Test cases', value: testCases.data?.meta.total ?? '—', hint: 'Regression suite' },
        { label: 'Page', value: String(page), hint: 'Current view' },
        { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
      ];
    }
    if (def.source === 'renew-workflow') {
      return [
        { label: 'Published rows', value: workflowQuery.data?.meta.total ?? '—', hint: 'Active workflow config' },
        { label: 'Page', value: String(page), hint: 'Current view' },
        { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
      ];
    }
    return [
      { label: 'Records', value: testInputs.data?.meta.total ?? '—', hint: 'Test inputs' },
      { label: 'Page', value: String(page), hint: 'Current view' },
      { label: 'Page size', value: String(PAGE_SIZE), hint: 'Server-paginated' },
    ];
  }, [
    def.source,
    rulesQuery.data?.total,
    draftRulesQuery.data?.total,
    approvedRulesQuery.data?.total,
    allRulesForStats.data?.total,
    drugCatalog.data?.total,
    drugClasses.data?.total,
    valueSets.data?.meta.total,
    evidence.data?.meta.total,
    testCases.data?.meta.total,
    testInputs.data?.meta.total,
    workflowQuery.data?.meta.total,
    page,
  ]);

  const filteredRules = useMemo(() => {
    const items = rulesQuery.data?.items ?? [];
    if (!severityFilter) return items;
    return items.filter(
      (r) => r.latestVersion?.clinicalSeverity === severityFilter,
    );
  }, [rulesQuery.data?.items, severityFilter]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Clinical admin
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{def.label}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{def.description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm"
          >
            <p className="text-[12px] font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder={def.searchPlaceholder}
            className="h-10 border-border/80 bg-background pl-9 shadow-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10 shadow-none" onClick={applySearch}>
            Search
          </Button>
          {def.source === 'rules' ? (
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm shadow-none"
              aria-label="Filter by severity"
            >
              <option value="">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MODERATE">Moderate</option>
              <option value="LOW">Low</option>
              <option value="INFO">Info</option>
            </select>
          ) : null}
        </div>
      </div>

      {def.source === 'rules' ? (
        <EditableRulesTable
          loading={rulesQuery.isLoading}
          error={rulesQuery.isError}
          onRetry={() => void rulesQuery.refetch()}
          rows={filteredRules}
          total={rulesQuery.data?.total ?? 0}
          page={page}
          totalPages={rulesQuery.data?.totalPages ?? 1}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          onOpen={setViewRuleId}
          emptyAction={onOpenImport}
          datasetLabel={def.label}
        />
      ) : null}

      {def.source === 'renew-workflow' ? (
        <RenewWorkflowTable
          datasetKey={datasetKey}
          page={page}
          search={search}
          onPageChange={setPage}
          onOpenImport={onOpenImport}
        />
      ) : null}

      {def.source === 'drug-catalog' ? (
        <SimpleTable
          loading={drugCatalog.isLoading}
          error={drugCatalog.isError}
          onRetry={() => drugCatalog.refetch()}
          columns={
            datasetKey === 'medication-ingredients'
              ? ['Ingredient', 'Drug', 'Class', 'Brands']
              : ['Medication', 'Ingredient', 'Class', 'Brands']
          }
          rows={(drugCatalog.data?.items ?? []).map((d) =>
            datasetKey === 'medication-ingredients'
              ? [
                  d.ingredient || '—',
                  d.drugName || '—',
                  d.className || '—',
                  d.commonBrands?.join(', ') || '—',
                ]
              : [
                  d.drugName || '—',
                  d.ingredient || '—',
                  d.className || '—',
                  d.commonBrands?.join(', ') || '—',
                ],
          )}
          emptyTitle="No catalogue entries"
          emptyDescription="Synchronize terminology or import the drug catalogue workbook."
          page={page}
          totalPages={drugCatalog.data?.totalPages ?? 1}
          total={drugCatalog.data?.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}

      {def.source === 'drug-classes' ? (
        <SimpleTable
          loading={drugClasses.isLoading}
          error={drugClasses.isError}
          onRetry={() => drugClasses.refetch()}
          columns={['Class', 'Parent', 'Therapeutic group', 'Risk tags']}
          rows={(drugClasses.data?.items ?? []).map((d) => [
            d.className,
            d.parentClass || '—',
            d.therapeuticGroup || '—',
            d.riskTags?.join(', ') || '—',
          ])}
          emptyTitle="No drug classes"
          emptyDescription="Import the drug classes sheet from the Excel template."
          page={page}
          totalPages={drugClasses.data?.totalPages ?? 1}
          total={drugClasses.data?.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}

      {def.source === 'value-sets' ? (
        <SimpleTable
          loading={valueSets.isLoading}
          error={valueSets.isError}
          onRetry={() => valueSets.refetch()}
          columns={['Code', 'Name', 'Version', 'Members', 'Status']}
          rows={(valueSets.data?.data ?? []).map((v) => [
            v.valueSetCode,
            v.displayName,
            v.valueSetVersion,
            String(v._count?.members ?? 0),
            v.recordStatus,
          ])}
          emptyTitle="No value sets"
          emptyDescription="Upload and promote the clinical value sets workbook."
          page={page}
          totalPages={Math.max(1, Math.ceil((valueSets.data?.meta.total ?? 0) / PAGE_SIZE))}
          total={valueSets.data?.meta.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}

      {def.source === 'evidence' ? (
        <SimpleTable
          loading={evidence.isLoading}
          error={evidence.isError}
          onRetry={() => evidence.refetch()}
          columns={['Evidence ID', 'Rule', 'Source', 'Source status', 'Approval']}
          rows={(evidence.data?.data ?? []).map((e) => [
            e.evidenceLinkId || e.id.slice(0, 8),
            e.ruleCode || '—',
            e.source,
            e.sourceStatus || '—',
            e.approvalStatus || '—',
          ])}
          emptyTitle="No evidence links"
          emptyDescription="Upload and promote the rule evidence workbook."
          page={page}
          totalPages={Math.max(1, Math.ceil((evidence.data?.meta.total ?? 0) / PAGE_SIZE))}
          total={evidence.data?.meta.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}

      {def.source === 'test-cases' ? (
        <SimpleTable
          loading={testCases.isLoading}
          error={testCases.isError}
          onRetry={() => testCases.refetch()}
          columns={['Test case', 'Name', 'Domain', 'Priority', 'Status']}
          rows={(testCases.data?.data ?? []).map((t) => [
            t.testCaseId,
            t.testCaseName,
            t.safetyDomain,
            t.priority,
            t.contentStatus,
          ])}
          emptyTitle="No test cases"
          emptyDescription="Upload and promote the test cases workbook."
          page={page}
          totalPages={Math.max(1, Math.ceil((testCases.data?.meta.total ?? 0) / PAGE_SIZE))}
          total={testCases.data?.meta.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}

      {def.source === 'test-inputs' ? (
        <SimpleTable
          loading={testInputs.isLoading}
          error={testInputs.isError}
          onRetry={() => testInputs.refetch()}
          columns={['Record', 'Bundle', 'Type', 'Role', 'Status']}
          rows={(testInputs.data?.data ?? []).map((t) => [
            t.recordId || t.id.slice(0, 8),
            t.inputBundleKey || '—',
            t.inputType || '—',
            t.entityRole || '—',
            t.contentStatus || '—',
          ])}
          emptyTitle="No test inputs"
          emptyDescription="Upload and promote the test inputs workbook."
          page={page}
          totalPages={Math.max(1, Math.ceil((testInputs.data?.meta.total ?? 0) / PAGE_SIZE))}
          total={testInputs.data?.meta.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}

      <SafetyRuleDetailDialog ruleId={viewRuleId} onClose={() => setViewRuleId(null)} />
    </div>
  );
}

function SimpleTable({
  loading,
  error,
  onRetry,
  columns,
  rows,
  emptyTitle,
  emptyDescription,
  page,
  totalPages,
  total,
  limit,
  onPageChange,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  columns: string[];
  rows: string[][];
  emptyTitle: string;
  emptyDescription: string;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
}) {
  if (error) return <ErrorState title="Could not load data" onRetry={onRetry} />;
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-4 py-3 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border/70 hover:bg-muted/30">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={cn(
                      'px-4 py-3 text-[13px]',
                      j === 0 ? 'font-semibold text-foreground' : 'text-foreground/85',
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
        <span>
          Showing {rows.length} of {total}
        </span>
        {totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={onPageChange}
          />
        ) : null}
      </div>
    </div>
  );
}
