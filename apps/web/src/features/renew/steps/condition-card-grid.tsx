'use client';

import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isConfirmedConditionGroup,
  type RenewMedication,
  type TherapyConditionGroup,
} from '@safescript/shared';
import {
  LinkedMedicationLinks,
  resolveLinkedMedications,
  useLinkedMedicationLookup,
} from './linked-medication-links';

export function ConditionCardGrid({
  groups,
  medications,
  onMedicationClick,
  onAddCondition,
  linking,
}: {
  groups: TherapyConditionGroup[];
  medications: RenewMedication[];
  onMedicationClick: (medicationId: string) => void;
  onAddCondition: () => void;
  linking?: boolean;
}) {
  const visible = groups.filter(isConfirmedConditionGroup);
  const byId = useLinkedMedicationLookup(medications);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visible.map((group) => (
        <article
          key={group.key}
          className="flex min-h-[132px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <span
              className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 border-primary bg-primary"
              aria-hidden
            >
              <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
            </span>
            <h3 className="text-sm font-semibold leading-snug text-foreground">{group.displayName}</h3>
          </div>
          <LinkedMedicationLinks
            className="mt-3"
            layout="stack"
            medications={resolveLinkedMedications(group.medicationIds, byId)}
            disabled={linking}
            onMedicationClick={onMedicationClick}
          />
        </article>
      ))}
      <button
        type="button"
        onClick={onAddCondition}
        className={cn(
          'flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 bg-primary/[0.03] px-3 py-4 text-sm font-semibold text-primary',
          'hover:border-primary/55 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-card">
          <Plus className="h-4 w-4" />
        </span>
        Add condition
      </button>
    </div>
  );
}
