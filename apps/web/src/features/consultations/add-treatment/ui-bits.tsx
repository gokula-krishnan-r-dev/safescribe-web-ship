'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, ClipboardList, Plus, Stethoscope, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
    >
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
    </label>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[12px] text-destructive">
      {message}
    </p>
  );
}

export function SubsectionLabel({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[13px] font-semibold tracking-tight text-foreground">
      {children}
    </h4>
  );
}

export function NumberedSection({
  step,
  title,
  children,
  alerts,
}: {
  step?: number;
  title: string;
  children: ReactNode;
  alerts?: string[];
}) {
  const unique = [...new Set((alerts ?? []).map((m) => m.trim()).filter(Boolean))];
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {step != null ? (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[13px] font-bold text-primary"
              aria-hidden
            >
              {step}
            </span>
          ) : null}
          <h3 className="text-[15.5px] font-bold tracking-tight text-foreground">
            {title}
          </h3>
        </div>
        {unique.length === 1 ? (
          <p
            role="alert"
            aria-live="polite"
            className="flex max-w-full items-center gap-1.5 text-[12.5px] leading-snug text-destructive sm:max-w-[22rem] sm:justify-end sm:text-right"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{unique[0]}</span>
          </p>
        ) : null}
      </div>
      {unique.length > 1 ? (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-1.5"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            {unique.map((msg) => (
              <p key={msg} className="text-[12.5px] leading-snug text-destructive">
                {msg}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ModeActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-11 min-h-11 items-center gap-1.5 rounded-lg border border-primary/35 bg-card px-3',
        'text-[13px] font-semibold text-primary transition-colors',
        'hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
      )}
    >
      {children}
    </button>
  );
}

export function IconTooltipButton({
  label,
  tooltip,
  onClick,
  variant = 'outline',
  disabled,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  variant?: 'outline' | 'solid' | 'ghost';
  disabled?: boolean;
}) {
  const tipId = useId();
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-describedby={tipId}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              'disabled:pointer-events-none disabled:opacity-40',
              variant === 'solid' && 'bg-primary text-primary-foreground hover:bg-primary/90',
              variant === 'outline' &&
                'border border-primary/40 bg-primary/[0.08] text-primary hover:bg-primary/15',
              variant === 'ghost' &&
                'border border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {variant === 'ghost' ? (
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          id={tipId}
          role="tooltip"
          side="top"
          className="border-transparent bg-[#14324d] px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg"
        >
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ExpandableOptionalSection({
  title,
  helper,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  helper: string;
  icon: 'clipboard' | 'stethoscope';
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const Icon = icon === 'stethoscope' ? Stethoscope : ClipboardList;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'overflow-hidden rounded-xl border bg-card transition-colors',
        open
          ? 'border-primary/25 shadow-[0_1px_0_rgba(8,125,181,0.06)]'
          : 'border-[color:var(--consult-card-border)]',
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30"
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            open ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{helper}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>
      ) : null}
    </div>
  );
}

export function LabeledInput({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  type = 'text',
  inputMode,
  disabled,
  className,
  min,
  showInlineError = true,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  disabled?: boolean;
  className?: string;
  min?: number;
  showInlineError?: boolean;
  describedBy?: string;
}) {
  const errorId = `${id}-error`;
  const described =
    error && showInlineError ? errorId : describedBy;
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        value={value}
        type={type}
        inputMode={inputMode}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[10px]"
      />
      {showInlineError ? <FieldError id={errorId} message={error} /> : null}
    </div>
  );
}

export function LabeledSelect({
  id,
  label,
  value,
  onChange,
  options,
  error,
  required,
  disabled,
  className,
  placeholder,
  showInlineError = true,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  showInlineError?: boolean;
  describedBy?: string;
}) {
  const errorId = `${id}-error`;
  const described = error && showInlineError ? errorId : describedBy;
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        className="h-10 rounded-[10px]"
      />
      {showInlineError ? <FieldError id={errorId} message={error} /> : null}
    </div>
  );
}

export function AutoGrowTextarea({
  id,
  value,
  onChange,
  onFocus,
  error,
  describedBy,
  placeholder,
  minLines = 2,
  maxLines = 4,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  error?: string;
  describedBy?: string;
  placeholder?: string;
  minLines?: number;
  maxLines?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22.5;
    const padY =
      Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const minH = lineHeight * minLines + padY;
    const maxH = lineHeight * maxLines + padY;
    el.style.height = '0px';
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH + 1 ? 'auto' : 'hidden';
  }, [minLines, maxLines]);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <textarea
      ref={ref}
      id={id}
      value={value}
      rows={minLines}
      placeholder={placeholder}
      aria-invalid={Boolean(error)}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onInput={syncHeight}
      className={cn(
        'w-full resize-none rounded-[10px] border border-input bg-card px-3 py-2 text-[14px] leading-relaxed shadow-sm',
        'placeholder:text-muted-foreground focus-visible:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/25',
        className,
      )}
    />
  );
}

export function LabeledTextarea({
  id,
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  rows = 3,
  helper,
  helperPlacement = 'before',
  onFocus,
  autoGrow,
  minLines = 2,
  maxLines = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  helper?: string;
  helperPlacement?: 'before' | 'after';
  onFocus?: () => void;
  autoGrow?: boolean;
  minLines?: number;
  maxLines?: number;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      {helper && helperPlacement === 'before' ? (
        <p className="mb-1.5 text-[12.5px] text-muted-foreground">{helper}</p>
      ) : null}
      {autoGrow ? (
        <AutoGrowTextarea
          id={id}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          error={error}
          describedBy={error ? errorId : undefined}
          placeholder={placeholder}
          minLines={minLines}
          maxLines={maxLines}
        />
      ) : (
        <Textarea
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          className="resize-y rounded-[10px] text-[14px] leading-relaxed"
        />
      )}
      {helper && helperPlacement === 'after' ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{helper}</p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
