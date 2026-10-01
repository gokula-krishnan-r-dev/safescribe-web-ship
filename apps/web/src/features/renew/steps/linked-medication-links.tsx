'use client';

import { memo, useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  medicationDisplayName,
  medicationShortName,
  type RenewMedication,
} from '@safescript/shared';

export function medicationsByIdMap(medications: RenewMedication[]) {
  return new Map(medications.map((med) => [med.id, med]));
}

export function resolveLinkedMedications(
  medicationIds: string[],
  byId: Map<string, RenewMedication>,
) {
  const linked: RenewMedication[] = [];
  for (const id of medicationIds) {
    const med = byId.get(id);
    if (med) linked.push(med);
  }
  return linked;
}

function LinkedMedicationLinksInner({
  medications,
  onMedicationClick,
  layout = 'inline',
  disabled = false,
  className,
}: {
  medications: RenewMedication[];
  onMedicationClick: (medicationId: string) => void;
  layout?: 'inline' | 'stack';
  disabled?: boolean;
  className?: string;
}) {
  if (!medications.length) {
    return (
      <p className={cn('text-[12px] leading-snug text-muted-foreground', className)}>
        No medications linked yet
      </p>
    );
  }

  const inline = layout === 'inline';
  const lastIndex = medications.length - 1;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="list"
        aria-label="Linked medications"
        className={cn(
          inline
            ? 'text-[12px] leading-snug text-primary'
            : 'flex flex-col items-start gap-1',
          className,
        )}
      >
        {medications.map((med, index) => {
          const shortName = medicationShortName(med);
          const fullName = medicationDisplayName(med);
          return (
            <span key={med.id} role="listitem" className={inline ? 'inline' : 'block'}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      'cursor-pointer rounded-sm text-left font-medium text-primary underline-offset-2',
                      'hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                      'disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60',
                      inline ? 'text-[12px] leading-snug' : 'text-[13px]',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMedicationClick(med.id);
                    }}
                    aria-label={`Review or change indication for ${fullName}`}
                  >
                    {shortName}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Review or change indication</TooltipContent>
              </Tooltip>{inline && index < lastIndex ? <span aria-hidden>, </span> : null}
            </span>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export const LinkedMedicationLinks = memo(LinkedMedicationLinksInner);

export function useLinkedMedicationLookup(medications: RenewMedication[]) {
  return useMemo(() => medicationsByIdMap(medications), [medications]);
}
