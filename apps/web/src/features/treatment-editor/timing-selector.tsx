'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseHourlyInterval } from '@/features/consultations/add-treatment/frequency-options';
import { cn } from '@/lib/utils';
import { buildTimingConfiguration, buildTimingMenu } from './build-timing-menu';
import { CustomHourlyIntervalForm } from './custom-hourly-interval-popover';
import { CustomTimingForm } from './custom-timing-form';
import { editorSelectTriggerClass } from './editor-styles';
import { timingPanelBox, type TimingSurface } from './timing-panel-layout';
import {
  frequencyValueFromHours,
  selectedTimingPresetId,
  timingLabelFromFrequency,
  timingPresetsByGroup,
  TIMING_GROUP_LABELS,
} from './timing-presets';
import type { TreatmentTimingConfiguration } from './types';

/** Portaled menu marker so modal dialogs do not treat option clicks as "outside". */
export const TIMING_SELECTOR_DROPDOWN_ATTR = 'data-timing-selector-dropdown';

export interface TimingSelectorProps {
  value: string;
  onChange: (frequencyValue: string) => void;
  configuration?: TreatmentTimingConfiguration;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  valueFormat?: 'code' | 'label' | 'frequencyValue';
}

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

export function TimingSelector({
  value,
  onChange,
  configuration,
  disabled,
  invalid,
  id,
  className,
  valueFormat = 'frequencyValue',
}: TimingSelectorProps) {
  const reactId = useId();
  const selectId = id ?? `timing-${reactId}`;
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<TimingSurface>('menu');
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280, maxHeight: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const resolvedConfig = useMemo(
    () => configuration ?? buildTimingConfiguration({ pathwayFrequency: value }),
    [configuration, value],
  );
  const menu = buildTimingMenu(resolvedConfig);
  const displayLabel = timingLabelFromFrequency(value) || value || 'Select timing';
  const selectedId = selectedTimingPresetId(value);
  const currentHours = parseHourlyInterval(value);
  const hasValue = Boolean(displayLabel && displayLabel !== 'Select timing');
  const box = timingPanelBox(surface, pos.maxHeight);

  useEffect(() => setMounted(true), []);

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

  const goToSurface = useCallback((next: TimingSurface) => {
    setSurface(next);
    if (next !== 'more') setSearch('');
  }, []);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    setSurface('menu');
    setSearch('');
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const selectOption = useCallback(
    (frequencyValue: string) => {
      const emitted =
        valueFormat === 'label'
          ? timingLabelFromFrequency(frequencyValue) || frequencyValue
          : frequencyValue;
      onChange(emitted);
      closeAndRestoreFocus();
    },
    [closeAndRestoreFocus, onChange, valueFormat],
  );

  const handlePrimaryPick = (optionId: string, frequencyValue: string) => {
    if (optionId === 'CUSTOM_HOURLY_INTERVAL') {
      goToSurface('hourly');
      return;
    }
    if (optionId === 'CUSTOM_SCHEDULE') {
      goToSurface('custom');
      return;
    }
    selectOption(frequencyValue);
  };

  const returnToCatalogue = () => goToSurface('more');

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
      if (surface === 'hourly' || surface === 'custom') {
        goToSurface('more');
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
  }, [closeAndRestoreFocus, goToSurface, open, surface]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onWheel = (event: WheelEvent) => {
      const scrollable = (event.target as HTMLElement | null)?.closest?.('.overflow-y-auto');
      if (!(scrollable instanceof HTMLElement) || !panel.contains(scrollable)) return;
      if (scrollable.scrollHeight <= scrollable.clientHeight) return;
      event.preventDefault();
      event.stopPropagation();
      scrollable.scrollTop += event.deltaY;
    };
    panel.addEventListener('wheel', onWheel, { passive: false });
    return () => panel.removeEventListener('wheel', onWheel);
  }, [open, surface]);

  const grouped = timingPresetsByGroup();
  const searchKey = search.trim().toLowerCase();
  const filteredGroups = Object.entries(grouped)
    .map(([group, presets]) => ({
      group: group as keyof typeof grouped,
      presets: presets.filter(
        (preset) =>
          !searchKey ||
          preset.label.toLowerCase().includes(searchKey) ||
          preset.code.toLowerCase().includes(searchKey) ||
          preset.frequencyValue.toLowerCase().includes(searchKey),
      ),
    }))
    .filter((group) => group.presets.length > 0);

  const panel = open ? (
    <div
      ref={panelRef}
      {...{ [TIMING_SELECTOR_DROPDOWN_ATTR]: '' }}
      tabIndex={-1}
      role={surface === 'menu' ? undefined : 'dialog'}
      aria-label={
        surface === 'hourly'
          ? 'Set dosing interval'
          : surface === 'custom'
            ? 'Custom timing'
            : surface === 'more'
              ? 'More timing schedules'
              : undefined
      }
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        height: box.height,
        minHeight: box.minHeight,
        maxHeight: box.maxHeight,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[0_8px_30px_rgba(15,23,42,0.12)] outline-none"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {surface === 'hourly' ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CustomHourlyIntervalForm
            initialHours={currentHours}
            onApply={(hours) => selectOption(frequencyValueFromHours(hours))}
            onCancel={returnToCatalogue}
          />
        </div>
      ) : surface === 'custom' ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CustomTimingForm
            initialValue={value}
            onApply={selectOption}
            onCancel={returnToCatalogue}
          />
        </div>
      ) : surface === 'more' ? (
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-border/60 p-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-[#3d6b9a] hover:bg-muted/60"
              onPointerDown={(event) => {
                holdPortaledPointer(event);
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                goToSurface('menu');
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </button>
            <p className="text-[12.5px] font-semibold text-[#1e3a5f]">More schedules</p>
          </div>
          <div className="shrink-0 border-b border-border/60 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${selectId}-search`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search schedules…"
                className="h-9 rounded-lg pl-8 text-[13px]"
              />
            </div>
          </div>
          <div role="listbox" aria-label="All timing schedules" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {filteredGroups.length === 0 ? (
              <p className="px-4 py-3 text-[13px] text-muted-foreground">No matching schedules.</p>
            ) : (
              filteredGroups.map(({ group, presets }) => (
                <div key={group} className="px-2 py-1.5">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {TIMING_GROUP_LABELS[group]}
                  </p>
                  {presets.map((preset) => (
                    <TimingMenuRow
                      key={preset.id}
                      label={preset.label}
                      selected={selectedId === preset.id}
                      onPick={() => handlePrimaryPick(preset.id, preset.frequencyValue)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          <div role="listbox" aria-label="Timing / frequency" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {menu.suggested ? (
              <div className="px-2 py-1.5">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested
                </p>
                <TimingMenuRow
                  label={menu.suggested.label}
                  selected={selectedId === menu.suggested.id}
                  onPick={() => handlePrimaryPick(menu.suggested!.id, menu.suggested!.frequencyValue)}
                />
              </div>
            ) : null}

            {menu.common.length > 0 ? (
              <div className="border-t border-border/60 px-2 py-1.5">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Common alternatives
                </p>
                {menu.common.map((option) => (
                  <TimingMenuRow
                    key={option.id}
                    label={option.label}
                    selected={selectedId === option.id}
                    onPick={() => handlePrimaryPick(option.id, option.frequencyValue)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {menu.showMoreSchedules ? (
            <div className="shrink-0 border-t border-border/60 px-2 py-1.5">
              <button
                type="button"
                className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-[13.5px] font-semibold text-primary hover:bg-muted/60"
                onPointerDown={(event) => {
                  holdPortaledPointer(event);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  goToSurface('more');
                }}
              >
                More schedules…
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn('relative min-w-[10.5rem] max-w-[14rem]', className)}>
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        disabled={disabled}
        aria-label="Timing / frequency"
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
          editorSelectTriggerClass,
          'w-full min-w-0',
          open && 'ring-2 ring-[#0F817C]/20',
          invalid && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className={cn('truncate', !hasValue && 'text-muted-foreground')}>{displayLabel}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

function TimingMenuRow({
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
      onPointerDown={(event) => {
        holdPortaledPointer(event);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPick();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-muted/60',
        selected && 'bg-[#e8f6f4] font-medium text-[#0f766e]',
      )}
    >
      {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <span className="w-4" />}
      <span>{label}</span>
    </button>
  );
}
