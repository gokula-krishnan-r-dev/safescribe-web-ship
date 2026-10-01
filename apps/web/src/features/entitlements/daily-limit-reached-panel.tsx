'use client';

import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EntitlementUsageSnapshot } from '@safescript/shared';
import { PrescribeUsageMeter } from './prescribe-usage-meter';

export function DailyLimitReachedPanel({
  snapshot,
  onViewExisting,
}: {
  snapshot: EntitlementUsageSnapshot;
  onViewExisting?: () => void;
}) {
  const included = snapshot.included ?? snapshot.used;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200">
        <Gauge className="h-7 w-7 text-amber-700" aria-hidden />
      </div>
      <h1 className="mt-5 text-[22px] font-bold tracking-tight text-foreground">
        Today’s included {snapshot.moduleLabel} assessments have been used.
      </h1>
      <p className="mt-2 text-[15px] font-medium text-foreground">
        {included} of {included} assessments used today.
      </p>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Your existing consultations remain available. The allowance is shared across pharmacists at
        this pharmacy and resets at local midnight.
      </p>
      <div className="mt-6 w-full max-w-sm">
        <PrescribeUsageMeter snapshot={snapshot} />
      </div>
      {onViewExisting ? (
        <Button type="button" className="mt-6" onClick={onViewExisting}>
          Open existing consultations
        </Button>
      ) : null}
    </div>
  );
}
