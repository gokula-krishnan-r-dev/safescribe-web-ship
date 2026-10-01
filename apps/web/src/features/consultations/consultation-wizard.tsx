'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { ConsultationStepper } from './consultation-stepper';
import { ConversationSummaryBar } from './conversation-summary-bar';
import { ConsultationHistorySidebar } from './consultation-history-sidebar';
import { ACTIVE_CONSULTATIONS_SIDEBAR_WIDTH } from './active-consultations-sidebar';
import { Step1PresentingComplaint } from './steps/step1-presenting-complaint';
import { Step2PathwaySelection } from './steps/step2-pathway-selection';
import { StepPatientAssessment } from './steps/step3-patient-assessment';
import { StepClinicalAssessment } from './steps/step-clinical-assessment';
import { StepPrescribingReadiness } from './steps/step-prescribing-readiness';
import { StepTreatmentRationale } from './steps/step-treatment-rationale';
import { Step5RedFlags } from './steps/step5-red-flags';
import { StepAiRedFlagCheck } from './steps/step-ai-red-flag-check';
import { Step7Treatment } from './steps/step7-treatment';
import { Step9Documentation } from './steps/step9-documentation';
import { useActiveConsultations, useConsultation, consultationKeys } from './hooks';
import { useLeaveClosedWorkspace } from './use-leave-closed-workspace';
import { purgeConsultationLocalState } from './purge-consultation-local-state';
import {
  CONSULT_SIDEBAR_EVENT,
  readConsultSidebarOpen,
  setConsultSidebarOpen,
} from './consult-sidebar-state';
import {
  getUISteps,
  type UIStepId,
  dbStepToUIStepId,
  dbStepToUIIndex,
  isClinicalJudgmentMode,
  type ConsultationStep,
  type ConsultationMode,
} from './types';
import { StepErrorBoundary } from './step-error-boundary';
import { WizardLeaveContext, type BeforeLeaveFn } from './wizard-nav';
import { lockConsultPageScroll } from './clinical-section-scroll';
import { cn } from '@/lib/utils';

interface Props {
  consultationId: string;
  backHref: string;
}

/** Options when advancing the wizard after an approach choice. */
export type WizardNextOptions = {
  /**
   * Approach just selected on this transition. Required so the next step is
   * resolved against the *new* mode before TanStack Query refetches.
   */
  approachMode?: ConsultationMode;
  /** Explicit landing step (wins over sequential next). */
  targetStep?: UIStepId | string;
};

export function ConsultationWizard({ consultationId, backHref }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useConsultation(consultationId);
  const lastConsultationRef = useRef<{ id: string; value: NonNullable<typeof data> } | null>(
    null,
  );
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

  useEffect(() => {
    if (consultation?.module === 'renew') {
      router.replace(`${backHref.replace(/\/consultations$/, '/renew')}/${consultationId}`);
    }
  }, [consultation?.module, consultationId, backHref, router]);

  const [currentUIStep, setCurrentUIStep] = useState<UIStepId>('PRESENTING_COMPLAINT');
  const [completedUISteps, setCompletedUISteps] = useState<Set<number>>(new Set());
  /** Highest step index the pharmacist has reached — stays clickable after going back. */
  const [farthestUIIndex, setFarthestUIIndex] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const { data: activeQueue } = useActiveConsultations({ enabled: !historyOpen });
  const hiddenQueueCount = activeQueue?.count ?? 0;
  /** Optimistic mode for step list right after approach selection (before cache refresh). */
  const [pendingMode, setPendingMode] = useState<ConsultationMode | null>(null);

  const hasInitialized = useRef(false);
  const beforeLeaveRef = useRef<BeforeLeaveFn | null>(null);
  const registerBeforeLeave = useCallback((fn: BeforeLeaveFn | null) => {
    beforeLeaveRef.current = fn;
  }, []);

  const effectiveMode = pendingMode ?? consultation?.consultationMode ?? null;

  const uiSteps = useMemo(
    () => getUISteps(effectiveMode),
    [effectiveMode],
  );

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

  useEffect(() => lockConsultPageScroll(), []);

  // Fresh wizard state when opening a different consultation
  useEffect(() => {
    hasInitialized.current = false;
    setCurrentUIStep('PRESENTING_COMPLAINT');
    setCompletedUISteps(new Set());
    setFarthestUIIndex(0);
    setLastSaved(null);
    setPendingMode(null);
  }, [consultationId]);

  useEffect(() => {
    if (consultation && !hasInitialized.current) {
      hasInitialized.current = true;
      const mode = consultation.consultationMode;
      const uiStep = dbStepToUIStepId(consultation.currentStep as ConsultationStep, mode);
      const uiIdx = Math.max(
        0,
        dbStepToUIIndex(consultation.currentStep as ConsultationStep, mode),
      );
      setCurrentUIStep(uiStep);
      setFarthestUIIndex(uiIdx);
      const done = new Set<number>();
      for (let i = 0; i < uiIdx; i++) done.add(i);
      setCompletedUISteps(done);
    }
  }, [consultation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear optimistic mode once server catches up
  useEffect(() => {
    if (
      pendingMode &&
      consultation?.consultationMode &&
      consultation.consultationMode === pendingMode
    ) {
      setPendingMode(null);
    }
  }, [consultation?.consultationMode, pendingMode]);

  /**
   * Viewing step is pharmacist-controlled after first resume.
   * Server `currentStep` is furthest progress, not the pane on screen.
   * Never snap the UI forward/back except referral lock or an invalid step id.
   */
  useEffect(() => {
    if (!consultation || !hasInitialized.current) return;

    if (consultation.consultationMode === 'DOCUMENTATION_REFERRAL') {
      if (currentUIStep !== 'DOCUMENTATION') {
        setCurrentUIStep('DOCUMENTATION');
      }
      return;
    }

    const mode = consultation.consultationMode;
    const steps = getUISteps(mode);
    if (!steps.some((s) => s.id === currentUIStep)) {
      const fallback = dbStepToUIStepId(
        consultation.currentStep as ConsultationStep,
        mode,
      );
      const fallbackIdx = dbStepToUIIndex(
        consultation.currentStep as ConsultationStep,
        mode,
      );
      setCurrentUIStep(fallback);
      setFarthestUIIndex((prev) => Math.max(prev, fallbackIdx));
      setCompletedUISteps(() => {
        const next = new Set<number>();
        for (let i = 0; i < fallbackIdx; i++) next.add(i);
        return next;
      });
    }
  }, [
    consultation?.consultationMode,
    consultation?.currentStep,
    currentUIStep,
    consultation,
  ]);

  const scrollStepTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-consult-scroll]')
        ?.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, []);

  const refreshConsultation = useCallback(() => {
    return qc.invalidateQueries({ queryKey: consultationKeys.detail(consultationId) });
  }, [qc, consultationId]);

  const runBeforeLeave = useCallback(async () => {
    try {
      await beforeLeaveRef.current?.();
    } catch {
      // Draft save is best-effort — never block moving to another step
    }
  }, []);

  const applyStepChange = useCallback(
    (stepId: UIStepId, idx: number, markCompletedThrough?: number) => {
      setCurrentUIStep(stepId);
      setFarthestUIIndex((prev) => Math.max(prev, idx));
      if (markCompletedThrough != null && markCompletedThrough >= 0) {
        setCompletedUISteps((prev) => {
          const next = new Set(prev);
          next.add(markCompletedThrough);
          for (let i = 0; i < idx; i++) next.add(i);
          return next;
        });
      }
      setLastSaved(new Date());
      scrollStepTop();
      refreshConsultation();
    },
    [refreshConsultation, scrollStepTop],
  );

  const goNext = useCallback(
    async (options?: WizardNextOptions) => {
      await runBeforeLeave();
      if (options?.approachMode) {
        setPendingMode(options.approachMode);
      }

      const modeForSteps = options?.approachMode ?? pendingMode ?? consultation?.consultationMode;
      const steps = getUISteps(modeForSteps);
      const requestedTarget = options?.targetStep as UIStepId | undefined;
      const fromIdx = steps.findIndex((s) => s.id === currentUIStep);

      if (requestedTarget && steps.some((s) => s.id === requestedTarget)) {
        const targetIdx = steps.findIndex((s) => s.id === requestedTarget);
        applyStepChange(requestedTarget, targetIdx, fromIdx);
        return;
      }

      if (fromIdx >= 0 && fromIdx < steps.length - 1) {
        const nextStep = steps[fromIdx + 1];
        applyStepChange(nextStep.id, fromIdx + 1, fromIdx);
        return;
      }

      if (
        currentUIStep === 'PATHWAY_SELECTION' &&
        options?.approachMode === 'CLINICAL_JUDGMENT'
      ) {
        applyStepChange('CLINICAL_ASSESSMENT', 2, 1);
      }
    },
    [
      currentUIStep,
      pendingMode,
      consultation?.consultationMode,
      applyStepChange,
      runBeforeLeave,
    ],
  );

  const navigateToIndex = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= uiSteps.length) return;
      const target = uiSteps[idx];
      if (!target) return;
      if (idx > farthestUIIndex) return;
      if (target.id === currentUIStep) {
        scrollStepTop();
        return;
      }
      await runBeforeLeave();
      await refreshConsultation();
      setCurrentUIStep(target.id);
      scrollStepTop();
    },
    [
      uiSteps,
      farthestUIIndex,
      currentUIStep,
      runBeforeLeave,
      scrollStepTop,
      refreshConsultation,
    ],
  );

  const goBack = useCallback(() => {
    const idx = uiSteps.findIndex((s) => s.id === currentUIStep);
    if (idx > 0) void navigateToIndex(idx - 1);
  }, [uiSteps, currentUIStep, navigateToIndex]);

  const goToUIStep = useCallback(
    (_stepId: UIStepId, idx: number) => {
      void navigateToIndex(idx);
    },
    [navigateToIndex],
  );

  const isCj = isClinicalJudgmentMode(effectiveMode);
  const referralPathActive = Boolean(
    consultation?.redFlags?.referralSelected ||
      consultation?.referralOutcome?.status === 'DRAFT' ||
      consultation?.referralOutcome?.status === 'COMPLETED' ||
      consultation?.redFlags?.referralCompleted ||
      consultation?.consultationMode === 'DOCUMENTATION_REFERRAL',
  );
  const lockedStepIds = useMemo(() => {
    const locked = new Set<UIStepId>();
    if (consultation?.pathwayClinicalJudgement?.noTreatmentInitiated) {
      locked.add('TREATMENT');
    }
    if (referralPathActive) {
      if (isCj || consultation?.consultationMode === 'DOCUMENTATION_REFERRAL') {
        locked.add('TREATMENT');
        locked.add('TREATMENT_RATIONALE');
        locked.add('PATIENT_ASSESSMENT');
      } else {
        locked.add('TREATMENT');
        locked.add('DOCUMENTATION');
      }
    }
    return locked.size ? locked : undefined;
  }, [referralPathActive, isCj, consultation?.consultationMode, consultation?.pathwayClinicalJudgement?.noTreatmentInitiated]);

  const goToUIStepSafe = useCallback(
    (stepId: UIStepId, idx: number) => {
      if (lockedStepIds?.has(stepId)) return;
      goToUIStep(stepId, idx);
    },
    [goToUIStep, lockedStepIds],
  );

  const viewClinicalJudgement = useCallback(() => {
    const idx = uiSteps.findIndex((s) => s.id === 'PATIENT_ASSESSMENT');
    if (idx >= 0) goToUIStepSafe('PATIENT_ASSESSMENT', idx);
  }, [goToUIStepSafe, uiSteps]);

  const handleSubmitted = useCallback(
    (nextConsultationId?: string) => {
      purgeConsultationLocalState(consultationId);
      qc.removeQueries({ queryKey: consultationKeys.detail(consultationId) });
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
      lastConsultationRef.current = null;
      if (nextConsultationId) {
        router.replace(`${backHref}/${nextConsultationId}`);
        return;
      }
      router.replace(backHref);
    },
    [backHref, consultationId, qc, router],
  );

  if (leavingClosed || (isLoading && !consultation)) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2.5">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {leavingClosed ? 'Opening Prescribe workspace…' : 'Loading consultation…'}
        </p>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <div>
          <p className="font-semibold text-foreground">Consultation unavailable</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            This consultation is no longer available. It may have been completed or automatically
            deleted at end of day.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.replace(backHref)}>
          Back to Consultations
        </Button>
      </div>
    );
  }

  const currentUIIndex = uiSteps.findIndex((s) => s.id === currentUIStep);
  const currentStepConfig = uiSteps[currentUIIndex];
  const previousStep = currentUIIndex > 0 ? uiSteps[currentUIIndex - 1] : undefined;
  const nextStep =
    currentUIIndex >= 0 && currentUIIndex < uiSteps.length - 1
      ? uiSteps[currentUIIndex + 1]
      : undefined;
  const backLabel = previousStep ? `Back to ${previousStep.shortLabel}` : 'Back';
  const showSummaryBar = currentUIIndex >= 3;
  const isLastStep = currentUIIndex === uiSteps.length - 1;
  const stepProps = {
    consultation,
    onNext: goNext as () => void,
    onBack: goBack,
    backLabel,
  };
  const ownsTitle = new Set<UIStepId>([
    'PRESENTING_COMPLAINT',
    'PATHWAY_SELECTION',
    'CLINICAL_ASSESSMENT',
    'PATIENT_ASSESSMENT',
    'RED_FLAGS',
    'PRESCRIBING_READINESS',
    'TREATMENT',
    'TREATMENT_RATIONALE',
    'DOCUMENTATION',
  ]);

  const progressStepper = (
    <ConsultationStepper
      currentUIStep={currentUIStep}
      completedUISteps={completedUISteps}
      maxClickableIndex={farthestUIIndex}
      onStepClick={goToUIStepSafe}
      lockedStepIds={lockedStepIds}
      consultationMode={effectiveMode}
    />
  );

  return (
    <WizardLeaveContext.Provider value={registerBeforeLeave}>
    <div
      data-consult-shell
      className="flex h-full min-h-0 flex-1 overflow-hidden bg-background"
    >
      <div
        className={cn(
          'z-30 hidden min-h-0 shrink-0 self-stretch overflow-hidden transition-[width] duration-200 ease-out lg:flex lg:flex-col',
          !historyOpen && 'pointer-events-none',
        )}
        style={{
          width: historyOpen ? ACTIVE_CONSULTATIONS_SIDEBAR_WIDTH : 0,
        }}
        aria-hidden={!historyOpen}
      >
        <ConsultationHistorySidebar
          activeId={consultationId}
          basePath={backHref}
          expanded
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="sticky top-0 z-40 shrink-0 border-b border-consult-divider/60 bg-consult-workspace/95 backdrop-blur-md">
          <div
            className={cn(
              'mx-auto flex h-9 w-full max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8',
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
                title="Show active consultations"
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
              {isCj || consultation.consultationMode === 'DOCUMENTATION_REFERRAL' ? (
                <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">
                  Clinical Judgment
                </span>
              ) : null}
              <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                {consultation.consultationRef}
              </span>
              {lastSaved && (
                <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  Saved{' '}
                  {lastSaved.toLocaleTimeString('en-AU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
            </div>
          </div>
          {currentUIStep !== 'PATHWAY_SELECTION' && currentUIStep !== 'PATIENT_ASSESSMENT' ? (
            <div className="border-t border-consult-divider/40 bg-muted/20">
              <div className="mx-auto w-full max-w-[1280px] px-4 py-2 sm:px-6 lg:px-8">
                {progressStepper}
              </div>
            </div>
          ) : null}
        </div>

        {showSummaryBar && <ConversationSummaryBar consultation={consultation} />}

        <div
          data-consult-scroll
          className="consult-workspace min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
        >
          <div className="mx-auto h-auto w-full max-w-[1280px] px-4 pt-5 pb-8 sm:px-6 lg:px-8">
            {!ownsTitle.has(currentUIStep) && (
              <div className="mb-4">
                <h1 className="text-lg font-bold tracking-tight text-foreground">
                  {currentStepConfig?.label}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {isLastStep
                    ? 'Please review everything before submitting this consultation.'
                    : `Fill in this section to move on to ${uiSteps[currentUIIndex + 1]?.label ?? 'the next step'}.`}
                </p>
              </div>
            )}

            <div key={currentUIStep} className="h-auto animate-in fade-in duration-200">
              <StepErrorBoundary
                stepLabel={currentStepConfig?.label ?? currentUIStep}
                onBack={currentUIIndex > 0 ? goBack : undefined}
              >
                {currentUIStep === 'PRESENTING_COMPLAINT' && (
                  <Step1PresentingComplaint
                    consultation={consultation}
                    onNext={goNext}
                    backHref={backHref}
                  />
                )}
                {currentUIStep === 'PATHWAY_SELECTION' && (
                  <Step2PathwaySelection
                    consultation={consultation}
                    onNext={goNext}
                    onBack={goBack}
                    backLabel={backLabel}
                  />
                )}
                {currentUIStep === 'CLINICAL_ASSESSMENT' && (
                  <StepClinicalAssessment
                    {...stepProps}
                    nextHint={nextStep ? `Next: ${nextStep.shortLabel}` : undefined}
                  />
                )}
                {currentUIStep === 'PATIENT_ASSESSMENT' && (
                  <StepPatientAssessment
                    {...stepProps}
                    onNext={goNext}
                    clinicalJudgmentOnly={isCj}
                  />
                )}
                {currentUIStep === 'RED_FLAGS' &&
                  (isCj ? (
                    <StepAiRedFlagCheck
                      consultation={consultation}
                      onNext={goNext}
                      onBack={goBack}
                      backLabel={backLabel}
                    />
                  ) : (
                    <Step5RedFlags
                      {...stepProps}
                      backHref={backHref}
                      onViewClinicalJudgement={viewClinicalJudgement}
                      onChooseDifferentPathway={() => {
                        const idx = uiSteps.findIndex((s) => s.id === 'PATHWAY_SELECTION');
                        if (idx >= 0) goToUIStepSafe('PATHWAY_SELECTION', idx);
                      }}
                    />
                  ))}
                {currentUIStep === 'PRESCRIBING_READINESS' && (
                  <StepPrescribingReadiness
                    consultation={consultation}
                    onNext={goNext}
                    onBack={goBack}
                    backLabel={backLabel}
                    onGoToStep={(stepId) => {
                      const idx = uiSteps.findIndex((s) => s.id === stepId);
                      if (idx >= 0) goToUIStepSafe(stepId as UIStepId, idx);
                    }}
                  />
                )}
                {currentUIStep === 'TREATMENT' && (
                  <Step7Treatment
                    {...stepProps}
                    onViewClinicalJudgement={viewClinicalJudgement}
                  />
                )}
                {currentUIStep === 'TREATMENT_RATIONALE' && (
                  <StepTreatmentRationale
                    {...stepProps}
                    onEditTreatment={() => {
                      const idx = uiSteps.findIndex((s) => s.id === 'TREATMENT');
                      if (idx >= 0) goToUIStepSafe('TREATMENT', idx);
                    }}
                  />
                )}
                {currentUIStep === 'DOCUMENTATION' && (
                  <Step9Documentation
                    consultation={consultation}
                    onBack={goBack}
                    backLabel={backLabel}
                    onSubmitted={handleSubmitted}
                    onReviewAge={viewClinicalJudgement}
                  />
                )}
              </StepErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
    </WizardLeaveContext.Provider>
  );
}
