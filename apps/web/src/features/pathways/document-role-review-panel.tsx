'use client';

import { useMemo, useState, useEffect } from 'react';
import { toast } from '@/lib/notify';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { ClinicalPathway, DocumentRole } from './types';
import { useConfirmDocumentRoles, useExtractConcepts } from './hooks';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<DocumentRole, { label: string; hint: string; className: string }> = {
  PRIMARY: {
    label: 'Primary',
    hint: 'Main document for concept extraction',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  SUPPORTING: {
    label: 'Supporting',
    hint: 'Adds unique clinical information',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  REFERENCE_ONLY: {
    label: 'Reference Only',
    hint: 'Citations / validation — skipped for extraction',
    className: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as DocumentRole[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r].label,
}));

function formatDocType(type?: string | null) {
  if (!type) return 'Unclassified';
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function DocumentRoleReviewPanel({ pathway }: { pathway: ClinicalPathway }) {
  const confirmMutation = useConfirmDocumentRoles(pathway.id);
  const extractMutation = useExtractConcepts(pathway.id);
  const [roles, setRoles] = useState<Record<string, DocumentRole>>({});
  const failedExtract = (pathway.documents ?? []).some((d) => d.processingStatus === 'FAILED');
  const rolesAlreadyConfirmed = (pathway.documents ?? []).every((d) => d.roleConfirmed);
  const busy = confirmMutation.isPending || extractMutation.isPending;

  useEffect(() => {
    const next: Record<string, DocumentRole> = {};
    for (const doc of pathway.documents ?? []) {
      next[doc.id] = doc.role ?? doc.aiSuggestedRole ?? 'SUPPORTING';
    }
    setRoles(next);
  }, [pathway.documents]);

  const overlapsByTarget = useMemo(() => {
    const map = new Map<string, NonNullable<ClinicalPathway['documentOverlaps']>[number]>();
    for (const o of pathway.documentOverlaps ?? []) {
      map.set(o.targetDocumentId, o);
    }
    return map;
  }, [pathway.documentOverlaps]);

  if (pathway.pipelineStage !== 'DOCUMENT_REVIEW') return null;

  const handleConfirm = async () => {
    const assignments = Object.entries(roles).map(([documentId, role]) => ({ documentId, role }));
    const primaryCount = assignments.filter((a) => a.role === 'PRIMARY').length;
    if (primaryCount < 1) {
      toast.error('Select at least one Primary document.');
      return;
    }
    try {
      await confirmMutation.mutateAsync({ roles: assignments, startExtraction: true });
      toast.success('Roles confirmed. Extracting clinical concepts for your review…');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not confirm document roles.');
    }
  };

  const handleRetryExtract = async () => {
    try {
      await extractMutation.mutateAsync();
      toast.success('Retrying concept extraction… this can take a few minutes for multiple docs.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not retry concept extraction.');
    }
  };

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Admin document review</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Confirm recommendations. Primary and Supporting documents are used for concept
            extraction. Reference Only documents are retained for citations and validation.
          </p>
          {failedExtract && (
            <p className="mt-2 text-xs font-medium text-destructive">
              Previous concept extraction failed or timed out. Confirm roles again, or retry
              extraction (multi-doc runs can take several minutes).
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {failedExtract && rolesAlreadyConfirmed && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleRetryExtract}
              disabled={busy}
            >
              {extractMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Retry extraction
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleConfirm}
            disabled={busy}
          >
            {confirmMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Confirm & extract concepts
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {(pathway.documents ?? []).map((doc) => {
          const role = roles[doc.id] ?? 'SUPPORTING';
          const overlap = overlapsByTarget.get(doc.id);
          const meta = ROLE_LABELS[role];
          return (
            <div key={doc.id} className="rounded-lg border bg-background p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{doc.fileName}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {formatDocType(doc.documentType)}
                    </Badge>
                    {doc.authority && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {doc.authority}
                      </Badge>
                    )}
                    {doc.publicationYear && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {doc.publicationYear}
                      </Badge>
                    )}
                    {doc.aiSuggestedRole && (
                      <span className="text-[10px] text-muted-foreground">
                        Suggested: {ROLE_LABELS[doc.aiSuggestedRole].label}
                      </span>
                    )}
                  </div>
                  {doc.classificationMeta?.rationale && (
                    <p className="text-xs text-muted-foreground">{doc.classificationMeta.rationale}</p>
                  )}
                  {overlap && (
                    <p className="text-xs text-muted-foreground">
                      Overlap with primary: {Math.round(overlap.overlapPercent)}% — {overlap.rationale}
                    </p>
                  )}
                </div>

                <div className="w-full sm:w-48 shrink-0 space-y-1.5">
                  <Select
                    className="h-9"
                    options={ROLE_OPTIONS}
                    value={role}
                    onChange={(e) =>
                      setRoles((prev) => ({
                        ...prev,
                        [doc.id]: e.target.value as DocumentRole,
                      }))
                    }
                  />
                  <p className={cn('rounded border px-2 py-1 text-[10px]', meta.className)}>
                    {meta.hint}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
