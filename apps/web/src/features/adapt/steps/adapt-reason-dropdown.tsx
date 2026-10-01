'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdaptationReason } from '@safescript/shared';
import { computeSearchableSelectPosition } from '@/components/ui/searchable-select-position';

export const ADAPT_REASON_DROPDOWN_ATTR = 'data-adapt-reason-dropdown';

interface Props {
  reasons: AdaptationReason[];
  selectedReason: AdaptationReason | null;
  onSelect: (reason: AdaptationReason) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

type PanelBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Portaled listbox so Adapt reason options are never clipped by card
 * `overflow-hidden` or the wizard scroll container.
 */
export function AdaptReasonDropdown({
  reasons,
  selectedReason,
  onSelect,
  disabled = false,
  placeholder = 'Select a reason',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<PanelBox>({ top: 0, left: 0, width: 0, maxHeight: 256 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPos(
      computeSearchableSelectPosition(
        { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, []);

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
  }, [open, updatePosition, reasons.length]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open && selectedReason) {
      const idx = reasons.findIndex((r) => r.code === selectedReason.code);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else if (open) {
      setHighlightedIndex(0);
    }
  }, [open, selectedReason, reasons]);

  useEffect(() => {
    if (open && highlightedIndex >= 0 && listboxRef.current) {
      const item = listboxRef.current.children[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, highlightedIndex]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev < reasons.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : reasons.length - 1));
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (highlightedIndex >= 0 && reasons[highlightedIndex]) {
        onSelect(reasons[highlightedIndex]!);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    width: pos.width || undefined,
    maxHeight: pos.maxHeight,
    zIndex: 9999,
  };

  const listbox =
    open && mounted ? (
      <ul
        ref={listboxRef}
        role="listbox"
        tabIndex={-1}
        {...{ [ADAPT_REASON_DROPDOWN_ATTR]: '' }}
        style={panelStyle}
        className="overflow-y-auto overscroll-contain rounded-lg border border-[#0F6F6B]/30 bg-white py-1 shadow-[0_12px_40px_rgba(15,23,42,0.16)] focus:outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {reasons.map((reason, idx) => {
          const isSelected = selectedReason?.code === reason.code;
          const isHighlighted = highlightedIndex === idx;

          return (
            <li
              key={reason.code}
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => {
                onSelect(reason);
                setOpen(false);
              }}
              className={cn(
                'cursor-pointer px-3.5 py-2 text-sm transition-colors',
                isSelected ? 'font-semibold text-[#0F6F6B]' : 'font-normal text-[#102a43]',
                isHighlighted ? 'bg-[#f0f9f8] text-[#0F6F6B]' : '',
              )}
            >
              {reason.label}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-[54px] w-full items-center justify-between rounded-xl border bg-white px-4 text-left text-[15px] transition-colors',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#14878a]/20',
          open
            ? 'border-[#14878a] shadow-[0_0_0_3px_rgba(20,135,138,0.10)]'
            : 'border-[#d7e1e5] hover:border-[#b8c9cf]',
          disabled && 'cursor-not-allowed bg-muted/40 opacity-60',
        )}
      >
        <span
          className={cn(
            'truncate',
            selectedReason ? 'font-medium text-[#102a43]' : 'text-[#8a9aa3]',
          )}
        >
          {selectedReason?.label ?? placeholder}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#0F6F6B]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#8a9aa3]" />
        )}
      </button>

      {listbox ? createPortal(listbox, document.body) : null}
    </div>
  );
}
