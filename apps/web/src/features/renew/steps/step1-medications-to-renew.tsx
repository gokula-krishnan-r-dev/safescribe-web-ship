'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Loader2,
  Plus,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import {
  ClinicalCheckbox,
  ClinicalPrimaryButton,
} from '@/features/consultations/clinical-ui';
import { useSaveStep } from '@/features/consultations/hooks';
import { useWizardBeforeLeave } from '@/features/consultations/wizard-nav';
import { cn } from '@/lib/utils';
import {
  findRenewDuplicates,
  isEmptyTherapyReview,
  isEmptyMonitoringSafety,
  isEmptyRenewalDecision,
  medicationDisplayName,
  parseRenewPayload,
  prefillVerifiedFrom,
  shouldOpenMedicationMatchDialog,
  type RenewCcddCandidate,
  type RenewMedication,
  type RenewPayload,
} from '@safescript/shared';
import { useExtractRenewMedications } from '../hooks';
import { readRenewDraft, writeRenewDraft } from '../format';
import { MedicationCaptureRow, type CaptureMode } from './medication-capture';
import { MedicationExtractionReview } from './medication-extraction-review';
import { MedicationReviewTable } from './medication-review-table';
import { MedicationEditDialog } from './medication-edit-dialog';
import { RenewalRequestPanel } from './renewal-request-panel';
import { CcddMatchDialog } from './ccdd-match-dialog';

export type MedicationsSubstep = 'list' | 'request';

function keepExtractedMedication(med: RenewMedication): RenewMedication {
  return {
    ...med,
    ccddMatchStatus: 'unmatched',
    ccddCandidates: [],
    resolutionStatus: 'UNRESOLVED',
    pharmacistEdited: true,
    reviewStatus: 'confirmed',
    productIdentity: {
      sourceDisplayName: med.productIdentity?.sourceDisplayName || med.raw.medicationText || '',
      productName: med.productIdentity?.productName ?? med.normalized.brandName,
      brandName: med.normalized.brandName,
      din: med.normalized.din,
      manufacturer: med.productIdentity?.manufacturer,
      matchMethod: 'UNRESOLVED',
      matchConfidence: 0,
      isExplicitProduct: med.productIdentity?.isExplicitProduct,
    },
  };
}

type ImportStatus =
  | 'idle'
  | 'processing'
  | 'success'
  | 'partial'
  | 'failed'
  | 'unreadable'
  | 'unsupported';

export function Step1MedicationsToRenew({
  consultationId,
  initialPayload,
  onSaved,
  onContinueToTherapyReview,
  requestedSubstep,
  onRequestedSubstepHandled,
  onWorkspaceChange,
}: {
  consultationId: string;
  initialPayload: unknown;
  onSaved?: () => void;
  onContinueToTherapyReview: () => void;
  requestedSubstep?: MedicationsSubstep | null;
  onRequestedSubstepHandled?: () => void;
  onWorkspaceChange?: (next: { substep: MedicationsSubstep; confirmed: boolean }) => void;
}) {
  const [payload, setPayload] = useState<RenewPayload>(() => {
    const draft = readRenewDraft(consultationId);
    const parsed = parseRenewPayload(draft ?? initialPayload);
    const fromServer = parseRenewPayload(initialPayload);
    if (isEmptyTherapyReview(parsed.therapyReview) && !isEmptyTherapyReview(fromServer.therapyReview)) {
      parsed.therapyReview = fromServer.therapyReview;
    }
    if (isEmptyMonitoringSafety(parsed.monitoringSafety) && !isEmptyMonitoringSafety(fromServer.monitoringSafety)) {
      parsed.monitoringSafety = fromServer.monitoringSafety;
    }
    if (isEmptyRenewalDecision(parsed.renewalDecision) && !isEmptyRenewalDecision(fromServer.renewalDecision)) {
      parsed.renewalDecision = fromServer.renewalDecision;
    }
    return parsed;
  });
  const [captureMode, setCaptureMode] = useState<CaptureMode>('none');
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [listExpanded, setListExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [extractedDrafts, setExtractedDrafts] = useState<RenewMedication[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [ambiguousQueue, setAmbiguousQueue] = useState<string[]>([]);
  const [ignoredDuplicates, setIgnoredDuplicates] = useState<Set<string>>(new Set());
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const requestHeadingRef = useRef<HTMLHeadingElement>(null);
  const captureRegionRef = useRef<HTMLDivElement>(null);
  const editAllQueue = useRef<string[] | null>(null);
  const hydrated = useRef(false);

  const saveStep = useSaveStep(consultationId);
  const extract = useExtractRenewMedications(consultationId);
  const saveStepRef = useRef(saveStep);
  saveStepRef.current = saveStep;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const persist = useCallback(async (next: RenewPayload) => {
    writeRenewDraft(consultationId, next);
    await saveStepRef.current.mutateAsync({
      stepIndex: 0,
      currentStep: 'RENEW_MEDICATIONS',
      data: next as unknown as Record<string, unknown>,
    });
    onSavedRef.current?.();
  }, [consultationId]);

  useWizardBeforeLeave(() => persist(payload));

  useEffect(() => {
    if (!lastAddedId) return;
    const t = window.setTimeout(() => setLastAddedId(null), 1600);
    return () => window.clearTimeout(t);
  }, [lastAddedId]);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeRenewDraft(consultationId, payload);
    const t = window.setTimeout(() => {
      void persist(payload);
    }, 900);
    return () => window.clearTimeout(t);
  }, [payload, consultationId, persist]);

  const duplicates = useMemo(
    () =>
      findRenewDuplicates(payload.medicationList.items).filter((p) => {
        const key = [p.aId, p.bId].sort().join(':');
        return !ignoredDuplicates.has(key);
      }),
    [payload.medicationList.items, ignoredDuplicates],
  );

  const editing =
    payload.medicationList.items.find((m) => m.id === editingId) ??
    extractedDrafts.find((m) => m.id === editingId) ??
    null;
  const ambiguousMed =
    payload.medicationList.items.find((m) => m.id === ambiguousQueue[0]) ?? null;

  const setItems = (items: RenewMedication[], extras: Partial<RenewPayload['medicationList']> = {}) => {
    setPayload((prev) => ({
      ...prev,
      medicationList: {
        ...prev.medicationList,
        items,
        confirmed: extras.confirmed ?? false,
        ...extras,
      },
    }));
  };

  const addMedications = useCallback((incoming: RenewMedication[], summary?: string) => {
    setPayload((prev) => {
      const items = [...prev.medicationList.items, ...incoming];
      const verified =
        prev.renewalRequest.verifiedFrom ??
        prefillVerifiedFrom(incoming[0]?.source.sourceSystem, incoming[0]?.source.documentType);
      return {
        ...prev,
        medicationList: {
          ...prev.medicationList,
          items,
          confirmed: false,
          lastImportSummary:
            summary ??
            (incoming.length > 1
              ? `${incoming.length} medications identified from uploaded document`
              : prev.medicationList.lastImportSummary),
        },
        renewalRequest: {
          ...prev.renewalRequest,
          verifiedFrom: verified,
        },
      };
    });
    const ambiguous = incoming.filter((m) => shouldOpenMedicationMatchDialog(m)).map((m) => m.id);
    if (ambiguous.length) {
      setAmbiguousQueue((q) => [...q, ...ambiguous.filter((id) => !q.includes(id))]);
    }
  }, []);

  const lastAddKeyRef = useRef<string | null>(null);
  const lastAddAtRef = useRef(0);

  const handleDrugSelect = useCallback((drug: DrugSearchResult) => {
    const now = Date.now();
    if (lastAddKeyRef.current === drug.id && now - lastAddAtRef.current < 500) return;
    lastAddKeyRef.current = drug.id;
    lastAddAtRef.current = now;

    const din = drug.codeDisplay?.replace(/[^\d]/g, '') || null;
    const med: RenewMedication = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? `rmed_${crypto.randomUUID().slice(0, 12)}`
          : `rmed_${Date.now()}`,
      source: { type: 'manual_search' },
      raw: { medicationText: drug.label },
      normalized: {
        medicationConceptId: drug.id,
        brandName: drug.brandName || null,
        genericName: drug.genericName || null,
        strength: drug.strength || null,
        dosageForm: drug.dosageForm || null,
        din,
      },
      confidence: { medication: 1, strength: drug.strength ? 1 : null },
      reviewStatus: 'confirmed',
      ccddMatchStatus: drug.source === 'ccdd' || drug.source === 'rxnorm' ? 'matched' : 'unmatched',
      resolutionStatus: 'AUTO_RESOLVED',
      productIdentity: {
        sourceDisplayName: drug.label,
        productName: drug.brandName || drug.label,
        brandName: drug.brandName || null,
        din,
        matchMethod: 'PHARMACIST_SELECTED',
        matchConfidence: 1,
      },
      clinicalIdentity: {
        ingredientIds: [drug.id],
        ingredientNames: drug.genericName ? [drug.genericName] : [],
        strength: drug.strength ?? null,
        dosageForm: drug.dosageForm ?? null,
        ccddClinicalConceptId: drug.id,
      },
      pharmacistEdited: true,
    };
    addMedications([med]);
    setLastAddedId(med.id);
    toast.success(`${drug.label} added`);
  }, [addMedications]);

  const runExtract = async (
    files: File | File[],
    sourceType: 'screenshot' | 'pharmacy_document',
    note?: string,
  ) => {
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    if (!list.length) return;
    const unsupported = list.find((file) => {
      const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
      return !(
        ['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext) ||
        file.type.startsWith('image/') ||
        file.type === 'application/pdf'
      );
    });
    if (unsupported) {
      setImportStatus('unsupported');
      setImportMessage('This file type is not supported. Upload a PDF, PNG, or JPG.');
      return;
    }
    setImportStatus('processing');
    setImportMessage(null);
    try {
      const result = await extract.mutateAsync({ files: list, sourceType, note });
      if (result.imageQuality === 'poor' && !result.medications.length) {
        setImportStatus('unreadable');
        setImportMessage(
          result.warnings[0] ??
            'Image is difficult to read. Upload a clearer screenshot or enter the medications manually.',
        );
        return;
      }
      if (!result.medications.length) {
        setImportStatus('failed');
        setImportMessage(
          result.warnings[0] ??
            "No medications identified. We couldn't reliably extract a medication list from this file.",
        );
        return;
      }
      const reviewCount = result.medications.filter((m) => m.reviewStatus === 'needs_review').length;
      const sourceLabel =
        sourceType === 'screenshot'
          ? `${list.length} screenshot${list.length === 1 ? '' : 's'}`
          : 'uploaded document';
      const summary = reviewCount
        ? `${result.medications.length} medications identified from ${sourceLabel}. ${reviewCount} row${reviewCount === 1 ? '' : 's'} need review.`
        : `${result.medications.length} medications identified from ${sourceLabel}`;
      setExtractedDrafts(result.medications);
      setSelectedDraftIds(new Set(result.medications.map((m) => m.id)));
      setImportStatus(reviewCount ? 'partial' : 'success');
      setImportMessage(summary);
      setCaptureMode('none');
    } catch (err) {
      const message =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not read medications from this file.';
      setImportStatus('failed');
      setImportMessage(message);
    }
  };

  const confirmMedications = () => {
    if (!payload.medicationList.items.length) {
      toast.error('Add at least one medication before confirming.');
      return;
    }
    setPayload((prev) => ({
      ...prev,
      medicationList: {
        ...prev.medicationList,
        confirmed: true,
        expanded: false,
        confirmedAt: new Date().toISOString(),
      },
      renewalRequest: { ...prev.renewalRequest, expanded: true },
    }));
    window.setTimeout(() => requestHeadingRef.current?.focus(), 80);
  };

  const continueNext = () => {
    const req = payload.renewalRequest;
    if (!payload.medicationList.confirmed) {
      toast.error('Confirm the medication list first.');
      return;
    }
    if (!req.requestedDuration) {
      toast.error('Select a requested duration.');
      return;
    }
    if (req.requestedDuration === 'custom' && !req.customDurationDays) {
      toast.error('Enter a custom duration in days.');
      return;
    }
    if (!req.reasons.length) {
      toast.error('Select why renewal is needed.');
      return;
    }
    if (!req.verifiedFrom) {
      toast.error('Select how therapy was verified.');
      return;
    }
    if (!req.pharmacistConfirmedAccuracy) {
      toast.error('Confirm the medication information is accurate before continuing.');
      return;
    }
    void persist(payload).then(onContinueToTherapyReview);
  };

  const medCount = payload.medicationList.items.length;
  const listOpen = payload.medicationList.expanded;
  const requestOpen = payload.renewalRequest.expanded;
  const processing = importStatus === 'processing' || extract.isPending;
  const requestComplete =
    Boolean(payload.renewalRequest.requestedDuration) &&
    (payload.renewalRequest.requestedDuration !== 'custom' ||
      Boolean(payload.renewalRequest.customDurationDays)) &&
    payload.renewalRequest.reasons.length > 0 &&
    Boolean(payload.renewalRequest.verifiedFrom) &&
    payload.renewalRequest.pharmacistConfirmedAccuracy;

  const openMedicationList = useCallback(() => {
    setPayload((prev) => ({
      ...prev,
      medicationList: { ...prev.medicationList, expanded: true },
      renewalRequest: { ...prev.renewalRequest, expanded: false },
    }));
  }, []);

  const openRenewalRequest = useCallback(() => {
    setPayload((prev) => {
      if (!prev.medicationList.confirmed) return prev;
      return {
        ...prev,
        medicationList: { ...prev.medicationList, expanded: false },
        renewalRequest: { ...prev.renewalRequest, expanded: true },
      };
    });
  }, []);

  const toggleMedicationList = () => {
    if (listOpen) {
      if (payload.medicationList.confirmed) openRenewalRequest();
      else {
        setPayload((prev) => ({
          ...prev,
          medicationList: { ...prev.medicationList, expanded: false },
        }));
      }
    } else {
      openMedicationList();
    }
  };

  useEffect(() => {
    onWorkspaceChange?.({
      substep: listOpen || !payload.medicationList.confirmed ? 'list' : 'request',
      confirmed: payload.medicationList.confirmed,
    });
  }, [listOpen, payload.medicationList.confirmed, onWorkspaceChange]);

  useEffect(() => {
    if (!requestedSubstep) return;
    if (requestedSubstep === 'list') openMedicationList();
    else openRenewalRequest();
    onRequestedSubstepHandled?.();
  }, [requestedSubstep, openMedicationList, openRenewalRequest, onRequestedSubstepHandled]);

  const goBackToMedicationList = openMedicationList;

  const clearExtraction = () => {
    setExtractedDrafts([]);
    setSelectedDraftIds(new Set());
  };

  const addSelectedDrafts = () => {
    const selected = extractedDrafts.filter((m) => selectedDraftIds.has(m.id));
    if (!selected.length) {
      toast.error('Select at least one medication to add.');
      return;
    }
    addMedications(
      selected,
      selected.length > 1
        ? `${selected.length} medications added from extraction`
        : undefined,
    );
    toast.success(
      selected.length === 1 ? 'Medication added' : `${selected.length} medications added`,
    );
    clearExtraction();
  };

  return (
    <>
    <div className="renew-step1">
      <div className="renew-main space-y-[14px]">
        <div className="mb-1">
          <h1 className="text-[26px] font-bold leading-8 tracking-tight text-[#102a43]">
            Medications to Renew
          </h1>
          <p className="mt-1 text-[14px] leading-5 text-[#52677a]">
            Confirm the current medications, then provide a few renewal details.
          </p>
        </div>

          <section className="overflow-hidden rounded-[14px] border border-[#d9e4e8] bg-white">
            <div className="flex min-h-[72px] w-full items-center gap-3 px-5 sm:px-6">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={toggleMedicationList}
                aria-expanded={listOpen}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                    payload.medicationList.confirmed
                      ? 'bg-[#0b9560] text-white'
                      : 'bg-primary text-white',
                  )}
                >
                  {payload.medicationList.confirmed ? <Check className="h-4 w-4" /> : '1'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-6 text-[#102a43]">
                    Medication list
                  </span>
                  {payload.medicationList.confirmed ? (
                    <span className="text-[13px] text-[#7b8b99]">
                      {medCount} medication{medCount === 1 ? '' : 's'} confirmed
                    </span>
                  ) : null}
                </span>
                {payload.medicationList.confirmed && !listOpen ? (
                  <span className="text-sm font-medium text-primary">View / edit</span>
                ) : null}
              </button>
              {listOpen ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/[0.06]"
                    >
                      <Lightbulb className="h-4 w-4" />
                      Tips
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-4">
                    <p className="text-sm font-semibold text-[#102a43]">Adding medications</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#52677a]">
                      <li>Search opens a window to pick the exact product and enter current directions.</li>
                      <li>Paste a screenshot or upload a profile, then review extracted rows before they join the list.</li>
                      <li>Confirm the list to unlock the renewal request.</li>
                    </ul>
                  </PopoverContent>
                </Popover>
              ) : null}
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8]"
                aria-expanded={listOpen}
                aria-label={listOpen ? 'Collapse medication list' : 'Expand medication list'}
                onClick={toggleMedicationList}
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', listOpen && 'rotate-180')}
                />
              </button>
            </div>

            {listOpen ? (
              <div className="space-y-5 border-t border-[#edf3f4] px-5 py-5 sm:px-6">
                <div ref={captureRegionRef} tabIndex={-1} className="outline-none">
                  <MedicationCaptureRow
                    mode={captureMode}
                    onModeChange={(next) => {
                      if (next === 'search') {
                        setCaptureMode('none');
                        setAddOpen(true);
                        return;
                      }
                      setCaptureMode(next);
                    }}
                    disabled={processing}
                    processing={processing}
                    addedItems={payload.medicationList.items}
                    highlightId={lastAddedId}
                    onDrugSelect={handleDrugSelect}
                    onAnalyzeScreenshots={(files) => void runExtract(files, 'screenshot')}
                    onAnalyzeUpload={(files) => void runExtract(files, 'pharmacy_document')}
                  />
                </div>

                {processing ? (
                  <div className="flex items-center gap-3 rounded-xl border border-[#d9e3e6] bg-[#f7fbfb] px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <div>
                      <p className="text-sm font-medium text-[#163447]">Extracting…</p>
                      <p className="text-[12px] text-[#7b8b94]">This usually takes a few seconds.</p>
                    </div>
                  </div>
                ) : null}

                {extractedDrafts.length ? (
                  <MedicationExtractionReview
                    items={extractedDrafts}
                    selectedIds={selectedDraftIds}
                    onToggle={(id) =>
                      setSelectedDraftIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    onToggleAll={(next) =>
                      setSelectedDraftIds(next ? new Set(extractedDrafts.map((m) => m.id)) : new Set())
                    }
                    onEdit={setEditingId}
                    onAddSelected={addSelectedDrafts}
                    onDiscard={clearExtraction}
                  />
                ) : null}

                {importMessage && importStatus !== 'processing' && !extractedDrafts.length ? (
                  <div
                    className={cn(
                      'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
                      importStatus === 'failed' || importStatus === 'unreadable' || importStatus === 'unsupported'
                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                        : 'border-[#d9e3e6] bg-[#f7fbfb] text-[#163447]',
                    )}
                  >
                    {(importStatus === 'failed' ||
                      importStatus === 'unreadable' ||
                      importStatus === 'unsupported') && (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <p>{importMessage}</p>
                  </div>
                ) : null}

                {duplicates.map((dup) => (
                  <div
                    key={`${dup.aId}:${dup.bId}`}
                    className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
                  >
                    <p className="font-semibold">Possible duplicate</p>
                    <p className="mt-0.5">
                      {dup.aLabel} and {dup.bLabel} may represent the same medication.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() =>
                          setIgnoredDuplicates((prev) => {
                            const next = new Set(prev);
                            next.add([dup.aId, dup.bId].sort().join(':'));
                            return next;
                          })
                        }
                      >
                        Keep both
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() =>
                          setItems(payload.medicationList.items.filter((m) => m.id !== dup.bId))
                        }
                      >
                        Remove duplicate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setEditingId(dup.aId)}
                      >
                        Review
                      </Button>
                    </div>
                  </div>
                ))}

                {medCount > 0 ? (
                  <>
                    <MedicationReviewTable
                      items={payload.medicationList.items}
                      collapsed={!listExpanded}
                      embedded
                      onExpand={() => setListExpanded(true)}
                      onEdit={setEditingId}
                      onEditAll={() => {
                        const ids = payload.medicationList.items.map((m) => m.id);
                        editAllQueue.current = ids.slice(1);
                        if (ids[0]) setEditingId(ids[0]);
                      }}
                      onDelete={(ids) => {
                        const idSet = new Set(ids);
                        const current = payload.medicationList.items;
                        const removed = current.filter((m) => idSet.has(m.id));
                        if (!removed.length) return;
                        setItems(current.filter((m) => !idSet.has(m.id)));
                        if (editAllQueue.current) {
                          const remaining = editAllQueue.current.filter((id) => !idSet.has(id));
                          editAllQueue.current = remaining.length ? remaining : null;
                        }
                        setAmbiguousQueue((q) => q.filter((id) => !idSet.has(id)));
                        if (editingId && idSet.has(editingId)) setEditingId(null);
                        toast.success(
                          removed.length === 1
                            ? 'Medication removed'
                            : `${removed.length} medications removed`,
                          {
                            duration: 8000,
                            action: {
                              label: 'Undo',
                              onClick: () => addMedications(removed),
                            },
                          },
                        );
                      }}
                    />
                    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/[0.04]"
                        onClick={() => {
                          setCaptureMode('none');
                          window.setTimeout(() => {
                            captureRegionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            captureRegionRef.current?.focus();
                          }, 50);
                        }}
                      >
                        Add more medications
                        <Plus className="h-4 w-4" />
                      </button>
                      <ClinicalPrimaryButton onClick={confirmMedications} disabled={medCount === 0}>
                        Confirm medication list
                        <Check className="h-4 w-4" />
                      </ClinicalPrimaryButton>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-[14px] border border-[#d9e4e8] bg-white">
            <button
              type="button"
              disabled={!payload.medicationList.confirmed}
              className="flex min-h-[72px] w-full items-center gap-3 px-5 text-left disabled:cursor-not-allowed disabled:opacity-60 sm:px-6"
              onClick={() => {
                if (!payload.medicationList.confirmed) return;
                if (!requestOpen) openRenewalRequest();
              }}
              aria-expanded={requestOpen}
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                  requestOpen || payload.medicationList.confirmed
                    ? 'bg-primary text-white'
                    : 'bg-[#eef3f5] text-[#8a9aa3]',
                )}
              >
                2
              </span>
              <h2
                ref={requestHeadingRef}
                tabIndex={-1}
                className="flex-1 text-[16px] font-semibold leading-6 text-[#102a43] outline-none"
              >
                Renewal request
              </h2>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[#8a9aa3] transition-transform',
                  requestOpen && 'rotate-180',
                )}
              />
            </button>
            {requestOpen ? (
              <div className="space-y-6 border-t border-[#edf3f4] px-6 py-6 sm:px-7">
                <RenewalRequestPanel
                  value={payload.renewalRequest}
                  onChange={(renewalRequest) => setPayload((prev) => ({ ...prev, renewalRequest }))}
                />
                <ClinicalCheckbox
                  id="renew-step1-accuracy"
                  className="rounded-xl border border-primary/20 bg-[#ecf7f7] px-4 py-3.5"
                  checked={payload.renewalRequest.pharmacistConfirmedAccuracy}
                  onChange={(checked) =>
                    setPayload((prev) => ({
                      ...prev,
                      renewalRequest: {
                        ...prev.renewalRequest,
                        pharmacistConfirmedAccuracy: checked,
                      },
                    }))
                  }
                  label="I have reviewed and confirmed the medication information above is accurate."
                  description="The pharmacist is responsible for verifying all information before proceeding."
                />
                <div className="flex items-center justify-between gap-4 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg border-[#d9e4e8] bg-white px-4 text-[#102a43]"
                    onClick={goBackToMedicationList}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="h-10 min-w-[240px] rounded-lg px-5"
                    disabled={!payload.medicationList.confirmed || !requestComplete}
                    onClick={continueNext}
                  >
                    Continue to Therapy Review
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
      </div>
    </div>

      <MedicationEditDialog
        open={addOpen || Boolean(editing)}
        mode={addOpen ? 'ADD_MANUAL' : 'EDIT_EXISTING'}
        medication={addOpen ? null : editing}
        onClose={() => {
          setAddOpen(false);
          editAllQueue.current = null;
          setEditingId(null);
        }}
        onSave={(next) => {
          if (addOpen) {
            addMedications([next]);
            setLastAddedId(next.id);
            toast.success(`${medicationDisplayName(next)} added`);
            setAddOpen(false);
            return;
          }
          if (extractedDrafts.some((m) => m.id === next.id)) {
            setExtractedDrafts((prev) => prev.map((m) => (m.id === next.id ? next : m)));
          } else {
            setItems(
              payload.medicationList.items.map((m) => (m.id === next.id ? next : m)),
              { confirmed: false },
            );
          }
          const queued = editAllQueue.current?.[0];
          if (queued) {
            editAllQueue.current = editAllQueue.current?.slice(1) ?? null;
            setEditingId(queued);
          } else {
            editAllQueue.current = null;
            setEditingId(null);
          }
        }}
      />

      <CcddMatchDialog
        medication={ambiguousMed}
        onSkip={() => {
          if (ambiguousMed) {
            setItems(
              payload.medicationList.items.map((m) =>
                m.id === ambiguousMed.id ? keepExtractedMedication(m) : m,
              ),
              { confirmed: false },
            );
          }
          setAmbiguousQueue((q) => q.slice(1));
        }}
        onSearchManually={() => {
          if (ambiguousMed) {
            setItems(
              payload.medicationList.items.map((m) =>
                m.id === ambiguousMed.id ? keepExtractedMedication(m) : m,
              ),
              { confirmed: false },
            );
          }
          setAmbiguousQueue((q) => q.slice(1));
          setAddOpen(true);
        }}
        onSelect={(candidate: RenewCcddCandidate) => {
          if (!ambiguousMed) return;
          setItems(
            payload.medicationList.items.map((m) =>
              m.id === ambiguousMed.id
                ? {
                    ...m,
                    normalized: {
                      ...m.normalized,
                      medicationConceptId: candidate.id,
                      brandName: candidate.brandName ?? m.normalized.brandName,
                      genericName: candidate.genericName ?? m.normalized.genericName,
                      strength: candidate.strength ?? m.normalized.strength,
                      dosageForm: candidate.dosageForm ?? m.normalized.dosageForm,
                      din: candidate.din ?? m.normalized.din,
                    },
                    ccddMatchStatus: 'matched',
                    ccddCandidates: [],
                    resolutionStatus: 'AUTO_RESOLVED',
                    pharmacistEdited: true,
                    reviewStatus: 'confirmed',
                    productIdentity: {
                      sourceDisplayName:
                        m.productIdentity?.sourceDisplayName || m.raw.medicationText || candidate.label,
                      productName: candidate.brandName || candidate.label,
                      brandName: candidate.brandName,
                      din: candidate.din,
                      matchMethod: 'PHARMACIST_SELECTED',
                      matchConfidence: 1,
                    },
                    clinicalIdentity: {
                      ingredientIds: [candidate.id],
                      ingredientNames: candidate.genericName ? [candidate.genericName] : [],
                      strength: candidate.strength,
                      dosageForm: candidate.dosageForm,
                      ccddClinicalConceptId: candidate.id,
                    },
                  }
                : m,
            ),
            { confirmed: false },
          );
          setAmbiguousQueue((q) => q.slice(1));
        }}
      />
    </>
  );
}
