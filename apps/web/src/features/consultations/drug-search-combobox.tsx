'use client';

import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DrugSearchDropdown } from './drug-search-dropdown';
import { useDrugSearchInput } from './use-drug-search-input';
import type { DrugSearchResult } from './medication-utils';

interface Props {
  value?: DrugSearchResult | null;
  onSelect: (drug: DrugSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Clear the query after a pick so the pharmacist can search the next drug. */
  clearOnSelect?: boolean;
}

export function DrugSearchCombobox({
  value,
  onSelect,
  placeholder = 'Search drugs by brand or generic name…',
  autoFocus,
  className,
  clearOnSelect = false,
}: Props) {
  const {
    showDropdown,
    isFetching,
    containerRef,
    inputAnchorRef,
    inputRef,
    inputProps,
    dropdownProps,
  } = useDrugSearchInput({
    onSelect,
    initialQuery: value?.brandName ?? '',
    autoFocus,
    clearOnSelect,
    refocusOnSelect: clearOnSelect,
  });

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <div
        ref={inputAnchorRef}
        className={cn(
          'relative rounded-lg border bg-background transition-[border-color,box-shadow,background-color] duration-150 ease-out',
          showDropdown && 'ring-2 ring-primary/20 border-primary/30',
        )}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          {...inputProps}
          ref={inputRef}
          placeholder={placeholder}
          className={cn('h-10 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0', isFetching && 'pr-10')}
        />
        {isFetching && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <DrugSearchDropdown
        {...dropdownProps}
        emptyMessage={`No matches for "${dropdownProps.debouncedQuery}". Press Enter to use as free text.`}
      />
    </div>
  );
}
