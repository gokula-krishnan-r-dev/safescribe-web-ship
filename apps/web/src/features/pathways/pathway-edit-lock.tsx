'use client';

import { Info } from 'lucide-react';
import { PATHWAY_EDIT_LOCKED_HINT } from './pathway-utils';

/** Shared disabled/title props for Add / Edit / Delete controls when a pathway is live. */
export function editLockProps(canEdit: boolean): {
  disabled: boolean;
  title?: string;
} {
  if (canEdit) return { disabled: false };
  return { disabled: true, title: PATHWAY_EDIT_LOCKED_HINT };
}

export function PathwayReadOnlyBanner({ canEdit }: { canEdit: boolean }) {
  if (canEdit) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.06] px-3.5 py-2.5 text-sm text-primary">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>If pathway is live, take it offline to add or edit content.</span>
    </div>
  );
}
