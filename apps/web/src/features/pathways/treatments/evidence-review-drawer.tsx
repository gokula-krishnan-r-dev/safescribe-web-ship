'use client';

import { useMemo, useState } from 'react';
import { Check, Circle, ExternalLink, Info, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAssessmentDate } from '@/features/consultations/assessment/assessment-copy';
import { citationDisplay, editionLabel, parsePathwayGovernance } from '@safescript/shared';
import type {
  ClinicalPathway,
  ClinicalTreatment,
  PathwayEvidenceLibraryReference,
  PathwayReviewer,
} from '../types';
import { linkedIdsForTreatment, sectionEvidenceIds } from './utils';
import { DocumentationReferencesSection } from '../components/documentation-references-section';

function StatusBadge({ status }: { status: 'completed' | 'pending' | 'not_started' }) {
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

export function TreatmentsEvidenceReviewDrawer({
  pathway,
  treatments,
  canEdit,
  onClose,
  onManageReferences,
  onLinkSectionSources,
}: {
  pathway: ClinicalPathway;
  treatments: ClinicalTreatment[];
  canEdit: boolean;
  onClose: () => void;
  onManageReferences: () => void;
  onLinkSectionSources: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const library = pathway.libraryReferences ?? [];
  const mappings = pathway.evidenceMappings ?? [];
  const governance = parsePathwayGovernance(
    pathway.governance,
    pathway.primaryDocumentationReferenceId,
    pathway.secondaryDocumentationReferenceId,
  );
  const lastReviewed =
    governance.lastReviewedAt ?? pathway.lastClinicalReview ?? pathway.clinicallyReviewedAt;
  const internalReviewers = (pathway.reviewers ?? []).filter((r) => r.reviewerType === 'internal');
  const externalReviewers = (pathway.reviewers ?? []).filter((r) => r.reviewerType === 'external');
  const internalBodies = uniqueReviewBodies(internalReviewers);
  const currentVersion = `v${pathway.version}`;
  const versions = pathway.versions ?? [];
  const sectionIds = sectionEvidenceIds(mappings);
  const linked = useMemo(() => {
    const rows: Array<{
      ref: PathwayEvidenceLibraryReference;
      sectionWide: boolean;
      items: string[];
    }> = [];
    for (const ref of library) {
      const mapped = treatments
        .filter((item) => linkedIdsForTreatment(item, mappings).includes(ref.id))
        .map((item) => item.medicationName);
      const sectionWide = sectionIds.includes(ref.id);
      if (!mapped.length && !sectionWide) continue;
      rows.push({ ref, sectionWide, items: mapped });
    }
    return rows;
  }, [treatments, library, mappings, sectionIds]);

  const visible = showAll ? linked : linked.slice(0, 5);
  const notes = useMemo(() => {
    const lines: string[] = [];
    if (pathway.notes?.trim()) lines.push(pathway.notes.trim());
    for (const reviewer of pathway.reviewers ?? []) {
      if (!reviewer.notes?.trim()) continue;
      if (
        Array.isArray(reviewer.reviewedAreas) &&
        reviewer.reviewedAreas.length &&
        !reviewer.reviewedAreas.includes('treatment_options')
      ) {
        continue;
      }
      lines.push([reviewerLine(reviewer), reviewer.notes.trim()].filter(Boolean).join(' — '));
    }
    return lines;
  }, [pathway.notes, pathway.reviewers]);

  return (
    <aside className="flex h-fit w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(15,23,42,0.06)] lg:sticky lg:top-4 lg:w-[360px] lg:shrink-0">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-foreground">Treatment Options — Evidence & review</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close evidence panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Tabs defaultValue="references" className="px-4 pb-4 pt-2">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border/70 bg-transparent p-0">
          <TabsTrigger
            value="references"
            className="rounded-none border-b-2 border-transparent px-2 pb-2 pt-1 text-[13px] shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            References
          </TabsTrigger>
          <TabsTrigger
            value="review"
            className="rounded-none border-b-2 border-transparent px-2 pb-2 pt-1 text-[13px] shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Review & version
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="rounded-none border-b-2 border-transparent px-2 pb-2 pt-1 text-[13px] shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="references" className="mt-4 space-y-4">
          <div>
            <h4 className="text-[13px] font-semibold">Section overview</h4>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              These references support the treatment options in this pathway.
            </p>
          </div>

          <div className="flex gap-2 rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2.5 text-[12.5px] leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
            <p>
              Each treatment option should be linked to the references that support its use, dose, and
              place in therapy.
            </p>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold">Linked references ({linked.length})</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[12px] font-semibold text-primary"
                onClick={onLinkSectionSources}
                disabled={!canEdit}
              >
                <Plus className="h-3.5 w-3.5" />
                Link reference
              </Button>
            </div>
            {linked.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-foreground">
                No references linked yet. Link library references to a treatment option or this section.
              </p>
            ) : (
              <ol className="space-y-3.5">
                {visible.map(({ ref, sectionWide, items: mappedItems }, index) => (
                  <li key={ref.id} className="flex gap-2">
                    <span className="w-4 shrink-0 text-[12.5px] font-semibold text-muted-foreground">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-start gap-1.5 text-[13px] font-semibold leading-snug text-primary">
                        <span className="min-w-0">{citationDisplay(ref)}</span>
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 text-muted-foreground hover:text-primary"
                            aria-label="Open reference"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </p>
                      {ref.organization ? (
                        <p className="text-[11.5px] text-muted-foreground">{ref.organization}</p>
                      ) : null}
                      <p className="text-[11.5px] text-muted-foreground">{editionLabel(ref)}</p>
                      {sectionWide ? (
                        <p className="text-[11.5px] text-muted-foreground">Section-wide</p>
                      ) : mappedItems.length ? (
                        <p className="text-[11.5px] text-muted-foreground">
                          {mappedItems.length === 1
                            ? mappedItems[0]
                            : `Mapped to ${mappedItems.length} treatment options`}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {linked.length > 5 ? (
              <button
                type="button"
                className="text-[12px] font-semibold text-primary hover:underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show fewer references' : `Show all ${linked.length} references`}
              </button>
            ) : linked.length > 0 ? (
              <p className="text-[12px] text-muted-foreground">Show all {linked.length} references</p>
            ) : null}
            <button
              type="button"
              onClick={onManageReferences}
              className="block text-[12.5px] font-semibold text-primary hover:underline"
            >
              Go to References & Governance →
            </button>
          </section>

          <DocumentationReferencesSection pathway={pathway} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="review" className="mt-4 space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold">Internal review</h4>
              <StatusBadge status={governance.internalReviewStatus} />
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
                    <dt className="text-muted-foreground">Reviewer(s)</dt>
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
                Internal review status comes from pathway governance. Reviewer names appear only when
                stored.
              </p>
            )}
          </section>

          <section className="space-y-2 border-t border-border/70 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[13px] font-semibold">External peer review</h4>
              <StatusBadge status={governance.externalPeerReviewStatus} />
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
                          <p>{reviewerLine(r)}</p>
                          {r.organization ? (
                            <p className="text-muted-foreground">{r.organization}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                External peer review appears only when a reviewer is stored for this pathway.
              </p>
            )}
          </section>

          <section className="space-y-2 border-t border-border/70 pt-4">
            <h4 className="text-[13px] font-semibold">Version history</h4>
            <ol className="space-y-2.5">
              <li className="flex gap-2.5">
                <Circle className="mt-1.5 h-2.5 w-2.5 fill-primary text-primary" />
                <div>
                  <p className="text-[12.5px] font-semibold">
                    {currentVersion}{' '}
                    <span className="font-normal text-muted-foreground">— current</span>
                  </p>
                  {pathway.publishedAt || pathway.updatedAt ? (
                    <p className="text-[12px] text-muted-foreground">
                      {formatAssessmentDate(pathway.publishedAt ?? pathway.updatedAt)}
                    </p>
                  ) : null}
                </div>
              </li>
              {versions
                .filter((row) => row.version !== pathway.version)
                .map((row) => (
                  <li key={row.id} className="flex gap-2.5">
                    <Circle className="mt-1.5 h-2.5 w-2.5 text-muted-foreground" />
                    <div>
                      <p className="text-[12.5px] font-semibold">v{row.version}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {row.notes?.trim() || formatAssessmentDate(row.publishedAt)}
                      </p>
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          {notes.length ? (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li
                  key={note.slice(0, 48)}
                  className="rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5 text-[12.5px] leading-relaxed"
                >
                  {note}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[12.5px] text-muted-foreground">
              No notes recorded for this section.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
