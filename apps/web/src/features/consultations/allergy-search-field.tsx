'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DrugSearchDropdown } from './drug-search-dropdown';
import { useDrugSearchInput } from './use-drug-search-input';
import type { DrugSearchResult } from './medication-utils';
import { isCodedDrugSource, toPersistedDrugSource } from './medication-utils';
import {
  AllergyReactionDropdown,
  allergyChipLabel,
  applyAllergyType,
  allergyTypeFromEntry,
  type AllergyTypeId,
} from './allergy-type-dialog';

export interface AllergyDrugEntry {
  id: string;
  drug: string;
  reaction: string;
  severity: 'Mild' | 'Moderate' | 'Severe' | '';
  genericName?: string;
  brandName?: string;
  drugClass?: string;
  rxcui?: string;
  ndc?: string;
  codeDisplay?: string;
  source?: 'ccdd' | 'rxnorm' | 'openfda' | 'manual' | 'transcript';
}

interface Props {
  entries: AllergyDrugEntry[];
  onChange: (entries: AllergyDrugEntry[]) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Hide internal chip list when parent already renders ClinicalChips. */
  hideChips?: boolean;
}

export function resultToAllergyEntry(result: DrugSearchResult): AllergyDrugEntry {
  const drug = (
    result.genericName ||
    result.brandName ||
    result.label.split('·')[0]?.trim() ||
    result.label
  ).trim();

  return {
    id: result.id.startsWith('manual-')
      ? `allergy-${Date.now()}-${drug.replace(/\s+/g, '-')}`
      : `allergy-${result.id}`,
    drug,
    reaction: '',
    severity: '',
    genericName: result.genericName,
    brandName:
      result.brandName &&
      result.genericName &&
      result.brandName.toLowerCase() !== result.genericName.toLowerCase()
        ? result.brandName
        : undefined,
    drugClass: result.drugClass,
    rxcui: result.rxcui,
    ndc: result.ndc,
    codeDisplay: result.codeDisplay,
    source: isCodedDrugSource(result.source)
      ? toPersistedDrugSource(result.source)
      : result.source === 'transcript'
        ? 'transcript'
        : 'manual',
  };
}

/**
 * Multi-select allergy picker backed by Canadian CCDD (Therapeutic Moiety).
 * Selecting a drug (or editing a chip) uses the same inline reaction dropdown.
 */
export function AllergySearchField({
  entries,
  onChange,
  disabled,
  className,
  placeholder = 'Search drug allergies…',
  autoFocus,
  hideChips = false,
}: Props) {
  const [pendingEntry, setPendingEntry] = useState<AllergyDrugEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<AllergyDrugEntry | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeEntry = editingEntry ?? pendingEntry;
  const isEditing = Boolean(editingEntry);

  const removeEntry = useCallback(
    (id: string) => {
      onChange(entries.filter((e) => e.id !== id));
    },
    [entries, onChange],
  );

  const beginAdd = useCallback(
    (result: DrugSearchResult) => {
      const entry = resultToAllergyEntry(result);
      const existing = entries.find(
        (e) => e.drug.toLowerCase() === entry.drug.toLowerCase(),
      );
      if (existing) {
        setPendingEntry(null);
        setEditingEntry(existing);
        setDropdownOpen(true);
        return;
      }
      setEditingEntry(null);
      setPendingEntry(entry);
      setDropdownOpen(true);
    },
    [entries],
  );

  const confirmReaction = (typeId: AllergyTypeId) => {
    if (editingEntry) {
      onChange(
        entries.map((e) =>
          e.id === editingEntry.id ? applyAllergyType(e, typeId) : e,
        ),
      );
      setEditingEntry(null);
      setDropdownOpen(false);
      return;
    }
    if (!pendingEntry) return;
    onChange([...entries, applyAllergyType(pendingEntry, typeId)]);
    setPendingEntry(null);
    setDropdownOpen(false);
  };

  const dismissReaction = () => {
    setPendingEntry(null);
    setEditingEntry(null);
    setDropdownOpen(false);
  };

  useEffect(() => {
    if (activeEntry) setDropdownOpen(true);
  }, [activeEntry]);

  const {
    showDropdown,
    isFetching,
    containerRef,
    inputAnchorRef,
    inputRef,
    inputProps,
    dropdownProps,
  } = useDrugSearchInput({
    purpose: 'allergy',
    onSelect: beginAdd,
    clearOnSelect: true,
    autoFocus: autoFocus && !activeEntry,
    onBackspaceWhenEmpty: () => {
      if (activeEntry) {
        dismissReaction();
        return;
      }
      if (entries.length) removeEntry(entries[entries.length - 1].id);
    },
  });

  const activeLabel =
    activeEntry?.genericName ||
    activeEntry?.brandName ||
    activeEntry?.drug ||
    'this allergy';

  return (
    <div className={cn('space-y-2.5', className)} ref={containerRef}>
      {!hideChips && entries.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#b7d9f0] bg-[#eef7fc] py-1.5 pl-3 pr-2',
                'text-[14px] font-medium text-[#17324D]',
                editingEntry?.id === entry.id && 'ring-2 ring-[#7EB8C4]/40',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setPendingEntry(null);
                  setEditingEntry(entry);
                  setDropdownOpen(true);
                }}
                className="truncate hover:underline"
              >
                {allergyChipLabel(entry)}
              </button>
              <button
                type="button"
                aria-label={`Remove ${entry.drug}`}
                className="shrink-0 rounded p-0.5 text-[#5b7c8a] hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeEntry(entry.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {activeEntry ? (
        <AllergyReactionDropdown
          drugLabel={activeLabel}
          open={dropdownOpen}
          selected={isEditing ? allergyTypeFromEntry(activeEntry) : null}
          onOpenChange={setDropdownOpen}
          onSelect={confirmReaction}
          onDismiss={dismissReaction}
        />
      ) : (
        <>
          <div
            ref={inputAnchorRef}
            className={cn(
              'relative rounded-xl border bg-background transition-[border-color,box-shadow,background-color] duration-150 ease-out',
              showDropdown && 'ring-2 ring-primary/25 border-primary/40',
              'border-border/80',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...inputProps}
              ref={inputRef}
              placeholder={placeholder}
              disabled={disabled}
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
            emptyMessage={`No matches for “${dropdownProps.debouncedQuery}”. Press Enter to add as free text.`}
          />
        </>
      )}
    </div>
  );
}

export { allergyChipLabel };
