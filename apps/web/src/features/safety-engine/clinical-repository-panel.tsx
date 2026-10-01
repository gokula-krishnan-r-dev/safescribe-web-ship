'use client';

import { useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  TestTube2,
  ClipboardCheck,
  Rocket,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useActiveTerminology,
  useClinicalImports,
  useClinicalPreflight,
  useClinicalTestCases,
  usePromoteClinicalImport,
  usePublishClinicalRelease,
  useRunClinicalTests,
} from './clinical-repository-hooks';
import { useApproveAllDraftRules, useSafetyRules } from './hooks';
import { cn } from '@/lib/utils';
import { SafetyEngineImportWizard } from './safety-engine-import-wizard';
import { ReleaseHistoryPanel } from './release-history-panel';

export type ClinicalRepoPanelMode =
  | 'upload'
  | 'batches'
  | 'validation'
  | 'review'
  | 'candidate'
  | 'tests'
  | 'releases'
  | 'all';

function statusBadgeClass(status: string) {
  if (status === 'IMPORTED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'READY_TO_IMPORT') return 'bg-sky-100 text-sky-800';
  if (status === 'REQUIRES_CORRECTION' || status === 'FAILED') {
    return 'bg-red-100 text-red-800';
  }
  return 'bg-muted text-muted-foreground';
}

function formatPublishError(err: unknown): string {
  const e = err as {
    message?: string | string[];
    checks?: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
  };
  const failed = (e.checks ?? []).filter((c) => !c.ok);
  const base = Array.isArray(e.message)
    ? e.message.join('; ')
    : e.message || 'Publish blocked — fix preflight checks first';
  if (!failed.length) return base;
  const details = failed
    .map((c) => `${c.label}${c.detail ? `: ${c.detail}` : ''}`)
    .join(' · ');
  return `${base} — ${details}`;
}

function ImportBatchesTable({
  limit = 50,
  showPromoteAll = true,
}: {
  limit?: number;
  showPromoteAll?: boolean;
}) {
  const imports = useClinicalImports({ page: 1, limit });
  const promote = usePromoteClinicalImport();
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const readyBatches =
    imports.data?.data.filter(
      (b) => b.status === 'READY_TO_IMPORT' && b.errorRows === 0 && b.validRows > 0,
    ) ?? [];

  const promoteOne = async (batchId: string, filename: string) => {
    setPromotingId(batchId);
    try {
      try {
        await promote.mutateAsync(batchId);
      } catch (err: unknown) {
        if ((err as { statusCode?: number }).statusCode === 504) {
          await promote.mutateAsync(batchId);
        } else {
          throw err;
        }
      }
      toast.success(`Imported draft records from ${filename}`);
    } catch (err: unknown) {
      const message =
        (err as { message?: string | string[] }).message;
      const text = Array.isArray(message) ? message.join('; ') : message;
      toast.error(text ?? `Promote failed for ${filename}`);
    } finally {
      setPromotingId(null);
    }
  };

  const promoteAll = async () => {
    if (!readyBatches.length) {
      toast.message('No READY_TO_IMPORT batches to promote.');
      return;
    }
    let ok = 0;
    for (const batch of readyBatches) {
      try {
        await promote.mutateAsync(batch.id);
        ok += 1;
      } catch (err: unknown) {
        toast.error(
          (err as { message?: string }).message ??
            `Promote failed for ${batch.originalFilename}`,
        );
        break;
      }
    }
    if (ok) {
      toast.success(
        `Promoted ${ok} batch${ok === 1 ? '' : 'es'} into draft rules. Next: Approve All, then Publish.`,
      );
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Import batches</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload validates and stages rows. Click <strong>Promote to drafts</strong> to insert
              them into the repository. Until promoted, Test Cases stay at 0.
            </p>
          </div>
          {showPromoteAll ? (
            <Button
              size="sm"
              disabled={!readyBatches.length || promote.isPending}
              onClick={() => void promoteAll()}
            >
              {promote.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-4 w-4" />
              )}
              Promote all ready ({readyBatches.length})
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {imports.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading batches…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">File</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Rows</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(imports.data?.data ?? []).map((batch) => {
                  const canPromote =
                    batch.status === 'READY_TO_IMPORT' &&
                    batch.errorRows === 0 &&
                    batch.validRows > 0;
                  return (
                    <tr key={batch.id} className="border-b border-border/50">
                      <td className="max-w-[220px] truncate py-2.5 pr-2">
                        {batch.originalFilename}
                      </td>
                      <td className="py-2.5 pr-2 text-xs text-muted-foreground">
                        {batch.fileTypeKey ?? '—'}
                      </td>
                      <td className="py-2.5 pr-2">
                        <Badge className={cn('text-[10px]', statusBadgeClass(batch.status))}>
                          {batch.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-2 text-xs tabular-nums text-muted-foreground">
                        {batch.validRows}v / {batch.warningRows}w / {batch.errorRows}e
                      </td>
                      <td className="py-2.5">
                        {canPromote ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={promotingId === batch.id || promote.isPending}
                            onClick={() => void promoteOne(batch.id, batch.originalFilename)}
                          >
                            {promotingId === batch.id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Promote to drafts
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!imports.data?.data?.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No import batches yet. Use New Upload to add workbooks.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClinicalReviewPanel() {
  const draftRules = useSafetyRules({ page: 1, limit: 1, status: 'DRAFT' });
  const approvedRules = useSafetyRules({ page: 1, limit: 1, status: 'APPROVED' });
  const approveAll = useApproveAllDraftRules();
  const preflight = useClinicalPreflight(true);
  const draftTotal = draftRules.data?.total ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Clinical review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          After import, promoted rules land as <strong>DRAFT</strong>. Click{' '}
          <strong>Approve All</strong>, then <strong>Publish</strong> to activate them in
          consultations.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Draft rules
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {draftRules.data?.total ?? '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Approved rules
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {approvedRules.data?.total ?? '—'}
            </p>
          </div>
        </div>
        <Button
          className="h-10 min-w-[140px]"
          disabled={approveAll.isPending || !draftTotal}
          onClick={async () => {
            try {
              const result = await approveAll.mutateAsync({});
              toast.success(result.message || `Approved ${result.approved} draft rule(s).`);
              void preflight.refetch();
            } catch (err: unknown) {
              toast.error((err as { message?: string }).message ?? 'Approve All failed');
            }
          }}
        >
          {approveAll.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Approve All
          {draftTotal > 0 ? ` (${draftTotal})` : ''}
        </Button>
      </CardContent>
    </Card>
  );
}

function CandidateReleasePanel() {
  const preflight = useClinicalPreflight(true);
  const publish = usePublishClinicalRelease();
  const terminology = useActiveTerminology();
  const testCases = useClinicalTestCases({ page: 1, limit: 1 });
  const draftRules = useSafetyRules({ page: 1, limit: 1, status: 'DRAFT' });
  const approvedRules = useSafetyRules({ page: 1, limit: 1, status: 'APPROVED' });

  const canPublish =
    preflight.data?.ok !== false &&
    ((approvedRules.data?.total ?? 0) > 0 || (draftRules.data?.total ?? 0) > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" />
          Publish release
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Publish pins an immutable knowledge release for consultation Safety Alert checks.
          Any remaining draft rules are approved automatically at publish time.
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            Draft:{' '}
            <strong className="tabular-nums">{draftRules.data?.total ?? 0}</strong>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            Approved:{' '}
            <strong className="tabular-nums">{approvedRules.data?.total ?? 0}</strong>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            Test cases:{' '}
            <strong className="tabular-nums">{testCases.data?.meta.total ?? 0}</strong>
          </div>
        </div>

        <div className="rounded-lg border border-border px-3 py-2 text-sm">
          Terminology:{' '}
          <strong>
            {terminology.data?.active?.releaseKey ?? 'Not snapped — Resync from CCDD first'}
          </strong>
        </div>

        {preflight.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Running preflight…
          </div>
        ) : (
          <div className="space-y-2">
            {(preflight.data?.checks ?? []).map((check) => (
              <div
                key={check.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  check.ok
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-amber-200 bg-amber-50/70',
                )}
              >
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="font-medium">{check.label}</p>
                  {check.detail ? (
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  ) : null}
                </div>
              </div>
            ))}
            {!preflight.data?.checks?.length ? (
              <p className="text-sm text-muted-foreground">No preflight data yet.</p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => void preflight.refetch()}
            disabled={preflight.isFetching}
          >
            {preflight.isFetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}
            Refresh checks
          </Button>
          <Button
            className="h-10 min-w-[120px]"
            disabled={publish.isPending || !canPublish}
            onClick={async () => {
              try {
                const result = await publish.mutateAsync();
                toast.success(
                  `Published release ${
                    (result as { release?: { version?: string } }).release?.version ?? ''
                  }`,
                );
                void preflight.refetch();
              } catch (err: unknown) {
                toast.error(formatPublishError(err));
                void preflight.refetch();
              }
            }}
          >
            {publish.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-1.5 h-4 w-4" />
            )}
            Publish
          </Button>
        </div>

        {preflight.data && !preflight.data.ok ? (
          <p className="text-xs text-amber-800">
            Fix the failed checks above, then click Publish again. Common fixes: Resync
            terminology, promote your import batch, then Approve All.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TestsPanel() {
  const testCases = useClinicalTestCases({ page: 1, limit: 50 });
  const runTests = useRunClinicalTests();
  const [lastRun, setLastRun] = useState<{
    total: number;
    passed: number;
    failed: number;
    criticalFailed: number;
    ok: boolean;
  } | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TestTube2 className="h-4 w-4 text-primary" />
          Test runs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Optional regression suite against the published cache. Publish itself is gated by the
          golden allergy check, not this suite.
        </p>
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Promoted test cases
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {testCases.data?.meta.total ?? 0}
          </p>
        </div>

        <div className="max-h-56 space-y-1 overflow-auto text-xs">
          {(testCases.data?.data ?? []).map((tc) => (
            <div key={tc.id} className="flex justify-between border-b border-border/40 py-1">
              <span className="max-w-[65%] truncate">{tc.testCaseId}</span>
              <span className="text-muted-foreground">
                {tc.priority} · {tc.safetyDomain}
              </span>
            </div>
          ))}
          {!testCases.data?.data?.length ? (
            <p className="text-muted-foreground">
              No test cases in the repository yet — promote the test_cases batch.
            </p>
          ) : null}
        </div>

        <Button
          disabled={runTests.isPending}
          onClick={async () => {
            const total = testCases.data?.meta.total ?? 0;
            if (!total) {
              toast.warning(
                'No promoted test cases. Open Import Batches and promote test-cases.xlsx first.',
              );
              return;
            }
            try {
              const result = await runTests.mutateAsync();
              setLastRun(result);
              if (result.total === 0) {
                toast.warning('Test runner found 0 cases — promote test cases/inputs first.');
              } else if (result.ok) {
                toast.success(`Tests passed ${result.passed}/${result.total}`);
              } else {
                toast.error(
                  `Tests failed: ${result.failed} failures (${result.criticalFailed} critical)`,
                );
              }
            } catch {
              toast.error('Test run failed');
            }
          }}
        >
          {runTests.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <TestTube2 className="mr-1 h-4 w-4" />
          )}
          Run test suite
        </Button>

        {lastRun ? (
          <p className="text-sm text-muted-foreground">
            Last run: {lastRun.passed}/{lastRun.total} passed
            {lastRun.failed ? ` · ${lastRun.failed} failed` : ''}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ClinicalRepositoryPanel({ mode = 'all' }: { mode?: ClinicalRepoPanelMode }) {
  if (mode === 'batches' || mode === 'validation') {
    return (
      <div className="space-y-4">
        <ImportBatchesTable />
      </div>
    );
  }
  if (mode === 'review') return <ClinicalReviewPanel />;
  if (mode === 'candidate') return <CandidateReleasePanel />;
  if (mode === 'releases') return <ReleaseHistoryPanel compact />;
  if (mode === 'tests') return <TestsPanel />;
  if (mode === 'upload') return <SafetyEngineImportWizard />;

  return (
    <div className="space-y-6">
      <SafetyEngineImportWizard />
    </div>
  );
}
