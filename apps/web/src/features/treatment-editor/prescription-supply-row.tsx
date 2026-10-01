'use client';

import { useState } from 'react';
import { Check, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { unitSelectBinding } from '@/features/consultations/add-treatment/form-options';
import type { DurationUnit } from '@/features/consultations/add-treatment/types';
import { EditorCard } from './selected-treatment-header';
import { editorInputCompactClass } from './editor-styles';
import { DurationUnitSelect, DurationValueInput } from './duration-controls';
import type { QuantityStatus } from './types';

const QUANTITY_BADGE: Record<QuantityStatus, string> = {
  AUTO_CALCULATED: 'Auto-calculated',
  PATHWAY_SUGGESTED: 'Pathway suggested',
  PHARMACIST_MODIFIED: 'Pharmacist modified',
  REVIEW_REQUIRED: 'Review required',
};

interface Props {
  durationValue: string | null;
  durationUnit: DurationUnit | null;
  quantityValue: string;
  quantityUnit: string;
  refills: number;
  quantityStatus: QuantityStatus;
  quantityExplanation?: string;
  allowedQuantityUnits?: string[];
  errors?: Record<string, string>;
  disabled?: boolean;
  idPrefix?: string;
  /** Pathway catalog authoring stores duration only — hide dispense/refills. */
  showDispense?: boolean;
  calculatedFromSchedule?: boolean;
  showResetCalculated?: boolean;
  onResetCalculated?: () => void;
  onChange: (patch: {
    durationValue?: string | null;
    durationUnit?: DurationUnit | null;
    quantityValue?: string;
    quantityUnit?: string;
    refills?: number;
  }) => void;
}

export function PrescriptionSupplyRow({
  durationValue,
  durationUnit,
  quantityValue,
  quantityUnit,
  refills,
  quantityStatus,
  quantityExplanation,
  allowedQuantityUnits,
  errors,
  disabled,
  idPrefix = 'supply',
  showDispense = true,
  calculatedFromSchedule = false,
  showResetCalculated: _showResetCalculated = false,
  onResetCalculated,
  onChange,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const unit = durationUnit ?? 'DAY';

  return (
    <EditorCard
      title={showDispense ? 'Prescription supply' : 'Duration'}
      badge={showDispense ? QUANTITY_BADGE[quantityStatus] : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5 text-[13.5px] text-[#344054]">
        <span className="font-medium text-[#1e3a5f]">Supply for</span>
        <DurationValueInput
          id={`${idPrefix}-days`}
          value={durationValue ?? ''}
          disabled={disabled}
          invalid={Boolean(errors?.durationValue)}
          ariaLabel="Days supply"
          onChange={(value) =>
            onChange({
              durationValue: value.trim() || null,
              durationUnit: unit,
            })
          }
        />
        <DurationUnitSelect
          value={unit}
          count={durationValue}
          disabled={disabled}
          invalid={Boolean(errors?.durationUnit)}
          ariaLabel="Supply unit"
          onChange={(next) => onChange({ durationUnit: next })}
        />

        {showDispense ? (
        <>
        <span className="px-0.5 text-[#98a2b3]" aria-hidden>
          →
        </span>

        <span className="font-medium text-[#1e3a5f]">Dispense</span>
        <Input
          id={`${idPrefix}-qty`}
          value={quantityValue}
          inputMode="decimal"
          disabled={disabled}
          aria-label="Dispense quantity"
          aria-invalid={Boolean(errors?.quantityValue)}
          onChange={(e) => onChange({ quantityValue: e.target.value })}
          className={editorInputCompactClass}
        />
        <SearchableSelect
          id={`${idPrefix}-qty-unit`}
          {...unitSelectBinding('quantity', quantityUnit, allowedQuantityUnits)}
          placeholder="Unit"
          searchPlaceholder="Search unit…"
          emptyMessage="No units"
          disabled={disabled}
          aria-label="Quantity unit"
          onChange={(v) => onChange({ quantityUnit: v })}
          className="min-w-[7.5rem] max-w-[11rem]"
        />

        <span className="px-0.5 text-[#98a2b3]" aria-hidden>
          ·
        </span>

        <span className="font-medium text-[#1e3a5f]">Refills</span>
        <div className="inline-flex h-10 overflow-hidden rounded-[10px] border border-[#d8e0e3] bg-white">
          <button
            type="button"
            aria-label="Decrease refills"
            disabled={disabled}
            className="px-3 text-[#667085] transition-colors hover:bg-[#f4f7f8] disabled:opacity-50"
            onClick={() => onChange({ refills: Math.max(0, refills - 1) })}
          >
            −
          </button>
          <span className="flex min-w-[2.25rem] items-center justify-center border-x border-[#e6ecee] text-[13px] font-semibold text-[#1e3a5f]">
            {refills}
          </span>
          <button
            type="button"
            aria-label="Increase refills"
            disabled={disabled}
            className="px-3 text-[#667085] transition-colors hover:bg-[#f4f7f8] disabled:opacity-50"
            onClick={() => onChange({ refills: refills + 1 })}
          >
            +
          </button>
        </div>

        </>
        ) : null}

        {showDispense && quantityExplanation ? (
          <Popover open={infoOpen} onOpenChange={setInfoOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Quantity calculation details"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-[#3d6b9a] hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/20"
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-w-xs p-3 text-[13px] leading-relaxed">
              {quantityExplanation}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {showDispense && calculatedFromSchedule ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] bg-[#e7f6ee] px-3 py-2 text-[12.5px] text-[#1b7a4e]">
          <p className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-medium">
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            Quantity and days calculated from dosing schedule
          </p>
          {onResetCalculated ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onResetCalculated}
              className="shrink-0 font-semibold text-[#3d6b9a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/25 disabled:opacity-50"
            >
              Reset to calculated
            </button>
          ) : null}
        </div>
      ) : null}
    </EditorCard>
  );
}
