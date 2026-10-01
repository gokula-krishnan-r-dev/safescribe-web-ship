'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ADAPTATION_TYPES, type AdaptStepOne, type ProposedPrescription } from '@safescript/shared';
import { hasProposedPrescriptionEdits } from './map-drug-to-proposed';

function formatOriginalMedication(step1: AdaptStepOne): string {
  const originalRx = step1.originalPrescription;
  const generic = originalRx?.normalized?.genericName?.trim();
  const brand = originalRx?.normalized?.brandName?.trim();
  const strength = originalRx?.normalized?.strength?.trim();
  const form = originalRx?.normalized?.dosageForm?.trim();
  const raw = originalRx?.raw?.medicationText?.trim();

  if (generic && brand && brand.toLowerCase() !== generic.toLowerCase()) {
    return [generic, `(${brand})`, strength, form].filter(Boolean).join(' ');
  }
  if (generic || brand) {
    return [generic || brand, strength, form].filter(Boolean).join(' ');
  }
  return raw || 'Original medication';
}

export function SharedSummaryHeader({
  step1,
  proposedPrescription,
  onChangeAdaptationType,
}: {
  step1: AdaptStepOne;
  proposedPrescription: ProposedPrescription;
  onChangeAdaptationType: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const originalRx = step1.originalPrescription;

  const medLine = formatOriginalMedication(step1);
  const sig =
    originalRx?.raw?.directionsText ||
    originalRx?.normalized?.directions ||
    '—';
  const qty = originalRx?.raw?.quantityText || originalRx?.normalized?.quantity || '—';
  const refills =
    originalRx?.normalized?.refillsRemaining != null
      ? String(originalRx.normalized.refillsRemaining)
      : originalRx?.normalized?.previousAuthorizedRefills != null
        ? String(originalRx.normalized.previousAuthorizedRefills)
        : '—';
  const typeLabel =
    ADAPTATION_TYPES.find((t) => t.id === step1.adaptationType)?.label ||
    step1.adaptationType ||
    '—';
  const reasonLabel = step1.adaptationReason?.label || '—';
  const reasonDetail = step1.additionalComments?.trim();

  const handleChangeClick = () => {
    if (hasProposedPrescriptionEdits(proposedPrescription)) {
      setConfirmOpen(true);
      return;
    }
    onChangeAdaptationType();
  };

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 rounded-xl border border-[#e2eaed] bg-white px-4 py-3.5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#829ab1]">
            Original prescription
          </p>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-[#102a43]">{medLine}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#52677a]">{sig}</p>
          <p className="mt-2 text-[11px] text-[#829ab1]">
            Qty {String(qty)}
            <span className="mx-1.5 text-[#c5d0d4]">·</span>
            Refills {String(refills)}
          </p>
        </div>

        <div className="hidden items-center justify-center text-[#b0c4cb] lg:flex" aria-hidden>
          <ArrowRight className="h-4 w-4" />
        </div>

        <div className="relative min-w-0 flex-1 rounded-xl border border-[#e2eaed] bg-white px-4 py-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#829ab1]">
                Reason for adaptation
              </p>
              <p className="mt-1.5 text-[15px] font-semibold leading-snug text-[#102a43]">
                {typeLabel}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#52677a]">{reasonLabel}</p>
              {reasonDetail ? (
                <p className="mt-1 line-clamp-2 text-xs text-[#627d98]">{reasonDetail}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleChangeClick}
              className="h-[30px] shrink-0 rounded-[7px] border-[#d9e4e8] bg-white px-2.5 text-[12.5px] font-semibold text-[#102a43] hover:bg-slate-50"
            >
              Change adaptation type
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Change adaptation type?"
        description="You have already entered proposed prescription details. Changing the adaptation type will take you back to Step 1 and invalidate the current proposal and safety checks."
        confirmLabel="Change type"
        cancelLabel="Keep editing"
        variant="default"
        onConfirm={() => {
          setConfirmOpen(false);
          onChangeAdaptationType();
        }}
      />
    </>
  );
}
