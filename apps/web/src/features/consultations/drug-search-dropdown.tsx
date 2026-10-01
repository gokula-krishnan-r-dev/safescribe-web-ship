'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDrugResultDisplay,
  measureDropdownPosition,
  type DropdownPosition,
} from './drug-search-display';
import type { DrugSearchResult } from './medication-utils';
import {
  enumerateDrugBrandGroups,
  formatDrugStrengthOption,
  groupDrugSearchByBrand,
  type DrugBrandGroup,
} from './drug-search-groups';

/** Marker for Dialog / outside-click handlers so portaled results stay interactive. */
export const DRUG_SEARCH_DROPDOWN_ATTR = 'data-drug-search-dropdown';

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  listId: string;
  results: DrugSearchResult[];
  groups?: DrugBrandGroup[];
  isFetching: boolean;
  debouncedQuery: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: DrugSearchResult) => void;
  emptyMessage?: string;
  providerLabel?: string;
  /** Ids already on the patient's list — show as Added, not as a false "checkbox" */
  selectedIds?: Set<string>;
  selectHint?: string;
  /**
   * Portal to document.body (default). Required when a parent clips overflow
   * (e.g. DialogContent with overflow-y-auto). Always pairs with pointer-events
   * restoration so Radix Dialog body lock does not block mouse / wheel.
   */
  portal?: boolean;
}

export function DrugSearchDropdown({
  open,
  anchorRef,
  listId,
  results,
  groups: groupsProp,
  isFetching,
  debouncedQuery,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  emptyMessage,
  providerLabel = '',
  selectedIds,
  selectHint = 'Tap to add',
  portal = true,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    width: 0,
    placement: 'below',
    maxHeight: 280,
  });
  const [ready, setReady] = useState(false);
  const groups = useMemo(
    () => groupsProp ?? groupDrugSearchByBrand(results, debouncedQuery),
    [groupsProp, results, debouncedQuery],
  );
  const groupedRows = useMemo(() => enumerateDrugBrandGroups(groups), [groups]);

  useEffect(() => setMounted(true), []);

  const updatePosition = () => {
    if (!anchorRef.current) return;
    const measured = panelRef.current?.offsetHeight ?? 0;
    setPos(measureDropdownPosition(anchorRef.current, measured, 340));
    setReady(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    updatePosition();

    if (!portal) return;

    const onResize = () => updatePosition();
    /** Reposition only when scrolling outside the results panel (not the list itself). */
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      updatePosition();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);

    const panel = panelRef.current;
    const ro =
      panel && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updatePosition())
        : null;
    if (panel && ro) ro.observe(panel);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      ro?.disconnect();
    };
  }, [open, portal, anchorRef, results.length, isFetching, debouncedQuery]);

  /**
   * Radix Dialog + react-remove-scroll call preventDefault on wheel/touchmove
   * for anything outside the dialog lock. Portaled menus must scroll manually.
   */
  useEffect(() => {
    if (!open) return;
    const el = listScrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += e.deltaY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      // Keep touch scrolling local to the results list.
      e.stopPropagation();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [open, results.length, isFetching]);

  // Keep active option in view for keyboard navigation
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-drug-option-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!mounted || !open) return null;

  const showEmpty = !isFetching && results.length === 0;
  const showLoading = isFetching && results.length === 0;

  const panelStyle: CSSProperties = portal
    ? {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        zIndex: 9999,
        // Radix Dialog sets body { pointer-events: none }; only DialogContent
        // restores auto. Portaled menus must opt back in or mouse is dead.
        pointerEvents: 'auto',
        visibility: ready ? 'visible' : 'hidden',
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

  const panel = (
    <div
      id={listId}
      ref={panelRef}
      role="listbox"
      {...{ [DRUG_SEARCH_DROPDOWN_ATTR]: '' }}
      style={panelStyle}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/10 dark:shadow-black/40',
        portal && pos.placement === 'above' && 'origin-bottom',
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Drug search results
        </span>
        {providerLabel ? (
          <span className="text-[10px] font-medium text-muted-foreground/80">
            {providerLabel}
          </span>
        ) : null}
      </div>

      <div
        ref={listScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {showLoading && (
          <div className="flex items-center gap-2.5 px-3 py-3.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary/70" />
            Searching…
          </div>
        )}

        {showEmpty && (
          <div className="px-3 py-3.5 text-sm leading-relaxed text-muted-foreground">
            {emptyMessage ?? (
              <>
                No matches for <span className="font-medium text-foreground">“{debouncedQuery}”</span>.
                Press Enter to add as free text.
              </>
            )}
          </div>
        )}

        {groupedRows.map((row) => {
          if (row.kind === 'group') {
            return (
              <div
                key={`group-${row.group.key}`}
                className="sticky top-0 z-[1] border-b border-border/50 bg-muted/70 px-3 py-1.5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
                  {row.group.brandName}
                </p>
                {row.group.genericName ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">{row.group.genericName}</p>
                ) : null}
              </div>
            );
          }

          return (
            <DrugSearchResultRow
              key={row.item.id}
              index={row.index}
              item={row.item}
              grouped
              active={row.index === activeIndex}
              alreadyAdded={Boolean(selectedIds?.has(row.item.id))}
              selectHint={selectHint}
              onHighlight={() => onActiveIndexChange(row.index)}
              onSelect={() => onSelect(row.item)}
            />
          );
        })}
      </div>
    </div>
  );

  if (portal) {
    return createPortal(panel, document.body);
  }

  return panel;
}

function DrugSearchResultRow({
  item,
  index,
  grouped,
  active,
  alreadyAdded,
  selectHint,
  onHighlight,
  onSelect,
}: {
  item: DrugSearchResult;
  index: number;
  grouped?: boolean;
  active: boolean;
  alreadyAdded: boolean;
  selectHint: string;
  onHighlight: () => void;
  onSelect: () => void;
}) {
  const display = formatDrugResultDisplay(item);
  const strengthOption = formatDrugStrengthOption(item);
  const primary = grouped ? strengthOption.title : display.primary;
  const brand = grouped ? undefined : display.brand;
  const strength = grouped ? undefined : display.strength;
  const secondary = grouped
    ? [display.drugClass, display.code].filter(Boolean).join(' · ') || undefined
    : display.secondary;

  return (
    <button
      type="button"
      role="option"
      aria-selected={alreadyAdded || active}
      data-drug-option-index={index}
      onMouseEnter={onHighlight}
      onPointerMove={onHighlight}
      // pointerdown fires before Radix Dialog outside/focus handlers swallow the click
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={cn(
        'flex w-full cursor-pointer items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0 transition-colors',
        alreadyAdded
          ? 'bg-emerald-500/8'
          : active
            ? 'bg-primary/8'
            : 'hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          alreadyAdded
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : active
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border/80 bg-background',
        )}
        aria-hidden
      >
        {alreadyAdded || active ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">
          <span className="font-semibold">{primary}</span>
          {brand ? (
            <>
              <span className="font-normal text-muted-foreground"> · </span>
              <span className="font-normal text-muted-foreground">{brand}</span>
            </>
          ) : null}
          {strength ? (
            <>
              <span className="font-normal text-muted-foreground"> · </span>
              <span className="font-semibold text-foreground/90">{strength}</span>
            </>
          ) : null}
        </p>
        {secondary ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {secondary}
          </p>
        ) : null}
      </span>
      <span
        className={cn(
          'mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide',
          alreadyAdded ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/80',
        )}
      >
        {alreadyAdded ? 'Added' : selectHint}
      </span>
    </button>
  );
}
