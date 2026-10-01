'use client';

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: { box: 'h-4 w-4', radius: 'rounded-[4px]', icon: 'h-2.5 w-2.5' },
  md: { box: 'h-[18px] w-[18px]', radius: 'rounded-[5px]', icon: 'h-3 w-3' },
} as const;

export type CheckboxProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'type' | 'size'> & {
  indeterminate?: boolean;
  /** Visual size. Default `md` is optimized for clinical forms. */
  size?: keyof typeof SIZE;
  /** Orange pulse border for required acknowledgments. */
  attention?: boolean;
  attentionIntense?: boolean;
};

/**
 * Global SafeScribe checkbox — high-contrast border + primary filled checked state.
 * Prefer this over raw `<input type="checkbox">` for consistent visibility app-wide.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      checked,
      indeterminate,
      disabled,
      size = 'md',
      attention,
      attentionIntense,
      onChange,
      ...props
    },
    ref,
  ) => {
    const localRef = React.useRef<HTMLInputElement | null>(null);
    const dims = SIZE[size];
    const isOn = Boolean(checked) || Boolean(indeterminate);

    React.useEffect(() => {
      const node = localRef.current;
      if (node) node.indeterminate = Boolean(indeterminate);
    }, [indeterminate]);

    const setRefs = (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    return (
      <span className={cn('relative inline-flex shrink-0 items-center justify-center', dims.box, className)}>
        <input
          ref={setRefs}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none flex h-full w-full items-center justify-center border-2 transition-colors',
            dims.radius,
            'bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(15,23,42,0.08)]',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 peer-focus-visible:ring-offset-1',
            'peer-disabled:opacity-50',
            isOn
              ? 'border-primary bg-primary text-primary-foreground shadow-none'
              : 'border-[#5b6b75] hover:border-primary/75',
            attention && !isOn && 'required-checkbox-attention',
            attentionIntense && !isOn && 'required-checkbox-attention-intense',
          )}
        >
          {indeterminate && !checked ? (
            <Minus className={cn(dims.icon, 'text-primary-foreground')} strokeWidth={3.5} />
          ) : checked ? (
            <Check className={cn(dims.icon, 'text-primary-foreground')} strokeWidth={3.5} />
          ) : null}
        </span>
      </span>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  description,
  className,
  id,
  disabled,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  size?: keyof typeof SIZE;
  'aria-label'?: string;
}) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg py-1 transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <Checkbox
        id={inputId}
        checked={checked}
        disabled={disabled}
        size={size}
        aria-label={ariaLabel}
        className="mt-0.5"
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
