'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  ASSESSMENT_COPY,
  reviewerCountLabel,
  reviewerInitials,
  reviewersListedLabel,
} from './assessment-copy';
import type {
  PathwayDocumentationReference,
  PathwayEvidence,
  PathwayReference,
  PathwayReviewer,
} from './assessment-types';
import { documentationReferenceLine } from './documentation-reference';

export function PathwayDocumentationReferences({
  evidence,
}: {
  evidence?: Pick<PathwayEvidence, 'primaryReference' | 'secondaryReference'> | null;
}) {
  return (
    <div className="space-y-3">
      <DocumentationRow label="Primary reference" reference={evidence?.primaryReference ?? null} />
      <DocumentationRow label="Secondary reference" reference={evidence?.secondaryReference ?? null} />
    </div>
  );
}

function DocumentationRow({
  label,
  reference,
}: {
  label: string;
  reference: PathwayDocumentationReference | null;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-[#10233d]">{label}</p>
      <p className="mt-0.5 text-[13.5px] leading-relaxed text-[#334155]">
        {reference ? documentationReferenceLine(reference) : '—'}
      </p>
    </div>
  );
}

function pathwayReferenceLine(ref: PathwayReference): string {
  const year =
    typeof ref.publicationYear === 'number' && Number.isFinite(ref.publicationYear)
      ? String(ref.publicationYear)
      : ref.edition?.trim() || '';
  const org = ref.organization?.trim();
  const base = year ? `${ref.citationTitle} (${year})` : ref.citationTitle;
  return org ? `${base} · ${org}` : base;
}

function ReviewerRow({ reviewer }: { reviewer: PathwayReviewer }) {
  const name = reviewer.credentials
    ? `${reviewer.fullName}, ${reviewer.credentials}`
    : reviewer.fullName;
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9eeec] text-[11px] font-bold text-[#0f6f6b]">
        {reviewerInitials(reviewer.fullName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[#10233d]">{name}</p>
        <p className="text-[12.5px] text-[#6b7c8a]">{reviewer.role}</p>
      </div>
    </div>
  );
}

function ReviewStatusBadge({
  status,
}: {
  status: 'completed' | 'pending' | 'not_completed';
}) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f7ee] px-2 py-0.5 text-[11px] font-semibold text-[#157a4b]">
        <Check className="h-3 w-3 stroke-[2.5]" aria-hidden />
        Completed
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#fff6e8] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#eef3f5] px-2 py-0.5 text-[11px] font-semibold text-[#6b7c8a]">
      Not yet completed
    </span>
  );
}

function ReviewerSection({
  title,
  status,
  summary,
  reviewers,
  emptyMessage,
}: {
  title: string;
  status: 'completed' | 'pending' | 'not_completed';
  summary: string;
  reviewers: PathwayReviewer[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-[12px] border border-[#d7ece9] bg-[#f8fbfb] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-[#10233d]">{title}</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-[#0f6f6b]">
            {reviewerCountLabel(reviewers.length)}
          </p>
        </div>
        <ReviewStatusBadge status={status} />
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#5b6b76]">{summary}</p>
      <div className="mt-3 space-y-3 border-t border-[#e1eeec] pt-3">
        {reviewers.length ? (
          reviewers.map((reviewer, index) => (
            <ReviewerRow
              key={`${reviewer.fullName}-${reviewer.role}-${index}`}
              reviewer={reviewer}
            />
          ))
        ) : (
          <p className="text-[13px] text-[#6b7c8a]">{emptyMessage}</p>
        )}
      </div>
    </section>
  );
}

function DevelopmentReferencesPanel({ evidence }: { evidence: PathwayEvidence }) {
  const refs = evidence.references ?? [];
  const hasPrimary = Boolean(evidence.primaryReference || evidence.secondaryReference);
  const sources = evidence.clinicalSources?.filter((row) => row.trim()) ?? [];

  if (!hasPrimary && !refs.length && !sources.length) {
    return (
      <p className="rounded-[12px] border border-[#e6eef1] bg-[#f8fafb] px-4 py-3 text-[13.5px] text-[#6b7c8a]">
        {ASSESSMENT_COPY.noReferences}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {hasPrimary ? (
        <section className="rounded-[12px] border border-[#d7ece9] bg-[#f8fbfb] px-4 py-3.5">
          <p className="text-[13.5px] font-semibold text-[#10233d]">
            {ASSESSMENT_COPY.clinicalSources}
          </p>
          <div className="mt-3">
            <PathwayDocumentationReferences evidence={evidence} />
          </div>
        </section>
      ) : null}

      {sources.length && !hasPrimary ? (
        <section className="rounded-[12px] border border-[#d7ece9] bg-[#f8fbfb] px-4 py-3.5">
          <p className="text-[13.5px] font-semibold text-[#10233d]">
            {ASSESSMENT_COPY.clinicalSources}
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13.5px] leading-relaxed text-[#334155]">
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-[12px] border border-[#d7ece9] bg-[#f8fbfb] px-4 py-3.5">
        <p className="text-[13.5px] font-semibold text-[#10233d]">
          {ASSESSMENT_COPY.fullReferences}
        </p>
        {refs.length ? (
          <ul className="mt-3 space-y-3 border-t border-[#e1eeec] pt-3">
            {refs.map((ref) => (
              <li key={ref.id} className="min-w-0">
                <p className="text-[13.5px] font-medium leading-snug text-[#10233d]">
                  {pathwayReferenceLine(ref)}
                </p>
                {ref.referenceType ? (
                  <p className="mt-0.5 text-[12px] text-[#6b7c8a]">{ref.referenceType}</p>
                ) : null}
                {ref.url ? (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#1d6b9a] hover:underline"
                  >
                    Open source
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-[#6b7c8a]">{ASSESSMENT_COPY.noReferences}</p>
        )}
      </section>
    </div>
  );
}

const DEV_TAB_TRIGGER = cn(
  'h-9 flex-1 rounded-[10px] px-3 text-[13px] font-semibold shadow-none',
  'data-[state=active]:bg-white data-[state=active]:text-[#0f6f6b] data-[state=active]:shadow-sm',
  'data-[state=inactive]:text-[#5b6b76]',
);

/** Guideline sources — primary / secondary documentation references. */
export function PathwayEvidenceDialog({
  open,
  onOpenChange,
  evidence,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidence: PathwayEvidence | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="px-6 pb-3 pt-6">
          <DialogTitle className="text-[20px] font-bold text-[#10233d]">
            {ASSESSMENT_COPY.pathwayInformation}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Primary and secondary documentation references for this pathway
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">
          <PathwayDocumentationReferences evidence={evidence} />
        </div>
        <DialogFooter className="px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ASSESSMENT_COPY.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Development & review — reviewers and pathway references for this version. */
export function PathwayDevelopmentReviewDialog({
  open,
  onOpenChange,
  evidence,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidence: PathwayEvidence | null;
}) {
  const [tab, setTab] = useState<'reviewers' | 'references'>('reviewers');
  const internal = evidence?.clinicalReview;
  const independent = evidence?.independentPeerReview;
  const totalReviewers =
    (internal?.reviewers.length ?? 0) + (independent?.reviewers.length ?? 0);

  useEffect(() => {
    if (open) setTab('reviewers');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="px-6 pb-3 pt-6">
          <DialogTitle className="text-[20px] font-bold text-[#10233d]">
            {ASSESSMENT_COPY.developmentReview}
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-relaxed text-[#5b6b76]">
            {evidence
              ? `${evidence.displayName} · ${reviewersListedLabel(totalReviewers)}`
              : ASSESSMENT_COPY.developmentReviewIntro}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as 'reviewers' | 'references')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-6">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-[12px] bg-[#eef3f5] p-1">
              <TabsTrigger value="reviewers" className={DEV_TAB_TRIGGER}>
                {ASSESSMENT_COPY.reviewersTab}
              </TabsTrigger>
              <TabsTrigger value="references" className={DEV_TAB_TRIGGER}>
                {ASSESSMENT_COPY.referencesTab}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="reviewers"
            className="mt-0 max-h-[min(52vh,400px)] space-y-3 overflow-y-auto px-6 pb-2 pt-3 focus-visible:ring-0"
          >
            {evidence && internal && independent ? (
              <>
                <ReviewerSection
                  title={ASSESSMENT_COPY.clinicalReviewInternal}
                  status={internal.status === 'completed' ? 'completed' : 'pending'}
                  summary={internal.summary}
                  reviewers={internal.reviewers}
                  emptyMessage={ASSESSMENT_COPY.noReviewers}
                />
                <ReviewerSection
                  title={ASSESSMENT_COPY.independentPeerReviewExternal}
                  status={independent.status}
                  summary={independent.summary}
                  reviewers={independent.reviewers}
                  emptyMessage={
                    independent.status === 'not_completed'
                      ? independent.summary
                      : ASSESSMENT_COPY.noReviewers
                  }
                />
              </>
            ) : (
              <p className="rounded-[12px] border border-[#e6eef1] bg-[#f8fafb] px-4 py-3 text-[13.5px] text-[#6b7c8a]">
                {ASSESSMENT_COPY.noReviewEvidence}
              </p>
            )}
          </TabsContent>

          <TabsContent
            value="references"
            className="mt-0 max-h-[min(52vh,400px)] overflow-y-auto px-6 pb-2 pt-3 focus-visible:ring-0"
          >
            {evidence ? (
              <DevelopmentReferencesPanel evidence={evidence} />
            ) : (
              <p className="rounded-[12px] border border-[#e6eef1] bg-[#f8fafb] px-4 py-3 text-[13.5px] text-[#6b7c8a]">
                {ASSESSMENT_COPY.noReferences}
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-4 sm:justify-end">
          <Button
            type="button"
            className="bg-[#0f6f6b] text-white hover:bg-[#0c5e5b]"
            onClick={() => onOpenChange(false)}
          >
            {ASSESSMENT_COPY.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
