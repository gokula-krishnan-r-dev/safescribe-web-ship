'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  emptyAdaptStepTwoOptionA,
  emptyAdaptStepTwoOptionC,
  prefillAdaptStep2AFromStep1,
  type AdaptStepOne,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
  type AdaptStepTwoOptionC,
} from '@safescript/shared';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import { Step2PatientAssessmentOptionA } from './step2-patient-assessment-option-a';
import { Step2CurrentMedicationExperience } from './step2-current-medication-experience';

export interface Step2PatientAssessmentProps {
  consultationId: string;
  /** Step 1 payload — used to autofill conditions + current medication. */
  step1?: AdaptStepOne | null;
  initialStep2A?: AdaptStepTwoOptionA;
  initialStep2B?: AdaptStepTwoOptionB;
  initialStep2C?: AdaptStepTwoOptionC;
  defaultPrescriptionText?: string;
  jurisdiction: string;
  onSaveStep2A: (step2A: AdaptStepTwoOptionA) => Promise<void> | void;
  onSaveStep2B: (step2B: AdaptStepTwoOptionB) => Promise<void> | void;
  onSaveStep2C: (step2C: AdaptStepTwoOptionC) => Promise<void> | void;
  onBackToPrescriptionAndReason: () => void;
  onConfirmPatientAssessment: (
    step2A: AdaptStepTwoOptionA,
    step2B: AdaptStepTwoOptionB,
    step2C: AdaptStepTwoOptionC,
  ) => void;
}

export function Step2PatientAssessment({
  consultationId,
  step1,
  initialStep2A,
  initialStep2B,
  initialStep2C,
  defaultPrescriptionText,
  jurisdiction,
  onSaveStep2A,
  onSaveStep2B,
  onSaveStep2C,
  onBackToPrescriptionAndReason,
  onConfirmPatientAssessment,
}: Step2PatientAssessmentProps) {
  const prefilled = useMemo(
    () =>
      prefillAdaptStep2AFromStep1(
        initialStep2A ?? emptyAdaptStepTwoOptionA(),
        step1 ?? null,
      ),
    [consultationId, initialStep2A, step1],
  );

  const [currentStep2A, setCurrentStep2A] = useState<AdaptStepTwoOptionA | undefined>(
    prefilled.step2A,
  );

  const persistedPrefillRef = useRef(false);
  useEffect(() => {
    if (persistedPrefillRef.current || !prefilled.changed) return;
    persistedPrefillRef.current = true;
    void onSaveStep2A(prefilled.step2A);
  }, [onSaveStep2A, prefilled.changed, prefilled.step2A]);
  const [currentStep2B, setCurrentStep2B] = useState<AdaptStepTwoOptionB | undefined>(
    initialStep2B,
  );
  const [currentStep2C, setCurrentStep2C] = useState<AdaptStepTwoOptionC>(
    () => initialStep2C ?? emptyAdaptStepTwoOptionC(),
  );

  const section2ARef = useRef<HTMLDivElement | null>(null);
  const section2BRef = useRef<HTMLDivElement | null>(null);

  const [activeAccordion, setActiveAccordion] = useState<'2A' | '2B' | null>(() => {
    if (initialStep2A?.confirmed && !initialStep2B?.confirmed) {
      return '2B';
    }
    return '2A';
  });

  const scrollTo = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => {
      if (ref.current) {
        scrollConsultChildIntoView(ref.current, {
          behavior: 'smooth',
          block: 'start',
          offset: 16,
        });
      }
    }, 60);
  }, []);

  const handleSave2A = useCallback(
    async (step2A: AdaptStepTwoOptionA) => {
      setCurrentStep2A(step2A);
      await onSaveStep2A(step2A);
    },
    [onSaveStep2A],
  );

  const handleSave2C = useCallback(
    async (step2C: AdaptStepTwoOptionC) => {
      setCurrentStep2C(step2C);
      await onSaveStep2C(step2C);
    },
    [onSaveStep2C],
  );

  const handleConfirm2A = useCallback(
    async (step2A: AdaptStepTwoOptionA, step2C: AdaptStepTwoOptionC) => {
      setCurrentStep2A(step2A);
      setCurrentStep2C(step2C);
      await onSaveStep2A(step2A);
      await onSaveStep2C(step2C);
      setActiveAccordion('2B');
      scrollTo(section2BRef);
    },
    [onSaveStep2A, onSaveStep2C, scrollTo],
  );

  const handleSave2B = useCallback(
    async (step2B: AdaptStepTwoOptionB) => {
      setCurrentStep2B(step2B);
      await onSaveStep2B(step2B);
    },
    [onSaveStep2B],
  );

  const handleBackTo2A = useCallback(() => {
    setActiveAccordion('2A');
    scrollTo(section2ARef);
  }, [scrollTo]);

  const handleConfirm2B = useCallback(
    async (step2B: AdaptStepTwoOptionB) => {
      setCurrentStep2B(step2B);
      await onSaveStep2B(step2B);
      if (currentStep2A) {
        onConfirmPatientAssessment(currentStep2A, step2B, currentStep2C);
      }
    },
    [currentStep2A, currentStep2C, onConfirmPatientAssessment, onSaveStep2B],
  );

  const is2AComplete = Boolean(
    currentStep2A?.confirmed ||
      (currentStep2A?.demographics?.dateOfBirth &&
        (currentStep2A?.background?.allergiesNone ||
          (currentStep2A?.background?.allergyEntries?.length ?? 0) > 0)),
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBackToPrescriptionAndReason}
        className="group inline-flex items-center gap-1 text-xs font-semibold text-[#52677a] transition-colors hover:text-[#0F6F6B]"
      >
        <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Prescription &amp; Reason</span>
      </button>

      <Step2PatientAssessmentOptionA
        key={`${consultationId}-step2A`}
        consultationId={consultationId}
        initialStep2A={currentStep2A}
        initialStep2C={currentStep2C}
        jurisdiction={jurisdiction}
        isOpen={activeAccordion === '2A'}
        onToggleOpen={() => setActiveAccordion((prev) => (prev === '2A' ? null : '2A'))}
        sectionRef={section2ARef}
        hideTopHeader={true}
        onSaveStep2A={handleSave2A}
        onSaveStep2C={handleSave2C}
        onBackToPrescriptionAndReason={onBackToPrescriptionAndReason}
        onConfirmPatientInfo={handleConfirm2A}
      />

      <Step2CurrentMedicationExperience
        key={`${consultationId}-step2B`}
        consultationId={consultationId}
        initialStep2B={currentStep2B}
        defaultPrescriptionText={defaultPrescriptionText}
        isOpen={activeAccordion === '2B'}
        isLocked={!is2AComplete}
        onToggleOpen={() => {
          if (!is2AComplete) return;
          setActiveAccordion((prev) => (prev === '2B' ? null : '2B'));
        }}
        sectionRef={section2BRef}
        onSaveStep2B={handleSave2B}
        onBackToPatientInfo={handleBackTo2A}
        onConfirmExperience={handleConfirm2B}
      />
    </div>
  );
}
