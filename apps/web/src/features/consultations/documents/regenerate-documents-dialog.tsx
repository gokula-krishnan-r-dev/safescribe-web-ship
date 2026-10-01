'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocumentMeta, DocumentTypeId } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: DocumentMeta[];
  /** Document IDs known to contain pharmacist manual edits */
  manuallyEditedIds?: Set<DocumentTypeId> | DocumentTypeId[];
  /** Block regenerate while the document editor has unsaved changes */
  editorDirty?: boolean;
  loading?: boolean;
  onConfirm: (selectedIds: DocumentTypeId[]) => void;
}

/**
 * Spec §14 — selective regenerate with confirmation.
 * Defaults to no documents selected; never regenerates unrelated docs silently.
 */
export function RegenerateDocumentsDialog({
  open,
  onOpenChange,
  definitions,
  manuallyEditedIds,
  editorDirty = false,
  loading = false,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<Set<DocumentTypeId>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  if (!open) return null;

  const edited = new Set(
    Array.isArray(manuallyEditedIds)
      ? manuallyEditedIds
      : [...(manuallyEditedIds ?? [])],
  );
  const hasManualEdits = [...selected].some((id) => edited.has(id));
  const canConfirm = selected.size > 0 && !editorDirty && !loading;

  const toggle = (id: DocumentTypeId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => !loading && onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div className="flex gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <RotateCcw className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">
                Regenerate documents?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Regeneration will create new document versions. Manual edits in
                the selected documents may be replaced, and each regenerated
                document will require review again.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !loading && onOpenChange(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-6 pb-2">
          {editorDirty ? (
            <p
              className="flex items-start gap-2 rounded-lg border border-[#e6a6aa] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#b4232a]"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Save or discard unsaved editor changes before regenerating.
            </p>
          ) : null}

          {hasManualEdits ? (
            <p className="flex items-start gap-2 rounded-lg border border-[#efc57f] bg-[#fff8eb] px-3 py-2 text-[13px] text-[#9a5600]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              One or more selected documents include manual edits that may be
              replaced.
            </p>
          ) : null}

          <p className="text-[13px] font-semibold text-[#25303b]">
            Select documents to regenerate
          </p>
          <ul className="grid max-h-[40vh] gap-2 overflow-y-auto pr-1">
            {definitions.map((def) => {
              const checked = selected.has(def.id);
              const wasEdited = edited.has(def.id);
              return (
                <li key={def.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      checked
                        ? 'border-[#0f766e] bg-[#eff9f8]'
                        : 'border-[#d5e2e6] bg-white hover:bg-[#f7fafb]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={loading}
                      onChange={() => toggle(def.id)}
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#0f817c]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-[#111827]">
                        {def.name}
                      </span>
                      {wasEdited ? (
                        <span className="mt-0.5 block text-[12px] text-[#9a5600]">
                          Contains manual edits
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[12px] text-[#66727d]">
                          {def.shortName ?? def.description}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="shadow-none"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!canConfirm) return;
              onConfirm([...selected]);
            }}
            disabled={!canConfirm}
            className="min-w-[160px] bg-[#0f817c] hover:bg-[#0c6f6b]"
          >
            {loading ? 'Regenerating…' : 'Regenerate selected'}
          </Button>
        </div>
      </div>
    </div>
  );
}
