'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import type {
  AdaptStepOne,
  AdaptStepTwoOptionA,
  AdaptStepTwoOptionB,
  AdaptStepTwoOptionC,
  AdaptStepThreeOptionA,
  AdaptStepThreeOptionB,
} from '@safescript/shared';
import type { Consultation } from '@/features/consultations/types';
import type { CounsellingPlan } from '@/features/consultations/counselling-panel-model';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import {
  Step3ProposedAdaptation,
  type Step3ProposedAdaptationHandle,
} from './step3-proposed-adaptation';
import {
  AdaptCounsellingSection,
  type AdaptConfirmFooterState,
  type AdaptCounsellingSectionHandle,
} from './adapt-counselling-section';
import type { AdaptConfirmTreatmentFooterProps } from './adapt-confirm-treatment-footer';

export interface Step3ProposedAdaptationContainerProps {
  consultationId: string;
  consultation: Consultation;
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step2C?: AdaptStepTwoOptionC;
  initialStep3A?: AdaptStepThreeOptionA;
  initialStep3B?: AdaptStepThreeOptionB;
  jurisdiction: string;
  onSaveStep3A: (step3A: AdaptStepThreeOptionA) => Promise<void> | void;
  onSaveStep3B: (step3B: AdaptStepThreeOptionB) => Promise<void> | void;
  onBackToPatientAssessment: () => void;
  onContinueToDocuments: (payload: {
    step3A?: AdaptStepThreeOptionA;
    step3B: AdaptStepThreeOptionB;
    counsellingPreview: string[];
    counsellingPlan: CounsellingPlan;
  }) => Promise<void> | void;
  onChangeAdaptationType: () => void;
  continueLoading?: boolean;
}

export function Step3ProposedAdaptationContainer({
  consultationId,
  consultation,
  step1,
  step2A,
  step2B,
  step2C,
  initialStep3A,
  initialStep3B,
  jurisdiction,
  onSaveStep3A,
  onSaveStep3B,
  onBackToPatientAssessment,
  onContinueToDocuments,
  onChangeAdaptationType,
  continueLoading,
}: Step3ProposedAdaptationContainerProps) {
  const [currentStep3A, setCurrentStep3A] = useState<AdaptStepThreeOptionA | undefined>(
    initialStep3A,
  );
  const [currentStep3B, setCurrentStep3B] = useState<AdaptStepThreeOptionB | undefined>(
    initialStep3B,
  );
  const [safetyGate, setSafetyGate] = useState<{
    ready: boolean;
    blockedReason?: string | null;
  }>({ ready: Boolean(initialStep3B?.confirmed) });
  const [step3AOpen, setStep3AOpen] = useState(true);
  const [confirmFooterState, setConfirmFooterState] = useState<AdaptConfirmFooterState | null>(
    null,
  );

  const section3ARef = useRef<HTMLDivElement | null>(null);
  const counsellingMountRef = useRef<HTMLDivElement | null>(null);
  const step3ARef = useRef<Step3ProposedAdaptationHandle | null>(null);
  const counsellingSectionRef = useRef<AdaptCounsellingSectionHandle | null>(null);

  const handleSave3A = useCallback(
    async (step3A: AdaptStepThreeOptionA) => {
      setCurrentStep3A(step3A);
      await onSaveStep3A(step3A);
    },
    [onSaveStep3A],
  );

  const handleSave3B = useCallback(
    async (saved3B: AdaptStepThreeOptionB) => {
      setCurrentStep3B(saved3B);
      await onSaveStep3B(saved3B);
    },
    [onSaveStep3B],
  );

  const handleReplaceProposedMedication = useCallback(
    async (proposed: AdaptStepThreeOptionA['proposedPrescription']) => {
      if (!currentStep3A) {
        setStep3AOpen(true);
        return;
      }
      const next: AdaptStepThreeOptionA = {
        ...currentStep3A,
        proposalMode: 'custom',
        selectedSuggestionId: null,
        modifiedFromSuggestion: true,
        proposedPrescription: proposed,
        confirmed: false,
        confirmedAt: undefined,
        changeSummary: '',
        rationaleDraft: '',
        rationaleEditedByPharmacist: false,
        counsellingPreview: [],
      };
      setCurrentStep3A(next);
      await onSaveStep3A(next);
      setCurrentStep3B(undefined);
      setSafetyGate({
        ready: false,
        blockedReason: 'Review Safety Engine for the new medication.',
      });
      setStep3AOpen(true);
      setTimeout(() => {
        if (section3ARef.current) {
          scrollConsultChildIntoView(section3ARef.current, {
            behavior: 'smooth',
            block: 'start',
            offset: 16,
          });
        }
      }, 60);
    },
    [currentStep3A, onSaveStep3A],
  );

  /** Persist 3B only — counselling section owns confirm UX + counselling generation. */
  const handleRequestConfirmTreatment = useCallback(async () => {
    const saved = await step3ARef.current?.confirmTreatment();
    if (saved) {
      setCurrentStep3B(saved);
      setSafetyGate({ ready: true, blockedReason: null });
      setStep3AOpen(false);
      setTimeout(() => {
        if (counsellingMountRef.current) {
          scrollConsultChildIntoView(counsellingMountRef.current, {
            behavior: 'smooth',
            block: 'start',
            offset: 16,
          });
        }
      }, 80);
    }
    return saved ?? null;
  }, []);

  const handleFocusValidationIssue = useCallback(
    (target: 'proposal' | 'safety' | 'rationale' = 'safety') => {
      setStep3AOpen(true);
      window.setTimeout(() => {
        step3ARef.current?.focusValidationIssue(target);
      }, 60);
    },
    [],
  );

  const handleContinueDocuments = useCallback(
    async (opts: {
      step3B: AdaptStepThreeOptionB;
      counsellingPreview: string[];
      counsellingPlan: CounsellingPlan;
    }) => {
      const next3A = currentStep3A
        ? {
            ...currentStep3A,
            counsellingPreview: opts.counsellingPreview,
            confirmed: true,
          }
        : undefined;
      if (next3A) {
        setCurrentStep3A(next3A);
        await onSaveStep3A(next3A);
      }
      setCurrentStep3B(opts.step3B);
      await onSaveStep3B(opts.step3B);
      await onContinueToDocuments({
        step3A: next3A,
        step3B: opts.step3B,
        counsellingPreview: opts.counsellingPreview,
        counsellingPlan: opts.counsellingPlan,
      });
    },
    [currentStep3A, onSaveStep3A, onSaveStep3B, onContinueToDocuments],
  );

  const handleEditProposedAdaptation = useCallback(() => {
    setStep3AOpen(true);
    setTimeout(() => {
      if (section3ARef.current) {
        scrollConsultChildIntoView(section3ARef.current, {
          behavior: 'smooth',
          block: 'start',
          offset: 16,
        });
      }
    }, 60);
  }, []);

  const handleConfirmFooterChange = useCallback((state: AdaptConfirmFooterState) => {
    setConfirmFooterState((prev) => {
      if (
        prev &&
        prev.confirmState === state.confirmState &&
        prev.confirmStatus === state.confirmStatus &&
        prev.disabledReason === state.disabledReason &&
        prev.confirmedAt === state.confirmedAt
      ) {
        return prev;
      }
      return state;
    });
  }, []);

  const is3AComplete = Boolean(
    currentStep3A?.confirmed || currentStep3A?.proposedPrescription?.drugName,
  );

  const confirmFooter = useMemo((): AdaptConfirmTreatmentFooterProps | null => {
    if (!is3AComplete) return null;
    const state: AdaptConfirmFooterState = confirmFooterState ?? {
      confirmState: safetyGate.ready ? 'ready' : 'not_ready',
      confirmStatus: currentStep3B?.confirmed ? 'CONFIRMED' : 'DRAFT',
      disabledReason: safetyGate.ready
        ? null
        : safetyGate.blockedReason ||
          'Resolve Safety Engine findings before confirming treatment.',
      confirmedAt: currentStep3B?.confirmedAt ?? null,
    };
    return {
      ...state,
      onConfirm: () => {
        void counsellingSectionRef.current?.confirmTreatment();
      },
      onBlockedConfirm: () => {
        if (counsellingSectionRef.current) {
          counsellingSectionRef.current.handleBlockedConfirm();
          return;
        }
        handleFocusValidationIssue(
          (state.disabledReason || '').toLowerCase().includes('rationale')
            ? 'rationale'
            : 'safety',
        );
      },
      onEditPlan: () => {
        if (counsellingSectionRef.current) {
          counsellingSectionRef.current.handleEditPlan();
          return;
        }
        handleEditProposedAdaptation();
      },
    };
  }, [
    confirmFooterState,
    currentStep3B?.confirmed,
    currentStep3B?.confirmedAt,
    handleEditProposedAdaptation,
    handleFocusValidationIssue,
    is3AComplete,
    safetyGate.blockedReason,
    safetyGate.ready,
  ]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBackToPatientAssessment}
        className="group inline-flex items-center gap-1 text-xs font-semibold text-[#52677a] transition-colors hover:text-[#0F6F6B]"
      >
        <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Patient Assessment</span>
      </button>

      <Step3ProposedAdaptation
        key={`${consultationId}-step3A`}
        ref={step3ARef}
        consultationId={consultationId}
        step1={step1}
        step2A={step2A}
        step2B={step2B}
        step2C={step2C}
        initialStep3A={currentStep3A}
        initialStep3B={currentStep3B}
        jurisdiction={jurisdiction}
        isOpen={step3AOpen}
        onToggleOpen={() => setStep3AOpen((prev) => !prev)}
        onEnsureOpen={() => setStep3AOpen(true)}
        sectionRef={section3ARef}
        onSaveStep3A={handleSave3A}
        onSaveStep3B={handleSave3B}
        onBackToPatientAssessment={onBackToPatientAssessment}
        onChangeAdaptationType={onChangeAdaptationType}
        onSafetyGateChange={setSafetyGate}
        onReplaceProposedMedication={handleReplaceProposedMedication}
        confirmFooter={confirmFooter}
      />

      {is3AComplete ? (
        <div ref={counsellingMountRef} className="scroll-mt-3">
          <AdaptCounsellingSection
            ref={counsellingSectionRef}
            consultation={consultation}
            step1={step1}
            step3A={currentStep3A}
            step3B={currentStep3B}
            safetyReady={safetyGate.ready}
            safetyBlockedReason={safetyGate.blockedReason}
            onRequestConfirmTreatment={handleRequestConfirmTreatment}
            onFocusValidationIssue={handleFocusValidationIssue}
            onEditProposedAdaptation={handleEditProposedAdaptation}
            onConfirmFooterChange={handleConfirmFooterChange}
            onContinueToDocuments={handleContinueDocuments}
            continueLoading={continueLoading}
          />
        </div>
      ) : null}
    </div>
  );
}
