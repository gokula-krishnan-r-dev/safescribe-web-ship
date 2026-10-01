'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EvidenceSection } from '@safescript/shared';
import type { ClinicalPathway, PathwayEvidenceMapping } from '../types';
import { cn } from '@/lib/utils';
import {
  applyAllToDraft,
  buildExpandedDraft,
  buildGroups,
  parseKey,
  sectionSelectionState,
  toggleItemInDraft,
  type DraftKey,
  type SectionGroup,
} from './link-mapping-draft';

export function LinkMappingDialog({
  open,
  onClose,
  pathway,
  existing,
  saving,
  onSave,
  referenceLabel,
}: {
  open: boolean;
  onClose: () => void;
  pathway: ClinicalPathway;
  existing: PathwayEvidenceMapping[];
  saving?: boolean;
  referenceLabel?: string | null;
  onSave: (
    mappings: Array<{
      section: string;
      mappingType: string;
      targetId?: string | null;
      suggested?: boolean;
    }>,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Set<DraftKey>>(new Set());
  const [expanded, setExpanded] = useState<Set<EvidenceSection>>(new Set());

  const groups = useMemo(() => buildGroups(pathway), [pathway]);

  useEffect(() => {
    if (!open) return;
    const next = buildExpandedDraft(existing, groups);
    setDraft(next);

    const openSections = new Set<EvidenceSection>();
    for (const group of groups) {
      const state = sectionSelectionState(next, group);
      if (state.applyAllChecked || state.selectedCount > 0) {
        openSections.add(group.section);
      }
    }
    if (openSections.size === 0 && groups[0]) {
      openSections.add(groups[0].section);
    }
    setExpanded(openSections);
  }, [open, existing, groups]);

  const toggleApplyAll = useCallback((group: SectionGroup) => {
    setDraft((prev) => {
      const state = sectionSelectionState(prev, group);
      return applyAllToDraft(prev, group, !state.applyAllChecked);
    });
    setExpanded((prev) => {
      if (prev.has(group.section)) return prev;
      const next = new Set(prev);
      next.add(group.section);
      return next;
    });
  }, []);

  const toggleItem = useCallback((group: SectionGroup, itemKey: DraftKey) => {
    setDraft((prev) => toggleItemInDraft(prev, group, itemKey));
  }, []);

  const toggleExpanded = useCallback((section: EvidenceSection) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const selectedTotal = draft.size;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Link to pathway content</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {referenceLabel?.trim()
            ? `Choose where “${referenceLabel.trim()}” is used. “Apply to all” links the whole section and every item inside it.`
            : 'Choose section-wide links and/or specific items this reference supports. “Apply to all” selects every item in a section.'}
        </p>
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {groups.map((group) => {
            const state = sectionSelectionState(draft, group);
            const isOpen = expanded.has(group.section);
            return (
              <section
                key={group.section}
                className="rounded-xl border border-border/80 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => toggleExpanded(group.section)}
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        !isOpen && '-rotate-90',
                      )}
                      aria-hidden
                    />
                    <h4 className="truncate text-sm font-semibold">{group.label}</h4>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {state.selectedCount}/{group.items.length}
                    </span>
                  </button>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                      checked={state.applyAllChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = state.applyAllIndeterminate;
                      }}
                      onChange={() => toggleApplyAll(group)}
                      aria-label={`Apply to all items in ${group.label}`}
                    />
                    Apply to all
                  </label>
                </div>

                {isOpen ? (
                  group.items.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No items in this section yet.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                      {group.items.map((item, index) => {
                        const itemKey = group.itemKeys[index]!;
                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary"
                              checked={draft.has(itemKey)}
                              onChange={() => toggleItem(group, itemKey)}
                            />
                            <span className="text-sm leading-snug">{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground sm:mr-auto">
            {selectedTotal === 0
              ? 'No links selected'
              : `${selectedTotal} link${selectedTotal === 1 ? '' : 's'} selected`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Skip for now
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                const mappings = Array.from(draft).map((key) => {
                  const parsed = parseKey(key);
                  return {
                    section: parsed.section,
                    mappingType: parsed.mappingType,
                    targetId: parsed.targetId,
                    suggested: false,
                  };
                });
                await onSave(mappings);
                onClose();
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save links
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
