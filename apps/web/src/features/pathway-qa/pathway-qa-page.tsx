'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@/lib/notify';
import {
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  Play,
  Search,
  AlertCircle,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { usePathways } from '@/features/pathways/hooks';
import type { PathwayListItem } from '@/features/pathways/types';
import {
  usePathwayQaRun,
  usePathwayQaRuns,
  usePathwayQaWorkbooks,
  useRunPathwayQa,
  useUploadPathwayQaWorkbook,
} from './hooks';
import { PathwayQaRunResults } from './run-results';
import type { PathwayQaWorkbook } from './types';

const PATHWAY_PICKER_LIMIT = 100;

function pathwayStatusRank(status: string): number {
  if (status === 'PUBLISHED') return 0;
  if (status === 'UNPUBLISHED' || status === 'AI_GENERATED') return 1;
  if (status === 'DRAFT' || status === 'AI_PROCESSING') return 2;
  return 3;
}

function filterAndSortPathways(
  items: PathwayListItem[],
  query: string,
): PathwayListItem[] {
  const q = query.trim().toLowerCase();
  const filtered = !q
    ? items
    : items.filter((item) => {
        const hay = `${item.name} ${item.condition} ${item.province} ${item.category}`.toLowerCase();
        return hay.includes(q);
      });

  return [...filtered].sort((a, b) => {
    const byStatus = pathwayStatusRank(a.status) - pathwayStatusRank(b.status);
    if (byStatus !== 0) return byStatus;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}

function statusLabel(status: string): string {
  if (status === 'PUBLISHED') return 'Published';
  return status.replace(/_/g, ' ');
}

export function PathwayQaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselected = searchParams.get('pathwayId') ?? '';
  const [pathwayId, setPathwayId] = useState(preselected);
  const [pathwayQuery, setPathwayQuery] = useState('');
  const deferredPathwayQuery = useDeferredValue(pathwayQuery);
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<PathwayQaWorkbook | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

  const pathways = usePathways({
    page: 1,
    limit: PATHWAY_PICKER_LIMIT,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const workbooks = usePathwayQaWorkbooks();
  const history = usePathwayQaRuns({
    pathwayId: pathwayId || undefined,
    page: 1,
    limit: 8,
  });
  const uploadMutation = useUploadPathwayQaWorkbook();
  const runMutation = useRunPathwayQa();
  const activeRun = usePathwayQaRun(activeRunId);

  const catalog = pathways.data?.items ?? [];
  const visiblePathways = useMemo(
    () => filterAndSortPathways(catalog, deferredPathwayQuery),
    [catalog, deferredPathwayQuery],
  );
  const selectedPathway =
    catalog.find((item) => item.id === pathwayId) ??
    visiblePathways.find((item) => item.id === pathwayId) ??
    null;

  const recentWorkbooks: PathwayQaWorkbook[] = workbooks.data ?? [];
  const activeWorkbook = workbook ?? recentWorkbooks[0] ?? null;

  useEffect(() => {
    if (preselected) setPathwayId(preselected);
  }, [preselected]);

  // Prefer an already-extracted pack so Run works without re-upload.
  useEffect(() => {
    if (!workbook && recentWorkbooks[0]) {
      setWorkbook(recentWorkbooks[0]);
    }
  }, [workbook, recentWorkbooks]);

  useEffect(() => {
    if (!pathwayId || !selectedRowRef.current) return;
    selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pathwayId, deferredPathwayQuery]);

  const canRun = Boolean(pathwayId && activeWorkbook?.id);
  const preview = activeWorkbook?.preview;
  const searching = deferredPathwayQuery.trim().length > 0;
  const pathwayError = pathways.isError
    ? getErrorMessage(pathways.error, 'Could not load pathways.')
    : null;

  const clearPathway = () => {
    setPathwayId('');
    setActiveRunId(null);
    router.replace('/super-admin/pathway-qa');
  };

  const selectPathway = (id: string) => {
    if (pathwayId === id) {
      clearPathway();
      return;
    }
    setPathwayId(id);
    setActiveRunId(null);
    router.replace(`/super-admin/pathway-qa?pathwayId=${encodeURIComponent(id)}`);
  };

  const onFile = async (next: File | null) => {
    if (!next) return;
    setFile(next);
    try {
      const saved = await uploadMutation.mutateAsync(next);
      setWorkbook(saved);
      toast.success(
        `Extracted ${saved.preview?.uniqueVariantCount ?? saved.caseCount} unique test cases.`,
      );
    } catch (err) {
      setFile(null);
      toast.error(getErrorMessage(err, 'Could not read that workbook.'));
    }
  };

  const runTests = async () => {
    if (!pathwayId) {
      toast.error('Select a clinical pathway first.');
      return;
    }
    const workbookId = activeWorkbook?.id;
    if (!workbookId && !file) {
      toast.error('Upload or reuse the Excel pack first.');
      return;
    }
    try {
      const run = await runMutation.mutateAsync({
        pathwayId,
        workbookId: workbookId || undefined,
        file: workbookId ? undefined : file ?? undefined,
      });
      setActiveRunId(run.id);
      if (run.status === 'FAILED') {
        toast.error(run.errorMessage || 'The run finished with errors.');
      } else {
        const failed = run.summary?.failed ?? 0;
        toast.success(
          failed
            ? `Finished: ${run.summary?.passed ?? 0} passed, ${failed} failed.`
            : `All ${run.summary?.passed ?? 0} unique cases passed.`,
        );
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not run test cases.'));
    }
  };

  const displayRun = activeRun.data ?? runMutation.data;
  const runBlockedReason = !pathwayId
    ? 'Select a pathway to run.'
    : !activeWorkbook?.id
      ? 'Upload or reuse an Excel pack to run.'
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pathway test cases"
        description="Internal Super Admin lab. Select a pathway, upload the 48-condition Excel pack, and run the unique Safety, Treatment, and Flow cases for that condition."
        breadcrumbs={[
          { label: 'Clinical Platform', href: '/super-admin/platform' },
          { label: 'Pathway test cases' },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">1. Select pathway</p>
                    <p className="text-sm text-muted-foreground">
                      Cases are matched to this pathway’s condition. Only the unique variants for
                      that condition run.
                    </p>
                  </div>
                  {!pathways.isLoading && catalog.length > 0 ? (
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {searching
                        ? `${visiblePathways.length} of ${catalog.length}`
                        : `${catalog.length} pathways`}
                    </Badge>
                  ) : null}
                </div>

                {selectedPathway ? (
                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                        Selected
                      </p>
                      <p className="truncate text-sm font-semibold text-foreground">
                        {selectedPathway.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedPathway.condition}
                        {selectedPathway.province ? ` · ${selectedPathway.province}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge
                        variant={
                          selectedPathway.status === 'PUBLISHED' ? 'success' : 'outline'
                        }
                      >
                        {statusLabel(selectedPathway.status)}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                        onClick={clearPathway}
                        aria-label="Clear pathway selection"
                      >
                        <X className="h-3.5 w-3.5" />
                        Clear
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    No pathway selected — choose one below, then run.
                  </p>
                )}

                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9 pr-9"
                    placeholder="Filter by name, condition, or province…"
                    value={pathwayQuery}
                    onChange={(e) => setPathwayQuery(e.target.value)}
                    aria-label="Filter pathways"
                    disabled={pathways.isLoading && !catalog.length}
                  />
                  {pathwayQuery ? (
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setPathwayQuery('')}
                      aria-label="Clear filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-1">
                  {pathways.isLoading && !catalog.length ? (
                    <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading clinical pathways…
                    </p>
                  ) : pathwayError ? (
                    <div className="space-y-3 px-3 py-6 text-center">
                      <AlertCircle className="mx-auto h-5 w-5 text-destructive" />
                      <p className="text-sm text-destructive">{pathwayError}</p>
                      <Button size="sm" variant="outline" onClick={() => void pathways.refetch()}>
                        Try again
                      </Button>
                    </div>
                  ) : visiblePathways.length ? (
                    visiblePathways.map((item) => {
                      const selected = pathwayId === item.id;
                      return (
                        <button
                          key={item.id}
                          ref={selected ? selectedRowRef : undefined}
                          type="button"
                          onClick={() => selectPathway(item.id)}
                          aria-pressed={selected}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                            selected
                              ? 'bg-primary/10 ring-1 ring-primary/25'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <span className="flex min-w-0 items-start gap-2.5">
                            <span
                              className={cn(
                                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                                selected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-card',
                              )}
                              aria-hidden
                            >
                              {selected ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">
                                {item.name}
                              </span>
                              {item.condition !== item.name ? (
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {item.condition}
                                  {item.province ? ` · ${item.province}` : ''}
                                </span>
                              ) : item.province ? (
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {item.province}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <Badge
                            variant={item.status === 'PUBLISHED' ? 'success' : 'outline'}
                            className="shrink-0"
                          >
                            {statusLabel(item.status)}
                          </Badge>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-8 text-center">
                      <p className="text-sm font-medium text-foreground">
                        {searching ? 'No pathways match that filter' : 'No clinical pathways yet'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {searching
                          ? 'Clear the filter or try another condition name.'
                          : 'Create or publish a pathway in Clinical Pathways first.'}
                      </p>
                      {searching ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-3"
                          onClick={() => setPathwayQuery('')}
                        >
                          Clear filter
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => router.push('/super-admin/pathways')}
                        >
                          Open pathways
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedPathway
                    ? 'Click the selected pathway again, or Clear, to remove the selection.'
                    : 'Tip: filter by condition name (e.g. “cold”), then click to select.'}
                </p>
                {(pathways.data?.total ?? 0) > PATHWAY_PICKER_LIMIT ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Showing the first {PATHWAY_PICKER_LIMIT} pathways. Use the filter to narrow by
                    name or condition.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-semibold">2. Upload Excel pack</p>
                <p className="text-sm text-muted-foreground">
                  Use the 48-pathway developer workbook. We extract Test_Cases, Coverage, and
                  Permutations automatically.
                </p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const next = e.dataTransfer.files?.[0];
                    if (next) void onFile(next);
                  }}
                  className={cn(
                    'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40',
                    activeWorkbook && 'border-primary/30 bg-primary/[0.03]',
                  )}
                  onClick={() => inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                  }}
                >
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                  <p className="mt-3 text-sm font-medium">
                    {file?.name ||
                      activeWorkbook?.fileName ||
                      'Drop the .xlsx file here, or click to browse'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Up to 10 MB · .xlsx / .xls</p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
                {uploadMutation.isPending ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting unique cases…
                  </p>
                ) : null}
                {preview ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Cases', preview.caseCount],
                      ['Unique variants', preview.uniqueVariantCount],
                      ['Conditions', preview.conditionCount],
                      ['Permutations', preview.permutationCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl bg-muted/40 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="text-lg font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {recentWorkbooks.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Or reuse a previous upload
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recentWorkbooks.slice(0, 4).map((item) => (
                        <Button
                          key={item.id}
                          size="sm"
                          variant={activeWorkbook?.id === item.id ? 'secondary' : 'outline'}
                          onClick={() => {
                            setWorkbook(item);
                            setFile(null);
                          }}
                        >
                          {item.fileName}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <Button
                  className="gap-2"
                  disabled={!canRun || runMutation.isPending || uploadMutation.isPending}
                  onClick={() => void runTests()}
                >
                  {runMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {runMutation.isPending ? 'Running…' : 'Run unique cases'}
                </Button>
                {selectedPathway ? (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      router.push(`/super-admin/pathways/${selectedPathway.id}?tab=qa`)
                    }
                  >
                    Open pathway
                  </Button>
                ) : null}
                {runBlockedReason ? (
                  <p className="w-full text-xs text-muted-foreground sm:w-auto">{runBlockedReason}</p>
                ) : (
                  <p className="w-full text-xs text-muted-foreground sm:w-auto">
                    Ready — {selectedPathway?.name ?? 'pathway'} × {activeWorkbook?.fileName}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {displayRun ? <PathwayQaRunResults run={displayRun} /> : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <p className="font-semibold">How a case is judged</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Safety Engine</span> — live
                  evaluator with the Excel fixture (pregnancy, current meds, labs).
                </li>
                <li>
                  <span className="font-medium text-foreground">Treatment</span> — pathway options,
                  regimen fields, and invalid/boundary coverage.
                </li>
                <li>
                  <span className="font-medium text-foreground">Pathway & Flow</span> — eligibility,
                  red flags, age bounds, and manual-selection state.
                </li>
              </ul>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                112 permutation rows stay as specification coverage. Production runs the 3 unique
                variants per layer so a pathway finishes in seconds, not thousands of evaluations.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Recent runs</p>
                {pathwayId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      // Show all recent runs, not only the selected pathway.
                      clearPathway();
                    }}
                  >
                    Show all
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {(history.data?.data ?? []).map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      setActiveRunId(run.id);
                      if (run.pathway.id && run.pathway.id !== pathwayId) {
                        setPathwayId(run.pathway.id);
                        router.replace(
                          `/super-admin/pathway-qa?pathwayId=${encodeURIComponent(run.pathway.id)}`,
                        );
                      }
                    }}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/30',
                      activeRunId === run.id ? 'border-primary/40 bg-primary/5' : 'border-border',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{run.pathway.name}</span>
                      {run.summary?.failed ? (
                        <Badge variant="destructive">{run.summary.failed} fail</Badge>
                      ) : run.status === 'COMPLETED' ? (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Pass
                        </Badge>
                      ) : (
                        <Badge variant="outline">{run.status}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(run.createdAt)}
                      {run.matchedCondition ? ` · ${run.matchedCondition}` : ''}
                    </p>
                  </button>
                ))}
                {!history.data?.data?.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No runs yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
