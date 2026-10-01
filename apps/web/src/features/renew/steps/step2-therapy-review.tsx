'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import { ClinicalStepFooter } from '@/features/consultations/clinical-ui';
import {
  evaluateTherapyReviewGate,
  groupTherapyConditions,
  isConfirmedConditionGroup,
  isIndicationResolved,
  isReviewableConditionGroup,
  medicationDisplayName,
  parseRenewPayload,
  therapyReviewFieldErrors,
  undoBulkStablePatch,
  unresolvedMappings,
  type RenewConditionCatalogItem,
  type RenewConditionReview,
  type RenewMedication,
  type RenewTherapyReviewState,
} from '@safescript/shared';
import type { ApiError } from '@/lib/api-client';
import {
  useAddRenewCondition,
  useApplyStableAll,
  useCompleteTherapyReview,
  usePatchConditionReview,
  useSearchRenewConditions,
  useSetRenewIndication,
  useSuggestTherapyMappings,
  useTherapyReview,
} from '../hooks';
import { AddConditionDialog } from './add-condition-dialog';
import { ConditionReviewTable } from './condition-review-table';
import { ConditionsConfirmedBar } from './conditions-confirmed-bar';
import { MedicationIndicationDialog } from './medication-indication-dialog';
import { ViewEditConditionsDialog } from './view-edit-conditions-dialog';

function errorMessage(error: unknown, fallback: string) {
  const err = error as ApiError | undefined;
  if (!err) return fallback;
  if (typeof err.message === 'string') return err.message;
  if (Array.isArray(err.message)) return err.message[0] ?? fallback;
  if (err.message && typeof err.message === 'object' && 'message' in err.message) {
    return String(err.message.message ?? fallback);
  }
  return fallback;
}

export function Step2TherapyReview({
  consultationId,
  initialPayload,
  onBack,
  onContinue,
  onSaved,
}: {
  consultationId: string;
  initialPayload: unknown;
  onBack: () => void;
  onContinue: () => void;
  onSaved?: () => void;
}) {
  const parsed = parseRenewPayload(initialPayload);
  const step1Ready = parsed.medicationList.confirmed && parsed.medicationList.items.length > 0;
  const reviewQuery = useTherapyReview(consultationId, step1Ready);
  const suggest = useSuggestTherapyMappings(consultationId);
  const setIndication = useSetRenewIndication(consultationId);
  const addCondition = useAddRenewCondition(consultationId);
  const patchReview = usePatchConditionReview(consultationId);
  const applyStable = useApplyStableAll(consultationId);
  const complete = useCompleteTherapyReview(consultationId);
  const search = useSearchRenewConditions(consultationId);

  const suggestedOnce = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewEditOpen, setViewEditOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<RenewConditionCatalogItem[]>([]);
  const [attentionTarget, setAttentionTarget] = useState<string | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [bulkUndo, setBulkUndo] = useState<{
    previous: RenewConditionReview[];
    updatedIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!reviewQuery.data || suggestedOnce.current) return;
    suggestedOnce.current = true;
    suggest.mutate();
  }, [reviewQuery.data, suggest]);

  const medications: RenewMedication[] = reviewQuery.data?.medications ?? parsed.medicationList.items;
  const therapy: RenewTherapyReviewState =
    reviewQuery.data?.therapyReview ?? parsed.therapyReview;
  const conditions: RenewConditionCatalogItem[] = reviewQuery.data?.conditions ?? [];
  const catalog = useMemo(() => {
    const byId = new Map(conditions.map((row) => [row.id, row]));
    for (const row of searchResults) byId.set(row.id, row);
    return [...byId.values()];
  }, [conditions, searchResults]);

  const groups = useMemo(
    () => groupTherapyConditions(medications, therapy, catalog),
    [medications, therapy, catalog],
  );
  const unresolved = useMemo(
    () => unresolvedMappings(medications, therapy.mappings),
    [medications, therapy.mappings],
  );
  const gate = reviewQuery.data?.gate ?? evaluateTherapyReviewGate(medications, therapy, catalog);

  const editingMed = medications.find((med) => med.id === editingMedId) ?? null;
  const editingMapping = therapy.mappings.find((row) => row.medicationId === editingMedId);
  const currentLabel =
    editingMapping && isIndicationResolved(editingMapping)
      ? editingMapping.conditionId
        ? catalog.find((row) => row.id === editingMapping.conditionId)?.displayName ?? null
        : editingMapping.customIndicationText
      : null;
  const existingConditionIds = groups
    .map((group) => group.conditionId)
    .filter((id): id is string => Boolean(id));
  const medicationConditionLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const group of groups) {
      for (const id of group.medicationIds) labels[id] = group.displayName;
    }
    return labels;
  }, [groups]);
  const peerConditions = groups
    .filter((group) => {
      if (editingMapping?.conditionId) return group.conditionId !== editingMapping.conditionId;
      if (editingMapping?.customIndicationText) {
        return group.customConditionText !== editingMapping.customIndicationText;
      }
      return true;
    })
    .filter(isConfirmedConditionGroup)
    .map((group) => ({
      id: group.conditionId ?? `custom:${group.customConditionText ?? group.displayName}`,
      label: group.displayName,
    }));

  const markSaved = () => onSaved?.();
  const runSearch = (q: string) => {
    search.mutate(q, {
      onSuccess: setSearchResults,
      onError: () => {
        if (q.trim()) toast.error('Condition search is temporarily unavailable. Retry or use Other / specify.');
      },
    });
  };

  const handleContinue = async () => {
    if (!gate.ok) {
      revealIncomplete();
      return;
    }
    const pendingEditor = document.querySelector('[data-pending-review-editor="true"]');
    if (pendingEditor) {
      setShowFieldErrors(true);
      pendingEditor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('Save or cancel the open concern before continuing.');
      return;
    }
    try {
      await complete.mutateAsync();
      markSaved();
      onContinue();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not complete therapy review.'));
    }
  };

  const revealIncomplete = () => {
    const missing = groups
      .filter(isReviewableConditionGroup)
      .flatMap((group) => therapyReviewFieldErrors(group.review, group.medicationIds.length));
    setShowFieldErrors(true);
    const first =
      gate.unresolvedMedicationIds[0] ??
      gate.incompleteReviewKeys[0] ??
      null;
    setAttentionTarget(first);
    window.setTimeout(() => {
      const target =
        document.querySelector('[data-unresolved-panel]') ??
        document.querySelector('[data-incomplete-review="true"]');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const unanswered = target?.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
      unanswered?.focus();
    }, 0);
    window.setTimeout(() => setAttentionTarget(null), 2400);
    const incomplete = gate.itemsNeedingCompletion || missing.length;
    toast.error(
      incomplete === 1
        ? '1 condition needs completion before continuing.'
        : `${incomplete || gate.attentionCount || 1} conditions need completion before continuing.`,
    );
  };

  const applyStableToast = (data: {
    updatedConditionCount?: number;
    preservedConditionCount?: number;
    skippedUnsavedCount?: number;
  }) => {
    const updated = data.updatedConditionCount ?? 0;
    const skipped = data.skippedUnsavedCount ?? 0;
    const preserved = data.preservedConditionCount ?? 0;
    if (!updated && skipped) {
      toast.message(
        skipped === 1
          ? '1 condition with unsaved changes was not changed.'
          : `${skipped} conditions with unsaved changes were not changed.`,
        { announce: true },
      );
      return;
    }
    if (!updated) {
      toast.success('All conditions already have responses. Existing exceptions were preserved.', {
        announce: true,
      });
      return;
    }
    const parts = [
      `Stable responses applied to ${updated} condition${updated === 1 ? '' : 's'}.`,
    ];
    if (skipped) {
      parts.push(
        skipped === 1
          ? '1 condition with unsaved changes was not changed.'
          : `${skipped} conditions with unsaved changes were not changed.`,
      );
    } else if (preserved) {
      parts.push('Existing exceptions were preserved.');
    }
    toast.success(parts.join(' '), { announce: true });
  };

  const handleUndoBulk = async () => {
    if (!bulkUndo) return;
    const currentById = new Map(therapy.reviews.map((row) => [row.id, row]));
    const previousById = new Map(bulkUndo.previous.map((row) => [row.id, row]));
    try {
      for (const id of bulkUndo.updatedIds) {
        const current = currentById.get(id);
        const previous = previousById.get(id);
        if (!current || !previous) continue;
        const patch = undoBulkStablePatch(current, previous);
        if (!patch) continue;
        await patchReview.mutateAsync({ reviewId: id, patch });
      }
      setBulkUndo(null);
      markSaved();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not undo the bulk stable responses.'));
    }
  };

  const handleRemoveCondition = async (group: ReturnType<typeof groupTherapyConditions>[number]) => {
    const ids = group.medicationIds;
    if (!ids.length) {
      toast.error('This condition has no linked medications to unlink.');
      return;
    }
    try {
      for (const medicationId of ids) {
        await setIndication.mutateAsync({
          medicationId,
          conditionId: null,
          customIndicationText: null,
        });
      }
      markSaved();
      toast.success(`${group.displayName} unlinked. Assign an indication before continuing.`, {
        announce: true,
      });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove that condition.'));
    }
  };

  if (!step1Ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Confirm medications first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Therapy review starts after the pharmacist-confirmed medication list from Step 1 is available.
          </p>
        </div>
        <ClinicalStepFooter onBack={onBack} backLabel="Back to Medications" nextLabel="Continue" disabled />
      </div>
    );
  }

  if (reviewQuery.isLoading && !reviewQuery.data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Grouping medications by likely indication…</p>
      </div>
    );
  }

  if (reviewQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Couldn’t load therapy review</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMessage(reviewQuery.error, 'Condition search is temporarily unavailable. Retry or go back to medications.')}
          </p>
        </div>
        <ClinicalStepFooter
          onBack={onBack}
          backLabel="Back to Medications"
          onNext={() => void reviewQuery.refetch()}
          nextLabel="Retry"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-w-0 space-y-7">
        <section data-unresolved-panel={attentionTarget && unresolved.length ? '' : undefined}>
          <ConditionsConfirmedBar
            groups={groups}
            unresolved={unresolved}
            onViewEdit={() => setViewEditOpen(true)}
            onAddCondition={() => setAddOpen(true)}
            onSelectIndication={setEditingMedId}
          />
        </section>

        <section>
          <div className="mb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                2
              </span>
              <h2 className="text-sm font-semibold text-foreground">Current therapy review</h2>
            </div>
            <p className="mt-1 pl-[2.125rem] text-sm text-muted-foreground">
              Confirm adherence, effectiveness, and medication-related concerns for each condition.
            </p>
          </div>
          {groups.some(isConfirmedConditionGroup) ? (
            <ConditionReviewTable
              groups={groups}
              medications={medications}
              applying={applyStable.isPending}
              linking={setIndication.isPending}
              showFieldErrors={showFieldErrors}
              highlightKey={attentionTarget}
              bulkBanner={
                bulkUndo
                  ? {
                      message:
                        bulkUndo.updatedIds.length === 1
                          ? 'Stable responses applied to 1 condition.'
                          : `Stable responses applied to ${bulkUndo.updatedIds.length} conditions.`,
                      onUndo: () => void handleUndoBulk(),
                    }
                  : null
              }
              onRemoveCondition={(group) => void handleRemoveCondition(group)}
              onApplyStable={(skipReviewIds) => {
                const previous = therapy.reviews.map((row) => ({ ...row, issues: [...row.issues] }));
                applyStable.mutate(skipReviewIds, {
                  onSuccess: (data) => {
                    const skip = new Set(skipReviewIds);
                    const updatedIds = data.therapyReview.reviews
                      .filter((row) => {
                        if (skip.has(row.id)) return false;
                        const before = previous.find((item) => item.id === row.id);
                        if (!before) return false;
                        return (
                          (before.adherenceStatus == null && row.adherenceStatus === 'yes') ||
                          (before.effectivenessStatus == null && row.effectivenessStatus === 'yes') ||
                          (before.medicationConcernStatus == null && row.medicationConcernStatus === 'no')
                        );
                      })
                      .map((row) => row.id);
                    setBulkUndo(updatedIds.length ? { previous, updatedIds } : null);
                    markSaved();
                    applyStableToast(data);
                  },
                  onError: (error) => toast.error(errorMessage(error, 'Could not apply stable responses.')),
                });
              }}
              onLinkMedication={(value) => {
                setIndication.mutate(
                  {
                    medicationId: value.medicationId,
                    conditionId: value.conditionId,
                    customIndicationText: value.customConditionText,
                  },
                  {
                    onSuccess: () => {
                      markSaved();
                      toast.success(`Linked to ${value.label}.`, { announce: true });
                    },
                    onError: (error) =>
                      toast.error(errorMessage(error, 'Could not link that medication.')),
                  },
                );
              }}
              onPatch={async (reviewId, patch) => {
                try {
                  await patchReview.mutateAsync({ reviewId, patch });
                  markSaved();
                } catch (error) {
                  toast.error(errorMessage(error, 'Could not save the review answer.'));
                  throw error;
                }
              }}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Confirm or add a condition above to start the therapy review.
            </p>
          )}
        </section>
      </div>

      <ClinicalStepFooter
        sticky
        onBack={onBack}
        backLabel="Back"
        onNext={() => void handleContinue()}
        nextLabel="Continue to Monitoring"
        loading={complete.isPending}
        disabled={!gate.ok}
        disabledReason={
          gate.itemsNeedingCompletion === 1
            ? '1 condition needs completion before continuing.'
            : gate.itemsNeedingCompletion
              ? `${gate.itemsNeedingCompletion} conditions need completion before continuing.`
              : gate.attentionCount
                ? 'Complete indication mapping and condition review to continue.'
                : undefined
        }
        hint={
          gate.ok ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Therapy review complete
            </span>
          ) : (
            <span className="inline-flex flex-col items-center gap-1 text-amber-800">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {gate.itemsNeedingCompletion === 1
                  ? '1 condition needs completion before continuing.'
                  : gate.itemsNeedingCompletion
                    ? `${gate.itemsNeedingCompletion} conditions need completion before continuing.`
                    : gate.attentionCount
                      ? `${gate.attentionCount} item${gate.attentionCount === 1 ? '' : 's'} need attention before continuing.`
                      : 'Only available when all conditions are reviewed or acknowledged.'}
              </span>
              {gate.incompleteReviewKeys.length || gate.unresolvedMedicationIds.length ? (
                <button
                  type="button"
                  className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={revealIncomplete}
                >
                  View next incomplete condition
                </button>
              ) : null}
            </span>
          )
        }
      />

      <ViewEditConditionsDialog
        open={viewEditOpen}
        groups={groups}
        medications={medications}
        removing={setIndication.isPending}
        onClose={() => setViewEditOpen(false)}
        onAddCondition={() => {
          setViewEditOpen(false);
          setAddOpen(true);
        }}
        onEdit={(group) => {
          const firstId = group.medicationIds[0];
          if (firstId) {
            setViewEditOpen(false);
            setEditingMedId(firstId);
            return;
          }
          setViewEditOpen(false);
          setAddOpen(true);
        }}
        onRemove={async (group) => {
          await handleRemoveCondition(group);
          setViewEditOpen(false);
        }}
      />

      <AddConditionDialog
        open={addOpen}
        conditions={catalog}
        searchHits={searchResults}
        suggestedIds={therapy.suggestedConditionIds}
        existingConditionIds={existingConditionIds}
        medications={medications}
        medicationConditionLabels={medicationConditionLabels}
        unresolvedIds={unresolved.map((med) => med.id)}
        suggestionsUnavailable={reviewQuery.data?.suggestionsUnavailable}
        searching={search.isPending}
        saving={addCondition.isPending}
        onSearch={runSearch}
        onClose={() => setAddOpen(false)}
        onAdd={(value) => {
          const { label, ...body } = value;
          addCondition.mutate(body, {
            onSuccess: () => {
              setAddOpen(false);
              markSaved();
              toast.success(`${label} added.`);
            },
            onError: (error) => toast.error(errorMessage(error, 'Could not add that condition.')),
          });
        }}
      />

      <MedicationIndicationDialog
        open={Boolean(editingMed)}
        medication={editingMed}
        currentLabel={currentLabel}
        candidates={editingMapping?.candidates ?? []}
        peerConditions={peerConditions}
        searchHits={searchResults}
        searching={search.isPending}
        saving={setIndication.isPending}
        onSearch={runSearch}
        onClose={() => setEditingMedId(null)}
        onSave={(value) => {
          if (!editingMed) return;
          const wasChange = Boolean(currentLabel);
          setIndication.mutate(
            {
              medicationId: editingMed.id,
              conditionId: value.conditionId,
              customIndicationText: value.customIndicationText,
            },
            {
              onSuccess: () => {
                setEditingMedId(null);
                markSaved();
                toast.success(
                  wasChange
                    ? `${medicationDisplayName(editingMed)} moved to ${value.label}.`
                    : `${medicationDisplayName(editingMed)} linked to ${value.label}.`,
                );
              },
              onError: (error) =>
                toast.error(
                  errorMessage(error, 'Couldn’t save the indication change. Your previous selection has been kept.'),
                ),
            },
          );
        }}
      />
    </div>
  );
}
