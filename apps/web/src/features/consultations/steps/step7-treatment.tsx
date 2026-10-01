'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Plus, AlertTriangle, RotateCcw, ShieldCheck, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notify';
import { cn } from '@/lib/utils';
import type { Consultation, TreatmentRecommendation } from '../types';
import { isClinicalJudgmentMode } from '../types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRecommendTreatment, useSaveStep, useGenerateCounselling, useConfirmTreatmentPlan, useEvaluateTreatmentCandidate, useGenerateDocumentation } from '../hooks';
import {
  startDocumentationPrefetch,
  clearDocumentationPrefetch,
} from '../documents/documentation-prefetch';
import type { DocumentationPackage } from '../documents/types';
import { AddTreatmentDialog } from '../add-treatment-dialog';
import {
  applyCandidateSafety,
  slimTreatmentsForEvaluate,
} from '../add-treatment/candidate';
import {
  TreatmentAvoidOverrideDialog,
  resolveOverrideSource,
  type TreatmentOverrideFormResult,
} from '../treatment-avoid-override-dialog';
import { asArray } from '../safe-data';
import {
  stampPcpDocumentationFields,
  classifyTreatmentDuplicate,
  identityFromTreatmentRecord,
  patientHasRecordedAllergies,
  sanitizeTreatmentSafety,
  compactCounsellingLine,
  selectLatestLabValues,
} from '@safescript/shared';
import { ClinicalPrimaryButton, ClinicalStepFooter } from '../clinical-ui';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PathwayClinicalJudgementStatusChip } from '../pathway-clinical-judgement-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { scrollConsultChildIntoView } from '../clinical-section-scroll';
import {
  canContinueWithSelection,
  mergeTreatmentOptionLists,
  optionKey,
  remapSelectedIndexes,
  requiresClinicalOverride,
  toOptionView,
  treatmentOptionDomId,
  supportsInlinePrescriptionEditor,
  presentTreatmentOptions,
  isPrimarySelectableOption,
  isAdjunctLikeOption,
  nextExpandedTreatmentOptionId,
  blocksUnsavedTreatmentSwitch,
  confirmTreatmentPlanBlockedReason,
  nextSelectedTreatmentForReview,
  togglePrimarySelection,
  addAdjunctSelection,
  toggleAdjunctSelection,
  filterTreatmentOptions,
  type TreatmentOptionView,
  type TreatmentPresentationGroup,
} from '../treatment-options-model';
import { TreatmentRowDetail } from '../treatment-options-ui';
import {
  TreatmentOptionsHeader,
  RecommendedTreatmentsPanel,
  TreatmentOptionCard,
  TreatmentReadOnlyDetails,
  TreatmentGroupAccordion,
  ClinicalJudgmentNotice,
  TreatmentOptionsFilter,
} from '../prioritized-treatment-ui';
import {
  SelectedTreatmentPlanCard,
  type ConfirmPlanButtonState,
} from '../selected-treatment-plan-card';
import {
  buildCounsellingSourceRevision,
  canContinueFromCounselling,
  fillEmptyCounsellingCards,
  generateCounsellingPlan,
  hasUnresolvedTreatmentAllergyConflict,
  toLegacyCounsellingNotes,
  sectionItemCap,
  type CounsellingPlan,
  type CounsellingSectionKey,
} from '../counselling-panel-model';
import { CounsellingFollowUpPanel } from '../counselling-followup-panel';
import {
  isPatientPregnant,
  resolveTreatmentWarningReason,
  readTreatmentPlanConfirmation,
  computeTreatmentPlanHash,
  type TreatmentPlanConfirmStatus,
} from '@safescript/shared';
import { parseDoseAndUnit } from '@/features/pathways/treatment-option-editor-constants';
import { useWizardBeforeLeave } from '../wizard-nav';
import {
  readConsultationDraft,
  writeConsultationDraft,
  type TreatmentStepDraft,
} from '../consultation-draft-cache';

interface Props {
  consultation: Consultation;
  onNext: () => void;
  onBack: () => void;
  backLabel?: string;
  /** Rendered between page title and content (title → stepper → options). */
  stepper?: ReactNode;
  onViewClinicalJudgement?: () => void;
}

function enrichPregnancyWarnings(
  items: TreatmentRecommendation[],
  patientPregnant: boolean,
): TreatmentRecommendation[] {
  return items.map((t) => {
    let next = { ...t };

    if (t.pregnancyCaution && !t.pregnancyReason) {
      const msg = resolveTreatmentWarningReason('pregnancy', 'Yes', t.pregnancyReason);
      if (msg) next.pregnancyReason = msg;
    }

    // Pathway pregnancy Yes flags stay in Drug reference. Only engine-matched
    // findings (safetySource) remain as review alerts (WR-02).
    if (!patientPregnant || !t.pregnancyCaution) {
      if (next.pregnancyWarning && !patientPregnant && !t.pregnancyWarning?.safetySource) {
        const { pregnancyWarning: _removed, ...rest } = next;
        next = rest;
      }
      return next;
    }

    return next;
  });
}

function normalizeTreatments(
  items: unknown,
  patientHasAllergies: boolean,
): TreatmentRecommendation[] {
  return asArray<TreatmentRecommendation>(items)
    .filter((t) => t?.medicationName?.trim())
    .map((t, i) => {
      const parsed = parseDoseAndUnit(t.dose);
      return sanitizeTreatmentSafety(
        {
          ...t,
          priority: i + 1,
          doseAmount: t.doseAmount?.trim() || parsed.dose || undefined,
          doseUnit: t.doseUnit?.trim() || (t.dose?.trim() ? parsed.unit : undefined),
        } as unknown as Record<string, unknown>,
        { patientHasRecordedAllergies: patientHasAllergies },
      ) as unknown as TreatmentRecommendation;
    });
}

function getSavedCounsellingPlan(
  consultation: Consultation,
): CounsellingPlan | null {
  const notes = consultation.counsellingNotes as
    | {
        plan?: CounsellingPlan;
        source?: string;
        generationMode?: string;
      }
    | undefined;
  const plan = notes?.plan ?? null;
  if (!plan?.sections?.length) return null;

  const provenance = String(notes?.generationMode ?? notes?.source ?? '');
  const hasAiItems = plan.sections.some((s) =>
    s.items.some((i) => i.source_type === 'AI_GENERATED'),
  );
  // Prefer AI drafts. Reject pathway/static notes so reload does not resurrect
  // mismatched condition tips (e.g. cold-sore copy with an unrelated antibiotic).
  if (
    provenance === 'ai' ||
    hasAiItems ||
    plan.status === 'REVIEWED' ||
    plan.status === 'PHARMACIST_MODIFIED'
  ) {
    return plan;
  }
  if (
    provenance === 'pathway' ||
    provenance === 'fast' ||
    provenance === 'unavailable'
  ) {
    return null;
  }
  // Legacy saves without provenance: keep only if clearly pharmacist-touched AI
  return hasAiItems ? plan : null;
}

function restoreSelectedIndexes(
  list: TreatmentRecommendation[],
  savedPlan?: { selectedIndexes?: number[]; selectedIndex?: number },
): Set<number> {
  if (!list.length) return new Set();
  if (Array.isArray(savedPlan?.selectedIndexes) && savedPlan.selectedIndexes.length) {
    return new Set(
      savedPlan.selectedIndexes.filter(
        (i) => Number.isInteger(i) && i >= 0 && i < list.length,
      ),
    );
  }
  const idx = savedPlan?.selectedIndex;
  if (typeof idx === 'number' && idx >= 0 && idx < list.length) {
    return new Set([idx]);
  }
  return new Set();
}

export function Step7Treatment({
  consultation,
  onNext,
  onBack,
  backLabel = 'Back',
  stepper,
  onViewClinicalJudgement,
}: Props) {
  const isCj = isClinicalJudgmentMode(consultation.consultationMode);
  const recommend = useRecommendTreatment(consultation.id);
  const saveStep = useSaveStep(consultation.id);
  const evaluateTreatment = useEvaluateTreatmentCandidate(consultation.id);
  const generateDocumentation = useGenerateDocumentation(consultation.id);
  const savedPlan = consultation.treatmentPlan as {
    recommendedTreatments?: TreatmentRecommendation[];
    summary?: string;
    counsellingPoints?: string[];
    followUpPoints?: string[];
    selectedIndex?: number;
    selectedIndexes?: number[];
    intendedIndication?: string;
    treatmentGoal?: string;
    treatmentSource?: string;
  } | undefined;

  const cachedDraft = readConsultationDraft(consultation.id, 'TREATMENT');
  const patientHasAllergies = patientHasRecordedAllergies({
    allergies: consultation.demographics?.allergies,
    allergyEntries: consultation.demographics?.allergyEntries,
    allergiesNone: (consultation.demographics as { allergiesNone?: boolean } | undefined)
      ?.allergiesNone,
  });
  const initialTreatments = normalizeTreatments(
    cachedDraft?.treatments?.length
      ? cachedDraft.treatments
      : savedPlan?.recommendedTreatments,
    patientHasAllergies,
  );

  const [intendedIndication, setIntendedIndication] = useState(
    cachedDraft?.intendedIndication ??
      savedPlan?.intendedIndication ??
      consultation.clinicalJudgmentAssessment?.workingDiagnosisText ??
      '',
  );
  const [treatmentGoal, setTreatmentGoal] = useState(
    cachedDraft?.treatmentGoal ?? savedPlan?.treatmentGoal ?? '',
  );

  const [treatments, setTreatments] = useState<TreatmentRecommendation[]>(
    () => initialTreatments,
  );
  const [summary, setSummary] = useState(
    cachedDraft?.summary ?? savedPlan?.summary ?? '',
  );
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(() => {
    if (cachedDraft?.selectedIndexes?.length) {
      return restoreSelectedIndexes(initialTreatments, {
        selectedIndexes: cachedDraft.selectedIndexes,
      });
    }
    return restoreSelectedIndexes(initialTreatments, savedPlan);
  });
  const [failed, setFailed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const savedCounselling = getSavedCounsellingPlan(consultation);
  const savedConfirm = readTreatmentPlanConfirmation(consultation.treatmentPlan);
  const [savedTreatmentKeys, setSavedTreatmentKeys] = useState<Set<string>>(
    () => {
      if (cachedDraft?.savedTreatmentKeys?.length) {
        return new Set(cachedDraft.savedTreatmentKeys);
      }
      if (
        (cachedDraft?.planConfirmStatus ?? savedConfirm.status) === 'CONFIRMED'
      ) {
        const indexes =
          cachedDraft?.selectedIndexes?.length
            ? cachedDraft.selectedIndexes
            : Array.from(
                restoreSelectedIndexes(initialTreatments, savedPlan),
              );
        const keys = new Set<string>();
        for (const index of indexes) {
          const treatment = (cachedDraft?.treatments ?? initialTreatments)[index];
          if (!treatment) continue;
          keys.add(optionKey(toOptionView(treatment, index)));
        }
        return keys;
      }
      return new Set();
    },
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveErrorByKey, setSaveErrorByKey] = useState<Record<string, string>>({});
  const [safetyUnavailableKeys, setSafetyUnavailableKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [checkingSafetyKey, setCheckingSafetyKey] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingExpandKey, setPendingExpandKey] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<TreatmentOptionView | null>(
    null,
  );
  const [ackTarget, setAckTarget] = useState<TreatmentOptionView | null>(null);
  const [otherSuitableOpen, setOtherSuitableOpen] = useState(false);
  const [addOnOpen, setAddOnOpen] = useState(false);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [otherSuitableQuery, setOtherSuitableQuery] = useState('');
  const [liveMessage, setLiveMessage] = useState('');

  const [planConfirmStatus, setPlanConfirmStatus] =
    useState<TreatmentPlanConfirmStatus>(
      cachedDraft?.planConfirmStatus ?? savedConfirm.status,
    );
  const [confirmationId, setConfirmationId] = useState<string | null>(
    cachedDraft?.confirmationId ?? savedConfirm.confirmation?.confirmationId ?? null,
  );
  const [confirmedAt, setConfirmedAt] = useState<string | null>(
    cachedDraft?.confirmedAt ?? savedConfirm.confirmation?.confirmedAt ?? null,
  );
  const [confirmedPlanHash, setConfirmedPlanHash] = useState<string | null>(
    cachedDraft?.confirmedPlanHash ?? savedConfirm.confirmation?.planHash ?? null,
  );
  const [planVersion, setPlanVersion] = useState(() => {
    if (typeof cachedDraft?.planVersion === 'number') return cachedDraft.planVersion;
    const fromConfirm = savedConfirm.confirmation?.planVersion;
    if (typeof fromConfirm === 'number') return fromConfirm;
    const raw = consultation.treatmentPlan as { planVersion?: number } | undefined;
    return typeof raw?.planVersion === 'number' ? raw.planVersion : 0;
  });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmIdempotencyRef = useRef(`confirm-${consultation.id}-${Date.now()}`);

  const [counsellingPlan, setCounsellingPlan] = useState<CounsellingPlan | null>(
    () => {
      if (cachedDraft?.counsellingPlan?.sections?.length) {
        return cachedDraft.counsellingPlan;
      }
      if (
        (cachedDraft?.planConfirmStatus ?? savedConfirm.status) === 'CONFIRMED' &&
        savedCounselling?.sections?.length &&
        savedCounselling.status !== 'NOT_READY' &&
        savedCounselling.status !== 'LOCKED'
      ) {
        return savedCounselling;
      }
      if ((cachedDraft?.planConfirmStatus ?? savedConfirm.status) === 'CONFIRMED') {
        // Confirmed but no AI draft yet — effect will generate; avoid LOCKED copy.
        return {
          consultation_id: consultation.id,
          source_revision: '',
          pathway_id: consultation.selectedPathwayId,
          status: 'GENERATING',
          context_factors: [],
          sections: [],
          include_detailed_handout: true,
          generated_at: new Date().toISOString(),
          keyMessages: [],
        };
      }
      // Locked until pharmacist confirms the treatment plan (guide §6.4)
      return {
        consultation_id: consultation.id,
        source_revision: '',
        pathway_id: consultation.selectedPathwayId,
        status: 'LOCKED',
        context_factors: [],
        sections: [],
        include_detailed_handout: true,
        generated_at: new Date().toISOString(),
        keyMessages: [],
      };
    },
  );
  const [counsellingEditing, setCounsellingEditing] = useState(false);
  const [counsellingReviewed, setCounsellingReviewed] = useState(
    () =>
      cachedDraft?.counsellingReviewed ??
      savedCounselling?.status === 'REVIEWED',
  );
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(() => {
    const saved = Boolean(consultation.counsellingNotes?.safetyAcknowledged);
    const confirmed =
      (cachedDraft?.planConfirmStatus ?? savedConfirm.status) === 'CONFIRMED';
    return saved && confirmed;
  });
  /** Snapshot used for Restore recommended */
  const [recommendedPlan, setRecommendedPlan] = useState<CounsellingPlan | null>(
    null,
  );

  const patientMedications = consultation.demographics?.medicationEntries ?? [];
  const patientPregnant = useMemo(
    () => isPatientPregnant(consultation.demographics),
    [consultation.demographics],
  );

  const options = useMemo(
    () =>
      enrichPregnancyWarnings(treatments, patientPregnant).map((t, i) =>
        toOptionView(t, i),
      ),
    [treatments, patientPregnant],
  );

  const selectedTreatments = useMemo(() => {
    return [...selectedIndexes]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < treatments.length)
      .sort((a, b) => a - b)
      .map((i) => treatments[i])
      .filter((t): t is TreatmentRecommendation => Boolean(t?.medicationName?.trim()));
  }, [treatments, selectedIndexes]);

  const counsellingSummary = useMemo(() => {
    const age = consultation.demographics?.age?.trim();
    const ageUnit = consultation.demographics?.ageUnit === 'months' ? 'months' : 'years';
    return {
      presentingConcern: consultation.chiefComplaint?.trim() || undefined,
      condition:
        consultation.pathway?.condition?.trim() ||
        consultation.pathway?.name?.trim() ||
        undefined,
      treatments: selectedTreatments.map(
        (t) => t.genericName?.trim() || t.medicationName.trim(),
      ),
      age: age ? `${age} ${Number(age) === 1 && ageUnit === 'years' ? 'year' : ageUnit}` : undefined,
    };
  }, [consultation, selectedTreatments]);

  const presentation = useMemo(() => presentTreatmentOptions(options), [options]);
  const reviewOrder = useMemo(
    () => [
      ...presentation.recommended,
      ...presentation.otherSuitable,
      ...presentation.addOn,
    ],
    [presentation.addOn, presentation.otherSuitable, presentation.recommended],
  );
  const filteredOtherSuitable = useMemo(
    () => filterTreatmentOptions(presentation.otherSuitable, otherSuitableQuery),
    [presentation.otherSuitable, otherSuitableQuery],
  );

  const revealOptionGroup = useCallback(
    (option: TreatmentOptionView) => {
      if (presentation.otherSuitable.some((row) => row.index === option.index)) {
        setOtherSuitableOpen(true);
      }
      if (presentation.addOn.some((row) => row.index === option.index)) {
        setAddOnOpen(true);
      }
      if (presentation.excluded.some((row) => row.index === option.index)) {
        setExcludedOpen(true);
      }
    },
    [presentation.addOn, presentation.excluded, presentation.otherSuitable],
  );

  const hydratedGroups = useRef(false);
  useEffect(() => {
    if (hydratedGroups.current || !options.length) return;
    hydratedGroups.current = true;
    for (const option of options) {
      if (!selectedIndexes.has(option.index)) continue;
      revealOptionGroup(option);
    }
  }, [options, selectedIndexes, revealOptionGroup]);

  const treatmentContinue = canContinueWithSelection(options, selectedIndexes);

  const counsellingContinue = canContinueFromCounselling(counsellingPlan);

  const canContinue =
    treatmentContinue.ok &&
    counsellingContinue.ok &&
    planConfirmStatus === 'CONFIRMED' &&
    treatments.length > 0;

  // Clear selections that became unsafe after safety reclassification.
  // Do not drop indexes that are simply missing during a list swap.
  useEffect(() => {
    setSelectedIndexes((prev) => {
      if (!options.length) return prev;
      let changed = false;
      const next = new Set<number>();
      for (const idx of prev) {
        const opt = options[idx];
        if (!opt) {
          changed = true;
          continue;
        }
        if (opt.selectable) {
          next.add(idx);
        } else {
          changed = true;
        }
      }
      if (changed) {
        setLiveMessage('One or more selections cleared after a safety update.');
      }
      return changed ? next : prev;
    });
  }, [options]);

  const generateCounselling = useGenerateCounselling(consultation.id);
  const confirmTreatmentPlan = useConfirmTreatmentPlan(consultation.id);
  const generateCounsellingRef = useRef(generateCounselling);
  generateCounsellingRef.current = generateCounselling;

  /** Revision currently composing — blocks duplicate in-flight drafts. */
  const counsellingInflightRef = useRef<string | null>(null);
  /** Last revision that successfully produced a plan (AI or fallback). */
  const counsellingCompletedRef = useRef<string | null>(
    savedCounselling?.source_revision &&
      savedCounselling.sections?.length &&
      savedCounselling.status !== 'NOT_READY'
      ? savedCounselling.source_revision
      : null,
  );
  const counsellingPlanRef = useRef(counsellingPlan);
  counsellingPlanRef.current = counsellingPlan;

  const counsellingRevision = useMemo(
    () => buildCounsellingSourceRevision(consultation, selectedTreatments),
    [consultation, selectedTreatments],
  );

  const runAiCounselling = useCallback(
    async (
      selected: TreatmentRecommendation[],
      previous?: CounsellingPlan | null,
      opts?: { force?: boolean; confirmationId?: string | null },
    ) => {
      const revision = buildCounsellingSourceRevision(consultation, selected);
      const activeConfirmationId = opts?.confirmationId ?? confirmationId;

      if (!opts?.force) {
        if (counsellingInflightRef.current === revision) return;
        if (counsellingCompletedRef.current === revision) return;
      }

      if (hasUnresolvedTreatmentAllergyConflict(selected)) {
        const blocked = generateCounsellingPlan(consultation, selected, previous);
        counsellingInflightRef.current = null;
        counsellingCompletedRef.current = revision;
        setCounsellingPlan(blocked);
        return;
      }

      counsellingInflightRef.current = revision;
      const composed = generateCounsellingPlan(consultation, selected, previous);

      if (composed.status === 'SAFETY_BLOCKED') {
        counsellingCompletedRef.current = revision;
        counsellingInflightRef.current = null;
        setCounsellingPlan(composed);
        setLiveMessage(
          'Document a clinical override or remove the blocked treatment.',
        );
        return;
      }

      counsellingCompletedRef.current = revision;
      counsellingInflightRef.current = null;
      setRecommendedPlan(composed);
      setCounsellingReviewed(false);
      setCounsellingPlan(composed);
      setLiveMessage(
        'Counselling drafted from the confirmed treatment plan. Review before continuing.',
      );

      try {
        await generateCounsellingRef.current.mutateAsync({
          mode: 'fast',
          draft: {
            ...toLegacyCounsellingNotes(composed),
            source: 'regimen',
            generationMode: 'composed',
          } as unknown as Record<string, unknown>,
          confirmationId: activeConfirmationId ?? undefined,
        });
      } catch {
        // Local draft remains available; documentation may regenerate later.
      }
    },
    [consultation, confirmationId],
  );

  // When the confirmed selection actually changes, mark counselling outdated.
  // Ignore remounts / pathway refreshes that keep the same confirmed snapshot.
  useEffect(() => {
    if (planConfirmStatus !== 'CONFIRMED') return;
    if (!selectedTreatments.length) return;
    if (confirmedPlanHash) {
      const currentHash = computeTreatmentPlanHash(
        selectedTreatments as unknown as Record<string, unknown>[],
      );
      if (currentHash === confirmedPlanHash) return;
    }
    const prev = counsellingPlanRef.current;
    if (!prev || !prev.sections.length) return;
    if (
      prev.status === 'LOCKED' ||
      prev.status === 'GENERATING' ||
      prev.status === 'NOT_READY'
    ) {
      return;
    }
    if (prev.source_revision === counsellingRevision) return;
    if (prev.status === 'OUTDATED') return;

    setPlanConfirmStatus('STALE');
    setCounsellingReviewed(false);
    setCounsellingPlan({ ...prev, status: 'OUTDATED' });
    setLiveMessage(
      'Treatment plan changed. Reconfirm to generate updated counselling.',
    );
  }, [counsellingRevision, planConfirmStatus, selectedTreatments, confirmedPlanHash]);

  useEffect(() => {
    setCounsellingPlan((prev) => {
      if (!prev) return prev;
      return fillEmptyCounsellingCards(prev, consultation, selectedTreatments);
    });
  }, [consultation, selectedTreatments, counsellingPlan?.status, counsellingPlan?.generated_at]);

  const selectedOptions = useMemo(
    () =>
      options.filter(
        (o) =>
          selectedIndexes.has(o.index) &&
          Boolean(o.treatment.medicationName?.trim()),
      ),
    [options, selectedIndexes],
  );

  const confirmDisabledReason = useMemo(
    () =>
      confirmTreatmentPlanBlockedReason({
        savingKey,
        editingKey,
        dirtyKeys,
        selectedOptions,
        savedTreatmentKeys,
      }),
    [selectedOptions, dirtyKeys, savingKey, editingKey, savedTreatmentKeys],
  );

  const confirmButtonState: ConfirmPlanButtonState = confirmBusy
    ? 'confirming'
    : planConfirmStatus === 'CONFIRMED'
      ? 'confirmed'
      : confirmDisabledReason
        ? 'not_ready'
        : 'ready';

  const handleEditTreatmentPlan = useCallback(() => {
    setPlanConfirmStatus('STALE');
    setConfirmationId(null);
    setConfirmedAt(null);
    setConfirmedPlanHash(null);
    setCounsellingReviewed(false);
    setCounsellingPlan((prev) =>
      prev && prev.sections.length
        ? { ...prev, status: 'OUTDATED' }
        : {
            consultation_id: consultation.id,
            source_revision: '',
            pathway_id: consultation.selectedPathwayId,
            status: 'LOCKED',
            context_factors: [],
            sections: [],
            include_detailed_handout: true,
            generated_at: new Date().toISOString(),
            keyMessages: [],
          },
    );
    counsellingCompletedRef.current = null;
    confirmIdempotencyRef.current = `confirm-${consultation.id}-${Date.now()}`;
    setLiveMessage(
      'Editing treatment plan. Confirm again when ready to refresh counselling.',
    );
    window.requestAnimationFrame(() => {
      scrollConsultChildIntoView(
        document.getElementById('selected-treatment-plan-heading'),
        { block: 'nearest', behavior: 'smooth' },
      );
    });
  }, [consultation.id, consultation.selectedPathwayId]);

  const handleConfirmTreatmentPlan = async () => {
    if (confirmBusy || confirmDisabledReason) return;
    setConfirmBusy(true);
    try {
      const result = await confirmTreatmentPlan.mutateAsync({
        selectedIndexes: [...selectedIndexes].sort((a, b) => a - b),
        selectedTreatments: selectedTreatments as unknown as Record<
          string,
          unknown
        >[],
        expectedPlanVersion: planVersion,
        idempotencyKey: confirmIdempotencyRef.current,
      });
      setPlanConfirmStatus('CONFIRMED');
      setConfirmationId(result.confirmationId);
      setConfirmedAt(result.confirmedAt);
      setPlanVersion(result.planVersion);
      setConfirmedPlanHash(result.planHash);
      toast.success('Treatment plan confirmed');
      setLiveMessage(
        'Treatment plan confirmed. Preparing DAP note and patient handout…',
      );
      await runAiCounselling(selectedTreatments, counsellingPlanRef.current, {
        force: true,
        confirmationId: result.confirmationId,
      });
      beginDocumentationPrefetch({
        documentTypes: ['consultation_note', 'patient_care_summary'],
        force: true,
      });
      confirmIdempotencyRef.current = `confirm-${consultation.id}-${Date.now()}`;
      window.requestAnimationFrame(() => {
        scrollConsultChildIntoView(
          document.getElementById('counselling-followup-heading'),
          { block: 'start', behavior: 'smooth' },
        );
      });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not confirm the treatment plan';
      toast.error(message);
      setLiveMessage('Confirmation failed. Review the plan and try again.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const refreshCounsellingPlan = () => {
    handleEditTreatmentPlan();
  };

  const retryAiCounselling = useCallback(() => {
    if (planConfirmStatus !== 'CONFIRMED') {
      handleEditTreatmentPlan();
      return;
    }
    void runAiCounselling(selectedTreatments, counsellingPlanRef.current, {
      force: true,
      confirmationId,
    });
  }, [
    planConfirmStatus,
    handleEditTreatmentPlan,
    runAiCounselling,
    selectedTreatments,
    confirmationId,
  ]);

  // Confirmed plan but no counselling draft yet — compose once from the
  // selected treatments and pathway Patient Guidance.
  useEffect(() => {
    if (planConfirmStatus !== 'CONFIRMED') return;
    if (!selectedTreatments.length) return;
    const prev = counsellingPlanRef.current;
    if (prev?.status === 'SAFETY_BLOCKED') return;
    if (prev?.status === 'GENERATION_FAILED') return;
    if (prev?.sections?.length) return;
    if (counsellingInflightRef.current) return;
    void runAiCounselling(selectedTreatments, prev, {
      force: true,
      confirmationId,
    });
  }, [
    planConfirmStatus,
    selectedTreatments,
    confirmationId,
    runAiCounselling,
  ]);

  useEffect(() => {
    if (planConfirmStatus !== 'CONFIRMED') {
      setSafetyAcknowledged(false);
    }
  }, [planConfirmStatus]);

  const restoreRecommendedCounselling = () => {
    const draftSections =
      counsellingPlan?.ai_draft ?? recommendedPlan?.ai_draft ?? recommendedPlan?.sections;
    if (!draftSections?.length) {
      refreshCounsellingPlan();
      return;
    }
    const restored: CounsellingPlan = {
      ...(recommendedPlan ?? counsellingPlan)!,
      sections: draftSections.map((s) => ({
        ...s,
        items: s.items.map((item) => ({ ...item })),
      })),
      status: 'READY',
      include_detailed_handout:
        counsellingPlan?.include_detailed_handout ?? true,
      handoutLanguage: counsellingPlan?.handoutLanguage ?? 'en',
      reviewed_at: undefined,
    };
    setCounsellingPlan(restored);
    setCounsellingReviewed(false);
    setLiveMessage('Restored the original counselling draft.');
  };

  const updateCounsellingItem = (
    sectionKey: CounsellingSectionKey,
    itemId: string,
    text: string,
  ) => {
    setCounsellingPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: 'PHARMACIST_MODIFIED',
        sections: prev.sections.map((s) =>
          s.section_key !== sectionKey
            ? s
            : {
                ...s,
                items: s.items.map((i) => {
                  if (i.item_id !== itemId) return i;
                  const compact = compactCounsellingLine(text);
                  const headline = i.headline?.trim();
                  const named =
                    sectionKey === 'MEDICATION_USE' && headline
                      ? compact.toLowerCase().includes(headline.toLowerCase())
                        ? compact
                        : `${headline}: ${compact}`
                      : compact;
                  return {
                    ...i,
                    text: named,
                    detail: compact,
                    pharmacist_modified: true,
                  };
                }),
              },
        ),
      };
    });
    setCounsellingReviewed(false);
  };

  const removeCounsellingItem = (
    sectionKey: CounsellingSectionKey,
    itemId: string,
  ) => {
    setCounsellingPlan((prev) => {
      if (!prev) return prev;
      const section = prev.sections.find((s) => s.section_key === sectionKey);
      const item = section?.items.find((i) => i.item_id === itemId);
      if (item && !item.removable) {
        toast.error('Required safety instructions cannot be removed');
        return prev;
      }
      return {
        ...prev,
        status: 'PHARMACIST_MODIFIED',
        sections: prev.sections.map((s) =>
          s.section_key !== sectionKey
            ? s
            : { ...s, items: s.items.filter((i) => i.item_id !== itemId) },
        ),
      };
    });
    setCounsellingReviewed(false);
  };

  const addCounsellingItem = (sectionKey: CounsellingSectionKey) => {
    setCounsellingPlan((prev) => {
      if (!prev) return prev;
      const section = prev.sections.find((s) => s.section_key === sectionKey);
      if ((section?.items.length ?? 0) >= sectionItemCap(sectionKey)) {
        toast.error(
          `This section can have at most ${sectionItemCap(sectionKey)} points.`,
        );
        return prev;
      }
      const id = `PHARM-${Date.now()}`;
      return {
        ...prev,
        status: 'PHARMACIST_MODIFIED',
        sections: prev.sections.map((s) =>
          s.section_key !== sectionKey
            ? s
            : {
                ...s,
                items: [
                  ...s.items,
                  {
                    item_id: id,
                    text: '',
                    priority: 'OPTIONAL',
                    source_type: 'PHARMACIST_ADDED',
                    editable: true,
                    removable: true,
                    pharmacist_modified: false,
                    pharmacist_added: true,
                    visibility: 'SCREEN',
                    document_targets: ['PATIENT_HANDOUT'],
                  },
                ],
              },
        ),
      };
    });
    setCounsellingReviewed(false);
    setCounsellingEditing(true);
  };

  const runRecommend = () => {
    setFailed(false);
    recommend
      .mutateAsync()
      .then((res) => {
        const r = res as {
          recommendedTreatments?: TreatmentRecommendation[];
          summary?: string;
          selectedIndex?: number;
        };
        const incoming = normalizeTreatments(
          r.recommendedTreatments ?? [],
          patientHasAllergies,
        );
        setTreatments((prev) => {
          const merged = mergeTreatmentOptionLists(prev, incoming);
          const restored = remapSelectedIndexes(prev, selectedIndexes, merged);
          setSelectedIndexes(new Set(restored));
          const next = normalizeTreatments(merged, patientHasAllergies);
          if (!prev.length) {
            setExpandedKey(null);
          }
          return next;
        });
        setSummary((prev) => prev.trim() || r.summary || '');
        if (!initialTreatments.length) {
          setDirtyKeys(new Set());
          setLiveMessage(
            incoming.length
              ? `${incoming.length} treatment options loaded from pathway.`
              : 'No approved treatment options on this pathway.',
          );
        }
      })
      .catch(() => {
        if (treatments.length === 0) {
          setFailed(true);
          toast.error('Could not load treatment options from the pathway');
        } else {
          toast.error('Could not refresh pathway treatment options');
        }
      });
  };

  useEffect(() => {
    runRecommend();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateAt = (index: number, updated: TreatmentRecommendation) => {
    setTreatments((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = updated;
      return normalizeTreatments(next, patientHasAllergies);
    });
  };

  const markDirty = (key: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      const has = prev.has(key);
      if (dirty === has) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const markTreatmentSaved = (key: string) => {
    setSavedTreatmentKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const unmarkTreatmentSaved = (key: string) => {
    setSavedTreatmentKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  /** Fresh selection: Rx/OTC must be saved before Confirm; non-drug is ready on select. */
  const afterTreatmentSelected = (option: TreatmentOptionView) => {
    const key = optionKey(option);
    if (supportsInlinePrescriptionEditor(option)) {
      unmarkTreatmentSaved(key);
      setEditingKey(key);
      focusTreatmentEditor(option);
      return;
    }
    markTreatmentSaved(key);
    setEditingKey(null);
  };

  const toggleTreatmentDetails = (option: TreatmentOptionView) => {
    const key = optionKey(option);
    setExpandedKey((prev) => nextExpandedTreatmentOptionId(prev, key));
  };

  const requestEditPrescription = (option: TreatmentOptionView) => {
    const key = optionKey(option);
    if (
      blocksUnsavedTreatmentSwitch({
        action: 'edit',
        editingKey,
        targetKey: key,
        dirtyKeys,
      })
    ) {
      setPendingExpandKey(key);
      setDiscardOpen(true);
      return;
    }
    setEditingKey(key);
    revealOptionGroup(option);
    focusTreatmentEditor(option);
    setLiveMessage(`Editing prescription for ${option.displayName}.`);
  };

  const closePrescriptionEditor = (key: string) => {
    markDirty(key, false);
    setEditingKey((prev) => (prev === key ? null : prev));
  };

  const focusTreatmentEditor = (option?: TreatmentOptionView) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const headingId = option
          ? `selected-treatment-editor-heading-${option.index}`
          : 'selected-treatment-editor-heading';
        document.getElementById(headingId)?.focus({ preventScroll: true });
        if (!option) return;
        scrollConsultChildIntoView(
          document.getElementById(treatmentOptionDomId(optionKey(option))),
          { block: 'nearest', behavior: 'smooth' },
        );
      });
    });
  };

  const discardUnsavedAndSwitch = () => {
    if (editingKey) markDirty(editingKey, false);
    setSaveErrorByKey((prev) => {
      if (!editingKey || !prev[editingKey]) return prev;
      const next = { ...prev };
      delete next[editingKey];
      return next;
    });
    const nextKey = pendingExpandKey;
    setEditingKey(nextKey);
    setPendingExpandKey(null);
    setDiscardOpen(false);
    if (nextKey) {
      const nextOption = options.find((item) => optionKey(item) === nextKey);
      if (nextOption) {
        revealOptionGroup(nextOption);
        focusTreatmentEditor(nextOption);
      }
    }
  };

  const applyClinicalOverride = (
    option: TreatmentOptionView,
    form: TreatmentOverrideFormResult,
  ) => {
    const t = option.treatment;
    const warningSummary =
      t.allergyWarning?.reason?.trim() ||
      (t.allergyWarning?.patientAllergy
        ? `Allergy: ${t.allergyWarning.patientAllergy}`
        : null) ||
      option.patientSpecificReason ||
      option.avoidReason ||
      undefined;

    updateAt(option.index, {
      ...t,
      clinicalOverride: {
        overriddenAt: new Date().toISOString(),
        reason: form.reason,
        comments: form.comments || undefined,
        acknowledgedRisk: true,
        source: resolveOverrideSource(t, option.safetyTier),
        allergySummary: warningSummary,
      },
    });

    setSelectedIndexes((prev) =>
      new Set(
        isAdjunctLikeOption(option)
          ? addAdjunctSelection(prev, option)
          : prev.has(option.index)
            ? [...prev]
            : togglePrimarySelection(prev, option),
      ),
    );
    if (isAdjunctLikeOption(option)) setAddOnOpen(true);
    else setOtherSuitableOpen(true);
    revealOptionGroup(option);
    afterTreatmentSelected(option);
    setOverrideTarget(null);
    if (planConfirmStatus === 'CONFIRMED') {
      setPlanConfirmStatus('STALE');
      setConfirmationId(null);
      setConfirmedAt(null);
      setConfirmedPlanHash(null);
      setCounsellingReviewed(false);
      setCounsellingPlan((prev) =>
        prev && prev.sections.length
          ? { ...prev, status: 'OUTDATED' }
          : prev,
      );
      counsellingCompletedRef.current = null;
    }
    toast.success(`${option.displayName} unlocked with clinical override`);
    setLiveMessage(
      `Clinical override documented for ${option.displayName}; added to the treatment plan.`,
    );
  };

  const clearClinicalOverride = (option: TreatmentOptionView) => {
    const { clinicalOverride: _removed, ...rest } = option.treatment;
    updateAt(option.index, rest);
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      next.delete(option.index);
      return next;
    });
    setEditingKey((prev) => (prev === optionKey(option) ? null : prev));
    markDirty(optionKey(option), false);
    unmarkTreatmentSaved(optionKey(option));
    const label =
      option.safetyTier === 'AVOID' ? 'Avoid' : 'Review required';
    toast.message(`Override removed for ${option.displayName}`);
    setLiveMessage(
      `${option.displayName} is marked ${label} again and was removed from the selection.`,
    );
  };

  const staleConfirmedPlan = () => {
    if (planConfirmStatus !== 'CONFIRMED') return;
    setPlanConfirmStatus('STALE');
    setConfirmationId(null);
    setConfirmedAt(null);
    setConfirmedPlanHash(null);
    setCounsellingReviewed(false);
    setCounsellingPlan((prev) =>
      prev && prev.sections.length
        ? { ...prev, status: 'OUTDATED' }
        : prev
          ? { ...prev, status: 'LOCKED' }
          : prev,
    );
    counsellingCompletedRef.current = null;
  };

  const clearUnselectedTreatment = (
    option: TreatmentOptionView,
    removedMessage: string,
  ) => {
    const key = optionKey(option);
    if (editingKey === key) setEditingKey(null);
    markDirty(key, false);
    unmarkTreatmentSaved(key);
    setSaveErrorByKey((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    staleConfirmedPlan();
    setLiveMessage(removedMessage);
  };

  const commitPrimarySelection = (option: TreatmentOptionView) => {
    const removing = selectedIndexes.has(option.index);
    setSelectedIndexes((prev) => new Set(togglePrimarySelection(prev, option)));
    if (removing) {
      clearUnselectedTreatment(
        option,
        `${option.displayName} removed from the treatment plan.`,
      );
      return;
    }
    revealOptionGroup(option);
    staleConfirmedPlan();
    afterTreatmentSelected(option);
    setLiveMessage(`${option.displayName} added to the treatment plan.`);
  };

  const commitAddOn = (option: TreatmentOptionView) => {
    const removing = selectedIndexes.has(option.index);
    setSelectedIndexes((prev) => new Set(toggleAdjunctSelection(prev, option)));
    if (removing) {
      clearUnselectedTreatment(
        option,
        `${option.displayName} removed from add-on treatments.`,
      );
      return;
    }
    revealOptionGroup(option);
    staleConfirmedPlan();
    afterTreatmentSelected(option);
    setLiveMessage(`${option.displayName} added as an add-on treatment.`);
  };

  const onRequestPrimarySelection = (option: TreatmentOptionView) => {
    if (!isPrimarySelectableOption(option)) {
      if (requiresClinicalOverride(option.safetyTier) && !option.clinicallyOverridden) {
        setOverrideTarget(option);
        setExpandedKey(optionKey(option));
        setLiveMessage(
          `${option.displayName} requires a clinical override before selection.`,
        );
        return;
      }
      toast.error(`${option.displayName} is not suitable for this patient`);
      setLiveMessage(`${option.displayName} cannot be selected.`);
      return;
    }

    if (selectedIndexes.has(option.index)) {
      commitPrimarySelection(option);
      return;
    }

    if (option.requiresAcknowledgement) {
      setAckTarget(option);
      return;
    }

    commitPrimarySelection(option);
  };

  const onAddAdjunct = (option: TreatmentOptionView) => {
    if (selectedIndexes.has(option.index)) {
      commitAddOn(option);
      return;
    }
    if (!option.selectable) {
      if (requiresClinicalOverride(option.safetyTier) && !option.clinicallyOverridden) {
        setOverrideTarget(option);
        setLiveMessage(
          `${option.displayName} requires a clinical override before it can be added.`,
        );
        return;
      }
      toast.error(`${option.displayName} is not suitable for this patient`);
      return;
    }
    if (option.requiresAcknowledgement) {
      setAckTarget(option);
      return;
    }
    commitAddOn(option);
  };

  const addTreatment = (added: TreatmentRecommendation | TreatmentRecommendation[]) => {
    const list = Array.isArray(added) ? added : [added];
    setTreatments((prev) => {
      const next = normalizeTreatments([...prev, ...list], patientHasAllergies);
      const firstNew = prev.length;
      const view = toOptionView(next[firstNew], firstNew);
      if (view.selectable) {
        if (isAdjunctLikeOption(view)) {
          setSelectedIndexes((prevSel) => new Set(addAdjunctSelection(prevSel, view)));
        } else if (isPrimarySelectableOption(view)) {
          setSelectedIndexes(
            (prevSel) => new Set(togglePrimarySelection(prevSel, view)),
          );
        }
        queueMicrotask(() => afterTreatmentSelected(view));
      }
      setLiveMessage(`${view.displayName} added (pharmacist-added).`);
      window.requestAnimationFrame(() => revealOptionGroup(view));
      return next;
    });
  };

  const focusExistingTreatment = (ref: {
    pathwayOptionId?: string;
    treatmentInstanceId?: string;
    displayName?: string;
  }) => {
    setAddOpen(false);
    const views = treatments.map((t, i) => toOptionView(t, i));
    const match =
      views.find(
        (option) =>
          Boolean(ref.pathwayOptionId) &&
          option.treatment.pathwayTreatmentId === ref.pathwayOptionId,
      ) ??
      views.find(
        (option) =>
          Boolean(ref.treatmentInstanceId) &&
          option.treatment.treatmentInstanceId === ref.treatmentInstanceId,
      ) ??
      views.find((option) => {
        if (!ref.displayName?.trim()) return false;
        return classifyTreatmentDuplicate(
          { medicationName: ref.displayName },
          {
            pathwayOptions: [
              identityFromTreatmentRecord(option.treatment as unknown as Record<string, unknown>),
            ],
            planTreatments: [],
          },
        ).blocking;
      });
    if (!match) return;
    revealOptionGroup(match);
    toggleTreatmentDetails(match);
    requestAnimationFrame(() => {
      scrollConsultChildIntoView(
        document.getElementById(treatmentOptionDomId(optionKey(match))),
        { block: 'nearest', behavior: 'smooth' },
      );
    });
    setLiveMessage(`Opened ${match.displayName}.`);
  };

  const draftSnapshot = useMemo((): TreatmentStepDraft => ({
    treatments,
    selectedIndexes: [...selectedIndexes].sort((a, b) => a - b),
    summary,
    intendedIndication,
    treatmentGoal,
    planConfirmStatus,
    confirmationId,
    confirmedAt,
    planVersion,
    confirmedPlanHash,
    counsellingPlan,
    counsellingReviewed,
    savedTreatmentKeys: [...savedTreatmentKeys],
  }), [
    treatments,
    selectedIndexes,
    summary,
    intendedIndication,
    treatmentGoal,
    planConfirmStatus,
    confirmationId,
    confirmedAt,
    planVersion,
    confirmedPlanHash,
    counsellingPlan,
    counsellingReviewed,
    savedTreatmentKeys,
  ]);

  useEffect(() => {
    if (!treatments.length && selectedIndexes.size === 0) return;
    writeConsultationDraft(consultation.id, 'TREATMENT', draftSnapshot);
  }, [consultation.id, draftSnapshot, treatments.length, selectedIndexes.size]);

  const persistTreatmentDraft = useCallback(async (
    treatmentsOverride?: TreatmentRecommendation[],
  ) => {
    const valid = normalizeTreatments(
      treatmentsOverride ?? draftSnapshot.treatments,
      patientHasAllergies,
    );
    if (!valid.length) return;
    const indexes = draftSnapshot.selectedIndexes.filter(
      (i) => Number.isInteger(i) && i >= 0 && i < valid.length,
    );
    const chosen = indexes.map((i) => {
      const t = valid[i];
      return stampPcpDocumentationFields(
        t as unknown as Record<string, unknown>,
        toOptionView(t, i).displayName,
      ) as unknown as TreatmentRecommendation;
    });
    const stampedCatalog = valid.map(
      (t, i) =>
        stampPcpDocumentationFields(
          t as unknown as Record<string, unknown>,
          toOptionView(t, i).displayName,
        ) as unknown as TreatmentRecommendation,
    );
    writeConsultationDraft(consultation.id, 'TREATMENT', {
      ...draftSnapshot,
      treatments: valid,
      selectedIndexes: indexes,
    });

    const planForSave = draftSnapshot.counsellingPlan;
    const usePoints =
      planForSave?.sections
        .find((s) => s.section_key === 'MEDICATION_USE')
        ?.items.map((i) => i.text) ?? [];
    const followPoints =
      planForSave?.sections
        .find((s) => s.section_key === 'FOLLOW_UP')
        ?.items.map((i) => i.text) ?? [];

    const confirmation =
      draftSnapshot.planConfirmStatus === 'CONFIRMED' && draftSnapshot.confirmationId
        ? {
            confirmationId: draftSnapshot.confirmationId,
            confirmedAt: draftSnapshot.confirmedAt ?? new Date().toISOString(),
            planVersion: draftSnapshot.planVersion,
            planHash: draftSnapshot.confirmedPlanHash ?? '',
            selectedIndexes: indexes,
            selectedNames: chosen.map(
              (t) => t.genericName?.trim() || t.medicationName.trim(),
            ),
          }
        : readTreatmentPlanConfirmation(consultation.treatmentPlan).confirmation;

    await saveStep.mutateAsync({
      stepIndex: 6,
      currentStep: 'TREATMENT',
      data: {
        recommendedTreatments: stampedCatalog,
        selectedTreatments: chosen,
        summary: draftSnapshot.summary,
        selectedIndex: indexes[0] ?? -1,
        selectedIndexes: indexes,
        counsellingPoints: usePoints,
        followUpPoints: followPoints,
        planVersion: draftSnapshot.planVersion,
        confirmStatus: draftSnapshot.planConfirmStatus,
        treatmentSource: isCj ? 'PHARMACIST_SELECTED' : 'PATHWAY_RECOMMENDED',
        intendedIndication: isCj ? draftSnapshot.intendedIndication.trim() : undefined,
        treatmentGoal: isCj ? draftSnapshot.treatmentGoal.trim() : undefined,
        confirmation,
        selectedItemsSnapshot:
          draftSnapshot.planConfirmStatus === 'CONFIRMED' ? chosen : undefined,
      } as unknown as Record<string, unknown>,
    });
  }, [consultation.id, consultation.treatmentPlan, draftSnapshot, isCj, saveStep, patientHasAllergies]);

  const markPlanStaleIfConfirmed = () => {
    if (planConfirmStatus !== 'CONFIRMED') return;
    setPlanConfirmStatus('STALE');
    setConfirmationId(null);
    setConfirmedAt(null);
    setConfirmedPlanHash(null);
    setCounsellingReviewed(false);
    setCounsellingPlan((prev) =>
      prev && prev.sections.length ? { ...prev, status: 'OUTDATED' } : prev,
    );
    counsellingCompletedRef.current = null;
  };

  const handleInlineSave = async (
    option: TreatmentOptionView,
    updated: TreatmentRecommendation,
    opts?: { advance?: boolean },
  ): Promise<TreatmentRecommendation> => {
    const key = optionKey(option);
    setSavingKey(key);
    setSaveErrorByKey((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    let nextTreatment = updated;
    try {
      if (supportsInlinePrescriptionEditor(option)) {
        setCheckingSafetyKey(key);
        try {
          const result = await evaluateTreatment.mutateAsync({
            treatmentInstanceId: updated.treatmentInstanceId,
            source: option.origin === 'PHARMACIST_ADDED' ? 'MANUAL' : 'MANUAL',
            medicationId: updated.drugId,
            drugId: updated.drugId,
            medicationName: updated.medicationName,
            genericName: updated.genericName,
            route: updated.route,
            rxcui: updated.rxcui,
            ndc: updated.ndc,
            existingTreatments: slimTreatmentsForEvaluate(
              treatments.filter((_, index) => index !== option.index),
            ),
          });
          nextTreatment = applyCandidateSafety(updated, result);
          setSafetyUnavailableKeys((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        } catch {
          setSafetyUnavailableKeys((prev) => new Set(prev).add(key));
        } finally {
          setCheckingSafetyKey(null);
        }
      }

      const nextList = treatments.map((item, index) =>
        index === option.index ? nextTreatment : item,
      );
      setTreatments(normalizeTreatments(nextList, patientHasAllergies));
      await persistTreatmentDraft(nextList);
      markPlanStaleIfConfirmed();
      markDirty(key, false);
      markTreatmentSaved(key);
      const shouldAdvance = opts?.advance !== false;
      if (!shouldAdvance) {
        toast.success(`${option.displayName} saved.`);
        setLiveMessage(`${option.displayName} saved.`);
        return nextTreatment;
      }
      const nextOption = nextSelectedTreatmentForReview(
        reviewOrder,
        selectedIndexes,
        option.index,
      );
      if (nextOption) {
        setEditingKey(optionKey(nextOption));
        revealOptionGroup(nextOption);
        focusTreatmentEditor(nextOption);
        toast.success(`${option.displayName} saved. Continue with ${nextOption.displayName}.`);
        setLiveMessage(
          `${option.displayName} saved. Now reviewing ${nextOption.displayName}.`,
        );
      } else {
        closePrescriptionEditor(key);
        if (presentation.counts.addOn > 0) setAddOnOpen(true);
        toast.success(`${option.displayName} saved.`);
        setLiveMessage(`${option.displayName} saved.`);
      }
      return nextTreatment;
    } catch {
      const message = 'Changes could not be saved. Try again.';
      setSaveErrorByKey((prev) => ({ ...prev, [key]: message }));
      throw new Error(message);
    } finally {
      setSavingKey(null);
    }
  };

  useWizardBeforeLeave(persistTreatmentDraft);

  const counsellingAutosaveReady = useRef(false);
  useEffect(() => {
    if (!counsellingAutosaveReady.current) {
      counsellingAutosaveReady.current = true;
      return;
    }
    if (!counsellingPlan || counsellingPlan.status === 'GENERATING') return;
    if (
      counsellingPlan.status === 'SAFETY_BLOCKED' ||
      counsellingPlan.status === 'NOT_READY' ||
      counsellingPlan.status === 'LOCKED'
    ) {
      return;
    }
    const timer = setTimeout(() => {
      const plan = counsellingPlanRef.current;
      if (
        !plan ||
        plan.status === 'GENERATING' ||
        plan.status === 'SAFETY_BLOCKED' ||
        plan.status === 'NOT_READY' ||
        plan.status === 'LOCKED'
      ) {
        return;
      }
      void generateCounsellingRef.current
        .mutateAsync({
          mode: 'fast',
          draft: {
            ...toLegacyCounsellingNotes(plan),
            source: plan.ai_draft ? 'ai' : 'pathway',
            generationMode: plan.ai_draft ? 'ai' : 'fast',
          } as unknown as Record<string, unknown>,
        })
        .catch(() => undefined);
    }, 850);
    return () => clearTimeout(timer);
  }, [counsellingPlan]);

  const beginDocumentationPrefetch = useCallback(
    (opts?: {
      documentTypes?: Array<
        | 'consultation_note'
        | 'prescriber_communication'
        | 'patient_care_summary'
        | 'prescription'
      >;
      force?: boolean;
    }) => {
      if (isCj) return;
      const documentTypes = opts?.documentTypes ?? [
        'consultation_note',
        'prescriber_communication',
        'patient_care_summary',
        'prescription',
      ];
      const force = opts?.force === true;
      if (force) clearDocumentationPrefetch(consultation.id);
      void startDocumentationPrefetch(
        consultation.id,
        async () => {
          const result = await generateDocumentation.mutateAsync({
            requestedDocumentTypes: documentTypes,
            force,
          });
          return result as DocumentationPackage;
        },
        { force },
      ).catch(() => {
        // Step 6 falls back to on-demand generation if prefetch fails.
      });
    },
    [consultation.id, generateDocumentation, isCj],
  );

  const handleNext = async () => {
    if (dirtyKeys.size > 0 || savingKey || editingKey || confirmDisabledReason) {
      toast.error(
        confirmDisabledReason ??
          'Save treatment changes before continuing.',
      );
      setLiveMessage(
        confirmDisabledReason ??
          'Save treatment changes before continuing.',
      );
      return;
    }
    const valid = normalizeTreatments(treatments, patientHasAllergies);
    const views = valid.map((t, i) => toOptionView(t, i));
    const check = canContinueWithSelection(views, selectedIndexes);
    if (!check.ok) {
      toast.error(
        check.reason === 'UNSAFE_SELECTION'
          ? 'Remove unsafe selections before continuing'
          : 'Select at least one treatment before continuing',
      );
      setLiveMessage('Continue blocked: select at least one treatment.');
      return;
    }

    const planForSave =
      counsellingPlan && counsellingContinue.ok
        ? {
            ...counsellingPlan,
            status: 'REVIEWED' as const,
            reviewed_at: new Date().toISOString(),
          }
        : counsellingPlan;

    const counselCheck = canContinueFromCounselling(counsellingPlan);
    if (!counselCheck.ok) {
      const msg =
        counselCheck.reason === 'SAFETY_BLOCKED'
          ? 'Document a clinical override for blocked treatments, or remove them'
            : counselCheck.reason === 'OUTDATED'
            ? 'Reconfirm the treatment plan to refresh counselling'
            : 'Complete counselling & follow-up before continuing';
      toast.error(msg);
      setLiveMessage(`Continue blocked: ${counselCheck.reason}`);
      return;
    }

    setCounsellingReviewed(true);
    if (planForSave) setCounsellingPlan(planForSave);

    if (isCj) {
      if (!intendedIndication.trim() || !treatmentGoal.trim()) {
        toast.error('Enter intended indication and treatment goal before continuing');
        return;
      }
      if (!safetyAcknowledged) {
        toast.error('Confirm you have reviewed medication safety before continuing');
        return;
      }
    }

    await persistTreatmentDraft();

    const existingNotes =
      consultation.counsellingNotes && typeof consultation.counsellingNotes === 'object'
        ? consultation.counsellingNotes
        : {};
    const counselPayload = planForSave ? toLegacyCounsellingNotes(planForSave) : {};

    await saveStep.mutateAsync({
      stepIndex: 7,
      currentStep: 'COUNSELLING',
      data: {
        ...existingNotes,
        ...counselPayload,
        ...(isCj
          ? {
              safetyAcknowledged: true,
              safetyAcknowledgedAt: new Date().toISOString(),
            }
          : {}),
      } as unknown as Record<string, unknown>,
    });

    if (isCj) {
      await saveStep.mutateAsync({
        stepIndex: 7,
        currentStep: 'TREATMENT_RATIONALE',
      });
    }
    // DAP note + patient handout already draft from Confirm treatment plan.
    // PCP letter + prescription wait until patient details Skip/Save on Documents.

    onNext();
  };

  const renderOptionCard = (
    option: TreatmentOptionView,
    group: TreatmentPresentationGroup,
    isLeadRecommended = false,
  ) => {
    const key = optionKey(option);
    const selected = selectedIndexes.has(option.index);
    const detailsOpen = expandedKey === key;
    const isAddOn = group === 'ADD_ON';
    const isEditing = selected && editingKey === key;
    const nextReview = nextSelectedTreatmentForReview(
      reviewOrder,
      selectedIndexes,
      option.index,
    );
    const editor = selected && isEditing ? (
      <>
        {!isAddOn ? null : (
          <div className="mb-3">
            <h3
              id={`selected-treatment-editor-heading-${option.index}`}
              tabIndex={-1}
              className="sr-only"
            >
              Added treatment editor
            </h3>
          </div>
        )}
        <TreatmentRowDetail
          option={option}
          consultationId={consultation.id}
          headingId={`selected-treatment-editor-heading-${option.index}`}
          patientPregnant={patientPregnant}
          patientHasAllergies={patientHasAllergies}
          labsText={consultation.demographics?.labValues}
          extractedLabs={selectLatestLabValues(consultation.demographics?.extractedLabValues ?? [])}
          saving={savingKey === key}
          saveError={saveErrorByKey[key] ?? null}
          checkingSafety={checkingSafetyKey === key}
          safetyUnavailable={safetyUnavailableKeys.has(key)}
          onDirtyChange={(dirty) => markDirty(key, dirty)}
          onSave={
            supportsInlinePrescriptionEditor(option)
              ? (updated) => handleInlineSave(option, updated)
              : (updated) => {
                  updateAt(option.index, updated);
                  markTreatmentSaved(key);
                  closePrescriptionEditor(key);
                  return updated;
                }
          }
          onCancel={() => closePrescriptionEditor(key)}
          onRetrySafety={() =>
            handleInlineSave(option, option.treatment, { advance: false }).catch(() => undefined)
          }
          onRequestOverride={
            requiresClinicalOverride(option.safetyTier) &&
            !option.clinicallyOverridden
              ? () => setOverrideTarget(option)
              : undefined
          }
          onClearOverride={
            option.clinicallyOverridden
              ? () => clearClinicalOverride(option)
              : undefined
          }
          saveLabel={nextReview ? 'Save & continue' : 'Save treatment'}
          continueHint={
            nextReview
              ? `Save to review ${nextReview.displayName} next.`
              : 'Save to confirm this prescription. You can edit it first if needed.'
          }
        />
      </>
    ) : undefined;

    return (
      <TreatmentOptionCard
        key={key}
        option={option}
        group={group}
        isLeadRecommended={isLeadRecommended}
        selected={selected}
        detailsOpen={detailsOpen}
        onToggleDetails={() => toggleTreatmentDetails(option)}
        onOpen={selected && !isEditing ? () => requestEditPrescription(option) : undefined}
        onSelect={() =>
          isAddOn ? onAddAdjunct(option) : onRequestPrimarySelection(option)
        }
        details={
          <TreatmentReadOnlyDetails
            option={option}
            onRequestOverride={
              group === 'EXCLUDED' &&
              requiresClinicalOverride(option.safetyTier) &&
              !option.clinicallyOverridden
                ? () => setOverrideTarget(option)
                : undefined
            }
          />
        }
        editor={editor}
      />
    );
  };

  const addTreatmentButton = (
    <ClinicalPrimaryButton
      type="button"
      size="lg"
      onClick={() => setAddOpen(true)}
      className={cn(
        'h-12 w-full shrink-0 px-6 text-[15px] shadow-sm sm:w-auto sm:min-w-[11.5rem]',
        'bg-[color:var(--tx-preferred)] hover:bg-[color:var(--tx-preferred)]/90',
        'focus-visible:ring-[color:var(--tx-preferred)]/35',
      )}
    >
      <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
      Add treatment
    </ClinicalPrimaryButton>
  );

  const showEmptyCatalog =
    !recommend.isPending && !failed && treatments.length === 0;
  const showFailed = !recommend.isPending && failed && treatments.length === 0;
  const showLoading = recommend.isPending && treatments.length === 0;

  const continueDisabled =
    !canContinue ||
    dirtyKeys.size > 0 ||
    Boolean(savingKey) ||
    (isCj && (!intendedIndication.trim() || !treatmentGoal.trim())) ||
    (isCj && !safetyAcknowledged);
  const continueLoading = saveStep.isPending || recommend.isPending;
  const counsellingStatus = counsellingPlan?.status;
  const showPanelContinue =
    !isCj &&
    Boolean(counsellingPlan) &&
    counsellingStatus !== 'NOT_READY' &&
    counsellingStatus !== 'LOCKED' &&
    counsellingStatus !== 'GENERATING' &&
    counsellingStatus !== 'GENERATION_FAILED' &&
    counsellingStatus !== 'SAFETY_BLOCKED';
  const continueButton = (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full sm:w-auto">
            <ClinicalPrimaryButton
              onClick={() => void handleNext()}
              loading={continueLoading}
              busyFeedback={false}
              disabled={continueDisabled}
              size="lg"
              className="w-full sm:w-auto sm:shrink-0 bg-[color:var(--tx-preferred)] hover:bg-[color:var(--tx-preferred)]/90"
            >
              {isCj ? 'Continue to Rationale' : 'Continue to Documents'}
              <ChevronRight className="h-4 w-4" />
            </ClinicalPrimaryButton>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="end">
          I have reviewed this counselling and follow-up draft
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="mx-auto flex h-auto w-full max-w-[1280px] flex-col justify-start gap-3 pb-2">
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveMessage}
      </div>

      <TreatmentOptionsHeader addAction={addTreatmentButton} />
      {isCj && (
        <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
          Pharmacist-selected treatment · Clinical Judgment workflow
        </div>
      )}

      {stepper ? <div className="mb-4">{stepper}</div> : null}

      <PathwayClinicalJudgementStatusChip
        record={consultation.pathwayClinicalJudgement}
        onView={onViewClinicalJudgement}
      />

      {isCj && (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Intended indication <span className="text-destructive">*</span>
            </label>
            <Input
              value={intendedIndication}
              onChange={(e) => setIntendedIndication(e.target.value)}
              placeholder="Connected to working diagnosis"
              className="h-10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">
              Treatment goal <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={treatmentGoal}
              onChange={(e) => setTreatmentGoal(e.target.value)}
              placeholder="Concise patient-specific goal"
              rows={2}
              className="min-h-[40px] resize-y text-sm"
            />
          </div>
        </div>
      )}

      <section className="space-y-3">
        {showLoading && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card p-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted/60"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
            <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-tx-preferred" />
              Loading approved treatment options…
            </div>
          </div>
        )}

        {showFailed && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/70 bg-card py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-tx-caution" />
            <p className="text-[13px] font-medium">Could not load approved options</p>
            <p className="max-w-sm text-[12px] text-muted-foreground">
              Treatment safety could not be verified. Retry the pathway catalog, or
              use Add treatment above to add a medication manually.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={runRecommend}
              className="mt-1 h-9 gap-1.5 text-[13px]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        {showEmptyCatalog && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/80 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </div>
            <p className="text-[14px] font-semibold text-foreground">
              {isCj ? 'No medications added yet' : 'No approved treatment options'}
            </p>
            <p className="max-w-md px-4 text-[13px] leading-relaxed text-muted-foreground">
              {isCj
                ? 'There is no pathway catalog in Clinical Judgment. Use Add treatment to search and select a medication, then complete safety review.'
                : (
                  <>
                    Only pathway options marked <strong>Approved</strong> appear here.
                    Approve treatments in the pathway Treatment Options tab, then refresh —
                    or add one manually above.
                  </>
                )}
            </p>
            {!isCj && (
              <Button
                variant="outline"
                size="sm"
                onClick={runRecommend}
                className="mt-1 h-9 gap-1.5 text-[13px]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Refresh from pathway
              </Button>
            )}
          </div>
        )}

        {treatments.length > 0 && (
          <div className="space-y-3">
            <RecommendedTreatmentsPanel
              empty={presentation.recommended.length === 0}
              selectedCount={
                presentation.recommended.filter((option) =>
                  selectedIndexes.has(option.index),
                ).length
              }
            >
              {presentation.recommended.map((option, index) =>
                renderOptionCard(option, 'RECOMMENDED', index === 0),
              )}
            </RecommendedTreatmentsPanel>

            {presentation.counts.otherSuitable > 0 && (
              <TreatmentGroupAccordion
                id="tx-other-suitable"
                group="OTHER_SUITABLE"
                count={presentation.counts.otherSuitable}
                open={otherSuitableOpen}
                onToggle={() => setOtherSuitableOpen((open) => !open)}
              >
                {presentation.counts.otherSuitable > 8 ? (
                  <TreatmentOptionsFilter
                    id="tx-other-suitable-filter"
                    value={otherSuitableQuery}
                    onChange={setOtherSuitableQuery}
                    label="Search other suitable options"
                  />
                ) : null}
                {filteredOtherSuitable.map((option) =>
                  renderOptionCard(option, 'OTHER_SUITABLE'),
                )}
              </TreatmentGroupAccordion>
            )}

            {presentation.counts.addOn > 0 && (
              <TreatmentGroupAccordion
                id="tx-add-on"
                group="ADD_ON"
                count={presentation.counts.addOn}
                open={addOnOpen}
                onToggle={() => setAddOnOpen((open) => !open)}
              >
                {presentation.addOn.map((option) => renderOptionCard(option, 'ADD_ON'))}
              </TreatmentGroupAccordion>
            )}

            {presentation.counts.excluded > 0 && (
              <TreatmentGroupAccordion
                id="tx-excluded"
                group="EXCLUDED"
                count={presentation.counts.excluded}
                open={excludedOpen}
                onToggle={() => setExcludedOpen((open) => !open)}
              >
                {presentation.excluded.map((option) =>
                  renderOptionCard(option, 'EXCLUDED'),
                )}
              </TreatmentGroupAccordion>
            )}

            <ClinicalJudgmentNotice />
          </div>
        )}
      </section>

      {/* Confirm checkpoint — counselling generates only after this */}
      {!showLoading && !showFailed && !showEmptyCatalog && (
        <SelectedTreatmentPlanCard
          selectedOptions={selectedOptions}
          confirmState={confirmButtonState}
          confirmStatus={planConfirmStatus}
          disabledReason={confirmDisabledReason}
          confirmedAt={confirmedAt}
          onConfirm={() => void handleConfirmTreatmentPlan()}
          onEditPlan={handleEditTreatmentPlan}
        />
      )}

      <AddTreatmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={addTreatment}
        priority={treatments.length + 1}
        patientMedications={patientMedications}
        consultationId={consultation.id}
        selectedPathwayId={consultation.selectedPathwayId}
        existingMedicationNames={treatments.map((t) => t.medicationName)}
        excludedMedicationIds={treatments
          .map((t) => t.drugId)
          .filter((id): id is string => Boolean(id?.trim()))}
        existingTreatments={treatments}
        onFocusExistingTreatment={focusExistingTreatment}
      />

      <TreatmentAvoidOverrideDialog
        open={Boolean(overrideTarget)}
        treatment={overrideTarget?.treatment ?? null}
        displayName={overrideTarget?.displayName ?? 'this treatment'}
        safetyTier={overrideTarget?.safetyTier}
        onClose={() => setOverrideTarget(null)}
        onConfirm={(form) => {
          if (!overrideTarget) return;
          applyClinicalOverride(overrideTarget, form);
        }}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDiscardOpen(false);
            setPendingExpandKey(null);
          }
        }}
        title="Discard unsaved changes?"
        description="You have unsaved prescription edits. Save or discard them before editing another treatment."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="destructive"
        onConfirm={discardUnsavedAndSwitch}
      />

      <ConfirmDialog
        open={Boolean(ackTarget)}
        onOpenChange={(open) => {
          if (!open) setAckTarget(null);
        }}
        title={
          ackTarget?.clinicallyOverridden
            ? `Use ${ackTarget.displayName} with the documented clinical override?`
            : `Use ${ackTarget?.displayName ?? 'this treatment'} with caution?`
        }
        description={
          ackTarget?.clinicallyOverridden
            ? 'Review the safety warning before continuing.'
            : 'Review the safety considerations in the details panel before continuing.'
        }
        confirmLabel={
          ackTarget && isAdjunctLikeOption(ackTarget) ? 'Add to plan' : 'Select treatment'
        }
        cancelLabel="Cancel"
        variant="default"
        onConfirm={() => {
          if (!ackTarget) return;
          if (isAdjunctLikeOption(ackTarget)) commitAddOn(ackTarget);
          else commitPrimarySelection(ackTarget);
          setAckTarget(null);
        }}
      />

      {/* Counselling & follow-up — same step, below treatment options */}
      <CounsellingFollowUpPanel
        plan={counsellingPlan}
        editing={counsellingEditing}
        reviewed={counsellingReviewed}
        summary={counsellingSummary}
        onToggleEdit={() => setCounsellingEditing((v) => !v)}
        onToggleHandout={(v) => {
          setCounsellingPlan((prev) =>
            prev ? { ...prev, include_detailed_handout: v } : prev,
          );
        }}
        onChangeItem={updateCounsellingItem}
        onRemoveItem={removeCounsellingItem}
        onAddItem={addCounsellingItem}
        onUpdatePlan={refreshCounsellingPlan}
        onRetryGenerate={retryAiCounselling}
        onRestoreRecommended={restoreRecommendedCounselling}
        continueAction={showPanelContinue ? continueButton : undefined}
      />

      {isCj ? (
        <section
          className={cn(
            'mt-6 overflow-hidden rounded-2xl border border-[color:var(--consult-card-border)] bg-card',
            'shadow-[var(--consult-card-shadow)]',
          )}
        >
          <div className="flex items-center gap-2 border-b border-[color:var(--consult-divider)] px-5 py-3.5">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-[15px] font-bold text-foreground">Medication safety</h2>
          </div>
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors',
              safetyAcknowledged ? 'bg-primary/[0.04]' : '',
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border text-primary"
              checked={safetyAcknowledged}
              disabled={planConfirmStatus !== 'CONFIRMED'}
              onChange={(e) => setSafetyAcknowledged(e.target.checked)}
            />
            <span className="text-[13.5px] leading-relaxed text-foreground">
              I have reviewed safety alerts and patient-specific cautions
              for the selected treatment(s). Prescribing readiness Yes does not
              bypass medication safety requirements.
            </span>
          </label>
        </section>
      ) : null}

      <ClinicalStepFooter
        onBack={onBack}
        backLabel={backLabel}
        onNext={showPanelContinue ? undefined : handleNext}
        nextLabel={isCj ? 'Continue to Rationale' : 'Continue to Documents'}
        loading={continueLoading}
        disabled={continueDisabled}
        sticky
        size="lg"
        hint={
          dirtyKeys.size > 0 || savingKey || editingKey
            ? 'Save treatment changes before confirming the plan.'
            : confirmDisabledReason && planConfirmStatus !== 'CONFIRMED'
              ? confirmDisabledReason
            : !treatmentContinue.ok
            ? 'Select at least one treatment to continue'
            : isCj && (!intendedIndication.trim() || !treatmentGoal.trim())
              ? 'Enter intended indication and treatment goal'
            : planConfirmStatus !== 'CONFIRMED'
              ? 'Confirm the treatment plan to generate counselling'
              : counsellingPlan?.status === 'SAFETY_BLOCKED'
              ? 'Document a clinical override or remove the blocked treatment'
              : counsellingPlan?.status === 'GENERATING'
                ? 'Generating counselling from the confirmed plan…'
                : counsellingPlan?.status === 'OUTDATED' ||
                    counsellingPlan?.status === 'LOCKED'
                ? 'Confirm the treatment plan to refresh counselling'
                : isCj && !safetyAcknowledged
                  ? 'Confirm you have reviewed medication safety'
                  : undefined
        }
      />
    </div>
  );
}
