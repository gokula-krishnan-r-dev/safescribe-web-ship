'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  medicationDisplayName,
  medicationDirections,
  type RenewConditionCatalogItem,
  type RenewIndicationCandidate,
  type RenewMedication,
} from '@safescript/shared';

export function MedicationIndicationDialog({
  open,
  medication,
  currentLabel,
  candidates,
  peerConditions,
  searchHits,
  onSearch,
  searching,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  medication: RenewMedication | null;
  currentLabel: string | null;
  candidates: RenewIndicationCandidate[];
  peerConditions: Array<{ id: string; label: string }>;
  searchHits: RenewConditionCatalogItem[];
  onSearch: (q: string) => void;
  searching?: boolean;
  onClose: () => void;
  onSave: (value: {
    conditionId?: string | null;
    customIndicationText?: string | null;
    label: string;
  }) => void;
  saving?: boolean;
}) {
  const isChange = Boolean(currentLabel);
  const [selectedId, setSelectedId] = useState<string | 'other' | null>(null);
  const [customText, setCustomText] = useState('');
  const [query, setQuery] = useState('');
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    setSelectedId(null);
    setCustomText('');
    setQuery('');
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
  }, [medication?.id, currentLabel, open]);

  const requestSearch = (q: string) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => onSearch(q), 180);
  };

  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; label: string }> = [];
    const push = (id: string, label: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({ id, label });
    };
    if (isChange) {
      for (const peer of peerConditions) push(peer.id, peer.label);
    } else {
      for (const candidate of candidates) push(candidate.conditionId, candidate.displayName);
      for (const peer of peerConditions) push(peer.id, peer.label);
    }
    if (query.trim()) {
      for (const condition of searchHits) {
        if (condition.code === 'OTHER_CUSTOM') continue;
        push(condition.id, condition.displayName);
      }
    }
    return list;
  }, [candidates, isChange, peerConditions, query, searchHits]);

  if (!medication) return null;
  const title = medicationDisplayName(medication);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isChange ? 'Change indication' : title}</DialogTitle>
          <DialogDescription>
            {isChange
              ? `Current indication: ${currentLabel}`
              : medicationDirections(medication) || 'Select the correct indication for this medication.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isChange ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Current indication
              </p>
              <p className="mt-0.5 text-sm font-medium">{currentLabel}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{title}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-[12px] text-muted-foreground">
                {medicationDirections(medication) || 'Directions not identified'}
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">
              {isChange ? 'Change indication to' : 'Select indication'}
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
              {options.map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm',
                    selectedId === option.id
                      ? 'border-primary bg-primary/[0.06] font-medium text-primary'
                      : 'border-border bg-card hover:border-primary/35',
                  )}
                >
                  <input
                    type="radio"
                    name="indication"
                    checked={selectedId === option.id}
                    onChange={() => setSelectedId(option.id)}
                    className="accent-primary"
                  />
                  {option.label}
                </label>
              ))}
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm',
                  selectedId === 'other'
                    ? 'border-primary bg-primary/[0.06] font-medium text-primary'
                    : 'border-border bg-card hover:border-primary/35',
                )}
              >
                <input
                  type="radio"
                  name="indication"
                  checked={selectedId === 'other'}
                  onChange={() => setSelectedId('other')}
                  className="accent-primary"
                />
                Other / specify
              </label>
            </div>
          </div>

          {selectedId === 'other' ? (
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Enter the indication"
              maxLength={200}
            />
          ) : isChange ? null : (
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                requestSearch(e.target.value);
              }}
              placeholder="Search all conditions"
              autoComplete="off"
            />
          )}
          {searching && !isChange ? <p className="text-[12px] text-muted-foreground">Searching…</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-10 rounded-md"
              disabled={saving || !selectedId || (selectedId === 'other' && !customText.trim())}
              onClick={() => {
                if (selectedId === 'other') {
                  onSave({
                    conditionId: null,
                    customIndicationText: customText.trim(),
                    label: customText.trim(),
                  });
                  return;
                }
                if (selectedId?.startsWith('custom:')) {
                  const text = selectedId.slice('custom:'.length);
                  onSave({ conditionId: null, customIndicationText: text, label: text });
                  return;
                }
                onSave({
                  conditionId: selectedId,
                  customIndicationText: null,
                  label: options.find((row) => row.id === selectedId)?.label ?? 'condition',
                });
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
