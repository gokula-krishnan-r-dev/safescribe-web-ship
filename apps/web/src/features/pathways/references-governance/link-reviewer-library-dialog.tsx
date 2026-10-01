'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { REVIEWED_AREAS, REVIEWED_AREA_LABELS } from '@safescript/shared';
import { useReviewerLibrarySearch } from '@/features/reference-library/hooks';
import { cn } from '@/lib/utils';

export function LinkReviewerLibraryDialog({
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
  onLink: (payload: {
    libraryReviewerId: string;
    reviewerType: string;
    reviewedAreas: string[];
    reviewDate: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [reviewerType, setReviewerType] = useState<'internal' | 'external'>('internal');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewDate, setReviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [areas, setAreas] = useState<string[]>(['references']);
  const search = useReviewerLibrarySearch(
    { q: query, pathwayId, reviewerType, page: 1 },
    open,
  );
  const rows = search.data?.data ?? [];

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedId(null);
      setReviewDate(new Date().toISOString().slice(0, 10));
      setAreas(['references']);
    }
  }, [open]);

  const toggleArea = (area: string) => {
    setAreas((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Link from Reviewer Library</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Search the master reviewer library, then record this pathway’s review details.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Review type</Label>
            <Select
              value={reviewerType}
              onChange={(e) => {
                setReviewerType(e.target.value as 'internal' | 'external');
                setSelectedId(null);
              }}
              options={[
                { value: 'internal', label: 'Internal clinical review' },
                { value: 'external', label: 'Independent peer review' },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-review-date">Review date</Label>
            <Input
              id="link-review-date"
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
            />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search master reviewers…"
            className="pl-9"
          />
        </div>
        <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-xl border border-border/80 p-1.5">
          {search.isFetching ? (
            <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matching master reviewers.
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
                    item.alreadyLinked ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/60',
                    selected && 'bg-primary/5 ring-1 ring-primary/30',
                  )}
                >
                  <p className="text-sm font-medium">
                    {item.name}
                    {item.credentials ? `, ${item.credentials}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.role}
                    {item.organization ? ` · ${item.organization}` : ''}
                    {item.alreadyLinked ? ' · Already linked' : ''}
                  </p>
                </button>
              );
            })
          )}
        </div>
        <div>
          <Label>Reviewed areas</Label>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {REVIEWED_AREAS.map((area) => (
              <label key={area} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={areas.includes(area)}
                  onChange={() => toggleArea(area)}
                />
                {REVIEWED_AREA_LABELS[area]}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedId || !reviewDate || areas.length === 0 || saving}
            onClick={async () => {
              if (!selectedId) return;
              await onLink({
                libraryReviewerId: selectedId,
                reviewerType,
                reviewedAreas: areas,
                reviewDate,
              });
            }}
          >
            {saving ? 'Linking…' : 'Link reviewer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
