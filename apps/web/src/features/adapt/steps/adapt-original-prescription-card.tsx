'use client';

import { useMemo } from 'react';
import { AlertCircle, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import {
  ADAPT_DISPENSING_STATUS_OPTIONS,
  type AdaptDispensingStatus,
  type RenewMedication,
} from '@safescript/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatMedicationDisplay } from '../format';

interface Props {
  medication: RenewMedication;
  status: AdaptDispensingStatus;
  onStatusChange: (status: AdaptDispensingStatus) => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function AdaptOriginalPrescriptionCard({
  medication,
  status,
  onStatusChange,
  onEdit,
  onRemove,
}: Props) {
  const display = useMemo(() => formatMedicationDisplay(medication), [medication]);

  const currentStatusLabel =
    ADAPT_DISPENSING_STATUS_OPTIONS.find((s) => s.value === status)?.label ??
    'Not yet dispensed';

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[#d9e4e8] bg-white px-5 py-3.5 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out hover:border-[#b8ced4]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className="break-words text-[15px] font-bold leading-snug text-[#102a43]"
              title={display.title}
            >
              {display.title}
            </p>
            <p className="mt-0.5 text-xs font-medium text-[#7b8b94]">{display.dosageForm}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F6F6B] hover:text-[#0b5451] transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
          {/* Directions (SIG) */}
          <div className="min-w-0 border-t border-[#f0f4f6] pt-3 sm:border-t-0 sm:pt-0 lg:border-l-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#7b8b94]">
              Directions (SIG)
            </p>
            {display.hasDirections ? (
              <>
                <p
                  className="mt-0.5 line-clamp-2 text-sm text-[#102a43]"
                  title={display.directions}
                >
                  {display.directions}
                </p>
                {display.quantity ? (
                  <p className="mt-0.5 text-xs font-medium text-[#7b8b94]">{display.quantity}</p>
                ) : null}
              </>
            ) : (
              <div className="mt-0.5 space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Not specified
                </p>
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-xs font-medium text-[#0F6F6B] hover:text-[#0b5451] hover:underline transition-colors"
                >
                  Add directions
                </button>
              </div>
            )}
          </div>

          {/* Prescriber */}
          <div className="min-w-0 border-t border-[#f0f4f6] pt-3 sm:border-t-0 sm:pt-0 lg:border-l lg:border-[#f0f4f6] lg:pl-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#7b8b94]">
              Prescriber
            </p>
            <p className="mt-0.5 truncate text-sm text-[#102a43]" title={display.prescriber}>
              {display.prescriber}
            </p>
          </div>

          {/* Date Written */}
          <div className="min-w-0 border-t border-[#f0f4f6] pt-3 sm:border-t-0 sm:pt-0 lg:border-l lg:border-[#f0f4f6] lg:pl-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#7b8b94]">
              Date written
            </p>
            <p className="mt-0.5 truncate text-sm text-[#102a43]">{display.dateWritten}</p>
          </div>

          {/* Dispensing Status */}
          <div className="min-w-0 border-t border-[#f0f4f6] pt-3 sm:border-t-0 sm:pt-0 lg:border-l lg:border-[#f0f4f6] lg:pl-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#7b8b94]">Status</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="-ml-1 mt-0.5 inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm text-[#102a43] transition-colors hover:text-[#0F6F6B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6F6B]/30"
                >
                  <span className="truncate">{currentStatusLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8a9aa3]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44 p-1">
                {ADAPT_DISPENSING_STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => onStatusChange(opt.value)}
                    className="cursor-pointer text-xs font-medium text-[#102a43]"
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {!display.hasDirections ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-red-200/80 bg-red-50 px-3.5 py-2.5"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          <div className="min-w-0 text-sm leading-snug text-red-900">
            <p className="font-semibold">Original directions are missing.</p>
            <p className="mt-0.5 text-red-800/90">
              Add the prescribed directions before continuing so the proposed adaptation can be
              compared accurately.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
