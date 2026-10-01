'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  Check,
  Pill,
  Syringe,
  Droplets,
} from 'lucide-react';
import { DrugSearchCombobox } from '@/features/consultations/drug-search-combobox';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
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
import { mapDrugToProposedPrescription } from './map-drug-to-proposed';
import type { BranchCommonProps } from './dose-branch';

type RouteCard = {
  id: string;
  label: string;
  helper: string;
  warning?: string;
  icon: typeof Pill;
};

type RouteProductOption = {
  id: string;
  label: string;
  form: string;
  strength: string;
  packageSize: string;
  proposed: ProposedPrescription;
};

const ROUTE_CARDS: RouteCard[] = [
  {
    id: 'Topical',
    label: 'Topical',
    helper: 'Local application for localized pain',
    icon: Droplets,
  },
  {
    id: 'Oral',
    label: 'Oral',
    helper: 'Taken by mouth',
    warning: 'Not recommended due to GI intolerance',
    icon: Pill,
  },
  {
    id: 'Transdermal',
    label: 'Transdermal',
    helper: 'Consider for chronic pain',
    icon: Pill,
  },
  {
    id: 'Injection',
    label: 'Injection',
    helper: 'Typically specialist-initiated',
    icon: Syringe,
  },
];

function routeSearchPlaceholder(route: string): string {
  switch (route) {
    case 'Topical':
      return 'Search topical products…';
    case 'Transdermal':
      return 'Search transdermal products…';
    case 'Injection':
      return 'Search injectable products…';
    case 'Oral':
      return 'Search oral products…';
    default:
      return 'Search medication products…';
  }
}

function routeToPrescriptionRoute(route: string): string {
  if (route === 'Oral') return 'By mouth';
  if (route === 'Injection') return 'Subcutaneous';
  return route;
}

function cleanIngredientName(raw: string): string {
  return raw
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|mL|%)\b/gi, '')
    .replace(/\b(sodium|potassium|hcl|hydrochloride)\b/gi, '')
    .replace(/\b(capsule|tablet|suspension|gel|cream|patch|injection)s?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function deriveRouteProducts(
  ingredient: string,
  route: string,
  originalQty: number,
  originalRefills: number,
): RouteProductOption[] {
  if (route === 'Topical') {
    const items = [
      {
        id: 'topical_gel_1',
        label: `${ingredient} 1% gel`,
        brand: 'Voltaren®',
        form: 'Topical gel',
        strength: '1%',
        packageSize: '50 g tube',
        dose: 'Apply 2–4 g',
        frequency: 'Apply 4 times daily',
        qty: 100,
        unit: 'g',
        sig: 'Apply 2–4 g to affected area four times daily.',
      },
      {
        id: 'topical_solution_1_5',
        label: `${ingredient} 1.5% topical solution`,
        brand: '',
        form: 'Topical solution',
        strength: '1.5%',
        packageSize: '150 mL bottle',
        dose: 'Apply 40 drops',
        frequency: 'Apply 4 times daily',
        qty: 150,
        unit: 'mL',
        sig: 'Apply 40 drops to affected area four times daily.',
      },
      {
        id: 'topical_gel_2_32',
        label: `${ingredient} 2.32% gel`,
        brand: '',
        form: 'Topical gel',
        strength: '2.32%',
        packageSize: '50 g tube',
        dose: 'Apply 2 g',
        frequency: 'Apply twice daily',
        qty: 50,
        unit: 'g',
        sig: 'Apply 2 g to affected area twice daily.',
      },
    ];

    return items.map((item) => ({
      id: item.id,
      label: item.brand ? `${item.label} (${item.brand})` : item.label,
      form: item.form,
      strength: item.strength,
      packageSize: item.packageSize,
      proposed: {
        drugName: item.brand ? `${item.label} (${item.brand})` : item.label,
        strength: item.strength,
        dosageForm: item.form,
        dose: item.strength.includes('%')
          ? `${item.strength} (${item.strength === '1%' ? '10 mg/g' : item.strength})`
          : item.dose,
        frequency: item.frequency,
        route: 'Topical',
        quantity: item.qty,
        quantityUnit: item.unit,
        refills: originalRefills,
        sig: item.sig,
      },
    }));
  }

  if (route === 'Transdermal') {
    return [
      {
        id: 'td_patch',
        label: `${ingredient} transdermal patch`,
        form: 'Transdermal patch',
        strength: 'Standard',
        packageSize: 'Box of 7',
        proposed: {
          drugName: `${ingredient} transdermal patch`,
          strength: 'Standard',
          dosageForm: 'Transdermal patch',
          dose: '1 patch',
          frequency: 'Once daily',
          route: 'Transdermal',
          quantity: 7,
          quantityUnit: 'patches',
          refills: originalRefills,
          sig: 'Apply 1 patch to clean dry skin once daily. Rotate application sites.',
        },
      },
    ];
  }

  if (route === 'Injection') {
    return [
      {
        id: 'inj_vial',
        label: `${ingredient} injectable solution`,
        form: 'Injection',
        strength: 'As labelled',
        packageSize: 'Vial',
        proposed: {
          drugName: `${ingredient} injectable solution`,
          strength: 'As labelled',
          dosageForm: 'Injection',
          dose: 'As directed',
          frequency: 'As directed',
          route: 'Subcutaneous',
          quantity: originalQty || 1,
          quantityUnit: 'vials',
          refills: 0,
          sig: 'Inject as directed by specialist. Do not self-administer unless instructed.',
        },
      },
    ];
  }

  // Oral — keep same molecule oral forms
  return [
    {
      id: 'oral_keep',
      label: `${ingredient} oral tablet`,
      form: 'Tablet',
      strength: 'As labelled',
      packageSize: 'Bottle',
      proposed: {
        drugName: `${ingredient} tablet`,
        strength: 'As labelled',
        dosageForm: 'Tablet',
        dose: 'As labelled',
        frequency: 'Twice daily',
        route: 'By mouth',
        quantity: originalQty || 60,
        quantityUnit: 'tablets',
        refills: originalRefills,
        sig: 'Take as directed by mouth.',
      },
    },
  ];
}

export function RouteBranch(props: BranchCommonProps) {
  const {
    step1,
    step3A,
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
  const selectedRoute = step3A.selectedRouteOption || '';
  const rawIngredient =
    originalRx?.normalized?.genericName ||
    originalRx?.normalized?.brandName ||
    originalRx?.raw?.medicationText ||
    'Medication';
  const ingredient = cleanIngredientName(rawIngredient) || rawIngredient;
  const qty = originalRx?.raw?.quantityText
    ? parseInt(originalRx.raw.quantityText, 10) || 60
    : 60;
  const refills = originalRx?.normalized?.refillsRemaining ?? 2;

  const productOptions = useMemo(() => {
    if (!selectedRoute) return [];
    return deriveRouteProducts(ingredient, selectedRoute, qty, Number(refills) || 0);
  }, [ingredient, selectedRoute, qty, refills]);

  const selectRoute = (routeId: string) => {
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      selectedRouteOption: routeId,
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

  const selectProduct = (opt: RouteProductOption) => {
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      proposalMode: 'suggested',
      selectedSuggestionId: opt.id,
      selectedRouteOption: selectedRoute,
      modifiedFromSuggestion: false,
      proposedPrescription: { ...opt.proposed },
      changeSummary: generateChangeSummary(originalRx, opt.proposed),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, opt.proposed),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, opt.proposed),
    });
  };

  const handleDrugSelect = (drug: DrugSearchResult) => {
    const proposed = mapDrugToProposedPrescription(drug, {
      route: routeToPrescriptionRoute(selectedRoute || 'Oral'),
      frequency:
        selectedRoute === 'Topical'
          ? 'Apply 4 times daily'
          : step3A.proposedPrescription.frequency || 'Once daily',
      quantity: step3A.proposedPrescription.quantity ?? (selectedRoute === 'Topical' ? 100 : 30),
      quantityUnit: selectedRoute === 'Topical' ? 'g' : undefined,
      refills: step3A.proposedPrescription.refills ?? refills,
    });
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      proposalMode: 'custom',
      selectedSuggestionId: `search_${drug.id}`,
      selectedRouteOption: selectedRoute,
      modifiedFromSuggestion: false,
      proposedPrescription: proposed,
      changeSummary: generateChangeSummary(originalRx, proposed),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, proposed),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, proposed),
    });
  };

  const clearProduct = () => {
    patchStep3A({
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

  const hasSelection = Boolean(step3A.proposedPrescription.drugName?.trim());

  const strengthOptions = useMemo(() => {
    const current = step3A.proposedPrescription.dose || step3A.proposedPrescription.strength;
    const fromProducts = productOptions
      .map((p) => p.proposed.dose || p.strength)
      .filter(Boolean) as string[];
    const merged = [current, ...fromProducts, ...doseOptions.map((d) => d.value)].filter(
      (v): v is string => Boolean(v?.trim()),
    );
    const seen = new Set<string>();
    return merged
      .filter((v) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      })
      .map((v) => ({ value: v, label: v }));
  }, [step3A.proposedPrescription, productOptions, doseOptions]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeading
          number={1}
          title="Choose route / product"
          helper="Select a route, then choose a matching product from the catalogue."
        />

        <div
          role="radiogroup"
          aria-label="Choose route"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {ROUTE_CARDS.map((card) => {
            const selected = selectedRoute === card.id;
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => selectRoute(card.id)}
                className={cn(
                  'relative flex min-h-[120px] flex-col items-start rounded-xl p-4 text-left transition-all',
                  selected
                    ? 'border-2 border-[#0F6F6B] bg-[#F1FAF9]/70 shadow-sm'
                    : 'border border-[#d9e4e8] bg-white hover:border-[#b0c4cb] hover:bg-slate-50/40',
                )}
              >
                {selected ? (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#0F6F6B] text-white">
                    <Check className="h-3 w-3 stroke-[3]" aria-hidden />
                  </span>
                ) : null}
                <span
                  className={cn(
                    'mb-3 flex h-9 w-9 items-center justify-center rounded-lg',
                    selected ? 'bg-[#0F6F6B] text-white' : 'bg-[#F0FAF9] text-[#0F6F6B]',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-[#102a43]">{card.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#627d98]">{card.helper}</p>
                {card.warning ? (
                  <p className="mt-2 flex items-start gap-1 text-[11px] font-medium text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {card.warning}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>

        {selectedRoute ? (
          <div className="rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#102a43]">Select product</p>
            </div>
            <div className="mb-3">
              <DrugSearchCombobox
                onSelect={handleDrugSelect}
                placeholder={routeSearchPlaceholder(selectedRoute)}
                clearOnSelect
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Route product options"
              className="space-y-2"
            >
              {productOptions.map((opt) => {
                const selected =
                  step3A.selectedSuggestionId === opt.id ||
                  step3A.proposedPrescription.drugName === opt.label;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => selectProduct(opt)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                      selected
                        ? 'border-[#0F6F6B] bg-[#F1FAF9]/70'
                        : 'border-[#e2eaed] bg-white hover:border-[#b0c4cb]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-[#0F6F6B] bg-white' : 'border-[#9fb3c8] bg-white',
                      )}
                      aria-hidden
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-[#0F6F6B]" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#102a43]">{opt.label}</p>
                      <p className="mt-0.5 text-[11px] text-[#627d98]">{opt.form}</p>
                    </div>
                    <div className="hidden shrink-0 text-right text-[11px] text-[#627d98] sm:block">
                      <p className="font-medium text-[#334e68]">{opt.strength}</p>
                      <p>{opt.packageSize}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {hasSelection ? (
        <SharedPrescriptionDetails
          sectionNumber={2}
          proposed={step3A.proposedPrescription}
          doseOptions={strengthOptions.length > 0 ? strengthOptions : doseOptions}
          drugNameReadOnly
          showQuantityUnit
          helper="Complete the prescription for the selected route and product."
          changeMedicationLabel="Change product"
          onChangeMedication={clearProduct}
          onPatch={patchProposedRx}
          onSigManualEdit={() => setSigManuallyEdited(true)}
        />
      ) : selectedRoute ? (
        <div className="rounded-xl border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-6 text-center text-xs text-[#829ab1]">
          Select or search for a product to complete proposed prescription details.
        </div>
      ) : null}

      <SharedClinicalRationale
        sectionNumber={hasSelection ? 3 : selectedRoute ? 2 : 2}
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
          step3A.selectedRouteOption,
        ])}
        showResyncPrompt={showRationaleResyncPrompt}
        onKeepCurrent={() => setShowRationaleResyncPrompt(false)}
        onRequestRegenerate={() => setShowRationaleResyncPrompt(false)}
      />
    </div>
  );
}
