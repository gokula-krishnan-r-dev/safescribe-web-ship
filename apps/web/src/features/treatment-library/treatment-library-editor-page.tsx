'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { TreatmentFormDialog, type TreatmentFormData } from '@/features/pathways/treatment-form-dialog';
import type { TreatmentEditorMode } from '@/features/pathways/treatment-option-editor-constants';
import { api } from '@/lib/api-client';
import { toastError } from '@/lib/errors';
import {
  formDataToLibraryPayload,
  useCreateLibraryTreatment,
  useLibraryWorkflow,
  useRetireLibraryTreatment,
  useSaveLibraryDraft,
  useTreatmentLibraryItem,
  useTreatmentLibraryUsage,
} from './hooks';
import { libraryVersionToClinicalTreatment } from './library-form-adapter';

export function TreatmentLibraryEditorPage({ itemId }: { itemId?: string }) {
  const router = useRouter();
  const isNew = !itemId;
  const detailQuery = useTreatmentLibraryItem(itemId);
  const create = useCreateLibraryTreatment();
  const workingId = detailQuery.data?.workingVersion?.id ?? '';
  const saveDraft = useSaveLibraryDraft(itemId ?? '', workingId);
  const workflow = useLibraryWorkflow(itemId ?? '', workingId);
  const retire = useRetireLibraryTreatment(itemId ?? '');
  const [usageOpen, setUsageOpen] = useState(false);
  const [reviewNotesOpen, setReviewNotesOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [retireOpen, setRetireOpen] = useState(false);
  const usage = useTreatmentLibraryUsage(usageOpen && itemId ? itemId : null);

  const item = detailQuery.data?.item;
  const working = detailQuery.data?.workingVersion;
  const status = item?.status;
  const canEdit =
    isNew || status === 'DRAFT' || status === 'CHANGES_REQUESTED';
  const canReview = status === 'IN_REVIEW' && Boolean(working?.id);

  const treatment = useMemo(() => {
    if (!detailQuery.data) return null;
    return libraryVersionToClinicalTreatment(detailQuery.data, working);
  }, [detailQuery.data, working]);

  const back = () => router.push('/super-admin/treatment-library');

  const persist = async (data: TreatmentFormData, mode: TreatmentEditorMode) => {
    const payload = formDataToLibraryPayload(data);
    try {
      if (isNew) {
        const created = await create.mutateAsync(payload);
        const createdId = created.item.id;
        const versionId = created.workingVersion?.id;
        if (mode === 'validate' && versionId) {
          const res = await api.post<{
            checks: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
          }>(`/treatment-library/${createdId}/versions/${versionId}/validate`, {});
          showValidation(res);
        } else if (mode === 'submit' && versionId) {
          await api.post(
            `/treatment-library/${createdId}/versions/${versionId}/submit-review`,
            {},
          );
          toast.success('Submitted for clinical review.');
        } else {
          toast.success('Draft saved.');
        }
        router.replace(`/super-admin/treatment-library/${createdId}`);
        return;
      }

      if (!itemId || !workingId) {
        toast.error('This version cannot be edited.');
        return;
      }

      if (mode === 'draft' || mode === 'submit' || mode === 'validate') {
        if (canEdit) await saveDraft.mutateAsync(payload);
      }
      if (mode === 'validate') {
        const res = await workflow.validate.mutateAsync();
        showValidation(res);
        return;
      }
      if (mode === 'submit') {
        await workflow.submit.mutateAsync();
        toast.success('Submitted for clinical review.');
        return;
      }
      toast.success('Draft saved.');
    } catch (error) {
      toastError(error, 'Could not save the library treatment.');
    }
  };

  const showValidation = (res: {
    checks: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
  }) => {
    const failed = res.checks.filter((c) => !c.ok);
    if (failed.length === 0) {
      toast.success('Validation passed. Ready for clinical review.');
      return;
    }
    toast.error(failed.map((c) => c.detail || c.label).join(' · '));
  };

  const busy =
    create.isPending ||
    saveDraft.isPending ||
    workflow.submit.isPending ||
    workflow.validate.isPending ||
    workflow.approve.isPending ||
    workflow.requestChanges.isPending ||
    workflow.newVersion.isPending ||
    retire.isPending;

  if (!isNew && detailQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F6F6B]" />
      </div>
    );
  }

  if (!isNew && detailQuery.isError) {
    return (
      <div className="rounded-xl border border-[#E9A4A8] bg-[#FFF5F5] px-5 py-10 text-center">
        <p className="font-semibold text-[#B4232A]">This treatment could not be loaded.</p>
        <Button className="mt-3" variant="outline" onClick={back}>
          Back to Treatment Library
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#52606D] hover:text-[#111827]"
        >
          <ChevronLeft className="h-4 w-4" />
          Treatment Library
        </button>
        {item && status !== 'RETIRED' ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 text-[13px]"
            onClick={() => setRetireOpen(true)}
          >
            Retire
          </Button>
        ) : null}
      </div>

      <TreatmentFormDialog
        open
        onOpenChange={(next) => {
          if (!next) back();
        }}
        treatment={isNew ? null : treatment}
        loading={busy}
        formContext="library"
        presentation="page"
        readOnly={!canEdit}
        libraryStatus={status}
        libraryFooter={
          canReview
            ? 'review'
            : status === 'APPROVED' || status === 'RETIRED'
              ? 'approved'
              : 'draft'
        }
        onLibraryAction={async (action) => {
          if (action === 'back') {
            back();
            return;
          }
          if (action === 'usage') {
            setUsageOpen(true);
            return;
          }
          if (action === 'requestChanges') {
            setReviewNotesOpen(true);
            return;
          }
          try {
            if (action === 'newVersion') {
              await workflow.newVersion.mutateAsync();
              toast.success('A new draft version was created.');
            }
            if (action === 'approve') {
              await workflow.approve.mutateAsync();
              toast.success('Treatment approved and published.');
            }
          } catch (error) {
            toastError(error, 'Could not complete that action.');
          }
        }}
        onSubmit={persist}
      />

      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Pathway usage</DialogTitle>
          <DialogDescription>
            Pathways that currently snapshot this library treatment.
          </DialogDescription>
          {usage.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading usage…</p>
          ) : usage.data?.items.length ? (
            <ul className="space-y-2 text-sm">
              {usage.data.items.map((row) => (
                <li key={row.pathwayTreatmentId} className="rounded-lg border border-[#E4ECEF] px-3 py-2">
                  <p className="font-semibold text-[#111827]">{row.pathwayName}</p>
                  <p className="text-[#66727D]">
                    {row.province} · v{row.sourceVersionNumber ?? '—'} · {row.pathwayStatus}
                    {row.hasUpdateAvailable ? ' · update available' : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              This treatment is not linked to any pathways yet.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={reviewNotesOpen} onOpenChange={setReviewNotesOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Return for changes</DialogTitle>
          <DialogDescription>Tell the author what needs to be updated.</DialogDescription>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-[#C5D0D4] p-3 text-sm"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Review notes"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewNotesOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#0F6F6B] hover:bg-[#0c5c59]"
              onClick={async () => {
                try {
                  await workflow.requestChanges.mutateAsync(reviewNotes.trim() || undefined);
                  toast.success('Returned for changes.');
                  setReviewNotesOpen(false);
                  setReviewNotes('');
                } catch (error) {
                  toastError(error, 'Could not return this treatment.');
                }
              }}
            >
              Return for changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title="Retire this library treatment?"
        description="History is kept. Pathways already using a snapshot are not changed."
        confirmLabel="Retire"
        variant="destructive"
        loading={retire.isPending}
        onConfirm={async () => {
          try {
            await retire.mutateAsync();
            toast.success('Treatment retired.');
            setRetireOpen(false);
          } catch (error) {
            toastError(error, 'Could not retire this treatment.');
          }
        }}
      />
    </div>
  );
}
