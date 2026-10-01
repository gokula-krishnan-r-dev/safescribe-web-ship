'use client';

import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntitlementUsageSnapshot } from '@safescript/shared';

function resetLabel(snapshot: EntitlementUsageSnapshot) {
  try {
    return new Date(snapshot.resetsAt).toLocaleTimeString('en-CA', {
      timeZone: snapshot.timezone,
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'midnight';
  }
}

export function PrescribeUsageMeter({
  snapshot,
  compact = false,
  className,
}: {
  snapshot: EntitlementUsageSnapshot | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!snapshot || snapshot.unlimited) return null;

  const included = snapshot.included ?? 0;
  const used = snapshot.used;
  const remaining = snapshot.remaining ?? 0;
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const exhausted = remaining <= 0;
  const tight = !exhausted && remaining <= 2;

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5',
        exhausted
          ? 'border-amber-200 bg-amber-50/80'
          : tight
            ? 'border-primary/20 bg-primary/[0.04]'
            : 'border-border/70 bg-card',
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" aria-hidden />
          {snapshot.moduleLabel} today
        </p>
        <p
          className={cn(
            'text-[12px] font-semibold tabular-nums',
            exhausted ? 'text-amber-800' : 'text-foreground',
          )}
        >
          {used}
          <span className="font-medium text-muted-foreground"> / {included}</span>
        </p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={included}
        aria-label={`${used} of ${included} ${snapshot.moduleLabel} assessments used today`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            exhausted ? 'bg-amber-500' : tight ? 'bg-primary/80' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {exhausted
            ? `Today’s included assessments are used. Resets at ${resetLabel(snapshot)}.`
            : `${remaining} remaining · resets at ${resetLabel(snapshot)}`}
        </p>
      ) : null}
    </div>
  );
}
