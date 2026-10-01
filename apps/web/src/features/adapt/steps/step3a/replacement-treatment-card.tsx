'use client';

import { Pencil, Pill, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProposedPrescription } from '@safescript/shared';

function formatMedicationTitle(proposed: ProposedPrescription): string {
  const raw = proposed.drugName?.trim() || 'Replacement medication';
  const hay = raw.toUpperCase();
  const bits = [raw];
  const strength = proposed.strength?.replace(/\s+/g, ' ').trim();
  if (strength && !hay.includes(strength.toUpperCase())) bits.push(strength);
  const form = proposed.dosageForm
    ?.replace(/\(e?s\)/gi, '')
    .replace(/manufactured product/gi, '')
    .trim();
  if (form && !bits.join(' ').toUpperCase().includes(form.toUpperCase())) {
    bits.push(form);
  }
  return bits.join(' ').replace(/\s+/g, ' ').toUpperCase();
}

function formatRegimenSummary(proposed: ProposedPrescription): string {
  const parts: string[] = [];
  if (proposed.dose?.trim()) parts.push(proposed.dose.trim());
  if (proposed.frequency?.trim()) parts.push(proposed.frequency.trim());
  if (proposed.route?.trim()) parts.push(proposed.route.trim());
  const qty =
    proposed.quantity != null && proposed.quantity !== ''
      ? `${proposed.quantity}${proposed.quantityUnit ? ` ${proposed.quantityUnit}` : ''}`
      : '';
  if (qty) parts.push(`Qty ${qty}`);
  return parts.join(' · ');
}

/** Prescribe-style selected treatment card for Adapt replacement list. */
export function ReplacementTreatmentCard({
  proposed,
  onEdit,
  onChangeMedication,
  onRemove,
}: {
  proposed: ProposedPrescription;
  onEdit: () => void;
  onChangeMedication: () => void;
  onRemove: () => void;
}) {
  const title = formatMedicationTitle(proposed);
  const subtitle =
    proposed.genericName?.trim() ||
    proposed.brandName?.trim() ||
    '';
  const regimen = formatRegimenSummary(proposed);
  const directions = proposed.sig?.trim();

  return (
    <article className="overflow-hidden rounded-xl border border-[#d9e4e8] bg-white shadow-sm">
      <div className="border-b border-[#edf3f4] bg-[#F4FBFA] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0F6F6B]/15 text-[#0F6F6B]">
              <Pill className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0F6F6B]">
                Replacement treatment
              </p>
              <h3 className="mt-0.5 text-[15px] font-bold uppercase leading-snug text-[#102a43]">
                {title}
              </h3>
              {subtitle ? (
                <p className="mt-0.5 text-[13px] text-[#627d98]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-[#d9e4e8] text-[#102a43]"
              onClick={onEdit}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit prescription
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-[#0F6F6B] hover:bg-[#eef8f7] hover:text-[#0b5451]"
              onClick={onChangeMedication}
            >
              Change medication
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-[#9b1c1c] hover:bg-[#fef2f2] hover:text-[#7f1d1d]"
              onClick={onRemove}
              aria-label="Remove replacement treatment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {regimen ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#829ab1]">
              Regimen
            </p>
            <p className="mt-1 text-[13.5px] font-medium text-[#102a43]">{regimen}</p>
          </div>
        ) : null}
        {directions ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#829ab1]">
              Patient directions
            </p>
            <p className="mt-1 rounded-lg bg-[#f8fafb] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#334e68]">
              {directions}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
