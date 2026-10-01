'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Info,
  Loader2,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '@/features/consultations/clinical-ui';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { CompleteConsultationModal } from '@/features/consultations/documents/complete-consultation-modal';
import { FinishConsultationButton } from '@/features/consultations/documents/documents-review-ui';
import type { PatientDocumentInfo } from '@/features/consultations/documents/types';
import { useCompleteConsultation, useConsultation, useCreateConsultation } from '@/features/consultations/hooks';
import { purgeConsultationLocalState } from '@/features/consultations/purge-consultation-local-state';
import { useAuthStore } from '@/features/auth/auth-store';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api-client';
import {
  RENEW_CUSTOM_DURATION_LIMITS,
  RENEW_DURATION_OPTIONS,
  bulkDurationResultCopy,
  confirmPlanIncompleteCopy,
  confirmedPlanDurationSummary,
  isRenewPatientInfoConfirmed,
  parseRenewPayload,
  planConfirmIssues,
  validateRenewPatientInfo,
  isoDateLocal,
  type RenewDocumentKind,
  type RenewDurationId,
} from '@safescript/shared';
import {
  useApplyRenewPlanDuration,
  useConfirmRenewPlan,
  useCompleteRenewCommunication,
  useGenerateRenewDocuments,
  usePatchRenewPlan,
  useRenewAllEligible,
  useRenewStep4,
  useSaveRenewCommunication,
  useSaveRenewPatientInfo,
  useUndoRenewPlanDuration,
  useUpdateRenewDocument,
} from '../hooks';
import { RenewalPlanBulkBar } from './renewal-plan-bulk-bar';
import { RenewalPlanTable } from './renewal-plan-table';
import { RenewDocumentsPanel } from './renew-documents-panel';

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

export function Step4RenewDocument({
  consultationId,
  initialPayload,
  onBack,
  onSaved,
  onCompleted,
  onStartAnother,
}: {
  consultationId: string;
  initialPayload: unknown;
  onBack: () => void;
  onSaved?: () => void;
  onCompleted: () => void;
  onStartAnother?: (nextId: string) => void;
}) {
  const parsed = parseRenewPayload(initialPayload);
  const ready =
    parsed.medicationList.confirmed &&
    parsed.medicationList.items.length > 0 &&
    parsed.monitoringSafety.completed;

  const query = useRenewStep4(consultationId, ready);
  const patchPlan = usePatchRenewPlan(consultationId);
  const renewAll = useRenewAllEligible(consultationId);
  const applyDuration = useApplyRenewPlanDuration(consultationId);
  const undoDuration = useUndoRenewPlanDuration(consultationId);
  const confirm = useConfirmRenewPlan(consultationId);
  const savePatient = useSaveRenewPatientInfo(consultationId);
  const saveCommunication = useSaveRenewCommunication(consultationId);
  const completeCommunication = useCompleteRenewCommunication(consultationId);
  const generate = useGenerateRenewDocuments(consultationId);
  const updateDoc = useUpdateRenewDocument(consultationId);
  const complete = useCompleteConsultation(consultationId);
  const createConsultation = useCreateConsultation();
  const authUser = useAuthStore((s) => s.user);
  const consult = useConsultation(consultationId);

  const [planOpen, setPlanOpen] = useState<boolean | null>(null);
  const [docsOpen, setDocsOpen] = useState<boolean | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingDuration, setPendingDuration] = useState<{
    durationId: RenewDurationId;
    customDurationDays: number | null;
    manualCount: number;
  } | null>(null);
  const [planEditWarning, setPlanEditWarning] = useState(false);
  const [patientEditWarning, setPatientEditWarning] = useState(false);
  const [pendingPatientSave, setPendingPatientSave] = useState<PatientDocumentInfo | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [generatingKind, setGeneratingKind] = useState<RenewDocumentKind | null>(null);
  const [polishingDocuments, setPolishingDocuments] = useState(false);
  const [patientExtras, setPatientExtras] = useState<{ phone: string; address: string }>({
    phone: '',
    address: '',
  });
  /** Local overlay so Name/DOB/PHN survive draft keystrokes (server patientInfo only updates on Save). */
  const [patientDraftOverlay, setPatientDraftOverlay] = useState<PatientDocumentInfo | null>(null);
  const docsRef = useRef<HTMLElement | null>(null);

  const view = query.data;
  const decision = view?.decision;
  const confirmed = Boolean(decision?.confirmed);
  const patientConfirmed = isRenewPatientInfoConfirmed(decision?.patientInfo);
  const requiredReady = Boolean(view?.gate.requiredDocsReady);
  const planExpanded = planOpen ?? decision?.planExpanded ?? !confirmed;
  const docsExpanded = docsOpen ?? decision?.docsExpanded ?? confirmed;

  const markSaved = () => onSaved?.();

  const selectedCount = view?.summary.selectedToRenew ?? 0;
  const durationOptions = view?.durationOptions?.length ? view.durationOptions : [...RENEW_DURATION_OPTIONS];
  const customLimits = view?.customDurationLimits ?? RENEW_CUSTOM_DURATION_LIMITS;
  const confirmIssues = useMemo(
    () => (decision ? planConfirmIssues(decision.items) : []),
    [decision],
  );
  const confirmedSummary = useMemo(
    () => (decision ? confirmedPlanDurationSummary(decision.items) : null),
    [decision],
  );
  const bulkCopy = useMemo(() => {
    const result = decision?.lastDurationBulkResult;
    return result ? bulkDurationResultCopy(result) : null;
  }, [decision?.lastDurationBulkResult]);

  const notifyPlanChanged = () => {
    if (!confirmed) return;
    toast.message('Renewal plan changed. Required documents were regenerated and need review again.');
  };

  const handleToggle = (medicationId: string, selected: boolean) => {
    const row = view?.rows.find((item) => item.medicationId === medicationId);
    patchPlan.mutate(
      {
        medicationId,
        selected,
        ...(selected && !row?.durationId
          ? {
              durationId: view?.requestedDurationId ?? '30_days',
              customDurationDays: row?.customDurationDays ?? null,
              durationSource: 'DEFAULT' as const,
            }
          : {}),
      },
      {
        onSuccess: () => {
          markSaved();
          notifyPlanChanged();
        },
        onError: (error) => toast.error(errorMessage(error, 'Could not update that medication.')),
      },
    );
  };

  const runApplyDuration = (
    durationId: RenewDurationId,
    customDurationDays: number | null,
    overwriteManual: boolean,
  ) => {
    applyDuration.mutate(
      { durationId, customDurationDays, overwriteManual },
      {
        onSuccess: () => {
          setPendingDuration(null);
          markSaved();
          notifyPlanChanged();
        },
        onError: (error) => toast.error(errorMessage(error, 'Could not apply that duration.')),
      },
    );
  };

  const handleApplyDuration = (durationId: RenewDurationId, customDurationDays: number | null) => {
    const manualCount = view?.rows.filter((row) => row.selected && row.durationSource === 'MANUAL').length ?? 0;
    if (manualCount > 0) {
      setPendingDuration({ durationId, customDurationDays, manualCount });
      return;
    }
    runApplyDuration(durationId, customDurationDays, false);
  };

  const focusMedication = (medicationId: string) => {
    setHighlightId(medicationId);
    const el = document.querySelector<HTMLElement>(`[data-renew-plan-row="${medicationId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const control = el?.querySelector<HTMLElement>('select, input[type="number"], input[type="text"]');
    control?.focus();
  };

  const requestPlanExpand = () => {
    if (confirmed && requiredReady && !planExpanded) {
      setPlanEditWarning(true);
      return;
    }
    setPlanOpen(!planExpanded);
  };

  const savePatientInfo = async (info: PatientDocumentInfo, force = false) => {
    const skipped = info.skipped === true;
    const validation = validateRenewPatientInfo({
      patientName: info.name,
      dateOfBirth: info.dateOfBirth,
      phn: info.patientId,
      recordedAgeYears: view?.recordedAgeYears,
      skipped,
    });
    if (!validation.valid) {
      toast.error(
        validation.nameError ??
          validation.dobError ??
          validation.phnError ??
          'Enter valid patient information.',
      );
      throw new Error('Invalid patient information');
    }

    setPatientExtras({
      phone: skipped ? '' : (info.phone?.trim() ?? ''),
      address: skipped ? '' : (info.address?.trim() ?? ''),
    });

    const stored = decision?.patientInfo;
    const identityChanged =
      Boolean(stored?.skipped) !== skipped ||
      (info.name ?? '').trim() !== (stored?.patientName ?? '').trim() ||
      (info.dateOfBirth ?? '').trim() !== (stored?.dateOfBirth ?? '').trim();
    if (!force && requiredReady && patientConfirmed && identityChanged) {
      setPendingPatientSave(info);
      setPatientEditWarning(true);
      throw new Error('Confirm patient identity update');
    }

    await new Promise<void>((resolve, reject) => {
      savePatient.mutate(
        {
          patientName: skipped ? '' : (info.name ?? '').trim(),
          dateOfBirth: skipped ? '' : (info.dateOfBirth ?? '').trim(),
          phn: skipped ? null : (info.patientId ?? '').trim() || null,
          skipped,
        },
        {
          onSuccess: () => {
            setPatientDraftOverlay(null);
            setPatientEditWarning(false);
            setPendingPatientSave(null);
            setDocsOpen(true);
            markSaved();
            toast.success(
              skipped
                ? 'Patient details skipped. Drafting consultation documents…'
                : patientConfirmed
                  ? 'Patient details updated. Required documents were refreshed.'
                  : 'Patient information saved. Drafting consultation documents…',
            );
            setGeneratingKind(null);
            setPolishingDocuments(true);
            generate.mutate(undefined, {
              onSuccess: markSaved,
              onSettled: () => setPolishingDocuments(false),
              onError: (error) =>
                toast.error(
                  errorMessage(
                    error,
                    'Documents were compiled from the renewal plan. Review them, or regenerate if needed.',
                  ),
                ),
            });
            resolve();
          },
          onError: (error) => {
            toast.error(errorMessage(error, 'Could not save patient information.'));
            reject(error);
          },
        },
      );
    });
  };

  const runPendingPatientSave = () => {
    if (!pendingPatientSave) return;
    void savePatientInfo(pendingPatientSave, true).catch(() => undefined);
  };

  const handleCompleteDelete = async () => {
    if (!view?.gate.canComplete) {
      throw new Error(view?.gate.reason ?? 'Review remaining items before completing.');
    }
    await complete.mutateAsync({ documentationConfirmed: true });
    purgeConsultationLocalState(consultationId, {
      tenantId: authUser?.tenantId,
      userId: authUser?.id,
    });
  };

  if (finished) {
    return (
      <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f6f5] text-[#0F6F6B]">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-[22px] font-bold text-[#163447]">Renewal completed</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#5b6b75]">
          Required documentation has been reviewed. Consultation data has been deleted from SafeScribe.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <ClinicalSecondaryButton onClick={onCompleted}>Return to consultations</ClinicalSecondaryButton>
          <ClinicalPrimaryButton
            loading={createConsultation.isPending}
            onClick={() => {
              createConsultation.mutate(
                { module: 'renew' },
                {
                  onSuccess: (next) => {
                    if (onStartAnother) onStartAnother(next.id);
                    else onCompleted();
                  },
                  onError: (error) =>
                    toast.error(errorMessage(error, 'Could not start another consultation.')),
                },
              );
            }}
          >
            Start another consultation
          </ClinicalPrimaryButton>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Complete Monitoring & Safety first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The renewal plan uses the pharmacist-confirmed medications, therapy review, and monitoring from earlier steps.
          </p>
        </div>
        <div className="mt-auto flex items-center border-t border-border pt-4">
          <ClinicalSecondaryButton onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back to Monitoring & Safety
          </ClinicalSecondaryButton>
        </div>
      </div>
    );
  }

  if (query.isLoading && !view) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparing the renewal plan…</p>
      </div>
    );
  }

  if (query.isError || !view) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-xl font-semibold">Couldn’t load the renewal plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMessage(query.error, 'The renewal plan is temporarily unavailable. Retry or go back.')}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
          <ClinicalSecondaryButton onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back to Monitoring & Safety
          </ClinicalSecondaryButton>
          <ClinicalPrimaryButton onClick={() => void query.refetch()}>Retry</ClinicalPrimaryButton>
        </div>
      </div>
    );
  }

  const firstIssueId = confirmIssues.find((issue) => issue.medicationId)?.medicationId ?? null;
  const rowIssueCount = confirmIssues.filter((issue) => issue.medicationId).length;
  const confirmDisabled = confirm.isPending || confirmIssues.length > 0;
  const incompleteCopy = rowIssueCount
    ? confirmPlanIncompleteCopy(rowIssueCount)
    : confirmIssues[0]?.message ?? '';
  const showDurationControls = selectedCount >= 2;
  const showRenewAll = view.rows.length >= 2;
  const allEligibleRenewed =
    view.rows.filter((row) => row.eligible).every((row) => row.selected) && selectedCount > 0;
  const completeReason = view.gate.canComplete ? null : view.gate.reason;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-w-0 space-y-3">
        <section className="overflow-hidden rounded-xl border border-[#d7e2e6] bg-white">
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            aria-expanded={planExpanded}
            onClick={requestPlanExpand}
          >
            <StepIndex done={confirmed}>{confirmed ? <Check className="h-4 w-4" strokeWidth={2.5} /> : '1'}</StepIndex>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#163447]">
                  {confirmed ? 'Renewal plan confirmed' : 'Renewal plan'}
                </span>
                {confirmed && allEligibleRenewed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                    All eligible renewed
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[12px] text-[#5b6b75]">
                {confirmed && !planExpanded
                  ? confirmedSummary ?? `${selectedCount} medications reviewed`
                  : `${view.rows.length} medication${view.rows.length === 1 ? '' : 's'} reviewed`}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-[#0F6F6B]">
              {confirmed && !planExpanded ? 'View / edit' : planExpanded ? 'Collapse' : 'Expand'}
              {planExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>

          {planExpanded ? (
            <div className="space-y-4 border-t border-[#e8eef1] px-4 py-4">
              <p className="text-sm text-[#5b6b75]">Review medications below and confirm which to renew.</p>

              {bulkCopy?.success || bulkCopy?.warning ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-[#eef8f2] px-3.5 py-2.5"
                  role="status"
                  aria-live="polite"
                >
                  <div className="space-y-0.5 text-[13px]">
                    {bulkCopy.success ? (
                      <p className="inline-flex items-center gap-2 font-medium text-[#0b7a52]">
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        {bulkCopy.success}
                      </p>
                    ) : null}
                    {bulkCopy.warning ? (
                      <p className="inline-flex items-center gap-2 font-medium text-amber-800">
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                        {bulkCopy.warning}
                      </p>
                    ) : null}
                  </div>
                  {decision?.lastDurationBulkResult?.canUndo ? (
                    <button
                      type="button"
                      className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
                      disabled={undoDuration.isPending}
                      onClick={() =>
                        undoDuration.mutate(
                          { bulkActionId: decision.lastDurationBulkResult!.bulkActionId },
                          {
                            onSuccess: markSaved,
                            onError: (error) =>
                              toast.error(errorMessage(error, 'Could not undo that duration change.')),
                          },
                        )
                      }
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ) : null}

              <RenewalPlanBulkBar
                selectedCount={selectedCount}
                durationOptions={durationOptions}
                customLimits={customLimits}
                requestedDurationId={view.requestedDurationId}
                showDurationControls={showDurationControls}
                showRenewAll={showRenewAll}
                applying={applyDuration.isPending}
                renewingAll={renewAll.isPending}
                disabled={confirm.isPending}
                onApply={handleApplyDuration}
                onRenewAll={() =>
                  renewAll.mutate(undefined, {
                    onSuccess: markSaved,
                    onError: (error) =>
                      toast.error(errorMessage(error, 'Could not select eligible medications.')),
                  })
                }
              />

              <RenewalPlanTable
                rows={view.rows}
                durationOptions={durationOptions}
                customLimits={customLimits}
                disabled={confirm.isPending || applyDuration.isPending || renewAll.isPending}
                highlightId={highlightId}
                onToggle={handleToggle}
                onDuration={(medicationId, durationId, customDurationDays) => {
                  patchPlan.mutate(
                    {
                      medicationId,
                      selected: true,
                      durationId,
                      customDurationDays,
                      durationSource: 'MANUAL',
                    },
                    {
                      onSuccess: () => {
                        markSaved();
                        notifyPlanChanged();
                      },
                      onError: (error) =>
                        toast.error(errorMessage(error, 'Could not update the duration.')),
                    },
                  );
                }}
              />

              {!confirmed ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p className="flex items-start gap-2 text-[12px] text-[#5b6b75]">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Renewal durations follow province/territory regulations and professional guidelines.
                </p>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {confirmDisabled && incompleteCopy ? (
                    <p className="text-[12px] text-amber-800">
                      {incompleteCopy}{' '}
                      {firstIssueId ? (
                        <button
                          type="button"
                          className="font-semibold text-[#0F6F6B] hover:underline"
                          onClick={() => focusMedication(firstIssueId)}
                        >
                          View medication
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                  <ClinicalPrimaryButton
                    onClick={() => {
                      if (confirmDisabled) {
                        if (firstIssueId) focusMedication(firstIssueId);
                        return;
                      }
                      confirm.mutate(undefined, {
                        onSuccess: () => {
                          setPlanOpen(false);
                          setDocsOpen(true);
                          markSaved();
                          toast.success('Renewal plan confirmed.');
                        },
                        onError: (error) =>
                          toast.error(errorMessage(error, 'Could not confirm the renewal plan.')),
                      });
                    }}
                    loading={confirm.isPending}
                    disabled={confirmDisabled}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm renewal plan
                  </ClinicalPrimaryButton>
                </div>
              </div>
              ) : (
                <p className="flex items-start gap-2 text-[12px] text-[#5b6b75]">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Changes to this plan regenerate the required documents and reset their review status.
                </p>
              )}
            </div>
          ) : null}
        </section>

        <section
          ref={docsRef}
          className={cn(
            'overflow-hidden rounded-xl border border-[#d7e2e6] bg-white',
            !confirmed && 'opacity-80',
          )}
        >
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            aria-expanded={docsExpanded}
            disabled={!confirmed}
            onClick={() => confirmed && setDocsOpen(!docsExpanded)}
          >
            <StepIndex done={view.gate.requiredDocsReviewed} muted={!confirmed}>
              {view.gate.requiredDocsReviewed ? <Check className="h-4 w-4" strokeWidth={2.5} /> : '2'}
            </StepIndex>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#163447]">
                Consultation Documents
              </span>
              <span className="mt-0.5 block text-[12px] text-[#5b6b75]">
                {patientConfirmed
                  ? 'Review, finalize, and export the consultation documents.'
                  : 'Enter patient details, then generate and review required documents.'}
              </span>
            </span>
            {confirmed ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-[#0F6F6B]">
                {docsExpanded ? 'Collapse' : 'Expand'}
                {docsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            ) : null}
          </button>
          {confirmed && docsExpanded ? (
            <div className="border-t border-[#e8eef1] px-4 py-5 sm:px-5">
              <RenewDocumentsPanel
                consultationId={consultationId}
                documents={view.decision.documents}
                patientInfo={view.decision.patientInfo}
                patientExtras={patientExtras}
                patientDraft={patientDraftOverlay}
                patientSaving={savePatient.isPending}
                generatingKind={generatingKind}
                generatingAll={
                  savePatient.isPending ||
                  polishingDocuments ||
                  (generate.isPending && !generatingKind)
                }
                pdfMeta={{
                  tenantName: consult.data?.tenant?.name ?? null,
                  dateLabel: isoDateLocal(),
                  consultationRef: consult.data?.consultationRef ?? consultationId,
                  createdAt: consult.data?.createdAt ?? null,
                  consultationId,
                  pharmacistName: consult.data?.pharmacist
                    ? `${consult.data.pharmacist.firstName} ${consult.data.pharmacist.lastName}`.trim()
                    : [authUser?.firstName, authUser?.lastName].filter(Boolean).join(' ') || null,
                  pharmacistCredentials: 'RPh',
                  pharmacyAddress: consult.data?.tenant?.address ?? null,
                  pharmacyPhone: consult.data?.tenant?.phone ?? null,
                  pharmacyFax: consult.data?.tenant?.faxNumber ?? null,
                }}
                communication={view.decision.communication}
                communicationPending={saveCommunication.isPending || completeCommunication.isPending}
                onPatientDraftChange={(info) => {
                  setPatientDraftOverlay(info);
                  setPatientExtras({
                    phone: info.phone?.trim() ?? '',
                    address: info.address?.trim() ?? '',
                  });
                }}
                onPatientSave={(info) => savePatientInfo(info)}
                onGenerate={(kind: RenewDocumentKind) => {
                  setGeneratingKind(kind);
                  generate.mutate([kind], {
                    onSuccess: () => {
                      markSaved();
                      setGeneratingKind(null);
                    },
                    onError: (error) => {
                      setGeneratingKind(null);
                      toast.error(errorMessage(error, 'Could not generate that document.'));
                    },
                  });
                }}
                onGenerateAll={(kinds) => {
                  setGeneratingKind(null);
                  generate.mutate(kinds, {
                    onSuccess: () => {
                      markSaved();
                    },
                    onError: (error) => {
                      toast.error(errorMessage(error, 'Could not generate those documents.'));
                    },
                  });
                }}
                onSave={async (kind, body, reviewed) => {
                  await updateDoc.mutateAsync({ kind, body, reviewed });
                  markSaved();
                }}
                onMarkCommunicated={async (body) => {
                  await completeCommunication.mutateAsync(body);
                  markSaved();
                }}
              />
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-6 flex w-full shrink-0 flex-col gap-3 border-t border-border bg-consult-workspace py-3 sm:flex-row sm:items-center sm:justify-between">
        <ClinicalSecondaryButton onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Back to Monitoring & Safety
        </ClinicalSecondaryButton>
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          {completeReason ? (
            <p id="renew-complete-reason" className="text-[12px] text-[#5b6b75]">
              {completeReason}
            </p>
          ) : null}
          <FinishConsultationButton
            disabled={!view.gate.canComplete}
            blockedReason={completeReason ?? undefined}
            onClick={() => {
              if (!view.gate.canComplete) return;
              setCompleteOpen(true);
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={planEditWarning}
        onOpenChange={setPlanEditWarning}
        variant="default"
        title="Edit the confirmed renewal plan?"
        description="Editing the confirmed renewal plan will regenerate required documents and reset their review status."
        cancelLabel="Cancel"
        confirmLabel="Continue editing"
        onConfirm={() => {
          setPlanEditWarning(false);
          setPlanOpen(true);
        }}
      />

      <ConfirmDialog
        open={patientEditWarning}
        onOpenChange={(open) => {
          setPatientEditWarning(open);
          if (!open) setPendingPatientSave(null);
        }}
        variant="default"
        title="Update patient information?"
        description="Changing patient information will regenerate required documents and reset their review status."
        cancelLabel="Cancel"
        confirmLabel="Update & regenerate"
        loading={savePatient.isPending}
        onConfirm={runPendingPatientSave}
      />

      <ConfirmDialog
        open={Boolean(pendingDuration)}
        onOpenChange={(open) => {
          if (!open && !applyDuration.isPending) setPendingDuration(null);
        }}
        variant="default"
        title={
          pendingDuration
            ? `Apply ${
                pendingDuration.durationId === 'custom' && pendingDuration.customDurationDays
                  ? `${pendingDuration.customDurationDays} days`
                  : durationOptions.find((option) => option.id === pendingDuration.durationId)?.label ??
                    'this duration'
              } to selected medications?`
            : 'Apply duration to selected medications?'
        }
        description={
          pendingDuration
            ? `${pendingDuration.manualCount} medication${
                pendingDuration.manualCount === 1 ? '' : 's'
              } currently ha${pendingDuration.manualCount === 1 ? 's' : 've'} an individual duration. Manual durations will be preserved.`
            : ''
        }
        cancelLabel="Cancel"
        confirmLabel="Apply where eligible"
        loading={applyDuration.isPending}
        onConfirm={() => {
          if (!pendingDuration) return;
          runApplyDuration(pendingDuration.durationId, pendingDuration.customDurationDays, false);
        }}
      />

      <CompleteConsultationModal
        open={completeOpen}
        consultationId={consultationId}
        deletionDeadline={consult.data?.deletionDeadline}
        startingNext={false}
        onClose={() => setCompleteOpen(false)}
        onConfirmDelete={handleCompleteDelete}
        onCompleted={() => {
          setCompleteOpen(false);
          setFinished(true);
        }}
      />
    </div>
  );
}

function StepIndex({
  done,
  muted,
  children,
}: {
  done?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
        done ? 'bg-[#16A34A] text-white' : muted ? 'bg-muted text-muted-foreground' : 'bg-[#163447] text-white',
      )}
    >
      {children}
    </span>
  );
}
