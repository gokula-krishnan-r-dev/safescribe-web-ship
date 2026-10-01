import { ACCESS_REQUEST_MATCH_TYPES, ACCESS_REQUEST_STATUSES } from '@safescript/shared';
import { cn } from '@/lib/utils';

export function MatchBadge({ matchType, className }: { matchType: string; className?: string }) {
  const tone =
    matchType === ACCESS_REQUEST_MATCH_TYPES.NONE
      ? 'bg-sky-50 text-sky-800 ring-sky-200'
      : matchType === ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT
        ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : matchType === ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT
          ? 'bg-orange-50 text-orange-800 ring-orange-200'
          : 'bg-yellow-50 text-yellow-800 ring-yellow-200';
  const label =
    matchType === ACCESS_REQUEST_MATCH_TYPES.NONE
      ? 'NEW'
      : matchType === ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT
        ? 'PHIX MATCH'
        : matchType === ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT
          ? 'EXISTING MATCH'
          : 'POSSIBLE MATCH';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

export function RequestStatusBadge({
  status,
  matchType,
  className,
}: {
  status: string;
  matchType?: string | null;
  className?: string;
}) {
  const effective =
    status === ACCESS_REQUEST_STATUSES.APPROVED
      ? 'activated'
      : status === ACCESS_REQUEST_STATUSES.REJECTED
        ? 'rejected'
        : status === ACCESS_REQUEST_STATUSES.NEEDS_REVIEW
          ? 'needs_review'
          : matchType === ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT ||
              matchType === ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT
            ? 'existing_match'
            : matchType === ACCESS_REQUEST_MATCH_TYPES.POSSIBLE
              ? 'possible'
              : 'pending';

  const styles: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending Review', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
    existing_match: { label: 'Existing Match', className: 'bg-orange-50 text-orange-800 ring-orange-200' },
    possible: { label: 'Possible Match', className: 'bg-yellow-50 text-yellow-800 ring-yellow-200' },
    needs_review: { label: 'Needs Review', className: 'bg-sky-50 text-sky-800 ring-sky-200' },
    activated: { label: 'Activated', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    rejected: { label: 'Rejected', className: 'bg-rose-50 text-rose-800 ring-rose-200' },
  };
  const config = styles[effective] ?? styles.pending;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
