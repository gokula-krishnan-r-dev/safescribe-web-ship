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
import type { PathwayEvidenceLibraryReference } from '../types';

export function LinkReferenceDialog({
  open,
  onClose,
  title,
  library,
  selectedIds,
  canEdit,
  saving,
  onSave,
  onManageLibrary,
  description = 'Select references from the References & Governance library. Citation metadata is edited there, not on this question.',
  searchPlaceholder = 'Search library references',
  saveLabel,
  showManageInFooter = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  library: PathwayEvidenceLibraryReference[];
  selectedIds: string[];
  canEdit: boolean;
  saving?: boolean;
  onSave: (ids: string[]) => Promise<void> | void;
  onManageLibrary: () => void;
  description?: string;
  searchPlaceholder?: string;
  saveLabel?: string | ((count: number) => string);
  showManageInFooter?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (!open) return;
    setDraft(selectedIds);
    setQuery('');
  }, [open, selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((ref) =>
      `${ref.citationTitle} ${ref.organization ?? ''} ${ref.edition ?? ''} ${ref.documentType ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [library, query]);

  const toggle = (id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const confirmLabel =
    typeof saveLabel === 'function'
      ? saveLabel(draft.length)
      : saveLabel ?? 'Save links';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        {library.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium">No library references yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create or manage references in References & Governance first.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onManageLibrary}>
              Manage references in References & Governance →
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
            />
            <div className="max-h-[320px] space-y-1 overflow-y-auto rounded-xl border border-border/80 p-1.5">
              {filtered.map((ref) => {
                const checked = draft.includes(ref.id);
                return (
                  <label
                    key={ref.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-border accent-primary"
                      checked={checked}
                      disabled={!canEdit}
                      onChange={() => toggle(ref.id)}
                    />
                    <span>
                      <span className="block text-sm font-medium leading-snug">{citationDisplay(ref)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[ref.organization, editionLabel(ref)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                );
              })}
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching references.</p>
              ) : null}
            </div>
          </div>
        )}
        <DialogFooter>
          {showManageInFooter ? (
            <Button type="button" variant="ghost" onClick={onManageLibrary}>
              Manage library
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canEdit || saving || library.length === 0}
            onClick={async () => {
              await onSave(draft);
              onClose();
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
