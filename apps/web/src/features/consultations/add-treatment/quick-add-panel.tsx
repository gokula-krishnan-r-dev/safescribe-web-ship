'use client';

import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  filterQuickAddItems,
  quickAddSecondaryText,
  type QuickAddMedication,
  type QuickAddSource,
} from './quick-add';
import { useTreatmentQuickAdd } from './use-quick-add';

interface Props {
  consultationId?: string;
  source: QuickAddSource;
  onSourceChange: (source: QuickAddSource) => void;
  pathwayActive: boolean;
  excludedIds: string[];
  excludedNames: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  selectingId: string | null;
  onSelect: (item: QuickAddMedication) => void;
  enabled: boolean;
}

const TAB_TRIGGER =
  'h-auto rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-[13.5px] font-semibold text-muted-foreground shadow-none ' +
  'hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none ' +
  'focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50';

export function QuickAddPanel({
  consultationId,
  source,
  onSourceChange,
  pathwayActive,
  excludedIds,
  excludedNames,
  expanded,
  onExpandedChange,
  selectingId,
  onSelect,
  enabled,
}: Props) {
  const limit = expanded ? 20 : 3;
  const query = useTreatmentQuickAdd(consultationId, source, limit, enabled);
  const items = filterQuickAddItems(query.data?.items, excludedIds, excludedNames);
  const total = Math.max(query.data?.total ?? items.length, items.length);
  const showViewAll = !query.isError && total > 3;

  const statusMessage = query.isFetching
    ? 'Loading frequently used medications.'
    : query.isError
      ? 'Quick add is unavailable. Search for a medication instead.'
      : items.length === 0
        ? source === 'frequent'
          ? 'No frequently added medications yet. Use search to add a medication.'
          : 'No additional medications have been commonly added for this condition.'
        : `${items.length} medications available to add.`;

  return (
    <section className="space-y-3" aria-labelledby="quick-add-heading">
      <h3 id="quick-add-heading" className="text-[15.5px] font-bold tracking-tight text-foreground">
        Quick add
      </h3>

      <Tabs
        value={source}
        onValueChange={(next) => {
          if (next === 'condition' && !pathwayActive) return;
          onSourceChange(next as QuickAddSource);
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-border">
          <TabsList className="h-auto flex-wrap justify-start gap-x-5 gap-y-1 bg-transparent p-0">
            <TabsTrigger value="frequent" className={TAB_TRIGGER}>
              Your frequently added
            </TabsTrigger>
            <TabsTrigger
              value="condition"
              className={TAB_TRIGGER}
              disabled={!pathwayActive}
              title={
                pathwayActive ? undefined : 'Available when a clinical pathway is active.'
              }
              aria-describedby={pathwayActive ? undefined : 'quick-add-condition-unavailable'}
            >
              Often added for this condition
            </TabsTrigger>
          </TabsList>
          {showViewAll ? (
            <button
              type="button"
              className="mb-2 min-h-11 shrink-0 text-[13px] font-semibold text-primary hover:underline"
              onClick={() => onExpandedChange(!expanded)}
            >
              {expanded ? 'Show less' : 'View all'}
            </button>
          ) : (
            <span className="mb-2 min-h-11" />
          )}
        </div>
        {!pathwayActive ? (
          <p id="quick-add-condition-unavailable" className="sr-only">
            Available when a clinical pathway is active.
          </p>
        ) : null}

      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Guided treatments and medications already in the plan are excluded.
      </p>

      <div aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      <TabsContent value={source} className="mt-3 focus-visible:ring-0">
      {query.isFetching && !query.data ? (
        <ul className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-14 animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </ul>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3.5 py-3">
          <p className="text-[13px] text-muted-foreground">
            Quick add is unavailable. Search for a medication instead.
          </p>
          <button
            type="button"
            className="min-h-11 text-[13px] font-semibold text-primary hover:underline"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3.5 py-3 text-[13px] text-muted-foreground">
          {source === 'frequent'
            ? 'No frequently added medications yet. Use search to add a medication.'
            : 'No additional medications have been commonly added for this condition.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const secondary = quickAddSecondaryText(row);
            const busy = selectingId === row.medicationId;
            return (
              <li key={row.medicationId}>
                <button
                  type="button"
                  disabled={Boolean(selectingId)}
                  onClick={() => onSelect(row)}
                  aria-label={
                    secondary
                      ? `Add ${row.displayName}, ${secondary}`
                      : `Add ${row.displayName}`
                  }
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors',
                    'hover:border-primary/35 hover:bg-primary/[0.03]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                    'disabled:cursor-wait disabled:opacity-70',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-foreground">
                      {row.displayName}
                    </span>
                    {secondary ? (
                      <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                        {secondary}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-11 min-w-[4.75rem] shrink-0 items-center justify-center rounded-lg border border-primary/40 px-2.5',
                      'text-[13px] font-semibold text-primary',
                    )}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '+ Add'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </TabsContent>
      </Tabs>
    </section>
  );
}
