'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { editorInputClass } from './editor-styles';

const QUICK_HOURS = [4, 6, 8, 12] as const;

export function CustomHourlyIntervalForm({
  initialHours,
  onApply,
  onCancel,
}: {
  initialHours?: number | null;
  onApply: (hours: number) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState(
    initialHours && initialHours >= 1 && initialHours <= 168 ? String(initialHours) : '',
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = Number.parseInt(custom, 10);
  const customValid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 168;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const applyCustom = () => {
    if (customValid) onApply(parsed);
  };

  return (
    <div className="p-4">
      <p className="text-[13px] font-semibold text-[#1e3a5f]">Set dosing interval</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        Choose a common interval or enter a whole number of hours.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_HOURS.map((hours) => (
          <Button
            key={hours}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 text-[13px]"
            onClick={() => onApply(hours)}
          >
            {hours} hours
          </Button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Other: Every</span>
        <Input
          ref={inputRef}
          value={custom}
          inputMode="numeric"
          aria-label="Custom interval hours"
          onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyCustom();
            }
          }}
          className={cn(editorInputClass, 'h-9 w-16 px-0 text-center')}
        />
        <span className="text-[13px] text-muted-foreground">hours</span>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!customValid} onClick={applyCustom}>
          Apply
        </Button>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (hours: number) => void;
}

/** Standalone popover kept for reuse; prefer CustomHourlyIntervalForm inside an existing surface. */
export function CustomHourlyIntervalPopover({ open, onOpenChange, onApply }: Props) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="pointer-events-none absolute" aria-hidden />
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[min(100vw-2rem,22rem)] p-0">
        <CustomHourlyIntervalForm
          onApply={onApply}
          onCancel={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
