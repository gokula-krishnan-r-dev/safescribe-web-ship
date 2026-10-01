'use client';

import { useState, useCallback, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Info,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ClinicalCollapsedSummary,
  ClinicalPendingSummary,
} from '@/features/consultations/clinical-ui';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import { cn } from '@/lib/utils';
import { useGenerateAdaptClinicalRationale } from '@/features/adapt/hooks';
import {
  evaluateAdaptationSafety,
  freezeAdaptDocumentSnapshot,
  generateAdaptationSuggestions,
  generateDraftRationale,
  isAdaptStepThreeOptionBValid,
  selectAdaptReferences,
  DEFAULT_PHARMACIST_CONSULTED_REFERENCES,
  type AdaptPharmacistConsultedReference,
  type AdaptReferenceSelectorInput,
  type AdaptReferenceSelectorResult,
  type AdaptSupportingReferenceSnapshot,
  type SelectedAdaptReference,
  type AdaptStepOne,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type AdaptationType,
  type AdaptAllergyEntry,
  type ClinicalCheckItem,
  type CheckReference,
  type ProposedPrescription,
} from '@safescript/shared';
import { api } from '@/lib/api-client';
import { AdaptReferenceDialog } from './adapt-reference-dialog';
import {
  isAllergyReviewFinding,
  Step3BAllergyDetailsDialog,
  Step3BAllergyReviewCard,
  Step3BAllergyReviewResolvedBanner,
  type AllergyReviewDraft,
} from './step3b-allergy-review';
import { Step3BComparisonCards } from './step3b-comparison-cards';
import {
  AdaptStep3BSafetyEnginePanel,
  type AdaptSafetyEngineStatus,
} from './adapt-step3b-safety-engine';
import { Step3BChangeMedicationDialog } from './step3b-change-medication-dialog';
import { Step3BClinicalRationale } from './step3b-clinical-rationale';
import {
  TreatmentAvoidOverrideDialog,
  type TreatmentOverrideFormResult,
} from '@/features/consultations/treatment-avoid-override-dialog';
import type { TreatmentRecommendation } from '@/features/consultations/types';

const PHARMACIST_REF_SHORT_LABELS: Record<AdaptPharmacistConsultedReference['type'], string> = {
  ecps: 'eCPS',
  bugs_and_drugs: 'Bugs & Drugs',
  condition_guideline: 'Condition-specific guideline',
  other: 'Other reference',
};

function pharmacistRefDisplayLabel(ref: AdaptPharmacistConsultedReference): string {
  return PHARMACIST_REF_SHORT_LABELS[ref.type] ?? ref.label;
}

export interface Step3ClinicalSafetyCheckProps {
  consultationId: string;
  step1: AdaptStepOne;
  step2A?: AdaptStepTwoOptionA;
  step2B?: AdaptStepTwoOptionB;
  step3A?: AdaptStepThreeOptionA;
  initialStep3B?: AdaptStepThreeOptionB;
  jurisdiction?: string;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  isLocked?: boolean;
  onEditProposedAdaptation: () => void;
  onBackToProposedAdaptation: () => void;
  onBackToPatientAssessment: () => void;
  onSaveStep3B: (step3B: AdaptStepThreeOptionB) => Promise<void>;
  /** Called when safety gate readiness changes (for Confirm treatment card). */
  onSafetyGateChange?: (gate: {
    ready: boolean;
    blockedReason?: string | null;
  }) => void;
  /** Optional: replace proposed Rx from 3B change-medication drawer, then return to 3A. */
  onReplaceProposedMedication?: (proposed: ProposedPrescription) => void;
}

export type Step3ClinicalSafetyCheckHandle = {
  /** Freeze + persist 3B snapshot. Returns payload or null if blocked/invalid. */
  confirmTreatment: () => Promise<AdaptStepThreeOptionB | null>;
};

export const Step3ClinicalSafetyCheck = forwardRef<
  Step3ClinicalSafetyCheckHandle,
  Step3ClinicalSafetyCheckProps
>(function Step3ClinicalSafetyCheck(
  {
  consultationId,
  step1,
  step2A,
  step2B,
  step3A,
  initialStep3B,
  jurisdiction = 'AB',
  isOpen = true,
  onToggleOpen,
  sectionRef,
  isLocked = false,
  onEditProposedAdaptation,
  onBackToProposedAdaptation: _onBackToProposedAdaptation,
  onBackToPatientAssessment: _onBackToPatientAssessment,
  onSaveStep3B,
  onSafetyGateChange,
  onReplaceProposedMedication,
}: Step3ClinicalSafetyCheckProps,
  ref,
) {
  // Dynamic safety evaluation - runs dynamically so allergies from step 2A are immediately evaluated
  const evaluatedSafety = useMemo(() => {
    return evaluateAdaptationSafety(step1, step2A, step2B, step3A, jurisdiction);
  }, [step1, step2A, step2B, step3A, jurisdiction]);

  const [checks, setChecks] = useState<ClinicalCheckItem[]>(() => {
    return evaluatedSafety.checks;
  });

  // Re-sync checks when inputs change
  useEffect(() => {
    setChecks(evaluatedSafety.checks);
    if (!initialStep3B?.rationaleEditedByPharmacist) {
      setClinicalRationale(evaluatedSafety.defaultRationale);
      setDraftRationale(evaluatedSafety.defaultRationale);
    }
  }, [evaluatedSafety, initialStep3B?.rationaleEditedByPharmacist]);

  // Section 6-28: AdaptReferenceSelector deterministic reference selection
  const buildSelectorInput = useCallback((): AdaptReferenceSelectorInput => {
    const rawReason = (step1.adaptationReason?.code || 'DOSE_RENAL').toLowerCase();
    const resolvedType: AdaptationType =
      step1.adaptationType === 'dosage_form' ||
      step1.adaptationType === 'regimen' ||
      step1.adaptationType === 'route' ||
      step1.adaptationType === 'therapeutic_substitution'
        ? step1.adaptationType
        : 'dose';

    return {
      consultationId: consultationId || 'preview',
      jurisdiction: jurisdiction || 'AB',
      adaptationType: resolvedType,
      adaptationReasonCode: rawReason,
      adaptationReasonLabel: step1.adaptationReason?.label,
      originalDrugIds: step1.originalPrescription?.normalized?.din
        ? [step1.originalPrescription.normalized.din]
        : undefined,
      proposedDrugIds: step3A?.proposedPrescription?.drugId
        ? [step3A.proposedPrescription.drugId]
        : undefined,
      triggeredCheckCodes: checks.map((c) => c.id),
      includeSafetyRuleReferences: true,
    };
  }, [consultationId, jurisdiction, step1, step3A, checks]);

  const [selectorResult, setSelectorResult] = useState<AdaptReferenceSelectorResult>(() => {
    return selectAdaptReferences(buildSelectorInput(), []);
  });

  // Re-run reference selection when clinical parameters change, querying API if consultation exists
  useEffect(() => {
    const input = buildSelectorInput();
    const clientResult = selectAdaptReferences(input, []);
    setSelectorResult(clientResult);

    let isMounted = true;
    if (consultationId && consultationId !== 'preview') {
      api
        .post<AdaptReferenceSelectorResult>(
          `/consultations/${consultationId}/adapt/reference-selection`,
          input,
        )
        .then((backendResult: AdaptReferenceSelectorResult) => {
          if (isMounted && backendResult && Array.isArray(backendResult.allSelectedReferences)) {
            setSelectorResult(backendResult);
          }
        })
        .catch(() => {
          // Gracefully fall back to deterministic clientResult
        });
    }

    return () => {
      isMounted = false;
    };
  }, [buildSelectorInput, consultationId]);

  // Pharmacist-consulted references state (Section 28 & 54)
  const [pharmacistConsultedRefs, setPharmacistConsultedRefs] = useState<
    AdaptPharmacistConsultedReference[]
  >(() => {
    if (
      initialStep3B?.pharmacistReferencesConsulted &&
      initialStep3B.pharmacistReferencesConsulted.length > 0
    ) {
      return initialStep3B.pharmacistReferencesConsulted;
    }
    return DEFAULT_PHARMACIST_CONSULTED_REFERENCES;
  });

  const handleToggleConsultedRef = useCallback((type: string) => {
    setPharmacistConsultedRefs((prev) =>
      prev.map((r) => (r.type === type ? { ...r, selected: !r.selected } : r)),
    );
  }, []);

  const handleUpdateOtherRefNotes = useCallback((notes: string) => {
    setPharmacistConsultedRefs((prev) =>
      prev.map((r) => (r.type === 'other' ? { ...r, notes } : r)),
    );
  }, []);

  const handleUpdateConsultedRefField = useCallback(
    (
      type: AdaptPharmacistConsultedReference['type'],
      field: 'title' | 'organization' | 'url' | 'notes',
      value: string,
    ) => {
      setPharmacistConsultedRefs((prev) =>
        prev.map((r) => (r.type === type ? { ...r, [field]: value } : r)),
      );
    },
    [],
  );

  const blockedCheck = useMemo(() => {
    return checks.find((c) => c.severity === 'block');
  }, [checks]);
  const hasBlock = Boolean(blockedCheck);

  const allergyReviewCheck = useMemo(
    () => checks.find((c) => isAllergyReviewFinding(c)) ?? null,
    [checks],
  );

  const reviewChecksNeedingAck = useMemo(
    () => checks.filter((c) => c.requiresAcknowledgment && c.severity !== 'block'),
    [checks],
  );


  // Allergy review overlay (pharmacist edits in 3B dialog — encounter-scoped)
  const [allergyDialogOpen, setAllergyDialogOpen] = useState(false);
  const [allergyReviewOverlay, setAllergyReviewOverlay] = useState<AdaptAllergyEntry | null>(
    null,
  );

  const matchedAllergyEntry = useMemo((): AdaptAllergyEntry | null => {
    if (allergyReviewOverlay) return allergyReviewOverlay;
    const entries = step2A?.background?.allergyEntries ?? [];
    if (!entries.length || !allergyReviewCheck) return entries[0] ?? null;
    // Prefer penicillin-class allergen when present
    const pen = entries.find((e) => /penicillin|amoxicillin|ampicillin/i.test(e.drug));
    return pen ?? entries[0] ?? null;
  }, [allergyReviewOverlay, step2A, allergyReviewCheck]);

  const [selectedCheckId, setSelectedCheckId] = useState<string>(() => {
    const block = evaluatedSafety.checks.find((c) => c.severity === 'block');
    if (block) return block.id;
    if (initialStep3B?.selectedCheckId) return initialStep3B.selectedCheckId;
    const renal = evaluatedSafety.checks.find((c) => c.id === 'renal_function');
    if (renal) return renal.id;
    const review = evaluatedSafety.checks.find((c) => c.severity === 'review');
    return review ? review.id : (evaluatedSafety.checks[0]?.id ?? '');
  });

  // Automatically select the blocked check if present
  useEffect(() => {
    if (blockedCheck) {
      setSelectedCheckId(blockedCheck.id);
    }
  }, [blockedCheck]);

  const [lastCheckedTime, setLastCheckedTime] = useState<string>(() => {
    if (initialStep3B?.evaluatedAt) return initialStep3B.evaluatedAt;
    const now = new Date();
    return `${now.getDate()}-${now.toLocaleString('en-US', { month: 'short' })}-${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  });
  const [isChecking, setIsChecking] = useState(false);

  // Rationale editing state
  const [clinicalRationale, setClinicalRationale] = useState(
    initialStep3B?.clinicalRationale || evaluatedSafety.defaultRationale,
  );
  const [draftRationale, setDraftRationale] = useState(clinicalRationale);

  // Acknowledged review checks state
  const [acknowledgedCheckIds, setAcknowledgedCheckIds] = useState<Set<string>>(
    new Set(initialStep3B?.acknowledgedCheckIds ?? []),
  );
  const [pharmacistNotes, setPharmacistNotes] = useState<Record<string, string>>(
    initialStep3B?.pharmacistNotes ?? {},
  );

  const allergyReviewResolved =
    Boolean(allergyReviewCheck) && acknowledgedCheckIds.has(allergyReviewCheck!.id);

  // Reference modal dialog state
  const [referenceModalOpen, setReferenceModalOpen] = useState(false);
  const [activeReference, setActiveReference] = useState<CheckReference | null>(null);
  const [activeSelectedRef, setActiveSelectedRef] = useState<SelectedAdaptReference | null>(null);
  const [activeRefTitle, setActiveRefTitle] = useState<string>('');

  const [changeMedOpen, setChangeMedOpen] = useState(false);
  const [rationaleEditedByPharmacist, setRationaleEditedByPharmacist] = useState(
    Boolean(initialStep3B?.rationaleEditedByPharmacist),
  );
  const [safetyRefetchToken, setSafetyRefetchToken] = useState(0);
  const [safetyEngineAck, setSafetyEngineAck] = useState(false);
  const [safetyEngineStatus, setSafetyEngineStatus] = useState<AdaptSafetyEngineStatus>({
    requiresAck: false,
    hardStop: false,
    tone: 'clear',
    isLoading: false,
  });
  const [clinicalOverride, setClinicalOverride] = useState<
    AdaptStepThreeOptionB['clinicalOverride'] | null
  >(() => initialStep3B?.clinicalOverride ?? null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Selected check object (persisted snapshot pointer)
  const selectedCheck = useMemo(
    () => checks.find((c) => c.id === selectedCheckId) ?? checks[0],
    [checks, selectedCheckId],
  );


  const anyPharmacistRefSelected = pharmacistConsultedRefs.some((r) => r.selected);
  const guidelineRef = pharmacistConsultedRefs.find((r) => r.type === 'condition_guideline');
  const otherRef = pharmacistConsultedRefs.find((r) => r.type === 'other');

  // Run checks again handler
  const handleRunCheckAgain = useCallback(async () => {
    setIsChecking(true);
    setValidationError(null);
    setSafetyEngineAck(false);
    setSafetyRefetchToken((t) => t + 1);
    setClinicalOverride(null);
    try {
      // Simulate deterministic evaluation delay for smooth UI feedback
      await new Promise((resolve) => setTimeout(resolve, 350));
      const fresh = evaluateAdaptationSafety(step1, step2A, step2B, step3A, jurisdiction);
      setChecks(fresh.checks);
      const now = new Date();
      const timeStr = `${now.getDate()}-${now.toLocaleString('en-US', { month: 'short' })}-${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
      setLastCheckedTime(timeStr);
      if (!initialStep3B?.rationaleEditedByPharmacist) {
        setClinicalRationale(fresh.defaultRationale);
        setDraftRationale(fresh.defaultRationale);
      }
      // Re-run reference selection
      const freshInput = {
        ...buildSelectorInput(),
        triggeredCheckCodes: fresh.checks.map((c) => c.id),
      };
      setSelectorResult(selectAdaptReferences(freshInput, []));
    } finally {
      setIsChecking(false);
    }
  }, [
    step1,
    step2A,
    step2B,
    step3A,
    jurisdiction,
    initialStep3B?.rationaleEditedByPharmacist,
    buildSelectorInput,
  ]);

  // Sync Safety Engine ack with per-check snapshot ids
  const handleSafetyEngineAckChange = useCallback(
    (value: boolean) => {
      setSafetyEngineAck(value);
      setAcknowledgedCheckIds((prev) => {
        const next = new Set(prev);
        for (const check of reviewChecksNeedingAck) {
          if (value) next.add(check.id);
          else next.delete(check.id);
        }
        return next;
      });
    },
    [reviewChecksNeedingAck],
  );

  const handleSafetyEngineStatus = useCallback((status: AdaptSafetyEngineStatus) => {
    setSafetyEngineStatus(status);
  }, []);

  const handleClearClinicalOverride = useCallback(() => {
    setClinicalOverride(null);
    setSafetyEngineAck(false);
    setPharmacistNotes((prev) => {
      const next = { ...prev };
      delete next.clinical_override;
      return next;
    });
  }, []);

  const handleApplyClinicalOverride = useCallback(
    (form: TreatmentOverrideFormResult) => {
      const source: NonNullable<AdaptStepThreeOptionB['clinicalOverride']>['source'] =
        allergyReviewCheck || hasBlock ? 'ALLERGY' : 'AVOID';
      const next: NonNullable<AdaptStepThreeOptionB['clinicalOverride']> = {
        overriddenAt: new Date().toISOString(),
        reason: form.reason.trim(),
        comments: form.comments?.trim() || undefined,
        acknowledgedRisk: true,
        source,
      };
      setClinicalOverride(next);
      setOverrideDialogOpen(false);
      handleSafetyEngineAckChange(true);
      setPharmacistNotes((prev) => ({
        ...prev,
        clinical_override: [
          next.reason,
          next.comments ? `Notes: ${next.comments}` : null,
          `At: ${next.overriddenAt}`,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
      setClinicalRationale((prev) => {
        const stamp = `Clinical override: ${next.reason}${
          next.comments ? ` (${next.comments})` : ''
        }.`;
        if (!prev.trim() || /contraindicated/i.test(prev)) {
          return stamp.slice(0, 500);
        }
        if (prev.includes('Clinical override:')) return prev;
        return `${prev.trim()} ${stamp}`.slice(0, 500);
      });
      setRationaleEditedByPharmacist(true);
    },
    [allergyReviewCheck, hasBlock, handleSafetyEngineAckChange],
  );

  const handleSaveAllergyReview = useCallback(
    (draft: AllergyReviewDraft) => {
      const base = matchedAllergyEntry;
      const next: AdaptAllergyEntry = {
        id: base?.id ?? `alg_review_${Date.now()}`,
        drug: draft.drug.trim() || base?.drug || '',
        reaction: draft.reaction.trim() || undefined,
        severity: draft.severity || '',
        allergyType: draft.reactionType.trim() || undefined,
        reactionType: draft.reactionType.trim() || undefined,
        recordedDate: draft.recordedDate.trim() || undefined,
        previousCephalosporinTolerance: draft.previousCephalosporinTolerance,
        genericName: base?.genericName,
        brandName: base?.brandName,
        drugClass: base?.drugClass,
      };
      setAllergyReviewOverlay(next);
      setPharmacistNotes((prev) => ({
        ...prev,
        allergies: [
          `Reviewed ${next.drug}`,
          next.reaction ? `reaction: ${next.reaction}` : null,
          next.severity ? `severity: ${next.severity}` : null,
          next.reactionType ? `type: ${next.reactionType}` : null,
          `prior cephalosporin tolerance: ${next.previousCephalosporinTolerance ?? 'unknown'}`,
        ]
          .filter(Boolean)
          .join('; '),
      }));
      if (allergyReviewCheck) {
        setAcknowledgedCheckIds((prev) => new Set(prev).add(allergyReviewCheck.id));
        setSelectedCheckId(allergyReviewCheck.id);
        setSafetyEngineAck(true);
      }
    },
    [matchedAllergyEntry, allergyReviewCheck],
  );

  // Open reference dialog for selected AdaptReference
  const handleViewSelectedReference = (ref: SelectedAdaptReference, checkTitle?: string) => {
    setActiveReference(null);
    setActiveSelectedRef(ref);
    setActiveRefTitle(checkTitle || ref.title);
    setReferenceModalOpen(true);
  };


  // Confirm treatment — freeze 3B snapshot for counselling unlock
  const handleConfirm = async (): Promise<AdaptStepThreeOptionB | null> => {
    if (!canConfirm || isSubmitting) return null;
    // Snapshot SafeScribe supporting references (Section 44 & 54)
    const safeScribeSupportingReferences: AdaptSupportingReferenceSnapshot[] = (
      selectorResult?.allSelectedReferences ?? []
    ).map((ref) => ({
      referenceId: ref.referenceId,
      title: ref.title,
      organizationPublisher: ref.organizationPublisher ?? undefined,
      yearEdition: ref.yearEdition ?? undefined,
      version: ref.version ?? undefined,
      jurisdiction: ref.jurisdiction ?? undefined,
      sectionsUsed: ref.relevantSections,
      usedForCheckCodes: ref.matchedCheckCodes,
      source: ref.source,
    }));

    const confirmedAt = new Date().toISOString();
    const payload3BBase: AdaptStepThreeOptionB = {
      checks,
      selectedCheckId: selectedCheck?.id ?? 'renal_function',
      evaluatedAt: lastCheckedTime,
      overallStatus: checks.some((c) => c.severity === 'block')
        ? clinicalOverride
          ? 'review'
          : 'block'
        : checks.some((c) => c.severity === 'review')
          ? 'review'
          : 'pass',
      clinicalRationale,
      rationaleEditedByPharmacist,
      acknowledgedCheckIds: Array.from(acknowledgedCheckIds),
      pharmacistNotes,
      clinicalOverride: clinicalOverride ?? undefined,
      pharmacistReferencesConsulted: pharmacistConsultedRefs,
      safeScribeSupportingReferences,
      confirmed: true,
      confirmedAt,
    };

    // Freeze document-generation snapshot at Step 3 confirm (DAP + other Step 4 docs).
    const frozen = freezeAdaptDocumentSnapshot({
      consultationId: consultationId && consultationId !== 'preview' ? consultationId : undefined,
      step1,
      step2A,
      step2B,
      step3A,
      step3B: payload3BBase,
      pharmacistReferencesConsulted: pharmacistConsultedRefs,
      safeScribeSupportingReferences,
      context: {
        confirmedAt,
      },
    });

    const payload3B: AdaptStepThreeOptionB = {
      ...payload3BBase,
      documentSnapshotId: frozen.snapshotId,
      documentSnapshotHash: frozen.snapshotHash,
    };

    const validation = isAdaptStepThreeOptionBValid(payload3B);
    if (!validation.valid) {
      setValidationError(validation.missingFields.join('; '));
      return null;
    }

    setIsSubmitting(true);
    setValidationError(null);
    try {
      await onSaveStep3B(payload3B);
      return payload3B;
    } catch {
      setValidationError('Failed to persist adaptation check snapshot. Please try again.');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prescription display values
  const origRx = step1.originalPrescription;
  const origMedName =
    origRx?.normalized?.genericName ||
    origRx?.normalized?.brandName ||
    origRx?.raw?.medicationText ||
    '—';
  const origSig =
    origRx?.normalized?.directions ||
    origRx?.raw?.directionsText ||
    '—';
  const origQty = origRx?.raw?.quantityText || origRx?.normalized?.quantity || '—';
  const origRefills = origRx?.normalized?.refillsRemaining ?? '—';

  const propRx = step3A?.proposedPrescription;
  const propMedName = propRx?.drugName || origMedName;
  const propSig = propRx?.sig || '—';
  const propQty = propRx?.quantity ?? '—';
  const propRefills = propRx?.refills ?? '—';

  const reasonLabel = step1.adaptationReason?.label || 'Adaptation';
  const reasonDetails =
    step1.additionalComments?.trim() ||
    step1.adaptationReason?.label ||
    'Confirmed in Step 1';

  const safetyHardStop = safetyEngineStatus.hardStop && !clinicalOverride;
  const safetyNeedsAck = safetyEngineStatus.requiresAck && !safetyEngineAck;
  const canConfirm =
    !isSubmitting &&
    !safetyHardStop &&
    !safetyNeedsAck &&
    !safetyEngineStatus.isLoading;

  const safetyBlockedReason = safetyHardStop
    ? 'Document a clinical override or change the medication before confirming.'
    : safetyNeedsAck
      ? 'Acknowledge Safety Engine findings before confirming.'
      : safetyEngineStatus.isLoading
        ? 'Safety Engine is still checking this adaptation…'
        : null;

  const overrideTreatmentStub = useMemo((): TreatmentRecommendation | null => {
    const name = propRx?.drugName?.trim();
    if (!name) return null;
    return {
      priority: 1,
      confidence: 1,
      medicationName: name,
      genericName: propRx?.genericName?.trim() || undefined,
      brandName: propRx?.brandName?.trim() || undefined,
      dose: propRx?.dose?.trim() || undefined,
      route: propRx?.route?.trim() || undefined,
      frequency: propRx?.frequency?.trim() || undefined,
      instructions: propRx?.sig?.trim() || undefined,
      patientDirections: propRx?.sig?.trim() || undefined,
      displayName: name,
      category: 'PRESCRIPTION',
      allergyBlocked: Boolean(hasBlock || allergyReviewCheck),
      allergyWarning:
        allergyReviewCheck || hasBlock
          ? {
              patientAllergy: matchedAllergyEntry?.drug?.trim() || 'documented allergen',
              prescribedDrug: name,
              reason:
                blockedCheck?.summary ||
                blockedCheck?.assessment ||
                allergyReviewCheck?.summary ||
                'Documented allergy conflict with the proposed adaptation.',
            }
          : undefined,
    };
  }, [
    propRx,
    hasBlock,
    allergyReviewCheck,
    blockedCheck,
    matchedAllergyEntry?.drug,
  ]);

  useEffect(() => {
    onSafetyGateChange?.({
      ready: canConfirm,
      blockedReason: safetyBlockedReason,
    });
  }, [canConfirm, safetyBlockedReason, onSafetyGateChange]);

  useImperativeHandle(
    ref,
    () => ({
      confirmTreatment: handleConfirm,
    }),
    // handleConfirm closes over latest state each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      canConfirm,
      isSubmitting,
      checks,
      selectedCheck,
      lastCheckedTime,
      clinicalRationale,
      rationaleEditedByPharmacist,
      acknowledgedCheckIds,
      pharmacistNotes,
      clinicalOverride,
      pharmacistConsultedRefs,
      selectorResult,
      step1,
      step2A,
      step2B,
      step3A,
      consultationId,
      onSaveStep3B,
    ],
  );

  const adaptationSuggestions = useMemo(
    () => generateAdaptationSuggestions(step1, step2A, step2B),
    [step1, step2A, step2B],
  );

  // Reset Safety Engine acknowledgment when the proposed drug changes
  useEffect(() => {
    setSafetyEngineAck(false);
    setClinicalOverride(null);
  }, [propRx?.drugName, propRx?.genericName]);

  const generateRationale = useGenerateAdaptClinicalRationale(consultationId);

  const buildAiRationaleDraft = useCallback(async () => {
    const base =
      generateDraftRationale(
        step1,
        step2A,
        step2B,
        step3A?.proposedPrescription,
      ) || evaluatedSafety.defaultRationale;

    let text = base;
    if (consultationId && consultationId !== 'preview' && step3A?.proposedPrescription) {
      try {
        const result = await generateRationale.mutateAsync({
          ...step3A.proposedPrescription,
        });
        if (result.rationale?.trim()) text = result.rationale.trim();
      } catch {
        // keep deterministic base
      }
    }

    const allergyNote = pharmacistNotes.allergies?.trim();
    if (allergyReviewResolved && allergyNote) {
      return `${text} The pharmacist reviewed the documented allergy history and the identified cross-reactivity concern. After assessing the recorded reaction details and patient-specific factors, the pharmacist elected to proceed with the proposed adaptation with documented clinical rationale and monitoring.`.slice(
        0,
        500,
      );
    }
    return text.slice(0, 500);
  }, [
    consultationId,
    generateRationale,
    step1,
    step2A,
    step2B,
    step3A?.proposedPrescription,
    evaluatedSafety.defaultRationale,
    pharmacistNotes.allergies,
    allergyReviewResolved,
  ]);

  if (!isOpen) {
    if (isLocked) {
      return (
        <div ref={sectionRef} className="scroll-mt-3 clinical-section-fade">
          <ClinicalPendingSummary
            step="3B"
            title="Clinical & Safety Check"
            hint="Complete Proposed Adaptation above to unlock safety checks"
          />
        </div>
      );
    }

    if (initialStep3B?.confirmed) {
      return (
        <div ref={sectionRef} className="scroll-mt-3 clinical-section-collapse">
          <ClinicalCollapsedSummary
            step="3B"
            title="Clinical & Safety Check"
            summary={`${checks.length} clinical checks evaluated · ${hasBlock ? 'Contraindication detected' : 'Clinically reviewed'}`}
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
      <div
        ref={sectionRef}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"]')) return;
          onToggleOpen?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"]')) return;
            e.preventDefault();
            onToggleOpen?.();
          }
        }}
        className="flex items-center justify-between rounded-xl border border-[#d9e4e8] bg-white px-6 py-4 transition-colors cursor-pointer hover:bg-slate-50/60 shadow-xs"
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs',
              isLocked ? 'bg-[#829ab1]' : hasBlock ? 'bg-rose-600' : 'bg-[#0F6F6B]',
            )}
          >
            3B
          </span>
          <div>
            <h2 className="text-lg font-bold text-[#102a43]">Clinical &amp; Safety Check</h2>
            <p className="text-xs text-[#627d98]">
              {isLocked
                ? 'Complete Proposed Adaptation above to unlock safety checks.'
                : hasBlock
                  ? 'Contraindication detected against proposed medication.'
                  : 'Review tailored safety evaluations and contraindication checks.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasBlock ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Contraindicated ({blockedCheck?.title || 'Allergy Conflict'})
            </span>
          ) : isLocked ? (
            <span className="hidden sm:inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              Pending 3A
            </span>
          ) : (
            <span className="hidden sm:inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {checks.length} clinical checks ready
            </span>
          )}

          {!isLocked && onToggleOpen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleOpen}
              className="h-7 text-xs font-medium text-[#0F6F6B] border-[#0F6F6B]/30 hover:bg-[#0F6F6B]/10"
            >
              View checks
            </Button>
          )}

          {!isLocked && onToggleOpen && <ChevronDown className="h-5 w-5 text-[#52677a]" />}
        </div>
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="space-y-4 clinical-section-expand">
      {/* Header */}
      <div className="rounded-2xl border border-[#dfe7ea] bg-white p-5 shadow-[0_4px_14px_rgba(28,48,64,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F6F6B] text-sm font-bold text-white shadow-xs">
              3B
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[#102a43] sm:text-[26px]">
                Clinical &amp; Safety Check
              </h2>
              <p className="text-[13.5px] text-[#52677a]">
                Review the tailored safety checks for the proposed adaptation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg border-[#dfe7ea] bg-[#fbfcfd] px-2.5 text-[13px] font-semibold text-[#102a43] hover:bg-[#f2f7f9]"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[#0F6F6B]" />
                  How this works
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[320px] border-[#dfe7ea] p-4 shadow-lg"
              >
                <ul className="space-y-2 text-[13px] leading-relaxed text-[#52677a]">
                  <li>SafeScribe runs Safety Engine checks against the proposed adaptation.</li>
                  <li>Allergy, interaction, and patient-specific conflicts surface here.</li>
                  <li>Review or hard-stop findings must be resolved before confirmation.</li>
                  <li>Clinical judgement remains with the pharmacist.</li>
                </ul>
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isChecking}
              onClick={handleRunCheckAgain}
              className="h-8 gap-1.5 rounded-lg border-[#dfe7ea] bg-[#fbfcfd] px-2.5 text-[12.5px] font-semibold text-[#102a43] hover:bg-[#f2f7f9]"
            >
              <RotateCw className={cn('h-3.5 w-3.5 text-[#0F6F6B]', isChecking && 'animate-spin')} />
              {isChecking ? 'Checking…' : 'Recheck'}
            </Button>

            {onToggleOpen && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleOpen}
                className="h-8 w-8 text-[#52677a] hover:bg-slate-100"
                aria-label="Collapse 3B"
              >
                <ChevronUp className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Hard stop is surfaced by the Safety Engine panel below */}

        <div className="mt-5">
          <Step3BComparisonCards
            origMedName={origMedName}
            origSig={origSig}
            origQty={String(origQty)}
            origRefills={String(origRefills)}
            propMedName={propMedName}
            propSig={propSig}
            propQty={String(propQty)}
            propRefills={String(propRefills)}
            reasonLabel={reasonLabel}
            reasonDetails={reasonDetails}
            onEditProposed={onEditProposedAdaptation}
          />
        </div>
      </div>

      {/* Safety Engine — Prescribe-style warnings for the proposed adaptation */}
      <div className="space-y-4">
        {allergyReviewResolved ? (
          <Step3BAllergyReviewResolvedBanner
            onUndo={() => {
              if (!allergyReviewCheck) return;
              setAcknowledgedCheckIds((prev) => {
                const next = new Set(prev);
                next.delete(allergyReviewCheck.id);
                return next;
              });
              setSafetyEngineAck(false);
            }}
          />
        ) : null}

        {allergyReviewCheck && !allergyReviewResolved ? (
          <Step3BAllergyReviewCard
            check={allergyReviewCheck}
            allergy={matchedAllergyEntry}
            proposedMedication={propMedName}
            isAcknowledged={false}
            onReviewDetails={() => setAllergyDialogOpen(true)}
            onChangeMedication={() => setChangeMedOpen(true)}
          />
        ) : null}

        <AdaptStep3BSafetyEnginePanel
          consultationId={consultationId}
          proposed={propRx}
          adaptChecks={checks}
          acknowledged={safetyEngineAck}
          onAcknowledgedChange={handleSafetyEngineAckChange}
          onChangeMedication={() => setChangeMedOpen(true)}
          onRequestOverride={() => setOverrideDialogOpen(true)}
          onClearOverride={clinicalOverride ? handleClearClinicalOverride : undefined}
          clinicalOverride={
            clinicalOverride
              ? {
                  reason: clinicalOverride.reason,
                  comments: clinicalOverride.comments,
                  overriddenAt: clinicalOverride.overriddenAt,
                }
              : null
          }
          onStatusChange={handleSafetyEngineStatus}
          refetchToken={safetyRefetchToken}
        />
      </div>

      <Step3BClinicalRationale
        value={clinicalRationale}
        updateRequired={safetyNeedsAck || safetyHardStop}
        updateMessage={
          safetyHardStop
            ? 'Document a clinical override above, or change the medication, before finalizing the clinical rationale.'
            : 'Acknowledge Safety Engine findings above before finalizing the clinical rationale.'
        }
        canGenerateDraft={!safetyNeedsAck && !safetyHardStop}
        autoGenerateKey={[
          propRx?.drugName,
          propRx?.dose,
          propRx?.frequency,
          propRx?.route,
          propRx?.sig,
          safetyNeedsAck ? 'blocked' : 'ready',
        ]
          .map((part) => (part ?? '').trim().toLowerCase())
          .filter(Boolean)
          .join('|')}
        onChange={(next, edited) => {
          setClinicalRationale(next);
          setDraftRationale(next);
          setRationaleEditedByPharmacist(edited);
        }}
        onApplyAiDraft={(next) => {
          setClinicalRationale(next);
          setDraftRationale(next);
          setRationaleEditedByPharmacist(false);
        }}
        onGenerateDraft={buildAiRationaleDraft}
      />

      {/* References consulted by pharmacist */}
      <div className="rounded-2xl border border-[#dfe7ea] bg-white p-5 shadow-[0_4px_14px_rgba(28,48,64,0.04)] sm:p-6 space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-[16px] font-semibold text-[#102a43]">
            References consulted by pharmacist
          </h3>
          <p className="text-[13px] text-[#52677a]">
            Sources you personally used for this decision.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {pharmacistConsultedRefs.map((ref) => {
            const isChecked = Boolean(ref.selected);
            return (
              <label
                key={ref.type}
                className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13.5px] text-[#102a43] select-none"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleConsultedRef(ref.type)}
                  className="h-4 w-4 rounded border-gray-300 text-[#0F6F6B] focus:ring-[#0F6F6B]"
                />
                <span className="font-medium">{pharmacistRefDisplayLabel(ref)}</span>
              </label>
            );
          })}
        </div>

        {!anyPharmacistRefSelected ? (
          <div className="flex items-start gap-2 rounded-lg border border-[#dfe7ea] bg-[#fbfcfd] px-3 py-2.5 text-[12.5px] text-[#52677a]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F6F6B]" />
            <span>
              Additional details (e.g., guideline name or other reference) will appear here when a
              source is selected.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {guidelineRef?.selected ? (
              <div className="space-y-1.5">
                <label className="text-[12.5px] font-semibold text-[#52677a]">Guideline title</label>
                <Input
                  value={guidelineRef.title ?? ''}
                  onChange={(e) =>
                    handleUpdateConsultedRefField('condition_guideline', 'title', e.target.value)
                  }
                  placeholder="Enter guideline title"
                  className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                />
              </div>
            ) : null}

            {otherRef?.selected ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[12.5px] font-semibold text-[#52677a]">
                    Reference title
                  </label>
                  <Input
                    value={otherRef.title ?? ''}
                    onChange={(e) =>
                      handleUpdateConsultedRefField('other', 'title', e.target.value)
                    }
                    placeholder="Reference title"
                    className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12.5px] font-semibold text-[#52677a]">
                    Organization / publisher{' '}
                    <span className="font-normal text-[#7b8b94]">(optional)</span>
                  </label>
                  <Input
                    value={otherRef.organization ?? ''}
                    onChange={(e) =>
                      handleUpdateConsultedRefField('other', 'organization', e.target.value)
                    }
                    placeholder="Organization"
                    className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12.5px] font-semibold text-[#52677a]">
                    URL <span className="font-normal text-[#7b8b94]">(optional)</span>
                  </label>
                  <Input
                    value={otherRef.url ?? ''}
                    onChange={(e) => handleUpdateConsultedRefField('other', 'url', e.target.value)}
                    placeholder="https://"
                    className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[12.5px] font-semibold text-[#52677a]">
                    Notes <span className="font-normal text-[#7b8b94]">(optional)</span>
                  </label>
                  <Input
                    value={otherRef.notes ?? ''}
                    onChange={(e) => handleUpdateOtherRefNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Validation Error Banner */}
      {validationError ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      ) : null}

      {/* Footer — Confirm treatment lives in the Selected treatment plan card below */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onEditProposedAdaptation}
          className="h-10 rounded-lg border-[#dfe7ea] px-3.5 text-[13.5px] font-semibold text-[#52677a]"
        >
          Back to Proposed Adaptation
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          {safetyHardStop ? (
            <span className="text-xs font-semibold text-rose-600">
              Resolve blocking issue to continue
            </span>
          ) : safetyNeedsAck ? (
            <span className="text-xs font-semibold text-amber-700">
              Acknowledge Safety Engine findings to continue
            </span>
          ) : canConfirm ? (
            <span className="text-xs font-semibold text-[#0F6F6B]">
              Safety review complete — confirm the treatment plan below
            </span>
          ) : null}
        </div>
      </div>

      {/* Reference Monograph Dialog */}
      <AdaptReferenceDialog
        open={referenceModalOpen}
        onOpenChange={setReferenceModalOpen}
        reference={activeReference}
        selectedReference={activeSelectedRef}
        checkTitle={activeRefTitle}
      />

      <Step3BAllergyDetailsDialog
        open={allergyDialogOpen}
        onOpenChange={setAllergyDialogOpen}
        allergy={matchedAllergyEntry}
        proposedMedication={propMedName}
        onSave={handleSaveAllergyReview}
      />

      <Step3BChangeMedicationDialog
        open={changeMedOpen}
        onOpenChange={setChangeMedOpen}
        originalDrugName={origMedName}
        suggestions={adaptationSuggestions}
        onSelectProposed={(proposed) => {
          if (onReplaceProposedMedication) {
            onReplaceProposedMedication(proposed);
          } else {
            onEditProposedAdaptation();
          }
        }}
        onEditInStep3A={onEditProposedAdaptation}
      />

      <TreatmentAvoidOverrideDialog
        open={overrideDialogOpen}
        treatment={overrideTreatmentStub}
        displayName={propMedName}
        safetyTier={hasBlock || allergyReviewCheck ? 'AVOID' : 'REVIEW_REQUIRED'}
        onClose={() => setOverrideDialogOpen(false)}
        onConfirm={handleApplyClinicalOverride}
      />
    </div>
  );
});
