'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { editorInputClass, editorSelectTriggerClass } from './editor-styles';
import {
  buildCustomTimingLabel,
  frequencyValueFromCustomTiming,
  parseCustomTimingDraft,
  type CustomTimingPeriod,
} from './timing-presets';

const PERIODS: Array<{ value: CustomTimingPeriod; label: string }> = [
  { value: 'HOUR', label: 'hours' },
  { value: 'DAY', label: 'days' },
  { value: 'WEEK', label: 'weeks' },
  { value: 'MONTH', label: 'months' },
];

const QUICK_PATTERNS: Array<{ label: string; count: number; period: CustomTimingPeriod }> = [
  { label: 'Every other day', count: 2, period: 'DAY' },
  { label: 'Three times weekly', count: 3, period: 'WEEK' },
  { label: 'Once monthly', count: 1, period: 'MONTH' },
];

export function CustomTimingForm({
  initialValue,
  onApply,
  onCancel,
}: {
  initialValue?: string;
  onApply: (frequencyValue: string) => void;
  onCancel: () => void;
}) {
  const draft = parseCustomTimingDraft(initialValue);
  const [count, setCount] = useState(String(draft.count));
  const [period, setPeriod] = useState<CustomTimingPeriod>(draft.period);
  const [label, setLabel] = useState(draft.label);
  const [labelEdited, setLabelEdited] = useState(Boolean(draft.label));
  const countRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countRef.current?.focus();
    countRef.current?.select();
  }, []);

  const parsedCount = Number.parseInt(count, 10);
  const countValid = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 168;
  const generated = countValid ? buildCustomTimingLabel(parsedCount, period) : '';
  const displayLabel = labelEdited ? label : generated;
  const canApply = displayLabel.trim().length > 0 && !displayLabel.includes('_');

  const applyPattern = (nextCount: number, nextPeriod: CustomTimingPeriod, nextLabel?: string) => {
    setCount(String(nextCount));
    setPeriod(nextPeriod);
    const resolved = nextLabel ?? buildCustomTimingLabel(nextCount, nextPeriod);
    setLabel(resolved);
    setLabelEdited(Boolean(nextLabel) && nextLabel !== buildCustomTimingLabel(nextCount, nextPeriod));
  };

  const apply = () => {
    if (!canApply) return;
    if (countValid) {
      onApply(frequencyValueFromCustomTiming(parsedCount, period, displayLabel));
      return;
    }
    onApply(displayLabel.trim());
  };

  return (
    <div className="p-4">
      <p className="text-[13px] font-semibold text-[#1e3a5f]">Custom timing</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        Enter how often this should be taken. The closed selector will show the label below, never a blank interval.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-[#52606d]">Every</span>
        <Input
          ref={countRef}
          value={count}
          inputMode="numeric"
          aria-label="Custom timing interval"
          onChange={(e) => {
            setCount(e.target.value.replace(/\D/g, ''));
            setLabelEdited(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          className={cn(editorInputClass, 'h-9 w-16 px-0 text-center')}
        />
        <select
          aria-label="Custom timing period"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as CustomTimingPeriod);
            setLabelEdited(false);
          }}
          className={cn(editorSelectTriggerClass, 'h-9 min-w-[7.5rem]')}
        >
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_PATTERNS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={cn(
              'rounded-full border border-[#d8e0e3] bg-[#f4f7f8] px-2.5 py-1 text-[12.5px] font-medium text-[#52606d] hover:border-[#0F817C]/40 hover:bg-[#e8f6f4] hover:text-[#0f766e]',
              displayLabel === item.label && 'border-[#0F817C]/50 bg-[#e8f6f4] text-[#0f766e]',
            )}
            onClick={() => applyPattern(item.count, item.period, item.label)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="text-[12px] font-medium text-[#52606d]">Shown on the prescription</span>
        <Input
          value={displayLabel}
          placeholder="e.g. every other day, with breakfast"
          aria-label="Custom timing label"
          onChange={(e) => {
            setLabel(e.target.value);
            setLabelEdited(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          className={cn(editorInputClass, 'mt-1 h-9')}
        />
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!canApply} onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}
