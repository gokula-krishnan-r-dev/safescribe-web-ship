'use client';

import { useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DrugSearchCombobox } from '@/features/consultations/drug-search-combobox';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import {
  generateChangeSummary,
  generateCounsellingPreview,
  generateDraftRationale,
} from '@safescript/shared';
import { SectionHeading } from './section-heading';
import { SharedPrescriptionDetails } from './shared-prescription-details';
import {
  adaptRationaleAutoKey,
  SharedClinicalRationale,
} from './shared-clinical-rationale';
import { mapDrugToProposedPrescription } from './map-drug-to-proposed';
import { buildAdaptDoseOptions } from './build-adapt-dose-options';
import type { BranchCommonProps } from './dose-branch';

function buildStrengthOptions(strength: string | undefined): { value: string; label: string }[] {
  const base = (strength || '').trim();
  const defaults = ['250 mg/5 mL', '125 mg/5 mL', '500 mg', '250 mg', '10 mL', '5 mL'];
  const unique = Array.from(new Set([base, ...defaults].filter(Boolean)));
  return unique.map((value) => ({ value, label: value }));
}

function buildDoseOptions(
  dose: string | undefined,
  strength: string | undefined,
  provided: { value: string; label: string }[],
): { value: string; label: string }[] {
  return buildAdaptDoseOptions([dose, strength], provided);
}

export function OtherBranch(props: BranchCommonProps) {
  const {
    step1,
    step3A,
    doseOptions,
    showRationaleResyncPrompt,
    patchStep3A,
    patchProposedRx,
    setSigManuallyEdited,
    setShowRationaleResyncPrompt,
    onResetToOriginal,
    buildAiRationaleDraft,
    canGenerateAiDraft,
  } = props;

  const [searchingMedication, setSearchingMedication] = useState(
    () => !step3A.proposedPrescription.drugName?.trim(),
  );

  const originalRx = step1.originalPrescription;
  const hasSelection = Boolean(step3A.proposedPrescription.drugName?.trim());

  const strengthOptions = useMemo(
    () => buildStrengthOptions(step3A.proposedPrescription.strength),
    [step3A.proposedPrescription.strength],
  );

  const resolvedDoseOptions = useMemo(
    () =>
      buildDoseOptions(
        step3A.proposedPrescription.dose,
        step3A.proposedPrescription.strength,
        doseOptions,
      ),
    [
      doseOptions,
      step3A.proposedPrescription.dose,
      step3A.proposedPrescription.strength,
    ],
  );

  const handleDrugSelect = (drug: DrugSearchResult) => {
    const proposed = mapDrugToProposedPrescription(drug, {
      frequency: step3A.proposedPrescription.frequency || 'Three times daily',
      quantity: step3A.proposedPrescription.quantity ?? 30,
      quantityUnit: step3A.proposedPrescription.quantityUnit,
      refills: step3A.proposedPrescription.refills ?? 0,
    });
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    setSearchingMedication(false);
    patchStep3A({
      proposalMode: 'custom',
      selectedSuggestionId: null,
      modifiedFromSuggestion: false,
      proposedPrescription: proposed,
      changeSummary: generateChangeSummary(originalRx, proposed),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, proposed),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, proposed),
    });
  };

  const medicationSlot = (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#102a43]">
        Medication <span className="text-destructive">*</span>
      </label>
      {searchingMedication || !hasSelection ? (
        <DrugSearchCombobox
          onSelect={handleDrugSelect}
          placeholder="Search medication by generic or brand name…"
          clearOnSelect
          autoFocus={searchingMedication && hasSelection}
        />
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829ab1]" />
          <Input
            value={step3A.proposedPrescription.drugName}
            onChange={(e) => {
              patchProposedRx({ drugName: e.target.value });
              if (!e.target.value.trim()) setSearchingMedication(true);
            }}
            onFocus={() => setSearchingMedication(true)}
            placeholder="Search or enter medication…"
            className="h-10 cursor-pointer pl-9 text-xs font-medium text-[#102a43] shadow-none"
            readOnly
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchingMedication(true)}
            className="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-[11px] font-semibold text-[#0F6F6B]"
          >
            Change
          </Button>
        </div>
      )}
      {searchingMedication && hasSelection ? (
        <button
          type="button"
          className="text-[11px] font-medium text-[#627d98] underline-offset-2 hover:underline"
          onClick={() => setSearchingMedication(false)}
        >
          Keep “{step3A.proposedPrescription.drugName}”
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 1 — Describe custom adaptation */}
      <div className="space-y-3">
        <SectionHeading
          number={1}
          title="Describe custom adaptation"
          helper="Provide a clear summary of the proposed change and any relevant instructions or context."
        />
        <div className="space-y-4 rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm sm:p-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#102a43]">
                Summary of proposed adaptation <span className="text-destructive">*</span>
              </label>
              <span className="text-[11px] text-[#829ab1]">
                {(step3A.customAdaptationSummary || '').length} / 200
              </span>
            </div>
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829ab1]" />
              <Input
                value={step3A.customAdaptationSummary || ''}
                maxLength={200}
                onChange={(e) =>
                  patchStep3A({
                    customAdaptationSummary: e.target.value,
                    proposalMode:
                      e.target.value.trim() || step3A.proposedPrescription.drugName?.trim()
                        ? 'custom'
                        : null,
                  })
                }
                placeholder="e.g. Change from capsules to oral suspension due to swallow difficulty"
                className="h-10 pl-9 text-xs font-medium text-[#102a43] shadow-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#102a43]">
                Additional details{' '}
                <span className="font-normal text-[#829ab1]">(optional)</span>
              </label>
              <span className="text-[11px] text-[#829ab1]">
                {(step3A.additionalDetails || '').length} / 1000
              </span>
            </div>
            <Textarea
              value={step3A.additionalDetails || ''}
              maxLength={1000}
              rows={4}
              onChange={(e) => patchStep3A({ additionalDetails: e.target.value })}
              placeholder="Optional supporting detail for documentation (e.g. counselling points, administration notes)"
              className="min-h-[96px] resize-none text-xs leading-relaxed text-[#52677a] shadow-none"
            />
          </div>
        </div>
      </div>

      {/* 2 — Proposed prescription details */}
      <SharedPrescriptionDetails
        sectionNumber={2}
        proposed={step3A.proposedPrescription}
        doseOptions={resolvedDoseOptions}
        showDrugName={false}
        drugNameSlot={medicationSlot}
        helper="Enter the full proposed prescription based on the custom adaptation described above."
        showStrength
        strengthOptions={strengthOptions}
        quantityRequired
        showQuantityUnit
        resetLabel="Reset to original details"
        onPatch={patchProposedRx}
        onSigManualEdit={() => setSigManuallyEdited(true)}
        onReset={onResetToOriginal}
      />

      {/* 3 — Clinical rationale */}
      <SharedClinicalRationale
        sectionNumber={3}
        value={step3A.rationaleDraft || ''}
        onChange={(next) =>
          patchStep3A({
            rationaleDraft: next,
            rationaleEditedByPharmacist: true,
          })
        }
        onApplyAiDraft={(next) => {
          setShowRationaleResyncPrompt(false);
          patchStep3A({
            rationaleDraft: next,
            rationaleEditedByPharmacist: false,
          });
        }}
        onGenerateDraft={buildAiRationaleDraft}
        canGenerateDraft={canGenerateAiDraft}
        autoGenerateKey={adaptRationaleAutoKey([
          step3A.customAdaptationSummary,
          step3A.proposedPrescription.drugName,
          step3A.proposedPrescription.dose,
          step3A.proposedPrescription.frequency,
          step3A.proposedPrescription.route,
          step3A.proposedPrescription.sig,
        ])}
        showResyncPrompt={showRationaleResyncPrompt}
        onKeepCurrent={() => setShowRationaleResyncPrompt(false)}
        onRequestRegenerate={() => setShowRationaleResyncPrompt(false)}
        helper="Explain why this proposed adaptation is appropriate for this patient."
      />
    </div>
  );
}
