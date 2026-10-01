'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  medicationClinicalLabel,
  medicationDisplayName,
  medicationQuantityLabel,
  type RenewMedication,
} from '@safescript/shared';
import { displayOrUnidentified, formatFillDate, unidentified } from '../format';

export function MedicationReviewTable({
  items,
  collapsed,
  embedded,
  onExpand,
  onEdit,
  onDelete,
  onEditAll,
}: {
  items: RenewMedication[];
  collapsed: boolean;
  embedded?: boolean;
  onExpand: () => void;
  onEdit: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onEditAll?: () => void;
}) {
  const visible = collapsed && items.length > 8 ? items.slice(0, 8) : items;
  const hidden = items.length - visible.length;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const alive = new Set(items.map((med) => med.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [items]);

  const visibleIds = useMemo(() => visible.map((med) => med.id), [visible]);
  const selectedCount = selectedIds.size;
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const selectedList = [...selectedIds];

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#163447]">
          {items.length} medication{items.length === 1 ? '' : 's'} added
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedCount > 0 ? (
            <>
              <span className="px-1 text-[12px] font-medium text-[#5b6b75]">
                {selectedCount} selected
              </span>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="inline-flex h-8 items-center rounded-md px-2 text-[12px] font-medium text-[#7b8b94] hover:bg-[#f4f8f8] hover:text-[#163447] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                Clear
              </button>
            </>
          ) : null}
          {onEditAll && items.length > 0 ? (
            <button
              type="button"
              onClick={onEditAll}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit all
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'min-w-0 overflow-x-auto',
          embedded
            ? 'rounded-xl border border-[#d9e3e6]'
            : 'rounded-xl border border-[#d9e3e6] bg-white',
        )}
      >
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-12" />
            <col className="w-[24%]" />
            <col className="w-[28%]" />
            <col className="w-16" />
            <col className="w-[16%]" />
            <col className="w-[6.75rem]" />
            <col className="w-[5.5rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#edf3f4] bg-[#f7fbfb] text-[11px] font-semibold uppercase tracking-wide text-[#7b8b94]">
              <th className="px-3 py-2.5">
                <SelectCheckbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onChange={toggleVisible}
                  label={allVisibleSelected ? 'Deselect all medications' : 'Select all medications'}
                />
              </th>
              <th className="px-2 py-2.5">Medication</th>
              <th className="px-3 py-2.5">Directions</th>
              <th className="px-2 py-2.5 text-right">Qty</th>
              <th className="px-3 py-2.5">Prescriber</th>
              <th className="px-3 py-2.5">Fill date</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((med) => (
              <MedicationRow
                key={med.id}
                med={med}
                selected={selectedIds.has(med.id)}
                onSelect={(checked) => toggleOne(med.id, checked)}
                onEdit={() => onEdit(med.id)}
                onDelete={() => onDelete([med.id])}
              />
            ))}
          </tbody>
        </table>
        {hidden > 0 ? (
          <button
            type="button"
            onClick={onExpand}
            className="w-full border-t border-[#edf3f4] px-4 py-2.5 text-left text-sm font-medium text-primary hover:bg-primary/[0.03]"
          >
            + {hidden} more medication{hidden === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          selectedCount === 1
            ? 'Remove this medication?'
            : `Remove ${selectedCount} medications?`
        }
        description={
          selectedCount === 1
            ? 'It will be removed from this renewal list. You can undo this from the confirmation toast.'
            : 'Selected medications will be removed from this renewal list. You can undo this from the confirmation toast.'
        }
        confirmLabel={selectedCount === 1 ? 'Remove' : `Remove ${selectedCount}`}
        onConfirm={() => {
          onDelete(selectedList);
          setSelectedIds(new Set());
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}

function MedicationRow({
  med,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  med: RenewMedication;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = medicationDisplayName(med);
  const clinical = medicationClinicalLabel(med);
  const directions = med.normalized.directions || med.raw.directionsText;
  const qtyLabel =
    med.normalized.quantity != null
      ? String(med.normalized.quantity)
      : medicationQuantityLabel(med);
  const prescriber = med.normalized.prescriberName;
  const fill = formatFillDate(med.normalized.lastFillDate || med.normalized.prescribedDate);
  const needsReview =
    med.reviewStatus === 'needs_review' || med.resolutionStatus === 'PHARMACIST_REVIEW_REQUIRED';

  return (
    <tr
      className={cn(
        'border-b border-[#edf3f4] last:border-0',
        selected ? 'bg-primary/[0.04]' : 'hover:bg-[#f7fbfb]/80',
      )}
    >
      <td className="px-3 py-3 align-top">
        <SelectCheckbox
          checked={selected}
          onChange={onSelect}
          label={`Select ${name}`}
        />
      </td>
      <td className="px-2 py-3 align-top">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 break-words font-medium text-[#163447]">{name}</p>
          {needsReview ? (
            <span className="rounded-full border border-amber-300/80 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              Review
            </span>
          ) : null}
        </div>
        {clinical ? (
          <p className="mt-0.5 min-w-0 break-words text-[12px] text-[#7b8b94]">{clinical}</p>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top text-[#2b3c46]">
        {med.directionsStatus === 'UNAVAILABLE' ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-800">
            Directions not confirmed
          </span>
        ) : (
          <span className="block min-w-0 break-words">
            <MutedValue value={directions} />
          </span>
        )}
      </td>
      <td className="px-2 py-3 align-top text-right tabular-nums">
        <MutedValue value={qtyLabel} />
      </td>
      <td className="px-3 py-3 align-top">
        <span className="block min-w-0 break-words">
          <MutedValue value={prescriber} />
        </span>
      </td>
      <td className="px-3 py-3 align-top whitespace-nowrap">
        <MutedValue value={fill} />
      </td>
      <td className="px-2 py-3 align-top">
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            aria-label={`Edit ${name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            aria-label={`Remove ${name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      size="sm"
      className="mt-0.5"
    />
  );
}

function MutedValue({ value }: { value?: string | number | null }) {
  const missing = unidentified(value);
  return (
    <span className={cn(missing && 'text-[#9aa8b0]')}>
      {displayOrUnidentified(value)}
    </span>
  );
}
