'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { citationDisplay, editionLabel } from '@safescript/shared';
import type { PathwayEvidenceReference } from '../types';
import { cn } from '@/lib/utils';

export function PrimaryDocPickerDialog({
  open,
  onClose,
  library,
  selectedId,
  excludeId,
  saving,
  onSave,
  role = 'primary',
}: {
  open: boolean;
  onClose: () => void;
  library: PathwayEvidenceReference[];
  selectedId?: string | null;
  /** The other documentation slot — cannot be selected here. */
  excludeId?: string | null;
  saving?: boolean;
  onSave: (id: string | null) => Promise<void>;
  role?: 'primary' | 'secondary';
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string | null>(selectedId ?? null);
  const isSecondary = role === 'secondary';

  useEffect(() => {
    if (open) {
      setDraft(selectedId ?? null);
      setQuery('');
    }
  }, [open, selectedId]);

  const verified = useMemo(
    () => library.filter((r) => r.status === 'verified'),
    [library],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = verified.filter((ref) => ref.id !== excludeId);
    if (!q) return list;
    return list.filter((ref) =>
      `${ref.citationTitle} ${ref.organization ?? ''}`.toLowerCase().includes(q),
    );
  }, [verified, query, excludeId]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isSecondary ? 'Secondary documentation reference' : 'Primary documentation reference'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isSecondary
            ? 'Shown on pharmacist evidence popups and generated notes when a second source is needed.'
            : 'Shown on pharmacist evidence popups and generated consultation notes for this pathway.'}{' '}
          Only verified library references can be selected.
        </p>
        {verified.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No verified references yet. Verify a reference first.
          </p>
        ) : (
          <div className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search verified references…"
            />
            <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-xl border border-border/80 p-1.5">
              {filtered.map((ref) => {
                const selected = draft === ref.id;
                return (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => setDraft(ref.id)}
                    className={cn(
                      'flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors',
                      selected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="text-sm font-medium leading-snug">{citationDisplay(ref)}</span>
                    <span className="text-xs text-muted-foreground">{editionLabel(ref)}</span>
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
              ) : null}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
            Clear selection
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || (verified.length === 0 && draft !== null)}
              onClick={async () => {
                try {
                  await onSave(draft);
                  onClose();
                } catch {
                  /* Caller surfaces the error; keep the picker open. */
                }
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
