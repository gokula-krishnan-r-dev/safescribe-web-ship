'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  /** Show a search box when options list is long */
  searchable?: boolean;
  /** Max chips before showing “+N more” */
  maxChips?: number;
  emptyMessage?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  'aria-describedby'?: string;
  /**
   * Portal to document.body. Prefer leaving this false inside Dialogs —
   * portaled menus fight Radix focus/dismiss layers and break mouse select.
   */
  portal?: boolean;
}

/**
 * Production multi-select with checkbox rows.
 * Default: inline absolute panel (safe inside Dialogs).
 * Optional portal for page-level overflow contexts.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled,
  className,
  searchable = true,
  maxChips = 3,
  emptyMessage = 'No options found',
  id,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-describedby': ariaDescribedBy,
  portal = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [mounted, setMounted] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listScrollRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0, maxHeight: 280 });

  React.useEffect(() => setMounted(true), []);

  const selected = React.useMemo(() => new Set(value), [value]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const updatePos = React.useCallback(() => {
    if (!portal) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const placeBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(320, Math.max(140, placeBelow ? spaceBelow : spaceAbove));
    setPos({
      top: placeBelow ? r.bottom + 6 : Math.max(8, r.top - maxHeight - 6),
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }, [portal]);

  React.useLayoutEffect(() => {
    if (!open || !portal) return;
    updatePos();
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && panelRef.current?.contains(t)) return;
      updatePos();
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, portal, updatePos]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    // Defer focus so Dialog focus-trap has settled; keep focus inside the panel.
    const t = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  /** Portaled menus sit outside Dialog's remove-scroll lock — scroll the list manually. */
  React.useEffect(() => {
    if (!open || !portal) return;
    const el = listScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, portal, filtered.length]);

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    // Capture so we run before Radix dismissables, but only close when truly outside.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  const toggle = React.useCallback(
    (optionValue: string) => {
      if (selected.has(optionValue)) {
        onChange(value.filter((v) => v !== optionValue));
      } else {
        onChange([...value, optionValue]);
      }
    },
    [onChange, selected, value],
  );

  const closePanel = React.useCallback((e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const clearAll = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange([]);
  };

  const selectedOptions = options.filter((o) => selected.has(o.value));
  const visibleChips = selectedOptions.slice(0, maxChips);
  const extraCount = Math.max(0, selectedOptions.length - visibleChips.length);

  const panelStyle: React.CSSProperties = portal
    ? {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        zIndex: 9999,
        // Radix Dialog sets body { pointer-events: none }; restore for portaled menus.
        pointerEvents: 'auto',
      }
    : {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 'calc(100% + 6px)',
        maxHeight: 280,
        zIndex: 60,
        pointerEvents: 'auto',
      };

  const panel = open ? (
    <div
      ref={panelRef}
      data-multi-select-dropdown=""
      role="listbox"
      aria-multiselectable
      style={panelStyle}
      className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
      onPointerDown={(e) => {
        // Keep Dialog from treating this as an outside interaction
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {searchable && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={searchPlaceholder}
            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}

      <div
        ref={listScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onWheel={(e) => e.stopPropagation()}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          filtered.map((opt) => {
            const isOn = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isOn}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  isOn ? 'bg-primary/8 text-foreground' : 'hover:bg-muted/50',
                )}
                onPointerDown={(e) => {
                  // pointerdown + preventDefault beats Dialog outside/focus handlers
                  e.preventDefault();
                  e.stopPropagation();
                  toggle(opt.value);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    isOn
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background',
                  )}
                  aria-hidden
                >
                  {isOn ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {selectedOptions.length > 0
            ? `${selectedOptions.length} selected`
            : 'None selected'}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {selectedOptions.length > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
              }}
            >
              Clear all
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground shadow-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closePanel(e);
            }}
            onClick={closePanel}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        aria-describedby={ariaDescribedBy}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            if (!open) {
              e.preventDefault();
              setOpen(true);
            }
          }
        }}
        className={cn(
          'flex min-h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-left text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-2 ring-ring/40',
          ariaInvalid && 'border-destructive',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <>
              {visibleChips.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex max-w-[9rem] items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-xs font-medium text-foreground"
                >
                  <span className="truncate">{o.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(o.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle(o.value);
                      }
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`Remove ${o.label}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
              {extraCount > 0 && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  +{extraCount} more
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {selectedOptions.length > 0 && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={clearAll}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      {portal ? (mounted && panel ? createPortal(panel, document.body) : null) : panel}
    </div>
  );
}
