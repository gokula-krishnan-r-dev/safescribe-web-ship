'use client';

import { BookOpen, Check, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAssessmentDate } from '@/features/consultations/assessment/assessment-copy';
import {
  citationDisplay,
  editionLabel,
  parsePathwayGovernance,
  parsePresentationReviewState,
} from '@safescript/shared';
import type { ClinicalPathway, PathwayEvidenceLibraryReference, PathwayReviewer } from '../types';
import { DocumentationReferencesSection } from '../components/documentation-references-section';

function StatusBadge({
  status,
}: {
  status: 'completed' | 'pending' | 'not_started';
}) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <Check className="h-3 w-3 stroke-[2.5]" />
        Completed
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      Not started
    </span>
  );
}

function reviewerLine(reviewer: PathwayReviewer) {
  return [reviewer.name, reviewer.credentials].filter(Boolean).join(', ');
}

function uniqueReviewBodies(reviewers: PathwayReviewer[]) {
  const bodies: string[] = [];
  const seen = new Set<string>();
  for (const reviewer of reviewers) {
    const body = reviewer.organization?.trim();
    if (!body) continue;
    const key = body.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bodies.push(body);
  }
  return bodies;
}

export function EvidenceReviewPanel({
  pathway,
  questionIdsInOrder,
  canEdit,
  onClose,
  onManageReferences,
  onLinkSectionSources,
}: {
  pathway: ClinicalPathway;
  questionIdsInOrder: string[];
  canEdit: boolean;
  onClose: () => void;
  onManageReferences: () => void;
  onLinkSectionSources: () => void;
}) {
  const library = pathway.libraryReferences ?? [];
  const sectionState = parsePresentationReviewState(pathway.presentationReview);
  const governance = parsePathwayGovernance(
    pathway.governance,
    pathway.primaryDocumentationReferenceId,
    pathway.secondaryDocumentationReferenceId,
  );
  const lastReviewed =
    governance.lastReviewedAt ?? pathway.lastClinicalReview ?? pathway.clinicallyReviewedAt;
  const internalReviewers = (pathway.reviewers ?? []).filter((r) => r.reviewerType === 'internal');
  const externalReviewers = (pathway.reviewers ?? []).filter((r) => r.reviewerType === 'external');
  const internalStatus = governance.internalReviewStatus;
  const externalStatus = governance.externalPeerReviewStatus;
  const internalBodies = uniqueReviewBodies(internalReviewers);
  const currentVersion = `v${pathway.version}`;
  const questionIndex = new Map(questionIdsInOrder.map((id, i) => [id, i + 1]));

  const sources = library
    .map((ref) => {
      const qLabels = (pathway.questions ?? [])
        .filter((q) => {
          if ((q.evidenceRefIds ?? []).includes(ref.id)) return true;
          return (pathway.evidenceMappings ?? []).some(
            (m) => m.referenceId === ref.id && m.mappingType === 'question' && m.targetId === q.id,
          );
        })
        .map((q) => {
          const n = questionIndex.get(q.id);
          return n ? `Q${n}` : null;
        })
        .filter((label): label is string => Boolean(label));
      const sectionWide = sectionState.sectionEvidenceRefIds.includes(ref.id);
      if (!qLabels.length && !sectionWide) return null;
      return { ref, qLabels, sectionWide };
    })
    .filter((row): row is { ref: PathwayEvidenceLibraryReference; qLabels: string[]; sectionWide: boolean } =>
      Boolean(row),
    );

  const versions = pathway.versions ?? [];

  return (
    <aside className="flex h-fit w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(15,23,42,0.05)] lg:sticky lg:top-4 lg:w-[340px] lg:shrink-0">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Evidence & review</h3>
            <p className="text-[12px] text-muted-foreground">Presentation Review</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close evidence panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 px-4 py-4">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Evidence, review status and version history for this section.
        </p>

        <section className="space-y-2.5">
          <div>
            <h4 className="text-[13px] font-semibold">Section sources</h4>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              References from your central library mapped to this section. Manage all references in
              References & Governance.
            </p>
          </div>
          {sources.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-foreground">
              No section sources linked yet. Link library references to questions or this section.
            </p>
          ) : (
            <div className="space-y-3.5">
              {sources.map(({ ref, qLabels, sectionWide }) => (
                <div key={ref.id} className="space-y-1">
                  <p className="text-[13px] font-medium leading-snug">{citationDisplay(ref)}</p>
                  <p className="text-[11.5px] text-muted-foreground">{editionLabel(ref)}</p>
                  <div className="flex flex-wrap gap-1">
                    {qLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
                      >
                        {label}
                      </span>
                    ))}
                    {sectionWide ? (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary">
                        Section-wide
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col items-start gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={onLinkSectionSources}
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Link section sources
            </button>
            <button
              type="button"
              onClick={onManageReferences}
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Manage in References & Governance →
            </button>
          </div>
        </section>

        <DocumentationReferencesSection pathway={pathway} canEdit={canEdit} />

        <section className="space-y-2 border-t border-border/70 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-semibold">Internal review</h4>
            <StatusBadge status={internalStatus} />
          </div>
          {internalReviewers.length || lastReviewed || internalBodies.length ? (
            <dl className="space-y-1.5 text-[12.5px]">
              {internalBodies.length ? (
                <div className="grid grid-cols-[88px_1fr] gap-x-2">
                  <dt className="text-muted-foreground">Review body</dt>
                  <dd>{internalBodies.join('; ')}</dd>
                </div>
              ) : null}
              {internalReviewers.length ? (
                <div className="grid grid-cols-[88px_1fr] gap-x-2">
                  <dt className="text-muted-foreground">Reviewers</dt>
                  <dd>
                    <ul className="space-y-0.5">
                      {internalReviewers.map((r) => (
                        <li key={r.id}>{reviewerLine(r)}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
              {lastReviewed ? (
                <div className="grid grid-cols-[88px_1fr] gap-x-2">
                  <dt className="text-muted-foreground">Review date</dt>
                  <dd>{formatAssessmentDate(lastReviewed)}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              Internal review status is taken from pathway clinical review. Reviewer names are shown
              only when stored.
            </p>
          )}
        </section>

        <section className="space-y-2 border-t border-border/70 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-semibold">External peer review</h4>
            <StatusBadge status={externalStatus} />
          </div>
          {externalReviewers.length ? (
            <dl className="space-y-1.5 text-[12.5px]">
              <div className="grid grid-cols-[88px_1fr] gap-x-2">
                <dt className="text-muted-foreground">
                  {externalReviewers.length === 1 ? 'Reviewer' : 'Reviewers'}
                </dt>
                <dd>
                  <ul className="space-y-1">
                    {externalReviewers.map((r) => (
                      <li key={r.id}>
                        <span>{reviewerLine(r)}</span>
                        {r.reviewDate ? (
                          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                            {formatAssessmentDate(r.reviewDate)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              Independent external review is recorded separately from internal SafeScribe review. No
              reviewer is shown unless one is stored for this pathway.
            </p>
          )}
        </section>

        <section className="space-y-2 border-t border-border/70 pt-4">
          <h4 className="text-[13px] font-semibold">Version history</h4>
          <ol className="space-y-2.5">
            <li className="flex gap-2.5">
              <Circle className={cn('mt-1.5 h-2.5 w-2.5 fill-primary text-primary')} />
              <div>
                <p className="text-[12.5px] font-semibold">
                  {currentVersion}{' '}
                  <span className="font-normal text-muted-foreground">(current)</span>
                  {pathway.publishedAt || pathway.updatedAt ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {formatAssessmentDate(pathway.publishedAt ?? pathway.updatedAt)}
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
            {versions
              .filter((row) => row.version !== pathway.version)
              .map((row) => (
                <li key={row.id} className="flex gap-2.5">
                  <Circle className="mt-1.5 h-2.5 w-2.5 text-muted-foreground" />
                  <div>
                    <p className="text-[12.5px] font-semibold">
                      v{row.version}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {formatAssessmentDate(row.publishedAt)}
                      </span>
                    </p>
                    {row.notes?.trim() ? (
                      <p className="text-[12px] text-muted-foreground">{row.notes.trim()}</p>
                    ) : null}
                  </div>
                </li>
              ))}
          </ol>
        </section>
      </div>
    </aside>
  );
}
