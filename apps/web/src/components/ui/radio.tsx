'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: { box: 'h-4 w-4', dot: 'h-1.5 w-1.5' },
  md: { box: 'h-[18px] w-[18px]', dot: 'h-2 w-2' },
} as const;

export type RadioProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'type' | 'size'> & {
  /** Visual size. Default `md` matches the global checkbox. */
  size?: keyof typeof SIZE;
};

/**
 * Global SafeScribe radio — high-contrast border + primary selected indicator.
 * Prefer this over raw `<input type="radio">` / faint custom circles.
 */
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, checked, disabled, size = 'md', ...props }, ref) => {
    const dims = SIZE[size];
    const isOn = Boolean(checked);

    return (
      <span className={cn('relative inline-flex shrink-0 items-center justify-center', dims.box, className)}>
        <input
          ref={ref}
          type="radio"
          checked={checked}
          disabled={disabled}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none flex h-full w-full items-center justify-center rounded-full border-2 transition-colors',
            'bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(15,23,42,0.08)]',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-focus-visible:ring-offset-1',
            'peer-disabled:opacity-50',
            isOn
              ? 'border-primary shadow-none'
              : 'border-[#5b6b75] hover:border-primary/75',
          )}
        >
          {isOn ? <span className={cn('rounded-full bg-primary', dims.dot)} /> : null}
        </span>
      </span>
    );
  },
);
Radio.displayName = 'Radio';

export function RadioField({
  checked,
  onChange,
  name,
  value,
  label,
  className,
  id,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: () => void;
  name: string;
  value: string;
  label: React.ReactNode;
  className?: string;
  id?: string;
  disabled?: boolean;
  size?: keyof typeof SIZE;
}) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-[13px] leading-5 transition-colors',
        checked ? 'font-medium text-foreground' : 'text-foreground/90',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <Radio
        id={inputId}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        size={size}
        className="mt-0.5"
        onChange={() => onChange()}
      />
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}
