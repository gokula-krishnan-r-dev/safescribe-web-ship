'use client';

import { useMemo } from 'react';
import { Info } from 'lucide-react';
import type {
  AdaptStepOne,
  AdaptStepThreeOptionA,
  ProposedPrescription,
  SuggestedAdaptation,
} from '@safescript/shared';
import {
  generateChangeSummary,
  generateDraftRationale,
  generateCounsellingPreview,
} from '@safescript/shared';
import { OptionCard, SectionHeading } from './section-heading';
import { SharedPrescriptionDetails } from './shared-prescription-details';
import {
  adaptRationaleAutoKey,
  SharedClinicalRationale,
} from './shared-clinical-rationale';
import { buildDeterministicSig } from './map-drug-to-proposed';

export interface BranchCommonProps {
  step1: AdaptStepOne;
  step3A: AdaptStepThreeOptionA;
  suggestions: SuggestedAdaptation[];
  doseOptions: { value: string; label: string }[];
  sigManuallyEdited: boolean;
  showRationaleResyncPrompt: boolean;
  canGenerateAiDraft: boolean;
  /** Required for Prescribe Add-treatment safety evaluate (substitution branch). */
  consultationId?: string;
  patchStep3A: (patch: Partial<AdaptStepThreeOptionA>) => void;
  patchProposedRx: (patch: Partial<ProposedPrescription>) => void;
  setSigManuallyEdited: (v: boolean) => void;
  setShowRationaleResyncPrompt: (v: boolean) => void;
  onResetToOriginal: () => void;
  /** Build AI/deterministic rationale draft text without persisting. */
  buildAiRationaleDraft: () => string | Promise<string>;
}

function formatDoseValue(val: number, unit: string): string {
  const rounded = Number.isInteger(val) ? String(val) : String(Math.round(val * 100) / 100);
  return `${rounded} ${unit}`.replace(/\.0+ /, ' ');
}

function deriveDoseCards(
  step1: AdaptStepOne,
  suggestions: SuggestedAdaptation[],
): Array<{
  id: string;
  title: string;
  label: string;
  helper: string;
  proposed: ProposedPrescription;
}> {
  const originalRx = step1.originalPrescription;
  const strength = originalRx?.normalized?.strength || '';
  const form = originalRx?.normalized?.dosageForm || 'tablet';
  const drug =
    originalRx?.normalized?.genericName ||
    originalRx?.normalized?.brandName ||
    originalRx?.raw?.medicationText ||
    'Medication';
  const route = originalRx?.normalized?.route || 'By mouth';
  const qty = originalRx?.raw?.quantityText
    ? parseInt(originalRx.raw.quantityText, 10) || 30
    : 30;
  const refills = originalRx?.normalized?.refillsRemaining ?? 1;
  const frequency = originalRx?.normalized?.frequency || 'Once daily';

  const doseSuggestions = suggestions.filter((s) => {
    const title = (s.title || '').toLowerCase();
    return (
      title.includes('dose') ||
      title.includes('adjust') ||
      (s.proposedPrescription.dose &&
        s.proposedPrescription.drugName &&
        !title.includes('alternative') &&
        !title.includes('frequency'))
    );
  });

  if (doseSuggestions.length > 0) {
    return doseSuggestions.slice(0, 3).map((s, idx) => {
      const dose = s.proposedPrescription.dose || strength;
      const formLabel = s.proposedPrescription.dosageForm || form;
      const name =
        s.proposedPrescription.drugName ||
        [drug, dose, formLabel].filter(Boolean).join(' ');
      const labels = ['Lower dose', 'Reduced dose', 'No dose change'];
      return {
        id: s.id,
        title: name,
        label:
          s.badge === 'Recommended'
            ? 'Reduced dose'
            : labels[idx] || s.title || 'Dose option',
        helper: s.supportingPoints?.[0] || s.subtitle || s.title,
        proposed: {
          ...s.proposedPrescription,
          quantity: s.proposedPrescription.quantity ?? qty,
          refills: s.proposedPrescription.refills ?? refills,
        },
      };
    });
  }

  const mgMatch = strength.match(/([\d.]+)\s*(mg|mcg|g|mL|units?)/i);
  const cards: Array<{
    id: string;
    title: string;
    label: string;
    helper: string;
    proposed: ProposedPrescription;
  }> = [];

  const make = (
    id: string,
    dose: string,
    label: string,
    helper: string,
  ): (typeof cards)[0] => ({
    id,
    title: [drug, dose, form].filter(Boolean).join(' '),
    label,
    helper,
    proposed: {
      drugId: originalRx?.id,
      drugName: [drug, dose, form].filter(Boolean).join(' '),
      genericName: originalRx?.normalized?.genericName || undefined,
      brandName: originalRx?.normalized?.brandName || undefined,
      strength: dose,
      dosageForm: form,
      dose,
      frequency,
      route,
      quantity: qty,
      refills,
      sig: buildDeterministicSig({
        dose,
        dosageForm: form,
        route,
        frequency,
      }),
    },
  });

  if (mgMatch) {
    const val = parseFloat(mgMatch[1]!);
    const unit = mgMatch[2]!;
    const lower = formatDoseValue(Math.max(val / 4, unit.toLowerCase() === 'mg' ? 5 : val / 4), unit);
    const reduced = formatDoseValue(Math.max(val / 2, unit.toLowerCase() === 'mg' ? 5 : val / 2), unit);

    // Prefer common step-downs for display (e.g. 20 → 10 → 5)
    const lowerDose =
      unit.toLowerCase() === 'mg' && val === 20
        ? '5 mg'
        : lower;
    const reducedDose =
      unit.toLowerCase() === 'mg' && val === 20
        ? '10 mg'
        : reduced;

    if (lowerDose !== strength) {
      cards.push(
        make(
          'dose_lower',
          lowerDose,
          'Lower dose',
          `Consider ${lowerDose} once daily if greater dose reduction is appropriate.`,
        ),
      );
    }
    if (reducedDose !== strength && reducedDose !== lowerDose) {
      cards.push(
        make(
          'dose_reduced',
          reducedDose,
          'Reduced dose',
          'Commonly used next lowest dose for dose-related adverse effects.',
        ),
      );
    }
  }

  cards.push({
    id: 'dose_maintain',
    title: strength ? `Maintain ${strength} ${form}` : 'Maintain current dose',
    label: 'No dose change',
    helper: 'Consider if symptoms are not clearly dose-related.',
    proposed: {
      drugId: originalRx?.id,
      drugName: [drug, strength, form].filter(Boolean).join(' '),
      genericName: originalRx?.normalized?.genericName || undefined,
      brandName: originalRx?.normalized?.brandName || undefined,
      strength,
      dosageForm: form,
      dose: strength,
      frequency,
      route,
      quantity: qty,
      refills,
      sig:
        originalRx?.raw?.directionsText ||
        buildDeterministicSig({
          dose: strength,
          dosageForm: form,
          route,
          frequency,
        }),
    },
  });

  return cards;
}

export function DoseBranch(props: BranchCommonProps) {
  const {
    step1,
    step3A,
    suggestions,
    doseOptions,
    showRationaleResyncPrompt,
    patchStep3A,
    patchProposedRx,
    setSigManuallyEdited,
    setShowRationaleResyncPrompt,
    buildAiRationaleDraft,
    canGenerateAiDraft,
  } = props;

  const originalRx = step1.originalPrescription;
  const cards = useMemo(
    () => deriveDoseCards(step1, suggestions),
    [step1, suggestions],
  );

  const selectCard = (card: (typeof cards)[0]) => {
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      proposalMode: 'suggested',
      selectedSuggestionId: card.id,
      modifiedFromSuggestion: false,
      proposedPrescription: { ...card.proposed },
      changeSummary: generateChangeSummary(originalRx, card.proposed),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, card.proposed),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, card.proposed),
    });
  };

  const enterDifferentDose = () => {
    patchStep3A({
      proposalMode: 'custom',
      selectedSuggestionId: null,
      modifiedFromSuggestion: false,
    });
  };

  const cardDoseOptions = useMemo(() => {
    const fromCards = cards
      .map((c) => c.proposed.dose)
      .filter((d): d is string => Boolean(d?.trim()))
      .map((d) => ({ value: d, label: d }));
    const merged = [...fromCards, ...doseOptions];
    const seen = new Set<string>();
    return merged.filter((d) => {
      if (!d.value || seen.has(d.value)) return false;
      seen.add(d.value);
      return true;
    });
  }, [cards, doseOptions]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeading
            number={1}
            title="Dose adjustment options"
            helper="Select a suggested dose based on clinical guidelines and the reason for adaptation. You can also enter a different dose in Step 2."
          />
          <div className="flex max-w-sm items-start gap-2 rounded-lg border border-[#d7e8f5] bg-[#f3f8fc] px-3 py-2.5 text-[11px] leading-relaxed text-[#3d5a73] lg:mt-1">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2b6cb0]" aria-hidden />
            <span>
              Suggested doses are evidence-informed options based on current guidelines, patient
              factors and the stated reason.
            </span>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Dose adjustment options"
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          {cards.map((card) => {
            const selected =
              (step3A.proposalMode === 'suggested' &&
                step3A.selectedSuggestionId === card.id) ||
              (step3A.proposedPrescription.dose === card.proposed.dose &&
                step3A.proposalMode !== 'custom' &&
                !step3A.selectedSuggestionId);
            return (
              <OptionCard
                key={card.id}
                selected={Boolean(selected)}
                onSelect={() => selectCard(card)}
                title={card.title}
                subtitle={card.label}
                helper={card.helper}
                className="min-h-[112px]"
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={enterDifferentDose}
          className="text-xs font-semibold text-[#0F6F6B] hover:underline"
        >
          Enter different dose
        </button>
      </div>

      <SharedPrescriptionDetails
        sectionNumber={2}
        proposed={step3A.proposedPrescription}
        doseOptions={cardDoseOptions}
        drugNameReadOnly
        helper="Complete the prescription for the selected dose. Review and edit as needed."
        onPatch={patchProposedRx}
        onSigManualEdit={() => setSigManuallyEdited(true)}
        onChangeMedication={enterDifferentDose}
      />

      <SharedClinicalRationale
        sectionNumber={3}
        value={step3A.rationaleDraft || ''}
        helper="Explain why this proposed adaptation is appropriate for this patient."
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
          step3A.proposedPrescription.drugName,
          step3A.proposedPrescription.dose,
          step3A.proposedPrescription.frequency,
          step3A.proposedPrescription.route,
          step3A.proposedPrescription.sig,
        ])}
        showResyncPrompt={showRationaleResyncPrompt}
        onKeepCurrent={() => setShowRationaleResyncPrompt(false)}
        onRequestRegenerate={() => setShowRationaleResyncPrompt(false)}
      />
    </div>
  );
}
