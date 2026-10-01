'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  citationDisplay,
  editionLabel,
  DOCUMENT_TYPE_LABELS,
  REFERENCE_STATUS_LABELS,
  type EvidenceDocumentType,
  type EvidenceReferenceStatus,
} from '@safescript/shared';
import type { PathwayEvidenceReference } from '../types';

export function EvidenceReferencePicker({
  library,
  selectedIds,
  onChange,
  disabled,
  verifiedOnly = false,
  className,
  emptyLabel = 'No library references yet.',
}: {
  library: PathwayEvidenceReference[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  verifiedOnly?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    let list = library;
    if (verifiedOnly) {
      list = list.filter((r) => r.status === 'verified');
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((ref) =>
      `${ref.citationTitle} ${ref.organization ?? ''} ${ref.documentType ?? ''} ${ref.edition ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [library, query, verifiedOnly]);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((row) => row !== id)
        : [...selectedIds, id],
    );
  };

  if (library.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search references…"
        disabled={disabled}
        className="h-9"
      />
      <div className="max-h-[240px] space-y-0.5 overflow-y-auto rounded-lg border border-border/80 p-1">
        {options.map((ref) => {
          const checked = selectedIds.includes(ref.id);
          const typeLabel =
            DOCUMENT_TYPE_LABELS[ref.documentType as EvidenceDocumentType] ??
            ref.documentType ??
            'Reference';
          const statusLabel =
            REFERENCE_STATUS_LABELS[ref.status as EvidenceReferenceStatus] ??
            ref.status ??
            'Needs review';
          return (
            <label
              key={ref.id}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-3.5 w-3.5 rounded border-border accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(ref.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-snug">
                  {citationDisplay(ref)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {editionLabel(ref)} · {typeLabel} · {statusLabel}
                </span>
              </span>
            </label>
          );
        })}
        {options.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No matching references.</p>
        ) : null}
      </div>
    </div>
  );
}
