'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  PanelLeftOpen,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ConsultationHistorySidebar,
  ACTIVE_CONSULTATIONS_SIDEBAR_WIDTH,
} from '@/features/consultations/active-consultations-sidebar';
import {
  CONSULT_SIDEBAR_EVENT,
  WORKSPACE_FLUSH_EVENT,
  readConsultSidebarOpen,
  setConsultSidebarOpen,
} from '@/features/consultations/consult-sidebar-state';
import { useQueryClient } from '@tanstack/react-query';
import {
  consultationKeys,
  useActiveConsultations,
  useConsultation,
  useSaveStep,
} from '@/features/consultations/hooks';
import { useLeaveClosedWorkspace } from '@/features/consultations/use-leave-closed-workspace';
import { WizardLeaveContext, type BeforeLeaveFn } from '@/features/consultations/wizard-nav';
import { purgeConsultationLocalState } from '@/features/consultations/purge-consultation-local-state';
import { Step9Documentation } from '@/features/consultations/steps/step9-documentation';
import { cn } from '@/lib/utils';
import {
  ADAPT_UI_STEPS,
  parseAdaptPayload,
  emptyAdaptStepTwoOptionC,
  type AdaptPayload,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
  type AdaptStepTwoOptionC,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type AdaptUIStepId,
} from '@safescript/shared';
import { AdaptStepper } from './adapt-stepper';
import { Step1PrescriptionAndReason } from './steps/step1-prescription-and-reason';
import { Step2PatientAssessment } from './steps/step2-patient-assessment';
import { Step3ProposedAdaptationContainer } from './steps/step3-proposed-adaptation-container';
import {
  adaptDocumentationHydrationPayload,
  projectAdaptConsultationForDocumentation,
} from './project-adapt-for-documentation';
import { readAdaptDraft, writeAdaptDraft } from './format';
import { isAdaptModuleEnabled } from '@/lib/adapt-enabled';
import { consultationsBasePath } from '@/features/consultations/consultations-base-path';
import { useAuthStore } from '@/features/auth/auth-store';
import type { CounsellingPlan } from '@/features/consultations/counselling-panel-model';

interface Props {
  consultationId: string;
  backHref: string;
}

export function AdaptConsultationWizard({ consultationId, backHref }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading } = useConsultation(consultationId);
  const [pendingCounsellingPlan, setPendingCounsellingPlan] = useState<CounsellingPlan | null>(
    null,
  );

  useEffect(() => {
    if (!isAdaptModuleEnabled()) {
      router.replace(consultationsBasePath(role));
    }
  }, [router, role]);

  const lastConsultationRef = useRef<{ id: string; value: NonNullable<typeof data> } | null>(null);
  if (data?.id === consultationId) {
    lastConsultationRef.current = { id: consultationId, value: data };
  }
  const consultation =
    data?.id === consultationId
      ? data
      : lastConsultationRef.current?.id === consultationId
        ? lastConsultationRef.current.value
        : undefined;

  const leavingClosed = useLeaveClosedWorkspace(
    consultation?.status,
    Boolean(consultation),
    backHref,
  );

  const [currentUIStep, setCurrentUIStep] = useState<AdaptUIStepId>('PRESCRIPTION_AND_REASON');
  const [completedUISteps, setCompletedUISteps] = useState<Set<number>>(new Set());
  const [farthestUIIndex, setFarthestUIIndex] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [jurisdiction, setJurisdiction] = useState('AB');

  const { data: activeQueue } = useActiveConsultations({
    enabled: !historyOpen,
    module: 'adapt',
  });
  const hiddenQueueCount = activeQueue?.count ?? 0;
  const beforeLeaveRef = useRef<BeforeLeaveFn | null>(null);

  const registerBeforeLeave = useCallback((fn: BeforeLeaveFn | null) => {
    beforeLeaveRef.current = fn;
  }, []);

  useEffect(() => {
    setHistoryOpen(readConsultSidebarOpen());
    const onRailChange = (e: Event) => {
      const detail = (e as CustomEvent<{ open: boolean }>).detail;
      if (typeof detail?.open === 'boolean') {
        setHistoryOpen(detail.open);
      } else {
        setHistoryOpen(readConsultSidebarOpen());
      }
    };
    window.addEventListener(CONSULT_SIDEBAR_EVENT, onRailChange);
    return () => window.removeEventListener(CONSULT_SIDEBAR_EVENT, onRailChange);
  }, []);

  const runBeforeLeave = useCallback(async () => {
    try {
      await beforeLeaveRef.current?.();
    } catch {
      /* best effort */
    }
  }, []);

  useEffect(() => {
    const flush = () => {
      void beforeLeaveRef.current?.();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener(WORKSPACE_FLUSH_EVENT, flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener(WORKSPACE_FLUSH_EVENT, flush);
      flush();
    };
  }, []);

  const handleSaveAndExit = async () => {
    await runBeforeLeave();
    router.replace(backHref);
  };

  const currentStepObj = ADAPT_UI_STEPS.find((s) => s.id === currentUIStep) ?? ADAPT_UI_STEPS[0]!;

  const goNext = useCallback(() => {
    const fromIdx = ADAPT_UI_STEPS.findIndex((s) => s.id === currentUIStep);
    if (fromIdx < 0 || fromIdx >= ADAPT_UI_STEPS.length - 1) return;
    const next = ADAPT_UI_STEPS[fromIdx + 1]!;
    setCompletedUISteps((prev) => {
      const copy = new Set(prev);
      copy.add(fromIdx);
      return copy;
    });
    setFarthestUIIndex((prev) => Math.max(prev, fromIdx + 1));
    setCurrentUIStep(next.id);
    setLastSaved(new Date());
  }, [currentUIStep]);

  const navigateToIndex = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= ADAPT_UI_STEPS.length) return;
      if (idx > farthestUIIndex) return;
      const target = ADAPT_UI_STEPS[idx];
      if (!target || target.id === currentUIStep) return;
      await runBeforeLeave();
      setCurrentUIStep(target.id);
    },
    [currentUIStep, farthestUIIndex, runBeforeLeave],
  );

  const saveStepMutation = useSaveStep(consultationId);

  const handleSaveStep2A = useCallback(
    async (step2A: AdaptStepTwoOptionA) => {
      const current =
        readAdaptDraft(consultationId, jurisdiction) ??
        parseAdaptPayload(consultation?.renewPayload, jurisdiction);
      const updated: AdaptPayload = {
        ...current,
        step2A,
      };
      writeAdaptDraft(consultationId, updated);
      setLastSaved(new Date());

      try {
        await saveStepMutation.mutateAsync({
          stepIndex: 1,
          currentStep: 'PATIENT_ASSESSMENT',
          data: {
            renewPayload: updated,
            demographics: {
              dateOfBirth: step2A.demographics.dateOfBirth,
              dateOfBirthUnavailable: step2A.demographics.dateOfBirthUnavailable,
              age: step2A.demographics.age,
              ageUnit: step2A.demographics.ageUnit,
              sex: step2A.demographics.sex,
              pregnancyStatus: step2A.demographics.pregnancyStatus,
              breastfeedingStatus: step2A.demographics.breastfeedingStatus,
              allergiesNone: step2A.background.allergiesNone,
              allergyEntries: step2A.background.allergyEntries,
              medsNone: step2A.background.medsNone,
              medicationEntries: step2A.background.medicationEntries,
              conditionsNone: step2A.background.conditionsNone,
              conditions: step2A.background.conditions,
              smokingStatus: step2A.background.lifestyle?.smokingStatus,
              alcoholUse: step2A.background.lifestyle?.alcoholUse,
              drugUse: step2A.background.lifestyle?.drugUse,
              lifestyleAssessed: step2A.background.lifestyle?.assessed,
              additionalHistory: step2A.background.additionalHistory,
            },
          },
        });
      } catch {
        /* best effort */
      }
    },
    [consultationId, jurisdiction, consultation?.renewPayload, saveStepMutation],
  );

  const handleSaveStep2B = useCallback(
    async (step2B: AdaptStepTwoOptionB) => {
      const current =
        readAdaptDraft(consultationId, jurisdiction) ??
        parseAdaptPayload(consultation?.renewPayload, jurisdiction);
      const updated: AdaptPayload = {
        ...current,
        step2B,
      };
      writeAdaptDraft(consultationId, updated);
      setLastSaved(new Date());

      try {
        await saveStepMutation.mutateAsync({
          stepIndex: 1,
          currentStep: 'PATIENT_ASSESSMENT',
          data: {
            renewPayload: updated,
            currentMedicationExperience: {
              isTakingMedication: step2B.isTakingMedication,
              currentUse: step2B.currentUse,
              duration: step2B.duration,
              effectiveness: step2B.effectiveness,
              adverseEffects: step2B.adverseEffects,
              adverseEffectsDescription: step2B.adverseEffectsDescription,
              adherence: step2B.adherence,
              adherenceDescription: step2B.adherenceDescription,
              patientGoals: step2B.patientGoals,
            },
          },
        });
      } catch {
        /* best effort */
      }
    },
    [consultationId, jurisdiction, consultation?.renewPayload, saveStepMutation],
  );

  const handleSaveStep2C = useCallback(
    async (step2C: AdaptStepTwoOptionC) => {
      const current =
        readAdaptDraft(consultationId, jurisdiction) ??
        parseAdaptPayload(consultation?.renewPayload, jurisdiction);
      const updated: AdaptPayload = {
        ...current,
        step2C,
      };
      writeAdaptDraft(consultationId, updated);
      setLastSaved(new Date());

      try {
        await saveStepMutation.mutateAsync({
          stepIndex: 1,
          currentStep: 'PATIENT_ASSESSMENT',
          data: {
            renewPayload: updated,
            demographics: {
              labValues: step2C.labValues,
              extractedLabValues: step2C.extractedLabValues,
              height: step2C.height,
              weight: step2C.weight,
              bmi: step2C.bmi,
              pulse: step2C.pulse,
              bloodPressureSystolic: step2C.bloodPressureSystolic,
              bloodPressureDiastolic: step2C.bloodPressureDiastolic,
              measurementDate: step2C.measurementDate,
            },
          },
        });
      } catch {
        /* best effort */
      }
    },
    [consultationId, jurisdiction, consultation?.renewPayload, saveStepMutation],
  );

  const defaultPrescriptionText = useMemo(() => {
    const payload =
      readAdaptDraft(consultationId, jurisdiction) ??
      parseAdaptPayload(consultation?.renewPayload, jurisdiction);
    const rx = payload.step1?.originalPrescription;
    if (!rx) return '';
    const med =
      rx.normalized?.genericName || rx.normalized?.brandName || rx.raw?.medicationText || '';
    const strength = rx.normalized?.strength || '';
    const directions = rx.normalized?.directions || rx.raw?.directionsText || '';
    return [med, strength, directions].filter(Boolean).join(' ');
  }, [consultationId, jurisdiction, consultation?.renewPayload]);

  const initialStep2C = useMemo((): AdaptStepTwoOptionC => {
    const fromDraft =
      readAdaptDraft(consultationId, jurisdiction)?.step2C ??
      parseAdaptPayload(consultation?.renewPayload, jurisdiction).step2C ??
      emptyAdaptStepTwoOptionC();
    const hasPayloadLabs = Boolean(
      fromDraft.labValues?.trim() ||
        (fromDraft.extractedLabValues?.length ?? 0) > 0 ||
        fromDraft.height?.trim() ||
        fromDraft.weight?.trim() ||
        fromDraft.pulse?.trim() ||
        fromDraft.bloodPressureSystolic?.trim() ||
        fromDraft.bloodPressureDiastolic?.trim() ||
        fromDraft.confirmed ||
        fromDraft.skipped,
    );
    if (hasPayloadLabs) return fromDraft;

    const demo = consultation?.demographics;
    if (!demo) return fromDraft;

    const extracted = Array.isArray(demo.extractedLabValues)
      ? demo.extractedLabValues.map((v) => ({
          test: v.test,
          value: v.value,
          unit: v.unit,
          referenceRange: v.referenceRange,
          observedDate: v.observedDate,
          confidence: typeof v.confidence === 'number' ? v.confidence : 80,
          needsReview: Boolean(v.needsReview),
        }))
      : [];

    return {
      ...fromDraft,
      labValues: demo.labValues ?? '',
      extractedLabValues: extracted,
      height: demo.height ?? '',
      weight: demo.weight ?? '',
      bmi: demo.bmi ?? '',
      pulse: demo.pulse ?? '',
      bloodPressureSystolic: demo.bloodPressureSystolic ?? '',
      bloodPressureDiastolic: demo.bloodPressureDiastolic ?? '',
      measurementDate: demo.measurementDate ?? '',
    };
  }, [
    consultationId,
    jurisdiction,
    consultation?.renewPayload,
    consultation?.demographics,
  ]);

  const handleSaveStep3A = useCallback(
    async (step3A: AdaptStepThreeOptionA) => {
      const current =
        readAdaptDraft(consultationId, jurisdiction) ??
        parseAdaptPayload(consultation?.renewPayload, jurisdiction);
      const updated: AdaptPayload = {
        ...current,
        step3A,
      };
      writeAdaptDraft(consultationId, updated);
      setLastSaved(new Date());

      try {
        await saveStepMutation.mutateAsync({
          stepIndex: 2,
          currentStep: 'PROPOSED_ADAPTATION',
          data: {
            renewPayload: updated,
            proposedAdaptation: step3A,
          },
        });
      } catch {
        /* best effort */
      }
    },
    [consultationId, jurisdiction, consultation?.renewPayload, saveStepMutation],
  );

  const handleSaveStep3B = useCallback(
    async (step3B: AdaptStepThreeOptionB) => {
      const current =
        readAdaptDraft(consultationId, jurisdiction) ??
        parseAdaptPayload(consultation?.renewPayload, jurisdiction);
      const updated: AdaptPayload = {
        ...current,
        step3B,
      };
      writeAdaptDraft(consultationId, updated);
      setLastSaved(new Date());

      try {
        await saveStepMutation.mutateAsync({
          stepIndex: 2,
          currentStep: 'PROPOSED_ADAPTATION',
          data: {
            renewPayload: updated,
            clinicalSafetyCheck: step3B,
          },
        });
      } catch {
        /* best effort */
      }
    },
    [consultationId, jurisdiction, consultation?.renewPayload, saveStepMutation],
  );

  const handleDocsSubmitted = useCallback(
    (nextConsultationId?: string) => {
      purgeConsultationLocalState(consultationId);
      qc.removeQueries({ queryKey: consultationKeys.detail(consultationId) });
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
      lastConsultationRef.current = null;
      setCompletedUISteps((prev) => new Set([...prev, 3]));
      if (nextConsultationId) {
        router.replace(`${backHref}/${nextConsultationId}`);
        return;
      }
      router.replace(backHref);
    },
    [backHref, consultationId, qc, router],
  );

  const documentationConsultation = useMemo(() => {
    if (!consultation) return null;
    return projectAdaptConsultationForDocumentation(consultation, {
      jurisdiction,
      counsellingPlan: pendingCounsellingPlan,
    });
  }, [consultation, jurisdiction, pendingCounsellingPlan]);

  if (!isAdaptModuleEnabled()) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2.5 bg-consult-workspace">
        <p className="text-sm text-muted-foreground">Adapt is not available in this environment.</p>
      </div>
    );
  }

  if (leavingClosed || (isLoading && !consultation)) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2.5 bg-consult-workspace">
        <Loader2 className="h-6 w-6 animate-spin text-[#0F6F6B]" />
        <p className="text-sm text-muted-foreground">
          {leavingClosed ? 'Opening workspace…' : 'Loading adapt workspace…'}
        </p>
      </div>
    );
  }

  return (
    <WizardLeaveContext.Provider value={registerBeforeLeave}>
      <div
        data-consult-shell
        className="flex h-full min-h-0 flex-1 overflow-hidden bg-background"
      >
        {/* Collapsible Active Queue Drawer */}
        <div
          className={cn(
            'z-30 hidden min-h-0 shrink-0 self-stretch overflow-hidden transition-[width] duration-200 ease-out lg:flex lg:flex-col',
            !historyOpen && 'pointer-events-none',
          )}
          style={{ width: historyOpen ? ACTIVE_CONSULTATIONS_SIDEBAR_WIDTH : 0 }}
          aria-hidden={!historyOpen}
        >
          <ConsultationHistorySidebar
            activeId={consultationId}
            basePath={backHref}
            expanded
            module="adapt"
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-consult-divider/60 bg-consult-workspace">
            <header
              className={cn(
                'flex h-9 w-full items-center gap-3 px-5',
                historyOpen ? 'justify-end' : 'justify-between',
              )}
            >
              {!historyOpen ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConsultSidebarOpen(true)}
                  className="hidden h-7 gap-1.5 px-2 -ml-2 text-xs text-muted-foreground lg:inline-flex"
                  aria-label="Show active consultations"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                  Consultations
                  {hiddenQueueCount > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0F6F6B] px-1 text-[10px] font-semibold leading-none text-white">
                      {hiddenQueueCount > 99 ? '99+' : hiddenQueueCount}
                    </span>
                  ) : null}
                </Button>
              ) : null}

              <div className="flex min-w-0 items-center gap-2.5">
                <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">
                  Adapt
                </span>
                <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                  {consultation?.consultationRef}
                </span>
                {lastSaved ? (
                  <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Saved{' '}
                    {lastSaved.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                ) : null}
                <div className="flex items-center gap-1 rounded-full border border-[#d9e4e8] bg-[#f7fbfb] px-2.5 py-0.5 text-[10px] font-semibold text-[#102a43]">
                  <span>{jurisdiction}</span>
                  <ChevronDown className="h-3 w-3 text-[#8a9aa3]" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveAndExit}
                  className="h-7 gap-1.5 px-2 text-xs font-medium text-[#52677a] hover:bg-[#f4f8f8] hover:text-[#102a43]"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save and exit
                </Button>
              </div>
            </header>
          </div>

          <div
            data-consult-scroll
            className="consult-workspace min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="adapt-shell space-y-7">
              <AdaptStepper
                currentUIStep={currentUIStep}
                completedUISteps={completedUISteps}
                maxClickableIndex={farthestUIIndex}
                onStepClick={(_, idx) => void navigateToIndex(idx)}
                className="w-full"
              />

              {currentUIStep !== 'DOCUMENTS_AND_COMPLETE' ? (
                <div className="min-w-0">
                  {currentUIStep === 'PRESCRIPTION_AND_REASON' ? (
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6e7e8f]">
                      Adapt prescription
                    </p>
                  ) : null}
                  <h1 className={cn(
                    'text-[32px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#172337]',
                    currentUIStep === 'PRESCRIPTION_AND_REASON' ? 'mt-2' : '',
                  )}>
                    {currentStepObj.pageTitle}
                  </h1>
                  <p className="mt-2 text-[18px] font-semibold leading-snug text-[#172337]">
                    {currentStepObj.stepSubtitle}
                  </p>
                  <p className="mt-1.5 text-[15px] leading-6 text-[#617184]">
                    {currentStepObj.description}
                  </p>
                </div>
              ) : null}

              {currentUIStep === 'PRESCRIPTION_AND_REASON' ? (
                <Step1PrescriptionAndReason
                  key={consultationId}
                  consultationId={consultationId}
                  initialPayload={consultation?.renewPayload}
                  jurisdiction={jurisdiction}
                  onSaved={() => setLastSaved(new Date())}
                  onBackToDashboard={() => router.replace(backHref)}
                  onContinueToPatientAssessment={goNext}
                />
              ) : currentUIStep === 'PATIENT_ASSESSMENT' ? (
                <Step2PatientAssessment
                  key={`${consultationId}-step2`}
                  consultationId={consultationId}
                  step1={
                    readAdaptDraft(consultationId, jurisdiction)?.step1 ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step1
                  }
                  initialStep2A={
                    readAdaptDraft(consultationId, jurisdiction)?.step2A ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step2A
                  }
                  initialStep2B={
                    readAdaptDraft(consultationId, jurisdiction)?.step2B ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step2B
                  }
                  initialStep2C={initialStep2C}
                  defaultPrescriptionText={defaultPrescriptionText}
                  jurisdiction={jurisdiction}
                  onSaveStep2A={handleSaveStep2A}
                  onSaveStep2B={handleSaveStep2B}
                  onSaveStep2C={handleSaveStep2C}
                  onBackToPrescriptionAndReason={() => setCurrentUIStep('PRESCRIPTION_AND_REASON')}
                  onConfirmPatientAssessment={async (saved2A, saved2B, saved2C) => {
                    const current =
                      readAdaptDraft(consultationId, jurisdiction) ??
                      parseAdaptPayload(consultation?.renewPayload, jurisdiction);
                    const updated: AdaptPayload = {
                      ...current,
                      step2A: saved2A,
                      step2B: saved2B,
                      step2C: saved2C,
                    };
                    writeAdaptDraft(consultationId, updated);
                    setLastSaved(new Date());
                    setCompletedUISteps((prev) => new Set([...prev, 1]));

                    try {
                      await saveStepMutation.mutateAsync({
                        stepIndex: 1,
                        currentStep: 'PATIENT_ASSESSMENT',
                        data: {
                          renewPayload: updated,
                          demographics: {
                            dateOfBirth: saved2A.demographics.dateOfBirth,
                            dateOfBirthUnavailable: saved2A.demographics.dateOfBirthUnavailable,
                            age: saved2A.demographics.age,
                            ageUnit: saved2A.demographics.ageUnit,
                            sex: saved2A.demographics.sex,
                            pregnancyStatus: saved2A.demographics.pregnancyStatus,
                            breastfeedingStatus: saved2A.demographics.breastfeedingStatus,
                            allergiesNone: saved2A.background.allergiesNone,
                            allergyEntries: saved2A.background.allergyEntries,
                            medsNone: saved2A.background.medsNone,
                            medicationEntries: saved2A.background.medicationEntries,
                            conditionsNone: saved2A.background.conditionsNone,
                            conditions: saved2A.background.conditions,
                            smokingStatus: saved2A.background.lifestyle?.smokingStatus,
                            alcoholUse: saved2A.background.lifestyle?.alcoholUse,
                            drugUse: saved2A.background.lifestyle?.drugUse,
                            lifestyleAssessed: saved2A.background.lifestyle?.assessed,
                            additionalHistory: saved2A.background.additionalHistory,
                            labValues: saved2C.labValues,
                            extractedLabValues: saved2C.extractedLabValues,
                            height: saved2C.height,
                            weight: saved2C.weight,
                            bmi: saved2C.bmi,
                            pulse: saved2C.pulse,
                            bloodPressureSystolic: saved2C.bloodPressureSystolic,
                            bloodPressureDiastolic: saved2C.bloodPressureDiastolic,
                            measurementDate: saved2C.measurementDate,
                          },
                          currentMedicationExperience: {
                            isTakingMedication: saved2B.isTakingMedication,
                            currentUse: saved2B.currentUse,
                            duration: saved2B.duration,
                            effectiveness: saved2B.effectiveness,
                            adverseEffects: saved2B.adverseEffects,
                            adverseEffectsDescription: saved2B.adverseEffectsDescription,
                            adherence: saved2B.adherence,
                            adherenceDescription: saved2B.adherenceDescription,
                            patientGoals: saved2B.patientGoals,
                          },
                        },
                      });
                    } catch {
                      /* best effort */
                    }

                    goNext();
                  }}
                />
              ) : currentUIStep === 'PROPOSED_ADAPTATION' ? (
                <Step3ProposedAdaptationContainer
                  key={`${consultationId}-step3`}
                  consultationId={consultationId}
                  consultation={consultation!}
                  step1={
                    readAdaptDraft(consultationId, jurisdiction)?.step1 ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step1
                  }
                  step2A={
                    readAdaptDraft(consultationId, jurisdiction)?.step2A ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step2A
                  }
                  step2B={
                    readAdaptDraft(consultationId, jurisdiction)?.step2B ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step2B
                  }
                  step2C={
                    readAdaptDraft(consultationId, jurisdiction)?.step2C ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step2C
                  }
                  initialStep3A={
                    readAdaptDraft(consultationId, jurisdiction)?.step3A ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step3A
                  }
                  initialStep3B={
                    readAdaptDraft(consultationId, jurisdiction)?.step3B ??
                    parseAdaptPayload(consultation?.renewPayload, jurisdiction).step3B
                  }
                  jurisdiction={jurisdiction}
                  onSaveStep3A={handleSaveStep3A}
                  onSaveStep3B={handleSaveStep3B}
                  onBackToPatientAssessment={() => setCurrentUIStep('PATIENT_ASSESSMENT')}
                  onChangeAdaptationType={() => {
                    const current =
                      readAdaptDraft(consultationId, jurisdiction) ??
                      parseAdaptPayload(consultation?.renewPayload, jurisdiction);
                    writeAdaptDraft(consultationId, {
                      ...current,
                      step3A: undefined,
                      step3B: undefined,
                    });
                    setCurrentUIStep('PRESCRIPTION_AND_REASON');
                  }}
                  continueLoading={saveStepMutation.isPending}
                  onContinueToDocuments={async ({
                    step3A,
                    step3B,
                    counsellingPlan,
                  }) => {
                    const current =
                      readAdaptDraft(consultationId, jurisdiction) ??
                      parseAdaptPayload(consultation?.renewPayload, jurisdiction);
                    const updated: AdaptPayload = {
                      ...current,
                      step3A: step3A ?? current.step3A,
                      step3B,
                    };
                    writeAdaptDraft(consultationId, updated);
                    setPendingCounsellingPlan(counsellingPlan);
                    setLastSaved(new Date());
                    setCompletedUISteps((prev) => new Set([...prev, 2]));

                    try {
                      const hydration = adaptDocumentationHydrationPayload(
                        {
                          ...(consultation as NonNullable<typeof consultation>),
                          renewPayload: updated as unknown as Record<string, unknown>,
                        },
                        counsellingPlan,
                        jurisdiction,
                      );
                      await saveStepMutation.mutateAsync({
                        stepIndex: 2,
                        currentStep: 'PROPOSED_ADAPTATION',
                        data: {
                          renewPayload: updated,
                          clinicalSafetyCheck: step3B,
                          treatmentPlan: hydration.treatmentPlan,
                          counsellingNotes: hydration.counsellingNotes,
                          demographics: hydration.demographics,
                          chiefComplaint: hydration.chiefComplaint,
                        },
                      });
                      await qc.invalidateQueries({
                        queryKey: consultationKeys.detail(consultationId),
                      });
                    } catch {
                      /* best effort — docs step still projects from renewPayload */
                    }

                    goNext();
                  }}
                />
              ) : currentUIStep === 'DOCUMENTS_AND_COMPLETE' && documentationConsultation ? (
                <Step9Documentation
                  key={`${consultationId}-docs`}
                  consultation={documentationConsultation}
                  onBack={() => setCurrentUIStep('PROPOSED_ADAPTATION')}
                  backLabel="Back to Proposed Adaptation"
                  onSubmitted={handleDocsSubmitted}
                  persistStep={{
                    stepIndex: 3,
                    currentStep: 'DOCUMENTS_AND_COMPLETE',
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </WizardLeaveContext.Provider>
  );
}
