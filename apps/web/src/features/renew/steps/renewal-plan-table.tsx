'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  formatPlanItemDuration,
  type RenewDurationId,
  type RenewMedicationPlanRow,
} from '@safescript/shared';

const CUSTOM_DURATION_DEBOUNCE_MS = 400;

export function RenewalPlanTable({
  rows,
  durationOptions,
  customLimits,
  disabled,
  highlightId,
  onToggle,
  onDuration,
}: {
  rows: RenewMedicationPlanRow[];
  durationOptions: Array<{ id: RenewDurationId; label: string }>;
  customLimits: { min: number; max: number };
  disabled?: boolean;
  highlightId?: string | null;
  onToggle: (medicationId: string, selected: boolean) => void;
  onDuration: (medicationId: string, durationId: RenewDurationId, customDurationDays?: number | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d7e2e6] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#d7e2e6] bg-[#f7fafb] text-[11px] font-semibold uppercase tracking-wide text-[#5b6b75]">
              <th className="w-10 px-3 py-2.5" aria-label="Select" />
              <th className="px-2 py-2.5">Medication</th>
              <th className="px-3 py-2.5">Directions</th>
              <th className="px-3 py-2.5">Safety / monitoring</th>
              <th className="px-3 py-2.5">Renewal duration</th>
              <th className="px-3 py-2.5 text-right">Renew?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PlanRow
                key={row.medicationId}
                row={row}
                durationOptions={durationOptions}
                customLimits={customLimits}
                disabled={disabled}
                highlight={highlightId === row.medicationId}
                onToggle={onToggle}
                onDuration={onDuration}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanRow({
  row,
  durationOptions,
  customLimits,
  disabled,
  highlight,
  onToggle,
  onDuration,
}: {
  row: RenewMedicationPlanRow;
  durationOptions: Array<{ id: RenewDurationId; label: string }>;
  customLimits: { min: number; max: number };
  disabled?: boolean;
  highlight?: boolean;
  onToggle: (medicationId: string, selected: boolean) => void;
  onDuration: (medicationId: string, durationId: RenewDurationId, customDurationDays?: number | null) => void;
}) {
  const durationLabel = formatPlanItemDuration(row);
  const formLabel = row.formLabel || row.quantityLabel;
  const [customDaysDraft, setCustomDaysDraft] = useState(
    row.customDurationDays != null ? String(row.customDurationDays) : '',
  );
  const onDurationRef = useRef(onDuration);
  const debounceRef = useRef<number | null>(null);
  onDurationRef.current = onDuration;

  const flushCustomDays = () => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const parsed = customDaysDraft.trim() === '' ? null : Number(customDaysDraft);
    const days = parsed != null && Number.isFinite(parsed) ? parsed : null;
    if (days === row.customDurationDays) return;
    onDurationRef.current(row.medicationId, 'custom', days);
  };

  useEffect(() => {
    setCustomDaysDraft(row.customDurationDays != null ? String(row.customDurationDays) : '');
  }, [row.customDurationDays, row.medicationId]);

  useEffect(() => {
    if (row.durationId !== 'custom' || disabled) return;
    const parsed = customDaysDraft.trim() === '' ? null : Number(customDaysDraft);
    const days = parsed != null && Number.isFinite(parsed) ? parsed : null;
    if (days === row.customDurationDays) return;

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      onDurationRef.current(row.medicationId, 'custom', days);
    }, CUSTOM_DURATION_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [customDaysDraft, disabled, row.customDurationDays, row.durationId, row.medicationId]);

  return (
    <tr
      data-renew-plan-row={row.medicationId}
      className={cn(
        'border-b border-[#e8eef1] last:border-b-0',
        highlight && 'bg-amber-50/70',
      )}
    >
      <td className="px-3 py-3 align-top">
        <Checkbox
          checked={row.selected}
          disabled={disabled}
          size="sm"
          className="mt-0.5"
          aria-label={`Select ${row.displayName} for renewal`}
          onChange={(event) => onToggle(row.medicationId, event.target.checked)}
        />
      </td>
      <td className="px-2 py-3 align-top">
        <p className="font-semibold text-[#163447]">{row.displayName}</p>
        {formLabel ? <p className="mt-0.5 text-[12px] text-[#5b6b75]">{formLabel}</p> : null}
      </td>
      <td className="px-3 py-3 align-top text-[#3e4b55]">{row.directions || '—'}</td>
      <td className="px-3 py-3 align-top">
        <SafetyCell tone={row.safety.tone} label={row.safety.label} note={row.safety.note} />
        {row.durationApplyNote ? (
          <p className="mt-2 inline-flex max-w-[280px] items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] leading-snug text-amber-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {row.durationApplyNote}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        {row.selected ? (
          <div className="flex min-w-[132px] flex-col gap-1.5">
            <select
              className="h-8 rounded-md border border-[#d7e2e6] bg-white px-2 text-[13px] text-[#163447] disabled:bg-[#f7fafb] disabled:text-[#5b6b75]"
              value={row.durationId ?? ''}
              disabled={disabled}
              aria-label={`Renewal duration for ${row.displayName}`}
              onChange={(event) => {
                const nextId = event.target.value as RenewDurationId;
                onDuration(
                  row.medicationId,
                  nextId,
                  nextId === 'custom' ? row.customDurationDays : null,
                );
              }}
            >
              <option value="" disabled>
                Select…
              </option>
              {durationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {row.durationId === 'custom' ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={customLimits.min}
                  max={customLimits.max}
                  step={1}
                  className="h-8 w-20 rounded-md border border-[#d7e2e6] px-2 text-[13px] tabular-nums"
                  value={customDaysDraft}
                  disabled={disabled}
                  aria-label={`Custom duration in days for ${row.displayName}`}
                  onChange={(event) => setCustomDaysDraft(event.target.value)}
                  onBlur={flushCustomDays}
                />
                <span className="text-[12px] text-[#5b6b75]">days</span>
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[#5b6b75]">{durationLabel ?? '—'}</span>
        )}
      </td>
      <td className="px-3 py-3 align-top text-right">
        <span
          className={cn(
            'inline-flex h-7 min-w-[4.25rem] items-center justify-center rounded-md px-2.5 text-[12px] font-semibold',
            row.selected ? 'bg-[#edf8f1] text-[#166534]' : 'bg-[#f3f4f6] text-[#4b5563]',
          )}
        >
          {row.selected ? 'Yes' : 'No'}
        </span>
      </td>
    </tr>
  );
}

function SafetyCell({
  tone,
  label,
  note,
}: {
  tone: RenewMedicationPlanRow['safety']['tone'];
  label: string;
  note: string | null;
}) {
  const displayLabel = tone === 'review' ? 'Review required' : label;
  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          tone === 'clear' && 'bg-[#1f8a4c]',
          (tone === 'unavailable' || tone === 'review') && 'bg-amber-500',
        )}
        aria-hidden
      />
      <div>
        <p
          className={cn(
            'font-medium',
            tone === 'clear' && 'text-[#166534]',
            (tone === 'unavailable' || tone === 'review') && 'text-amber-800',
          )}
        >
          {displayLabel}
        </p>
        {note ? <p className="mt-0.5 text-[12px] text-[#5b6b75]">{note}</p> : null}
      </div>
    </div>
  );
}
