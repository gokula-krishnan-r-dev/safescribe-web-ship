'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AllergyDrugEntry } from './allergy-search-field';

/** Recommended allergy classification for Step 3. */
export type AllergyTypeId = 'non_severe' | 'severe' | 'unknown';

export const ALLERGY_TYPE_OPTIONS: Array<{
  id: AllergyTypeId;
  label: string;
  chipLabel: string;
  severity: AllergyDrugEntry['severity'];
  description: string;
}> = [
  {
    id: 'non_severe',
    label: 'Mild delayed reaction',
    chipLabel: 'Mild delayed',
    severity: 'Mild',
    description: 'Mild delayed rash or itching',
  },
  {
    id: 'severe',
    label: 'Severe / immediate reaction',
    chipLabel: 'Severe / immediate',
    severity: 'Severe',
    description:
      'Hives, swelling, breathing difficulty, anaphylaxis, or severe skin reaction',
  },
  {
    id: 'unknown',
    label: 'Unknown reaction',
    chipLabel: 'Unknown',
    severity: '',
    description: 'Reaction not known or documented',
  },
];

export function allergyTypeFromEntry(
  entry: Pick<AllergyDrugEntry, 'severity' | 'reaction'>,
): AllergyTypeId | null {
  if (entry.severity === 'Severe') return 'severe';
  if (entry.severity === 'Mild' || entry.severity === 'Moderate') {
    return 'non_severe';
  }
  const r = entry.reaction?.trim().toLowerCase() ?? '';
  if (
    r === 'unknown' ||
    r === 'reaction unknown' ||
    r === 'unknown reaction'
  ) {
    return 'unknown';
  }
  if (
    r.includes('severe') ||
    r.includes('immediate') ||
    r.includes('anaphylaxis')
  ) {
    return 'severe';
  }
  if (
    r.includes('mild') ||
    r.includes('delayed') ||
    r.includes('non-severe') ||
    r.includes('rash')
  ) {
    return 'non_severe';
  }
  if (!entry.severity && !entry.reaction?.trim()) return null;
  return 'unknown';
}

export function applyAllergyType(
  entry: AllergyDrugEntry,
  typeId: AllergyTypeId,
): AllergyDrugEntry {
  const opt = ALLERGY_TYPE_OPTIONS.find((o) => o.id === typeId)!;
  return {
    ...entry,
    severity: opt.severity,
    reaction: opt.chipLabel,
  };
}

export function allergyChipLabel(entry: AllergyDrugEntry): string {
  const drug = entry.drug.trim();
  const reaction = entry.reaction?.trim();
  if (reaction) return `${drug} · ${reaction}`;
  if (entry.severity === 'Severe') return `${drug} · Severe / immediate`;
  if (entry.severity === 'Mild' || entry.severity === 'Moderate') {
    return `${drug} · Mild delayed`;
  }
  return drug;
}

function AllergyTypeOptionList({
  selected,
  onSelect,
  className,
}: {
  selected: AllergyTypeId | null;
  onSelect: (id: AllergyTypeId) => void;
  className?: string;
}) {
  const groupId = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Allergy reaction type"
      className={cn('overflow-hidden', className)}
    >
      {ALLERGY_TYPE_OPTIONS.map((opt, index) => {
        const active = selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            id={`${groupId}-${opt.id}`}
            onClick={() => onSelect(opt.id)}
            className={cn(
              'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors',
              'hover:bg-[#F5F9FA] focus-visible:outline-none focus-visible:bg-[#F0F7F8]',
              active && 'bg-[#F3FAF9]',
              index > 0 && 'border-t border-[#E4EBEE]',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
                active
                  ? 'border-[#0F817C] bg-white'
                  : 'border-[#B8C5CC] bg-white',
              )}
              aria-hidden
            >
              {active ? (
                <span className="h-2 w-2 rounded-full bg-[#0F817C]" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-snug text-[#15212B]">
                {opt.label}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6B7785]">
                {opt.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline chip + dropdown for allergy reaction selection (add and edit).
 */
export function AllergyReactionDropdown({
  drugLabel,
  open,
  selected,
  onOpenChange,
  onSelect,
  onDismiss,
  className,
}: {
  drugLabel: string;
  open: boolean;
  selected?: AllergyTypeId | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (typeId: AllergyTypeId) => void;
  onDismiss: () => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuBox(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuBox({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.getElementById('allergy-reaction-menu');
      if (menu?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const selectedLabel = selected
    ? ALLERGY_TYPE_OPTIONS.find((o) => o.id === selected)?.chipLabel
    : null;

  return (
    <div ref={rootRef} className={cn('relative w-full max-w-[420px]', className)}>
      <div
        ref={triggerRef}
        className={cn(
          'flex h-11 items-stretch overflow-hidden rounded-[10px] border bg-white',
          open
            ? 'border-[#7EB8C4] shadow-[0_0_0_3px_rgba(126,184,196,0.18)]'
            : 'border-[#C5D0D4]',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3.5 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#15212B]">
            {drugLabel}
            <span className="font-medium text-[#5B6B78]">
              {' '}
              · {selectedLabel ?? 'Select reaction'}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-[#5B6B78] transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
        <span className="my-2.5 w-px shrink-0 bg-[#D5DEE3]" aria-hidden />
        <button
          type="button"
          aria-label={`Cancel allergy reaction for ${drugLabel}`}
          onClick={onDismiss}
          className="flex w-10 shrink-0 items-center justify-center text-[#6B7785] transition-colors hover:bg-[#F5F8F9] hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {open && menuBox && typeof document !== 'undefined'
        ? createPortal(
            <div
              id="allergy-reaction-menu"
              role="listbox"
              style={{
                position: 'fixed',
                top: menuBox.top,
                left: menuBox.left,
                width: menuBox.width,
              }}
              className={cn(
                'z-[80] overflow-hidden rounded-[10px]',
                'border border-[#D5DEE3] bg-white shadow-[0_8px_24px_rgba(21,33,43,0.12)]',
              )}
            >
              <AllergyTypeOptionList
                selected={selected ?? null}
                onSelect={(id) => {
                  onSelect(id);
                  onOpenChange(false);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
