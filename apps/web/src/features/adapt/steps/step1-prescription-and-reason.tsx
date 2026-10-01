'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/lib/notify';
import { cn } from '@/lib/utils';
import {
  ADAPTATION_TYPES,
  adaptMedicationConceptKey,
  getAdaptationReasons,
  getQuestionLabel,
  hasAdaptOriginalDirections,
  isAdaptationTypeAllowed,
  isAdaptIndicationComplete,
  isAdaptStepOneValid,
  isReasonOther,
  parseAdaptPayload,
  type AdaptationReason,
  type AdaptationType,
  type AdaptDispensingStatus,
  type AdaptIndicationSelection,
  type AdaptPayload,
  type RenewMedication,
} from '@safescript/shared';
import type { DrugSearchResult } from '@/features/consultations/medication-utils';
import { useSaveStep } from '@/features/consultations/hooks';
import { useWizardBeforeLeave } from '@/features/consultations/wizard-nav';
import { MedicationCaptureRow, type CaptureMode } from '@/features/renew/steps/medication-capture';
import {
  MedicationEditDialog,
  type MedicationEditorMode,
} from '@/features/renew/steps/medication-edit-dialog';
import { applyDrugToMedication } from '@/features/renew/steps/medication-regimen-model';
import { useExtractRenewMedications } from '@/features/renew/hooks';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import { ClinicalPendingSummary } from '@/features/consultations/clinical-ui';
import { readAdaptDraft, writeAdaptDraft } from '../format';
import { AdaptOriginalPrescriptionCard } from './adapt-original-prescription-card';
import { AdaptMedicationIndicationPanel } from './adapt-medication-indication-panel';
import { AdaptReasonDropdown } from './adapt-reason-dropdown';
import {
  AdaptCollapsedPrescriptionCard,
  AdaptCollapsedSummaryCard,
  AdaptSectionGlyph,
  ADAPT_TYPE_ICONS,
} from './adapt-step1-ui';

interface Props {
  consultationId: string;
  initialPayload: unknown;
  jurisdiction?: string;
  onSaved?: () => void;
  onBackToDashboard: () => void;
  onContinueToPatientAssessment: () => void;
}

export function Step1PrescriptionAndReason({
  consultationId,
  initialPayload,
  jurisdiction = 'AB',
  onSaved,
  onBackToDashboard,
  onContinueToPatientAssessment,
}: Props) {
  const commentsId = useId();
  const [payload, setPayload] = useState<AdaptPayload>(() => {
    const draft = readAdaptDraft(consultationId, jurisdiction);
    if (draft) return draft;
    return parseAdaptPayload(initialPayload, jurisdiction);
  });

  const section1Ref = useRef<HTMLDivElement | null>(null);
  const section2Ref = useRef<HTMLDivElement | null>(null);

  const [captureMode, setCaptureMode] = useState<CaptureMode>('none');
  const [editingMedication, setEditingMedication] = useState<RenewMedication | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<MedicationEditorMode>('EDIT_EXISTING');
  const [multipleMedications, setMultipleMedications] = useState<RenewMedication[] | null>(null);
  const [importStatus, setImportStatus] = useState<
    'idle' | 'processing' | 'success' | 'failed' | 'unsupported'
  >('idle');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Progressive disclosure: Section 1 starts expanded on initial load; Section 2 stays collapsed until Section 1 is saved.
  const [section1Open, setSection1Open] = useState(() => {
    if (payload.step1.originalPrescription && (payload.step1.adaptationType || payload.step1.adaptationReason)) {
      return false;
    }
    return true;
  });
  const [section2Open, setSection2Open] = useState(() => {
    if (!payload.step1.originalPrescription) return false;
    return Boolean(payload.step1.adaptationType || payload.step1.adaptationReason);
  });
  const [commentsTouched, setCommentsTouched] = useState(false);

  const saveStep = useSaveStep(consultationId);
  const extract = useExtractRenewMedications(consultationId);
  const hydrated = useRef(false);

  const step1 = payload.step1;
  const currentJurisdiction = step1.jurisdiction || jurisdiction;

  // Persist draft and backend (nest under renewPayload so Adapt save never drops Step 1).
  const persist = useCallback(
    async (next: AdaptPayload) => {
      writeAdaptDraft(consultationId, next);
      try {
        await saveStep.mutateAsync({
          stepIndex: 0,
          currentStep: 'PRESCRIPTION_AND_REASON',
          data: {
            renewPayload: next,
          } as unknown as Record<string, unknown>,
        });
        onSaved?.();
      } catch {
        /* best-effort auto-save */
      }
    },
    [consultationId, onSaved, saveStep],
  );

  useWizardBeforeLeave(() => persist(payload));

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    writeAdaptDraft(consultationId, payload);
    const timer = window.setTimeout(() => {
      void persist(payload);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [payload, consultationId, persist]);

  const handleSaveAndContinueSection1 = () => {
    if (!step1.originalPrescription) {
      toast.error('Please add the original prescription first.');
      return;
    }
    if (!hasAdaptOriginalDirections(step1.originalPrescription)) {
      toast.error('Add the original directions (SIG) before continuing.');
      setEditingMedication(step1.originalPrescription);
      setEditorMode('EDIT_EXISTING');
      setEditDialogOpen(true);
      return;
    }
    if (!isAdaptIndicationComplete(step1.indication)) {
      toast.error('Select an indication for this medication, or mark it as not known.');
      return;
    }
    void persist(payload);
    setSection1Open(false);
    setSection2Open(true);
    setTimeout(() => {
      if (section2Ref.current) {
        scrollConsultChildIntoView(section2Ref.current, {
          behavior: 'smooth',
          block: 'start',
          offset: 16,
        });
      }
    }, 60);
  };

  const origSummary = useMemo(() => {
    if (!step1.originalPrescription) return 'Information from the patient profile or entered manually.';
    const med = step1.originalPrescription;
    const name =
      med.normalized.brandName ||
      med.productIdentity?.productName ||
      med.raw.medicationText ||
      med.normalized.genericName ||
      'Prescription added';
    const sig = med.normalized.directions || med.raw.directionsText;
    const indicationLabel =
      step1.indication?.status === 'unknown'
        ? 'Indication not known'
        : step1.indication?.indicationDisplay ||
          step1.indication?.customIndicationText ||
          null;
    const base = sig ? `${name} • ${sig}` : name;
    return indicationLabel ? `${base} • ${indicationLabel}` : base;
  }, [step1.originalPrescription, step1.indication]);

  const origMedicationName = useMemo(() => {
    if (!step1.originalPrescription) return 'Prescription added';
    const med = step1.originalPrescription;
    return (
      med.normalized.genericName ||
      med.normalized.brandName ||
      med.productIdentity?.productName ||
      med.raw.medicationText ||
      'Prescription added'
    );
  }, [step1.originalPrescription]);

  const reasonSummary = useMemo(() => {
    if (!step1.originalPrescription) {
      return 'Complete original prescription above to continue.';
    }
    if (!step1.adaptationType) {
      return 'Select what needs to be changed and why the adaptation is being considered.';
    }
    const typeObj = ADAPTATION_TYPES.find((t) => t.id === step1.adaptationType);
    const reasonText = step1.adaptationReason?.label;
    if (typeObj && reasonText) {
      return `${typeObj.label} • ${reasonText}`;
    }
    return typeObj ? typeObj.label : 'Select what needs to be changed.';
  }, [step1.originalPrescription, step1.adaptationType, step1.adaptationReason]);

  // Same as Renew: open the medication dialog after product identity is chosen.
  // Directions (SIG) are required in the dialog before the prescription is saved.
  const openMedicationDialog = useCallback(
    (med: RenewMedication | null, mode: MedicationEditorMode) => {
      setEditingMedication(med);
      setEditorMode(mode);
      setEditDialogOpen(true);
      setCaptureMode('none');
    },
    [],
  );

  const handleDrugSelect = useCallback(
    (drug: DrugSearchResult) => {
      const med = applyDrugToMedication(null, drug);
      openMedicationDialog(med, 'EDIT_EXISTING');
    },
    [openMedicationDialog],
  );

  const selectExtractedPrescription = useCallback(
    (med: RenewMedication) => {
      setMultipleMedications(null);
      setImportStatus('success');
      openMedicationDialog(med, 'EDIT_EXISTING');
    },
    [openMedicationDialog],
  );

  // Upload or screenshot extract handler
  const runExtract = async (files: File[], sourceType: 'screenshot' | 'pharmacy_document') => {
    if (!files.length) return;
    setImportStatus('processing');
    setImportMessage(null);

    try {
      const result = await extract.mutateAsync({ files, sourceType });
      if (!result.medications.length) {
        setImportStatus('failed');
        setImportMessage(
          result.warnings[0] ??
            "No medications identified. We couldn't reliably extract prescription details from this file.",
        );
        return;
      }

      if (result.medications.length === 1) {
        selectExtractedPrescription(result.medications[0]!);
      } else {
        setMultipleMedications(result.medications);
        setImportStatus('idle');
        setCaptureMode('none');
      }
    } catch (err) {
      setImportStatus('failed');
      setImportMessage(
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not read medications from this file.',
      );
    }
  };

  // Section 1 actions
  const handleRemovePrescription = useCallback(() => {
    const confirmed = window.confirm(
      'Remove original prescription?\n\nThis will also clear the selected indication and adaptation reason linked to this prescription.',
    );
    if (!confirmed) return;
    setPayload((prev) => ({
      ...prev,
      step1: {
        ...prev.step1,
        originalPrescriptionId: null,
        originalPrescription: null,
        indication: null,
        adaptationType: null,
        adaptationReason: null,
        additionalComments: '',
      },
    }));
    setSection2Open(false);
    setSection1Open(true);
    toast.success('Original prescription removed');
  }, []);

  const handleIndicationChange = useCallback((next: AdaptIndicationSelection) => {
    setPayload((prev) => ({
      ...prev,
      step1: {
        ...prev.step1,
        indication: next,
      },
    }));
  }, []);

  const handleEditPrescription = useCallback(() => {
    if (step1.originalPrescription) {
      openMedicationDialog(step1.originalPrescription, 'EDIT_EXISTING');
    }
  }, [openMedicationDialog, step1.originalPrescription]);

  const handleSaveMedicationEdit = useCallback(
    (updated: RenewMedication) => {
      if (!hasAdaptOriginalDirections(updated)) {
        toast.error('Original directions (SIG) are required for adaptation.');
        setEditingMedication(updated);
        setEditorMode('EDIT_EXISTING');
        setEditDialogOpen(true);
        return;
      }
      let nextPayload: AdaptPayload | null = null;
      setPayload((prev) => {
        const previous = prev.step1.originalPrescription;
        const previousKey = previous ? adaptMedicationConceptKey(previous) : null;
        const nextKey = adaptMedicationConceptKey(updated);
        const identityChanged = Boolean(previousKey && previousKey !== nextKey);
        nextPayload = {
          ...prev,
          step1: {
            ...prev.step1,
            originalPrescriptionId: updated.id,
            originalPrescription: updated,
            indication: identityChanged
              ? null
              : prev.step1.indication
                ? {
                    ...prev.step1.indication,
                    medicationId: updated.id,
                    medicationConceptKey: nextKey,
                  }
                : null,
          },
        };
        return nextPayload;
      });
      setEditDialogOpen(false);
      setEditingMedication(null);
      const name =
        updated.normalized.brandName ||
        updated.productIdentity?.productName ||
        updated.raw.medicationText ||
        'Prescription';
      toast.success(`${name} saved as original prescription`);
      // Flush immediately so indication resolve can read the Rx from renewPayload.
      if (nextPayload) {
        void persist(nextPayload);
      }
    },
    [persist],
  );

  const handleCloseMedicationDialog = useCallback(() => {
    setEditDialogOpen(false);
    setEditingMedication(null);
    setEditorMode('EDIT_EXISTING');
  }, []);

  const handleStatusChange = useCallback((status: AdaptDispensingStatus) => {
    setPayload((prev) => ({
      ...prev,
      step1: {
        ...prev.step1,
        dispensingStatus: status,
      },
    }));
  }, []);

  // Section 2 Adaptation Type selection
  const handleSelectAdaptationType = (type: AdaptationType) => {
    setPayload((prev) => {
      const typeChanged =
        Boolean(prev.step1.adaptationType) && prev.step1.adaptationType !== type;
      return {
        ...prev,
        step1: {
          ...prev.step1,
          adaptationType: type,
          // Reset reason when type changes, but preserve comments
          adaptationReason: null,
        },
        // Changing type invalidates any proposed adaptation + safety check
        ...(typeChanged ? { step3A: undefined, step3B: undefined } : {}),
      };
    });
    setCommentsTouched(false);
  };

  const handleSelectReason = (reason: AdaptationReason) => {
    setPayload((prev) => ({
      ...prev,
      step1: {
        ...prev.step1,
        adaptationReason: reason,
      },
    }));
  };

  const handleCommentsChange = (text: string) => {
    const clipped = text.slice(0, 500);
    setPayload((prev) => ({
      ...prev,
      step1: { ...prev.step1, additionalComments: clipped },
    }));
  };

  // Jurisdiction-filtered adaptation types
  const allowedAdaptationTypes = useMemo(() => {
    return ADAPTATION_TYPES.filter((t) => isAdaptationTypeAllowed(t.id, currentJurisdiction));
  }, [currentJurisdiction]);

  // Current reason options
  const currentReasons = useMemo(() => {
    if (!step1.adaptationType) return [];
    return getAdaptationReasons(step1.adaptationType);
  }, [step1.adaptationType]);

  const currentQuestionLabel = useMemo(() => {
    if (!step1.adaptationType) return '';
    return getQuestionLabel(step1.adaptationType);
  }, [step1.adaptationType]);

  // Validation
  const validation = useMemo(() => isAdaptStepOneValid(step1), [step1]);
  const isOther = isReasonOther(step1.adaptationReason);
  const showCommentsError = isOther && commentsTouched && !validation.commentsValid;
  /** Section 2 badge: complete only when type, reason, and required comments are satisfied. */
  const section2Complete =
    validation.hasType && validation.hasReason && validation.commentsValid;

  const handleContinue = () => {
    setCommentsTouched(true);
    if (!validation.valid) {
      if (!validation.hasPrescription) {
        toast.error('Please add the original prescription you plan to adapt.');
      } else if (!validation.hasDirections) {
        toast.error('Add the original directions (SIG) before continuing.');
        if (step1.originalPrescription) {
          openMedicationDialog(step1.originalPrescription, 'EDIT_EXISTING');
        }
      } else if (!validation.hasIndication) {
        toast.error('Select an indication for this medication, or mark it as not known.');
      } else if (!validation.hasType) {
        toast.error('Please select what needs to be changed.');
      } else if (!validation.hasReason) {
        toast.error('Please select a reason for adaptation.');
      } else if (!validation.commentsValid) {
        toast.error(validation.commentsError ?? 'Please provide additional comments.');
      }
      return;
    }

    const completedAt = new Date().toISOString();
    const finalPayload: AdaptPayload = {
      ...payload,
      step1: {
        ...payload.step1,
        completedAt,
      },
    };

    void persist(finalPayload).then(() => {
      onContinueToPatientAssessment();
    });
  };

  const isProcessing = importStatus === 'processing' || extract.isPending;

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="min-w-0 space-y-4">
      {/* ────────────────────────────────────────────────────────────
          Section 1 — Original Prescription
          ──────────────────────────────────────────────────────────── */}
      {!section1Open && step1.originalPrescription ? (
        <div ref={section1Ref} className="scroll-mt-3 clinical-section-collapse">
          <AdaptCollapsedPrescriptionCard
            medicationName={origMedicationName}
            onEdit={() => {
              setSection1Open(true);
              setSection2Open(false);
              setTimeout(() => {
                if (section1Ref.current) {
                  scrollConsultChildIntoView(section1Ref.current, {
                    behavior: 'smooth',
                    block: 'start',
                    offset: 16,
                  });
                }
              }, 50);
            }}
          />
        </div>
      ) : (
        <div
          ref={section1Ref}
          className="overflow-hidden rounded-[18px] border border-[#dce4e8] bg-white shadow-[0_4px_16px_rgba(28,48,64,0.045)] transition-all duration-200 clinical-section-expand"
        >
          <div className="flex min-h-[72px] w-full items-center justify-between gap-3 px-5 py-[18px] sm:px-[26px]">
            <div className="flex min-w-0 flex-1 items-center gap-4 text-left">
              <AdaptSectionGlyph complete={Boolean(step1.originalPrescription)} />
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold leading-snug text-[#172337]">Original prescription</h2>
                <p className="mt-0.5 truncate text-[14px] text-[#617184]">
                  {step1.originalPrescription
                    ? origSummary
                    : 'Information from the patient profile or entered manually.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-[#0f6f73] transition-colors hover:bg-[#f4fbfa]"
                  >
                    <Lightbulb className="h-4 w-4" />
                    Tips
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-4">
                  <p className="text-sm font-semibold text-[#102a43]">Original prescription intake</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[#52677a]">
                    <li>Search by brand, generic, or DIN to select Canadian DPD products.</li>
                    <li>Or paste text from an existing prescription / EMR profile.</li>
                    <li>Upload a scanned prescription or medication record to extract details.</li>
                    <li>Once added, review directions and prescriber details before proceeding.</li>
                  </ul>
                </PopoverContent>
              </Popover>

              {step1.originalPrescription && (
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8]"
                  aria-label="Collapse section"
                  onClick={() => setSection1Open(false)}
                >
                  <ChevronDown className="h-4 w-4 rotate-180 transition-transform duration-200" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4 border-t border-[#edf3f4] px-5 py-4 sm:px-6">
            {step1.originalPrescription ? (
              <>
                <AdaptOriginalPrescriptionCard
                  medication={step1.originalPrescription}
                  status={step1.dispensingStatus}
                  onStatusChange={handleStatusChange}
                  onEdit={handleEditPrescription}
                  onRemove={handleRemovePrescription}
                />

                <AdaptMedicationIndicationPanel
                  consultationId={consultationId}
                  medication={step1.originalPrescription}
                  value={step1.indication}
                  patientConditions={payload.step2A?.background.conditions ?? []}
                  onChange={handleIndicationChange}
                />

                <div className="flex items-center justify-end border-t border-[#edf3f4] pt-3.5 mt-2">
                  <Button
                    type="button"
                    onClick={handleSaveAndContinueSection1}
                    disabled={
                      !hasAdaptOriginalDirections(step1.originalPrescription) ||
                      !isAdaptIndicationComplete(step1.indication)
                    }
                    className={cn(
                      'h-10 rounded-lg px-5 text-sm font-semibold text-white shadow-xs transition-colors',
                      hasAdaptOriginalDirections(step1.originalPrescription) &&
                        isAdaptIndicationComplete(step1.indication)
                        ? 'bg-[#0F6F6B] hover:bg-[#0b5451]'
                        : 'cursor-not-allowed bg-[#0F6F6B]/40',
                    )}
                  >
                    Save &amp; continue to Reason
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : null}

            {/* Intake UI (MedicationCaptureRow) */}
            {!step1.originalPrescription ? (
              <MedicationCaptureRow
                mode={captureMode}
                onModeChange={(next) => {
                  // Match Renew: Search opens the shared medication dialog
                  // (identity + required directions + optional prescriber details).
                  if (next === 'search') {
                    openMedicationDialog(null, 'ADD_MANUAL');
                    return;
                  }
                  setCaptureMode(next);
                }}
                disabled={isProcessing}
                processing={isProcessing}
                heading="Add prescription"
                subheading="Choose one way to add the prescription."
                actionOverrides={{
                  search: {
                    title: 'Search medication',
                    helper: 'Search DPD products and enter current directions.',
                  },
                  screenshot: {
                    title: 'Paste prescription',
                    helper: 'Paste text from an existing prescription.',
                  },
                  upload: {
                    title: 'Upload document',
                    helper: "Upload a prescription or profile. We'll extract details.",
                  },
                }}
                onDrugSelect={handleDrugSelect}
                onAnalyzeScreenshots={(files) => void runExtract(files, 'screenshot')}
                onAnalyzeUpload={(files) => void runExtract(files, 'pharmacy_document')}
              />
            ) : null}

            {/* Extraction Loader & Status */}
            {isProcessing ? (
              <div className="flex items-center gap-3 rounded-xl border border-[#d9e4e8] bg-[#f7fbfb] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-[#0F6F6B]" />
                <div>
                  <p className="text-sm font-medium text-[#163447]">
                    Reading prescription information…
                  </p>
                  <p className="text-xs text-[#7b8b94]">This usually takes a few seconds.</p>
                </div>
              </div>
            ) : null}

            {importMessage && !isProcessing ? (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm',
                  importStatus === 'failed'
                    ? 'border-amber-300 bg-amber-50 text-amber-950'
                    : 'border-[#d9e3e6] bg-[#f7fbfb] text-[#163447]',
                )}
              >
                {importStatus === 'failed' && (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                )}
                <p>{importMessage}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────
          Section 2 — Reason for Adaptation
          overflow-visible so local menus can escape; AdaptReasonDropdown
          also portals to document.body as the primary clip defense.
          ──────────────────────────────────────────────────────────── */}
      {!step1.originalPrescription ? (
        <div ref={section2Ref} className="scroll-mt-3 clinical-section-fade">
          <ClinicalPendingSummary
            step={2}
            title="Reason for adaptation"
            hint="Complete original prescription above to continue"
          />
        </div>
      ) : !section2Open && section2Complete ? (
        <div ref={section2Ref} className="scroll-mt-3 clinical-section-collapse">
          <AdaptCollapsedSummaryCard
            title="Reason for adaptation"
            summary={reasonSummary}
            onEdit={() => {
              setSection2Open(true);
              setSection1Open(false);
              setTimeout(() => {
                if (section2Ref.current) {
                  scrollConsultChildIntoView(section2Ref.current, {
                    behavior: 'smooth',
                    block: 'start',
                    offset: 16,
                  });
                }
              }, 50);
            }}
          />
        </div>
      ) : (
        <div
          ref={section2Ref}
          className="overflow-visible rounded-[18px] border border-[#dce4e8] bg-white shadow-[0_4px_16px_rgba(28,48,64,0.045)] transition-all duration-200 clinical-section-expand"
        >
          <div className="flex min-h-[72px] w-full items-center justify-between gap-3 px-5 py-[18px] sm:px-[26px]">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-4 text-left"
              onClick={() => {
                if (!step1.originalPrescription) {
                  toast.error('Please add the original prescription first.');
                  return;
                }
                setSection2Open((prev) => !prev);
              }}
              aria-expanded={section2Open}
            >
              <AdaptSectionGlyph complete={section2Complete} />
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold leading-snug text-[#172337]">Reason for adaptation</h2>
                <p className="mt-0.5 truncate text-[14px] text-[#617184]">{reasonSummary}</p>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-[#0f6f73] transition-colors hover:bg-[#f4fbfa]"
                  >
                    <Lightbulb className="h-4 w-4" />
                    Tips
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-4">
                  <p className="text-sm font-semibold text-[#102a43]">Adaptation rationale</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[#52677a]">
                    <li>Identify what parameter of the original therapy needs to be adapted.</li>
                    <li>Jurisdictional regulations define which types of adaptations are permitted.</li>
                    <li>The clinical reason selected here will guide the patient assessment questions in Step 2.</li>
                    <li>Selecting &quot;Other&quot; requires a brief explanation in the comments.</li>
                  </ul>
                </PopoverContent>
              </Popover>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#8a9aa3] hover:bg-[#f4f8f8]"
                aria-label={section2Open ? 'Collapse section' : 'Expand section'}
                onClick={() => setSection2Open((prev) => !prev)}
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform duration-200', section2Open && 'rotate-180')}
                />
              </button>
            </div>
          </div>

        {section2Open ? (
          <div className="flex flex-col gap-[22px] border-t border-[#edf1f3] px-5 py-6 sm:px-[26px] clinical-section-expand">
            {/* Adaptation Type Selector */}
            <div>
              <label className="mb-2.5 block text-[14px] font-semibold text-[#172337]">
                What needs to be changed?
              </label>

              <div
                role="radiogroup"
                aria-label="What needs to be changed?"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {allowedAdaptationTypes.map((type) => {
                  const isSelected = step1.adaptationType === type.id;
                  const TypeIcon = ADAPT_TYPE_ICONS[type.id];

                  return (
                    <button
                      key={type.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectAdaptationType(type.id)}
                      className={cn(
                        'flex h-[58px] w-full items-center gap-3 rounded-xl border px-4 text-left text-[15px] transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
                        isSelected
                          ? 'border-[#14878a] bg-[#f4fbfa] font-semibold text-[#0f6f73] shadow-[inset_0_0_0_1px_rgba(20,135,138,0.05)]'
                          : 'border-[#d9e2e6] bg-white font-medium text-[#172337] hover:border-[#b8c9cf] hover:bg-[#fbfdfd]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-[18px] shrink-0 items-center justify-center rounded-full border',
                          isSelected ? 'border-[#14878a] bg-white' : 'border-[#8a9aa3] bg-transparent',
                        )}
                      >
                        {isSelected ? <span className="size-2 rounded-full bg-[#14878a]" /> : null}
                      </span>
                      <TypeIcon
                        className={cn('size-[18px] shrink-0', isSelected ? 'text-[#0f6f73]' : 'text-[#8592a1]')}
                        aria-hidden
                      />
                      <span className="leading-snug">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Reason Dropdown & Comments (stacked vertically per Section 11) */}
            {step1.adaptationType ? (
              <div className="flex flex-col gap-[22px]">
                {/* Dynamic Reason Question */}
                <div>
                  <label className="mb-2.5 block text-[14px] font-semibold text-[#172337]">
                    {currentQuestionLabel}
                  </label>
                  <AdaptReasonDropdown
                    reasons={currentReasons}
                    selectedReason={step1.adaptationReason}
                    onSelect={handleSelectReason}
                    className="w-full max-w-none"
                  />
                </div>

                {/* Additional Comments */}
                <div>
                  <div className="mb-2.5 flex items-center justify-between">
                    <label
                      htmlFor={commentsId}
                      className="block text-[14px] font-semibold text-[#172337]"
                    >
                      Additional comments{' '}
                      {!isOther ? (
                        <span className="text-[13px] font-normal text-[#8592a1]">(optional)</span>
                      ) : (
                        <span className="font-normal text-[#a73737]">*</span>
                      )}
                    </label>
                    <span className="text-[12px] tabular-nums text-[#8592a1]">
                      {(step1.additionalComments ?? '').length}/500
                    </span>
                  </div>

                  <Textarea
                    id={commentsId}
                    value={step1.additionalComments ?? ''}
                    disabled={!step1.adaptationReason}
                    onChange={(e) => handleCommentsChange(e.target.value)}
                    onBlur={() => setCommentsTouched(true)}
                    placeholder="Briefly describe any additional context..."
                    rows={3}
                    className={cn(
                      'min-h-[92px] w-full resize-y rounded-xl border bg-white px-4 py-3.5 text-[15px] leading-relaxed shadow-none [field-sizing:content] focus-visible:ring-[#14878a]/20',
                      showCommentsError
                        ? 'border-[#c94c4c] bg-[#fffafa] focus-visible:border-[#c94c4c] focus-visible:ring-red-200'
                        : 'border-[#d7e1e5] focus-visible:border-[#14878a]',
                      !step1.adaptationReason && 'cursor-not-allowed bg-muted/30 opacity-60',
                    )}
                  />

                  {showCommentsError ? (
                    <p className="mt-1.5 text-[13px] font-medium text-[#a73737]">
                      Please briefly describe the reason for adaptation.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )}
      </div>

      {/* ────────────────────────────────────────────────────────────
          Bottom Action Bar
          ──────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-6 flex items-center justify-between gap-4 border-t border-[#e8eef0] bg-[rgba(250,252,252,0.96)] px-1 py-4 backdrop-blur-[10px] max-sm:flex-col max-sm:items-stretch">
        <Button
          type="button"
          variant="outline"
          onClick={onBackToDashboard}
          className="h-[50px] rounded-[11px] border-[#d5dfe4] bg-white px-[22px] text-[15px] font-semibold text-[#172337] hover:bg-[#f8fafb]"
        >
          <ChevronLeft className="mr-1.5 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Button
          type="button"
          disabled={!validation.valid}
          onClick={handleContinue}
          className={cn(
            'h-[50px] rounded-[11px] px-[26px] text-[15px] font-semibold shadow-[0_5px_14px_rgba(15,111,115,0.18)] transition-[color,background-color,box-shadow,opacity] duration-150 ease-out',
            validation.valid
              ? 'bg-[#0f6f73] text-white hover:bg-[#0c6468]'
              : 'cursor-not-allowed bg-[#0f6f73]/40 text-white shadow-none',
          )}
        >
          Continue to Patient Assessment
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Medication Edit Dialog — same Renew dialog; directions required for Adapt */}
      {editDialogOpen ? (
        <MedicationEditDialog
          open={editDialogOpen}
          mode={editorMode}
          medication={editorMode === 'ADD_MANUAL' ? null : editingMedication}
          requireDirections
          addButtonLabel="Add prescription"
          onClose={handleCloseMedicationDialog}
          onSave={handleSaveMedicationEdit}
        />
      ) : null}

      {/* Extracted Multiple Medications Selection Dialog */}
      <Dialog
        open={Boolean(multipleMedications && multipleMedications.length > 0)}
        onOpenChange={(open) => {
          if (!open) setMultipleMedications(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/60">
            <DialogTitle className="text-lg font-semibold text-[#102a43]">
              Select Prescription to Adapt
            </DialogTitle>
            <DialogDescription className="text-xs text-[#52677a]">
              Found {multipleMedications?.length ?? 0} medications in the uploaded document. Select the original prescription you wish to adapt.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
            {multipleMedications?.map((med, index) => {
              const name =
                med.normalized.brandName ||
                med.productIdentity?.productName ||
                med.raw.medicationText ||
                'Unnamed medication';
              const generic = med.normalized.genericName;
              const strength = med.normalized.strength;
              const form = med.normalized.dosageForm;
              const din = med.normalized.din;
              const directions = med.normalized.directions || med.raw.directionsText;
              const prescriber = med.normalized.prescriberName || med.raw.prescriberText;
              const date = med.normalized.prescribedDate || med.raw.dateText;

              return (
                <div
                  key={med.id || index}
                  className="rounded-xl border border-[#d9e4e8] bg-white p-4 hover:border-[#0F6F6B] hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#102a43]">{name}</span>
                      {generic && generic.toLowerCase() !== name.toLowerCase() && (
                        <span className="text-xs text-[#52677a]">({generic})</span>
                      )}
                      {din && (
                        <span className="rounded bg-[#f4f8f8] px-1.5 py-0.5 text-[11px] font-mono text-[#52677a] border border-[#d3dee1]">
                          DIN: {din}
                        </span>
                      )}
                    </div>
                    {(strength || form) && (
                      <p className="text-xs text-[#52677a]">
                        {[strength, form].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {directions && (
                      <p className="text-xs text-[#163447] bg-[#f8fbfb] rounded px-2 py-1 border border-[#e5edef] font-mono">
                        <span className="font-semibold text-[#52677a] font-sans">Sig: </span>
                        {directions}
                      </p>
                    )}
                    {(prescriber || date) && (
                      <p className="text-[11px] text-[#7b8b94]">
                        {[prescriber ? `Prescriber: ${prescriber}` : null, date ? `Date: ${date}` : null]
                          .filter(Boolean)
                          .join(' | ')}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 bg-[#0F6F6B] text-white hover:bg-[#0b5451] text-xs font-semibold"
                    onClick={() => selectExtractedPrescription(med)}
                  >
                    Select This
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/60 px-6 py-3 bg-[#fbfdfd] flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMultipleMedications(null)}
              className="text-xs text-[#52677a]"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
