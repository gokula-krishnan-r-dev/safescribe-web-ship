'use client';

import { useEffect, useId, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';
import { MONITORING_REMOVAL_REASONS, type MonitoringRemovalReasonId } from '@safescript/shared';

export function MonitoringRemoveDialog({
  open,
  itemLabel,
  requiredWarning,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  itemLabel: string;
  requiredWarning?: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (reasonCode: MonitoringRemovalReasonId, reasonText?: string | null) => void;
}) {
  const formId = useId();
  const [reasonCode, setReasonCode] = useState<MonitoringRemovalReasonId | ''>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setReasonCode('');
    setNote('');
  }, [open, itemLabel]);

  const otherNeedsNote = reasonCode === 'OTHER' && !note.trim();
  const canConfirm = Boolean(reasonCode) && !saving && !otherNeedsNote;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="flex max-h-[min(640px,calc(100dvh-1.5rem))] max-w-[440px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-[#edf1f3] px-6 py-5 pr-12 text-left">
          <DialogTitle className="text-[17px] font-semibold text-[#163447]">Why is this monitoring item not relevant?</DialogTitle>
          <DialogDescription className="text-sm text-[#5b6b75]">
            {itemLabel || 'This monitoring item'}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {requiredWarning ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-5 text-amber-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>This monitoring item is configured as required. A reason is required to remove it from this review.</p>
            </div>
          ) : null}
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="mb-1 text-[12px] font-semibold text-[#163447]">Reason (required)</legend>
            {MONITORING_REMOVAL_REASONS.map((reason) => {
              const id = `${formId}-${reason.id}`;
              const selected = reasonCode === reason.id;
              return (
                <label
                  key={reason.id}
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                    selected ? 'border-[#0F6F6B] bg-[#0F6F6B]/5' : 'border-[#e8eef1] bg-white',
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    className="mt-0.5"
                    name={`${formId}-reason`}
                    checked={selected}
                    onChange={() => setReasonCode(reason.id)}
                  />
                  <span className="text-[#163447]">{reason.label}</span>
                </label>
              );
            })}
          </fieldset>
          <label className="mt-4 block">
            <span className="text-[12px] font-semibold text-[#163447]">Note (optional)</span>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              rows={3}
              className="mt-1.5 resize-none rounded-[10px] border-[#C5D0D4]"
              placeholder="Add a note"
            />
          </label>
          <p className="mt-3 rounded-xl border border-[#d7e8f4] bg-[#f3f8fc] px-3.5 py-2.5 text-[12px] leading-5 text-[#1e4b73]">
            This removes the item from this renewal only. You can restore it later if needed.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#edf1f3] px-6 py-4">
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <ClinicalPrimaryButton
            onClick={() => {
              if (!reasonCode) return;
              onConfirm(reasonCode, note.trim() || null);
            }}
            disabled={!canConfirm}
            loading={saving}
            loadingLabel="Removing…"
          >
            Remove from this review
          </ClinicalPrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
