'use client';

import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  History,
  Loader2,
  MoreVertical,
  Rocket,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import { useSafetyRules } from './hooks';
import {
  useClinicalPreflight,
  usePromoteClinicalImport,
  usePublishClinicalRelease,
  useUploadClinicalWorkbook,
  type ClinicalIssueSummary,
  type ClinicalUploadResult,
} from './clinical-repository-hooks';
import { ReleaseHistoryPanel } from './release-history-panel';
import { summariesForUpload } from './import-issue-utils';

type QueueStatus =
  | 'queued'
  | 'uploading'
  | 'validated'
  | 'error'
  | 'promoting'
  | 'promoted'
  | 'failed';

type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  message?: string;
  result?: ClinicalUploadResult;
};

type WizardStep = 1 | 2 | 3;

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Upload & check' },
  { id: 2, label: 'Review changes' },
  { id: 3, label: 'Approve & publish' },
];

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string | string[] };
  if (Array.isArray(e.message)) return e.message.filter(Boolean).join('; ');
  if (typeof e.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function isXlsx(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx');
}

function renewPromoteRank(fileType?: string) {
  if (fileType === 'renew_input_definitions') return 0;
  if (fileType === 'renew_monitoring_rules') return 2;
  return 1;
}

/**
 * Three-step Upload & Publish wizard:
 * 1) Upload & validate · 2) Review & promote · 3) Approve & publish
 * with versioned Release history (restore).
 */
export function SafetyEngineImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedIssuesId, setExpandedIssuesId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [acknowledgedWarningIds, setAcknowledgedWarningIds] = useState<Record<string, boolean>>(
    {},
  );

  const upload = useUploadClinicalWorkbook();
  const promote = usePromoteClinicalImport();
  const publish = usePublishClinicalRelease();
  const preflight = useClinicalPreflight(step === 3);
  const draftRules = useSafetyRules({ page: 1, limit: 1, status: 'DRAFT' });
  const approvedRules = useSafetyRules({ page: 1, limit: 1, status: 'APPROVED' });

  const queueBusy = queue.some((q) => q.status === 'uploading' || q.status === 'promoting');
  const busy =
    upload.isPending ||
    promote.isPending ||
    publish.isPending ||
    queueBusy;

  const draftTotal = draftRules.data?.total ?? 0;
  const approvedTotal = approvedRules.data?.total ?? 0;

  const summary = useMemo(() => {
    const files = queue.length;
    let records = 0;
    let ready = 0;
    let affected = 0;
    for (const item of queue) {
      if (!item.result) continue;
      records += item.result.counts.total;
      if (item.status === 'error' || item.status === 'failed') {
        affected += item.result.counts.errors || 1;
      } else if (
        item.status === 'validated' ||
        item.status === 'promoted' ||
        item.result.status === 'IMPORTED'
      ) {
        ready += item.result.counts.valid;
      }
    }
    return { files, records, ready, affected };
  }, [queue]);

  const hasBlockingErrors = queue.some(
    (q) =>
      q.status === 'error' ||
      q.status === 'failed' ||
      (q.result?.counts.errors ?? 0) > 0,
  );
  const hasUnresolvedWarnings = queue.some(
    (q) =>
      (q.result?.counts.warnings ?? 0) > 0 &&
      (q.result?.counts.errors ?? 0) === 0 &&
      q.status !== 'error' &&
      q.status !== 'failed' &&
      !acknowledgedWarningIds[q.id],
  );
  const hasValidated = queue.some(
    (q) =>
      (q.status === 'validated' || q.status === 'promoted') &&
      q.result &&
      q.result.counts.errors === 0,
  );
  const readyToPromote = queue.filter(
    (q) =>
      q.status === 'validated' &&
      q.result &&
      q.result.counts.errors === 0 &&
      q.result.status !== 'IMPORTED',
  );
  const allPromotedOrImported =
    queue.length > 0 &&
    queue.every(
      (q) =>
        q.status === 'promoted' ||
        q.result?.status === 'IMPORTED' ||
        q.result?.idempotent,
    );

  const attentionItems = useMemo(() => {
    return queue
      .filter((q) => q.result && ((q.result.counts.errors ?? 0) > 0 || (q.result.counts.warnings ?? 0) > 0))
      .map((q) => {
        const summaries = summariesForUpload(q.result!);
        const errors = q.result!.counts.errors;
        const warnings = q.result!.counts.warnings;
        return {
          id: q.id,
          filename: q.file.name,
          errors,
          warnings,
          summaries,
          acknowledged: Boolean(acknowledgedWarningIds[q.id]),
          kind: (errors > 0 ? 'error' : 'warning') as 'error' | 'warning',
        };
      });
  }, [queue, acknowledgedWarningIds]);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const processQueue = async (items: QueueItem[]) => {
    for (const item of items) {
      updateItem(item.id, { status: 'uploading', message: 'Validating workbook…' });
      setSelectedId(item.id);
      try {
        const result = await upload.mutateAsync(item.file);
        const hasErrors = result.counts.errors > 0;
        updateItem(item.id, {
          status: hasErrors ? 'error' : 'validated',
          result,
          message: hasErrors
            ? `${result.counts.errors} validation error(s)`
            : result.idempotent
              ? result.message || 'Already imported (identical file)'
              : `${result.counts.valid} valid row(s)`,
        });
        if (hasErrors) {
          toast.error(`${item.file.name}: ${result.counts.errors} error(s) — fix and re-upload`);
        } else {
          toast.success(
            `${item.file.name}: validated as ${result.fileType}${
              result.idempotent ? ' (already imported)' : ''
            }`,
          );
        }
      } catch (err: unknown) {
        const msg = errorMessage(err, `Failed to upload ${item.file.name}`);
        updateItem(item.id, { status: 'failed', message: msg });
        toast.error(msg);
      }
    }
  };

  const enqueueFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => {
      const ok = isXlsx(f);
      if (!ok) toast.error(`${f.name}: only .xlsx repository files are accepted`);
      return ok;
    });
    if (!list.length) return;

    const items: QueueItem[] = list.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: 'queued' as const,
    }));
    setQueue((prev) => [...prev, ...items]);
    setSelectedId(items[items.length - 1]?.id ?? null);
    void processQueue(items);
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (expandedIssuesId === id) setExpandedIssuesId(null);
    setMenuOpenId(null);
  };

  const clearAll = () => {
    setQueue([]);
    setSelectedId(null);
    setExpandedIssuesId(null);
    setMenuOpenId(null);
    setAcknowledgedWarningIds({});
    setStep(1);
  };

  const promoteOne = async (item: QueueItem) => {
    if (!item.result?.batchId) return;
    if (item.result.counts.errors > 0) {
      toast.error('Cannot promote: batch still has validation errors');
      return;
    }
    if (item.result.status === 'IMPORTED' || item.status === 'promoted') return;
    updateItem(item.id, { status: 'promoting', message: 'Creating draft records…' });
    try {
      try {
        await promote.mutateAsync(item.result.batchId);
      } catch (err: unknown) {
        if ((err as { statusCode?: number }).statusCode === 504) {
          await promote.mutateAsync(item.result.batchId);
        } else {
          throw err;
        }
      }
      updateItem(item.id, {
        status: 'promoted',
        message: 'Promoted to drafts',
        result: { ...item.result, status: 'IMPORTED' },
      });
      toast.success(`${item.file.name}: promoted to draft repository`);
      void draftRules.refetch();
    } catch (err: unknown) {
      const message = errorMessage(err, 'Promote failed');
      updateItem(item.id, {
        status: 'validated',
        message,
      });
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 504) {
        toast.warning(`${item.file.name}: ${message}`);
      } else {
        toast.error(`${item.file.name}: ${message}`);
      }
    }
  };

  const promoteAllReady = async () => {
    const targets = [...readyToPromote].sort(
      (a, b) => renewPromoteRank(a.result?.fileType) - renewPromoteRank(b.result?.fileType),
    );
    if (!targets.length) {
      toast.message('All validated files are already promoted');
      return;
    }
    for (const item of targets) {
      await promoteOne(item);
    }
    void preflight.refetch();
  };

  const goToReview = async () => {
    if (!hasValidated || hasBlockingErrors || hasUnresolvedWarnings) return;
    setStep(2);
    if (readyToPromote.length) {
      await promoteAllReady();
    }
  };

  const goToPublish = () => {
    setStep(3);
    void preflight.refetch();
    void draftRules.refetch();
    void approvedRules.refetch();
  };

  const handlePublish = async () => {
    try {
      let result: unknown;
      try {
        result = await publish.mutateAsync({
          releaseNotes: releaseNotes.trim() || undefined,
        });
      } catch (err: unknown) {
        if ((err as { statusCode?: number }).statusCode === 504) {
          result = await publish.mutateAsync({
            releaseNotes: releaseNotes.trim() || undefined,
          });
        } else {
          throw err;
        }
      }
      toast.success(
        `Published ${
          (result as { release?: { version?: string } }).release?.version ?? 'release'
        }`,
      );
      setPublishConfirmOpen(false);
      setReleaseNotes('');
      void draftRules.refetch();
      void approvedRules.refetch();
      void preflight.refetch();
      setShowHistory(true);
    } catch (err: unknown) {
      const e = err as {
        message?: string | string[];
        checks?: Array<{ label: string; ok: boolean; detail?: string }>;
      };
      const failed = (e.checks ?? []).filter((c) => !c.ok);
      const base = errorMessage(err, 'Publish failed');
      toast.error(
        failed.length
          ? `${base} — ${failed.map((c) => c.label + (c.detail ? `: ${c.detail}` : '')).join(' · ')}`
          : base,
      );
      void preflight.refetch();
    }
  };

  if (showHistory) {
    return (
      <ReleaseHistoryPanel compact onClose={() => setShowHistory(false)} />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Upload & Publish
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          onClick={() => setShowHistory(true)}
        >
          <History className="h-4 w-4" />
          Release history
        </button>
      </div>

      {/* Stepper */}
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <ol className="flex flex-wrap items-center gap-0">
          {STEPS.map((s, idx) => {
            const active = step === s.id;
            const done = step > s.id;
            return (
              <li key={s.id} className="flex items-center">
                <button
                  type="button"
                  disabled={s.id > step || (s.id === 2 && (!hasValidated || hasBlockingErrors))}
                  onClick={() => {
                    if (s.id < step) setStep(s.id);
                    else if (s.id === 2 && hasValidated && !hasBlockingErrors) setStep(2);
                    else if (s.id === 3 && (allPromotedOrImported || draftTotal + approvedTotal > 0))
                      setStep(3);
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors',
                    active || done ? 'text-foreground' : 'text-muted-foreground',
                    s.id < step && 'hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      active || done
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                  </span>
                  <span
                    className={cn(
                      'text-sm',
                      active ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {s.label}
                  </span>
                </button>
                {idx < STEPS.length - 1 ? (
                  <span
                    className={cn(
                      'mx-3 hidden h-px w-10 sm:mx-4 sm:block sm:w-14',
                      step > s.id ? 'bg-primary/40' : 'bg-border',
                    )}
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step body */}
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {step === 1 ? (
          <StepUpload
            busy={busy}
            dragOver={dragOver}
            setDragOver={setDragOver}
            fileRef={fileRef}
            enqueueFiles={enqueueFiles}
            queue={queue}
            summary={summary}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            menuOpenId={menuOpenId}
            setMenuOpenId={setMenuOpenId}
            removeItem={removeItem}
            expandedIssuesId={expandedIssuesId}
            setExpandedIssuesId={setExpandedIssuesId}
            attentionItems={attentionItems}
            hasBlockingErrors={hasBlockingErrors}
            hasUnresolvedWarnings={hasUnresolvedWarnings}
            hasValidated={hasValidated}
            clearAll={clearAll}
            onAcknowledgeWarnings={(id) =>
              setAcknowledgedWarningIds((prev) => ({ ...prev, [id]: true }))
            }
            onAcknowledgeAllWarnings={() => {
              const next: Record<string, boolean> = { ...acknowledgedWarningIds };
              for (const item of attentionItems) {
                if (item.kind === 'warning') next[item.id] = true;
              }
              setAcknowledgedWarningIds(next);
            }}
            onContinue={() => void goToReview()}
          />
        ) : null}

        {step === 2 ? (
          <StepReview
            queue={queue}
            draftTotal={draftTotal}
            approvedTotal={approvedTotal}
            readyToPromote={readyToPromote.length}
            promoting={promote.isPending || queue.some((q) => q.status === 'promoting')}
            busy={queueBusy || promote.isPending}
            onBack={() => setStep(1)}
            onPromoteRemaining={() => void promoteAllReady()}
            onContinue={goToPublish}
          />
        ) : null}

        {step === 3 ? (
          <StepPublish
            draftTotal={draftTotal}
            approvedTotal={approvedTotal}
            preflight={preflight}
            releaseNotes={releaseNotes}
            setReleaseNotes={setReleaseNotes}
            busy={busy}
            onBack={() => setStep(2)}
            onPublish={() => setPublishConfirmOpen(true)}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        title="Approve & publish this update?"
        description="This creates a new immutable knowledge release and activates it for live consultations. You can restore a prior version from Release history if needed."
        confirmLabel="Publish now"
        cancelLabel="Cancel"
        variant="default"
        loading={publish.isPending}
        onConfirm={() => void handlePublish()}
      />
    </div>
  );
}

/* ───────────────────────── Step 1 ───────────────────────── */

function StepUpload({
  busy,
  dragOver,
  setDragOver,
  fileRef,
  enqueueFiles,
  queue,
  summary,
  selectedId,
  setSelectedId,
  menuOpenId,
  setMenuOpenId,
  removeItem,
  expandedIssuesId,
  setExpandedIssuesId,
  attentionItems,
  hasBlockingErrors,
  hasUnresolvedWarnings,
  hasValidated,
  clearAll,
  onAcknowledgeWarnings,
  onAcknowledgeAllWarnings,
  onContinue,
}: {
  busy: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  enqueueFiles: (files: FileList | File[] | null) => void;
  queue: QueueItem[];
  summary: { files: number; records: number; ready: number; affected: number };
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  removeItem: (id: string) => void;
  expandedIssuesId: string | null;
  setExpandedIssuesId: (id: string | null) => void;
  attentionItems: Array<{
    id: string;
    filename: string;
    errors: number;
    warnings: number;
    summaries: ClinicalIssueSummary[];
    acknowledged: boolean;
    kind: 'error' | 'warning';
  }>;
  hasBlockingErrors: boolean;
  hasUnresolvedWarnings: boolean;
  hasValidated: boolean;
  clearAll: () => void;
  onAcknowledgeWarnings: (id: string) => void;
  onAcknowledgeAllWarnings: () => void;
  onContinue: () => void;
}) {
  const canContinue =
    hasValidated && !hasBlockingErrors && !hasUnresolvedWarnings && !busy && queue.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Upload spreadsheets</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload one or more approved repository files. Nothing changes in the live system until
          the complete update is approved and published.
        </p>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload clinical workbook"
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-primary/35 bg-primary/[0.02] hover:border-primary/55 hover:bg-primary/[0.04]',
          busy && 'pointer-events-none opacity-70',
        )}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          enqueueFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="hidden"
          onChange={(e) => {
            enqueueFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {busy && queue.some((q) => q.status === 'uploading') ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        ) : (
          <CloudUpload className="mx-auto h-10 w-10 text-primary" strokeWidth={1.5} />
        )}
        <p className="mt-3 text-sm text-foreground">
          Drop spreadsheets here or{' '}
          <span className="font-semibold text-primary">browse files</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          XLSX · Clinical safety rules or Renew workflow workbooks · Multiple files · Max 15 MB each
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          For Renew monitoring rules, upload input definitions in the same session or first.
        </p>
      </div>

      {/* Uploaded files */}
      {queue.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Uploaded files ({queue.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              {summary.files} file{summary.files === 1 ? '' : 's'} · {summary.records} records ·{' '}
              {summary.ready} ready
              {summary.affected > 0 ? ` · ${summary.affected} affected` : ''}
            </p>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {queue.map((item) => {
              const attention = attentionItems.find((a) => a.id === item.id);
              const needsAttention =
                item.status === 'error' ||
                item.status === 'failed' ||
                (attention && !attention.acknowledged);
              const isReady =
                !needsAttention &&
                (item.status === 'validated' ||
                  item.status === 'promoted' ||
                  item.result?.status === 'IMPORTED');
              const isWorking =
                item.status === 'uploading' ||
                item.status === 'promoting' ||
                item.status === 'queued';

              return (
                <li key={item.id} className="relative">
                  <div
                    className={cn(
                      'flex items-center gap-3 px-4 py-3.5',
                      selectedId === item.id && 'bg-muted/30',
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.file.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.result
                            ? `${item.result.counts.total} record${item.result.counts.total === 1 ? '' : 's'}`
                            : `${(item.file.size / 1024).toFixed(0)} KB`}
                          {item.result?.fileType ? ` · ${item.result.fileType}` : ''}
                        </p>
                      </div>
                    </button>

                    {isWorking ? (
                      <Badge variant="outline" className="shrink-0 gap-1 border-sky-200 text-sky-800">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Checking
                      </Badge>
                    ) : needsAttention ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedIssuesId(expandedIssuesId === item.id ? null : item.id)
                        }
                      >
                        <Badge className="shrink-0 gap-1 bg-amber-100 text-amber-900 hover:bg-amber-200">
                          <AlertTriangle className="h-3 w-3" />
                          Needs attention
                        </Badge>
                      </button>
                    ) : isReady ? (
                      <Badge className="shrink-0 gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        <CheckCircle2 className="h-4 w-4" />
                        Ready
                      </Badge>
                    ) : null}

                    <div className="relative shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="File actions"
                        onClick={() =>
                          setMenuOpenId(menuOpenId === item.id ? null : item.id)
                        }
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {menuOpenId === item.id ? (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
                            {needsAttention && item.result ? (
                              <button
                                type="button"
                                className="flex w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                onClick={() => {
                                  setExpandedIssuesId(
                                    expandedIssuesId === item.id ? null : item.id,
                                  );
                                  setMenuOpenId(null);
                                }}
                              >
                                View issues
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Attention panel */}
      {attentionItems.some((a) => !a.acknowledged) ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3.5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-semibold text-amber-950">
                {hasBlockingErrors
                  ? 'Required issues must be resolved'
                  : 'Warnings need a pharmacist override to continue'}
              </p>
              {attentionItems
                .filter((b) => !b.acknowledged)
                .map((b) => (
                  <div key={b.id} className="space-y-2">
                    <p className="text-sm text-amber-900/90">
                      <span className="font-medium">{b.filename}</span>
                      {b.errors > 0
                        ? ` · ${b.errors} error${b.errors === 1 ? '' : 's'} — fix or skip this file`
                        : ` · ${b.warnings} warning${b.warnings === 1 ? '' : 's'} — drafts can still be created`}
                    </p>
                    <div className="space-y-2 rounded-lg border border-amber-200/80 bg-white/80 p-2.5 text-xs text-amber-950">
                      {b.summaries.map((s) => (
                        <div key={`${s.severity}-${s.code}`} className="space-y-0.5">
                          <p className="font-semibold">
                            {s.count} row{s.count === 1 ? '' : 's'} · {s.code.replace(/_/g, ' ')}
                          </p>
                          <p className="text-amber-900/80">{s.reason || s.message}</p>
                          {s.sampleRows.length ? (
                            <p className="text-muted-foreground">
                              Sample rows: {s.sampleRows.join(', ')}
                              {s.count > s.sampleRows.length ? '…' : ''}
                            </p>
                          ) : null}
                          {s.suggestedFix ? (
                            <p className="text-muted-foreground">Fix: {s.suggestedFix}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {b.kind === 'warning' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => onAcknowledgeWarnings(b.id)}
                        >
                          Override warnings and continue
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => removeItem(b.id)}
                        >
                          Skip this file
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              {attentionItems.some((a) => a.kind === 'warning' && !a.acknowledged) &&
              !hasBlockingErrors ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={onAcknowledgeAllWarnings}
                >
                  Override all warnings
                </Button>
              ) : null}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-900"
              aria-label="Dismiss detail"
              onClick={() => setExpandedIssuesId(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          className={cn(
            'text-sm font-medium text-primary hover:underline',
            (!queue.length || busy) && 'pointer-events-none opacity-40',
          )}
          disabled={!queue.length || busy}
          onClick={clearAll}
        >
          Remove all files
        </button>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            className="h-10 min-w-[150px]"
            disabled={!canContinue}
            onClick={onContinue}
          >
            Review changes
          </Button>
          {!canContinue && queue.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {busy
                ? 'Validating files…'
                : hasBlockingErrors
                  ? 'Fix or skip files with errors before continuing.'
                  : hasUnresolvedWarnings
                    ? 'Review warnings and override to continue.'
                    : 'Wait for validation to finish.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Step 2 ───────────────────────── */

function StepReview({
  queue,
  draftTotal,
  approvedTotal,
  readyToPromote,
  promoting,
  busy,
  onBack,
  onPromoteRemaining,
  onContinue,
}: {
  queue: QueueItem[];
  draftTotal: number;
  approvedTotal: number;
  readyToPromote: number;
  promoting: boolean;
  busy: boolean;
  onBack: () => void;
  onPromoteRemaining: () => void;
  onContinue: () => void;
}) {
  const readyFiles = queue.filter(
    (q) =>
      q.result &&
      q.result.counts.errors === 0 &&
      (q.status === 'validated' ||
        q.status === 'promoted' ||
        q.result.status === 'IMPORTED'),
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Review changes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Validated workbooks are promoted into draft repository records. Review the summary,
          then continue to approve and publish.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Files in batch" value={readyFiles.length} />
        <StatCard label="Draft rules" value={draftTotal} />
        <StatCard label="Approved rules" value={approvedTotal} />
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {readyFiles.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.file.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.result?.fileType} · {item.result?.counts.valid} valid ·{' '}
                {item.result?.counts.warnings ?? 0} warnings
              </p>
            </div>
            <Badge
              className={cn(
                item.status === 'promoted' || item.result?.status === 'IMPORTED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-sky-100 text-sky-800',
              )}
            >
              {item.status === 'promoted' || item.result?.status === 'IMPORTED'
                ? 'Promoted'
                : item.status === 'promoting'
                  ? 'Promoting…'
                  : 'Ready'}
            </Badge>
          </li>
        ))}
        {!readyFiles.length ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No validated files to review. Go back and upload workbooks.
          </li>
        ) : null}
      </ul>

      {readyToPromote > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
          {readyToPromote} file{readyToPromote === 1 ? '' : 's'} still need promoting into drafts.
          <Button
            size="sm"
            variant="outline"
            className="ml-3 h-8"
            disabled={busy}
            onClick={onPromoteRemaining}
          >
            {promoting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Promote remaining
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" className="h-10" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            className="h-10 min-w-[180px]"
            disabled={busy || !readyFiles.length || readyToPromote > 0}
            onClick={onContinue}
          >
            Continue to publish
          </Button>
          {busy || readyToPromote > 0 ? (
            <p className="text-xs text-muted-foreground">
              {busy
                ? 'Still promoting files into drafts…'
                : `${readyToPromote} file${readyToPromote === 1 ? '' : 's'} still need promoting.`}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Step 3 ───────────────────────── */

function StepPublish({
  draftTotal,
  approvedTotal,
  preflight,
  releaseNotes,
  setReleaseNotes,
  busy,
  onBack,
  onPublish,
}: {
  draftTotal: number;
  approvedTotal: number;
  preflight: ReturnType<typeof useClinicalPreflight>;
  releaseNotes: string;
  setReleaseNotes: (v: string) => void;
  busy: boolean;
  onBack: () => void;
  onPublish: () => void;
}) {
  const canPublish =
    preflight.data?.ok !== false && (draftTotal > 0 || approvedTotal > 0) && !busy;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Approve & publish</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Publishing creates an immutable knowledge release and activates it for consultations.
          Remaining drafts are approved automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Draft rules" value={draftTotal} />
        <StatCard label="Approved rules" value={approvedTotal} />
        <StatCard
          label="Preflight"
          value={
            preflight.isLoading ? '…' : preflight.data?.ok ? 'Ready' : 'Blocked'
          }
        />
      </div>

      {preflight.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Running preflight checks…
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(preflight.data?.checks ?? []).map((check) => (
            <div
              key={check.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
                check.ok
                  ? 'border-emerald-200 bg-emerald-50/50'
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
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="release-notes">Release notes (optional)</Label>
        <Textarea
          id="release-notes"
          value={releaseNotes}
          onChange={(e) => setReleaseNotes(e.target.value)}
          placeholder="Briefly describe what changed in this Safety Alert update…"
          rows={3}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="outline" className="h-10" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            className="h-10 min-w-[170px]"
            disabled={!canPublish}
            onClick={onPublish}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-1.5 h-4 w-4" />
            )}
            Approve & publish
          </Button>
          {!canPublish && !busy ? (
            <p className="text-xs text-muted-foreground">
              {preflight.data?.ok === false
                ? 'Resolve preflight issues before publishing.'
                : draftTotal + approvedTotal === 0
                  ? 'Promote validated files before publishing.'
                  : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
