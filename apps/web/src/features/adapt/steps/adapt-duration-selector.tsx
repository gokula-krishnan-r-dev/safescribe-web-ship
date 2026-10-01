'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, Search, Plus, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ADAPT_THERAPY_DURATION_OPTIONS,
  resolveAdaptTherapyDurationSelection,
} from '@safescript/shared';
import { TIMING_SELECTOR_DROPDOWN_ATTR } from '@/features/treatment-editor/timing-selector';

export interface AdaptDurationSelectorProps {
  value?: string | null;
  onChange: (duration: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}

type DurationSurface = 'menu' | 'more' | 'custom';

interface DurationOption {
  id: string;
  label: string;
  group: 'short' | 'medium' | 'long' | 'other';
}

const EXTENDED_DURATION_CATALOGUE: DurationOption[] = [
  // Short-term
  { id: 'lt_1_week', label: 'Less than 1 week', group: 'short' },
  { id: '1_2_weeks', label: '1–2 weeks', group: 'short' },
  { id: '2_4_weeks', label: '2–4 weeks', group: 'short' },
  { id: 'less_than_1_month', label: 'Less than 1 month', group: 'short' },
  // Medium-term
  { id: '1_3_months', label: '1–3 months', group: 'medium' },
  { id: '3_6_months', label: '3–6 months', group: 'medium' },
  { id: '6_12_months', label: '6–12 months', group: 'medium' },
  // Long-term
  { id: '1_2_years', label: '1–2 years', group: 'long' },
  { id: '2_5_years', label: '2–5 years', group: 'long' },
  { id: 'more_than_1_year', label: 'More than 1 year', group: 'long' },
  { id: 'more_than_5_years', label: 'More than 5 years', group: 'long' },
  // Other / Clinical
  { id: 'newly_initiated', label: 'Newly initiated (< 7 days)', group: 'other' },
  { id: 'intermittent', label: 'Intermittent / PRN', group: 'other' },
  { id: 'lifelong', label: 'Lifelong therapy', group: 'other' },
  { id: 'unknown', label: 'Unknown', group: 'other' },
];

const DURATION_GROUP_LABELS: Record<string, string> = {
  short: 'Short-term (days & weeks)',
  medium: 'Medium-term (months)',
  long: 'Long-term (years)',
  other: 'Clinical & other',
};

const SUGGESTED_DURATION_IDS = ['1_3_months', '3_6_months'];
const COMMON_ALTERNATIVE_DURATION_IDS = [
  'less_than_1_month',
  '6_12_months',
  'more_than_1_year',
  'unknown',
];

function panelPosition(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const placeBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(420, Math.max(220, placeBelow ? spaceBelow : spaceAbove));
  const width = Math.min(Math.max(rect.width, 280), Math.min(448, window.innerWidth - 16));
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  return {
    top: placeBelow ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6),
    left,
    width,
    maxHeight,
  };
}

function holdPortaledPointer(event: {
  button?: number;
  stopPropagation: () => void;
}) {
  if (event.button != null && event.button !== 0) return false;
  event.stopPropagation();
  return true;
}

export function AdaptDurationSelector({
  value,
  onChange,
  disabled,
  invalid,
  required,
  id,
  className,
  placeholder = 'Select duration',
  'aria-label': ariaLabel = 'How long have they been taking it?',
}: AdaptDurationSelectorProps) {
  const reactId = useId();
  const selectId = id ?? `duration-${reactId}`;
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<DurationSurface>('menu');
  const [search, setSearch] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [customCount, setCustomCount] = useState('1');
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('months');
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280, maxHeight: 320 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const normalizedVal = (value ?? '').trim();
  const durationSelection = useMemo(
    () => resolveAdaptTherapyDurationSelection(normalizedVal),
    [normalizedVal],
  );

  const displayLabel = useMemo(() => {
    if (!normalizedVal) return '';
    const match = EXTENDED_DURATION_CATALOGUE.find(
      (opt) =>
        opt.id === durationSelection.id ||
        opt.label.toLowerCase() === normalizedVal.toLowerCase(),
    );
    if (match) return match.label;
    const standardMatch = ADAPT_THERAPY_DURATION_OPTIONS.find(
      (opt) => opt.id === durationSelection.id,
    );
    if (standardMatch && standardMatch.id !== 'custom') return standardMatch.label;
    return normalizedVal;
  }, [normalizedVal, durationSelection]);

  const hasValue = Boolean(displayLabel);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setPos(panelPosition(el));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      updatePos();
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, surface, updatePos]);

  useEffect(() => {
    if (open) return;
    setSurface('menu');
    setSearch('');
  }, [open]);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    setSurface('menu');
    setSearch('');
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const selectOption = useCallback(
    (durationLabel: string) => {
      onChange(durationLabel);
      closeAndRestoreFocus();
    },
    [closeAndRestoreFocus, onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (surface === 'custom') {
        setSurface('more');
        return;
      }
      if (surface !== 'menu') {
        setSurface('menu');
        setSearch('');
        return;
      }
      closeAndRestoreFocus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [closeAndRestoreFocus, open, surface]);

  const searchKey = search.trim().toLowerCase();
  const filteredCatalogue = useMemo(() => {
    const list = EXTENDED_DURATION_CATALOGUE.filter(
      (opt) =>
        !searchKey ||
        opt.label.toLowerCase().includes(searchKey) ||
        opt.id.toLowerCase().includes(searchKey),
    );
    const groups: Record<string, DurationOption[]> = {
      short: [],
      medium: [],
      long: [],
      other: [],
    };
    for (const item of list) {
      if (groups[item.group]) {
        groups[item.group].push(item);
      }
    }
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([groupKey, items]) => ({
        group: groupKey,
        label: DURATION_GROUP_LABELS[groupKey] || groupKey,
        items,
      }));
  }, [searchKey]);

  const isSelected = (optLabel: string, optId?: string) => {
    if (!normalizedVal) return false;
    if (optId && durationSelection.id === optId) return true;
    return normalizedVal.toLowerCase() === optLabel.toLowerCase();
  };

  const handleApplyCustomStructured = () => {
    const count = parseInt(customCount, 10);
    if (!count || count <= 0) return;
    const unitLabel = count === 1 ? customUnit.slice(0, -1) : customUnit;
    selectOption(`${count} ${unitLabel}`);
  };

  const handleApplyCustomText = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    selectOption(trimmed);
  };

  const panel = open ? (
    <div
      ref={panelRef}
      {...{ [TIMING_SELECTOR_DROPDOWN_ATTR]: '' }}
      tabIndex={-1}
      role={surface === 'menu' ? undefined : 'dialog'}
      aria-label="Therapy duration options"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[0_8px_30px_rgba(15,23,42,0.12)] outline-none"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {surface === 'custom' ? (
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-border/60 p-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-[#0F6F6B] hover:bg-muted/60"
              onPointerDown={holdPortaledPointer}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSurface('more');
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </button>
            <p className="text-[12.5px] font-semibold text-[#102a43]">Custom duration</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5 space-y-4">
            <div className="space-y-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick time interval
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={customCount}
                  onChange={(e) => setCustomCount(e.target.value)}
                  className="h-9 w-20 text-center text-sm font-medium"
                />
                <select
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value as typeof customUnit)}
                  className="h-9 flex-1 rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6F6B]/20"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyCustomStructured}
                  className="h-9 bg-[#0F6F6B] hover:bg-[#0c5956] text-xs font-semibold px-3"
                >
                  Apply
                </Button>
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <span className="relative bg-card px-2 text-[11px] font-medium uppercase text-muted-foreground">
                Or free-form description
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                Custom date or note
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="e.g. since Jan 2025, 45 days"
                  className="h-9 flex-1 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustomText();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyCustomText}
                  className="h-9 bg-[#0F6F6B] hover:bg-[#0c5956] text-xs font-semibold px-3"
                >
                  Set
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : surface === 'more' ? (
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 p-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-[#0F6F6B] hover:bg-muted/60"
              onPointerDown={holdPortaledPointer}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSurface('menu');
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </button>
            <p className="text-[12.5px] font-semibold text-[#102a43]">More durations</p>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[#0F6F6B] hover:bg-muted/60"
              onPointerDown={holdPortaledPointer}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSurface('custom');
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Custom
            </button>
          </div>
          <div className="shrink-0 border-b border-border/60 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${selectId}-search`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search duration…"
                className="h-9 rounded-lg pl-8 text-[13px]"
              />
            </div>
          </div>
          <div role="listbox" aria-label="All durations" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {filteredCatalogue.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-[13px] text-muted-foreground">No matching duration found.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomInput(search);
                    setSurface('custom');
                  }}
                  className="mt-2 text-xs"
                >
                  Use &quot;{search}&quot; as custom
                </Button>
              </div>
            ) : (
              filteredCatalogue.map(({ group, label, items }) => (
                <div key={group} className="px-2 py-1.5">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  {items.map((opt) => (
                    <DurationMenuRow
                      key={opt.id}
                      label={opt.label}
                      selected={isSelected(opt.label, opt.id)}
                      onPick={() => selectOption(opt.label)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          <div role="listbox" aria-label="Therapy duration" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {/* Suggested */}
            <div className="px-2 py-1.5">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested
              </p>
              {SUGGESTED_DURATION_IDS.map((id) => {
                const opt = EXTENDED_DURATION_CATALOGUE.find((o) => o.id === id);
                if (!opt) return null;
                return (
                  <DurationMenuRow
                    key={opt.id}
                    label={opt.label}
                    selected={isSelected(opt.label, opt.id)}
                    onPick={() => selectOption(opt.label)}
                  />
                );
              })}
            </div>

            {/* Common Alternatives */}
            <div className="border-t border-border/60 px-2 py-1.5">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Common alternatives
              </p>
              {COMMON_ALTERNATIVE_DURATION_IDS.map((id) => {
                const opt = EXTENDED_DURATION_CATALOGUE.find((o) => o.id === id);
                if (!opt) return null;
                return (
                  <DurationMenuRow
                    key={opt.id}
                    label={opt.label}
                    selected={isSelected(opt.label, opt.id)}
                    onPick={() => selectOption(opt.label)}
                  />
                );
              })}
            </div>

            {/* If currently selected is custom or not in above */}
            {hasValue &&
              !SUGGESTED_DURATION_IDS.includes(durationSelection.id || '') &&
              !COMMON_ALTERNATIVE_DURATION_IDS.includes(durationSelection.id || '') && (
                <div className="border-t border-border/60 px-2 py-1.5">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Current selection
                  </p>
                  <DurationMenuRow
                    label={displayLabel}
                    selected
                    onPick={() => selectOption(displayLabel)}
                  />
                </div>
              )}
          </div>

          {/* More schedules / durations button */}
          <div className="shrink-0 border-t border-border/60 px-2 py-1.5">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold text-[#0F6F6B] hover:bg-muted/60 transition-colors"
              onPointerDown={holdPortaledPointer}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSurface('more');
              }}
            >
              <span>More durations…</span>
              <span className="text-[11px] font-normal text-muted-foreground">Search / Custom</span>
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn('relative w-full min-w-0', className)}>
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-required={required}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            if (!open) {
              event.preventDefault();
              setOpen(true);
            }
          }
        }}
        className={cn(
          'inline-flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[#d5dee3] bg-white px-3 text-sm font-medium text-[#102a43] shadow-none transition-colors hover:bg-[#fafbfb] focus-visible:border-[#0F6F6B]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6F6B]/20',
          open && 'ring-2 ring-[#0F6F6B]/20 border-[#0F6F6B]/50',
          invalid && 'border-destructive focus-visible:ring-destructive/20',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className={cn('truncate', !hasValue && 'text-muted-foreground')}>
          {hasValue ? displayLabel : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[#7a8b99] transition-transform duration-200',
            open && 'rotate-180 text-[#0F6F6B]',
          )}
          aria-hidden
        />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

function DurationMenuRow({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onPointerDown={holdPortaledPointer}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] text-[#102a43] hover:bg-muted/60 transition-colors',
        selected && 'bg-[#e8f6f4] font-medium text-[#0f766e]',
      )}
    >
      {selected ? (
        <Check className="h-4 w-4 shrink-0 text-[#0f766e]" aria-hidden />
      ) : (
        <span className="w-4" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
