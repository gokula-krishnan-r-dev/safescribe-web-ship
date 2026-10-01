'use client';

import { useMemo } from 'react';
import { Check, Droplets, Pill, Tablets, type LucideIcon } from 'lucide-react';
import type { ProposedPrescription } from '@safescript/shared';
import {
  generateChangeSummary,
  generateCounsellingPreview,
  generateDraftRationale,
} from '@safescript/shared';
import { cn } from '@/lib/utils';
import { SectionHeading } from './section-heading';
import { SharedPrescriptionDetails } from './shared-prescription-details';
import {
  adaptRationaleAutoKey,
  SharedClinicalRationale,
} from './shared-clinical-rationale';
import { buildDeterministicSig } from './map-drug-to-proposed';
import type { BranchCommonProps } from './dose-branch';

type FormulationCard = {
  id: string;
  label: string;
  helper: string;
  icon: LucideIcon;
};

type ProductOption = {
  id: string;
  label: string;
  availability: 'commonly_available' | 'less_common' | null;
  proposed: ProposedPrescription;
  doseOptions: { value: string; label: string }[];
};

const PRIMARY_FORMS: FormulationCard[] = [
  {
    id: 'Capsule',
    label: 'Capsule',
    helper: 'Solid oral capsule',
    icon: Pill,
  },
  {
    id: 'Tablet',
    label: 'Tablet',
    helper: 'Solid oral tablet',
    icon: Tablets,
  },
  {
    id: 'Oral suspension',
    label: 'Oral suspension',
    helper: 'Liquid for oral use, e.g. 125 mg/5 mL, 250 mg/5 mL',
    icon: Droplets,
  },
];

function cleanIngredientName(raw: string): string {
  return raw
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|mL|%)\b/gi, '')
    .replace(/\b(capsule|tablet|suspension|solution|cream|patch)s?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isLiquidForm(form: string): boolean {
  return /suspension|solution|syrup|liquid/i.test(form);
}

function buildLiquidSig(params: {
  doseLabel: string;
  frequency: string;
  days?: number;
}): string {
  const freq = params.frequency.toLowerCase();
  const duration = params.days ? ` for ${params.days} days` : '';
  return `Take ${params.doseLabel} by mouth ${freq}${duration}.`;
}

function deriveLiquidProducts(ingredient: string, form: string): ProductOption[] {
  const strengths = [
    { strength: '125 mg/5 mL', dose: '5 mL (125 mg)', qty: 150, availability: 'commonly_available' as const },
    { strength: '250 mg/5 mL', dose: '5 mL (250 mg)', qty: 150, availability: 'less_common' as const },
    { strength: '400 mg/5 mL', dose: '5 mL (400 mg)', qty: 100, availability: 'less_common' as const },
  ];

  return strengths.map((item, idx) => {
    const label = `${ingredient} ${item.strength} ${form.toLowerCase()}`;
    const doseOptions = [
      { value: item.dose, label: item.dose },
      { value: `2.5 mL (${item.strength.split(' ')[0]} / 2)`, label: `2.5 mL` },
      { value: `10 mL`, label: `10 mL` },
    ];
    const proposed: ProposedPrescription = {
      drugName: label,
      strength: item.strength,
      dosageForm: form,
      dose: item.dose,
      frequency: 'Three times daily',
      route: 'By mouth',
      quantity: item.qty,
      quantityUnit: 'mL',
      refills: 0,
      sig: buildLiquidSig({
        doseLabel: item.dose,
        frequency: 'Three times daily',
        days: 7,
      }),
    };
    return {
      id: `liquid_${idx}_${item.strength}`,
      label,
      availability: item.availability,
      proposed,
      doseOptions,
    };
  });
}

function deriveSolidProducts(
  ingredient: string,
  form: string,
  originalStrength: string,
  originalQty: number,
): ProductOption[] {
  const strengths = Array.from(
    new Set(
      [originalStrength, '250 mg', '500 mg', '875 mg'].filter((s) => Boolean(s?.trim())),
    ),
  );

  return strengths.slice(0, 4).map((s, idx) => {
    const label = [ingredient, s, form.toLowerCase()].filter(Boolean).join(' ');
    const proposed: ProposedPrescription = {
      drugName: label,
      strength: s,
      dosageForm: form,
      dose: s,
      frequency: 'Three times daily',
      route: 'By mouth',
      quantity: originalQty || 21,
      quantityUnit: form.toLowerCase().includes('capsule') ? 'capsules' : 'tablets',
      refills: 0,
      sig: buildDeterministicSig({
        dose: s,
        dosageForm: form,
        route: 'By mouth',
        frequency: 'Three times daily',
      }),
    };
    return {
      id: `solid_${idx}_${s}`,
      label,
      availability: idx === 0 ? ('commonly_available' as const) : ('less_common' as const),
      proposed,
      doseOptions: [
        { value: s, label: s },
        ...['250 mg', '500 mg']
          .filter((d) => d !== s)
          .map((d) => ({ value: d, label: d })),
      ],
    };
  });
}

export function FormulationBranch(props: BranchCommonProps) {
  const {
    step1,
    step3A,
    showRationaleResyncPrompt,
    patchStep3A,
    patchProposedRx,
    setSigManuallyEdited,
    setShowRationaleResyncPrompt,
    buildAiRationaleDraft,
    canGenerateAiDraft,
  } = props;

  const originalRx = step1.originalPrescription;
  const rawIngredient =
    originalRx?.normalized?.genericName ||
    originalRx?.normalized?.brandName ||
    originalRx?.raw?.medicationText ||
    'Medication';
  const ingredient = cleanIngredientName(rawIngredient) || rawIngredient;
  const strength = originalRx?.normalized?.strength || '';
  const currentForm = originalRx?.normalized?.dosageForm || '';
  const qty = originalRx?.raw?.quantityText
    ? parseInt(originalRx.raw.quantityText, 10) || 21
    : 21;

  const forms = useMemo(() => {
    const list = [...PRIMARY_FORMS];
    if (
      currentForm &&
      !list.some((f) => f.id.toLowerCase() === currentForm.toLowerCase())
    ) {
      list.push({
        id: currentForm,
        label: currentForm,
        helper: 'Current dosage form',
        icon: Pill,
      });
    }
    return list;
  }, [currentForm]);

  const selectedForm = step3A.selectedFormulation || '';

  const productOptions = useMemo(() => {
    if (!selectedForm) return [];
    if (isLiquidForm(selectedForm)) {
      return deriveLiquidProducts(ingredient, selectedForm);
    }
    return deriveSolidProducts(ingredient, selectedForm, strength, qty);
  }, [selectedForm, ingredient, strength, qty]);

  const selectedProduct = useMemo(() => {
    if (!step3A.selectedSuggestionId) return null;
    return productOptions.find((p) => p.id === step3A.selectedSuggestionId) ?? null;
  }, [productOptions, step3A.selectedSuggestionId]);

  const selectForm = (formId: string) => {
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      selectedFormulation: formId,
      proposalMode: null,
      selectedSuggestionId: null,
      modifiedFromSuggestion: false,
    });
  };

  const selectProduct = (opt: ProductOption) => {
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      proposalMode: 'suggested',
      selectedSuggestionId: opt.id,
      selectedFormulation: selectedForm,
      modifiedFromSuggestion: false,
      proposedPrescription: { ...opt.proposed },
      changeSummary: generateChangeSummary(originalRx, opt.proposed),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, opt.proposed),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, opt.proposed),
    });
  };

  const changeFormulation = () => {
    patchStep3A({
      selectedFormulation: '',
      proposalMode: null,
      selectedSuggestionId: null,
      proposedPrescription: {
        ...step3A.proposedPrescription,
        drugName: '',
        dose: '',
        strength: '',
        dosageForm: '',
        sig: '',
      },
    });
  };

  const doseOptions =
    selectedProduct?.doseOptions ??
    (step3A.proposedPrescription.dose
      ? [
          {
            value: step3A.proposedPrescription.dose,
            label: step3A.proposedPrescription.dose,
          },
        ]
      : []);

  const hasProductSelection = Boolean(
    step3A.proposedPrescription.drugName?.trim() && step3A.selectedSuggestionId,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeading
          number={1}
          title="Choose formulation"
          helper="Select a dosage form for the same active ingredient."
        />
        <div
          role="radiogroup"
          aria-label="Choose formulation"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {forms.map((form) => {
            const selected = selectedForm.toLowerCase() === form.id.toLowerCase();
            const Icon = form.icon;
            return (
              <button
                key={form.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectForm(form.id)}
                className={cn(
                  'relative flex min-h-[108px] flex-col items-start rounded-xl p-4 text-left transition-all',
                  selected
                    ? 'border-2 border-[#0F6F6B] bg-[#F1FAF9]/70 shadow-sm'
                    : 'border border-[#d9e4e8] bg-white hover:border-[#b0c4cb] hover:bg-slate-50/40',
                )}
              >
                <span
                  className={cn(
                    'absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border',
                    selected ? 'border-[#0F6F6B] bg-white' : 'border-[#9fb3c8] bg-white',
                  )}
                  aria-hidden
                >
                  {selected ? <span className="h-2 w-2 rounded-full bg-[#0F6F6B]" /> : null}
                </span>
                <span
                  className={cn(
                    'mb-3 flex h-9 w-9 items-center justify-center rounded-lg',
                    selected ? 'bg-[#0F6F6B] text-white' : 'bg-[#F0FAF9] text-[#0F6F6B]',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-[#102a43]">{form.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#627d98]">{form.helper}</p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedForm ? (
        <div className="space-y-3">
          <SectionHeading
            number={2}
            title="Product / strength options"
            helper={`Same ingredient · ${selectedForm}`}
          />
          <div
            role="radiogroup"
            aria-label="Product / strength options"
            className="space-y-2"
          >
            {productOptions.map((opt) => {
              const selected =
                step3A.proposalMode === 'suggested' &&
                step3A.selectedSuggestionId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectProduct(opt)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-all',
                    selected
                      ? 'border-[#0F6F6B] bg-[#F1FAF9]/70 shadow-sm'
                      : 'border-[#e2eaed] bg-white hover:border-[#b0c4cb]',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-[#0F6F6B] bg-white' : 'border-[#9fb3c8] bg-white',
                      )}
                      aria-hidden
                    >
                      {selected ? (
                        <span className="h-2 w-2 rounded-full bg-[#0F6F6B]" />
                      ) : null}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#102a43]">{opt.label}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F6F6B] text-white">
                        <Check className="h-3 w-3 stroke-[3]" aria-hidden />
                      </span>
                    ) : null}
                    {opt.availability === 'commonly_available' ? (
                      <span className="rounded-full border border-[#b2dfdb] bg-[#e6f4f1] px-2.5 py-0.5 text-[10px] font-semibold text-[#0F6F6B]">
                        Commonly available
                      </span>
                    ) : opt.availability === 'less_common' ? (
                      <span className="rounded-full border border-[#e2eaed] bg-[#f4f7f8] px-2.5 py-0.5 text-[10px] font-semibold text-[#627d98]">
                        Less common
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {hasProductSelection ? (
        <SharedPrescriptionDetails
          sectionNumber={3}
          proposed={step3A.proposedPrescription}
          doseOptions={doseOptions}
          drugNameReadOnly
          showQuantityUnit={isLiquidForm(selectedForm)}
          helper="Complete the prescription for the selected formulation. Review and edit as needed."
          changeMedicationLabel="Change formulation"
          onChangeMedication={changeFormulation}
          onPatch={patchProposedRx}
          onSigManualEdit={() => setSigManuallyEdited(true)}
        />
      ) : selectedForm ? (
        <div className="rounded-xl border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-6 text-center text-xs text-[#829ab1]">
          Select a product / strength to complete proposed prescription details.
        </div>
      ) : null}

      <SharedClinicalRationale
        sectionNumber={hasProductSelection ? 4 : selectedForm ? 3 : 2}
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
          step3A.selectedFormulation,
        ])}
        showResyncPrompt={showRationaleResyncPrompt}
        onKeepCurrent={() => setShowRationaleResyncPrompt(false)}
        onRequestRegenerate={() => setShowRationaleResyncPrompt(false)}
      />
    </div>
  );
}
