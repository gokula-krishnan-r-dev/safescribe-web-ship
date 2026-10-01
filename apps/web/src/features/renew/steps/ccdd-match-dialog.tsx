'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  medicationDisplayName,
  pharmacistCodeLabel,
  type RenewCcddCandidate,
  type RenewMedication,
} from '@safescript/shared';

export function CcddMatchDialog({
  medication,
  onSkip,
  onSelect,
  onSearchManually,
}: {
  medication: RenewMedication | null;
  onSkip: () => void;
  onSelect: (candidate: RenewCcddCandidate) => void;
  onSearchManually?: () => void;
}) {
  if (!medication) return null;

  const unresolvedExact =
    medication.resolutionStatus === 'UNRESOLVED' &&
    Boolean(medication.productIdentity?.isExplicitProduct);
  const candidates = medication.ccddCandidates ?? [];
  const sourceName =
    medication.productIdentity?.sourceDisplayName || medicationDisplayName(medication);

  return (
    <Dialog open onOpenChange={(open) => !open && onSkip()}>
      <DialogContent className="max-w-[520px] rounded-2xl p-0 sm:max-w-[520px]">
        <div className="px-6 pb-2 pt-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-[18px] font-bold tracking-tight text-[#163447]">
              {unresolvedExact ? 'Exact product could not be matched' : 'Select the matching medication'}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-[#5b6b75]">
              {unresolvedExact ? (
                <>
                  Extracted: <span className="font-medium text-[#163447]">{sourceName}</span>. Keep
                  the extracted name, or search for a product manually. A different manufacturer is
                  not substituted automatically.
                </>
              ) : (
                <>
                  More than one clinically distinct match was found for {sourceName}. Select the
                  medication that matches the source.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {candidates.length ? (
          <div className="max-h-80 space-y-2.5 overflow-y-auto px-6 py-2">
            {candidates.map((candidate) => {
              const title =
                candidate.pharmacistDisplayName ||
                [candidate.genericName, candidate.brandName].filter(Boolean).join(' · ') ||
                candidate.label;
              const din = pharmacistCodeLabel(candidate.din, candidate.codeDisplay);
              const detail =
                candidate.pharmacistDetail ||
                [candidate.genericName, candidate.strength, candidate.dosageForm, din]
                  .filter(Boolean)
                  .join(' · ');
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelect(candidate)}
                  className={cn(
                    'w-full rounded-xl border border-[#d9e3e6] px-4 py-3.5 text-left transition-colors',
                    'hover:border-primary/40 hover:bg-[#f7fbfb]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                  )}
                >
                  <p className="text-sm font-semibold text-[#163447]">{title}</p>
                  <p className="mt-1 text-[12px] text-[#7b8b94]">{detail}</p>
                  {candidate.clinicalDifference ? (
                    <p className="mt-1.5 text-[12px] font-medium text-primary">
                      {candidate.clinicalDifference}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#edf3f4] px-6 py-4">
          {unresolvedExact && onSearchManually ? (
            <Button type="button" variant="outline" className="h-9" onClick={onSearchManually}>
              Search manually
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="h-9" onClick={onSkip}>
            Keep extracted name
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
