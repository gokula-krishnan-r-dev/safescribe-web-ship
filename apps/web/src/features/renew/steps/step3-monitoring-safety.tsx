'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, Upload } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { ClinicalPrimaryButton, ClinicalStepFooter } from '@/features/consultations/clinical-ui';
import {
  CLINICAL_REFERENCE_RELEASE_ID,
  contextBulkApplyAllowed,
  contextChoiceFromAnswer,
  evaluatePresentedMonitoringGate,
  groupTherapyConditions,
  isMonitoringRowComplete,
  monitoringAccordionCounts,
  monitoringCollapsedSummary,
  monitoringRemovalLabel,
  monitoringSummaryCounts,
  parseRenewPayload,
  presentMonitoringRows,
  therapyIndicationsReady,
} from '@safescript/shared';
import type { ContextRemovalReasonId, MonitoringRemovalReasonId } from '@safescript/shared';
import type { ApiError } from '@/lib/api-client';
import {
  useCompleteMonitoringSafety,
  useConfirmMonitoringExtraction,
  useExtractMonitoringResults,
  useMarkMonitoringUnavailable,
  useMonitoringSafety,
  useRejectMonitoringExtraction,
  useSaveMonitoringContext,
  useSaveMonitoringResult,
  useSaveMonitoringReview,
  useSaveMonitoringWorkspace,
  useSavePatientSpecificInformation,
  useTherapyReview,
} from '../hooks';
import { ExtractionReviewModal } from './extraction-review-modal';
import { MonitoringAddOtherDialog } from './monitoring-add-other-dialog';
import { MonitoringNeededTable, MonitoringRemovedSection } from './monitoring-needed-table';
import { MonitoringReferenceDetailsDialog } from './monitoring-reference-popover';
import { MonitoringRemoveDialog } from './monitoring-remove-dialog';
import { MonitoringResultDialog } from './monitoring-result-dialog';
import { MonitoringUnavailableDialog } from './monitoring-unavailable-dialog';
import { MonitoringUploadModal } from './monitoring-upload-modal';
import { PatientContextSection } from './patient-context-section';
import { SafetyReviewCard } from './safety-review-card';
import { Step3EvidenceCallout, Step3SectionAccordion } from './step3-section-accordion';
import type { SaveContextAnswer } from './patient-context-question-row';

function errorMessage(error: unknown, fallback: string) {
  const err = error as ApiError | undefined;
  if (!err) return fallback;
  if (typeof err.message === 'string') return err.message;
  if (Array.isArray(err.message)) return err.message[0] ?? fallback;
  if (err.message && typeof err.message === 'object' && 'message' in err.message) {
    return String(err.message.message ?? fallback);
  }
  return fallback;
}

export function Step3MonitoringSafety({
  consultationId,
  initialPayload,
  onBack,
  onContinue,
  onSaved,
}: {
  consultationId: string;
  initialPayload: unknown;
  onBack: () => void;
  onContinue: () => void;
  onSaved?: () => void;
}) {
  const parsed = parseRenewPayload(initialPayload);
  const reviewQuery = useTherapyReview(consultationId, parsed.medicationList.items.length > 0);
  const medications = reviewQuery.data?.medications ?? parsed.medicationList.items;
  const therapy = reviewQuery.data?.therapyReview ?? parsed.therapyReview;
  const catalog = reviewQuery.data?.conditions ?? [];
  const step1Ready = parsed.medicationList.confirmed && medications.length > 0;
  const therapyReady = therapyIndicationsReady(medications, therapy);
  const canLoad = step1Ready && therapyReady;

  const query = useMonitoringSafety(consultationId, canLoad);
  const saveResult = useSaveMonitoringResult(consultationId);
  const saveReview = useSaveMonitoringReview(consultationId);
  const markUnavailable = useMarkMonitoringUnavailable(consultationId);
  const saveContext = useSaveMonitoringContext(consultationId);
  const savePatientContext = useSavePatientSpecificInformation(consultationId);
  const saveWorkspace = useSaveMonitoringWorkspace(consultationId);
  const extract = useExtractMonitoringResults(consultationId);
  const confirmExtraction = useConfirmMonitoringExtraction(consultationId);
  const rejectExtraction = useRejectMonitoringExtraction(consultationId);
  const complete = useCompleteMonitoringSafety(consultationId);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [unavailableCode, setUnavailableCode] = useState<string | null>(null);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [addOtherOpen, setAddOtherOpen] = useState(false);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<'view' | 'review' | null>(null);
  const [openSection, setOpenSection] = useState<'context' | 'monitoring' | 'additional' | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [contextBulkBanner, setContextBulkBanner] = useState<{
    count: number;
    bulkActionId: string;
  } | null>(null);
  const initializedOpen = useRef(false);

  const view = query.data;
  const monitoring = view?.monitoring ?? [];
  const context = view?.patientContext ?? [];
  const removedContext = view?.removedContextQuestions ?? [];
  const removedMonitoring = view?.removedMonitoringItems ?? [];
  const additionalMonitoring = view?.additionalMonitoring ?? [];
  const contextConfirmed = Boolean(view?.patientContextConfirmed);
  const monitoringConfirmed = Boolean(view?.monitoringConfirmed);
  const safety = view?.safetySummary;
  const pendingExtraction = view?.pendingExtraction ?? null;
  const itemReviews = view?.itemReviews ?? parsed.monitoringSafety.itemReviews;
  const groups = useMemo(
    () => groupTherapyConditions(medications, therapy, catalog),
    [medications, therapy, catalog],
  );
  const indications = view?.indications ?? groups.map((group) => ({
    code: group.conditionCode,
    label: group.displayName,
  }));

  const presented = useMemo(
    () =>
      presentMonitoringRows(monitoring, {
        findings: safety?.findings ?? [],
        reviews: itemReviews,
        indications,
        acknowledgedFindingKeys: parsed.monitoringSafety.acknowledgedFindingKeys,
        patientContext: context,
      }),
    [monitoring, safety?.findings, itemReviews, indications, parsed.monitoringSafety.acknowledgedFindingKeys, context],
  );
  const counts = useMemo(() => monitoringSummaryCounts(presented), [presented]);
  const accordionCounts = useMemo(
    () => monitoringAccordionCounts(presented, removedMonitoring.length),
    [presented, removedMonitoring.length],
  );
  const monitoringReady =
    presented.length === 0 ||
    monitoringConfirmed ||
    presented.every((row) => isMonitoringRowComplete(row, row.presentation));
  const gate =
    view?.gate ??
    evaluatePresentedMonitoringGate({
      monitoring,
      context,
      findings: safety?.findings ?? [],
      acknowledgedFindingKeys: parsed.monitoringSafety.acknowledgedFindingKeys,
      itemReviews,
      indications,
    });

  const unavailableRow = useMemo(
    () => monitoring.find((row) => row.inputCode === unavailableCode) ?? null,
    [monitoring, unavailableCode],
  );
  const removingRow = useMemo(
    () =>
      monitoring.find((row) => row.inputCode === removingCode) ??
      additionalMonitoring.find((row) => row.inputCode === removingCode) ??
      null,
    [monitoring, additionalMonitoring, removingCode],
  );
  const referenceRow = useMemo(
    () => monitoring.find((row) => row.inputCode === referenceCode) ?? null,
    [monitoring, referenceCode],
  );

  const openUnavailable = (inputCode: string) => {
    setEditingCode(null);
    setUploadOpen(false);
    setUnavailableCode(inputCode);
  };

  const openUpload = () => {
    setEditingCode(null);
    setUnavailableCode(null);
    setUploadOpen(true);
  };

  const busyCode =
    saveResult.isPending
      ? saveResult.variables?.inputCode
      : markUnavailable.isPending
        ? markUnavailable.variables?.inputCode
        : saveContext.isPending
          ? saveContext.variables?.inputCode
          : saveReview.isPending
            ? saveReview.variables?.inputCode
            : null;

  const markSaved = useCallback(() => onSaved?.(), [onSaved]);

  const handleSaveContextAnswer = useCallback<SaveContextAnswer>(
    (inputCode, body) => {
      saveContext.mutate(
        { inputCode, body },
        {
          onSuccess: markSaved,
          onError: (error) => toast.error(errorMessage(error, 'Could not save that answer.')),
        },
      );
    },
    [saveContext, markSaved],
  );

  const toggleContextSection = useCallback(() => {
    setOpenSection((current) => (current === 'context' ? null : 'context'));
  }, []);

  useEffect(() => {
    if (view?.contextAdditionalNote == null) return;
    setNoteDraft(view.contextAdditionalNote);
  }, [view?.contextAdditionalNote]);

  useEffect(() => {
    if (!view || initializedOpen.current) return;
    initializedOpen.current = true;
    const hasPatientContext = (view.patientContext?.length ?? 0) > 0 || (view.removedContextQuestions?.length ?? 0) > 0;
    if (hasPatientContext && !view.patientContextConfirmed) setOpenSection('context');
    else if ((view.monitoring?.length ?? 0) > 0) setOpenSection('monitoring');
  }, [view]);

  const psiError = useCallback(
    (error: unknown) => toast.error(errorMessage(error, 'Could not save patient-specific information.')),
    [],
  );

  const handleApplyNoConcerns = () => {
    const count = context.filter((row) => contextBulkApplyAllowed(row) && !contextChoiceFromAnswer(row.answer)).length;
    savePatientContext.mutate(
      { applyNoConcerns: true, ackBulkConfirm: true },
      {
        onSuccess: (data) => {
          markSaved();
          const bulkActionId = data.lastContextBulkActionId;
          if (bulkActionId) {
            setContextBulkBanner({ count, bulkActionId });
          }
        },
        onError: psiError,
      },
    );
  };

  const handleConfirmContext = () => {
    savePatientContext.mutate(
      { additionalNote: noteDraft, confirmed: true },
      {
        onSuccess: () => {
          markSaved();
          setOpenSection(presented.length || removedMonitoring.length ? 'monitoring' : null);
        },
        onError: psiError,
      },
    );
  };

  const handleRemoveQuestion = useCallback(
    (inputCode: string, reasonCode: ContextRemovalReasonId, reasonText?: string | null) => {
      savePatientContext.mutate(
        { removedQuestions: [{ questionRuleId: inputCode, reasonCode, reasonText }] },
        {
          onSuccess: () => {
            markSaved();
            toast.success('Question removed from this review', {
              announce: true,
              duration: 8000,
              action: {
                label: 'Undo',
                onClick: () =>
                  savePatientContext.mutate(
                    { restoreQuestionIds: [inputCode] },
                    { onSuccess: markSaved, onError: psiError },
                  ),
              },
            });
          },
          onError: psiError,
        },
      );
    },
    [savePatientContext, markSaved, psiError],
  );

  const handleContinue = async () => {
    if (!gate.ok) {
      toast.error('Resolve remaining Action required and Review required items before continuing.');
      return;
    }
    try {
      await complete.mutateAsync();
      markSaved();
      onContinue();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not complete monitoring & safety.'));
    }
  };

  if (!step1Ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Confirm medications first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitoring & Safety starts after the pharmacist-confirmed medication list from Step 1 is available.
          </p>
        </div>
        <ClinicalStepFooter onBack={onBack} backLabel="Back to Therapy Review" nextLabel="Continue" disabled />
      </div>
    );
  }

  if (reviewQuery.isPending && !therapyReady) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading confirmed indications…</p>
      </div>
    );
  }

  if (!therapyReady) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Complete therapy review first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Link every medication to an indication in Therapy review, then continue. Monitoring uses
            those confirmed indications.
          </p>
        </div>
        <ClinicalStepFooter onBack={onBack} backLabel="Back to Therapy Review" nextLabel="Continue" disabled />
      </div>
    );
  }

  if (query.isLoading && !view) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Resolving monitoring requirements…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Couldn’t load monitoring & safety</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMessage(query.error, 'Monitoring requirements are temporarily unavailable. Retry or go back.')}
          </p>
        </div>
        <ClinicalStepFooter
          onBack={onBack}
          backLabel="Back to Therapy Review"
          onNext={() => void query.refetch()}
          nextLabel="Retry"
        />
      </div>
    );
  }

  const noMonitoring =
    monitoring.length === 0 &&
    additionalMonitoring.length === 0 &&
    context.length === 0 &&
    removedContext.length === 0 &&
    removedMonitoring.length === 0;
  const hasContext = context.length > 0 || removedContext.length > 0;
  const contextReady = !hasContext || contextConfirmed;
  const monitoringReviewCount = gate.blockingReviewCodes.length;
  const workspaceError = (error: unknown) => toast.error(errorMessage(error, 'Could not update monitoring.'));

  const handleConfirmMonitoring = () => {
    saveWorkspace.mutate(
      { confirmed: true },
      {
        onSuccess: () => {
          markSaved();
          setOpenSection(additionalMonitoring.length ? 'additional' : null);
        },
        onError: workspaceError,
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="renew-step3">
        <div className="min-w-0 space-y-4">
          <div className="flex justify-end">
            <Step3EvidenceCallout />
          </div>
          {noMonitoring ? (
            <div className="flex items-start gap-3 rounded-2xl border border-[#d7e2e6] bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1f8a4c]" />
              <div>
                <p className="text-sm font-semibold text-[#163447]">
                  No additional monitoring information is required for the selected medications.
                </p>
                <p className="mt-1 text-sm text-[#5b6b75]">You can continue using pharmacist professional judgment.</p>
              </div>
            </div>
          ) : (
            <>
              {hasContext ? (
                <PatientContextSection
                  items={context}
                  removed={removedContext}
                  additionalNote={noteDraft}
                  confirmed={contextConfirmed}
                  bulkAcked={Boolean(view?.patientContextBulkAcked)}
                  sectionNumber={1}
                  open={openSection === 'context'}
                  savingCode={saveContext.isPending ? saveContext.variables?.inputCode : null}
                  busy={savePatientContext.isPending}
                  onToggle={toggleContextSection}
                  onSave={handleSaveContextAnswer}
                  onApplyNoConcerns={handleApplyNoConcerns}
                  bulkBanner={
                    contextBulkBanner
                      ? {
                          message: `No-concern responses applied to ${contextBulkBanner.count} question${
                            contextBulkBanner.count === 1 ? '' : 's'
                          }.`,
                          onUndo: () =>
                            savePatientContext.mutate(
                              { undoBulkActionId: contextBulkBanner.bulkActionId },
                              {
                                onSuccess: () => {
                                  setContextBulkBanner(null);
                                  markSaved();
                                },
                                onError: psiError,
                              },
                            ),
                        }
                      : null
                  }
                  onRemove={handleRemoveQuestion}
                  onRestore={(inputCode) =>
                    savePatientContext.mutate(
                      { restoreQuestionIds: [inputCode] },
                      { onSuccess: markSaved, onError: psiError },
                    )
                  }
                  onConfirm={handleConfirmContext}
                  onCancel={() => {
                    setNoteDraft(view?.contextAdditionalNote ?? '');
                    setOpenSection(null);
                  }}
                  onNoteChange={setNoteDraft}
                />
              ) : null}
              {presented.length || removedMonitoring.length ? (
                <Step3SectionAccordion
                  number={hasContext ? 2 : 1}
                  title="Monitoring needed"
                  subtitle="Review the key results relevant to the medications being renewed."
                  collapsedSummary={monitoringCollapsedSummary(presented, removedMonitoring.length)}
                  headerRight={
                    openSection === 'monitoring' ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openUpload}
                        className="h-9 border-[#0F6F6B] bg-white px-3 text-sm font-medium text-[#0F6F6B] hover:bg-[#0F6F6B]/5"
                      >
                        <Upload className="h-4 w-4" />
                        Paste / upload results
                      </Button>
                    ) : null
                  }
                  badge={
                    <span className="hidden text-[12px] font-medium text-[#5b6b75] sm:inline">
                      {accordionCounts.label}
                    </span>
                  }
                  open={openSection === 'monitoring'}
                  confirmed={contextReady && monitoringConfirmed && monitoringReady}
                  locked={hasContext && !contextReady}
                  onToggle={() => {
                    if (hasContext && !contextReady) {
                      toast.message('Finish patient-specific information first.', { announce: true });
                      return;
                    }
                    setOpenSection((current) => (current === 'monitoring' ? null : 'monitoring'));
                  }}
                >
                  <MonitoringNeededTable
                    embedded
                    rows={presented}
                    busyCode={busyCode}
                    expandedCode={expandedCode}
                    expandedMode={expandedMode}
                    savingReviewCode={saveReview.isPending ? saveReview.variables?.inputCode : null}
                    onEdit={(row) => {
                      setUnavailableCode(null);
                      setEditingCode(row.inputCode);
                    }}
                    onToggleExpand={(code, mode) => {
                      if (expandedCode === code && expandedMode === mode) {
                        setExpandedCode(null);
                        setExpandedMode(null);
                        return;
                      }
                      setExpandedCode(code);
                      setExpandedMode(mode);
                    }}
                    onSaveReview={(inputCode, body) => {
                      saveReview.mutate(
                        { inputCode, ...body },
                        {
                          onSuccess: () => {
                            markSaved();
                            setExpandedCode(null);
                            setExpandedMode(null);
                            toast.success('Review saved.');
                          },
                          onError: (error) => toast.error(errorMessage(error, 'Could not save that review.')),
                        },
                      );
                    }}
                    onSaveResult={(inputCode, body) => {
                      saveResult.mutate(
                        { inputCode, body },
                        {
                          onSuccess: (data) => {
                            markSaved();
                            toast.success('Result saved.');
                            const nextRows = presentMonitoringRows(data.monitoring, {
                              findings: data.safetySummary?.findings,
                              reviews: data.itemReviews,
                              indications: data.indications,
                              patientContext: data.patientContext ?? context,
                            });
                            const next = nextRows.find((row) => row.inputCode === inputCode);
                            if (next?.presentation.needsReview) {
                              setExpandedCode(inputCode);
                              setExpandedMode('review');
                            }
                          },
                          onError: (error) => toast.error(errorMessage(error, 'Could not save that result.')),
                        },
                      );
                    }}
                    onMarkUnavailable={(row) => {
                      setEditingCode(null);
                      setUnavailableCode(row.inputCode);
                    }}
                    onRemove={(row) => setRemovingCode(row.inputCode)}
                    onViewReference={(row) => setReferenceCode(row.inputCode)}
                    onAddOther={() => setAddOtherOpen(true)}
                  />
                  <MonitoringRemovedSection
                    items={removedMonitoring.map((row) => ({
                      inputCode: row.inputCode,
                      label: row.label,
                      medicationNames: row.medicationNames,
                      reasonLabel: monitoringRemovalLabel(row.reasonCode, row.reasonText),
                    }))}
                    onRestore={(inputCode) =>
                      saveWorkspace.mutate(
                        { restoreInputCodes: [inputCode] },
                        { onSuccess: markSaved, onError: workspaceError },
                      )
                    }
                  />
                  <div className="flex justify-end gap-2 border-t border-[#edf1f3] px-5 py-3.5 sm:px-6">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 border-[#d7e2e6] bg-white px-4 text-sm font-medium"
                      onClick={() => setOpenSection(hasContext ? 'context' : null)}
                      disabled={saveWorkspace.isPending}
                    >
                      Back
                    </Button>
                    <ClinicalPrimaryButton
                      onClick={handleConfirmMonitoring}
                      disabled={!monitoringReady || saveWorkspace.isPending}
                      loading={saveWorkspace.isPending}
                      loadingLabel="Saving…"
                    >
                      Save & continue
                    </ClinicalPrimaryButton>
                  </div>
                </Step3SectionAccordion>
              ) : null}
            </>
          )}

          {additionalMonitoring.length || safety ? (
            <Step3SectionAccordion
              number={(hasContext ? 1 : 0) + (presented.length || removedMonitoring.length ? 1 : 0) + 1}
              title="Additional monitoring (optional)"
              subtitle="Lower-priority monitoring remains available here and does not block this review."
              badge={
                <span className="rounded-full bg-[#f3f7f8] px-2.5 py-1 text-[12px] font-medium text-[#5b6b75]">
                  {additionalMonitoring.length
                    ? `${additionalMonitoring.length} item${additionalMonitoring.length === 1 ? '' : 's'}`
                    : 'Optional'}
                </span>
              }
              open={openSection === 'additional'}
              confirmed={gate.ok}
              locked={hasContext && !contextReady}
              onToggle={() => {
                if (hasContext && !contextReady) {
                  toast.message('Finish patient-specific information first.', { announce: true });
                  return;
                }
                setOpenSection((current) => (current === 'additional' ? null : 'additional'));
              }}
            >
              {additionalMonitoring.length ? (
                <ul className="space-y-2 px-5 py-4 sm:px-6">
                  {additionalMonitoring.map((row) => (
                    <li key={row.inputCode} className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1f3] px-3.5 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-[#163447]">{row.label}</p>
                        <p className="text-[12px] text-[#7a8b94]">Optional for this renewal</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 border-[#0F6F6B] px-3 text-[13px] font-medium text-[#0F6F6B]"
                        onClick={() =>
                          saveWorkspace.mutate(
                            { extraInputCodes: [row.inputCode] },
                            {
                              onSuccess: () => {
                                markSaved();
                                toast.success(`${row.label} added to this review.`);
                              },
                              onError: workspaceError,
                            },
                          )
                        }
                      >
                        Add to this review
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {safety ? (
                <SafetyReviewCard embedded summary={safety} monitoringReviewCount={monitoringReviewCount} />
              ) : null}
            </Step3SectionAccordion>
          ) : null}
        </div>

        <MonitoringStatusStrip counts={counts} canContinue={gate.ok} />
      </div>

      <ClinicalStepFooter
        sticky
        onBack={onBack}
        backLabel="Back to Therapy Review"
        onNext={() => void handleContinue()}
        nextLabel="Continue to Renewal Plan"
        loading={complete.isPending}
        disabled={!gate.ok}
        hint={
          gate.ok ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Monitoring & Safety review complete
            </span>
          ) : hasContext && !contextReady ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-[#5b6b75]">
              <Lock className="h-4 w-4" aria-hidden />
              Save patient-specific information to continue.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-[#5b6b75]">
              <Lock className="h-4 w-4" aria-hidden />
              Disposition remaining monitoring items and document required reviews to continue.
            </span>
          )
        }
      />

      <p className="mt-3 flex flex-col gap-1 text-[11px] text-[#7a8b94] sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Targets and references are from the governed Reference Values Master ({CLINICAL_REFERENCE_RELEASE_ID}).
        </span>
        <span>Release: {CLINICAL_REFERENCE_RELEASE_ID}</span>
      </p>

      <MonitoringResultDialog
        open={Boolean(editingCode)}
        items={monitoring}
        initialCode={editingCode}
        saving={saveResult.isPending}
        onClose={() => setEditingCode(null)}
        onSave={(inputCode, body) => {
          saveResult.mutate(
            { inputCode, body },
            {
              onSuccess: () => {
                markSaved();
                setEditingCode(null);
              },
              onError: (error) => toast.error(errorMessage(error, 'Could not save that result.')),
            },
          );
        }}
        onRequestUnavailable={(inputCode) => openUnavailable(inputCode)}
      />

      <MonitoringUnavailableDialog
        open={Boolean(unavailableRow)}
        itemLabel={unavailableRow?.label ?? ''}
        inputCode={unavailableRow?.inputCode}
        initialNote={unavailableRow?.result.note}
        saving={markUnavailable.isPending}
        onClose={() => setUnavailableCode(null)}
        onConfirm={(note) => {
          if (!unavailableRow) return;
          markUnavailable.mutate(
            { inputCode: unavailableRow.inputCode, note },
            {
              onSuccess: () => {
                markSaved();
                setUnavailableCode(null);
              },
              onError: (error) => toast.error(errorMessage(error, 'Could not mark this item as unavailable.')),
            },
          );
        }}
      />

      <MonitoringRemoveDialog
        open={Boolean(removingRow)}
        itemLabel={removingRow?.label ?? ''}
        requiredWarning={Boolean(removingRow?.overrideRequiresReason)}
        saving={saveWorkspace.isPending}
        onClose={() => setRemovingCode(null)}
        onConfirm={(reasonCode: MonitoringRemovalReasonId, reasonText) => {
          if (!removingRow) return;
          const inputCode = removingRow.inputCode;
          const itemLabel = removingRow.label;
          saveWorkspace.mutate(
            { removedItems: [{ inputCode, reasonCode, reasonText }] },
            {
              onSuccess: () => {
                markSaved();
                setRemovingCode(null);
                toast.success(`${itemLabel} removed from this review`, {
                  announce: true,
                  duration: 8000,
                  action: {
                    label: 'Undo',
                    onClick: () =>
                      saveWorkspace.mutate(
                        { restoreInputCodes: [inputCode] },
                        { onSuccess: markSaved, onError: workspaceError },
                      ),
                  },
                });
              },
              onError: workspaceError,
            },
          );
        }}
      />

      <MonitoringAddOtherDialog
        open={addOtherOpen}
        options={view?.otherResultOptions ?? []}
        saving={saveWorkspace.isPending}
        onClose={() => setAddOtherOpen(false)}
        onConfirm={(inputCode) => {
          saveWorkspace.mutate(
            { extraInputCodes: [inputCode] },
            {
              onSuccess: () => {
                markSaved();
                setAddOtherOpen(false);
                setEditingCode(inputCode);
              },
              onError: workspaceError,
            },
          );
        }}
      />

      <MonitoringReferenceDetailsDialog
        open={Boolean(referenceRow)}
        itemLabel={referenceRow?.label ?? ''}
        popover={
          presented.find((row) => row.inputCode === referenceRow?.inputCode)?.presentation.reference.popover ?? {
            title: 'Reference details',
            appliesBecause: [],
            configuredValue: null,
            usedFor: 'Clinical monitoring',
            currentValue: null,
            sourceName: 'Reference Values Master',
            sourceCitation: null,
            sourceUrl: null,
            medicationRules: [],
          }
        }
        onClose={() => setReferenceCode(null)}
      />

      <MonitoringUploadModal
        open={uploadOpen}
        uploading={extract.isPending}
        error={extract.isError ? errorMessage(extract.error, 'Could not extract results from that file.') : null}
        onClose={() => {
          setUploadOpen(false);
          extract.reset();
        }}
        onFile={(file, sourceType) => {
          extract.mutate(
            { file, sourceType },
            {
              onSuccess: () => {
                markSaved();
                setUploadOpen(false);
              },
              onError: (error) => toast.error(errorMessage(error, 'Could not extract results from that file.')),
            },
          );
        }}
        onAnalyzeScreenshots={(files, note) => {
          extract.mutate(
            { files, sourceType: 'screenshot', note },
            {
              onSuccess: () => {
                markSaved();
                setUploadOpen(false);
              },
              onError: (error) =>
                toast.error(errorMessage(error, 'Could not extract results from those screenshots.')),
            },
          );
        }}
        onEnterManually={() => {
          setUploadOpen(false);
          const firstPending = monitoring.find((row) => row.result.status === 'PENDING');
          if (firstPending) setEditingCode(firstPending.inputCode);
          else toast.message('Use Add result on a monitoring item to enter a result.');
        }}
      />

      <ExtractionReviewModal
        extraction={pendingExtraction}
        monitoring={monitoring}
        confirming={confirmExtraction.isPending}
        onClose={() => {
          if (!pendingExtraction) return;
          rejectExtraction.mutate(pendingExtraction.id, {
            onError: (error) => toast.error(errorMessage(error, 'Could not discard the extracted results.')),
          });
        }}
        onConfirm={(selectedCodes) => {
          if (!pendingExtraction) return;
          confirmExtraction.mutate(
            { extractionId: pendingExtraction.id, selectedCodes },
            {
              onSuccess: markSaved,
              onError: (error) => toast.error(errorMessage(error, 'Could not confirm extracted results.')),
            },
          );
        }}
      />
    </div>
  );
}

function MonitoringStatusStrip({
  counts,
  canContinue,
}: {
  counts: {
    actionRequired: number;
    reviewRequired: number;
    unavailable: number;
    noActionNeeded: number;
  };
  canContinue: boolean;
}) {
  return (
    <aside className="renew-summary rounded-2xl border border-[#d7e2e6] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <span className="font-semibold text-[#163447]">Monitoring</span>
        <span className={counts.actionRequired ? 'font-medium text-[#b42318]' : 'text-[#7a8b94]'}>
          {counts.actionRequired} action required
        </span>
        <span className={counts.reviewRequired ? 'font-medium text-[#b54708]' : 'text-[#7a8b94]'}>
          {counts.reviewRequired} review required
        </span>
        <span className="text-[#7a8b94]">{counts.unavailable} unavailable</span>
        <span className="text-[#027A48]">{counts.noActionNeeded} no action needed</span>
        <span className={`ml-auto font-medium ${canContinue ? 'text-[#166534]' : 'text-[#1e4b73]'}`}>
          {canContinue ? 'Ready to continue' : 'Document remaining items'}
        </span>
      </div>
    </aside>
  );
}
