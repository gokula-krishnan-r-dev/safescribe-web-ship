'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  History,
  Loader2,
  Menu,
  Plus,
  Rocket,
  Upload,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
import {
  DEFAULT_DATASET,
  isDatasetKey,
  DATASET_REGISTRY,
  type DatasetKey,
} from './dataset-registry';
import {
  SafetyEngineSidebar,
  type SafetyEngineNavSelection,
} from './safety-engine-sidebar';
import { RepositoryDatasetPanel } from './repository-dataset-panel';
import { ClinicalReferencePanel } from './clinical-reference-panel';
import { ClinicalRepositoryPanel } from './clinical-repository-panel';
import { TerminologySyncPanel } from './terminology-sync-panel';
import {
  useSafetyRelease,
  useSafetyRules,
} from './hooks';
import {
  useActiveTerminology,
  useClinicalTestCases,
  usePublishClinicalRelease,
  useRenewWorkflowCounts,
} from './clinical-repository-hooks';
import { useReferenceSummary } from './clinical-reference-hooks';

function parseSelection(
  section: string | null,
  dataset: string | null,
  item: string | null,
): SafetyEngineNavSelection {
  if (!section && !dataset) {
    return { section: 'repository', dataset: DEFAULT_DATASET };
  }
  if (section === 'overview') {
    return { section: 'overview' };
  }
  if (section === 'repository' || (!section && dataset)) {
    return {
      section: 'repository',
      dataset: isDatasetKey(dataset) ? dataset : DEFAULT_DATASET,
    };
  }
  if (section === 'terminology') {
    return {
      section: 'terminology',
      item: (item as 'sync' | 'compare' | 'unresolved' | 'history') || 'sync',
    };
  }
  if (section === 'uploads') {
    return {
      section: 'uploads',
      item:
        (item as
          | 'new'
          | 'batches'
          | 'validation'
          | 'review'
          | 'candidate'
          | 'tests'
          | 'releases') || 'new',
    };
  }
  if (section === 'audit') {
    return {
      section: 'audit',
      item: (item as 'log' | 'roles' | 'settings' | 'integration') || 'log',
    };
  }
  return { section: 'repository', dataset: DEFAULT_DATASET };
}

function selectionToParams(selection: SafetyEngineNavSelection): URLSearchParams {
  const params = new URLSearchParams();
  params.set('section', selection.section);
  if (selection.section === 'repository') {
    params.set('dataset', selection.dataset);
  } else if (selection.section !== 'overview') {
    params.set('item', selection.item);
  }
  return params;
}

export function SafetyEnginePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const selection = useMemo(
    () =>
      parseSelection(
        searchParams.get('section'),
        searchParams.get('dataset'),
        searchParams.get('item'),
      ),
    [searchParams],
  );

  const setSelection = useCallback(
    (next: SafetyEngineNavSelection) => {
      const params = selectionToParams(next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setMobileNavOpen(false);
    },
    [pathname, router],
  );

  // Keep URL bookmarkable for the default repository landing view
  useEffect(() => {
    if (!searchParams.get('section') && !searchParams.get('dataset')) {
      const params = selectionToParams({
        section: 'repository',
        dataset: DEFAULT_DATASET,
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on empty URL
  }, []);

  const { data: releaseData } = useSafetyRelease();
  const terminology = useActiveTerminology();
  const testCases = useClinicalTestCases({ page: 1, limit: 1 });
  const publishRelease = usePublishClinicalRelease();
  const renewCounts = useRenewWorkflowCounts();
  const referenceSummary = useReferenceSummary();

  const renalCount = useSafetyRules({ page: 1, limit: 1, ruleType: 'RENAL_EGFR_BAND' });
  const labCount = useSafetyRules({ page: 1, limit: 1, ruleType: 'LAB_THRESHOLD' });
  const allergyCount = useSafetyRules({ page: 1, limit: 1, ruleType: 'ALLERGY_DIRECT' });

  const counts = useMemo(
    () =>
      ({
        'renal-rules': renalCount.data?.total,
        'lab-threshold-rules': labCount.data?.total,
        'allergy-direct-rules': allergyCount.data?.total,
        'test-cases': testCases.data?.meta.total,
        'renew-medication-indications': renewCounts.data?.indications,
        'renew-monitoring-rules': renewCounts.data?.monitoring,
        'renew-input-definitions': renewCounts.data?.inputs,
        'renew-conditional-questions': renewCounts.data?.questions,
        'reference-general-values': referenceSummary.data?.counts.values,
        'reference-treatment-targets': referenceSummary.data?.counts.targets,
        'reference-pediatric': referenceSummary.data?.counts.pediatric,
        'reference-sources': referenceSummary.data?.counts.sources,
      }) as Partial<Record<DatasetKey, number>>,
    [
      renalCount.data?.total,
      labCount.data?.total,
      allergyCount.data?.total,
      testCases.data?.meta.total,
      renewCounts.data,
      referenceSummary.data,
    ],
  );

  const releaseLabel = releaseData?.active?.version;
  const uploadItemTitle =
    selection.section === 'uploads'
      ? selection.item === 'new'
        ? 'New Upload'
        : selection.item === 'batches'
          ? 'Import Batches'
          : selection.item === 'validation'
            ? 'Validation Issues'
            : selection.item === 'review'
              ? 'Clinical Review Queue'
              : selection.item === 'candidate'
                ? 'Candidate Release'
                : selection.item === 'tests'
                  ? 'Test Runs'
                  : selection.item === 'releases'
                    ? 'Release History'
                    : 'Upload & Publish'
      : null;
  const title =
    selection.section === 'overview'
      ? 'Overview'
      : selection.section === 'repository'
        ? 'Repository'
        : selection.section === 'terminology'
          ? 'Terminology'
          : selection.section === 'uploads'
            ? 'Upload & Publish'
            : 'Audit & Settings';

  const handlePublish = async () => {
    try {
      const result = await publishRelease.mutateAsync();
      toast.success(
        `Published release ${
          (result as { release?: { version?: string; ruleCount?: number } }).release?.version ?? ''
        }${
          (result as { release?: { ruleCount?: number } }).release?.ruleCount != null
            ? ` with ${(result as { release: { ruleCount: number } }).release.ruleCount} rules`
            : ''
        }.`,
      );
      setPublishOpen(false);
    } catch (error: unknown) {
      const e = error as {
        message?: string | string[];
        checks?: Array<{ label: string; ok: boolean; detail?: string }>;
      };
      const failed = (e.checks ?? []).filter((c) => !c.ok);
      const base = Array.isArray(e.message)
        ? e.message.join('; ')
        : e.message ?? 'Publish failed.';
      const msg = failed.length
        ? `${base} — ${failed.map((c) => c.label + (c.detail ? `: ${c.detail}` : '')).join(' · ')}`
        : base;
      toast.error(msg);
    }
  };

  const openImport = () => {
    setSelection({ section: 'uploads', item: 'new' });
  };

  return (
    <div className="-mx-4 -my-4 flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden border-t border-border bg-background sm:-mx-6 sm:-my-6 lg:-mx-8">
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <SafetyEngineSidebar
            selection={selection}
            onSelect={setSelection}
            releaseLabel={releaseLabel}
            counts={counts}
            className="h-[calc(100vh-4rem)] sticky top-0"
          />
        </div>

        {/* Mobile drawer */}
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative z-10 h-full w-[280px] bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-semibold">Safety Alert</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SafetyEngineSidebar
                selection={selection}
                onSelect={setSelection}
                releaseLabel={releaseLabel}
                counts={counts}
                className="h-[calc(100%-3rem)] w-full border-0"
              />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Sticky header with Import + Publish */}
          <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 lg:hidden"
                    onClick={() => setMobileNavOpen(true)}
                    aria-label="Open Safety Alert navigation"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Clinical admin · {title}
                    </p>
                    <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      Safety Alert
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      SafeScribe clinical safety repository administration and governance.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 shadow-none"
                  onClick={() => setSelection({ section: 'uploads', item: 'releases' })}
                >
                  <History className="h-4 w-4" />
                  Release history
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 shadow-none"
                  onClick={() => setSelection({ section: 'uploads', item: 'new' })}
                >
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
                <Button
                  type="button"
                  className="h-10 gap-2"
                  onClick={() => setPublishOpen(true)}
                  disabled={publishRelease.isPending}
                >
                  {publishRelease.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Publish
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 gap-2"
                  onClick={() => setSelection({ section: 'uploads', item: 'new' })}
                >
                  <Plus className="h-4 w-4" />
                  Create draft revision
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-[13px]">
              <p className="text-foreground/85">
                <span className="font-semibold text-foreground">Published repository</span> is
                read-only. Import creates drafts only — clinical review and publish are separate.
                {releaseData?.active ? (
                  <>
                    {' '}
                    Active {releaseData.active.version} · {releaseData.active.ruleCount} rules ·{' '}
                    {formatDate(releaseData.active.publishedAt)}
                  </>
                ) : (
                  ' No release published yet.'
                )}
                {terminology.data?.active ? (
                  <>
                    {' '}
                    · Terminology {terminology.data.active.releaseKey || terminology.data.active.ccddVersion}
                  </>
                ) : null}
              </p>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  releaseData?.cache?.ready
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800',
                )}
              >
                {releaseData?.cache?.ready ? 'Runtime cache ready' : 'Cache warming / idle'}
              </span>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {selection.section === 'overview' ? (
              <OverviewPanel
                releaseVersion={releaseLabel}
                ruleCount={releaseData?.active?.ruleCount}
                onOpenDataset={(dataset) =>
                  setSelection({ section: 'repository', dataset })
                }
                onOpenUpload={() => setSelection({ section: 'uploads', item: 'new' })}
              />
            ) : null}

            {selection.section === 'repository' &&
            DATASET_REGISTRY[selection.dataset].source === 'reference-values' ? (
              <ClinicalReferencePanel
                datasetKey={selection.dataset}
                onSelectDataset={(dataset) => setSelection({ section: 'repository', dataset })}
              />
            ) : selection.section === 'repository' ? (
              <RepositoryDatasetPanel
                datasetKey={selection.dataset}
                onOpenImport={openImport}
              />
            ) : null}

            {selection.section === 'uploads' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Upload & publish
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">
                    {uploadItemTitle}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload → Promote → Approve All → Publish. Uploading alone
                    does not insert repository records.
                  </p>
                </div>
                <ClinicalRepositoryPanel
                  mode={
                    selection.item === 'new'
                      ? 'upload'
                      : selection.item === 'batches' || selection.item === 'validation'
                        ? 'batches'
                        : selection.item === 'review'
                          ? 'review'
                          : selection.item === 'candidate' || selection.item === 'releases'
                            ? 'candidate'
                            : selection.item === 'tests'
                              ? 'tests'
                              : 'all'
                  }
                />
              </div>
            ) : null}

            {selection.section === 'terminology' ? (
              <TerminologySyncPanel
                view={
                  selection.item === 'history'
                    ? 'history'
                    : selection.item === 'compare'
                      ? 'compare'
                      : selection.item === 'unresolved'
                        ? 'unresolved'
                        : 'sync'
                }
              />
            ) : null}

            {selection.section === 'audit' ? (
              <PlaceholderPanel
                title="Audit & Settings"
                description="Append-only audit history, role assignments, and repository integration status. Audit events cannot be edited from the UI."
              />
            ) : null}
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish knowledge release?"
        description="Approves remaining drafts, runs preflight checks, then compiles an immutable release and updates the runtime Safety Alert cache."
        confirmLabel="Publish"
        onConfirm={handlePublish}
      />
    </div>
  );
}

function OverviewPanel({
  releaseVersion,
  ruleCount,
  onOpenDataset,
  onOpenUpload,
}: {
  releaseVersion?: string;
  ruleCount?: number;
  onOpenDataset: (dataset: DatasetKey) => void;
  onOpenUpload: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Clinical admin
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect the active safety repository, import governed workbooks, and publish immutable
          releases.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Active release"
          value={releaseVersion ?? 'None'}
          hint={ruleCount != null ? `${ruleCount} rules pinned` : 'Publish to activate'}
        />
        <StatCard label="Governance" value="Upload → Review → Publish" hint="Never edit live content in place" />
        <StatCard label="Runtime" value="Pinned local release" hint="No live CCDD / Excel / LLM calls" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <QuickLink
          title="Reference & Target Values"
          description="Governed lab references, treatment targets, pediatric policy and sources — sibling of safety rules."
          onClick={() => onOpenDataset('reference-target-values')}
        />
        <QuickLink
          title="Lab Thresholds"
          description="Open the clinical safety rules table for lab observation thresholds."
          onClick={() => onOpenDataset('lab-threshold-rules')}
        />
        <QuickLink
          title="Renal Rules"
          description="Review eGFR bands and renal dosing actions."
          onClick={() => onOpenDataset('renal-rules')}
        />
        <QuickLink
          title="Drug Catalogue"
          description="Browse terminology-synced medications (SYNC)."
          onClick={() => onOpenDataset('drugs-catalog')}
        />
        <QuickLink
          title="Import workbook"
          description="Upload a governed .xlsx file into draft staging."
          onClick={onOpenUpload}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function QuickLink({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
    >
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

function PlaceholderPanel({
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        {actionLabel && onAction ? (
          <Button className="mt-3" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
