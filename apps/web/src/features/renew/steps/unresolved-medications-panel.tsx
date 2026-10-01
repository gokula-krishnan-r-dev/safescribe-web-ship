'use client';

import { CheckCircle2, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  medicationDisplayName,
  medicationDirections,
  type RenewMedication,
} from '@safescript/shared';

export function UnresolvedMedicationsPanel({
  medications,
  showComplete,
  onSelectIndication,
}: {
  medications: RenewMedication[];
  showComplete?: boolean;
  onSelectIndication: (medicationId: string) => void;
}) {
  if (!medications.length) {
    if (!showComplete) return null;
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          All medications have an indication. You can continue.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-950">Needs indication confirmation</h3>
          <p className="mt-0.5 text-[12px] text-amber-900/80">
            These medications do not have a clear linked condition. Please select the correct indication.
          </p>
        </div>
        <Badge variant="warning">
          {medications.length} medication{medications.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <ul className="mt-3 space-y-2">
        {medications.map((med) => {
          const directions = medicationDirections(med);
          return (
            <li
              key={med.id}
              className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{medicationDisplayName(med)}</p>
                {directions ? <p className="text-[12px] text-muted-foreground">{directions}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => onSelectIndication(med.id)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium',
                  'hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                )}
              >
                Select indication
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
