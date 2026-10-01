'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  medicationDirections,
  medicationDisplayName,
  type RenewConditionCatalogItem,
  type RenewMedication,
} from '@safescript/shared';

export function AddConditionDialog({
  open,
  conditions,
  searchHits,
  suggestedIds,
  existingConditionIds,
  medications,
  medicationConditionLabels,
  unresolvedIds,
  suggestionsUnavailable,
  onSearch,
  searching,
  onClose,
  onAdd,
  saving,
}: {
  open: boolean;
  conditions: RenewConditionCatalogItem[];
  searchHits: RenewConditionCatalogItem[];
  suggestedIds: string[];
  existingConditionIds: string[];
  medications: RenewMedication[];
  medicationConditionLabels?: Record<string, string>;
  unresolvedIds: string[];
  suggestionsUnavailable?: boolean;
  onSearch: (q: string) => void;
  searching?: boolean;
  onClose: () => void;
  onAdd: (value: {
    conditionId?: string;
    customText?: string;
    medicationIds: string[];
    label: string;
  }) => void;
  saving?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | 'other' | null>(null);
  const [customText, setCustomText] = useState('');
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [queued, setQueued] = useState(false);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId(null);
    setCustomText('');
    setLinkedIds([]);
    setQueued(false);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
  }, [open]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, []);

  const requestSearch = (q: string) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    setQueued(true);
    searchTimer.current = window.setTimeout(() => {
      setQueued(false);
      onSearch(q);
    }, 180);
  };

  const existing = useMemo(() => new Set(existingConditionIds), [existingConditionIds]);

  const suggested = useMemo(() => {
    const fromIds = suggestedIds
      .map((id) => conditions.find((row) => row.id === id))
      .filter((row): row is RenewConditionCatalogItem => row != null && !existing.has(row.id));
    if (fromIds.length) return fromIds.slice(0, 5);
    if (suggestionsUnavailable) return [];
    // Soft fallback from master-table commons when ranking has not returned yet.
    return conditions
      .filter(
        (row) =>
          row.commonForRenewal && row.code !== 'OTHER_CUSTOM' && !existing.has(row.id),
      )
      .slice()
      .sort(
        (a, b) =>
          a.displayPriority - b.displayPriority || a.displayName.localeCompare(b.displayName),
      )
      .slice(0, 5);
  }, [suggestedIds, conditions, existing, suggestionsUnavailable]);

  const suggestedIdSet = useMemo(() => new Set(suggested.map((row) => row.id)), [suggested]);

  const commonChips = useMemo(
    () => commonConditionChips(conditions, existing, suggestedIdSet),
    [conditions, existing, suggestedIdSet],
  );

  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    const fromHits = searchHits.filter(
      (row) => row.code !== 'OTHER_CUSTOM' && !existing.has(row.id),
    );
    if (fromHits.length) return fromHits.slice(0, 8);
    return conditions
      .filter(
        (row) =>
          row.code !== 'OTHER_CUSTOM' &&
          !existing.has(row.id) &&
          row.displayName.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [q, searchHits, conditions, existing]);

  const selectedRow =
    selectedId && selectedId !== 'other'
      ? conditions.find((row) => row.id === selectedId) ?? searchHits.find((row) => row.id === selectedId)
      : null;
  const selectedLabel =
    selectedId === 'other' ? customText.trim() || 'Other / specify' : selectedRow?.displayName ?? '';
  const selectedSubtitle =
    selectedId === 'other'
      ? 'Enter a custom indication that is not in the approved library.'
      : conditionSubtitle(selectedRow);

  const linkable = useMemo(() => {
    const unresolved = new Set(unresolvedIds);
    return [...medications].sort((a, b) => {
      const au = unresolved.has(a.id) ? 0 : 1;
      const bu = unresolved.has(b.id) ? 0 : 1;
      if (au !== bu) return au - bu;
      return medicationDisplayName(a).localeCompare(medicationDisplayName(b));
    });
  }, [medications, unresolvedIds]);

  const canSubmit =
    Boolean(selectedId) && (selectedId !== 'other' || Boolean(customText.trim())) && !saving;

  const selectCondition = (id: string | 'other') => {
    setSelectedId(id);
    setQuery('');
    setLinkedIds([]);
    setCustomText('');
  };

  const clearSelection = () => {
    setSelectedId(null);
    setLinkedIds([]);
    setCustomText('');
  };

  const toggleLinked = (id: string) => {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const submit = () => {
    if (!canSubmit) return;
    onAdd(
      selectedId === 'other'
        ? {
            customText: customText.trim(),
            medicationIds: linkedIds,
            label: customText.trim(),
          }
        : {
            conditionId: selectedId ?? undefined,
            medicationIds: linkedIds,
            label: selectedLabel,
          },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent
        hideCloseButton
        className={cn(
          'grid max-h-[min(90dvh,calc(100vh-32px))] w-[min(28rem,calc(100vw-24px))]',
          'max-w-[min(28rem,calc(100vw-24px))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:rounded-2xl',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <DialogTitle className="text-[18px] font-bold tracking-tight text-foreground">
              Add condition
            </DialogTitle>
            <DialogDescription className="sr-only">
              Search the approved library, then optionally link medications.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add condition"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <TooltipProvider delayDuration={200}>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-1">
            {selectedId ? (
              <div className="space-y-5 pb-4">
                <section className="relative rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3.5 pr-10">
                  {selectedId === 'other' ? (
                    <Input
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Enter a custom indication"
                      maxLength={200}
                      autoFocus
                      className="h-10 rounded-[10px] bg-card"
                    />
                  ) : (
                    <p className="text-[15px] font-semibold leading-snug text-foreground">{selectedLabel}</p>
                  )}
                  {selectedSubtitle ? (
                    <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{selectedSubtitle}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label="Clear selected condition"
                    className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card/80 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </section>

                {linkable.length ? (
                  <section>
                    <p className="text-[13px] font-medium text-foreground">
                      Link a medication to this condition?{' '}
                      <span className="font-normal text-muted-foreground">(Optional)</span>
                    </p>
                    <ul className="mt-2.5 space-y-1">
                      {linkable.map((med) => {
                        const current = medicationConditionLabels?.[med.id];
                        return (
                          <li key={med.id}>
                            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/40">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                                checked={linkedIds.includes(med.id)}
                                onChange={() => toggleLinked(med.id)}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm leading-snug text-foreground">
                                  {medicationLinkLabel(med)}
                                </span>
                                {current ? (
                                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                    Currently linked to {current}
                                  </span>
                                ) : unresolvedIds.includes(med.id) ? (
                                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                    No indication yet
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : (
              <div className="space-y-5 pb-4">
                <section>
                  <SectionHint
                    label="Suggested conditions"
                    hint="Ranked from the current medication list. Suggestions are not confirmed until you add them."
                  />
                  {suggestionsUnavailable ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Suggested conditions are unavailable right now. Search the approved library instead.
                    </p>
                  ) : suggested.length ? (
                    <ul className="mt-1">
                      {suggested.map((row) => (
                        <ConditionAddRow
                          key={row.id}
                          name={row.displayName}
                          onAdd={() => selectCondition(row.id)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No extra suggestions right now.</p>
                  )}
                </section>

                <section>
                  <SectionHint
                    label="Search all conditions"
                    hint="Search the approved condition library. Use Other / specify only when the indication is not in the library."
                  />
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-10 rounded-[10px] pl-9"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        requestSearch(e.target.value);
                      }}
                      placeholder="Search for a condition"
                      autoComplete="off"
                    />
                  </div>
                  {q ? (
                    <div className="mt-2">
                      {searchResults.length ? (
                        <ul>
                          {searchResults.map((row) => (
                            <ConditionAddRow
                              key={row.id}
                              name={row.displayName}
                              onAdd={() => selectCondition(row.id)}
                            />
                          ))}
                        </ul>
                      ) : searching || queued ? (
                        <p className="text-[13px] text-muted-foreground">Searching…</p>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">No matching conditions.</p>
                      )}
                    </div>
                  ) : null}
                </section>

                {!q ? (
                  <section>
                    <h3 className="text-[13px] font-semibold text-foreground">Or choose from common conditions</h3>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {commonChips.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => selectCondition(row.id)}
                          className="inline-flex h-8 items-center rounded-full border border-[#d9e4e8] bg-white px-3 text-[12px] font-medium text-[#102a43] hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                        >
                          {row.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => selectCondition('other')}
                        className="inline-flex h-8 items-center rounded-full border border-dashed border-[#d9e4e8] bg-white px-3 text-[12px] font-medium text-[#52677a] hover:border-primary/40 hover:text-primary"
                      >
                        Other
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </TooltipProvider>

        <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
          <Button type="button" variant="outline" className="h-10 rounded-lg px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(
              'h-10 rounded-lg px-5',
              !canSubmit && 'disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
            )}
            disabled={!canSubmit}
            onClick={submit}
          >
            {selectedId ? 'Add condition' : 'Add selected condition'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Common chips from the indication master table (`commonForRenewal`), never a hardcoded list. */
function commonConditionChips(
  conditions: RenewConditionCatalogItem[],
  existing: Set<string>,
  excludeIds: Set<string>,
  limit = 8,
): Array<{ id: string; label: string }> {
  return conditions
    .filter(
      (row) =>
        row.code !== 'OTHER_CUSTOM' &&
        row.commonForRenewal &&
        !existing.has(row.id) &&
        !excludeIds.has(row.id),
    )
    .slice()
    .sort(
      (a, b) =>
        a.displayPriority - b.displayPriority || a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit)
    .map((row) => ({ id: row.id, label: row.displayName }));
}

function conditionSubtitle(row: RenewConditionCatalogItem | null | undefined): string | null {
  if (!row) return null;
  if (row.description?.trim()) return row.description.trim();
  if (row.category && row.category !== 'other') {
    return row.category.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return null;
}

function medicationLinkLabel(med: RenewMedication): string {
  const name = medicationDisplayName(med);
  const directions = medicationDirections(med);
  return directions ? `${name} – ${directions}` : name;
}

function SectionHint({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-[13px] font-semibold text-foreground">{label}</h3>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label={`About ${label.toLowerCase()}`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ConditionAddRow({ name, onAdd }: { name: string; onAdd: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-sm text-foreground">{name}</span>
      <button
        type="button"
        onClick={onAdd}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[12px] font-semibold text-foreground',
          'hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </button>
    </li>
  );
}
