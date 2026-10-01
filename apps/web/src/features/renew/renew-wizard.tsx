'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, PanelLeftOpen } from 'lucide-react';
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
import { useActiveConsultations, useConsultation } from '@/features/consultations/hooks';
import { useLeaveClosedWorkspace } from '@/features/consultations/use-leave-closed-workspace';
import { WizardLeaveContext, type BeforeLeaveFn } from '@/features/consultations/wizard-nav';
import { cn } from '@/lib/utils';
import {
  RENEW_UI_STEPS,
  renewDbStepToUIStepId,
  renewUIIndex,
  type RenewUIStepId,
} from '@safescript/shared';
import { RenewStepper } from './renew-stepper';
import { Step1MedicationsToRenew } from './steps/step1-medications-to-renew';
import { Step2TherapyReview } from './steps/step2-therapy-review';
import { Step3MonitoringSafety } from './steps/step3-monitoring-safety';
import { Step4RenewDocument } from './steps/step4-renew-document';

interface Props {
  consultationId: string;
  backHref: string;
}

export function RenewConsultationWizard({ consultationId, backHref }: Props) {
  const router = useRouter();
  const { data, isLoading } = useConsultation(consultationId);
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

  const [currentUIStep, setCurrentUIStep] = useState<RenewUIStepId>('MEDICATIONS_TO_RENEW');
  const [completedUISteps, setCompletedUISteps] = useState<Set<number>>(new Set());
  const [farthestUIIndex, setFarthestUIIndex] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const { data: activeQueue } = useActiveConsultations({
    enabled: !historyOpen,
    module: 'renew',
  });
  const hiddenQueueCount = activeQueue?.count ?? 0;
  const hasInitialized = useRef(false);
  const beforeLeaveRef = useRef<BeforeLeaveFn | null>(null);

  const registerBeforeLeave = useCallback((fn: BeforeLeaveFn | null) => {
    beforeLeaveRef.current = fn;
  }, []);

  useEffect(() => {
    if (consultation?.module && consultation.module !== 'renew') {
      router.replace(`${backHref.replace(/\/renew$/, '/consultations')}/${consultationId}`);
    }
  }, [consultation?.module, consultationId, backHref, router]);

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

  useEffect(() => {
    hasInitialized.current = false;
    setCurrentUIStep('MEDICATIONS_TO_RENEW');
    setCompletedUISteps(new Set());
    setFarthestUIIndex(0);
    setLastSaved(null);
  }, [consultationId]);

  useEffect(() => {
    if (consultation && !hasInitialized.current) {
      hasInitialized.current = true;
      const uiStep = renewDbStepToUIStepId(consultation.currentStep);
      const uiIdx = renewUIIndex(uiStep);
      setCurrentUIStep(uiStep);
      setFarthestUIIndex(uiIdx);
      const done = new Set<number>();
      for (let i = 0; i < uiIdx; i++) done.add(i);
      setCompletedUISteps(done);
    }
  }, [consultation]);

  const runBeforeLeave = useCallback(async () => {
    try {
      await beforeLeaveRef.current?.();
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    const flush = () => {
      void beforeLeaveRef.current?.();
    };
    const onPageHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(WORKSPACE_FLUSH_EVENT, flush);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(WORKSPACE_FLUSH_EVENT, flush);
      flush();
    };
  }, []);

  const navigateToIndex = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= RENEW_UI_STEPS.length) return;
      if (idx > farthestUIIndex) return;
      const target = RENEW_UI_STEPS[idx];
      if (!target) return;
      if (target.id === currentUIStep) return;
      await runBeforeLeave();
      setCurrentUIStep(target.id);
    },
    [currentUIStep, farthestUIIndex, runBeforeLeave],
  );

  const goNext = useCallback(() => {
    const fromIdx = RENEW_UI_STEPS.findIndex((s) => s.id === currentUIStep);
    if (fromIdx < 0 || fromIdx >= RENEW_UI_STEPS.length - 1) return;
    const next = RENEW_UI_STEPS[fromIdx + 1];
    setCompletedUISteps((prev) => {
      const copy = new Set(prev);
      copy.add(fromIdx);
      return copy;
    });
    setFarthestUIIndex((prev) => Math.max(prev, fromIdx + 1));
    setCurrentUIStep(next.id);
    setLastSaved(new Date());
  }, [currentUIStep]);

  const goBack = useCallback(() => {
    const idx = RENEW_UI_STEPS.findIndex((s) => s.id === currentUIStep);
    if (idx > 0) void navigateToIndex(idx - 1);
  }, [currentUIStep, navigateToIndex]);

  if (leavingClosed || (isLoading && !consultation)) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2.5">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {leavingClosed ? 'Opening Renew workspace…' : 'Loading renewal…'}
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
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This renewal is no longer available. It may have been completed or automatically deleted
            at end of day.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.replace(backHref)}>
          Back to Renew
        </Button>
      </div>
    );
  }

  return (
    <WizardLeaveContext.Provider value={registerBeforeLeave}>
      <div data-consult-shell className="flex h-full min-h-0 flex-1 overflow-hidden bg-background">
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
            module="renew"
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="sticky top-0 z-40 shrink-0 border-b border-consult-divider/60 bg-consult-workspace/95 backdrop-blur-md">
            <div
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
                  Renew
                </span>
                <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                  {consultation.consultationRef}
                </span>
                {lastSaved ? (
                  <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Saved{' '}
                    {lastSaved.toLocaleTimeString('en-AU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="border-t border-consult-divider/40 bg-muted/20">
              <div className="w-full px-5 py-2">
                <RenewStepper
                  currentUIStep={currentUIStep}
                  completedUISteps={completedUISteps}
                  maxClickableIndex={farthestUIIndex}
                  onStepClick={(_, idx) => void navigateToIndex(idx)}
                />
              </div>
            </div>
          </div>

          <div
            data-consult-scroll
            className="consult-workspace min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="renew-shell">
              {currentUIStep === 'MEDICATIONS_TO_RENEW' ? (
                <Step1MedicationsToRenew
                  key={consultationId}
                  consultationId={consultationId}
                  initialPayload={consultation.renewPayload}
                  onSaved={() => setLastSaved(new Date())}
                  onContinueToTherapyReview={goNext}
                />
              ) : (
                <div className="min-w-0 space-y-4">
                  <div>
                    <h1 className="text-[26px] font-bold leading-8 tracking-tight text-[#102a43]">
                      {RENEW_UI_STEPS.find((s) => s.id === currentUIStep)?.pageTitle}
                    </h1>
                    <p className="mt-1 text-[14px] leading-5 text-[#52677a]">
                      {RENEW_UI_STEPS.find((s) => s.id === currentUIStep)?.description}
                    </p>
                  </div>
                  {currentUIStep === 'THERAPY_REVIEW' ? (
                    <Step2TherapyReview
                      key={`${consultationId}-therapy`}
                      consultationId={consultationId}
                      initialPayload={consultation.renewPayload}
                      onSaved={() => setLastSaved(new Date())}
                      onBack={goBack}
                      onContinue={goNext}
                    />
                  ) : currentUIStep === 'CLINICAL_ASSESSMENT' ? (
                    <Step3MonitoringSafety
                      key={`${consultationId}-monitoring`}
                      consultationId={consultationId}
                      initialPayload={consultation.renewPayload}
                      onSaved={() => setLastSaved(new Date())}
                      onBack={goBack}
                      onContinue={goNext}
                    />
                  ) : (
                    <Step4RenewDocument
                      key={`${consultationId}-renew-document`}
                      consultationId={consultationId}
                      initialPayload={consultation.renewPayload}
                      onSaved={() => setLastSaved(new Date())}
                      onBack={goBack}
                      onCompleted={() => router.replace(backHref)}
                      onStartAnother={(nextId) => router.replace(`${backHref}/${nextId}`)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </WizardLeaveContext.Provider>
  );
}
