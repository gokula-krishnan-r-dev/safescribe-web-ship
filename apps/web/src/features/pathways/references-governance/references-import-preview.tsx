'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CLINICAL_USE_TAG_LABELS,
  DOCUMENT_TYPE_LABELS,
  REFERENCE_STATUS_LABELS,
  SECTION_FULL_LABELS,
  type ClinicalUseTagCode,
  type EvidenceDocumentType,
  type EvidenceImportSection,
  type EvidenceReferenceStatus,
} from '@safescript/shared';

export type ReferenceImportAction = 'use_existing' | 'create_new' | 'skip';

export type ReferenceImportPreviewRow = {
  importKey: string;
  citationTitle: string;
  organization: string;
  documentType: string;
  yearEdition?: string | null;
  jurisdiction?: string | null;
  suggestedSections: string[];
  clinicalUseTags?: string[];
  applicablePathways?: string[];
  notes?: string | null;
  documentationReferenceCandidate: boolean;
  verificationRequired: boolean;
  statusAfterImport: string;
  unknownSections: string[];
  warnings: string[];
  blockingErrors: string[];
  match: {
    existingReferenceId: string;
    confidence: 'exact' | 'possible';
    existingStatus?: string | null;
    label: string;
  } | null;
  defaultAction: ReferenceImportAction;
};

export type ReferenceImportPreview = {
  ok: boolean;
  error?: string | null;
  reviewerGovernanceIgnored?: boolean;
  summary: {
    found: number;
    blocking: number;
    verificationRequired: number;
    documentationCandidates: number;
    existingMatches: number;
    newReferences: number;
    sectionCounts: Record<string, number>;
  };
  rows: ReferenceImportPreviewRow[];
};

export function ReferencesImportPreviewStep({
  preview,
  decisions,
  onDecisionChange,
}: {
  preview: ReferenceImportPreview;
  decisions: Record<string, ReferenceImportAction>;
  onDecisionChange: (importKey: string, action: ReferenceImportAction) => void;
}) {
  const sectionSummary = useMemo(() => {
    return Object.entries(preview.summary.sectionCounts ?? {}).map(([key, count]) => ({
      key,
      label: SECTION_FULL_LABELS[key as EvidenceImportSection] ?? key,
      count,
    }));
  }, [preview.summary.sectionCounts]);

  const blockingCount = preview.rows.filter((r) => r.blockingErrors.length > 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 space-y-2 rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {preview.summary.found} reference{preview.summary.found === 1 ? '' : 's'} found
        </p>
        <div className="flex flex-wrap gap-2 text-[12px] text-muted-foreground">
          <span>{preview.summary.existingMatches} existing matches</span>
          <span>·</span>
          <span>{preview.summary.newReferences} new</span>
          <span>·</span>
          <span>{preview.summary.verificationRequired} require verification</span>
          {preview.summary.documentationCandidates > 0 ? (
            <>
              <span>·</span>
              <span>
                {preview.summary.documentationCandidates} documentation candidate
                {preview.summary.documentationCandidates === 1 ? '' : 's'}
              </span>
            </>
          ) : null}
        </div>
        {sectionSummary.length > 0 ? (
          <div className="pt-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Suggested section mappings
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sectionSummary.map((s) => (
                <Badge key={s.key} variant="secondary" className="font-normal">
                  {s.label}: {s.count}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {preview.reviewerGovernanceIgnored ? (
          <p className="flex items-start gap-1.5 text-[12px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Reviewer/governance information was ignored. Reviewer records must be entered
            manually.
          </p>
        ) : null}
        {blockingCount > 0 ? (
          <p className="text-[12px] text-destructive">
            {blockingCount} reference{blockingCount === 1 ? '' : 's'} have blocking errors and
            must be skipped or fixed.
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {preview.rows.map((row) => {
          const action = decisions[row.importKey] ?? row.defaultAction;
          const typeLabel =
            DOCUMENT_TYPE_LABELS[row.documentType as EvidenceDocumentType] ?? row.documentType;
          const statusLabel =
            REFERENCE_STATUS_LABELS[row.statusAfterImport as EvidenceReferenceStatus] ??
            row.statusAfterImport;
          const hasBlock = row.blockingErrors.length > 0;

          return (
            <article
              key={row.importKey}
              className={cn(
                'rounded-xl border px-4 py-3',
                hasBlock ? 'border-destructive/40 bg-destructive/5' : 'border-border/80 bg-card',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground">{row.importKey}</p>
                  <h3 className="text-sm font-semibold text-foreground">{row.citationTitle}</h3>
                  <p className="text-[13px] text-muted-foreground">{row.organization}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {typeLabel}
                    {row.yearEdition ? ` · ${row.yearEdition}` : ''}
                    {row.jurisdiction ? ` · ${row.jurisdiction}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.documentationReferenceCandidate ? (
                    <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">
                      Documentation reference candidate
                    </Badge>
                  ) : null}
                  <Badge variant="outline">{statusLabel}</Badge>
                </div>
              </div>

              {row.suggestedSections.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-[11px] text-muted-foreground">Suggested:</span>
                  {row.suggestedSections.map((section) => (
                    <Badge key={section} variant="secondary" className="font-normal">
                      {SECTION_FULL_LABELS[section as EvidenceImportSection] ?? section}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {row.clinicalUseTags && row.clinicalUseTags.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="text-[11px] text-muted-foreground">Clinical use:</span>
                  {row.clinicalUseTags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-normal">
                      {CLINICAL_USE_TAG_LABELS[tag as ClinicalUseTagCode] ?? tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {row.notes ? (
                <p className="mt-1.5 text-[12px] text-muted-foreground">{row.notes}</p>
              ) : null}

              {row.match ? (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {row.match.label}
                  {row.match.existingStatus === 'verified'
                    ? ' — verified metadata will be kept'
                    : ''}
                </p>
              ) : null}

              {row.blockingErrors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-destructive">
                  {row.blockingErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}

              {row.warnings.length > 0 && !hasBlock ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-amber-800">
                  {row.warnings.slice(0, 3).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ['use_existing', 'Use existing', Boolean(row.match)],
                    ['create_new', 'Create new', true],
                    ['skip', 'Skip', true],
                  ] as const
                ).map(([value, label, enabled]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={action === value ? 'default' : 'outline'}
                    className="h-8"
                    disabled={!enabled || (hasBlock && value !== 'skip')}
                    onClick={() => onDecisionChange(row.importKey, value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function useReferenceImportDecisions(preview: ReferenceImportPreview | null) {
  const [decisions, setDecisions] = useState<Record<string, ReferenceImportAction>>({});

  const syncFromPreview = (next: ReferenceImportPreview) => {
    const initial: Record<string, ReferenceImportAction> = {};
    for (const row of next.rows) {
      initial[row.importKey] = row.blockingErrors.length ? 'skip' : row.defaultAction;
    }
    setDecisions(initial);
  };

  const setDecision = (importKey: string, action: ReferenceImportAction) => {
    setDecisions((prev) => ({ ...prev, [importKey]: action }));
  };

  const decisionPayload = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => ({
      importKey: row.importKey,
      action: decisions[row.importKey] ?? row.defaultAction,
      existingReferenceId: row.match?.existingReferenceId,
    }));
  }, [preview, decisions]);

  return { decisions, setDecision, syncFromPreview, decisionPayload };
}

export function ReferencesImportEmptyHint() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Paste a ChatGPT response using the ## Reference Library format, then click Review import.
    </div>
  );
}
