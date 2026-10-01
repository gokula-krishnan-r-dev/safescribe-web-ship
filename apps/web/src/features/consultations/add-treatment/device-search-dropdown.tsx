'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { measureDropdownPosition, type DropdownPosition } from '../drug-search-display';
import type { DeviceCatalogueItem } from './types';

export const DEVICE_SEARCH_DROPDOWN_ATTR = 'data-device-search-dropdown';

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  listId: string;
  results: DeviceCatalogueItem[];
  query: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: DeviceCatalogueItem) => void;
}

export function DeviceSearchDropdown({
  open,
  anchorRef,
  listId,
  results,
  query,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    width: 0,
    placement: 'below',
    maxHeight: 280,
  });

  useEffect(() => setMounted(true), []);

  const updatePosition = () => {
    if (!anchorRef.current) return;
    const measured = panelRef.current?.offsetHeight ?? 0;
    setPos(measureDropdownPosition(anchorRef.current, measured));
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, results.length, query]);

  if (!mounted || !open) return null;

  const panel = (
    <div
      id={listId}
      ref={panelRef}
      role="listbox"
      {...{ [DEVICE_SEARCH_DROPDOWN_ATTR]: '' }}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        zIndex: 60,
        pointerEvents: 'auto',
      }}
      className="overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg shadow-black/10"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {results.length === 0 ? (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          No matching devices found.
        </div>
      ) : (
        <ul className="max-h-56 overflow-auto">
          {results.map((item, i) => (
            <li key={item.code} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={cn(
                  'flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/60',
                  i === activeIndex && 'bg-primary/[0.06]',
                )}
                onMouseEnter={() => onActiveIndexChange(i)}
                onClick={() => onSelect(item)}
              >
                <span className="text-[13.5px] font-semibold text-foreground">
                  {item.display}
                </span>
                <span className="text-[12px] text-muted-foreground">{item.deviceType}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return createPortal(panel, document.body);
}
