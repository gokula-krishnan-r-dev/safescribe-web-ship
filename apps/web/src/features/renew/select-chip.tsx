'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SelectChip({
  selected,
  multi = false,
  showCheck = false,
  label,
  onClick,
  disabled,
  role,
}: {
  selected: boolean;
  multi?: boolean;
  showCheck?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role === 'radio' ? undefined : selected}
      aria-checked={role === 'radio' ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 text-[14px] leading-5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        'disabled:pointer-events-none disabled:opacity-50',
        multi
          ? selected
            ? 'border-primary/35 bg-[#ecf7f7] font-medium text-[#0b5f68]'
            : 'border-[#d9e4e8] bg-white text-[#102a43] hover:border-primary/35'
          : selected
            ? 'border-primary bg-primary font-medium text-white'
            : 'border-[#d9e4e8] bg-white font-medium text-[#102a43] hover:border-primary/40',
      )}
    >
      {(multi || showCheck) && selected ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : null}
      {label}
    </button>
  );
}
