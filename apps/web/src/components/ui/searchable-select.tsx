'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDialogLayer } from '@/components/ui/dialog-layer';
import {
  applySearchableSelectQuery,
  computeSearchableSelectPosition,
  isSearchableSelectQueryKey,
} from '@/components/ui/searchable-select-position';

export const SEARCHABLE_SELECT_DROPDOWN_ATTR = 'data-searchable-select-dropdown';

export interface SearchableSelectOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
  keywords?: string;
}

interface SearchableSelectProps {
  id?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  'aria-describedby'?: string;
  /** Portal to document.body so the list is not clipped by dialog overflow. */
  portal?: boolean;
  /** Extra options searched when the pharmacist types; not shown in the default list. */
  searchOptions?: SearchableSelectOption[];
  /** Treat aliases as the same selected value (Tube vs Tube(s)). */
  valuesEqual?: (optionValue: string, selected: string) => boolean;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9\s.+/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function optionMatchesQuery(option: SearchableSelectOption, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const haystack = normalizeSearchText(
    `${option.code ?? ''} ${option.description ?? ''} ${option.keywords ?? ''} ${option.label} ${option.value}`,
  );
  if (haystack.includes(q)) return true;
  return q.split(' ').filter(Boolean).every((token) => haystack.includes(token));
}

export function filterSearchableOptions(
  options: SearchableSelectOption[],
  query: string,
): SearchableSelectOption[] {
  if (!normalizeSearchText(query)) return options;
  return options.filter((option) => optionMatchesQuery(option, query));
}

function mergeSearchableOptions(
  primary: SearchableSelectOption[],
  extra: SearchableSelectOption[] | undefined,
  valuesEqual?: (optionValue: string, selected: string) => boolean,
): SearchableSelectOption[] {
  if (!extra?.length) return primary;
  const merged = [...primary];
  for (const option of extra) {
    const duplicate = merged.some(
      (item) =>
        item.value === option.value || Boolean(valuesEqual?.(item.value, option.value)),
    );
    if (!duplicate) merged.push(option);
  }
  return merged;
}

function findSelectedOption(
  options: SearchableSelectOption[],
  value: string,
  valuesEqual?: (optionValue: string, selected: string) => boolean,
): SearchableSelectOption | undefined {
  if (!value) return undefined;
  return (
    options.find((option) => option.value === value) ??
    options.find((option) => Boolean(valuesEqual?.(option.value, value)))
  );
}

/**
 * Single-select combobox: type to filter, keyboard to choose.
 * Built for long clinical lists (SIG frequencies) inside dialogs.
 */
export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matching options',
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-describedby': ariaDescribedBy,
  portal = true,
  searchOptions,
  valuesEqual,
}: SearchableSelectProps) {
  const dialogLayer = useDialogLayer();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 280, maxHeight: 320 });
  const portalNode = portal ? dialogLayer ?? (mounted ? document.body : null) : null;
  const portaled = Boolean(portal && portalNode);

  React.useEffect(() => setMounted(true), []);

  const catalog = React.useMemo(
    () => mergeSearchableOptions(options, searchOptions, valuesEqual),
    [options, searchOptions, valuesEqual],
  );

  const selected = React.useMemo(
    () => findSelectedOption(catalog, value, valuesEqual),
    [catalog, value, valuesEqual],
  );

  const visibleOptions = React.useMemo(() => {
    if (selected && !options.some((option) => option.value === selected.value)) {
      return [selected, ...options];
    }
    return options;
  }, [options, selected]);

  const filtered = React.useMemo(() => {
    const pool = query.trim() ? catalog : visibleOptions;
    return filterSearchableOptions(pool, query);
  }, [catalog, visibleOptions, query]);

  const updatePos = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const container = dialogLayer?.getBoundingClientRect() ?? null;
    setPos(
      computeSearchableSelectPosition(
        { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
        { width: window.innerWidth, height: window.innerHeight },
        container,
      ),
    );
  }, [dialogLayer]);

  React.useLayoutEffect(() => {
    if (!open || !portaled) return;
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
  }, [open, portaled, updatePos, filtered.length]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const selectedIndex = filtered.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const t = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 10);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opened

  React.useEffect(() => {
    setActiveIndex((current) => {
      if (!filtered.length) return 0;
      return Math.min(current, filtered.length - 1);
    });
  }, [filtered.length]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, filtered]);

  React.useEffect(() => {
    if (!open || !portal) return;
    const el = listRef.current;
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

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const select = React.useCallback(
    (next: string) => {
      if (!next) return;
      onChange(next);
      setQuery('');
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [onChange],
  );

  const filteredRef = React.useRef(filtered);
  filteredRef.current = filtered;
  const activeIndexRef = React.useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const moveActive = React.useCallback((delta: number) => {
    const list = filteredRef.current;
    if (!list.length) return;
    setActiveIndex((i) => Math.min(Math.max(i + delta, 0), list.length - 1));
  }, []);

  const confirmActive = React.useCallback(() => {
    const next = filteredRef.current[activeIndexRef.current];
    if (next) select(next.value);
  }, [select]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const focusSearch = () => searchRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(focusSearch);
    const retry = window.setTimeout(focusSearch, 30);
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const inSearch = target === searchRef.current;
      const modifiers = e.metaKey || e.ctrlKey || e.altKey;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        moveActive(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        moveActive(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmActive();
        return;
      }
      if (inSearch) return;
      if (e.isComposing) return;
      if (!isSearchableSelectQueryKey(e.key, modifiers)) return;
      e.preventDefault();
      e.stopPropagation();
      setQuery((current) => applySearchableSelectQuery(current, e.key));
      focusSearch();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close, moveActive, confirmActive]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const inDialogLayer = Boolean(dialogLayer);
  const panelStyle: React.CSSProperties = portaled
    ? {
        position: inDialogLayer ? 'absolute' : 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        zIndex: 9999,
        pointerEvents: 'auto',
      }
    : {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 'calc(100% + 6px)',
        maxHeight: 320,
        zIndex: 60,
        pointerEvents: 'auto',
      };

  const listId = id ? `${id}-listbox` : undefined;

  const panel = open ? (
    <div
      ref={panelRef}
      {...{ [SEARCHABLE_SELECT_DROPDOWN_ATTR]: '' }}
      role="listbox"
      id={listId}
      style={panelStyle}
      className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder={searchPlaceholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={listId}
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onWheel={(e) => e.stopPropagation()}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          filtered.map((option, index) => {
            const active = index === activeIndex;
            const isOn =
              option.value === value ||
              option.value === selected?.value ||
              Boolean(valuesEqual?.(option.value, value));
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                data-active={active || undefined}
                aria-selected={isOn}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/60',
                  isOn && !active && 'bg-primary/8',
                )}
                onPointerDownCapture={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  select(option.value);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="min-w-0 flex-1">
                  {option.code && option.description ? (
                    <>
                      <span className="font-semibold">{option.code}</span>
                      <span className={active ? 'opacity-90' : 'text-muted-foreground'}>
                        {' '}
                        - {option.description}
                      </span>
                    </>
                  ) : (
                    option.label
                  )}
                </span>
                {isOn ? (
                  <Check
                    className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary-foreground' : 'text-primary')}
                    strokeWidth={2.75}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })
        )}
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
        aria-controls={listId}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        aria-describedby={ariaDescribedBy}
        onClick={() => !disabled && setOpen((current) => !current)}
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
          'flex h-10 w-full items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-left text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-2 ring-ring/40',
          ariaInvalid && 'border-destructive focus-visible:ring-destructive/25',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && !value && 'text-muted-foreground')}>
          {selected?.label || value || placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {portal ? (portalNode && panel ? createPortal(panel, portalNode) : null) : panel}
    </div>
  );
}
