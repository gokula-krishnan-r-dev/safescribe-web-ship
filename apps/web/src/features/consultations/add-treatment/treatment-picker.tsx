'use client';

import { Loader2, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DrugSearchDropdown } from '../drug-search-dropdown';
import type { useDrugSearchInput } from '../use-drug-search-input';
import { FieldError, ModeActionButton } from './ui-bits';
import { QuickAddPanel } from './quick-add-panel';
import type { QuickAddMedication, QuickAddSource } from './quick-add';

interface Props {
  search: ReturnType<typeof useDrugSearchInput>;
  searchError?: string;
  consultationId?: string;
  quickAddSource: QuickAddSource;
  onQuickAddSourceChange: (source: QuickAddSource) => void;
  pathwayActive: boolean;
  excludedIds: string[];
  excludedNames: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  selectingId: string | null;
  onSelectQuickAdd: (item: QuickAddMedication) => void;
  onCustomCompound: () => void;
  onDevice: () => void;
  /** Hide compound / device entry points (Adapt therapeutic substitution). */
  medicationOnly?: boolean;
}

export function TreatmentPicker({
  search,
  searchError,
  consultationId,
  quickAddSource,
  onQuickAddSourceChange,
  pathwayActive,
  excludedIds,
  excludedNames,
  expanded,
  onExpandedChange,
  selectingId,
  onSelectQuickAdd,
  onCustomCompound,
  onDevice,
  medicationOnly = false,
}: Props) {
  return (
    <div className="space-y-6">
      <section className="space-y-2.5" aria-labelledby="choose-medication-heading">
        <h3
          id="choose-medication-heading"
          className="text-[15.5px] font-bold tracking-tight text-foreground"
        >
          Choose medication
        </h3>
        <div ref={search.containerRef}>
          <div
            ref={search.inputAnchorRef}
            className={cn(
              'relative rounded-[10px] border bg-background',
              search.showDropdown && 'border-primary/40 ring-2 ring-primary/15',
            )}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...search.inputProps}
              ref={search.inputRef}
              placeholder="Search by brand or generic name"
              aria-label="Search by brand or generic name"
              className="h-11 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
            />
            {search.isFetching ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <DrugSearchDropdown
            {...search.dropdownProps}
            emptyMessage="No matching medications found."
            providerLabel=""
            selectHint="Select"
          />
          <FieldError message={searchError} />
          {search.showDropdown &&
          !search.isFetching &&
          search.results.length === 0 &&
          search.debouncedQuery.length >= 2 ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Check the spelling, or{' '}
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={onCustomCompound}
              >
                add a custom compound
              </button>
              .
            </p>
          ) : null}
        </div>
      </section>

      <QuickAddPanel
        consultationId={consultationId}
        source={quickAddSource}
        onSourceChange={onQuickAddSourceChange}
        pathwayActive={pathwayActive}
        excludedIds={excludedIds}
        excludedNames={excludedNames}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        selectingId={selectingId}
        onSelect={onSelectQuickAdd}
        enabled
      />

      {!medicationOnly ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">Not adding a standard medication?</p>
          <div className="flex flex-wrap gap-2">
            <ModeActionButton onClick={onCustomCompound}>
              <Plus className="h-3.5 w-3.5" />
              Custom compound
            </ModeActionButton>
            <ModeActionButton onClick={onDevice}>
              <Plus className="h-3.5 w-3.5" />
              Device
            </ModeActionButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
