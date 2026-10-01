'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  REVIEWED_AREAS,
  REVIEWED_AREA_LABELS,
  SECTION_LABELS,
  aggregateReviewedAreas,
  computePublishingReadiness,
  GOVERNANCE_REVIEW_STATUSES,
  GOVERNANCE_STATUS_LABELS,
} from '@safescript/shared';
import type { ClinicalPathway, PathwayReviewer } from '../types';
import { editLockProps } from '../pathway-edit-lock';
import {
  useCreatePathwayReviewer,
  useDeletePathwayReviewer,
  useLinkReviewerFromLibrary,
  useUpdatePathwayGovernance,
  useUpdatePathwayReviewer,
} from '../hooks';
import { ReviewerFormDialog } from './reviewer-form-dialog';
import { LinkReviewerLibraryDialog } from './link-reviewer-library-dialog';
import { GovernanceStatusBadge } from './status-badges';
import { formatShortDate, resolveGovernance } from './utils';
import { cn } from '@/lib/utils';

export function GovernancePanel({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const lock = editLockProps(canEdit);
  const governance = resolveGovernance(pathway);
  const reviewers = pathway.reviewers ?? [];
  const internal = reviewers.filter((r) => r.reviewerType === 'internal');
  const external = reviewers.filter((r) => r.reviewerType === 'external');
  const reviewedAreas = aggregateReviewedAreas(reviewers);

  const updateGovernance = useUpdatePathwayGovernance(pathway.id);
  const createReviewer = useCreatePathwayReviewer(pathway.id);
  const updateReviewer = useUpdatePathwayReviewer(pathway.id);
  const deleteReviewer = useDeletePathwayReviewer(pathway.id);
  const linkReviewer = useLinkReviewerFromLibrary(pathway.id);

  const [formOpen, setFormOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editing, setEditing] = useState<PathwayReviewer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PathwayReviewer | null>(null);
  const [showReadinessDetails, setShowReadinessDetails] = useState(false);

  const nextDue = governance.nextReviewDueAt ? new Date(governance.nextReviewDueAt) : null;
  const isOverdue = Boolean(nextDue && !Number.isNaN(nextDue.getTime()) && nextDue < new Date());

  const readiness = useMemo(() => {
    const treatments = (pathway.treatments ?? []).filter((t) => t.isActive !== false && !t.archivedAt);
    const redFlags = pathway.redFlags ?? [];
    const questions = pathway.questions ?? [];
    const guidance = (pathway.counsellings ?? []).filter((c) => !c.archivedAt);

    const mappings = pathway.evidenceMappings ?? [];
    const hasEvidence = (mappingType: string, targetId: string) =>
      mappings.some((m) => m.mappingType === mappingType && m.targetId === targetId && !m.suggested) ||
      false;

    const treatmentsMissingEvidence = treatments.filter(
      (t) => !(t.evidenceRefIds?.length) && !hasEvidence('treatment', t.id),
    ).length;
    const redFlagsMissingEvidence = redFlags.filter(
      (f) => !(f.evidenceRefIds?.length) && !hasEvidence('red_flag', f.id),
    ).length;

    return computePublishingReadiness({
      references: (pathway.libraryReferences ?? []).map((r) => ({
        status: r.status ?? 'needs_review',
      })),
      governance: {
        internalReviewStatus: (['not_started', 'pending', 'completed'].includes(
          governance.internalReviewStatus,
        )
          ? governance.internalReviewStatus
          : 'not_started') as 'not_started' | 'pending' | 'completed',
        externalPeerReviewStatus: (['not_started', 'pending', 'completed'].includes(
          governance.externalPeerReviewStatus,
        )
          ? governance.externalPeerReviewStatus
          : 'not_started') as 'not_started' | 'pending' | 'completed',
        lastReviewedAt: governance.lastReviewedAt,
        nextReviewDueAt: governance.nextReviewDueAt,
        primaryDocumentationReferenceId: governance.primaryDocumentationReferenceId,
        secondaryDocumentationReferenceId: governance.secondaryDocumentationReferenceId,
      },
      presentationApproved:
        questions.length === 0 || questions.every((q) => q.approved || q.status === 'APPROVED'),
      // Differentials / red flags currently lack per-item approval flags in the pathway model.
      differentialApproved: true,
      redFlagsApproved: true,
      treatmentsApproved: treatments.length === 0 || treatments.every((t) => t.approved),
      guidanceApproved: guidance.length === 0 || guidance.every((c) => c.approved),
      treatmentsMissingEvidence,
      redFlagsMissingEvidence,
    });
  }, [pathway, governance]);

  const saveGovernanceField = async (patch: {
    internalReviewStatus?: string;
    externalPeerReviewStatus?: string;
    lastReviewedAt?: string | null;
    nextReviewDueAt?: string | null;
  }) => {
    try {
      await updateGovernance.mutateAsync(patch);
      toast.success('Governance updated.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update governance.');
    }
  };

  const handleSaveReviewer = async (payload: {
    reviewerType: string;
    name: string;
    credentials: string;
    role: string;
    organization?: string;
    reviewDate: string;
    reviewedAreas: string[];
    notes?: string;
  }) => {
    try {
      if (editing) {
        await updateReviewer.mutateAsync({ reviewerId: editing.id, data: payload });
        toast.success('Reviewer updated.');
      } else {
        await createReviewer.mutateAsync(payload);
        toast.success('Reviewer added.');
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save reviewer.');
    }
  };

  const handleDeleteReviewer = async () => {
    if (!deleteTarget) return;
    try {
      await deleteReviewer.mutateAsync(deleteTarget.id);
      toast.success('Reviewer removed.');
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not remove reviewer.');
    }
  };

  const handleLinkFromLibrary = async (payload: {
    libraryReviewerId: string;
    reviewerType: string;
    reviewedAreas: string[];
    reviewDate: string;
    notes?: string;
  }) => {
    try {
      await linkReviewer.mutateAsync(payload);
      toast.success('Reviewer linked from master library.');
      setLibraryOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not link master reviewer.');
    }
  };

  const versions = pathway.versions ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Clinical governance</h3>
        <p className="text-sm text-muted-foreground">
          Review status and pathway review history.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="space-y-3 border-border/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Internal clinical review</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last reviewed: {formatShortDate(governance.lastReviewedAt)}
              </p>
            </div>
            <GovernanceStatusBadge status={governance.internalReviewStatus} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={governance.internalReviewStatus}
              disabled={!canEdit || updateGovernance.isPending}
              onChange={(e) => saveGovernanceField({ internalReviewStatus: e.target.value })}
              options={GOVERNANCE_REVIEW_STATUSES.map((v) => ({
                value: v,
                label: GOVERNANCE_STATUS_LABELS[v],
              }))}
            />
          </div>
        </Card>

        <Card className="space-y-3 border-border/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Independent peer review</p>
              <p className="mt-1 text-xs text-muted-foreground">
                External clinical review layer
              </p>
            </div>
            <GovernanceStatusBadge status={governance.externalPeerReviewStatus} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select
              value={governance.externalPeerReviewStatus}
              disabled={!canEdit || updateGovernance.isPending}
              onChange={(e) => saveGovernanceField({ externalPeerReviewStatus: e.target.value })}
              options={GOVERNANCE_REVIEW_STATUSES.map((v) => ({
                value: v,
                label: GOVERNANCE_STATUS_LABELS[v],
              }))}
            />
          </div>
        </Card>
      </div>

      <Card className="border-border/80 p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Review dates</h4>
            <p className="text-xs text-muted-foreground">Pathway-level last reviewed and next due.</p>
          </div>
          {isOverdue ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              Review overdue
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="last-reviewed" className="text-xs">
              Last reviewed
            </Label>
            <Input
              id="last-reviewed"
              type="date"
              defaultValue={toDateInput(governance.lastReviewedAt)}
              disabled={!canEdit}
              onBlur={(e) => {
                const value = e.target.value || null;
                if (value !== toDateInput(governance.lastReviewedAt)) {
                  void saveGovernanceField({ lastReviewedAt: value });
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next-review" className="text-xs">
              Next review
            </Label>
            <Input
              id="next-review"
              type="date"
              defaultValue={toDateInput(governance.nextReviewDueAt)}
              disabled={!canEdit}
              onBlur={(e) => {
                const value = e.target.value || null;
                if (value !== toDateInput(governance.nextReviewDueAt)) {
                  void saveGovernanceField({ nextReviewDueAt: value });
                }
              }}
            />
          </div>
        </div>
      </Card>

      <Card className="border-border/80 p-4 shadow-sm">
        <h4 className="text-sm font-semibold">Reviewed areas</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Aggregate coverage from saved reviewer records.
        </p>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {REVIEWED_AREAS.map((area) => {
            const checked = reviewedAreas.includes(area);
            return (
              <label
                key={area}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm',
                  checked ? 'border-emerald-200 bg-emerald-50/50' : 'border-border/70 bg-muted/20',
                )}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={checked}
                  readOnly
                  disabled
                />
                {REVIEWED_AREA_LABELS[area]}
              </label>
            );
          })}
        </div>
      </Card>

      <Card className="border-border/80 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Reviewers</h4>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLibraryOpen(true)}
              {...lock}
            >
              Link from library
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              {...lock}
            >
              <Plus className="h-4 w-4" />
              Add reviewer
            </Button>
          </div>
        </div>

        <ReviewerGroup
          title="Internal clinical review"
          reviewers={internal}
          canEdit={canEdit}
          onEdit={(r) => {
            setEditing(r);
            setFormOpen(true);
          }}
          onRemove={setDeleteTarget}
        />
        <div className="my-4 border-t border-border/70" />
        <ReviewerGroup
          title="Independent peer review"
          reviewers={external}
          canEdit={canEdit}
          onEdit={(r) => {
            setEditing(r);
            setFormOpen(true);
          }}
          onRemove={setDeleteTarget}
        />
      </Card>

      <Card className="border-border/80 p-4 shadow-sm">
        <h4 className="text-sm font-semibold">Review history</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          From pathway version snapshots.
        </p>
        {versions.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No published versions yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-border/80 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-semibold">Version</th>
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Summary</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-border/50">
                    <td className="px-2 py-2.5 font-medium">v{v.version}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {formatShortDate(v.publishedAt)}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {v.notes?.trim() || '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        Published
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        className={cn(
          'border-border/80 p-4 shadow-sm',
          readiness.ready ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/30',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">
              {readiness.ready ? 'Ready to publish' : 'Pathway not ready to publish'}
            </h4>
            {!readiness.ready ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {readiness.issues.filter((i) => i.severity === 'blocking').length} blocking issue
                {readiness.issues.filter((i) => i.severity === 'blocking').length === 1 ? '' : 's'}
                {readiness.issues.some((i) => i.severity === 'warning')
                  ? ` · ${readiness.issues.filter((i) => i.severity === 'warning').length} warning${
                      readiness.issues.filter((i) => i.severity === 'warning').length === 1 ? '' : 's'
                    }`
                  : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-emerald-800">
                Clinical content, references, and governance checks look complete.
              </p>
            )}
          </div>
          {!readiness.ready ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowReadinessDetails((v) => !v)}
            >
              {showReadinessDetails ? 'Hide details' : 'View details'}
            </Button>
          ) : (
            <Check className="h-5 w-5 text-emerald-600" />
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ['presentation_review', 'Presentation'],
              ['differential_review', 'Differential'],
              ['red_flags', 'Red Flags'],
              ['treatment_options', 'Treatment'],
              ['patient_guidance', 'Patient Guidance'],
              ['references', 'References'],
              ['internal_review', 'Internal review'],
              ['external_review', 'Peer review'],
            ] as const
          ).map(([key, label]) => {
            const status = readiness.sectionStatus[key];
            return (
              <span
                key={key}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                  status === 'approved' || status === 'completed'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800',
                )}
              >
                {label}: {formatSectionStatus(status)}
              </span>
            );
          })}
        </div>

        {showReadinessDetails && readiness.issues.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
            {readiness.issues.map((issue) => (
              <li key={issue.code} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{issue.section}</span>
                {' — '}
                {issue.message}
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {issue.severity}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {updateGovernance.isPending ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </p>
        ) : null}
      </Card>

      <ReviewerFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
        saving={createReviewer.isPending || updateReviewer.isPending}
        onSave={handleSaveReviewer}
      />
      <LinkReviewerLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        pathwayId={pathway.id}
        saving={linkReviewer.isPending}
        onLink={handleLinkFromLibrary}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove this reviewer?"
        description="This removes the reviewer from the current pathway governance list. Historical published-version review records are not erased."
        confirmLabel="Remove"
        onConfirm={handleDeleteReviewer}
        loading={deleteReviewer.isPending}
      />
    </div>
  );
}

function ReviewerGroup({
  title,
  reviewers,
  canEdit,
  onEdit,
  onRemove,
}: {
  title: string;
  reviewers: PathwayReviewer[];
  canEdit: boolean;
  onEdit: (r: PathwayReviewer) => void;
  onRemove: (r: PathwayReviewer) => void;
}) {
  const lock = editLockProps(canEdit);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {reviewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviewers recorded.</p>
      ) : (
        <div className="space-y-3">
          {reviewers.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium">
                  {r.name}
                  {r.credentials ? `, ${r.credentials}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">{r.role}</p>
                {r.organization ? (
                  <p className="text-xs text-muted-foreground">Organization: {r.organization}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Reviewed: {formatShortDate(r.reviewDate)}
                </p>
                {r.reviewedAreas?.length ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Areas:{' '}
                    {r.reviewedAreas
                      .map(
                        (a) =>
                          REVIEWED_AREA_LABELS[a as keyof typeof REVIEWED_AREA_LABELS] ??
                          SECTION_LABELS[a as keyof typeof SECTION_LABELS] ??
                          a,
                      )
                      .join(', ')}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onEdit(r)} {...lock}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => onRemove(r)}
                  {...lock}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatSectionStatus(status: string): string {
  if (status === 'approved') return 'Approved';
  if (status === 'completed') return 'Completed';
  if (status === 'needs_verification') return 'Needs verification';
  if (status === 'needs_review') return 'Needs review';
  if (status === 'pending') return 'Pending';
  return status;
}
