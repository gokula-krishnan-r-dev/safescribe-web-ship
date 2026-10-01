'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import { CounsellingFollowUpPanel } from '@/features/consultations/counselling-followup-panel';
import {
  canContinueFromCounselling,
  SECTION_DISPLAY_TITLE,
  sectionItemCap,
  toLegacyCounsellingNotes,
  type CounsellingGuidanceItem,
  type CounsellingPlan,
  type CounsellingSection,
  type CounsellingSectionKey,
} from '@/features/consultations/counselling-panel-model';
import { useGenerateCounselling } from '@/features/consultations/hooks';
import type { Consultation, TreatmentRecommendation } from '@/features/consultations/types';
import {
  ADAPT_COUNSELLING_EMPTY_REASON,
  buildAdaptHowToUseLine,
  buildAdaptMedicationDisplayName,
  compactCounsellingLine,
} from '@safescript/shared';
import type {
  AdaptCounsellingPayload,
  AdaptStepOne,
  AdaptStepThreeOptionA,
  AdaptStepThreeOptionB,
  ProposedPrescription,
  TreatmentPlanConfirmStatus,
} from '@safescript/shared';
import type { ConfirmPlanButtonState } from '@/features/consultations/selected-treatment-plan-card';
import {
  useGenerateAdaptCounselling,
  type AdaptCounsellingResponse,
} from '@/features/adapt/hooks';

export type AdaptConfirmFooterState = {
  confirmState: ConfirmPlanButtonState;
  confirmStatus: TreatmentPlanConfirmStatus;
  disabledReason?: string | null;
  confirmedAt?: string | null;
};

function proposedToTreatment(
  proposed?: ProposedPrescription | null,
): TreatmentRecommendation | null {
  const displayName = buildAdaptMedicationDisplayName(proposed);
  if (!proposed?.drugName?.trim() && displayName === 'Medication') return null;
  return {
    priority: 1,
    confidence: 1,
    medicationName: proposed?.drugName?.trim() || displayName,
    genericName: proposed?.genericName?.trim() || undefined,
    brandName: proposed?.brandName?.trim() || undefined,
    dose: proposed?.strength?.trim() || proposed?.dose?.trim() || undefined,
    route: proposed?.route?.trim() || undefined,
    frequency: proposed?.frequency?.trim() || undefined,
    quantity:
      proposed?.quantity != null && proposed.quantity !== ''
        ? String(proposed.quantity)
        : undefined,
    instructions: proposed?.sig?.trim() || undefined,
    patientDirections: proposed?.sig?.trim() || undefined,
    displayName,
    category: 'PRESCRIPTION',
  };
}

/** Deterministic Card 1 from confirmed adapted Rx (never trust AI for this line). */
function adaptHowToUseItem(proposed?: ProposedPrescription | null): CounsellingGuidanceItem | null {
  if (!proposed?.drugName?.trim() && !proposed?.sig?.trim()) return null;
  const payload = {
    medication: {
      display_name: buildAdaptMedicationDisplayName(proposed),
      ingredient: '',
      dosage_form: '',
      route: '',
    },
    adapted_prescription: {
      patient_directions: proposed?.sig?.trim() || '',
    },
  } as AdaptCounsellingPayload;
  const line = buildAdaptHowToUseLine(payload);
  if (!line) return null;
  return bulletToItem('MEDICATION_USE', line, 0, 'SELECTED_REGIMEN');
}

function buildAdaptPlanHash(proposed?: ProposedPrescription | null): string {
  if (!proposed?.drugName) return '';
  const parts = [
    proposed.drugName,
    proposed.genericName ?? '',
    proposed.strength ?? '',
    proposed.dose ?? '',
    proposed.frequency ?? '',
    proposed.route ?? '',
    proposed.sig ?? '',
    String(proposed.quantity ?? ''),
    String(proposed.refills ?? ''),
  ];
  let h = 0;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `adapt-${h.toString(16)}`;
}

function counsellingPreviewFromPlan(plan: CounsellingPlan | null): string[] {
  if (!plan?.sections?.length) return [];
  const out: string[] = [];
  for (const section of plan.sections) {
    for (const item of section.items) {
      const line = compactCounsellingLine(
        item.headline && item.detail
          ? `${item.headline}. ${item.detail}`
          : item.text || item.headline || item.detail || '',
      );
      if (line) out.push(line);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function lockedPlan(consultationId: string): CounsellingPlan {
  return {
    consultation_id: consultationId,
    source_revision: 'locked',
    pathway_id: undefined,
    status: 'LOCKED',
    context_factors: [],
    sections: [],
    include_detailed_handout: true,
    generated_at: new Date().toISOString(),
    keyMessages: [],
  };
}

function bulletToItem(
  sectionKey: CounsellingSectionKey,
  text: string,
  index: number,
  source: CounsellingGuidanceItem['source_type'],
): CounsellingGuidanceItem {
  const compact = compactCounsellingLine(text);
  const isMed = sectionKey === 'MEDICATION_USE';
  let headline: string | undefined;
  let detail: string | undefined;
  if (isMed && compact.includes(':')) {
    const idx = compact.indexOf(':');
    headline = compact.slice(0, idx).trim();
    detail = compact.slice(idx + 1).trim();
  }
  return {
    item_id: `ADAPT-${sectionKey}-${index}`,
    text: compact,
    headline,
    detail: detail || (isMed ? compact : undefined),
    priority: index === 0 ? 'REQUIRED' : 'RECOMMENDED',
    source_type: source,
    editable: true,
    removable: !isMed,
    pharmacist_modified: false,
    visibility: 'SCREEN',
    document_targets: ['CLINICAL_NOTE', 'PATIENT_HANDOUT', 'PRESCRIBER_COMM'],
  };
}

function adaptResponseToPlan(
  consultationId: string,
  revision: string,
  response: AdaptCounsellingResponse,
  previous?: CounsellingPlan | null,
  proposed?: ProposedPrescription | null,
): CounsellingPlan {
  const sourceType =
    response.source === 'ai' ? ('AI_GENERATED' as const) : ('DETERMINISTIC_DEFAULT' as const);
  const order: CounsellingSectionKey[] = [
    'MEDICATION_USE',
    'EXPECTED_RESPONSE',
    'SELF_CARE',
    'FOLLOW_UP',
  ];
  const byKey = new Map(response.sections.map((s) => [s.section_key, s.bullets] as const));
  const howToUse = adaptHowToUseItem(proposed);

  const sections: CounsellingSection[] = order.map((key) => {
    let items: CounsellingGuidanceItem[] = [];
    if (key === 'MEDICATION_USE' && howToUse) {
      items = [howToUse];
    } else {
      const bullets = byKey.get(key) ?? [];
      items = bullets
        .map((text, i) => bulletToItem(key, text, i, sourceType))
        .filter((i) => Boolean(i.text));
    }

    if (previous) {
      const preserved = (previous.sections.find((s) => s.section_key === key)?.items ?? []).filter(
        (i) => i.pharmacist_modified || i.pharmacist_added,
      );
      if (preserved.length) {
        const seen = new Set(items.map((i) => i.text.toLowerCase()));
        for (const item of preserved) {
          const k = item.text.toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          items.push(item);
        }
      }
    }

    return {
      section_key: key,
      title: SECTION_DISPLAY_TITLE[key],
      items: items.slice(0, sectionItemCap(key)),
    };
  });

  return {
    consultation_id: consultationId,
    source_revision: revision,
    pathway_id: undefined,
    status: 'READY',
    context_factors: [],
    sections,
    include_detailed_handout: previous?.include_detailed_handout ?? true,
    generated_at: response.generatedAt || new Date().toISOString(),
    ai_draft: sections.map((s) => ({
      ...s,
      items: s.items.map((item) => ({ ...item })),
    })),
    handoutLanguage: previous?.handoutLanguage ?? 'en',
    keyMessages: sections
      .flatMap((s) => s.items.filter((i) => i.priority === 'REQUIRED').map((i) => i.text))
      .slice(0, 5),
  };
}

function readSavedAdaptCounselling(consultation: Consultation): CounsellingPlan | null {
  const notes = consultation.counsellingNotes as
    | {
        plan?: CounsellingPlan;
        sections?: Array<{
          section_key?: string;
          category?: string;
          bullets?: string[];
          points?: Array<{ point?: string }>;
        }>;
        source?: string;
        generationMode?: string;
      }
    | undefined;
  if (notes?.plan?.sections?.length) return notes.plan;

  // Rebuild from API-persisted Adapt AI draft (sections/bullets shape).
  if (Array.isArray(notes?.sections) && notes.sections.length) {
    const order: CounsellingSectionKey[] = [
      'MEDICATION_USE',
      'EXPECTED_RESPONSE',
      'SELF_CARE',
      'FOLLOW_UP',
    ];
    const sections: CounsellingSection[] = order.map((key) => {
      const row = notes.sections!.find((s) => s.section_key === key);
      const bullets =
        row?.bullets ??
        row?.points?.map((p) => p.point ?? '').filter(Boolean) ??
        [];
      return {
        section_key: key,
        title: SECTION_DISPLAY_TITLE[key],
        items: bullets.map((text, i) =>
          bulletToItem(
            key,
            text,
            i,
            key === 'MEDICATION_USE' ? 'SELECTED_REGIMEN' : 'AI_GENERATED',
          ),
        ),
      };
    });
    if (sections.some((s) => s.items.length)) {
      return {
        consultation_id: consultation.id,
        source_revision: 'saved-adapt',
        status: 'READY',
        context_factors: [],
        sections,
        include_detailed_handout: true,
        generated_at: new Date().toISOString(),
        keyMessages: [],
      };
    }
  }
  return null;
}

function resolveValidationTarget(
  reason: string | null | undefined,
): 'proposal' | 'safety' | 'rationale' {
  const text = (reason || '').toLowerCase();
  if (text.includes('rationale')) return 'rationale';
  if (
    text.includes('safety') ||
    text.includes('acknowledge') ||
    text.includes('hard stop') ||
    text.includes('override')
  ) {
    return 'safety';
  }
  return 'proposal';
}

export type AdaptCounsellingSectionHandle = {
  confirmTreatment: () => Promise<boolean>;
  handleBlockedConfirm: () => void;
  handleEditPlan: () => void;
};

export const AdaptCounsellingSection = forwardRef<
  AdaptCounsellingSectionHandle,
  {
    consultation: Consultation;
    step1: AdaptStepOne;
    step3A?: AdaptStepThreeOptionA;
    step3B?: AdaptStepThreeOptionB;
    /** True when 3B safety gate allows confirmation (no hard stop, acks done). */
    safetyReady: boolean;
    safetyBlockedReason?: string | null;
    /** Persist 3B freeze snapshot; returns confirmed payload or null if blocked. */
    onRequestConfirmTreatment: () => Promise<AdaptStepThreeOptionB | null>;
    /** Jump to the blocker inside Proposed Adaptation / Safety Engine. */
    onFocusValidationIssue?: (target?: 'proposal' | 'safety' | 'rationale') => void;
    onEditProposedAdaptation: () => void;
    /** Keep Proposed Adaptation footer Confirm CTA in sync. */
    onConfirmFooterChange?: (footer: AdaptConfirmFooterState) => void;
    onContinueToDocuments: (opts: {
      step3B: AdaptStepThreeOptionB;
      counsellingPreview: string[];
      counsellingPlan: CounsellingPlan;
    }) => Promise<void> | void;
    continueLoading?: boolean;
  }
>(function AdaptCounsellingSection(
  {
    consultation,
    step1,
    step3A,
    step3B,
    safetyReady,
    safetyBlockedReason,
    onRequestConfirmTreatment,
    onFocusValidationIssue,
    onEditProposedAdaptation,
    onConfirmFooterChange,
    onContinueToDocuments,
    continueLoading,
  },
  ref,
) {
  const proposed = step3A?.proposedPrescription;
  const selected = useMemo(() => {
    const t = proposedToTreatment(proposed);
    return t ? [t] : [];
  }, [proposed]);

  const planHash = useMemo(() => buildAdaptPlanHash(proposed), [proposed]);
  const savedPlan = useMemo(
    () => readSavedAdaptCounselling(consultation),
    [consultation],
  );

  const [planConfirmStatus, setPlanConfirmStatus] =
    useState<TreatmentPlanConfirmStatus>(() =>
      step3B?.confirmed && savedPlan?.sections?.length ? 'CONFIRMED' : 'DRAFT',
    );
  const [confirmedAt, setConfirmedAt] = useState<string | null>(
    () => step3B?.confirmedAt ?? null,
  );
  const [confirmedPlanHash, setConfirmedPlanHash] = useState<string | null>(() =>
    step3B?.confirmed ? planHash : null,
  );
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [counsellingPlan, setCounsellingPlan] = useState<CounsellingPlan | null>(() => {
    if (step3B?.confirmed && savedPlan?.sections?.length) return savedPlan;
    return lockedPlan(consultation.id);
  });
  const [recommendedPlan, setRecommendedPlan] = useState<CounsellingPlan | null>(null);
  const [counsellingEditing, setCounsellingEditing] = useState(false);
  const [counsellingReviewed, setCounsellingReviewed] = useState(
    () => savedPlan?.status === 'REVIEWED',
  );
  const [continueBusy, setContinueBusy] = useState(false);

  const counsellingPlanRef = useRef(counsellingPlan);
  counsellingPlanRef.current = counsellingPlan;
  const counsellingInflightRef = useRef<string | null>(null);
  const generateCounselling = useGenerateCounselling(consultation.id);
  const generateCounsellingRef = useRef(generateCounselling);
  generateCounsellingRef.current = generateCounselling;
  const generateAdaptCounselling = useGenerateAdaptCounselling(consultation.id);
  const generateAdaptCounsellingRef = useRef(generateAdaptCounselling);
  generateAdaptCounsellingRef.current = generateAdaptCounselling;

  const disabledReason = useMemo(() => {
    if (!proposed?.drugName?.trim()) {
      return 'Complete the proposed adaptation above before confirming.';
    }
    if (!proposed.sig?.trim() || !proposed.dose?.trim() || !proposed.frequency?.trim()) {
      return 'Finish dosing and directions in the proposed adaptation before confirming.';
    }
    if (!safetyReady) {
      return (
        safetyBlockedReason?.trim() ||
        'Resolve Safety Engine findings before confirming treatment.'
      );
    }
    return null;
  }, [proposed, safetyReady, safetyBlockedReason]);

  const confirmState: ConfirmPlanButtonState = confirmBusy
    ? 'confirming'
    : planConfirmStatus === 'CONFIRMED'
      ? 'confirmed'
      : disabledReason
        ? 'not_ready'
        : 'ready';

  const runCounselling = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!selected.length || !proposed?.sig?.trim()) return;
      const revision = planHash || `adapt-${consultation.id}`;
      if (!opts?.force && counsellingInflightRef.current === revision) return;

      counsellingInflightRef.current = revision;
      setCounsellingPlan({
        ...lockedPlan(consultation.id),
        status: 'GENERATING',
        source_revision: revision,
        include_detailed_handout:
          counsellingPlanRef.current?.include_detailed_handout ?? true,
        handoutLanguage: counsellingPlanRef.current?.handoutLanguage ?? 'en',
      });
      setCounsellingReviewed(false);

      try {
        const response = await generateAdaptCounsellingRef.current.mutateAsync();
        const plan = adaptResponseToPlan(
          consultation.id,
          revision,
          response,
          counsellingPlanRef.current,
          proposed,
        );
        setRecommendedPlan(plan);
        setCounsellingPlan(plan);

        try {
          await generateCounsellingRef.current.mutateAsync({
            mode: 'fast',
            draft: {
              ...toLegacyCounsellingNotes(plan),
              source: response.source === 'ai' ? 'ai' : 'adapt',
              generationMode: 'adapt_ai',
              adapt_ai: response.ai,
              promptVersion: response.promptVersion,
              schemaVersion: response.schemaVersion,
            } as unknown as Record<string, unknown>,
            selectedTreatments: selected as unknown as Record<string, unknown>[],
          });
        } catch {
          // Local Adapt AI draft remains available for pharmacist review.
        }
      } catch {
        setCounsellingPlan({
          consultation_id: consultation.id,
          source_revision: revision,
          status: 'GENERATION_FAILED',
          context_factors: [],
          sections: [
            {
              section_key: 'MEDICATION_USE',
              title: SECTION_DISPLAY_TITLE.MEDICATION_USE,
              items: proposed?.drugName
                ? [
                    bulletToItem(
                      'MEDICATION_USE',
                      `${proposed.drugName}: ${proposed.sig || ''}`.trim(),
                      0,
                      'SELECTED_REGIMEN',
                    ),
                  ]
                : [],
            },
            {
              section_key: 'EXPECTED_RESPONSE',
              title: SECTION_DISPLAY_TITLE.EXPECTED_RESPONSE,
              items: [],
            },
            {
              section_key: 'SELF_CARE',
              title: SECTION_DISPLAY_TITLE.SELF_CARE,
              items: [],
            },
            {
              section_key: 'FOLLOW_UP',
              title: SECTION_DISPLAY_TITLE.FOLLOW_UP,
              items: [],
            },
          ],
          include_detailed_handout: true,
          generated_at: new Date().toISOString(),
          keyMessages: [],
          failure_reason:
            'Unable to generate counselling guidance. Retry or add guidance manually.',
        });
      } finally {
        counsellingInflightRef.current = null;
      }
    },
    [consultation.id, planHash, proposed, selected],
  );

  // Mark counselling stale when proposed Rx changes after confirm
  useEffect(() => {
    if (planConfirmStatus !== 'CONFIRMED') return;
    if (!confirmedPlanHash) return;
    if (planHash === confirmedPlanHash) return;
    const prev = counsellingPlanRef.current;
    if (!prev?.sections.length) return;
    if (prev.status === 'OUTDATED' || prev.status === 'LOCKED' || prev.status === 'GENERATING') {
      return;
    }
    setPlanConfirmStatus('STALE');
    setCounsellingReviewed(false);
    setCounsellingPlan({ ...prev, status: 'OUTDATED' });
  }, [planHash, planConfirmStatus, confirmedPlanHash]);

  const handleBlockedConfirm = useCallback(() => {
    const reason =
      disabledReason ||
      'Resolve Safety Engine findings before confirming treatment.';
    toast.error(reason);
    onFocusValidationIssue?.(resolveValidationTarget(reason));
  }, [disabledReason, onFocusValidationIssue]);

  const handleConfirm = useCallback(async (): Promise<boolean> => {
    if (confirmBusy) return false;
    if (disabledReason) {
      handleBlockedConfirm();
      return false;
    }
    setConfirmBusy(true);
    try {
      const saved3B = await onRequestConfirmTreatment();
      if (!saved3B) {
        toast.error('Complete the safety review before confirming.');
        onFocusValidationIssue?.('safety');
        return false;
      }
      setPlanConfirmStatus('CONFIRMED');
      setConfirmedAt(saved3B.confirmedAt ?? new Date().toISOString());
      setConfirmedPlanHash(planHash);
      toast.success('Treatment plan confirmed');
      await runCounselling({ force: true });
      window.requestAnimationFrame(() => {
        scrollConsultChildIntoView(
          document.getElementById('counselling-followup-heading'),
          { block: 'start', behavior: 'smooth' },
        );
      });
      return true;
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not confirm the treatment plan';
      toast.error(message);
      return false;
    } finally {
      setConfirmBusy(false);
    }
  }, [
    confirmBusy,
    disabledReason,
    handleBlockedConfirm,
    onFocusValidationIssue,
    onRequestConfirmTreatment,
    planHash,
    runCounselling,
  ]);

  const handleEditPlan = useCallback(() => {
    setPlanConfirmStatus('STALE');
    setConfirmedPlanHash(null);
    setCounsellingReviewed(false);
    setCounsellingPlan((prev) =>
      prev?.sections.length ? { ...prev, status: 'OUTDATED' } : lockedPlan(consultation.id),
    );
    onEditProposedAdaptation();
  }, [consultation.id, onEditProposedAdaptation]);

  useImperativeHandle(
    ref,
    () => ({
      confirmTreatment: handleConfirm,
      handleBlockedConfirm,
      handleEditPlan,
    }),
    [handleBlockedConfirm, handleConfirm, handleEditPlan],
  );

  useEffect(() => {
    if (!onConfirmFooterChange) return;
    onConfirmFooterChange({
      confirmState,
      confirmStatus: planConfirmStatus,
      disabledReason,
      confirmedAt,
    });
  }, [
    confirmState,
    confirmedAt,
    disabledReason,
    onConfirmFooterChange,
    planConfirmStatus,
  ]);

  const updateCounsellingItem = useCallback(
    (sectionKey: CounsellingSectionKey, itemId: string, text: string) => {
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
                    if (sectionKey === 'MEDICATION_USE' && headline) {
                      return {
                        ...i,
                        text: compact,
                        detail: compact,
                        pharmacist_modified: true,
                      };
                    }
                    return {
                      ...i,
                      text: compact,
                      detail: compact,
                      headline: undefined,
                      pharmacist_modified: true,
                    };
                  }),
                },
          ),
        };
      });
      setCounsellingReviewed(false);
    },
    [],
  );

  const removeCounsellingItem = useCallback(
    (sectionKey: CounsellingSectionKey, itemId: string) => {
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
    },
    [],
  );

  const addCounsellingItem = useCallback((sectionKey: CounsellingSectionKey) => {
    setCounsellingPlan((prev) => {
      if (!prev) return prev;
      const section = prev.sections.find((s) => s.section_key === sectionKey);
      if ((section?.items.length ?? 0) >= sectionItemCap(sectionKey)) {
        toast.error(`This section can have at most ${sectionItemCap(sectionKey)} points.`);
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
  }, []);

  const restoreRecommendedCounselling = useCallback(() => {
    const draftSections =
      counsellingPlan?.ai_draft ?? recommendedPlan?.ai_draft ?? recommendedPlan?.sections;
    if (!draftSections?.length) {
      void runCounselling({ force: true });
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
    };
    setCounsellingPlan(restored);
    setCounsellingReviewed(false);
    setCounsellingEditing(false);
  }, [counsellingPlan, recommendedPlan, runCounselling]);

  /** Always render Card 1 from confirmed adapted Rx (strength + patient-facing casing). */
  const displayCounsellingPlan = useMemo(() => {
    if (!counsellingPlan?.sections?.length) return counsellingPlan;
    if (
      counsellingPlan.status === 'LOCKED' ||
      counsellingPlan.status === 'GENERATING' ||
      counsellingPlan.status === 'NOT_READY'
    ) {
      return counsellingPlan;
    }
    const howToUse = adaptHowToUseItem(proposed);
    if (!howToUse) return counsellingPlan;
    const medEdited = counsellingPlan.sections
      .find((s) => s.section_key === 'MEDICATION_USE')
      ?.items.some((i) => i.pharmacist_modified || i.pharmacist_added);
    if (medEdited) return counsellingPlan;
    return {
      ...counsellingPlan,
      sections: counsellingPlan.sections.map((section) =>
        section.section_key === 'MEDICATION_USE'
          ? { ...section, title: SECTION_DISPLAY_TITLE.MEDICATION_USE, items: [howToUse] }
          : section,
      ),
    };
  }, [counsellingPlan, proposed]);

  const counsellingContinue = canContinueFromCounselling(displayCounsellingPlan);
  const showPanelContinue =
    planConfirmStatus === 'CONFIRMED' &&
    Boolean(displayCounsellingPlan) &&
    displayCounsellingPlan?.status !== 'NOT_READY' &&
    displayCounsellingPlan?.status !== 'LOCKED' &&
    displayCounsellingPlan?.status !== 'GENERATING' &&
    displayCounsellingPlan?.status !== 'GENERATION_FAILED' &&
    displayCounsellingPlan?.status !== 'SAFETY_BLOCKED' &&
    displayCounsellingPlan?.status !== 'OUTDATED';

  const handleContinue = useCallback(async () => {
    if (!counsellingContinue.ok || !displayCounsellingPlan || !step3B?.confirmed) return;
    setContinueBusy(true);
    setCounsellingReviewed(true);
    const reviewed: CounsellingPlan = {
      ...displayCounsellingPlan,
      status: 'REVIEWED',
      reviewed_at: new Date().toISOString(),
    };
    setCounsellingPlan(reviewed);
    try {
      try {
        await generateCounsellingRef.current.mutateAsync({
          mode: 'fast',
          draft: {
            ...toLegacyCounsellingNotes(reviewed),
            source: 'adapt',
            generationMode: 'adapt_ai',
          } as unknown as Record<string, unknown>,
          selectedTreatments: selected as unknown as Record<string, unknown>[],
        });
      } catch {
        /* best effort — local reviewed plan still advances */
      }
      await onContinueToDocuments({
        step3B,
        counsellingPreview: counsellingPreviewFromPlan(reviewed),
        counsellingPlan: reviewed,
      });
    } finally {
      setContinueBusy(false);
    }
  }, [
    counsellingContinue.ok,
    displayCounsellingPlan,
    step3B,
    selected,
    onContinueToDocuments,
  ]);

  const continueButton = (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full sm:w-auto">
            <Button
              type="button"
              size="lg"
              disabled={!counsellingContinue.ok || continueBusy || continueLoading}
              onClick={() => void handleContinue()}
              className="h-11 w-full rounded-lg bg-[#0f766e] px-5 text-[15px] font-semibold text-white hover:bg-[#0c635c] disabled:cursor-not-allowed disabled:bg-[#c5d0d4] sm:w-auto"
            >
              {continueBusy || continueLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Continuing…
                </>
              ) : (
                <>
                  Continue to Documents
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="end">
          I have reviewed this counselling and follow-up draft
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  // Counselling only after treatment is confirmed (Confirm CTA lives in Proposed Adaptation footer).
  if (planConfirmStatus !== 'CONFIRMED' && planConfirmStatus !== 'STALE') {
    return null;
  }

  return (
    <div className="space-y-4">
      <CounsellingFollowUpPanel
        plan={displayCounsellingPlan}
        editing={counsellingEditing}
        reviewed={counsellingReviewed}
        emptyReasons={ADAPT_COUNSELLING_EMPTY_REASON}
        generatingLabel="Generating guidance…"
        summary={{
          condition:
            step1.indication?.indicationDisplay ||
            step1.indication?.customIndicationText ||
            step1.adaptationReason?.label ||
            undefined,
          treatments: selected.map((t) => t.displayName || t.medicationName),
        }}
        onToggleEdit={() => setCounsellingEditing((v) => !v)}
        onToggleHandout={(v) => {
          setCounsellingPlan((prev) =>
            prev ? { ...prev, include_detailed_handout: v } : prev,
          );
        }}
        onChangeItem={updateCounsellingItem}
        onRemoveItem={removeCounsellingItem}
        onAddItem={addCounsellingItem}
        onUpdatePlan={handleEditPlan}
        onRetryGenerate={() => void runCounselling({ force: true })}
        onRestoreRecommended={restoreRecommendedCounselling}
        continueAction={showPanelContinue ? continueButton : undefined}
      />
    </div>
  );
});
