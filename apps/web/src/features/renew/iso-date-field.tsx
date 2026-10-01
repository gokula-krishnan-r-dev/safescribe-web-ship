'use client';

import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  formatIsoDateInput,
  isoCalendarDateError,
  isoDateLocal,
  parseIsoDateLocal,
  toIsoCalendarDate,
} from '@safescript/shared';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FIELD =
  'h-10 rounded-[10px] border-[#C5D0D4] shadow-none focus-visible:border-[#0F6F6B]/40 focus-visible:ring-[#0F6F6B]/20';

export function IsoDateField({
  id,
  value,
  onChange,
  disabled,
  max,
  min,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  max?: string;
  min?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const [open, setOpen] = useState(false);
  const maxIso = max ?? isoDateLocal();
  const selected = parseIsoDateLocal(value.trim());
  const error =
    value.trim().length >= 10 ? isoCalendarDateError(value, { max: maxIso, min }) : null;
  const errorId = id ? `${id}-error` : undefined;
  const startMonth = useMemo(() => (min ? parseIsoDateLocal(min) : new Date(1990, 0, 1)), [min]);
  const endMonth = useMemo(() => parseIsoDateLocal(maxIso) ?? new Date(), [maxIso]);
  const maxDate = parseIsoDateLocal(maxIso);
  const minDate = min ? parseIsoDateLocal(min) : null;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="yyyy-mm-dd"
          disabled={disabled}
          value={value}
          aria-label={ariaLabel}
          aria-invalid={Boolean(error)}
          aria-describedby={[ariaDescribedBy, error ? errorId : ''].filter(Boolean).join(' ') || undefined}
          onChange={(event) => {
            const next = event.target.value;
            onChange(toIsoCalendarDate(next) ?? formatIsoDateInput(next));
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            const iso = toIsoCalendarDate(text);
            if (!iso) return;
            event.preventDefault();
            onChange(iso);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          className={cn(FIELD, 'pr-10 tabular-nums')}
        />
        <Popover modal open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open calendar"
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8] hover:text-[#163447] disabled:pointer-events-none disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="z-[80] w-auto p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Calendar
              mode="single"
              selected={selected ?? undefined}
              defaultMonth={selected ?? endMonth}
              captionLayout="dropdown"
              startMonth={startMonth ?? undefined}
              endMonth={endMonth}
              disabled={[
                ...(maxDate ? [{ after: maxDate }] : []),
                ...(minDate ? [{ before: minDate }] : []),
              ]}
              onSelect={(date) => {
                onChange(date ? isoDateLocal(date) : '');
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
