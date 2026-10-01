'use client';

import { cn } from '@/lib/utils';
import {
  REFERENCE_STATUS_LABELS,
  GOVERNANCE_STATUS_LABELS,
  type EvidenceReferenceStatus,
  type GovernanceReviewStatus,
} from '@safescript/shared';

const REF_STATUS_STYLES: Record<EvidenceReferenceStatus, string> = {
  verified: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  needs_review: 'bg-amber-50 text-amber-800 border-amber-200',
  verification_required: 'bg-orange-50 text-orange-800 border-orange-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const GOV_STATUS_STYLES: Record<GovernanceReviewStatus, string> = {
  completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  not_started: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function ReferenceStatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? 'needs_review') as EvidenceReferenceStatus;
  const label = REFERENCE_STATUS_LABELS[key] ?? status ?? 'Needs review';
  const styles = REF_STATUS_STYLES[key] ?? REF_STATUS_STYLES.needs_review;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        styles,
      )}
    >
      {label}
    </span>
  );
}

export function GovernanceStatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? 'not_started') as GovernanceReviewStatus;
  const label = GOVERNANCE_STATUS_LABELS[key] ?? status ?? 'Not started';
  const styles = GOV_STATUS_STYLES[key] ?? GOV_STATUS_STYLES.not_started;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        styles,
      )}
    >
      {label}
    </span>
  );
}
