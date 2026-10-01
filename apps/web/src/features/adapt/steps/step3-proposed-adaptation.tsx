'use client';

import {
  forwardRef,
  useState,
  useMemo,
  useCallback,
  useRef,
  useImperativeHandle,
} from 'react';
import {
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClinicalCollapsedSummary } from '@/features/consultations/clinical-ui';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import { toast } from '@/lib/notify';
import {
  generateAdaptationSuggestions,
  generateChangeSummary,
  generateDraftRationale,
  generateCounsellingPreview,
  isAdaptStepThreeOptionAValid,
  emptyAdaptStepThreeOptionA,
  emptyProposedPrescription,
  type AdaptStepOne,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
  type AdaptStepTwoOptionC,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type ProposedPrescription,
  type SuggestedAdaptation,
} from '@safescript/shared';
import { useGenerateAdaptClinicalRationale } from '@/features/adapt/hooks';
import {
  DoseBranch,
  FormulationBranch,
  RegimenBranch,
  RouteBranch,
  SubstitutionBranch,
  OtherBranch,
  SharedSummaryHeader,
  Adapt3ASidebar,
  type BranchCommonProps,
} from './step3a';
import { buildAdaptDoseOptions } from './step3a/build-adapt-dose-options';
import {
  AdaptEmbeddedSafetyBlock,
  type AdaptEmbeddedSafetyBlockHandle,
} from './adapt-embedded-safety-block';
import { AdaptConfirmTreatmentFooter } from './adapt-confirm-treatment-footer';
import type { AdaptConfirmTreatmentFooterProps } from './adapt-confirm-treatment-footer';

function initStep3A(params: {
  initialStep3A?: AdaptStepThreeOptionA;
  step1: AdaptStepOne;
  suggestions: SuggestedAdaptation[];
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
}): AdaptStepThreeOptionA {
  const { initialStep3A, step1, suggestions, step2A, step2B } = params;
  const originalRx = step1.originalPrescription;
  const adaptType = step1.adaptationType || 'dose';

  if (
    initialStep3A &&
    (initialStep3A.confirmed ||
      initialStep3A.proposalMode ||
      initialStep3A.proposedPrescription.drugName?.trim() ||
      initialStep3A.customAdaptationSummary?.trim())
  ) {
    return initialStep3A;
  }

  // Therapeutic substitution: never prefill original drug
  if (adaptType === 'therapeutic_substitution') {
    const empty = emptyAdaptStepThreeOptionA(null);
    return {
      ...empty,
      proposedPrescription: {
        ...emptyProposedPrescription(null),
        drugName: '',
        dose: '',
        frequency: '',
        route: '',
        quantity: null,
        refills: null,
        sig: '',
      },
    };
  }

  const empty = emptyAdaptStepThreeOptionA(originalRx);

  if (adaptType === 'other') {
    return empty;
  }

  // Seed dose / regimen from first relevant suggestion when available
  if (suggestions.length > 0 && (adaptType === 'dose' || adaptType === 'regimen')) {
    const rec =
      suggestions.find((s) => {
        const t = (s.title || '').toLowerCase();
        if (adaptType === 'dose') return t.includes('dose') || t.includes('adjust');
        return t.includes('frequency') || t.includes('regimen') || t.includes('schedule');
      }) ?? suggestions[0]!;

    return {
      ...empty,
      proposalMode: 'suggested',
      selectedSuggestionId: rec.id,
      proposedPrescription: { ...rec.proposedPrescription },
      changeSummary: generateChangeSummary(originalRx, rec.proposedPrescription),
      rationaleDraft:
        rec.rationaleSummary ||
        generateDraftRationale(step1, step2A, step2B, rec.proposedPrescription),
      counsellingPreview:
        rec.counsellingPoints || generateCounsellingPreview(step1, rec.proposedPrescription),
    };
  }

  return empty;
}

export type Step3ProposedAdaptationHandle = {
  confirmTreatment: () => Promise<AdaptStepThreeOptionB | null>;
  /** Open this section and scroll to the active validation blocker. */
  focusValidationIssue: (target?: 'proposal' | 'safety' | 'rationale') => void;
};

export interface Step3ProposedAdaptationProps {
  consultationId: string;
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step2C?: AdaptStepTwoOptionC;
  initialStep3A?: AdaptStepThreeOptionA;
  initialStep3B?: AdaptStepThreeOptionB;
  jurisdiction: string;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  /** Force the Proposed Adaptation accordion open (no toggle). */
  onEnsureOpen?: () => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  onSaveStep3A: (step3A: AdaptStepThreeOptionA) => Promise<void> | void;
  onSaveStep3B: (step3B: AdaptStepThreeOptionB) => Promise<void>;
  onBackToPatientAssessment: () => void;
  onChangeAdaptationType: () => void;
  onSafetyGateChange?: (gate: {
    ready: boolean;
    blockedReason?: string | null;
  }) => void;
  onReplaceProposedMedication?: (proposed: ProposedPrescription) => void;
  /** Confirm CTA rendered in this section footer (replaces Selected treatment plan card). */
  confirmFooter?: AdaptConfirmTreatmentFooterProps | null;
}

export const Step3ProposedAdaptation = forwardRef<
  Step3ProposedAdaptationHandle,
  Step3ProposedAdaptationProps
>(function Step3ProposedAdaptation(
  {
  consultationId,
  step1,
  step2A,
  step2B,
  step2C,
  initialStep3A,
  initialStep3B,
  jurisdiction,
  isOpen = true,
  onToggleOpen,
  onEnsureOpen,
  sectionRef,
  onSaveStep3A,
  onSaveStep3B,
  onBackToPatientAssessment,
  onChangeAdaptationType,
  onSafetyGateChange,
  onReplaceProposedMedication,
  confirmFooter,
},
  ref,
) {
  const safetyRef = useRef<AdaptEmbeddedSafetyBlockHandle | null>(null);
  const ensureOpenRef = useRef(onEnsureOpen);
  ensureOpenRef.current = onEnsureOpen;
  const originalRx = step1.originalPrescription;
  const adaptationType = step1.adaptationType || 'dose';

  const suggestions: SuggestedAdaptation[] = useMemo(() => {
    return generateAdaptationSuggestions(step1, step2A, step2B);
  }, [step1, step2A, step2B]);

  const [step3A, setStep3A] = useState<AdaptStepThreeOptionA>(() =>
    initStep3A({ initialStep3A, step1, suggestions, step2A, step2B }),
  );

  const [sigManuallyEdited, setSigManuallyEdited] = useState(false);
  const [showRationaleResyncPrompt, setShowRationaleResyncPrompt] = useState(false);

  const patchStep3A = useCallback(
    (patch: Partial<AdaptStepThreeOptionA>) => {
      setStep3A((prev) => {
        const next: AdaptStepThreeOptionA = {
          ...prev,
          ...patch,
        };
        void onSaveStep3A(next);
        return next;
      });
    },
    [onSaveStep3A],
  );

  const patchProposedRx = useCallback(
    (patch: Partial<ProposedPrescription>) => {
      setStep3A((prev) => {
        const updatedRx = {
          ...prev.proposedPrescription,
          ...patch,
        };

        if (
          (patch.dose !== undefined ||
            patch.frequency !== undefined ||
            patch.route !== undefined) &&
          !sigManuallyEdited
        ) {
          const dose = patch.dose ?? updatedRx.dose;
          const freq = (patch.frequency ?? updatedRx.frequency ?? 'once daily').toLowerCase();
          const route = (patch.route ?? updatedRx.route ?? 'by mouth').toLowerCase();
          const form = (updatedRx.dosageForm || 'tablet').toLowerCase();
          updatedRx.sig = `Take 1 ${form}${dose ? ` (${dose})` : ''} ${route} ${freq}`;
        }

        if (prev.rationaleEditedByPharmacist) {
          setShowRationaleResyncPrompt(true);
        }

        const next: AdaptStepThreeOptionA = {
          ...prev,
          modifiedFromSuggestion:
            prev.proposalMode === 'suggested' ? true : prev.modifiedFromSuggestion,
          proposalMode: prev.proposalMode ?? 'custom',
          proposedPrescription: updatedRx,
          changeSummary: generateChangeSummary(originalRx, updatedRx),
          rationaleDraft: prev.rationaleEditedByPharmacist
            ? prev.rationaleDraft
            : generateDraftRationale(step1, step2A, step2B, updatedRx),
          counsellingPreview: generateCounsellingPreview(step1, updatedRx),
        };

        void onSaveStep3A(next);
        return next;
      });
    },
    [originalRx, sigManuallyEdited, step1, step2A, step2B, onSaveStep3A],
  );

  const handleResetToOriginal = useCallback(() => {
    if (adaptationType === 'therapeutic_substitution') {
      setSigManuallyEdited(false);
      setShowRationaleResyncPrompt(false);
      patchStep3A({
        ...emptyAdaptStepThreeOptionA(null),
        proposedPrescription: {
          ...emptyProposedPrescription(null),
          drugName: '',
          dose: '',
          frequency: '',
          route: '',
          quantity: null,
          refills: null,
          sig: '',
        },
        customAdaptationSummary: step3A.customAdaptationSummary,
        additionalDetails: step3A.additionalDetails,
      });
      return;
    }
    const empty = emptyAdaptStepThreeOptionA(originalRx);
    const keepCustomSummary = Boolean(step3A.customAdaptationSummary?.trim());
    const resetHasDrug = Boolean(empty.proposedPrescription.drugName?.trim());
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      ...empty,
      proposalMode:
        adaptationType === 'other' && (keepCustomSummary || resetHasDrug) ? 'custom' : null,
      selectedSuggestionId: null,
      selectedFormulation: step3A.selectedFormulation,
      selectedRouteOption: step3A.selectedRouteOption,
      dosingTime: step3A.dosingTime,
      customAdaptationSummary: step3A.customAdaptationSummary,
      additionalDetails: step3A.additionalDetails,
    });
  }, [adaptationType, originalRx, patchStep3A, step3A]);

  const generateRationale = useGenerateAdaptClinicalRationale(consultationId);

  const buildAiRationaleDraft = useCallback(async () => {
    const fallback = generateDraftRationale(
      step1,
      step2A,
      step2B,
      step3A.proposedPrescription,
    ).slice(0, 500);

    if (!consultationId || consultationId === 'preview') return fallback;

    try {
      const result = await generateRationale.mutateAsync({
        ...step3A.proposedPrescription,
      });
      const text = result.rationale?.trim();
      return (text || fallback).slice(0, 500);
    } catch {
      return fallback;
    }
  }, [
    consultationId,
    generateRationale,
    step1,
    step2A,
    step2B,
    step3A.proposedPrescription,
  ]);

  const canGenerateAiDraft = useMemo(() => {
    const rx = step3A.proposedPrescription;
    const hasDrug = Boolean(rx.drugName?.trim());
    if (adaptationType === 'therapeutic_substitution') return hasDrug;
    if (adaptationType === 'other') {
      return Boolean(step3A.customAdaptationSummary?.trim()) && hasDrug;
    }
    return (
      hasDrug &&
      Boolean(rx.dose?.trim() || rx.frequency?.trim() || rx.sig?.trim() || rx.route?.trim())
    );
  }, [adaptationType, step3A.customAdaptationSummary, step3A.proposedPrescription]);

  const handleChangeAdaptationType = useCallback(() => {
    void onSaveStep3A(step3A);
    onChangeAdaptationType();
  }, [onSaveStep3A, onChangeAdaptationType, step3A]);

  const validation = useMemo(() => {
    return isAdaptStepThreeOptionAValid(step3A, jurisdiction, adaptationType);
  }, [step3A, jurisdiction, adaptationType]);

  const focusValidationIssue = useCallback(
    (target: 'proposal' | 'safety' | 'rationale' = 'proposal') => {
      const wasClosed = !isOpen;
      if (wasClosed) {
        ensureOpenRef.current?.();
      }
      window.setTimeout(() => {
        const el =
          target === 'safety'
            ? document.getElementById('adapt-safety-engine')
            : target === 'rationale'
              ? document.getElementById('adapt-clinical-rationale')
              : sectionRef?.current ?? document.getElementById('adapt-proposed-adaptation');
        if (el) {
          scrollConsultChildIntoView(el, {
            behavior: 'smooth',
            block: 'start',
            offset: 16,
          });
        }
      }, wasClosed ? 80 : 40);
    },
    [isOpen, sectionRef],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusValidationIssue,
      confirmTreatment: async () => {
        if (!validation.valid) {
          const first = validation.missingFields[0] || 'proposed adaptation details';
          toast.error(`Complete ${first} before confirming treatment.`);
          focusValidationIssue('proposal');
          return null;
        }
        if (!(step3A.rationaleDraft || '').trim()) {
          toast.error('Add a clinical rationale before confirming treatment.');
          focusValidationIssue('rationale');
          return null;
        }
        const saved = await (safetyRef.current?.confirmTreatment() ?? Promise.resolve(null));
        if (!saved) {
          focusValidationIssue('safety');
          return null;
        }
        const confirmed: AdaptStepThreeOptionA = {
          ...step3A,
          confirmed: true,
          confirmedAt: saved.confirmedAt ?? new Date().toISOString(),
        };
        setStep3A(confirmed);
        await onSaveStep3A(confirmed);
        return saved;
      },
    }),
    [focusValidationIssue, onSaveStep3A, step3A, validation.missingFields, validation.valid],
  );

  const doseOptions = useMemo(() => {
    const proposed = step3A.proposedPrescription;
    const origStrength = originalRx?.normalized?.strength || '';
    // Only seed from the *active* proposed Rx (and original strength when adapting same drug).
    // Never inject drug-agnostic metformin/statin defaults.
    return buildAdaptDoseOptions([
      proposed.dose,
      proposed.strength,
      origStrength,
    ]);
  }, [
    originalRx?.normalized?.strength,
    step3A.proposedPrescription.dose,
    step3A.proposedPrescription.strength,
  ]);

  const propSummary = useMemo(() => {
    if (!step3A.proposedPrescription.drugName) {
      if (step3A.customAdaptationSummary?.trim()) return step3A.customAdaptationSummary.trim();
      return 'Proposed adaptation specified';
    }
    const p = step3A.proposedPrescription;
    const parts = [p.drugName];
    if (p.dose) parts.push(p.dose);
    if (p.frequency) parts.push(p.frequency);
    if (p.quantity) parts.push(`Qty ${p.quantity}`);
    return parts.join(' · ');
  }, [step3A.proposedPrescription, step3A.customAdaptationSummary]);

  const branchProps: BranchCommonProps = {
    step1,
    step3A,
    suggestions,
    doseOptions,
    sigManuallyEdited,
    showRationaleResyncPrompt,
    canGenerateAiDraft,
    consultationId,
    patchStep3A,
    patchProposedRx,
    setSigManuallyEdited,
    setShowRationaleResyncPrompt,
    onResetToOriginal: handleResetToOriginal,
    buildAiRationaleDraft,
  };

  const renderBranch = () => {
    switch (adaptationType) {
      case 'dose':
        return <DoseBranch {...branchProps} />;
      case 'dosage_form':
        return <FormulationBranch {...branchProps} />;
      case 'regimen':
        return <RegimenBranch {...branchProps} />;
      case 'route':
        return <RouteBranch {...branchProps} />;
      case 'therapeutic_substitution':
        return <SubstitutionBranch {...branchProps} />;
      case 'other':
        return <OtherBranch {...branchProps} />;
      default:
        return <DoseBranch {...branchProps} />;
    }
  };

  if (!isOpen) {
    return (
      <div ref={sectionRef} className="scroll-mt-3 clinical-section-collapse">
        <ClinicalCollapsedSummary
          step="3A"
          title="Proposed Adaptation"
          summary={propSummary}
          onEdit={() => {
            onToggleOpen?.();
            setTimeout(() => {
              if (sectionRef && 'current' in sectionRef && sectionRef.current) {
                scrollConsultChildIntoView(sectionRef.current, {
                  behavior: 'smooth',
                  block: 'start',
                  offset: 16,
                });
              }
            }, 50);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        id="adapt-proposed-adaptation"
        ref={sectionRef}
        className="overflow-hidden rounded-xl border border-[#d9e4e8] bg-white shadow-sm clinical-section-expand"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"], a, input, textarea, select'))
              return;
            onToggleOpen?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (
                (e.target as HTMLElement).closest(
                  'button, [role="dialog"], [role="menu"], a, input, textarea, select',
                )
              )
                return;
              e.preventDefault();
              onToggleOpen?.();
            }
          }}
          className="flex cursor-pointer select-none items-center justify-between border-b border-[#e2eaed] px-5 py-4 transition-colors hover:bg-slate-50/60 sm:px-6"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F6F6B] text-xs font-bold text-white shadow-sm">
              3A
            </span>
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-[#102a43] sm:text-[26px]">
                Proposed Adaptation
              </h2>
              <p className="mt-0.5 text-[13px] text-[#627d98]">
                Create the proposed prescription based on the selected adaptation type.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg border-[#d9e4e8] px-3 text-xs font-medium text-[#102a43] hover:bg-slate-50"
                >
                  <HelpCircle className="h-4 w-4 text-[#0F6F6B]" />
                  <span>How this works</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-84 p-4 text-xs text-[#334e68] shadow-lg">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-[#102a43]">
                    <Sparkles className="h-4 w-4 text-[#0F6F6B]" />
                    <span>How this works</span>
                  </div>
                  <p className="leading-relaxed text-[#52677a]">
                    This step changes based on the adaptation type selected earlier. Complete the
                    proposed prescription, review Safety Engine alerts here, then continue to
                    counselling. The pharmacist remains responsible for the final adaptation
                    decision.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {onToggleOpen && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleOpen}
                className="h-8 w-8 text-[#52677a] hover:bg-slate-100"
                aria-label={isOpen ? 'Collapse 3A' : 'Expand 3A'}
              >
                {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </Button>
            )}
          </div>
        </div>

        {isOpen && (
          <>
            <div className="p-5 clinical-section-expand sm:p-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0 space-y-6">
                  <SharedSummaryHeader
                    step1={step1}
                    proposedPrescription={step3A.proposedPrescription}
                    onChangeAdaptationType={handleChangeAdaptationType}
                  />
                  {renderBranch()}
                  <AdaptEmbeddedSafetyBlock
                    ref={safetyRef}
                    consultationId={consultationId}
                    step1={step1}
                    step2A={step2A}
                    step2B={step2B}
                    step3A={step3A}
                    initialStep3B={initialStep3B}
                    jurisdiction={jurisdiction}
                    onSaveStep3B={onSaveStep3B}
                    onSafetyGateChange={onSafetyGateChange}
                    onReplaceProposedMedication={onReplaceProposedMedication}
                    onChangeMedicationInline={
                      adaptationType === 'therapeutic_substitution'
                        ? handleResetToOriginal
                        : undefined
                    }
                  />
                </div>
                <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                  <Adapt3ASidebar
                    consultationId={consultationId}
                    step2A={step2A}
                    step2C={step2C}
                    adaptationType={adaptationType}
                    onEditPatientContext={onBackToPatientAssessment}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#e2eaed] bg-[#fafcfc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={onBackToPatientAssessment}
                className="h-11 shrink-0 rounded-lg border-[#d9e4e8] px-4 text-sm font-semibold text-[#52677a] hover:bg-white"
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                <span>Back to Patient Assessment</span>
              </Button>
              {confirmFooter ? (
                <AdaptConfirmTreatmentFooter {...confirmFooter} />
              ) : (
                <p className="text-xs font-medium text-[#617184] sm:text-right">
                  {validation.valid
                    ? 'Complete Safety Engine review, then confirm treatment.'
                    : `Finish required fields (${validation.missingFields.slice(0, 2).join(', ')}${
                        validation.missingFields.length > 2 ? '…' : ''
                      }) before confirming.`}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
