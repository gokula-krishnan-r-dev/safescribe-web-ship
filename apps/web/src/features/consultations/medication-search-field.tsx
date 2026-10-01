'use client';

import { useCallback, useMemo } from 'react';
import { Loader2, Pill, Plus, Search, Sparkles, X } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AiConfidenceBadge } from './consultation-ui';
import { DrugSearchDropdown } from './drug-search-dropdown';
import { useDrugSearchInput } from './use-drug-search-input';
import type { MedicationEntry } from './types';
import {
  drugResultToEntry,
  entriesToDisplayString,
  formatMedicationCardTitle,
  type DrugSearchResult,
} from './medication-utils';

interface Props {
  label: string;
  entries: MedicationEntry[];
  onChange: (entries: MedicationEntry[], displayText: string) => void;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  aiConfidence?: number;
  disabled?: boolean;
  className?: string;
  /** Hide the section label (parent already shows a header) */
  hideLabel?: boolean;
  /** `chips` = compact horizontal cards (Patient Background) */
  variant?: 'list' | 'chips';
}

function medKey(entry: Pick<MedicationEntry, 'id' | 'label' | 'brandName' | 'genericName'>) {
  return (
    entry.id ||
    entry.label ||
    entry.brandName ||
    entry.genericName ||
    ''
  )
    .trim()
    .toLowerCase();
}

function resultMatchesEntry(result: DrugSearchResult, entry: MedicationEntry) {
  const rId = result.id?.toLowerCase();
  if (rId && entry.id?.toLowerCase() === rId) return true;
  const rLabel = (result.label || result.brandName || result.genericName || '')
    .trim()
    .toLowerCase();
  const eLabel = (entry.label || entry.brandName || entry.genericName || '')
    .trim()
    .toLowerCase();
  return Boolean(rLabel && eLabel && rLabel === eLabel);
}

function medCardTitle(entry: MedicationEntry) {
  return formatMedicationCardTitle(entry);
}

function medCardMeta(entry: MedicationEntry) {
  const parts = [entry.dosageForm, entry.drugClass].filter(
    (part) =>
      Boolean(part) &&
      !/^(unknown|n\/a|manufactured product|non-proprietary product|therapeutic moiety)$/i.test(
        part!.trim(),
      ),
  );
  return parts.join(' · ');
}

export function MedicationSearchField({
  label,
  entries,
  onChange,
  placeholder = 'Search medication…',
  helperText,
  required,
  aiConfidence,
  disabled,
  className,
  hideLabel,
  variant = 'list',
}: Props) {
  const selectedIds = useMemo(
    () => new Set(entries.map((e) => e.id).filter(Boolean)),
    [entries],
  );

  const removeEntry = useCallback(
    (id: string) => {
      const next = entries.filter((e) => e.id !== id);
      onChange(next, entriesToDisplayString(next));
    },
    [entries, onChange],
  );

  const addEntry = useCallback(
    (result: DrugSearchResult) => {
      const already = entries.some((e) => resultMatchesEntry(result, e));
      if (already) {
        toast.message('Already added', {
          description: result.brandName || result.label,
        });
        return;
      }

      const entry = drugResultToEntry(result);
      // Ensure stable unique id even if terminology returns duplicates
      if (!entry.id || entries.some((e) => e.id === entry.id)) {
        entry.id = `med-${Date.now()}-${medKey(entry).replace(/\s+/g, '-')}`;
      }

      const next = [...entries, entry];
      onChange(next, entriesToDisplayString(next));
      toast.success('Medication added', {
        description: medCardTitle(entry),
      });
    },
    [entries, onChange],
  );

  const {
    showDropdown,
    isFetching,
    containerRef,
    inputAnchorRef,
    inputRef,
    inputProps,
    dropdownProps,
  } = useDrugSearchInput({
    onSelect: addEntry,
    clearOnSelect: true,
    onBackspaceWhenEmpty: () => {
      if (entries.length) removeEntry(entries[entries.length - 1].id);
    },
  });

  const aiPrefilled = Boolean(entries.length && aiConfidence);

  return (
    <div className={cn('space-y-3', className)} ref={containerRef}>
      {!hideLabel && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-foreground">
            {label}
            {required && <span className="text-destructive"> *</span>}
          </label>
          {aiPrefilled && aiConfidence != null && (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              <AiConfidenceBadge confidence={aiConfidence} />
            </span>
          )}
        </div>
      )}

      {/* Selected meds first so adds are immediately visible */}
      {entries.length > 0 && variant === 'chips' && (
        <ul className="flex flex-wrap gap-2">
          {entries.map((entry) => {
            const name = formatMedicationCardTitle(entry);
            const meta = medCardMeta(entry);
            return (
              <li
                key={entry.id}
                className={cn(
                  'relative min-w-[140px] max-w-[220px] rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5 pr-8',
                  aiPrefilled && 'border-primary/25 bg-primary/[0.04]',
                )}
              >
                <p className="text-sm font-semibold leading-snug text-foreground">
                  {name}
                </p>
                {meta ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{meta}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="absolute right-1.5 top-1.5 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${entry.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length > 0 && variant === 'list' && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3',
                aiPrefilled && 'border-primary/20 bg-primary/[0.03]',
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Pill className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-foreground">
                  {medCardTitle(entry)}
                </p>
                {medCardMeta(entry) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{medCardMeta(entry)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remove ${entry.label}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        ref={inputAnchorRef}
        className={cn(
          'relative rounded-xl border bg-background transition-[border-color,box-shadow,background-color] duration-150 ease-out',
          showDropdown && 'ring-2 ring-primary/20 border-primary/30',
          'border-border/80',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          {...inputProps}
          ref={inputRef}
          placeholder={
            entries.length
              ? 'Add another medication…'
              : placeholder
          }
          disabled={disabled}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className={cn(
            'h-11 border-0 bg-transparent pl-9 pr-3 text-sm shadow-none focus-visible:ring-0',
            isFetching && 'pr-10',
          )}
        />
        {isFetching && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <DrugSearchDropdown
        {...dropdownProps}
        selectedIds={selectedIds}
        selectHint="Tap to add"
      />

      {entries.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Plus className="h-3 w-3" />
          Search and tap a result to add it to the medication list
        </p>
      )}

      {helperText && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
