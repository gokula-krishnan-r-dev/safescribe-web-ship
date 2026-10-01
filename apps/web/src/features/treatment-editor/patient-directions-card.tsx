'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { EditorCard } from './selected-treatment-header';
import { editorInputClass } from './editor-styles';
import type { DirectionsSource } from './types';

const BADGE: Record<DirectionsSource, string> = {
  PATHWAY: 'From pathway',
  GENERATED: 'Auto-generated',
  PHARMACIST_EDITED: 'Pharmacist modified',
  RENAL_ADJUSTED: 'Renal adjusted',
};

interface Props {
  value: string;
  source: DirectionsSource;
  onChange: (value: string) => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  error?: string;
  disabled?: boolean;
  id?: string;
}

export function PatientDirectionsCard({
  value,
  source,
  onChange,
  onEdit,
  onRegenerate,
  showRegenerate,
  error,
  disabled,
  id = 'patient-directions',
}: Props) {
  const [editing, setEditing] = useState(source === 'PHARMACIST_EDITED');

  const beginEdit = () => {
    setEditing(true);
    onEdit?.();
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const editLabel = showRegenerate && onRegenerate ? 'Update directions' : 'Edit directions';

  return (
    <EditorCard
      title="Patient directions"
      badge={BADGE[source]}
      subtitle="Appears on the prescription. Review and edit as needed."
      headerRight={
        <button
          type="button"
          disabled={disabled}
          onClick={showRegenerate && onRegenerate ? onRegenerate : beginEdit}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-semibold text-[#3d6b9a] hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/25 disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {editLabel}
        </button>
      }
    >
      {editing ? (
        <Textarea
          id={id}
          value={value}
          rows={3}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
          className={`${editorInputClass} min-h-[88px] resize-none py-2.5 leading-relaxed`}
        />
      ) : (
        <div className="rounded-[10px] bg-[#f4f7f8] px-3.5 py-3">
          <p className="text-[13.5px] leading-[1.55] text-[#344054]">{value || '—'}</p>
        </div>
      )}
      {error ? <p className="mt-1.5 text-[12px] text-destructive">{error}</p> : null}
    </EditorCard>
  );
}
