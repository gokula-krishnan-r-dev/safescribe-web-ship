'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ── SafeScribe Clinical UI — theme-aware consultation design system ─────── */

/** Visual state for collapsible consultation sections */
export type ClinicalSectionMotionState = 'open' | 'done' | 'pending';

function motionClassForTransition(
  from: ClinicalSectionMotionState | 'none',
  to: ClinicalSectionMotionState | 'none',
): string {
  if (to === 'none') return '';
  if (from === 'open' && to === 'done') return 'clinical-section-collapse';
  if (from === 'pending' && to === 'open') return 'clinical-section-unlock';
  if (to === 'open') return 'clinical-section-expand';
  if (to === 'done') return 'clinical-section-collapse';
  if (to === 'pending') return 'clinical-section-fade';
  return 'clinical-section-fade';
}

/** Picks enter animation when a section opens, collapses, or unlocks */
export function useClinicalSectionMotion(state: ClinicalSectionMotionState | 'none'): string {
  const prev = useRef<ClinicalSectionMotionState | 'none'>(state);
  const [motionClass, setMotionClass] = useState(() => {
    if (state === 'none') return '';
    if (state === 'pending') return 'clinical-section-fade';
    return 'clinical-section-expand';
  });

  useEffect(() => {
    const from = prev.current;
    if (state === from) return;
    prev.current = state;
    setMotionClass(motionClassForTransition(from, state));
  }, [state]);

  return motionClass;
}

export function assignSectionRef(
  el: HTMLDivElement | null,
  sectionRef?: React.RefObject<HTMLDivElement | null> | React.RefCallback<HTMLDivElement | null>,
) {
  if (typeof sectionRef === 'function') sectionRef(el);
  else if (sectionRef) sectionRef.current = el;
}

export function ClinicalFieldLabel({
  children,
  required,
  optional,
  className,
}: {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'mb-2.5 block text-base font-semibold leading-snug text-foreground',
        className,
      )}
    >
      {children}
      {required && <span className="text-destructive"> *</span>}
      {optional && (
        <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
      )}
    </label>
  );
}

export function ClinicalSelect({
  label,
  value,
  options,
  onChange,
  required,
  placeholder = 'Select…',
  className,
  size = 'default',
}: {
  label: string;
  value: string;
  options: string[] | Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** `comfortable` = taller control for dense clinical forms (e.g. Lifestyle). */
  size?: 'default' | 'comfortable';
}) {
  const normalized = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  );
  const tall = size === 'comfortable';

  return (
    <div className={cn('min-w-0', className)}>
      <ClinicalFieldLabel required={required}>{label}</ClinicalFieldLabel>
      <div className="relative min-w-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className={cn(
            'w-full min-w-0 appearance-none rounded-lg border border-[#C5D0D4] bg-card text-foreground shadow-none',
            'pl-3.5 pr-10 transition-colors',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            // Keep selected labels fully readable — no truncate/ellipsis
            'whitespace-normal break-words leading-snug',
            tall ? 'min-h-[46px] py-2.5 text-[15px]' : 'h-10 text-sm',
            !value && 'text-muted-foreground',
          )}
        >
          {!value && <option value="">{placeholder}</option>}
          {normalized.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground',
          )}
          aria-hidden
        />
      </div>
    </div>
  );
}

export function ClinicalUnitInput({
  value,
  onChange,
  placeholder,
  unit,
  inputMode,
  error,
  errorMessage,
  size = 'default',
  className,
  id,
  readOnly,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
  errorMessage?: string;
  size?: 'default' | 'compact';
  className?: string;
  id?: string;
  readOnly?: boolean;
  'aria-label'?: string;
}) {
  const err = error ?? errorMessage;
  const compact = size === 'compact';
  return (
    <div className={cn('min-w-0', className)}>
      <div
        className={cn(
          'flex overflow-hidden rounded-[7px] border border-[#C5D0D4] bg-card',
          'divide-x divide-[#D8E0E3]',
          !readOnly && 'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          compact ? 'h-10' : 'h-14',
          err && 'border-destructive/60',
          readOnly && 'bg-[#f7fafb]',
        )}
      >
        <Input
          id={id}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          className={cn(
            'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0',
            compact ? 'px-2.5 text-[14px] tabular-nums' : 'px-4 text-[17px]',
            readOnly && 'cursor-default text-[#667085] opacity-50',
          )}
        />
        {unit ? (
          <span
            className={cn(
              'flex shrink-0 items-center justify-center text-[#667085]',
              compact ? 'min-w-9 px-2 text-[12px]' : 'min-w-14 px-3 text-[15px] text-[#374151]',
              readOnly && 'opacity-70',
            )}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {err && (
        <p className="mt-1.5 text-xs text-destructive">{err}</p>
      )}
    </div>
  );
}

/** Date field matching ClinicalUnitInput — full date always readable, optional Today action. */
export function ClinicalDateInput({
  value,
  onChange,
  max,
  min,
  showToday = true,
  error,
  id,
  disabled,
  className,
  iconPosition = 'left',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
  min?: string;
  showToday?: boolean;
  error?: string | null;
  id?: string;
  disabled?: boolean;
  className?: string;
  iconPosition?: 'left' | 'right';
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const isToday = Boolean(value) && value === todayIsoLocal();
  const iconRight = iconPosition === 'right';

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div
        className={cn(
          'clinical-date-field flex h-14 w-full overflow-hidden rounded-[7px] border border-[#C5D0D4] bg-card',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          error && 'border-destructive/60',
          disabled && 'bg-[#F5F8F8]',
        )}
      >
        <div className="relative min-w-0 flex-1">
          <CalendarDays
            className={cn(
              'pointer-events-none absolute top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[#667085]',
              iconRight ? 'right-3.5' : 'left-3.5',
            )}
            aria-hidden
          />
          <Input
            id={id}
            type="date"
            value={value}
            max={max}
            min={min}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={Boolean(error)}
            aria-describedby={ariaDescribedBy}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              'clinical-date-input h-full min-w-0 w-full rounded-none border-0 bg-transparent',
              'text-[15px] tabular-nums shadow-none',
              'focus-visible:border-0 focus-visible:ring-0',
              iconRight ? 'pl-4 pr-10' : 'pl-10 pr-3',
              !value && 'text-muted-foreground',
              disabled && 'cursor-not-allowed text-[#667085]',
            )}
          />
        </div>
        {showToday ? (
          <button
            type="button"
            disabled={isToday || disabled}
            onClick={() => onChange(todayIsoLocal())}
            className={cn(
              'shrink-0 border-l border-[#D8E0E3] px-3.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
              isToday || disabled
                ? 'cursor-default bg-[#F1FAF9] text-primary/70'
                : 'bg-[#F1FAF9] text-primary hover:bg-[#E8F7F5]',
            )}
            aria-label="Set measurement date to today"
          >
            Today
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export type RadioCardOption = {
  value: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export function ClinicalRadioCards({
  label,
  value,
  options,
  onChange,
  required,
  columns = 3,
}: {
  label: string;
  value: string;
  options: RadioCardOption[];
  onChange: (v: string) => void;
  required?: boolean;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div>
      <ClinicalFieldLabel required={required}>{label}</ClinicalFieldLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'grid gap-3',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-3',
          columns === 4 && 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={opt.disabled}
              onClick={() => !opt.disabled && onChange(opt.value)}
              className={cn(
                'relative flex flex-col items-center rounded-xl border-2 bg-card px-4 py-5 text-center transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-primary shadow-sm shadow-primary/10'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50',
                opt.disabled && 'cursor-not-allowed opacity-45 hover:border-border hover:bg-card',
              )}
            >
              <span
                className={cn(
                  'absolute left-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors',
                  selected
                    ? 'border-primary bg-primary'
                    : 'border-border bg-card',
                )}
                aria-hidden
              >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <div
                className={cn(
                  'mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                  selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  opt.disabled && 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <span
                className={cn(
                  'text-sm font-medium leading-snug',
                  selected ? 'text-foreground' : 'text-muted-foreground',
                  opt.disabled && 'text-muted-foreground',
                )}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type ClinicalYesNoTone = 'clinical' | 'safety';

/** SafeScribe teal clinical palette — matches diagnosis / eligibility mock */
const CLINICAL = {
  selectBg: 'bg-[#EFF9F8] dark:bg-primary/20',
  selectText: 'text-[#0F6F6B] dark:text-primary',
  selectRing: 'ring-primary/35',
  shellBorder: 'border-[#C5D0D4] dark:border-border',
  shellBorderActive: 'border-[#C5D0D4] dark:border-border',
  idleText: 'text-[#111827] dark:text-muted-foreground',
  divider: 'border-[#D8E0E3] dark:border-border',
} as const;

const PILL_SIZE = {
  sm: { root: 'h-8', segment: 'min-w-[4.5rem] px-3.5 text-xs', icon: 'h-3 w-3' },
  md: { root: 'h-10', segment: 'min-w-[5.25rem] px-5 text-sm', icon: 'h-3.5 w-3.5' },
  lg: { root: 'h-12', segment: 'min-w-[5.5rem] px-6 text-sm', icon: 'h-4 w-4' },
  /** Diagnosis confirmation mock — ~390×56 */
  xl: {
    root: 'h-14 w-full max-w-[390px]',
    segment: 'min-w-0 flex-1 px-[18px] text-[17px] font-medium',
    icon: 'h-4 w-4',
  },
  /** Safety screening mock — ~300×52 */
  safety: {
    root: 'h-[52px] w-full max-w-[300px]',
    segment: 'min-w-0 flex-1 px-4 text-base font-medium',
    icon: 'h-4 w-4',
  },
} as const;

function shellBorderClass(
  tone: ClinicalYesNoTone,
  yesSelected: boolean,
  noSelected: boolean,
) {
  if (tone === 'safety' && yesSelected) {
    return 'border-red-500 dark:border-red-400';
  }
  if (tone === 'safety' && noSelected) {
    return 'border-emerald-500 dark:border-emerald-400';
  }
  if (yesSelected || noSelected) {
    return CLINICAL.shellBorderActive;
  }
  return CLINICAL.shellBorder;
}

function segmentClass(
  tone: ClinicalYesNoTone,
  side: 'yes' | 'no',
  selected: boolean,
) {
  if (!selected) {
    return cn(
      'bg-transparent',
      CLINICAL.idleText,
      'hover:bg-muted/50 hover:text-foreground',
    );
  }
  if (tone === 'safety' && side === 'yes') {
    return 'bg-red-50 text-red-600 dark:bg-red-950/45 dark:text-red-400';
  }
  if (tone === 'safety' && side === 'no') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300';
  }
  // Fill + text only — never add an inset ring (double-border artifact against the shell).
  return cn(CLINICAL.selectBg, CLINICAL.selectText, 'font-semibold');
}

function valuesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function ClinicalYesNoToggle({
  value,
  onChange,
  yesLabel = 'Yes',
  noLabel = 'No',
  yesValue,
  noValue,
  tone = 'clinical',
  size = 'md',
  allowDeselect = true,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  yesLabel?: string;
  noLabel?: string;
  yesValue?: string;
  noValue?: string;
  tone?: ClinicalYesNoTone;
  size?: keyof typeof PILL_SIZE;
  allowDeselect?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const yesToken = yesValue ?? yesLabel;
  const noToken = noValue ?? noLabel;
  const yesSelected = valuesMatch(value, yesToken);
  const noSelected = valuesMatch(value, noToken);
  const sz = PILL_SIZE[size];

  const segments = [
    { side: 'yes' as const, label: yesLabel, token: yesToken, selected: yesSelected },
    { side: 'no' as const, label: noLabel, token: noToken, selected: noSelected },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      className={cn(
        'inline-flex min-h-10 divide-x divide-[#D8E0E3] overflow-hidden rounded-lg border bg-card shadow-none dark:divide-border',
        sz.root,
        shellBorderClass(tone, yesSelected, noSelected),
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {segments.map(({ side, label, token, selected }) => (
        <button
          key={side}
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (selected && allowDeselect) onChange('');
            else onChange(token);
          }}
          className={cn(
            'relative flex h-full min-w-[4.5rem] flex-1 items-center justify-center gap-1.5 border-0 font-semibold transition-colors duration-150',
            'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
            sz.segment,
            segmentClass(tone, side, selected),
          )}
        >
          {selected && <Check className={cn(sz.icon, 'shrink-0')} strokeWidth={2.5} />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function ClinicalCheckbox({
  checked,
  onChange,
  label,
  description,
  className,
  id,
  attention,
  attentionIntense,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: string;
  className?: string;
  id?: string;
  attention?: boolean;
  attentionIntense?: boolean;
  'aria-label'?: string;
}) {
  const inputId = id ?? `clinical-cb-${String(label).slice(0, 20)}`;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg py-2 transition-colors',
        className,
      )}
    >
      <Checkbox
        id={inputId}
        checked={checked}
        aria-label={ariaLabel}
        className="mt-0.5"
        attention={attention && !checked}
        attentionIntense={attentionIntense && !checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        )}
      </span>
    </label>
  );
}

export function ClinicalAcknowledgmentCard({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  const id = 'clinical-ack';
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors',
        checked
          ? 'border-success/40 bg-success/10'
          : 'border-border bg-muted/40 hover:bg-card',
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        className="mt-0.5"
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm font-medium leading-snug text-foreground">{children}</span>
    </label>
  );
}

type ClinicalButtonSize = 'md' | 'lg';

const clinicalPrimarySizeClass: Record<ClinicalButtonSize, string> = {
  md: 'h-10 min-w-[9rem] rounded-lg px-5 text-sm',
  lg: 'h-[52px] min-w-[9rem] rounded-lg px-6 text-base',
};

const clinicalSecondarySizeClass: Record<ClinicalButtonSize, string> = {
  md: 'h-10 rounded-lg px-4 text-sm font-medium',
  lg: 'h-[52px] rounded-lg px-6 text-base font-semibold',
};

export function ClinicalPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  loadingLabel = 'Saving…',
  /** When false, loading only disables the button — label never becomes Saving…/Saved. */
  busyFeedback = true,
  type = 'button',
  size = 'md',
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  busyFeedback?: boolean;
  type?: 'button' | 'submit';
  size?: ClinicalButtonSize;
  className?: string;
  title?: string;
}) {
  const wasLoading = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const showBusyLabel = Boolean(loading) && busyFeedback;

  useEffect(() => {
    if (!busyFeedback) {
      wasLoading.current = false;
      setShowSuccess(false);
      return;
    }
    const isLoading = Boolean(loading);
    if (wasLoading.current && !isLoading) {
      setShowSuccess(true);
      const timer = window.setTimeout(() => setShowSuccess(false), 700);
      wasLoading.current = false;
      return () => window.clearTimeout(timer);
    }
    wasLoading.current = isLoading;
  }, [loading, busyFeedback]);

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-2 border-0 font-semibold transition-[color,background-color,box-shadow,opacity] duration-150 ease-out',
        clinicalPrimarySizeClass[size],
        // No hard box-shadow edge (reads as a dark top/left border on teal fills).
        'bg-primary text-primary-foreground shadow-none hover:bg-primary/90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {showBusyLabel ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel}
        </>
      ) : showSuccess && busyFeedback ? (
        <>
          <Check className="clinical-btn-success h-4 w-4 stroke-[2.5]" aria-hidden />
          Saved
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ClinicalSecondaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  size = 'md',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  size?: ClinicalButtonSize;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 border border-border bg-card text-muted-foreground transition-colors',
        clinicalSecondarySizeClass[size],
        'hover:border-primary/30 hover:bg-muted/50 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ClinicalLinkButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80',
        'focus-visible:outline-none focus-visible:underline',
        className,
      )}
    >
      {children}
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}

export function ClinicalIconButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        variant === 'default' &&
          'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted/50 hover:text-foreground',
        variant === 'primary' &&
          'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'danger' &&
          'border-border bg-card text-destructive hover:border-destructive/30 hover:bg-destructive/10',
        disabled && 'pointer-events-none opacity-45',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function ClinicalAccordionSection({
  title,
  icon: Icon,
  badge,
  summary,
  open,
  onToggle,
  completed,
  children,
  footer,
  sectionRef,
  softShell,
}: {
  title: string;
  icon?: LucideIcon;
  badge?: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  completed?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  softShell?: boolean;
}) {
  return (
    <div
      ref={sectionRef}
      className={cn(
        'overflow-hidden rounded-xl border scroll-mt-6 [overflow-anchor:none]',
        softShell ? 'border-border bg-muted/40' : 'border-border bg-card',
        completed && !open && 'border-[#16A34A]/35 dark:border-emerald-500/40',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-4 text-left transition-colors sm:px-5',
          !open && 'hover:bg-muted/40',
          open && !softShell && 'border-b border-border',
        )}
      >
        {Icon ? (
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              completed && !open
                ? 'bg-[#16A34A] text-white dark:bg-emerald-600'
                : 'bg-primary/10 text-primary',
            )}
          >
            {completed && !open ? (
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              data-clinical-section-title
              className="text-[15px] font-semibold text-foreground"
            >
              {title}
            </p>
            {completed && !open && (
              <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#16A34A] dark:bg-emerald-950/50 dark:text-emerald-300">
                Complete
              </span>
            )}
          </div>
          {!open && summary && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
          )}
          {!open && !summary && badge && (
            <p className="mt-0.5 text-xs text-muted-foreground">{badge}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className={cn('space-y-4 px-4 pb-4 sm:px-5 sm:pb-5', softShell && 'pt-1')}>
            {children}
          </div>
          {footer ? (
            <div className="flex items-center justify-end gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ClinicalSubsectionAccordion({
  title,
  summary,
  completed,
  open,
  onToggle,
  children,
  sectionRef,
}: {
  title: string;
  summary?: string;
  completed?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  sectionRef?: React.Ref<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={sectionRef}
      className={cn(
        'overflow-hidden rounded-xl border scroll-mt-4 [overflow-anchor:none]',
        completed && !open ? 'border-[#16A34A]/35 bg-muted/40 dark:border-emerald-500/40' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-5',
          !open && 'hover:bg-muted/40',
        )}
      >
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            completed
              ? 'bg-[#16A34A] text-white dark:bg-emerald-600'
              : 'bg-primary/10 text-primary',
          )}
        >
          {completed ? (
            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {completed && (
              <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#16A34A] dark:bg-emerald-950/50 dark:text-emerald-300">
                Complete
              </span>
            )}
          </div>
          {!open && summary && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ClinicalInnerCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-muted/30 p-4 sm:p-5',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ClinicalStepProgress({
  reviewed,
  total,
  label = 'Reviewed',
}: {
  reviewed: number;
  total: number;
  label?: string;
}) {
  if (total <= 0) return null;
  const pct = Math.round((reviewed / total) * 100);

  return (
    <div className="shrink-0 text-right">
      <p className="text-xs font-medium text-muted-foreground">
        <span className="font-semibold text-foreground">{reviewed}</span> of {total} {label}
      </p>
      <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-32">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ClinicalStepFooter({
  onBack,
  onNext,
  nextLabel,
  loading,
  disabled,
  disabledReason,
  backLabel = 'Back',
  hint,
  center,
  className,
  sticky,
  size = 'md',
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel: string;
  loading?: boolean;
  disabled?: boolean;
  /** Shown on hover/focus when the next action is blocked. */
  disabledReason?: string;
  backLabel?: string;
  hint?: ReactNode;
  /** Optional mid-footer slot. */
  center?: ReactNode;
  className?: string;
  /**
   * Emphasized treatment/renew CTA styling. Actions stay in document flow
   * directly under the step content — do not pin to the viewport bottom.
   */
  sticky?: boolean;
  size?: ClinicalButtonSize;
}) {
  return (
    <div
      className={cn(
        'mt-5 flex w-full shrink-0 flex-col gap-3 border-t border-border pt-4',
        sticky && 'border-border/80 bg-consult-workspace pt-4',
        className,
      )}
    >
      {hint ? (
        <div
          className={cn(
            'text-center text-muted-foreground',
            size === 'lg' ? 'text-[13px]' : 'text-xs',
          )}
        >
          {hint}
        </div>
      ) : null}
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <ClinicalSecondaryButton
            onClick={onBack}
            size={size}
            className={
              sticky
                ? 'border-[color:var(--tx-preferred)] text-tx-preferred-fg hover:bg-tx-preferred-bg hover:text-tx-preferred-fg'
                : 'border-primary/50 text-primary hover:bg-primary/[0.05] hover:text-primary'
            }
          >
            <ChevronLeft className="h-4 w-4" />
            {backLabel}
          </ClinicalSecondaryButton>
        ) : (
          <span className="hidden sm:block sm:min-w-[7rem]" />
        )}
        {center ? (
          <div className="min-w-0 flex-1 sm:mx-3 sm:max-w-[min(100%,28rem)]">
            {center}
          </div>
        ) : null}
        {onNext ? (
          <ClinicalPrimaryButton
            onClick={onNext}
            loading={loading}
            busyFeedback={false}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            size={size}
            className={cn(
              'w-full sm:w-auto sm:shrink-0',
              sticky &&
                'bg-[color:var(--tx-preferred)] hover:bg-[color:var(--tx-preferred)]/90',
            )}
          >
            {nextLabel}
            <ChevronRight className="h-4 w-4" />
          </ClinicalPrimaryButton>
        ) : null}
      </div>
    </div>
  );
}

export function ClinicalReadOnlyField({
  label,
  value,
  unit,
  placeholder = '—',
  optional,
  size = 'default',
  trailing,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  placeholder?: string;
  optional?: boolean;
  size?: 'default' | 'compact';
  trailing?: ReactNode;
  hint?: string;
}) {
  const compact = size === 'compact';
  return (
    <div className="min-w-0">
      <ClinicalFieldLabel
        optional={optional}
        className={compact ? 'mb-1.5 text-[13px] font-semibold' : undefined}
      >
        {label}
      </ClinicalFieldLabel>
      <div className="relative">
        <Input
          value={value}
          readOnly
          tabIndex={-1}
          placeholder={placeholder}
          className={cn(
            'cursor-default rounded-[7px] border border-[#C5D0D4] bg-[#F5F8F8] text-[#667085] shadow-none focus-visible:border-[#C5D0D4] focus-visible:ring-0',
            compact ? 'h-10 px-2.5 pr-9 text-[14px] tabular-nums' : 'h-14 text-[17px]',
            unit && !trailing && (compact ? 'pr-10' : 'pr-16'),
            trailing && (compact ? 'pr-9' : 'pr-12'),
          )}
        />
        {trailing ? (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-primary">
            {trailing}
          </span>
        ) : unit ? (
          <span
            className={cn(
              'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#667085]',
              compact ? 'text-[12px]' : 'text-[15px]',
            )}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-snug text-[#667085]">{hint}</p>
      ) : null}
    </div>
  );
}

export function ClinicalBloodPressureInput({
  label = 'Blood pressure',
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
  optional,
  error,
  size = 'default',
}: {
  label?: string;
  systolic: string;
  diastolic: string;
  onSystolicChange: (v: string) => void;
  onDiastolicChange: (v: string) => void;
  optional?: boolean;
  error?: string;
  size?: 'default' | 'compact';
}) {
  const compact = size === 'compact';
  return (
    <div className="min-w-0">
      <ClinicalFieldLabel
        optional={optional}
        className={compact ? 'mb-1.5 text-[13px] font-semibold' : undefined}
      >
        {label}
      </ClinicalFieldLabel>
      <div
        className={cn(
          'flex min-w-0 items-stretch overflow-hidden rounded-[7px] border border-[#C5D0D4] bg-card',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          compact ? 'h-10' : 'h-14 min-w-[220px] max-w-[280px]',
          error && 'border-destructive/60',
        )}
      >
        <Input
          value={systolic}
          onChange={(e) => onSystolicChange(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="128"
          inputMode="numeric"
          maxLength={3}
          aria-label="Systolic blood pressure"
          className={cn(
            'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-center shadow-none focus-visible:border-0 focus-visible:ring-0',
            compact ? 'px-1.5 text-[14px] tabular-nums' : 'px-3 text-[17px]',
          )}
        />
        <span
          className={cn(
            'flex shrink-0 items-center px-0.5 font-medium text-[#98A2B3]',
            compact ? 'text-sm' : 'text-lg',
          )}
          aria-hidden
        >
          /
        </span>
        <Input
          value={diastolic}
          onChange={(e) => onDiastolicChange(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="78"
          inputMode="numeric"
          maxLength={3}
          aria-label="Diastolic blood pressure"
          className={cn(
            'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-center shadow-none focus-visible:border-0 focus-visible:ring-0',
            compact ? 'px-1.5 text-[14px] tabular-nums' : 'px-3 text-[17px]',
          )}
        />
        <span
          className={cn(
            'flex shrink-0 items-center justify-center border-l border-[#D8E0E3] text-[#667085]',
            compact ? 'min-w-[44px] px-1.5 text-[11px]' : 'min-w-[58px] px-2.5 text-[15px] text-[#374151]',
          )}
        >
          mmHg
        </span>
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/* ── Confirmable section cards (Patient Assessment collapse pattern) ─────── */

export function ClinicalChoiceGroup({
  label,
  value,
  options,
  onChange,
  required,
  error,
  className,
  id,
  'aria-label': ariaLabel,
}: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const cols =
    options.length === 2
      ? 'grid-cols-2'
      : options.length === 3
        ? 'grid-cols-3'
        : options.length === 4
          ? 'grid-cols-2 sm:grid-cols-4'
          : 'grid-cols-2 sm:grid-cols-3';

  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <ClinicalFieldLabel required={required}>{label}</ClinicalFieldLabel>
      ) : null}
      <div
        id={id}
        role="radiogroup"
        aria-label={ariaLabel ?? label}
        tabIndex={-1}
        className={cn(
          'grid min-h-[52px] overflow-hidden rounded-lg border border-[#C5D0D4] bg-card',
          'divide-x divide-[#D8E0E3]',
          cols,
        )}
      >
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(opt.value)}
              className={cn(
                'relative inline-flex h-[52px] min-w-0 items-center justify-center gap-1.5 border-0 px-3.5 text-base font-medium transition-colors',
                'focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30',
                selected
                  ? 'bg-[#F0FAF9] font-semibold text-[#0F6F6B]'
                  : 'bg-card text-[#374151] hover:bg-muted/40',
              )}
            >
              <span className="truncate">{opt.label}</span>
              {/* Reserve check width so selection does not shift the label */}
              <span className="inline-flex w-4 shrink-0 justify-center" aria-hidden>
                {selected ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Vertical stack for stepper sections — completed, active, and upcoming cards stay visible. */
export function ClinicalSectionStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-4', className)}>{children}</div>;
}

export function ClinicalPendingSummary({
  title,
  hint = 'Complete the section above to continue',
  step,
}: {
  title: ReactNode;
  hint?: string;
  /** When omitted, the indicator circle stays empty (no count). */
  step?: number | string | ReactNode;
}) {
  return (
    <div className="relative flex items-start gap-3 rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-3.5 sm:items-center sm:px-5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-xs font-semibold text-muted-foreground"
        aria-hidden={step == null}
      >
        {step != null ? step : null}
      </div>
      <div className="min-w-0 flex-1">
        <p
          data-clinical-section-title
          className="text-[15px] font-semibold text-muted-foreground"
        >
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground/80">{hint}</p>
      </div>
    </div>
  );
}

export function ClinicalCollapsedSummary({
  title,
  summary,
  onEdit,
  icon: Icon,
  step,
}: {
  title: ReactNode;
  summary: string;
  onEdit: () => void;
  icon?: LucideIcon;
  step?: number | string | ReactNode;
}) {
  return (
    <div
      className="relative grid min-h-[78px] items-center gap-4 rounded-[10px] border border-[#D5DEE1] bg-card px-6 py-3.5 shadow-[0_3px_10px_rgba(15,23,42,0.05)] sm:grid-cols-[32px_minmax(0,1fr)_auto]"
      title={summary}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
      </div>
      <div className="min-w-0">
        <p
          data-clinical-section-title
          className="text-[15px] font-semibold text-foreground"
        >
          {title}
        </p>
        <p className="mt-1 truncate text-sm leading-snug text-muted-foreground">{summary}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          'justify-self-start rounded-md px-2 py-1.5 text-sm font-semibold text-primary sm:justify-self-end',
          'hover:bg-accent hover:text-primary/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        )}
      >
        Edit
      </button>
    </div>
  );
}

export function ClinicalConfirmCard({
  title,
  open,
  completed,
  pending,
  pendingHint,
  step,
  summary,
  onEdit,
  children,
  footer,
  className,
  sectionRef,
  /** `plain` = open card without header divider (snapshot). `bar` = titled header strip. */
  headerVariant = 'plain',
  subtitle,
  required,
}: {
  title: ReactNode;
  open: boolean;
  completed?: boolean;
  pending?: boolean;
  pendingHint?: string;
  step?: number | string | ReactNode;
  summary?: string;
  onEdit: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  headerVariant?: 'plain' | 'bar';
  subtitle?: ReactNode;
  required?: boolean;
}) {
  const visualState: ClinicalSectionMotionState | 'none' = open
    ? 'open'
    : completed && summary
      ? 'done'
      : pending
        ? 'pending'
        : 'none';

  const motion = useClinicalSectionMotion(visualState);

  if (visualState === 'none') return null;

  if (visualState === 'done') {
    return (
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn('relative scroll-mt-3 [overflow-anchor:none]', motion, className)}
      >
        <ClinicalCollapsedSummary
          title={title}
          summary={summary!}
          onEdit={onEdit}
          step={step}
        />
      </div>
    );
  }

  if (visualState === 'pending') {
    return (
      <div
        ref={(el) => assignSectionRef(el, sectionRef)}
        data-clinical-section
        className={cn('relative scroll-mt-3 [overflow-anchor:none]', motion, className)}
      >
        <ClinicalPendingSummary title={title} hint={pendingHint} step={step} />
      </div>
    );
  }

  return (
    <div
      ref={(el) => assignSectionRef(el, sectionRef)}
      data-clinical-section
      className={cn(
        'scroll-mt-3 overflow-hidden rounded-[10px] border border-[#D5DEE1] bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_rgba(15,23,42,0.05)] [overflow-anchor:none]',
        motion,
        className,
      )}
    >
      {headerVariant === 'bar' ? (
        <div className="flex min-h-[70px] items-center border-b border-consult-divider px-6 sm:px-[26px]">
          <div className="min-w-0">
            <h2
              data-clinical-section-title
              className="m-0 text-[21px] font-bold leading-snug text-foreground"
            >
              {title}
              {required ? (
                <span className="ml-2.5 align-middle text-[13px] font-semibold text-destructive">
                  mandatory
                </span>
              ) : null}
            </h2>
            {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
      ) : (
        <div className="px-7 pb-0 pt-7 sm:px-[30px] sm:pt-7">
          <h2
            data-clinical-section-title
            className="m-0 text-[22px] font-bold leading-snug text-foreground"
          >
            {title}
            {required ? (
              <span className="ml-2.5 align-middle text-[13px] font-semibold text-destructive">
                mandatory
              </span>
            ) : null}
          </h2>
          {subtitle ? <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
      )}
      <div
        className={cn(
          'space-y-7',
          headerVariant === 'bar' ? 'px-6 py-5 sm:px-[26px]' : 'px-7 pb-6 pt-7 sm:px-[30px]',
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="flex min-h-[96px] w-full items-center justify-end border-t border-[#E3EAED] bg-card px-6 py-5 sm:px-[26px]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function ClinicalPathwayBanner({
  pathwayName,
  matchPercent,
  onChange,
}: {
  pathwayName: string;
  matchPercent?: number | null;
  onChange?: () => void;
}) {
  if (!pathwayName) return null;
  return (
    <div className="flex min-h-[72px] flex-col gap-3 rounded-lg border border-[#B9DFDC] bg-[#F1FAF9] px-4 py-3 sm:flex-row sm:items-center sm:gap-3.5 sm:px-5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-base text-[#1F2937]">
          <span className="font-medium">Suggested pathway:</span>{' '}
          <span className="font-semibold">{pathwayName}</span>
        </p>
        {typeof matchPercent === 'number' && matchPercent > 0 ? (
          <span className="shrink-0 rounded-[7px] bg-[#D9F0EE] px-2.5 py-1.5 text-sm font-semibold text-[#0F6F6B]">
            {Math.round(matchPercent)}%
          </span>
        ) : null}
      </div>
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          className={cn(
            'inline-flex h-11 shrink-0 items-center justify-center rounded-[7px] border border-primary bg-card px-[18px] text-[15px] font-semibold text-[#0F6F6B]',
            'hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          )}
        >
          Change
        </button>
      ) : null}
    </div>
  );
}

export function ClinicalChip({
  children,
  onRemove,
  onClick,
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-3 rounded-[7px] border border-[#8CC8C5] bg-[#F1FAF9] py-0 pl-4 pr-3.5 text-[15px] font-medium text-[#17324D]',
        'min-h-11',
        onClick && 'cursor-pointer hover:bg-[#E8F7F5]',
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'min-w-0 truncate text-left',
          !onClick && 'pointer-events-none',
        )}
        tabIndex={onClick ? 0 : -1}
      >
        {children}
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

export function ClinicalHistoryRow({
  icon: Icon,
  title,
  subtitle,
  children,
  action,
  trailing,
  className,
  onClick,
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  action?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const identity = (
    <div className="flex min-w-0 items-center gap-4">
      <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center text-primary">
        <Icon className="h-[30px] w-[30px] stroke-[1.7]" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug text-[#102A43]">{title}</p>
        {subtitle ? (
          <p className="mt-1 text-[13px] font-normal text-[#667085]">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );

  const entries = children ? (
    <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
  ) : (
    <div className="min-w-0" />
  );

  const controls =
    action || trailing ? (
      <div className="flex shrink-0 flex-wrap items-center gap-4 sm:justify-end">
        {action}
        {trailing}
      </div>
    ) : null;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'grid min-h-[92px] w-full grid-cols-1 items-center gap-4 border-b border-consult-divider px-5 py-3.5 text-left last:border-b-0 sm:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.4fr)_auto] sm:gap-6 sm:px-[26px]',
          'transition-colors hover:bg-[#FAFCFC]',
          className,
        )}
      >
        {identity}
        {entries}
        {controls}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'grid min-h-[92px] w-full grid-cols-1 items-center gap-4 border-b border-consult-divider px-5 py-3.5 last:border-b-0 sm:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.4fr)_auto] sm:gap-6 sm:px-[26px]',
        className,
      )}
    >
      {identity}
      {entries}
      {controls}
    </div>
  );
}

export function ClinicalUnitSelectInput({
  value,
  onChange,
  unit,
  units,
  onUnitChange,
  placeholder,
  inputMode,
  error,
  'aria-label': ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  units?: string[];
  onUnitChange?: (unit: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
  'aria-label'?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          'flex h-[52px] divide-x divide-[#D8E0E3] overflow-hidden rounded-lg border border-[#C5D0D4] bg-card shadow-none',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          error && 'border-destructive/60',
        )}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          aria-label={ariaLabel}
          className="h-full flex-1 rounded-none border-0 bg-transparent px-4 text-base text-foreground shadow-none placeholder:text-[#A8B3BA] focus-visible:border-0 focus-visible:ring-0"
        />
        {units && onUnitChange ? (
          <select
            value={unit}
            onChange={(e) => onUnitChange(e.target.value)}
            aria-label="Age unit"
            className="h-full min-w-[5.5rem] w-[5.5rem] appearance-none border-0 bg-transparent px-2 text-base capitalize text-[#374151] outline-none"
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex min-w-[5.5rem] w-[5.5rem] items-center justify-center text-base capitalize text-[#374151]">
            {unit}
          </span>
        )}
      </div>
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
