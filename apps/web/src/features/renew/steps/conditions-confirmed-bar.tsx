'use client';

import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isConfirmedConditionGroup,
  type RenewMedication,
  type TherapyConditionGroup,
} from '@safescript/shared';
import { UnresolvedMedicationsPanel } from './unresolved-medications-panel';

export function ConditionsConfirmedBar({
  groups,
  unresolved,
  onViewEdit,
  onAddCondition,
  onSelectIndication,
}: {
  groups: TherapyConditionGroup[];
  unresolved: RenewMedication[];
  onViewEdit: () => void;
  onAddCondition: () => void;
  onSelectIndication: (medicationId: string) => void;
}) {
  const confirmed = groups.filter(isConfirmedConditionGroup);
  const conditionCount = confirmed.length;
  const medicationCount = confirmed.reduce((sum, group) => sum + group.medicationIds.length, 0);
  const allLinked = unresolved.length === 0;

  return (
    <section className="space-y-3">
      {allLinked && conditionCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-emerald-200/90 bg-[#eef8f2] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b9560] text-white">
              <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug text-[#102a43]">Conditions confirmed</p>
              <p className="mt-0.5 text-[13px] text-[#52677a]">
                {conditionCount} condition{conditionCount === 1 ? '' : 's'} · {medicationCount} medication
                {medicationCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onViewEdit}
              className="inline-flex h-9 items-center rounded-lg border border-[#c5d4d8] bg-white px-3 text-[13px] font-semibold text-[#102a43] hover:bg-[#f7fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            >
              View / edit
            </button>
            <button
              type="button"
              onClick={onAddCondition}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold text-primary hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            >
              <Plus className="h-3.5 w-3.5" />
              Add condition
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-[#52677a]">
              Confirm an indication for every medication before reviewing therapy.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {confirmed.length ? (
                <button
                  type="button"
                  onClick={onViewEdit}
                  className="inline-flex h-9 items-center rounded-lg border border-[#c5d4d8] bg-white px-3 text-[13px] font-semibold text-[#102a43] hover:bg-[#f7fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                >
                  View / edit
                </button>
              ) : null}
              <button
                type="button"
                onClick={onAddCondition}
                className={cn(
                  'inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold text-primary',
                  'hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add condition
              </button>
            </div>
          </div>
          <UnresolvedMedicationsPanel
            medications={unresolved}
            showComplete={false}
            onSelectIndication={onSelectIndication}
          />
        </div>
      )}
    </section>
  );
}
