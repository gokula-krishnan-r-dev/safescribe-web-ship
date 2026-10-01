'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';
import {
  formatMonitoringDate,
  formatMonitoringResult,
  type ExtractedMonitoringCandidate,
  type RenewMonitoringExtraction,
  type RenewMonitoringRequirement,
} from '@safescript/shared';

export function ExtractionReviewModal({
  extraction,
  monitoring,
  confirming,
  onClose,
  onConfirm,
}: {
  extraction: RenewMonitoringExtraction | null;
  monitoring: RenewMonitoringRequirement[];
  confirming?: boolean;
  onClose: () => void;
  onConfirm: (selectedCodes: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(extraction?.candidates.map((row) => row.inputCode) ?? []);
  }, [extraction]);

  if (!extraction) return null;

  const relevant = extraction.candidates.filter((candidate) =>
    monitoring.some((row) => row.inputCode === candidate.inputCode),
  );

  return (
    <Dialog open={Boolean(extraction)} onOpenChange={(next) => !next && !confirming && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {relevant.length} relevant result{relevant.length === 1 ? '' : 's'} found
          </DialogTitle>
          <DialogDescription>
            Confirm values before they are saved. Extracted candidates only — it does not decide safety.
          </DialogDescription>
        </DialogHeader>

        {relevant.length ? (
          <ul className="space-y-2">
            {relevant.map((candidate) => {
              const def = monitoring.find((row) => row.inputCode === candidate.inputCode);
              const checked = selected.includes(candidate.inputCode);
              return (
                <li key={candidate.inputCode}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5',
                      checked ? 'border-[#0F6F6B]/40 bg-[#0F6F6B]/[0.04]' : 'border-[#edf1f3]',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() =>
                        setSelected((prev) =>
                          prev.includes(candidate.inputCode)
                            ? prev.filter((code) => code !== candidate.inputCode)
                            : [...prev, candidate.inputCode],
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#163447]">
                        {def?.label ?? candidate.inputCode}
                      </span>
                      <span className="mt-0.5 block text-sm text-[#5b6b75]">
                        {formatCandidate(candidate, def)} · {formatMonitoringDate(candidate.observedDate)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matching monitoring values were found for this renewal. You can enter results manually.
          </p>
        )}

        {extraction.extraDetectedCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Additional results were detected but are not required for this renewal.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Source: {extraction.sourceType === 'PASTED_SCREENSHOT' ? 'Pasted screenshot' : 'Uploaded document'}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <ClinicalPrimaryButton
            onClick={() => onConfirm(selected)}
            loading={confirming}
            disabled={confirming || selected.length === 0}
          >
            Confirm results
          </ClinicalPrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatCandidate(candidate: ExtractedMonitoringCandidate, def?: RenewMonitoringRequirement) {
  return formatMonitoringResult(
    {
      inputCode: candidate.inputCode,
      status: 'AVAILABLE',
      value: {
        numericValue: candidate.numericValue,
        secondaryNumericValue: candidate.secondaryNumericValue,
        valueText: candidate.valueText,
        unit: candidate.unit,
      },
      observedDate: candidate.observedDate,
      sourceType: null,
      sourceLabel: candidate.sourceLabel,
      note: null,
      pharmacistConfirmed: false,
    },
    def?.unit,
  );
}
