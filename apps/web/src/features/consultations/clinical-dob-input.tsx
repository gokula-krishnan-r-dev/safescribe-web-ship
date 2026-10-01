'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { dateOfBirthError, isoDateLocal, parseIsoDateLocal } from '@safescript/shared';

/** Keep DOB entry as YYYY-MM-DD while typing digits (same pattern as patient document form). */
export function formatClinicalDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/**
 * Manual date-of-birth field for Patient snapshot.
 * YYYY-MM-DD typed entry only — no calendar popover (matches approved mock + patient details UI).
 */
export function ClinicalDobInput({
  value,
  onChange,
  max,
  min,
  error,
  id,
  disabled,
  className,
  'aria-label': ariaLabel = 'Date of birth',
  'aria-describedby': ariaDescribedBy,
}: {
  value: string;
  onChange: (iso: string) => void;
  max?: string;
  min?: string;
  error?: string | null;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const maxIso = max ?? isoDateLocal();
  const minIso = min;

  const liveError = (() => {
    if (error) return error;
    const raw = value.trim();
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw.length >= 10 ? 'Enter a valid date.' : null;
    }
    const parsed = parseIsoDateLocal(raw);
    if (!parsed) return 'Enter a valid date.';
    if (minIso && raw < minIso) return 'Enter a realistic date of birth.';
    if (raw > maxIso) return 'Date of birth cannot be in the future.';
    return dateOfBirthError(raw);
  })();

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div
        className={cn(
          'flex h-14 w-full overflow-hidden rounded-[7px] border border-[#C5D0D4] bg-card',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          liveError && 'border-destructive/60',
          disabled && 'bg-[#F5F8F8]',
        )}
      >
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          value={value}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={Boolean(liveError)}
          aria-describedby={ariaDescribedBy}
          onChange={(e) => onChange(formatClinicalDobInput(e.target.value))}
          className={cn(
            'h-full min-w-0 w-full rounded-none border-0 bg-transparent px-4',
            'text-[15px] tabular-nums shadow-none placeholder:text-muted-foreground',
            'focus-visible:border-0 focus-visible:ring-0',
            disabled && 'cursor-not-allowed text-[#667085]',
          )}
        />
      </div>
      {liveError ? <p className="mt-1.5 text-xs text-destructive">{liveError}</p> : null}
    </div>
  );
}
