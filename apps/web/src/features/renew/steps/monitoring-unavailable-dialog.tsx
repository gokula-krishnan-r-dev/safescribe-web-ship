'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';
import {
  RENEW_UNAVAILABLE_REASON_UI,
  composeUnavailableNote,
  parseUnavailableNote,
  type RenewUnavailableReasonId,
} from '@safescript/shared';

const NOTE_MAX = 200;

export function MonitoringUnavailableDialog({
  open,
  itemLabel,
  inputCode,
  initialNote,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  itemLabel: string;
  inputCode?: string | null;
  initialNote?: string | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const formId = useId();
  const [reasonId, setReasonId] = useState<RenewUnavailableReasonId | ''>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const parsed = parseUnavailableNote(initialNote);
    setReasonId(parsed.reasonId ?? '');
    setNote(parsed.extra ?? '');
    // Hydrate when the dialog opens for a row, not on every parent refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inputCode]);

  const otherNeedsNote = (reasonId === 'other' || reasonId === 'OTHER') && !note.trim();
  const canConfirm = Boolean(reasonId) && !saving && !otherNeedsNote;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="flex max-h-[min(640px,calc(100dvh-1.5rem))] max-w-[440px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-[#edf1f3] px-6 py-5 pr-12 text-left">
          <DialogTitle className="text-[17px] font-semibold text-[#163447]">
            Why is this result unavailable?
          </DialogTitle>
          <DialogDescription className="text-sm text-[#5b6b75]">
            {itemLabel ? itemLabel : 'This monitoring item'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="mb-1 text-[12px] font-semibold text-[#163447]">Reason (required)</legend>
            {RENEW_UNAVAILABLE_REASON_UI.map((reason) => {
              const reasonInputId = `${formId}-${reason.id}`;
              const selected = reasonId === reason.id;
              return (
                <label
                  key={reason.id}
                  htmlFor={reasonInputId}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    selected
                      ? 'border-[#0F6F6B]/50 bg-[#0F6F6B]/[0.06]'
                      : 'border-[#d7e2e6] bg-white hover:border-[#c5d0d4]',
                  )}
                >
                  <input
                    id={reasonInputId}
                    type="radio"
                    name={`${formId}-unavailable-reason`}
                    checked={selected}
                    onChange={() => setReasonId(reason.id)}
                    className="h-4 w-4 accent-[#0F6F6B]"
                  />
                  <span className="text-[#163447]">{reason.label}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`${formId}-note`} className="text-[13px] text-[#344054]">
              Add note{' '}
              {reasonId === 'other' || reasonId === 'OTHER' ? null : (
                <span className="font-normal text-[#7a8b94]">(optional)</span>
              )}
            </Label>
            <Textarea
              id={`${formId}-note`}
              value={note}
              maxLength={NOTE_MAX}
              disabled={saving}
              placeholder="e.g., Netcare system down during visit."
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[88px] rounded-[10px] border-[#C5D0D4]"
            />
            {otherNeedsNote ? (
              <p className="text-xs text-destructive">Add a note to continue.</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#edf1f3] px-6 py-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose} className="h-10 px-4">
            Cancel
          </Button>
          <ClinicalPrimaryButton
            loading={saving}
            disabled={!canConfirm}
            onClick={() => {
              if (!reasonId || !canConfirm) return;
              const composed = composeUnavailableNote(reasonId, note);
              if (!composed) return;
              onConfirm(composed);
            }}
            className="h-10 rounded-lg px-4"
          >
            Mark as unavailable
          </ClinicalPrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
