'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

export type PharmacistActionOptionItem = {
  id: string;
  label: string;
};

type PharmacistActionGroupProps = {
  name: string;
  value: string;
  options: PharmacistActionOptionItem[];
  onChange: (id: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
};

/**
 * Full-row single-select action controls for monitoring review.
 * Visual weight is intentional — the pharmacist decision must read as a clinical choice.
 */
export function PharmacistActionGroup({
  name,
  value,
  options,
  onChange,
  disabled,
  'aria-label': ariaLabel = 'Pharmacist action',
  className,
}: PharmacistActionGroupProps) {
  return (
    <div
      className={cn('space-y-2', className)}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <PharmacistActionOption
          key={option.id}
          name={name}
          option={option}
          selected={value === option.id}
          disabled={disabled}
          onSelect={() => onChange(option.id)}
        />
      ))}
    </div>
  );
}

function PharmacistActionOption({
  name,
  option,
  selected,
  disabled,
  onSelect,
}: {
  name: string;
  option: PharmacistActionOptionItem;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const inputId = useId();

  return (
    <label
      htmlFor={inputId}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'group flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[11px] border-[1.5px] px-3.5 py-2.5 transition-[background-color,border-color,box-shadow] duration-150',
        selected
          ? 'border-primary bg-primary/[0.06]'
          : 'border-[#C5D0D4] bg-white hover:border-primary/40 hover:bg-[#f7fafb]',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/30 focus-within:ring-offset-2',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="relative mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          id={inputId}
          type="radio"
          name={name}
          value={option.id}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none flex h-full w-full items-center justify-center rounded-full border-2 transition-colors duration-150',
            selected
              ? 'border-primary bg-primary'
              : 'border-[#8a9aa3] bg-white group-hover:border-primary/55',
          )}
        >
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 text-[13px] leading-[1.35] text-[#163447]',
          selected ? 'font-semibold' : 'font-normal',
        )}
      >
        {option.label}
      </span>
    </label>
  );
}
