'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Loader2, RotateCw, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notify';
import {
  DEFAULT_PHARMACIST_CONSULTED_REFERENCES,
  evaluateAdaptationSafety,
  freezeAdaptDocumentSnapshot,
  generateAdaptationSuggestions,
  isAdaptStepThreeOptionBValid,
  selectAdaptReferences,
  type AdaptPharmacistConsultedReference,
  type AdaptStepOne,
  type AdaptStepThreeOptionA,
  type AdaptStepThreeOptionB,
  type AdaptStepTwoOptionA,
  type AdaptStepTwoOptionB,
  type AdaptSupportingReferenceSnapshot,
  type ClinicalCheckItem,
  type ProposedPrescription,
} from '@safescript/shared';
import {
  TreatmentAvoidOverrideDialog,
  type TreatmentOverrideFormResult,
} from '@/features/consultations/treatment-avoid-override-dialog';
import type { TreatmentRecommendation } from '@/features/consultations/types';
import {
  AdaptStep3BSafetyEnginePanel,
  type AdaptSafetyEngineStatus,
} from './adapt-step3b-safety-engine';
import { Step3BChangeMedicationDialog } from './step3b-change-medication-dialog';
import { AdaptPharmacistReferencesCard } from './adapt-pharmacist-references-card';

export type AdaptEmbeddedSafetyBlockHandle = {
  confirmTreatment: () => Promise<AdaptStepThreeOptionB | null>;
};

type ClinicalOverrideState = {
  overriddenAt: string;
  reason: string;
  comments?: string;
  acknowledgedRisk: true;
  source: 'ALLERGY' | 'AVOID' | 'CAUTION' | 'REVIEW_REQUIRED';
};

export const AdaptEmbeddedSafetyBlock = forwardRef<
  AdaptEmbeddedSafetyBlockHandle,
  {
    consultationId: string;
    step1: AdaptStepOne;
    step2A?: AdaptStepTwoOptionA;
    step2B?: AdaptStepTwoOptionB;
    step3A: AdaptStepThreeOptionA;
    initialStep3B?: AdaptStepThreeOptionB;
    jurisdiction?: string;
    onSaveStep3B: (step3B: AdaptStepThreeOptionB) => Promise<void>;
    onSafetyGateChange?: (gate: {
      ready: boolean;
      blockedReason?: string | null;
    }) => void;
    onReplaceProposedMedication?: (proposed: ProposedPrescription) => void;
    /** Prefer editing the proposed Rx inline in 3A (clears selection). */
    onChangeMedicationInline?: () => void;
  }
>(function AdaptEmbeddedSafetyBlock(
  {
    consultationId,
    step1,
    step2A,
    step2B,
    step3A,
    initialStep3B,
    jurisdiction = 'AB',
    onSaveStep3B,
    onSafetyGateChange,
    onReplaceProposedMedication,
    onChangeMedicationInline,
  },
  ref,
) {
  const proposed = step3A.proposedPrescription;
  const medName = proposed?.drugName?.trim() || '';
  const proposedFingerprint = [
    proposed?.drugName,
    proposed?.genericName,
    proposed?.dose,
    proposed?.frequency,
    proposed?.route,
    proposed?.sig,
    proposed?.drugId,
  ]
    .map((part) => (part ?? '').trim().toLowerCase())
    .join('|');

  const evaluatedSafety = useMemo(
    () => evaluateAdaptationSafety(step1, step2A, step2B, step3A, jurisdiction),
    // Re-evaluate when clinical inputs / proposed Rx change — not on every rationale keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint scopes step3A
    [step1, step2A, step2B, proposedFingerprint, jurisdiction],
  );

  const [checks, setChecks] = useState<ClinicalCheckItem[]>(() => evaluatedSafety.checks);
  const [safetyEngineAck, setSafetyEngineAck] = useState(
    () => Boolean(initialStep3B?.confirmed) || (initialStep3B?.acknowledgedCheckIds?.length ?? 0) > 0,
  );
  const [clinicalOverride, setClinicalOverride] = useState<ClinicalOverrideState | null>(
    () => initialStep3B?.clinicalOverride ?? null,
  );
  const [safetyStatus, setSafetyStatus] = useState<AdaptSafetyEngineStatus | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [changeMedOpen, setChangeMedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastFingerprint, setLastFingerprint] = useState(proposedFingerprint);
  const [pharmacistConsultedRefs, setPharmacistConsultedRefs] = useState<
    AdaptPharmacistConsultedReference[]
  >(() =>
    initialStep3B?.pharmacistReferencesConsulted?.length
      ? initialStep3B.pharmacistReferencesConsulted
      : DEFAULT_PHARMACIST_CONSULTED_REFERENCES.map((row) => ({ ...row })),
  );

  useEffect(() => {
    setChecks(evaluatedSafety.checks);
  }, [evaluatedSafety]);

  useEffect(() => {
    if (proposedFingerprint === lastFingerprint) return;
    setLastFingerprint(proposedFingerprint);
    // New proposed Rx → require a fresh review acknowledgment / clear override.
    setSafetyEngineAck(false);
    setClinicalOverride(null);
  }, [proposedFingerprint, lastFingerprint]);

  const originalDrugName =
    step1.originalPrescription?.normalized?.genericName ||
    step1.originalPrescription?.normalized?.brandName ||
    step1.originalPrescription?.raw?.medicationText ||
    medName;
  const adaptationSuggestions = useMemo(
    () => generateAdaptationSuggestions(step1, step2A, step2B),
    [step1, step2A, step2B],
  );

  const safetyNeedsAck = Boolean(safetyStatus?.requiresAck);
  const safetyHardStop = Boolean(safetyStatus?.hardStop);
  const safetyLoading = Boolean(safetyStatus?.isLoading);

  useEffect(() => {
    if (!onSafetyGateChange) return;
    if (!medName) {
      onSafetyGateChange({
        ready: false,
        blockedReason: 'Complete the proposed adaptation before confirming treatment.',
      });
      return;
    }
    if (safetyLoading) {
      onSafetyGateChange({
        ready: false,
        blockedReason: 'Safety Engine is still checking this medication…',
      });
      return;
    }
    if (safetyHardStop) {
      onSafetyGateChange({
        ready: false,
        blockedReason:
          'Safety Engine hard stop — change the medication or document a clinical override.',
      });
      return;
    }
    if (safetyNeedsAck && !safetyEngineAck) {
      onSafetyGateChange({
        ready: false,
        blockedReason: 'Acknowledge Safety Engine findings before confirming treatment.',
      });
      return;
    }
    if (!(step3A.rationaleDraft || '').trim()) {
      onSafetyGateChange({
        ready: false,
        blockedReason: 'Add a clinical rationale above before confirming treatment.',
      });
      return;
    }
    onSafetyGateChange({ ready: true, blockedReason: null });
  }, [
    medName,
    onSafetyGateChange,
    safetyEngineAck,
    safetyHardStop,
    safetyLoading,
    safetyNeedsAck,
    step3A.rationaleDraft,
  ]);

  const overrideTreatmentStub = useMemo((): TreatmentRecommendation => {
    return {
      priority: 1,
      medicationName: medName || 'Proposed adaptation',
      genericName: proposed?.genericName,
      dose: proposed?.dose || 'As directed',
      route: proposed?.route || 'oral',
      frequency: proposed?.frequency || 'As directed',
      duration: 'As directed',
      instructions: proposed?.sig || '',
      confidence: 100,
      drugId: proposed?.drugId,
      allergyBlocked: safetyStatus?.tone === 'avoid',
      source: 'manual',
    };
  }, [medName, proposed, safetyStatus?.tone]);

  const handleApplyOverride = useCallback((result: TreatmentOverrideFormResult) => {
    setClinicalOverride({
      overriddenAt: new Date().toISOString(),
      reason: result.reason,
      comments: result.comments?.trim() || undefined,
      acknowledgedRisk: true,
      source: safetyStatus?.tone === 'avoid' ? 'AVOID' : 'REVIEW_REQUIRED',
    });
    setSafetyEngineAck(false);
    setOverrideDialogOpen(false);
    toast.success('Clinical override documented');
  }, [safetyStatus?.tone]);

  const confirmTreatment = useCallback(async (): Promise<AdaptStepThreeOptionB | null> => {
    if (isSubmitting) return null;
    if (!medName) return null;
    if (safetyLoading) {
      toast.error('Safety Engine is still checking this medication…');
      return null;
    }
    if (safetyHardStop) {
      toast.error('Resolve the Safety Engine hard stop before confirming.');
      return null;
    }
    if (safetyNeedsAck && !safetyEngineAck) {
      toast.error('Acknowledge Safety Engine findings before confirming treatment.');
      return null;
    }

    const clinicalRationale = (step3A.rationaleDraft || '').trim();
    if (!clinicalRationale) {
      toast.error('Add a clinical rationale before confirming treatment.');
      return null;
    }

    const reviewIds = checks
      .filter((c) => c.requiresAcknowledgment)
      .map((c) => c.id);
    const acknowledgedCheckIds =
      safetyEngineAck || clinicalOverride
        ? Array.from(new Set([...reviewIds, ...checks.filter((c) => c.severity === 'block').map((c) => c.id)]))
        : [];

    const pharmacistReferencesConsulted = pharmacistConsultedRefs;

    const selector = selectAdaptReferences(
      {
        consultationId: consultationId || 'preview',
        jurisdiction,
        adaptationType:
          step1.adaptationType === 'dosage_form' ||
          step1.adaptationType === 'regimen' ||
          step1.adaptationType === 'route' ||
          step1.adaptationType === 'therapeutic_substitution'
            ? step1.adaptationType
            : 'dose',
        adaptationReasonCode: (step1.adaptationReason?.code || 'OTHER').toLowerCase(),
        adaptationReasonLabel: step1.adaptationReason?.label,
        triggeredCheckCodes: checks.map((c) => c.id),
        includeSafetyRuleReferences: true,
      },
      [],
    );

    const safeScribeSupportingReferences: AdaptSupportingReferenceSnapshot[] = (
      selector.allSelectedReferences ?? []
    ).map((row) => ({
      referenceId: row.referenceId,
      title: row.title,
      organizationPublisher: row.organizationPublisher ?? undefined,
      yearEdition: row.yearEdition ?? undefined,
      version: row.version ?? undefined,
      jurisdiction: row.jurisdiction ?? undefined,
      sectionsUsed: row.relevantSections,
      usedForCheckCodes: row.matchedCheckCodes,
      source: row.source,
    }));

    const confirmedAt = new Date().toISOString();
    const selectedCheckId =
      checks.find((c) => c.severity === 'block')?.id ||
      checks.find((c) => c.severity === 'review')?.id ||
      checks[0]?.id ||
      'renal_function';

    const payloadBase: AdaptStepThreeOptionB = {
      checks,
      selectedCheckId,
      evaluatedAt: confirmedAt,
      overallStatus: checks.some((c) => c.severity === 'block')
        ? clinicalOverride
          ? 'review'
          : 'block'
        : checks.some((c) => c.severity === 'review')
          ? 'review'
          : 'pass',
      clinicalRationale,
      rationaleEditedByPharmacist: Boolean(step3A.rationaleEditedByPharmacist),
      acknowledgedCheckIds,
      pharmacistNotes: initialStep3B?.pharmacistNotes ?? {},
      clinicalOverride: clinicalOverride ?? undefined,
      pharmacistReferencesConsulted,
      safeScribeSupportingReferences,
      confirmed: true,
      confirmedAt,
    };

    const frozen = freezeAdaptDocumentSnapshot({
      consultationId: consultationId && consultationId !== 'preview' ? consultationId : undefined,
      step1,
      step2A,
      step2B,
      step3A,
      step3B: payloadBase,
      pharmacistReferencesConsulted,
      safeScribeSupportingReferences,
      context: { confirmedAt },
    });

    const payload: AdaptStepThreeOptionB = {
      ...payloadBase,
      documentSnapshotId: frozen.snapshotId,
      documentSnapshotHash: frozen.snapshotHash,
    };

    const validation = isAdaptStepThreeOptionBValid(payload);
    if (!validation.valid) {
      toast.error(validation.missingFields.join('; ') || 'Cannot confirm treatment yet.');
      return null;
    }

    setIsSubmitting(true);
    try {
      await onSaveStep3B(payload);
      return payload;
    } catch {
      toast.error('Failed to save safety confirmation. Please try again.');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    checks,
    clinicalOverride,
    consultationId,
    initialStep3B?.pharmacistNotes,
    pharmacistConsultedRefs,
    isSubmitting,
    jurisdiction,
    medName,
    onSaveStep3B,
    safetyEngineAck,
    safetyHardStop,
    safetyLoading,
    safetyNeedsAck,
    step1,
    step2A,
    step2B,
    step3A,
  ]);

  useImperativeHandle(ref, () => ({ confirmTreatment }), [confirmTreatment]);

  if (!medName) {
    return (
      <div className="rounded-xl border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-5 text-sm text-[#829ab1]">
        Add a proposed medication above to run Safety Engine checks for this adaptation.
      </div>
    );
  }

  return (
    <div id="adapt-safety-engine" className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef8f7] text-[#0F6F6B]">
            <Shield className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-[#102a43]">Safety Engine</h3>
            <p className="text-[12px] text-[#617184]">
              Patient-specific alerts for the proposed adaptation — review before confirming treatment.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg border-[#d9e4e8] px-2.5 text-xs font-semibold"
          onClick={() => setRefetchToken((n) => n + 1)}
        >
          {safetyLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          Recheck
        </Button>
      </div>

      <AdaptStep3BSafetyEnginePanel
        consultationId={consultationId}
        proposed={proposed}
        adaptChecks={checks}
        acknowledged={safetyEngineAck}
        onAcknowledgedChange={setSafetyEngineAck}
        onChangeMedication={() => {
          if (onChangeMedicationInline) {
            onChangeMedicationInline();
            return;
          }
          setChangeMedOpen(true);
        }}
        onRequestOverride={() => setOverrideDialogOpen(true)}
        onClearOverride={
          clinicalOverride
            ? () => {
                setClinicalOverride(null);
                setSafetyEngineAck(false);
              }
            : undefined
        }
        clinicalOverride={
          clinicalOverride
            ? {
                reason: clinicalOverride.reason,
                comments: clinicalOverride.comments,
                overriddenAt: clinicalOverride.overriddenAt,
              }
            : null
        }
        onStatusChange={setSafetyStatus}
        refetchToken={refetchToken}
      />

      <AdaptPharmacistReferencesCard
        value={pharmacistConsultedRefs}
        onChange={setPharmacistConsultedRefs}
      />

      <TreatmentAvoidOverrideDialog
        open={overrideDialogOpen}
        treatment={overrideTreatmentStub}
        displayName={medName}
        safetyTier={safetyStatus?.tone === 'avoid' ? 'AVOID' : 'REVIEW_REQUIRED'}
        onClose={() => setOverrideDialogOpen(false)}
        onConfirm={handleApplyOverride}
      />

      {onReplaceProposedMedication ? (
        <Step3BChangeMedicationDialog
          open={changeMedOpen}
          onOpenChange={setChangeMedOpen}
          originalDrugName={originalDrugName}
          suggestions={adaptationSuggestions}
          onSelectProposed={(next) => {
            onReplaceProposedMedication(next);
            setChangeMedOpen(false);
            setClinicalOverride(null);
            setSafetyEngineAck(false);
          }}
          onEditInStep3A={() => {
            setChangeMedOpen(false);
            if (onChangeMedicationInline) onChangeMedicationInline();
          }}
        />
      ) : null}
    </div>
  );
});
