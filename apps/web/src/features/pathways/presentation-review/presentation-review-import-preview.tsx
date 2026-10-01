'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PresentationReviewImportPreview = {
  ok: boolean;
  error?: string | null;
  format: 'structured' | 'legacy' | 'unstructured';
  legacyTwoSectionImport?: boolean;
  approvedQuestionCount: number;
  existingQuestionCount: number;
  blockingErrors: string[];
  warnings: string[];
  summary: {
    questions: number;
    questionsWithReferences: number;
    sectionEvidence: number;
    references: number;
    matchedExisting: number;
    newSources: number;
    verificationRequired: number;
    issueCount: number;
  };
  questions: Array<{
    importKey: string;
    questionText: string;
    importedReferenceIds: string[];
    exactDuplicate?: boolean;
    possibleOverlap?: boolean;
    needsRuleReview?: boolean;
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

export function PresentationReviewImportPreview({
  preview,
}: {
  preview: PresentationReviewImportPreview;
}) {
  const blocking = preview.blockingErrors.length;
  const { summary } = preview;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 pb-4 sm:px-6">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
        <p className="text-sm font-semibold">Presentation Review</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {summary.questions} question{summary.questions === 1 ? '' : 's'}
        </p>
        <dl className="mt-3 space-y-1.5 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Question evidence mappings</dt>
            <dd className="font-medium">
              {summary.questionsWithReferences}/{summary.questions} questions have references
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
            <li>• {summary.matchedExisting} matched existing source{summary.matchedExisting === 1 ? '' : 's'}</li>
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
        {blocking > 0 ? (
          <p className="mt-3 flex items-start gap-1.5 text-[12.5px] font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {blocking} issue{blocking === 1 ? '' : 's'} require attention
          </p>
        ) : summary.issueCount > 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Imported items will enter Needs review. Warnings do not block import.
          </p>
        ) : null}
      </div>

      {preview.legacyTwoSectionImport ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          This import used legacy Diagnosis Confirmation and Treatment Eligibility headings. Review for overlapping questions. Central references were not invented.
        </p>
      ) : null}

      {preview.format === 'unstructured' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          Content looks unstructured. Paste structured ChatGPT output instead. References were not inferred.
        </p>
      ) : null}

      {preview.blockingErrors.length ? (
        <ul className="space-y-1 text-[12.5px] text-destructive">
          {preview.blockingErrors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {preview.questions.some((q) => q.possibleOverlap || q.exactDuplicate) ? (
        <div className="rounded-lg border border-border/80 px-3 py-2">
          <p className="text-[12px] font-semibold">Possible overlap</p>
          <ul className="mt-1 space-y-1 text-[12px] text-muted-foreground">
            {preview.questions
              .filter((q) => q.possibleOverlap || q.exactDuplicate)
              .map((q) => (
                <li key={q.importKey}>
                  {q.importKey}: {q.questionText}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {preview.warnings.length ? (
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          {preview.warnings.slice(0, 8).map((w) => (
            <li key={w} className={cn('leading-relaxed')}>
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
