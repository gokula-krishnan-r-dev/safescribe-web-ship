'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TreatmentsImportPreview = {
  ok: boolean;
  error?: string | null;
  format: 'structured' | 'legacy' | 'unstructured';
  existingItemCount: number;
  approvedItemCount?: number;
  libraryLinkedCount?: number;
  blockingErrors: string[];
  warnings: string[];
  summary: {
    items: number;
    itemsWithReferences: number;
    sectionEvidence: number;
    references: number;
    matchedExisting: number;
    newSources: number;
    verificationRequired: number;
    structuredEgfrRules: number;
    renalMappingReview: number;
    issueCount: number;
  };
  items: Array<{
    importKey: string;
    medicationName: string;
    importedReferenceIds: string[];
    renalMappingReviewRequired?: boolean;
    structuredRenalRuleCount?: number;
    exactDuplicate?: boolean;
    warnings: string[];
    blockingErrors: string[];
  }>;
  references: Array<{
    importKey: string;
    citationTitle: string;
    verificationRequired: boolean;
    match: { label: string; confidence: 'exact' | 'possible'; existingReferenceId?: string } | null;
    defaultAction: 'use_existing' | 'create_new' | 'skip';
    warnings: string[];
    blockingErrors: string[];
  }>;
};

export function TreatmentsImportPreview({ preview }: { preview: TreatmentsImportPreview }) {
  const blocking = preview.blockingErrors.length;
  const { summary } = preview;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 pb-4 sm:px-6">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold">Treatment Options</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {summary.items} treatment{summary.items === 1 ? '' : 's'}
        </p>
        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Treatment evidence</dt>
            <dd className="font-medium">
              {summary.itemsWithReferences}/{summary.items} have linked references
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Section evidence</dt>
            <dd className="font-medium">
              {summary.sectionEvidence} reference{summary.sectionEvidence === 1 ? '' : 's'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Reference library</dt>
            <dd className="font-medium">
              {summary.references} source{summary.references === 1 ? '' : 's'}
            </dd>
          </div>
        </dl>
        {summary.references > 0 ? (
          <ul className="mt-2 space-y-0.5 text-[12px] text-muted-foreground">
            <li>
              • {summary.matchedExisting} matched existing source
              {summary.matchedExisting === 1 ? '' : 's'}
            </li>
            <li>
              • {summary.newSources} new source{summary.newSources === 1 ? '' : 's'} — review required
            </li>
            {summary.verificationRequired > 0 ? (
              <li>
                • {summary.verificationRequired} new source
                {summary.verificationRequired === 1 ? '' : 's'} — verification required
              </li>
            ) : null}
          </ul>
        ) : null}
        <p className="mt-3 text-[12px] font-medium text-foreground">Renal rules</p>
        <ul className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
          <li>
            • {summary.structuredEgfrRules} treatment
            {summary.structuredEgfrRules === 1 ? '' : 's'} have structured eGFR rules
          </li>
          {summary.renalMappingReview > 0 ? (
            <li>
              • {summary.renalMappingReview} renal mapping
              {summary.renalMappingReview === 1 ? '' : 's'} require{summary.renalMappingReview === 1 ? 's' : ''}{' '}
              review
            </li>
          ) : null}
        </ul>
        {blocking > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 text-[12.5px] font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {blocking} issue{blocking === 1 ? '' : 's'} require attention
          </p>
        ) : summary.issueCount > 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Imported treatments will enter Needs review. Unverified eGFR rules stay inactive.
          </p>
        ) : null}
      </div>

      {preview.format === 'unstructured' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          Content looks unstructured. Paste structured ChatGPT output instead. References were not
          inferred.
        </p>
      ) : null}

      {preview.format === 'legacy' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          Legacy treatment script. Central references were not invented. Prefer the structured format
          with a Reference Library.
        </p>
      ) : null}

      {preview.blockingErrors.length ? (
        <ul className="space-y-1 text-[12.5px] text-destructive">
          {preview.blockingErrors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {preview.items.some((item) => item.exactDuplicate) ? (
        <div className="rounded-lg border border-border/80 px-3 py-2">
          <p className="text-[12px] font-semibold">Possible overlap</p>
          <ul className="mt-1 space-y-1 text-[12px] text-muted-foreground">
            {preview.items
              .filter((item) => item.exactDuplicate)
              .map((item) => (
                <li key={item.importKey}>
                  {item.importKey}: {item.medicationName}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {preview.warnings.length ? (
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          {preview.warnings.slice(0, 10).map((w) => (
            <li key={w} className={cn('leading-relaxed')}>
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
