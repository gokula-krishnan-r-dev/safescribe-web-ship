'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatDate } from '@/lib/utils';
import {
  useClinicalReleases,
  useRestoreClinicalRelease,
  type KnowledgeReleaseRow,
} from './clinical-repository-hooks';

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string | string[] };
  if (Array.isArray(e.message)) return e.message.filter(Boolean).join('; ');
  if (typeof e.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

type Props = {
  /** When true, render as a compact card for embedding in the upload wizard */
  compact?: boolean;
  onClose?: () => void;
};

export function ReleaseHistoryPanel({ compact = false, onClose }: Props) {
  const [page, setPage] = useState(1);
  const releases = useClinicalReleases({ page, limit: 12 });
  const restore = useRestoreClinicalRelease();

  const [target, setTarget] = useState<KnowledgeReleaseRow | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [reason, setReason] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const openRestore = (row: KnowledgeReleaseRow) => {
    setTarget(row);
    setConfirmCode('');
    setReason('');
    setDialogOpen(true);
  };

  const handleRestore = async () => {
    if (!target) return;
    if (confirmCode.trim() !== target.version) {
      toast.error(`Type the exact release code ${target.version} to confirm`);
      return;
    }
    try {
      const result = await restore.mutateAsync({
        releaseId: target.id,
        reason: reason.trim() || undefined,
      });
      toast.success(result.message || `Restored ${target.version}`);
      setDialogOpen(false);
      setTarget(null);
      void releases.refetch();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Restore failed'));
    }
  };

  const rows = releases.data?.data ?? [];
  const meta = releases.data?.meta;

  return (
    <div className={cn('space-y-4', compact && 'rounded-2xl border border-border bg-card p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <History className="h-5 w-5 text-primary" />
            Release history
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Every publish creates an immutable knowledge release. Restore reactivates a prior
            version without rewriting history.
          </p>
        </div>
        {onClose ? (
          <Button variant="outline" size="sm" className="h-9" onClick={onClose}>
            Back to upload
          </Button>
        ) : null}
      </div>

      {releases.isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading releases…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No releases yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish your first Safety Alert update to start version history.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                'flex flex-wrap items-center gap-3 px-4 py-3.5',
                row.isActive && 'bg-primary/[0.03]',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold tabular-nums text-foreground">{row.version}</p>
                  {row.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Archived
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.ruleCount} rule{row.ruleCount === 1 ? '' : 's'} ·{' '}
                  {formatDate(row.publishedAt)}
                  {row.publishedBy
                    ? ` · ${row.publishedBy.firstName} ${row.publishedBy.lastName}`
                    : ''}
                  {row.priorRelease ? ` · from ${row.priorRelease.version}` : ''}
                </p>
                {row.releaseNotes ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {row.releaseNotes}
                  </p>
                ) : null}
              </div>
              {row.canRestore ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0"
                  disabled={restore.isPending}
                  onClick={() => openRestore(row)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Restore
                </Button>
              ) : (
                <span className="text-xs font-medium text-emerald-700">Live</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || releases.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= meta.totalPages || releases.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {/* Typed confirmation for restore */}
      {dialogOpen && target ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => !restore.isPending && setDialogOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-4 p-6">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">Restore {target.version}?</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    This reactivates the immutable prior release for live consultations. The current
                    active release stays in history and can be restored later.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="restore-code">
                  Type <span className="font-mono text-foreground">{target.version}</span> to confirm
                </Label>
                <Input
                  id="restore-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder={target.version}
                  autoComplete="off"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="restore-reason">Reason (optional)</Label>
                <Textarea
                  id="restore-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you rolling back?"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    restore.isPending || confirmCode.trim() !== target.version
                  }
                  onClick={() => void handleRestore()}
                >
                  {restore.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                  )}
                  Restore release
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
