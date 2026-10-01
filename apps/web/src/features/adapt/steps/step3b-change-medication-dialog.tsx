'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DrugSearchCombobox } from '@/features/consultations/drug-search-combobox';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { cn } from '@/lib/utils';
import type { ProposedPrescription, SuggestedAdaptation } from '@safescript/shared';
import { mapDrugToProposedPrescription } from './step3a/map-drug-to-proposed';

type TabId = 'evidence' | 'other' | 'search';

function cleanName(raw: string): string {
  return raw
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|mL|%)\b/gi, '')
    .replace(/\b(capsule|tablet|suspension|solution)s?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function Step3BChangeMedicationDialog({
  open,
  onOpenChange,
  originalDrugName,
  suggestions,
  onSelectProposed,
  onEditInStep3A,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalDrugName: string;
  suggestions: SuggestedAdaptation[];
  onSelectProposed: (proposed: ProposedPrescription) => void;
  onEditInStep3A: () => void;
}) {
  const [tab, setTab] = useState<TabId>('evidence');

  const alternatives = useMemo(() => {
    const origToken = (originalDrugName.toLowerCase().split(/\s+/)[0] || '').trim();
    return suggestions
      .filter((s) => {
        const title = (s.title || '').toLowerCase();
        if (title.includes('alternative') || title.includes('substitut')) return true;
        const proposed = (s.proposedPrescription.drugName || '').toLowerCase();
        const nextToken = proposed.split(/\s+/)[0] || '';
        return Boolean(origToken && nextToken && !proposed.includes(origToken));
      })
      .slice(0, 6);
  }, [suggestions, originalDrugName]);

  const handleDrugSelect = (drug: DrugSearchResult) => {
    onSelectProposed(
      mapDrugToProposedPrescription(drug, {
        frequency: 'Once daily',
        quantity: 30,
        refills: 1,
      }),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="space-y-1 border-b border-[#e2eaed] px-5 py-4 text-left">
          <DialogTitle className="text-[16px] font-semibold text-[#102a43]">
            Change proposed medication
          </DialogTitle>
          <DialogDescription className="text-xs text-[#627d98]">
            Select a catalogue-backed alternative. You will complete dose and SIG details in Step 3A.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-[#e2eaed] px-5 pt-3">
          <div role="tablist" className="flex gap-1 rounded-lg bg-[#f4f7f8] p-1">
            {(
              [
                { id: 'evidence' as const, label: 'Evidence-linked' },
                { id: 'other' as const, label: 'Other options' },
                { id: 'search' as const, label: 'Search' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                  tab === item.id
                    ? 'bg-white text-[#0F6F6B] shadow-sm'
                    : 'text-[#627d98] hover:text-[#102a43]',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'search' ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#102a43]">Search medication catalogue</p>
              <DrugSearchCombobox
                onSelect={handleDrugSelect}
                placeholder="Search by generic or brand name…"
                clearOnSelect
                autoFocus
              />
            </div>
          ) : alternatives.length > 0 ? (
            <ul className="space-y-2">
              {(tab === 'evidence' ? alternatives : alternatives.slice().reverse()).map((alt) => {
                const name =
                  cleanName(alt.proposedPrescription.drugName || alt.title || 'Alternative') ||
                  alt.title ||
                  'Alternative';
                const strength =
                  alt.proposedPrescription.strength ||
                  alt.proposedPrescription.dose ||
                  '';
                return (
                  <li
                    key={alt.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#e2eaed] bg-[#fbfdfe] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#102a43]">{name}</p>
                      {strength ? (
                        <p className="mt-0.5 text-[11px] font-medium text-[#627d98]">{strength}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        onSelectProposed({ ...alt.proposedPrescription });
                        onOpenChange(false);
                      }}
                      className="h-9 shrink-0 rounded-lg border-[#d9e4e8] px-3 text-[13px] font-semibold"
                    >
                      Select
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-8 text-center text-xs text-[#829ab1]">
              <Search className="mx-auto mb-2 h-4 w-4" aria-hidden />
              No pathway alternatives available. Use Search or edit in Step 3A.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#e2eaed] bg-[#f8fafb] px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              onEditInStep3A();
            }}
            className="h-9 text-[13px] font-semibold text-[#0F6F6B]"
          >
            Open full editor in 3A
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border-[#d9e4e8] text-[13px] font-semibold"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
