'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DOCUMENT_EDITABLE_FIELDS } from './document-fields';
import {
  applyPrescriptionEdits,
  prescriptionToEditableFields,
} from './generators/prescription-generator';
import type { DocumentMeta, DocumentTypeId, DocumentationPackage } from './types';

interface Props {
  open: boolean;
  typeId: DocumentTypeId;
  definition?: DocumentMeta;
  pkg: DocumentationPackage;
  saving?: boolean;
  onClose: () => void;
  onSave: (next: DocumentationPackage) => void;
}

/** Legacy field form — prefer DocumentWorkspaceDialog for Notion-style Preview/Edit. */
export function DocumentEditDialog({
  open,
  typeId,
  definition,
  pkg,
  saving,
  onClose,
  onSave,
}: Props) {
  const fields = DOCUMENT_EDITABLE_FIELDS[typeId];
  const current = useMemo(() => {
    const docs = pkg.documents ?? {};
    if (typeId === 'prescription') {
      return prescriptionToEditableFields(docs.prescription);
    }
    return (docs[typeId] ?? {}) as Record<string, string>;
  }, [pkg.documents, typeId]);

  const [draft, setDraft] = useState<Record<string, string>>(current);

  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);

  if (!open) return null;

  const handleSave = () => {
    const nextDocs =
      typeId === 'prescription'
        ? {
            ...(pkg.documents ?? {}),
            prescription: applyPrescriptionEdits(
              pkg.documents?.prescription,
              draft,
            ),
          }
        : {
            ...(pkg.documents ?? {}),
            [typeId]: { ...current, ...draft },
          };
    onSave({
      ...pkg,
      documents: nextDocs,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Edit {definition?.name ?? 'document'}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Changes are saved to this consultation before finalization and are included in the
                audit trail.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`edit-${f.key}`} className="text-xs font-medium">
                {f.label}
              </Label>
              <Textarea
                id={`edit-${f.key}`}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                rows={3}
                className="resize-y text-sm"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
