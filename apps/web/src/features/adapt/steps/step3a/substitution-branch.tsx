'use client';

import { useMemo, useState } from 'react';
import { Info, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrugSearchCombobox } from '@/features/consultations/drug-search-combobox';
import { AddTreatmentDialog } from '@/features/consultations/add-treatment-dialog';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import type { TreatmentRecommendation } from '@/features/consultations/types';
import { toast } from '@/lib/notify';
import type { ProposedPrescription, SuggestedAdaptation } from '@safescript/shared';
import {
  generateChangeSummary,
  generateCounsellingPreview,
  generateDraftRationale,
} from '@safescript/shared';
import { useAdaptSubstitutionAlternatives } from '@/features/adapt/hooks';
import { SectionHeading } from './section-heading';
import { SharedPrescriptionDetails } from './shared-prescription-details';
import {
  adaptRationaleAutoKey,
  SharedClinicalRationale,
} from './shared-clinical-rationale';
import { buildDeterministicSig } from './map-drug-to-proposed';
import { treatmentRecommendationToProposedPrescription } from './map-treatment-to-proposed';
import { ReplacementTreatmentCard } from './replacement-treatment-card';
import { buildAdaptDoseOptions } from './build-adapt-dose-options';
import type { BranchCommonProps } from './dose-branch';

type EvidenceAlternative = {
  id: string;
  name: string;
  strengths: string[];
  defaultStrength: string;
  dosageForm: string;
  metadata?: string;
  rationale?: string;
  suggestionId: string | null;
  proposed: ProposedPrescription;
  source: 'pathway' | 'ai' | 'class';
};

function isAlternativeSuggestion(
  suggestion: SuggestedAdaptation,
  originalDrug: string,
): boolean {
  const title = (suggestion.title || '').toLowerCase();
  if (title.includes('alternative') || title.includes('substitut')) return true;
  const proposedName = suggestion.proposedPrescription.drugName || '';
  if (!originalDrug || !proposedName) return false;
  const orig = originalDrug.toLowerCase();
  const next = proposedName.toLowerCase();
  const origToken = orig.split(/\s+/)[0] || '';
  const nextToken = next.split(/\s+/)[0] || '';
  if (!origToken || !nextToken) return false;
  return !next.includes(origToken) && !orig.includes(nextToken);
}

function cleanIngredientName(raw: string): string {
  return raw
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|mL|%)\b/gi, '')
    .replace(/\b(sodium|calcium|potassium|hcl|hydrochloride)\b/gi, '')
    .replace(/\b(capsule|tablet|suspension|solution|cream|gel|patch)s?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildProposedFromAlternative(params: {
  name: string;
  strength: string;
  dosageForm?: string;
  quantity?: number | null;
  refills?: number | null;
}): ProposedPrescription {
  const dosageForm = params.dosageForm || 'tablet';
  const dose = params.strength;
  const frequency = 'Once daily';
  const route = 'By mouth';
  return {
    drugName: `${params.name} ${params.strength} ${dosageForm}`,
    strength: params.strength,
    dosageForm,
    dose,
    frequency,
    route,
    quantity: params.quantity ?? 30,
    refills: params.refills ?? 1,
    sig: buildDeterministicSig({ dose, dosageForm, route, frequency }),
  };
}

/** Deterministic class-based alternatives when pathway suggestions are thin. */
function classBasedAlternatives(originalDrug: string): EvidenceAlternative[] {
  const lower = originalDrug.toLowerCase();

  if (/rosuvastatin|atorvastatin|simvastatin|pravastatin|fluvastatin|pitavastatin|lovastatin|statin/.test(lower)) {
    const exclude = cleanIngredientName(originalDrug).toLowerCase();
    const pool = [
      { name: 'Atorvastatin', strengths: ['10 mg', '20 mg', '40 mg', '80 mg'], defaultStrength: '10 mg' },
      { name: 'Pravastatin', strengths: ['10 mg', '20 mg', '40 mg'], defaultStrength: '20 mg' },
      { name: 'Pitavastatin', strengths: ['1 mg', '2 mg', '4 mg'], defaultStrength: '2 mg' },
      { name: 'Fluvastatin', strengths: ['20 mg', '40 mg', '80 mg'], defaultStrength: '40 mg' },
      { name: 'Simvastatin', strengths: ['10 mg', '20 mg', '40 mg'], defaultStrength: '20 mg' },
    ].filter((item) => !exclude.includes(item.name.toLowerCase()));

    return pool.slice(0, 4).map((item) => ({
      id: `class_alt_${item.name.toLowerCase()}`,
      name: item.name,
      strengths: item.strengths,
      defaultStrength: item.defaultStrength,
      dosageForm: 'tablet',
      metadata: 'Same therapeutic class',
      suggestionId: null,
      source: 'class' as const,
      proposed: buildProposedFromAlternative({
        name: item.name,
        strength: item.defaultStrength,
      }),
    }));
  }

  if (/metformin/.test(lower)) {
    return [
      {
        id: 'class_alt_linagliptin',
        name: 'Linagliptin',
        strengths: ['5 mg'],
        defaultStrength: '5 mg',
        dosageForm: 'tablet',
        metadata: 'Evidence-linked option',
        suggestionId: null,
        source: 'class' as const,
        proposed: buildProposedFromAlternative({
          name: 'Linagliptin',
          strength: '5 mg',
        }),
      },
      {
        id: 'class_alt_sitagliptin',
        name: 'Sitagliptin',
        strengths: ['25 mg', '50 mg', '100 mg'],
        defaultStrength: '100 mg',
        dosageForm: 'tablet',
        metadata: 'Evidence-linked option',
        suggestionId: null,
        source: 'class' as const,
        proposed: buildProposedFromAlternative({
          name: 'Sitagliptin',
          strength: '100 mg',
        }),
      },
    ];
  }

  if (/diclofenac|ibuprofen|naproxen|nsaid/.test(lower)) {
    return [
      {
        id: 'class_alt_celecoxib',
        name: 'Celecoxib',
        strengths: ['100 mg', '200 mg'],
        defaultStrength: '200 mg',
        dosageForm: 'capsule',
        metadata: 'Evidence-linked option',
        suggestionId: null,
        source: 'class' as const,
        proposed: buildProposedFromAlternative({
          name: 'Celecoxib',
          strength: '200 mg',
          dosageForm: 'capsule',
        }),
      },
      {
        id: 'class_alt_acetaminophen',
        name: 'Acetaminophen',
        strengths: ['325 mg', '500 mg'],
        defaultStrength: '500 mg',
        dosageForm: 'tablet',
        metadata: 'Evidence-linked option',
        suggestionId: null,
        source: 'class' as const,
        proposed: buildProposedFromAlternative({
          name: 'Acetaminophen',
          strength: '500 mg',
        }),
      },
    ];
  }

  return [];
}

function suggestionToAlternative(sug: SuggestedAdaptation): EvidenceAlternative {
  const name =
    sug.proposedPrescription.drugName?.replace(
      /\b\d+(\.\d+)?\s*(mg|mcg|g|mL|%)\b.*$/i,
      '',
    ).trim() ||
    sug.title ||
    'Alternative';
  const strength = sug.proposedPrescription.strength || sug.proposedPrescription.dose || '';
  const strengths = strength ? [strength] : [];
  return {
    id: sug.id,
    name: cleanIngredientName(name) || name,
    strengths,
    defaultStrength: strength || '—',
    dosageForm: sug.proposedPrescription.dosageForm || 'tablet',
    metadata: 'Pathway · Evidence-linked option',
    suggestionId: sug.id,
    source: 'pathway',
    proposed: { ...sug.proposedPrescription },
  };
}

function proposedToDrugSearchResult(proposed: ProposedPrescription): DrugSearchResult | null {
  const id = proposed.drugId?.trim();
  if (!id || id.startsWith('class_alt_')) return null;
  return {
    id,
    brandName: proposed.brandName || proposed.drugName,
    genericName: proposed.genericName || undefined,
    strength: proposed.strength,
    dosageForm: proposed.dosageForm,
    label: proposed.drugName,
    source: 'ccdd',
  };
}

export function SubstitutionBranch(props: BranchCommonProps) {
  const {
    step1,
    step3A,
    suggestions,
    doseOptions,
    showRationaleResyncPrompt,
    consultationId,
    patchStep3A,
    patchProposedRx,
    setSigManuallyEdited,
    setShowRationaleResyncPrompt,
    buildAiRationaleDraft,
    canGenerateAiDraft,
  } = props;

  const [showAllAlternatives, setShowAllAlternatives] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [initialMedication, setInitialMedication] = useState<DrugSearchResult | null>(null);
  const [initialSearchQuery, setInitialSearchQuery] = useState<string | undefined>();
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const originalRx = step1.originalPrescription;
  const originalDrug =
    originalRx?.normalized?.genericName ||
    originalRx?.normalized?.brandName ||
    originalRx?.raw?.medicationText ||
    '';
  const originalDrugId = originalRx?.id?.trim() || undefined;

  const hasSelection = Boolean(step3A.proposedPrescription.drugName?.trim());

  const aiAlternativesQuery = useAdaptSubstitutionAlternatives(
    consultationId,
    !hasSelection,
  );

  const alternatives = useMemo(() => {
    const fromSuggestions = suggestions
      .filter((s) => isAlternativeSuggestion(s, originalDrug))
      .map(suggestionToAlternative)
      .filter((alt) => {
        const proposedToken = (alt.proposed.drugName || '').toLowerCase().split(/\s+/)[0] || '';
        const origToken = originalDrug.toLowerCase().split(/\s+/)[0] || '';
        return proposedToken && origToken && !proposedToken.includes(origToken);
      });

    const fromAi: EvidenceAlternative[] = (aiAlternativesQuery.data?.alternatives ?? []).map(
      (alt) => ({
        id: alt.id,
        name: alt.name,
        strengths: alt.strengths,
        defaultStrength: alt.defaultStrength,
        dosageForm: alt.dosageForm,
        metadata: alt.metadata || 'AI evidence-linked option',
        rationale: alt.rationale,
        suggestionId: null,
        source: 'ai' as const,
        proposed: {
          ...alt.proposed,
          drugId: alt.drugId || alt.proposed.drugId,
        },
      }),
    );

    const fromClass = classBasedAlternatives(originalDrug);

    // Prefer pathway, then AI, then deterministic class fallbacks. Deduplicate by name.
    const merged: EvidenceAlternative[] = [];
    const seen = new Set<string>();
    for (const alt of [...fromSuggestions, ...fromAi, ...fromClass]) {
      const key = alt.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(alt);
    }
    return merged;
  }, [suggestions, originalDrug, aiAlternativesQuery.data?.alternatives]);

  const visibleAlternatives = showAllAlternatives
    ? alternatives
    : alternatives.slice(0, 4);

  const applyProposed = (
    proposed: ProposedPrescription,
    suggestionId: string | null,
  ) => {
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    setDetailsExpanded(false);
    patchStep3A({
      proposalMode: 'custom',
      selectedSuggestionId: suggestionId,
      modifiedFromSuggestion: Boolean(suggestionId),
      proposedPrescription: proposed,
      changeSummary: generateChangeSummary(originalRx, proposed),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, proposed),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, proposed),
    });
  };

  const openAddModal = (opts: {
    medication?: DrugSearchResult | null;
    searchQuery?: string;
    suggestionId?: string | null;
  }) => {
    if (!consultationId || consultationId === 'preview') {
      toast.error('Open a saved Adapt consultation to add a replacement treatment.');
      return;
    }
    setPendingSuggestionId(opts.suggestionId ?? null);
    setInitialMedication(opts.medication ?? null);
    setInitialSearchQuery(opts.searchQuery);
    setAddOpen(true);
  };

  const handleDrugSelect = (drug: DrugSearchResult) => {
    openAddModal({ medication: drug });
  };

  const handleEvidenceSelect = (alt: EvidenceAlternative) => {
    const coded = proposedToDrugSearchResult(alt.proposed);
    if (coded) {
      openAddModal({ medication: coded, suggestionId: alt.suggestionId });
      return;
    }
    // Class-based / uncoded hints — open Prescribe picker prefilled so the
    // pharmacist confirms a catalogue product with full prescription options.
    openAddModal({ searchQuery: alt.name, suggestionId: alt.suggestionId });
  };

  const clearMedication = () => {
    setDetailsExpanded(false);
    patchStep3A({
      proposalMode: null,
      selectedSuggestionId: null,
      modifiedFromSuggestion: false,
      proposedPrescription: {
        drugName: '',
        dose: '',
        strength: '',
        dosageForm: '',
        frequency: '',
        route: '',
        quantity: null,
        refills: null,
        sig: '',
      },
      changeSummary: '',
      counsellingPreview: [],
      rationaleDraft: '',
      rationaleEditedByPharmacist: false,
    });
  };

  const handleAddTreatments = (treatments: TreatmentRecommendation[]) => {
    const treatment = treatments[0];
    if (!treatment) return;
    if (treatment.treatmentKind === 'CUSTOM_COMPOUND' || treatment.treatmentKind === 'DEVICE') {
      toast.error('Select a standard medication as the replacement treatment.');
      return;
    }
    applyProposed(
      treatmentRecommendationToProposedPrescription(treatment),
      pendingSuggestionId,
    );
    setPendingSuggestionId(null);
    setInitialMedication(null);
    setInitialSearchQuery(undefined);
  };

  const handleEditPrescription = () => {
    const coded = proposedToDrugSearchResult(step3A.proposedPrescription);
    if (coded) {
      openAddModal({
        medication: coded,
        suggestionId: step3A.selectedSuggestionId ?? null,
      });
      return;
    }
    setDetailsExpanded(true);
  };

  const resolvedDoseOptions = useMemo(() => {
    return buildAdaptDoseOptions(
      [
        step3A.proposedPrescription.dose,
        step3A.proposedPrescription.strength,
      ],
      doseOptions,
    );
  }, [doseOptions, step3A.proposedPrescription.dose, step3A.proposedPrescription.strength]);

  const excludedNames = [originalDrug].filter(Boolean);
  const excludedIds = originalDrugId ? [originalDrugId] : [];

  return (
    <div className="space-y-6">
      {/* 1 — Choose replacement medication */}
      <div className="space-y-3">
        <SectionHeading
          number={1}
          title="Choose replacement medication"
          helper="Search the medication catalogue or select an evidence-informed alternative. Do not reuse the original drug."
        />

        {!hasSelection ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
              <div className="space-y-2 rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-[#102a43]">Search medication catalogue</p>
                <DrugSearchCombobox
                  onSelect={handleDrugSelect}
                  placeholder="Search by generic or brand name…"
                  clearOnSelect
                  autoFocus
                />
                <p className="text-[11px] text-[#829ab1]">No replacement medication selected</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-1 h-9 w-full border-[#d9e4e8] text-[13px] font-semibold text-[#0F6F6B]"
                  onClick={() => openAddModal({})}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add replacement treatment
                </Button>
              </div>

              <div className="rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[#102a43]">
                    <Sparkles className="h-3.5 w-3.5 text-[#0F6F6B]" aria-hidden />
                    Evidence-linked alternatives
                  </p>
                  <button
                    type="button"
                    onClick={() => void aiAlternativesQuery.refetch()}
                    disabled={aiAlternativesQuery.isFetching}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F6F6B] hover:underline disabled:opacity-50"
                    aria-label="Refresh AI alternatives"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${aiAlternativesQuery.isFetching ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </button>
                </div>

                {aiAlternativesQuery.isLoading && alternatives.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-6 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-[#0F6F6B]" aria-hidden />
                    <p className="text-[12px] font-medium text-[#334e68]">
                      Generating pharmacist alternatives…
                    </p>
                    <p className="text-[11px] text-[#829ab1]">
                      AI is preparing evidence-linked options for this medication and reason.
                    </p>
                  </div>
                ) : visibleAlternatives.length > 0 ? (
                  <ul className="space-y-2">
                    {visibleAlternatives.map((alt) => (
                      <li
                        key={alt.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#e2eaed] bg-[#fbfdfe] px-3 py-2.5 transition-colors hover:border-[#b0c4cb]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-[#102a43]">
                              {alt.name}
                            </p>
                            {alt.source === 'ai' ? (
                              <span className="rounded-full bg-[#eef8f7] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#0F6F6B]">
                                AI
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] font-medium text-[#627d98]">
                            {alt.strengths.length > 0
                              ? alt.strengths.join(' · ')
                              : alt.defaultStrength}
                          </p>
                          {alt.rationale ? (
                            <p className="mt-1 text-[11px] leading-snug text-[#486581]">
                              {alt.rationale}
                            </p>
                          ) : alt.metadata ? (
                            <p className="mt-0.5 text-[10px] text-[#829ab1]">{alt.metadata}</p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleEvidenceSelect(alt)}
                          className="h-9 shrink-0 rounded-lg border-[#d9e4e8] px-3 text-[13px] font-semibold text-[#102a43]"
                        >
                          Select
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-4 text-center text-[11px] text-[#829ab1]">
                    {aiAlternativesQuery.data?.unavailableReason ||
                      'No pathway alternatives available. Use catalogue search.'}
                  </p>
                )}

                {alternatives.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllAlternatives((v) => !v)}
                    className="mt-3 text-[11px] font-semibold text-[#0F6F6B] hover:underline"
                  >
                    {showAllAlternatives
                      ? 'Show fewer alternatives'
                      : 'View all alternatives →'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2.5 rounded-xl border border-[#c5e4f3] bg-[#F0F9FC] px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0284c7]" aria-hidden />
              <p className="text-xs leading-relaxed text-[#0c4a6e]">
                Suggested alternatives are AI-assisted, evidence-linked options based on the
                original medication, adaptation reason, and patient context. Always confirm
                suitability and complete prescription details before selecting.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* 2 — Replacement treatment list + prescription */}
      {hasSelection ? (
        <div className="space-y-3">
          <SectionHeading
            number={2}
            title="Replacement treatment"
            helper="Review the added replacement. Edit prescription details using the same options as Prescribe, or change the medication."
          />
          <div className="space-y-3">
            <ReplacementTreatmentCard
              proposed={step3A.proposedPrescription}
              onEdit={handleEditPrescription}
              onChangeMedication={clearMedication}
              onRemove={clearMedication}
            />
            {detailsExpanded ? (
              <SharedPrescriptionDetails
                sectionNumber={2}
                proposed={step3A.proposedPrescription}
                doseOptions={resolvedDoseOptions}
                showDrugName={false}
                helper="Adjust structured prescription fields for the selected replacement."
                onPatch={patchProposedRx}
                onSigManualEdit={() => setSigManuallyEdited(true)}
              />
            ) : (
              <button
                type="button"
                className="text-[12px] font-semibold text-[#0F6F6B] hover:underline"
                onClick={() => setDetailsExpanded(true)}
              >
                Adjust structured fields inline →
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <SectionHeading
            number={2}
            title="Replacement treatment"
            helper="Select a medication to open Add treatment and complete the prescription."
          />
          <div className="rounded-xl border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-8 text-center text-xs text-[#829ab1]">
            No replacement treatment added yet. Search the catalogue or choose an
            evidence-linked alternative.
          </div>
        </div>
      )}

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
          step3A.proposedPrescription.drugName,
          step3A.proposedPrescription.dose,
          step3A.proposedPrescription.frequency,
          step3A.proposedPrescription.route,
          step3A.proposedPrescription.sig,
        ])}
        showResyncPrompt={showRationaleResyncPrompt}
        onKeepCurrent={() => setShowRationaleResyncPrompt(false)}
        onRequestRegenerate={() => setShowRationaleResyncPrompt(false)}
        helper="Explain why this therapeutic substitution is appropriate for this patient."
      />

      <AddTreatmentDialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) {
            setInitialMedication(null);
            setInitialSearchQuery(undefined);
            setPendingSuggestionId(null);
          }
        }}
        onAdd={handleAddTreatments}
        priority={1}
        consultationId={consultationId}
        existingMedicationNames={excludedNames}
        excludedMedicationIds={excludedIds}
        initialMedication={initialMedication}
        initialSearchQuery={initialSearchQuery}
        title="Add replacement treatment"
        confirmLabel="Add replacement treatment"
        medicationOnly
        successToastMessage={(name) => `${name} added as the replacement treatment`}
      />
    </div>
  );
}
