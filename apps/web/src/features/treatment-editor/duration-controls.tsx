'use client';

import { Input } from '@/components/ui/input';
import type { DurationUnit } from '@/features/consultations/add-treatment/types';
import { editorInputClass, editorInputCompactClass } from './editor-styles';

const DURATION_LABELS: Record<DurationUnit, string> = {
  DAY: 'Day',
  WEEK: 'Week',
  MONTH: 'Month',
};

export const DURATION_UNIT_ORDER: DurationUnit[] = ['DAY', 'WEEK', 'MONTH'];

export function durationUnitLabel(unit: DurationUnit, count?: string | null): string {
  const n = Number(count);
  const plural = !count || !Number.isFinite(n) || n !== 1;
  return `${DURATION_LABELS[unit]}${plural ? 's' : ''}`;
}

export function DurationValueInput({
  id,
  value,
  disabled,
  invalid,
  ariaLabel,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      id={id}
      value={value}
      inputMode="decimal"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value)}
      className={editorInputCompactClass}
    />
  );
}

export function DurationUnitSelect({
  value,
  count,
  disabled,
  invalid,
  ariaLabel,
  onChange,
}: {
  value: DurationUnit;
  count?: string | null;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel: string;
  onChange: (unit: DurationUnit) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value as DurationUnit)}
      className={`${editorInputClass} h-10 w-auto min-w-[5.5rem] appearance-none pr-8`}
    >
      {DURATION_UNIT_ORDER.map((key) => (
        <option key={key} value={key}>
          {durationUnitLabel(key, count)}
        </option>
      ))}
    </select>
  );
}
