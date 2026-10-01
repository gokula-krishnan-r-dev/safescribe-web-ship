'use client';

import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  medicationClinicalLabel,
  medicationDisplayName,
  medicationQuantityLabel,
  type RenewMedication,
} from '@safescript/shared';
import { displayOrUnidentified, formatFillDate } from '../format';

export function MedicationExtractionReview({
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onAddSelected,
  onDiscard,
}: {
  items: RenewMedication[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (next: boolean) => void;
  onEdit: (id: string) => void;
  onAddSelected: () => void;
  onDiscard: () => void;
}) {
  if (!items.length) return null;
  const allSelected = items.every((item) => selectedIds.has(item.id));
  const selectedCount = items.filter((item) => selectedIds.has(item.id)).length;

  return (
    <section className="overflow-hidden rounded-xl border border-primary/25 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf3f4] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#163447]">Review medications found</h3>
          <p className="mt-0.5 text-[12px] text-[#7b8b94]">
            Confirm extracted rows before they are added to this renewal. Missing values are left unidentified.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] font-medium text-[#5b6b75]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#c9d7db] text-primary focus:ring-primary/25"
            checked={allSelected}
            onChange={(event) => onToggleAll(event.target.checked)}
          />
          Select all
        </label>
      </div>

      <ul className="divide-y divide-[#edf3f4]">
        {items.map((med) => {
          const checked = selectedIds.has(med.id);
          const name = medicationDisplayName(med);
          const clinical = medicationClinicalLabel(med);
          const directions = med.normalized.directions || med.raw.directionsText;
          const qty =
            med.normalized.quantity != null
              ? String(med.normalized.quantity)
              : medicationQuantityLabel(med);
          const needsReview =
            med.reviewStatus === 'needs_review' || med.resolutionStatus === 'PHARMACIST_REVIEW_REQUIRED';

          return (
            <li key={med.id} className={cn('flex items-start gap-3 px-4 py-3', checked && 'bg-primary/[0.03]')}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[#c9d7db] text-primary focus:ring-primary/25"
                checked={checked}
                onChange={() => onToggle(med.id)}
                aria-label={`Select ${name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#163447]">{name}</p>
                  {needsReview ? (
                    <span className="rounded-full border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      Review
                    </span>
                  ) : null}
                </div>
                {clinical ? <p className="mt-0.5 text-[12px] text-[#7b8b94]">{clinical}</p> : null}
                <p className="mt-1 text-[12px] text-[#5b6b75]">
                  {displayOrUnidentified(directions)}
                  <span className="mx-1.5 text-[#c9d7db]">·</span>
                  Qty {displayOrUnidentified(qty)}
                  <span className="mx-1.5 text-[#c9d7db]">·</span>
                  {displayOrUnidentified(med.normalized.prescriberName)}
                  <span className="mx-1.5 text-[#c9d7db]">·</span>
                  {displayOrUnidentified(formatFillDate(med.normalized.lastFillDate || med.normalized.prescribedDate))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(med.id)}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-primary/10"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#edf3f4] bg-[#f7fbfb] px-4 py-3">
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-[#5b6b75] hover:bg-white hover:text-[#163447]"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={onAddSelected}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Add selected medications
        </button>
      </div>
    </section>
  );
}
