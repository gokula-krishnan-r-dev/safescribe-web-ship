'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SegmentOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

type BaseProps = {
  label?: string;
  /** Accessible name when visual label is omitted */
  'aria-label'?: string;
  className?: string;
  /** Larger tap targets for clinical speed */
  size?: 'default' | 'comfortable';
};

type SelectProps = BaseProps & {
  value: string;
  options: Array<string | SegmentOption>;
  onChange: (value: string) => void;
  disabled?: boolean;
};

type ActionProps = BaseProps & {
  actions: Array<{
    key: string;
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
};

function normalizeOptions(options: Array<string | SegmentOption>): SegmentOption[] {
  return options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  );
}

/**
 * Lifestyle-style segmented control — soft track + elevated selected segment.
 * Built for fast clinical selection (large hit targets, one tap).
 */
export function SegmentedControl({
  label,
  'aria-label': ariaLabel,
  value,
  options,
  onChange,
  disabled,
  className,
  size = 'default',
}: SelectProps) {
  const opts = normalizeOptions(options);
  const comfortable = size === 'comfortable';

  return (
    <div className={cn('min-w-0 w-full', className)}>
      {label ? (
        <label className="mb-2 block text-[13px] font-medium text-foreground/80">{label}</label>
      ) : null}
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? label}
        className={cn(
          'flex w-full gap-1 rounded-xl bg-muted/70 p-1 ring-1 ring-inset ring-border/50',
          disabled && 'pointer-events-none opacity-55',
        )}
      >
        {opts.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={opt.label}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg text-center font-medium leading-tight transition-[color,background-color,box-shadow,opacity] duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1',
                comfortable
                  ? 'min-h-10 px-2.5 py-2.5 text-[13px] sm:text-sm'
                  : 'min-h-9 px-1.5 py-2 text-[12px] sm:px-2 sm:text-[13px]',
                selected
                  ? 'bg-primary font-semibold text-white shadow-sm'
                  : 'bg-transparent text-[#64748B] hover:bg-white/60 hover:text-foreground',
              )}
            >
              {opt.icon}
              <span className="whitespace-normal break-words hyphens-auto">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Same chrome as SegmentedControl, but each segment fires an action
 * (Preview / Edit / Download) — one-tap clinical shortcuts.
 */
export function SegmentedActionBar({ label, actions, className, size = 'comfortable' }: ActionProps) {
  const comfortable = size === 'comfortable';

  return (
    <div className={cn('min-w-0 w-full', className)}>
      {label ? (
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div
        className="flex w-full gap-1 rounded-xl bg-muted/70 p-1 ring-1 ring-inset ring-border/50"
        role="group"
        aria-label={label ?? 'Document actions'}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            title={action.label}
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg text-center font-medium leading-tight transition-[color,background-color,box-shadow,opacity] duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1',
              'bg-transparent text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm hover:ring-1 hover:ring-border/70',
              'active:bg-background active:font-semibold active:text-foreground active:shadow-sm',
              'disabled:pointer-events-none disabled:opacity-45',
              comfortable
                ? 'min-h-10 px-2 py-2.5 text-[12px] sm:min-h-11 sm:text-[13px]'
                : 'min-h-9 px-1.5 py-2 text-[12px]',
            )}
          >
            {action.icon}
            <span className="hidden sm:inline">{action.label}</span>
            <span className="sm:hidden">{action.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
