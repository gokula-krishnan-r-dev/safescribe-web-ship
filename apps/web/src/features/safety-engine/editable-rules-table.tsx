'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Pencil,
  Trash2,
  X,
  Eye,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn, formatDate } from '@/lib/utils';
import { useDeleteSafetyRule, usePatchSafetyRuleVersion } from './hooks';
import type { SafetyRuleListItem, SafetyRuleStatus } from './types';

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MODERATE: 'bg-amber-400',
  LOW: 'bg-sky-500',
  INFO: 'bg-slate-400',
};

const SEVERITIES = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO'] as const;

type EditDraft = {
  medication: string;
  criterion: string;
  action: string;
  severity: string;
};

function SeverityCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          SEVERITY_DOT[value] ?? 'bg-muted-foreground',
        )}
      />
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}

function StatusBadge({ status }: { status?: SafetyRuleStatus | null }) {
  if (!status) return null;
  const styles: Record<SafetyRuleStatus, string> = {
    DRAFT: 'bg-sky-100 text-sky-800 border-sky-200',
    APPROVED: 'bg-violet-100 text-violet-800 border-violet-200',
    PUBLISHED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    SUPERSEDED: 'bg-muted text-muted-foreground border-border',
    RETIRED: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-semibold uppercase tracking-wide', styles[status])}
    >
      {status}
    </Badge>
  );
}

export function rulePrimary(rule: SafetyRuleListItem): string {
  const v = rule.latestVersion;
  if (v?.labDetail?.drugIngredient) return v.labDetail.drugIngredient;
  if (v?.ddiDetail?.drugA) return `${v.ddiDetail.drugA} + ${v.ddiDetail.drugB}`;
  if (v?.renalDetail?.drugName) return v.renalDetail.drugName;
  if (v?.pregnancyDetail?.drugName) return v.pregnancyDetail.drugName;
  if (v?.lactationDetail?.drugName) return v.lactationDetail.drugName;
  if (v?.summary?.trim()) return v.summary.trim();
  return rule.code;
}

export function ruleCriterion(rule: SafetyRuleListItem): string {
  const v = rule.latestVersion;
  if (v?.detail?.trim()) return v.detail.trim();
  if (v?.labDetail) {
    const lab = v.labDetail;
    const unit = lab.expectedUnit ? ` ${lab.expectedUnit}` : '';
    if (lab.thresholdLow != null && lab.thresholdHigh != null) {
      return `${lab.observationDisplay || lab.observationKey} ${lab.comparator} ${lab.thresholdLow}–${lab.thresholdHigh}${unit}`;
    }
    if (lab.thresholdLow != null) {
      return `${lab.observationDisplay || lab.observationKey} ${lab.comparator} ${lab.thresholdLow}${unit}`;
    }
    if (lab.thresholdHigh != null) {
      return `${lab.observationDisplay || lab.observationKey} ${lab.comparator} ${lab.thresholdHigh}${unit}`;
    }
    return lab.observationDisplay || lab.observationKey;
  }
  if (v?.renalDetail) {
    return `eGFR ${v.renalDetail.egfrMin}–${v.renalDetail.egfrMax} mL/min/1.73 m²`;
  }
  if (v?.pregnancyDetail) {
    return `${v.pregnancyDetail.pregnancyCategory} · ${v.pregnancyDetail.trimester}`;
  }
  if (v?.lactationDetail) {
    return v.lactationDetail.lactationRisk;
  }
  if (v?.ddiDetail) {
    return v.ddiDetail.interactionSeverity;
  }
  return v?.matchType || v?.relationshipType || 'Rule criterion';
}

export function ruleAction(rule: SafetyRuleListItem): string {
  const v = rule.latestVersion;
  return (
    v?.recommendedAction?.trim() ||
    v?.labDetail?.missingLabAction ||
    v?.renalDetail?.actionRequired ||
    v?.pregnancyDetail?.actionRequired ||
    v?.lactationDetail?.actionRequired ||
    v?.ddiDetail?.actionRequired ||
    v?.summary ||
    '—'
  );
}

function canEditRow(rule: SafetyRuleListItem): boolean {
  return rule.latestVersion?.status === 'DRAFT';
}

function canDeleteRow(rule: SafetyRuleListItem): boolean {
  const status = rule.latestVersion?.status;
  return status === 'DRAFT' || status === 'APPROVED';
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string | string[] };
  if (Array.isArray(e.message)) return e.message.filter(Boolean).join('; ');
  if (typeof e.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

type Props = {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  rows: SafetyRuleListItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  onPageChange: (p: number) => void;
  onOpen: (id: string) => void;
  emptyAction?: () => void;
  datasetLabel: string;
};

/**
 * Spreadsheet-style safety rules table:
 * - Double-click or Edit → inline row editors
 * - Save / Cancel / Delete with draft-only edit lock
 */
export function EditableRulesTable({
  loading,
  error,
  onRetry,
  rows,
  total,
  page,
  totalPages,
  limit,
  onPageChange,
  onOpen,
  emptyAction,
  datasetLabel,
}: Props) {
  const patch = usePatchSafetyRuleVersion();
  const remove = useDeleteSafetyRule();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafetyRuleListItem | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && firstInputRef.current) {
      firstInputRef.current.focus();
      firstInputRef.current.select();
    }
  }, [editingId]);

  // Leave edit mode if the row leaves the page
  useEffect(() => {
    if (editingId && !rows.some((r) => r.id === editingId)) {
      setEditingId(null);
      setDraft(null);
    }
  }, [rows, editingId]);

  const startEdit = (rule: SafetyRuleListItem) => {
    if (!canEditRow(rule)) {
      toast.message('Only DRAFT rules can be edited inline', {
        description: 'Import a corrected workbook or create a new draft version to change published rules.',
      });
      return;
    }
    setEditingId(rule.id);
    setDraft({
      medication: rulePrimary(rule),
      criterion: ruleCriterion(rule),
      action: ruleAction(rule) === '—' ? '' : ruleAction(rule),
      severity: rule.latestVersion?.clinicalSeverity || 'MODERATE',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async (rule: SafetyRuleListItem) => {
    if (!draft || !rule.latestVersion) return;
    if (!draft.medication.trim()) {
      toast.error('Medication / value set is required');
      return;
    }
    setSavingId(rule.id);
    try {
      await patch.mutateAsync({
        ruleId: rule.id,
        versionId: rule.latestVersion.id,
        data: {
          summary: draft.medication.trim(),
          detail: draft.criterion.trim(),
          recommendedAction: draft.action.trim() || draft.medication.trim(),
          clinicalSeverity: draft.severity as
            | 'CRITICAL'
            | 'HIGH'
            | 'MODERATE'
            | 'LOW'
            | 'INFO',
          changeSummary: 'Inline spreadsheet edit',
        },
      });
      toast.success('Row updated');
      cancelEdit();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not save row'));
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.code}`);
      if (editingId === deleteTarget.id) cancelEdit();
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Could not delete rule'));
    }
  };

  if (error) return <ErrorState title="Could not load rules" onRetry={onRetry} />;
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <EmptyState
        title={`No ${datasetLabel.toLowerCase()} yet`}
        description="Import a governed workbook or publish approved rules to populate this view."
        action={
          emptyAction ? (
            <Button onClick={emptyAction}>Import workbook</Button>
          ) : undefined
        }
      />
    );
  }

  const busy = patch.isPending || remove.isPending;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Double-click a <span className="font-medium text-foreground">DRAFT</span> row to edit
            like a spreadsheet. Published rows stay locked.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Medication / value set</th>
                <th className="px-4 py-3 text-left font-semibold">Clinical criterion</th>
                <th className="px-4 py-3 text-left font-semibold">Clinical action</th>
                <th className="px-4 py-3 text-left font-semibold">Severity</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Review</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => {
                const isEditing = editingId === rule.id && draft;
                const editable = canEditRow(rule);
                const deletable = canDeleteRow(rule);
                const isSaving = savingId === rule.id;

                if (isEditing) {
                  return (
                    <tr
                      key={rule.id}
                      className="border-t border-primary/30 bg-primary/[0.04] ring-1 ring-inset ring-primary/20"
                    >
                      <td className="px-3 py-2 align-top">
                        <Input
                          ref={firstInputRef}
                          value={draft.medication}
                          onChange={(e) =>
                            setDraft({ ...draft, medication: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveEdit(rule);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="h-9 border-primary/30 bg-background text-[13px] shadow-none"
                          disabled={isSaving}
                          aria-label="Medication / value set"
                        />
                        <p className="mt-1 px-0.5 text-[11px] text-muted-foreground">
                          {rule.code}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={draft.criterion}
                          onChange={(e) =>
                            setDraft({ ...draft, criterion: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveEdit(rule);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="h-9 border-primary/30 bg-background text-[13px] shadow-none"
                          disabled={isSaving}
                          aria-label="Clinical criterion"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={draft.action}
                          onChange={(e) =>
                            setDraft({ ...draft, action: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveEdit(rule);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="h-9 border-primary/30 bg-background text-[13px] shadow-none"
                          disabled={isSaving}
                          aria-label="Clinical action"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={draft.severity}
                          onChange={(e) =>
                            setDraft({ ...draft, severity: e.target.value })
                          }
                          className="h-9 w-full rounded-md border border-primary/30 bg-background px-2 text-[13px]"
                          disabled={isSaving}
                          aria-label="Severity"
                        >
                          {SEVERITIES.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0) + s.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <StatusBadge status={rule.latestVersion?.status} />
                      </td>
                      <td className="px-4 py-2 align-middle text-[12px] text-muted-foreground">
                        Editing…
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            className="h-8 px-2.5"
                            disabled={isSaving || busy}
                            onClick={() => void saveEdit(rule)}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1">Save</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            disabled={isSaving}
                            onClick={cancelEdit}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={rule.id}
                    className={cn(
                      'border-t border-border/70 transition-colors',
                      editable
                        ? 'hover:bg-muted/40'
                        : 'hover:bg-muted/20',
                    )}
                    onDoubleClick={() => startEdit(rule)}
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-foreground">{rulePrimary(rule)}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {rule.code} · {rule.ruleType.replace(/_/g, ' ')}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-foreground/90">
                      {ruleCriterion(rule)}
                    </td>
                    <td className="max-w-[220px] px-4 py-3.5 text-[13px] text-foreground/90">
                      <span className="line-clamp-2">{ruleAction(rule)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <SeverityCell value={rule.latestVersion?.clinicalSeverity} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={rule.latestVersion?.status} />
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-muted-foreground">
                      {rule.latestVersion?.publishedAt
                        ? formatDate(rule.latestVersion.publishedAt)
                        : rule.latestVersion?.approvedAt
                          ? formatDate(rule.latestVersion.approvedAt)
                          : '—'}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          title="View details"
                          onClick={() => onOpen(rule.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(
                            'h-8 w-8',
                            editable
                              ? 'text-muted-foreground hover:text-foreground'
                              : 'text-muted-foreground/40',
                          )}
                          title={
                            editable
                              ? 'Edit row'
                              : 'Only DRAFT rows can be edited'
                          }
                          disabled={!editable || busy}
                          onClick={() => startEdit(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(
                            'h-8 w-8',
                            deletable
                              ? 'text-muted-foreground hover:text-destructive'
                              : 'text-muted-foreground/40',
                          )}
                          title={
                            deletable
                              ? 'Delete rule'
                              : 'Published rules cannot be deleted'
                          }
                          disabled={!deletable || busy}
                          onClick={() => setDeleteTarget(rule)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
          <span>
            Showing {rows.length} of {total} {datasetLabel.toLowerCase()}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.code ?? 'rule'}?`}
        description="This permanently removes the rule and all of its draft versions. Published rules cannot be deleted this way."
        confirmLabel="Delete rule"
        variant="destructive"
        loading={remove.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
