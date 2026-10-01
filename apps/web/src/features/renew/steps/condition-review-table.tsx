'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  getConditionReviewCompletion,
  isConditionReviewComplete,
  isConfirmedConditionGroup,
  isReviewableConditionGroup,
  medicationDisplayName,
  therapyReviewProgressCopy,
  type RenewConditionReview,
  type RenewMedication,
  type TherapyConditionGroup,
} from '@safescript/shared';
import {
  resolveLinkedMedications,
  useLinkedMedicationLookup,
} from './linked-medication-links';
import { ConditionDetailsDialog, TherapyReviewRow } from './therapy-review-row';

function collectUnsavedReviewIds() {
  return [...document.querySelectorAll('[data-pending-review-editor="true"]')]
    .map((node) => node.getAttribute('data-review-id'))
    .filter((id): id is string => Boolean(id));
}

export function ConditionReviewTable({
  groups,
  medications,
  onPatch,
  onApplyStable,
  onLinkMedication,
  onRemoveCondition,
  applying,
  linking,
  showFieldErrors = false,
  highlightKey = null,
  bulkBanner = null,
}: {
  groups: TherapyConditionGroup[];
  medications: RenewMedication[];
  onPatch: (reviewId: string, patch: Partial<RenewConditionReview>) => void | Promise<void>;
  onApplyStable: (skipReviewIds: string[]) => void;
  onLinkMedication: (value: {
    medicationId: string;
    conditionId: string | null;
    customConditionText: string | null;
    label: string;
  }) => void;
  onRemoveCondition: (group: TherapyConditionGroup) => void;
  applying?: boolean;
  linking?: boolean;
  showFieldErrors?: boolean;
  highlightKey?: string | null;
  bulkBanner?: { message: string; onUndo: () => void } | null;
}) {
  const rows = groups.filter(isConfirmedConditionGroup);
  const reviewable = rows.filter(isReviewableConditionGroup);
  const byId = useLinkedMedicationLookup(medications);
  const [stableOpen, setStableOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<TherapyConditionGroup | null>(null);
  const [detailsGroup, setDetailsGroup] = useState<TherapyConditionGroup | null>(null);

  const reviewedCount = reviewable.filter((group) =>
    isConditionReviewComplete(group.review, group.medicationIds.length),
  ).length;
  const findingCount = reviewable.filter((group) => {
    const completion = getConditionReviewCompletion(group.review, group.medicationIds.length);
    return completion === 'COMPLETE_WITH_CONCERN' || completion === 'COMPLETE_UNABLE_TO_ASSESS';
  }).length;

  const applyStable = () => {
    onApplyStable(collectUnsavedReviewIds());
    setStableOpen(false);
  };

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#d9e4e8] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eef0] px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60"
            disabled={applying}
            onClick={() => setStableOpen(true)}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Apply stable responses to all
          </button>
          <p className="mt-1.5 text-[12px] leading-snug text-[#52677a]">
            Applies Yes · No · No to unanswered fields only. Existing responses and documented concerns
            are preserved.
          </p>
        </div>
        <p className="text-[13px] font-medium tabular-nums text-[#52677a]">
          {therapyReviewProgressCopy({
            reviewedCount,
            totalCount: reviewable.length,
            findingCount,
          })}
        </p>
      </div>

      {bulkBanner ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-[#eef8f2] px-4 py-2.5 sm:px-5">
          <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0b7a52]">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {bulkBanner.message}
          </p>
          <button
            type="button"
            className="text-[13px] font-semibold text-primary hover:underline"
            onClick={bulkBanner.onUndo}
          >
            Undo
          </button>
        </div>
      ) : null}

      <Dialog open={stableOpen} onOpenChange={setStableOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply stable responses to all</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This will apply the following responses to all unanswered fields:</p>
                <ul className="space-y-1.5 text-[#102a43]">
                  <li className="flex justify-between gap-4">
                    <span>Taking as prescribed?</span>
                    <span className="font-semibold">Yes</span>
                  </li>
                  <li className="flex justify-between gap-4">
                    <span>Effectiveness / stability concerns?</span>
                    <span className="font-semibold">No</span>
                  </li>
                  <li className="flex justify-between gap-4">
                    <span>Medication concerns?</span>
                    <span className="font-semibold">No</span>
                  </li>
                </ul>
                <p>Existing responses and documented concerns will not be changed.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => setStableOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-10 rounded-lg" disabled={applying} onClick={applyStable}>
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="hidden lg:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#e8eef0] bg-[#f7fafb] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
              <th className="w-[24%] px-4 py-2.5">Condition / medication</th>
              <th className="w-[23%] px-3 py-2.5">Taking as prescribed?</th>
              <th className="w-[24%] px-3 py-2.5">Effectiveness / stability concerns?</th>
              <th className="w-[21%] px-3 py-2.5">Medication concerns?</th>
              <th className="w-[8%] px-2 py-2.5">
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((group) => {
              const linkedMeds = resolveLinkedMedications(group.medicationIds, byId);
              return isReviewableConditionGroup(group) ? (
                <TherapyReviewRow
                  key={group.key}
                  layout="desktop"
                  group={group}
                  linkedMeds={linkedMeds}
                  showFieldErrors={showFieldErrors}
                  highlight={highlightKey === group.key}
                  linking={linking}
                  onPatch={onPatch}
                  onViewDetails={() => setDetailsGroup(group)}
                  onRemoveCondition={() => onRemoveCondition(group)}
                />
              ) : (
                <UnlinkedReviewRow key={group.key} group={group} onLink={() => setLinkTarget(group)} />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 lg:hidden">
        {rows.map((group) => {
          const linkedMeds = resolveLinkedMedications(group.medicationIds, byId);
          return isReviewableConditionGroup(group) ? (
            <TherapyReviewRow
              key={group.key}
              layout="mobile"
              group={group}
              linkedMeds={linkedMeds}
              showFieldErrors={showFieldErrors}
              highlight={highlightKey === group.key}
              linking={linking}
              onPatch={onPatch}
              onViewDetails={() => setDetailsGroup(group)}
              onRemoveCondition={() => onRemoveCondition(group)}
            />
          ) : (
            <MobileUnlinkedCard key={group.key} group={group} onLink={() => setLinkTarget(group)} />
          );
        })}
      </div>

      <LinkMedicationDialog
        open={Boolean(linkTarget)}
        group={linkTarget}
        groups={rows}
        medications={medications}
        saving={linking}
        onClose={() => setLinkTarget(null)}
        onLink={(medicationId) => {
          if (!linkTarget) return;
          onLinkMedication({
            medicationId,
            conditionId: linkTarget.conditionId,
            customConditionText: linkTarget.customConditionText,
            label: linkTarget.displayName,
          });
          setLinkTarget(null);
        }}
      />
      <ConditionDetailsDialog
        open={Boolean(detailsGroup)}
        group={detailsGroup}
        linkedMeds={detailsGroup ? resolveLinkedMedications(detailsGroup.medicationIds, byId) : []}
        onClose={() => setDetailsGroup(null)}
      />
    </section>
  );
}

function UnlinkedReviewRow({
  group,
  onLink,
}: {
  group: TherapyConditionGroup;
  onLink: () => void;
}) {
  return (
    <tr className="border-b border-[#e8eef0] align-middle">
      <td className="px-4 py-3">
        <p className="font-semibold leading-snug">{group.displayName}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">No medications linked yet</p>
      </td>
      <td colSpan={3} className="px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/25 px-3 py-2">
          <p className="min-w-0 text-[13px] leading-snug text-muted-foreground">
            Link a medication to review adherence, effectiveness, and concerns.
          </p>
          <button
            type="button"
            onClick={onLink}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primary/35 bg-card px-2.5 text-[12px] font-semibold text-primary hover:bg-primary/[0.05]"
          >
            <Link2 className="h-3.5 w-3.5" />
            Link a medication
          </button>
        </div>
      </td>
      <td />
    </tr>
  );
}

function MobileUnlinkedCard({
  group,
  onLink,
}: {
  group: TherapyConditionGroup;
  onLink: () => void;
}) {
  return (
    <article className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <p className="font-semibold leading-snug">{group.displayName}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">No medications linked yet</p>
      <button
        type="button"
        onClick={onLink}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/35 bg-card px-3 text-sm font-semibold text-primary"
      >
        <Link2 className="h-3.5 w-3.5" />
        Link a medication
      </button>
    </article>
  );
}

function LinkMedicationDialog({
  open,
  group,
  groups,
  medications,
  saving,
  onClose,
  onLink,
}: {
  open: boolean;
  group: TherapyConditionGroup | null;
  groups: TherapyConditionGroup[];
  medications: RenewMedication[];
  saving?: boolean;
  onClose: () => void;
  onLink: (medicationId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!open) {
      setSelectedId('');
      return;
    }
    const unlinked = medications.find(
      (med) => !groups.some((row) => row.medicationIds.includes(med.id)),
    );
    setSelectedId(unlinked?.id ?? medications[0]?.id ?? '');
  }, [open, medications, groups]);

  const options = [...medications].sort((a, b) => {
    const aLinked = groups.some((row) => row.medicationIds.includes(a.id));
    const bLinked = groups.some((row) => row.medicationIds.includes(b.id));
    if (aLinked !== bLinked) return aLinked ? 1 : -1;
    return medicationDisplayName(a).localeCompare(medicationDisplayName(b));
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link a medication to {group?.displayName ?? 'this condition'}</DialogTitle>
          <DialogDescription>
            Therapy review for this condition starts once a medication is linked. Moving a medication
            updates its indication.
          </DialogDescription>
        </DialogHeader>
        {options.length ? (
          <ul className="max-h-[min(20rem,50vh)] space-y-1.5 overflow-y-auto">
            {options.map((med) => {
              const current = groups.find((row) => row.medicationIds.includes(med.id));
              return (
                <li key={med.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5',
                      selectedId === med.id
                        ? 'border-primary bg-primary/[0.05]'
                        : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="link-medication"
                      className="mt-1 accent-primary"
                      checked={selectedId === med.id}
                      onChange={() => setSelectedId(med.id)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {medicationDisplayName(med)}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {current ? `Currently linked to ${current.displayName}` : 'No indication yet'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            There are no medications on this renewal to link yet.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10 rounded-md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 rounded-md"
            disabled={!selectedId || saving}
            onClick={() => selectedId && onLink(selectedId)}
          >
            Link to {group?.displayName ?? 'condition'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
