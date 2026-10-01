'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatConditionCategory,
  isConfirmedConditionGroup,
  medicationShortName,
  type RenewMedication,
  type TherapyConditionGroup,
} from '@safescript/shared';
import { resolveLinkedMedications, useLinkedMedicationLookup } from './linked-medication-links';

export function ViewEditConditionsDialog({
  open,
  groups,
  medications,
  removing,
  onClose,
  onAddCondition,
  onEdit,
  onRemove,
}: {
  open: boolean;
  groups: TherapyConditionGroup[];
  medications: RenewMedication[];
  removing?: boolean;
  onClose: () => void;
  onAddCondition: () => void;
  onEdit: (group: TherapyConditionGroup) => void;
  onRemove: (group: TherapyConditionGroup) => Promise<void> | void;
}) {
  const rows = groups.filter(isConfirmedConditionGroup);
  const byId = useLinkedMedicationLookup(medications);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirming = rows.find((row) => row.key === confirmKey) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmKey(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg gap-0 p-0 sm:rounded-2xl">
        <div className="px-6 pb-3 pt-5">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-[18px] font-bold tracking-tight text-[#102a43]">
              Conditions and linked medications
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#52677a]">
              Change the indication mapping here. Medication identity is edited in Step 1.
            </DialogDescription>
          </DialogHeader>
        </div>

        {confirming ? (
          <div className="space-y-4 px-6 pb-6">
            <p className="text-sm font-semibold text-[#102a43]">Remove this condition?</p>
            <p className="text-[13px] leading-snug text-[#52677a]">
              This will unlink {confirming.displayName} from the current renewal review. Medication(s)
              must still have a confirmed indication before continuing.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => setConfirmKey(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-lg bg-[#b4232a] hover:bg-[#9b1c24]"
                disabled={removing}
                onClick={() => {
                  void Promise.resolve(onRemove(confirming)).then(() => setConfirmKey(null));
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ul className="max-h-[min(28rem,55vh)] space-y-2 overflow-y-auto px-6">
              {rows.map((group, index) => {
                const linked = resolveLinkedMedications(group.medicationIds, byId);
                const category = formatConditionCategory(group.category);
                return (
                  <li
                    key={group.key}
                    className="flex items-start justify-between gap-3 rounded-xl border border-[#e0e8ea] bg-white px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-snug text-[#102a43]">
                        <span className="mr-1.5 text-[#8a9aa3]">{index + 1}.</span>
                        {group.displayName}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">
                        {linked.length
                          ? linked.map((med) => medicationShortName(med)).join(', ')
                          : 'No medications linked yet'}
                      </p>
                      {category ? (
                        <span className="mt-1.5 inline-flex rounded-full bg-[#eef4f6] px-2 py-0.5 text-[11px] font-medium text-[#52677a]">
                          {category}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${group.displayName}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#52677a] hover:bg-[#f4f8f9] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                        onClick={() => onEdit(group)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${group.displayName}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#52677a] hover:bg-[#fef2f2] hover:text-[#b4232a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                        onClick={() => setConfirmKey(group.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 px-6 py-4">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                onClick={onAddCondition}
              >
                <Plus className="h-3.5 w-3.5" />
                Add condition
              </button>
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
