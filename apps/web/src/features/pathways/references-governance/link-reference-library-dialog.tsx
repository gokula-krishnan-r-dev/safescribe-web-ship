'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { citationDisplay } from '@safescript/shared';
import { useReferenceLibrarySearch } from '@/features/reference-library/hooks';
import { documentTypeLabel, yearEditionLabel } from './utils';
import { cn } from '@/lib/utils';

export function LinkReferenceLibraryDialog({
  open,
  onClose,
  pathwayId,
  saving,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  pathwayId: string;
  saving?: boolean;
  onLink: (libraryItemId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useReferenceLibrarySearch(
    { q: query, pathwayId, page: 1 },
    open,
  );
  const rows = search.data?.data ?? [];

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedId(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Link from Reference Library</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Search the master citation library and attach a reference to this pathway.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search master references…"
            className="pl-9"
          />
        </div>
        <div className="max-h-[320px] space-y-1 overflow-y-auto rounded-xl border border-border/80 p-1.5">
          {search.isFetching ? (
            <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matching master references.
            </p>
          ) : (
            rows.map((item) => {
              const selected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.alreadyLinked}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2.5 text-left',
                    item.alreadyLinked
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:bg-muted/60',
                    selected && 'bg-primary/5 ring-1 ring-primary/30',
                  )}
                >
                  <p className="text-sm font-medium">{citationDisplay(item)}</p>
                  <p className="text-xs text-muted-foreground">
                    {documentTypeLabel(item.documentType)} · {yearEditionLabel(item)}
                    {item.alreadyLinked ? ' · Already linked' : ''}
                  </p>
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedId || saving}
            onClick={async () => {
              if (!selectedId) return;
              await onLink(selectedId);
            }}
          >
            {saving ? 'Linking…' : 'Link reference'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
