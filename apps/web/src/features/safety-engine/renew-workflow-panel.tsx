'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { cn } from '@/lib/utils';
import { useRouter, usePathname } from 'next/navigation';
import { datasetKeyToRenewWorkflow, useRenewWorkflowRows } from './clinical-repository-hooks';
import type { DatasetKey } from './dataset-registry';

const PAGE_SIZE = 10;

const COLUMNS: Record<
  NonNullable<ReturnType<typeof datasetKeyToRenewWorkflow>>,
  string[]
> = {
  indications: ['Medication / ingredient', 'Indication', 'Rank', 'Common', 'Status'],
  monitoring: ['Applies to', 'Indication', 'Monitoring input', 'Requirement', 'Freshness', 'If missing', 'Status'],
  inputs: ['Input code', 'Label', 'Category', 'Unit', 'Renderer', 'Date', 'Unavailable', 'Status'],
  questions: ['Applies to', 'Indication', 'Question', 'Trigger', 'Workflow action', 'Status'],
};

function StatusPill({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide',
        active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function cell(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value);
}

function rowCells(
  dataset: NonNullable<ReturnType<typeof datasetKeyToRenewWorkflow>>,
  row: Record<string, unknown>,
): string[] {
  if (dataset === 'indications') {
    const condition = row.condition as { code?: string; displayName?: string } | undefined;
    return [
      cell(row.drugName || row.ingredientId || row.medicationConceptId),
      cell(condition?.displayName || condition?.code),
      cell(row.suggestionRank),
      row.commonIndication ? 'Yes' : 'No',
    ];
  }
  if (dataset === 'monitoring') {
    const input = row.input as { code?: string; label?: string } | undefined;
    const freshness = row.freshnessDays == null ? '—' : `${row.freshnessDays} days`;
    return [
      cell(`${row.appliesToType || row.matchType}: ${row.appliesToId || row.ingredientKey || ''}`),
      cell(row.indicationId || row.conditionCode || 'ANY'),
      cell(input?.label || input?.code),
      cell(row.requirementLevel),
      freshness,
      cell(row.actionIfMissing),
    ];
  }
  if (dataset === 'inputs') {
    return [
      cell(row.code),
      cell(row.label),
      cell(row.category || row.inputType),
      cell(row.unit),
      cell(row.uiComponent),
      row.allowDate === false ? 'No' : 'Yes',
      row.allowNotAvailable === false ? 'No' : 'Yes',
    ];
  }
  return [
    cell(`${row.appliesToType}: ${row.appliesToId}`),
    cell(row.indicationId),
    cell(row.questionText || row.questionCode),
    cell(row.triggerAnswer),
    cell(row.actionOnTrigger),
  ];
}

export function RenewWorkflowTable({
  datasetKey,
  page,
  search,
  onPageChange,
  onOpenImport,
}: {
  datasetKey: DatasetKey;
  page: number;
  search: string;
  onPageChange: (page: number) => void;
  onOpenImport?: () => void;
}) {
  const dataset = datasetKeyToRenewWorkflow(datasetKey);
  const router = useRouter();
  const pathname = usePathname();
  const query = useRenewWorkflowRows(dataset ?? 'inputs', {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  if (!dataset) return null;
  if (query.isError) {
    return <ErrorState title="Couldn’t load Renew configuration" onRetry={() => void query.refetch()} />;
  }
  if (query.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Loading published Renew configuration…
      </div>
    );
  }

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const totalPages = query.data?.meta.totalPages ?? 1;
  const columns = COLUMNS[dataset];

  if (!rows.length) {
    return (
      <EmptyState
        title="No published Renew configuration yet"
        description="Upload the four Renew workbooks from Upload & Publish — they are workflow collection rules, not a second safety engine."
        action={
          onOpenImport ? (
            <Button type="button" onClick={onOpenImport}>
              Import workbooks
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {dataset === 'monitoring' || dataset === 'inputs' ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-950">
          <p className="font-semibold">Reference handling is not configured here.</p>
          <p className="mt-1 text-sky-900/80">
            This workbook decides what to collect. Displayed intervals and guideline targets come from
            Clinical Safety → Reference & Target Values.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-8 border-sky-200 bg-white shadow-none"
            onClick={() =>
              router.replace(
                `${pathname}?section=repository&dataset=reference-target-values`,
                { scroll: false },
              )
            }
          >
            Open Reference & Target Values
          </Button>
        </div>
      ) : null}
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2.5 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cells = rowCells(dataset, row);
              return (
                <tr key={String(row.id)} className="border-b border-border/70 last:border-0">
                  {cells.map((value, index) => (
                    <td key={`${String(row.id)}-${index}`} className="max-w-[18rem] px-3 py-2.5 align-top">
                      <span className="line-clamp-3 text-foreground">{value}</span>
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <StatusPill active={row.active !== false} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-3 py-2">
        <Pagination page={page} totalPages={totalPages} total={total} limit={PAGE_SIZE} onPageChange={onPageChange} />
      </div>
    </div>
    </div>
  );
}
