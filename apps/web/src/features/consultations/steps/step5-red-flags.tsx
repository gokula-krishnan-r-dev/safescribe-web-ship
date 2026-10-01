'use client';
import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Scale,
  ArrowLeft,
  Pencil,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '../clinical-ui';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from '@/lib/notify';
import { toastError, getErrorMessage, getErrorCode } from '@/lib/errors';
import type {
  Consultation,
  RedFlagAcknowledgment,
  RedFlagOverrideDetail,
  RedFlagScreenAnswer,
  RedFlagsResult,
} from '../types';
import { CLINICAL_JUDGMENT_REASONS } from '../types';
import {
  useSaveStep,
  useSaveReferralOutcome,
  useCreateReferralLetter,
  useDraftReferralReason,
  useUpdateReferralLetterDraft,
  useApproveReferralLetter,
  useCompleteConsultation,
  useSendConsultationFax,
} from '../hooks';
import { normalizePathwayRedFlags } from '../safe-data';
import {
  deriveAgeGateAnswers,
  formatAgeDerivedHint,
} from '../age-derived-screening';
import { ReferralAlertCard } from '../referral/referral-alert-card';
import { PathwayClinicalJudgementStatusChip } from '../pathway-clinical-judgement-card';
import {
  ReferralOutcomeCard,
  type ReferralOutcomeFormValues,
} from '../referral/referral-outcome-card';
import { ReferralLetterPreviewDialog } from '../referral/referral-letter-preview-dialog';
import { CompleteConsultationModal } from '../documents/complete-consultation-modal';
import { blobToBase64, generateReferralLetterPdf } from '../referral/referral-letter-pdf';
import { isLegacyReferralLetterDump } from '../referral/referral-letter-html';
import { useAuthStore } from '@/features/auth/auth-store';
import { purgeConsultationLocalState } from '../purge-consultation-local-state';
import type { ReferralLetterUiStatus } from '../referral/referral-footer-actions';
import {
  buildReferralSourceFingerprint,
  canCompleteReferralWithLetter,
  draftReferralReason,
  emptyClinicalDetails,
  formatReferralLetterDate,
  handlingMethodFromStorage,
  handlingRecordIsComplete,
  isGenericComplaintOnlyDraft,
  mayApplyReasonCandidate,
  pickHighestUrgency,
  recipientLineForLetter,
  referralAllergiesFromDemographics,
  referralHandlingLabel,
  referralHistoryFromDemographics,
  referralMedicationsFromDemographics,
  REFERRAL_DESTINATION_LABELS,
  severityToUrgencyCode,
  subjectLineForLetter,
  validateReferralOutcomeInput,
  type ManualReferralHandlingMethod,
  type ReferralDestination,
  type ReferralHandlingMethod,
  type ReferralLetterDocument,
  type ReferralReasonDraftOrigin,
  type ReferralUrgencyCode,
} from '@safescript/shared';
import { RED_FLAG_ACTIONS } from '@/features/pathways/pathway-constants';
import { pathwayDisplayLabel, readClinicalAssessment } from '@safescript/shared';
import { ClinicalReviewScreen } from '../clinical-review/clinical-review-screen';
import { CLINICAL_REVIEW_COPY } from '../clinical-review/clinical-review-copy';
import {
  canContinueToTreatment,
  mapPathwayDifferentials,
  mapRedFlagItems,
  mapSafetyOutcome,
  parseDifferentialReview,
  redFlagLabel,
  reviewedFromLegacyQuestion,
  safetyScreenComplete,
  unresolvedSafetyIds,
  type DifferentialReviewState,
  type RedFlagViewItem,
} from '../clinical-review/clinical-review-model';
import {
  fallbackPathwayEvidence,
  parsePathwayEvidence,
} from '../presentation-review/presentation-review-evidence';

/** Pathway actions are stored as codes (e.g. IMMEDIATE_REFERRAL). Never show those raw. */
function redFlagActionProse(action?: string | null): string | undefined {
  const t = action?.trim();
  if (!t) return undefined;
  if (RED_FLAG_ACTIONS.some((a) => a.value === t) || /^[A-Z][A-Z0-9_]+$/.test(t)) {
    return undefined;
  }
  return t;
}

function mapLetterStatusFromDb(
  status: string | null | undefined,
  hasDraft?: boolean,
): ReferralLetterUiStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'draft';
    case 'APPROVED':
      return 'approved';
    case 'STALE':
      return 'stale';
    case 'FINALIZED':
      return 'finalized';
    case 'VOID':
      return 'void';
    case 'NOT_CREATED':
    default:
      return hasDraft ? 'draft' : 'not_created';
  }
}

type ReferralViewState =
  | 'alert_only'
  | 'documenting_referral'
  | 'documenting_override'
  | 'saving'
  | 'completed';

interface Props {
  consultation: Consultation;
  onNext: () => void;
  onBack: () => void;
  backLabel?: string;
  /** Rendered between page title and content (title → stepper → card). */
  stepper?: ReactNode;
  /** Workspace list path used after referral completion. */
  backHref?: string;
  onViewClinicalJudgement?: () => void;
  /** Return to pathway selection without deleting patient information. */
  onChooseDifferentPathway?: () => void;
}

interface ScreeningItem {
  id: string;
  question: string;
  description?: string;
  recommendedAction: string;
  severity: string;
  source: 'pathway';
}

type ItemResolution =
  | { kind: 'clear' }
  | { kind: 'refer' }
  | { kind: 'override'; detail: RedFlagOverrideDetail };

const emptyOverride = (): RedFlagOverrideDetail => ({
  reason: '',
  comments: '',
  acknowledgedResponsibility: false,
});

function toQuestion(title: string | null | undefined): string {
  return redFlagLabel(title);
}

/** Pathway-authored checklist only — never invent AI red flags. */
function buildScreeningItems(rawFlags: unknown): ScreeningItem[] {
  return normalizePathwayRedFlags(rawFlags).map((f) => ({
    id: `pathway:${f.id}`,
    question: f.question?.trim() || toQuestion(f.title),
    description: f.whyItMatters ?? f.description ?? undefined,
    recommendedAction: f.action?.trim() || 'Refer the patient for medical assessment.',
    severity: f.severity,
    source: 'pathway' as const,
  }));
}

type ScreeningEntryMethod =
  | 'NO_TO_ALL'
  | 'INDIVIDUAL_SELECTION'
  | 'AUTO_FROM_AGE'
  | 'CONFIRM_NONE_PRESENT';

function restoreState(acks?: RedFlagAcknowledgment[]) {
  const answers: Record<string, RedFlagScreenAnswer> = {};
  const resolutions: Record<string, ItemResolution> = {};
  const entryMethods: Record<string, ScreeningEntryMethod> = {};
  acks?.forEach((ack, i) => {
    const id = ack.flagId ?? `legacy:${i}`;
    if (ack.answer) answers[id] = ack.answer;
    if (ack.entryMethod) entryMethods[id] = ack.entryMethod;
    if (ack.action === 'clear' || ack.action === 'ignore' || ack.answer === 'no') {
      resolutions[id] = { kind: 'clear' };
      answers[id] = answers[id] ?? 'no';
    } else if (ack.action === 'refer') {
      resolutions[id] = { kind: 'refer' };
      answers[id] = 'yes';
    } else if (ack.action === 'override' && ack.override) {
      resolutions[id] = { kind: 'override', detail: ack.override };
      answers[id] = 'yes';
    } else if (ack.action === 'review') {
      answers[id] = answers[id] ?? 'yes';
    }
  });
  return { answers, resolutions, entryMethods };
}

/**
 * Fill / refresh age-gated screening answers from Assessment demographics.
 * Never overwrites pharmacist INDIVIDUAL_SELECTION or NO_TO_ALL answers
 * unless `force` (e.g. after Reset).
 */
function mergeAgeDerivedAnswers(opts: {
  items: ScreeningItem[];
  answers: Record<string, RedFlagScreenAnswer>;
  resolutions: Record<string, ItemResolution>;
  entryMethods: Record<string, ScreeningEntryMethod>;
  age?: string | number | null;
  ageUnit?: string | null;
  force?: boolean;
}): {
  answers: Record<string, RedFlagScreenAnswer>;
  resolutions: Record<string, ItemResolution>;
  entryMethods: Record<string, ScreeningEntryMethod>;
  changed: boolean;
} {
  const derived = deriveAgeGateAnswers(opts.items, opts.age, opts.ageUnit);
  if (!derived.length) {
    return {
      answers: opts.answers,
      resolutions: opts.resolutions,
      entryMethods: opts.entryMethods,
      changed: false,
    };
  }

  const nextAnswers = { ...opts.answers };
  const nextResolutions = { ...opts.resolutions };
  const nextMethods = { ...opts.entryMethods };
  let changed = false;

  for (const d of derived) {
    const method = nextMethods[d.id];
    const canApply =
      opts.force ||
      !nextAnswers[d.id] ||
      method === 'AUTO_FROM_AGE';
    if (!canApply) continue;
    if (nextAnswers[d.id] === d.answer && method === 'AUTO_FROM_AGE') continue;

    nextAnswers[d.id] = d.answer;
    nextMethods[d.id] = 'AUTO_FROM_AGE';
    if (d.answer === 'no') {
      nextResolutions[d.id] = { kind: 'clear' };
    } else {
      // Triggered — pharmacist must refer or document judgment
      const r = nextResolutions[d.id];
      if (!r || r.kind === 'clear') delete nextResolutions[d.id];
    }
    changed = true;
  }

  return {
    answers: nextAnswers,
    resolutions: nextResolutions,
    entryMethods: nextMethods,
    changed,
  };
}

function seedScreeningFromConsultation(consultation: Consultation) {
  const restored = restoreState(consultation.redFlags?.acknowledgments);
  const items = buildScreeningItems(
    normalizePathwayRedFlags(consultation.pathway?.redFlags),
  );
  const merged = mergeAgeDerivedAnswers({
    items,
    answers: consultation.redFlags?.screeningAnswers ?? restored.answers,
    resolutions: restored.resolutions,
    entryMethods: restored.entryMethods,
    age: consultation.demographics?.age,
    ageUnit: consultation.demographics?.ageUnit,
  });
  return { items, ...merged };
}

/** 3-column override panel matching Clinical Safety Review design */
function OverridePanel({
  recommendedAction,
  draft,
  otherText,
  onOtherTextChange,
  onChange,
  onCancel,
  onSave,
  onRefer,
}: {
  recommendedAction: string;
  draft: RedFlagOverrideDetail;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  onChange: (next: RedFlagOverrideDetail) => void;
  onCancel: () => void;
  onSave: () => void;
  onRefer: () => void;
}) {
  const isOther = draft.reason === 'Other';
  const effectiveReason = isOther ? otherText.trim() : draft.reason.trim();
  const canSave =
    Boolean(effectiveReason) &&
    Boolean(draft.comments.trim()) &&
    draft.acknowledgedResponsibility;
  const actionProse = redFlagActionProse(recommendedAction);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/[0.03] dark:bg-destructive/10">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.95fr)]">
        {/* Left — referral alert */}
        <div className="border-b border-destructive/20 p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/15">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">Referral Recommended</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/75">
                This response meets a referral criterion for the selected clinical pathway.
              </p>
              {actionProse ? (
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-foreground/80">
                  <span className="font-semibold text-foreground">Recommended action</span>
                  {' — '}
                  {actionProse}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefer}
                className="mt-3 h-8 border-destructive/30 text-xs font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                Refer Patient Instead
              </Button>
            </div>
          </div>
        </div>

        {/* Middle — clinical judgment */}
        <div className="border-b border-destructive/20 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center gap-2">
            <Scale className="h-4 w-4 text-foreground/70" />
            <p className="text-sm font-semibold text-foreground">Clinical Judgment Override</p>
          </div>
          <p className="mb-3 text-[12px] font-medium text-muted-foreground">
            Reason for proceeding despite referral recommendation
          </p>
          <fieldset className="space-y-2">
            {CLINICAL_JUDGMENT_REASONS.map((reason) => {
              const selected = draft.reason === reason;
              return (
                <div key={reason}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 transition-colors',
                      selected && 'text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        selected ? 'border-primary' : 'border-muted-foreground/35',
                      )}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <input
                      type="radio"
                      name="override-reason"
                      className="sr-only"
                      checked={selected}
                      onChange={() => onChange({ ...draft, reason })}
                    />
                    <span className="text-[13px] leading-snug text-foreground/90">{reason}</span>
                  </label>
                  {reason === 'Other' && selected && (
                    <Input
                      value={otherText}
                      onChange={(e) => onOtherTextChange(e.target.value)}
                      placeholder="Please specify."
                      className="ml-6 mt-1.5 h-9 rounded-lg border-border/80 text-sm shadow-none"
                    />
                  )}
                </div>
              );
            })}
          </fieldset>

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-destructive/15 pt-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={draft.acknowledgedResponsibility}
              onChange={(e) =>
                onChange({ ...draft, acknowledgedResponsibility: e.target.checked })
              }
            />
            <span className="text-[12.5px] leading-snug text-foreground/85">
              I acknowledge that I am proceeding against the pathway recommendation and accept
              clinical responsibility.
            </span>
          </label>
        </div>

        {/* Right — comments + actions */}
        <div className="flex flex-col p-4">
          <label className="mb-1.5 block text-[13px] font-semibold text-foreground">
            Comments <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={draft.comments}
            onChange={(e) => onChange({ ...draft, comments: e.target.value })}
            placeholder="Document clinical rationale for the audit trail…"
            rows={5}
            className="min-h-[120px] flex-1 resize-none rounded-xl border-border/80 bg-background text-sm shadow-none"
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="h-9 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave}
              onClick={onSave}
              className="h-9 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Save &amp; Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Step5RedFlags({
  consultation,
  onNext,
  onBack,
  backLabel: _backLabel = 'Back',
  stepper,
  backHref = '/pharmacist/consultations',
  onViewClinicalJudgement,
  onChooseDifferentPathway,
}: Props) {
  const router = useRouter();
  const saveStep = useSaveStep(consultation.id);
  const saveReferral = useSaveReferralOutcome(consultation.id);
  const createLetter = useCreateReferralLetter(consultation.id);
  const draftReferralReasonAi = useDraftReferralReason(consultation.id);
  const updateLetterDraft = useUpdateReferralLetterDraft(consultation.id);
  const approveLetter = useApproveReferralLetter(consultation.id);
  const completeConsultation = useCompleteConsultation(consultation.id);
  const sendFax = useSendConsultationFax(consultation.id);
  const authUser = useAuthStore((s) => s.user);
  const faxStorageScope = useMemo(
    () => ({
      tenantId: consultation.tenantId ?? authUser?.tenantId ?? null,
      userId: authUser?.id ?? consultation.pharmacistId ?? null,
      consultationId: consultation.id,
    }),
    [
      consultation.tenantId,
      consultation.pharmacistId,
      consultation.id,
      authUser?.tenantId,
      authUser?.id,
    ],
  );
  const clientRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const letterRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `letter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const approveRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `approve-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const referralSectionRef = useRef<HTMLDivElement | null>(null);
  const referralProgressRef = useRef<HTMLDivElement | null>(null);

  const [sectionCollapsed, setSectionCollapsed] = useState(() => {
    const seeded = seedScreeningFromConsultation(consultation);
    if (!seeded.items.length) return false;
    const allAnswered0 = seeded.items.every((i) => Boolean(seeded.answers[i.id]));
    const allNo = seeded.items.every((i) => seeded.answers[i.id] === 'no');
    const unresolvedYes = seeded.items.some((i) => {
      if (seeded.answers[i.id] !== 'yes') return false;
      const r = seeded.resolutions[i.id];
      return !(r?.kind === 'refer' || r?.kind === 'override');
    });
    return allAnswered0 && allNo && !unresolvedYes;
  });
  const [resetOpen, setResetOpen] = useState(false);
  const [changeAnswerWarnOpen, setChangeAnswerWarnOpen] = useState(false);
  const [entryMethods, setEntryMethods] = useState<Record<string, ScreeningEntryMethod>>(
    () => seedScreeningFromConsultation(consultation).entryMethods,
  );
  const prevAllNoRef = useRef(sectionCollapsed);

  const pathwayFlags = useMemo(
    () => normalizePathwayRedFlags(consultation.pathway?.redFlags),
    [consultation.pathway?.redFlags],
  );
  const items = useMemo(() => buildScreeningItems(pathwayFlags), [pathwayFlags]);

  const restored = useMemo(
    () => restoreState(consultation.redFlags?.acknowledgments),
    [consultation.redFlags?.acknowledgments],
  );

  const [answers, setAnswers] = useState<Record<string, RedFlagScreenAnswer>>(
    () => seedScreeningFromConsultation(consultation).answers,
  );
  const [differentialReview, setDifferentialReview] = useState<DifferentialReviewState>(() => {
    const saved = parseDifferentialReview(consultation.redFlags?.differentialReview);
    if (saved.reviewed || saved.pharmacistAddedDifferentials.length) return saved;
    const legacy = reviewedFromLegacyQuestion(
      (consultation.questionResponses as Record<string, unknown> | undefined)?.__differentialReview,
    );
    return legacy ? { ...saved, reviewed: true } : saved;
  });
  const [differentialOpen, setDifferentialOpen] = useState(() => !differentialReview.reviewed);
  const [redFlagsOpen, setRedFlagsOpen] = useState(() => differentialReview.reviewed);
  const [pathwayConfirmOpen, setPathwayConfirmOpen] = useState(false);
  const [nonePresentUndo, setNonePresentUndo] = useState<{
    answers: Record<string, RedFlagScreenAnswer>;
    resolutions: Record<string, ItemResolution>;
    entryMethods: Record<string, ScreeningEntryMethod>;
  } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ItemResolution>>(
    () => seedScreeningFromConsultation(consultation).resolutions,
  );
  const [draftOverride, setDraftOverride] = useState<RedFlagOverrideDetail>(emptyOverride);
  const [otherText, setOtherText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const [whyOpen, setWhyOpen] = useState<Record<string, boolean>>({});

  const existingOutcome = consultation.referralOutcome;
  const [referralView, setReferralView] = useState<ReferralViewState>(() => {
    if (existingOutcome?.status === 'COMPLETED' || consultation.redFlags?.referralCompleted) {
      return 'completed';
    }
    if (existingOutcome?.status === 'DRAFT') return 'documenting_referral';
    const hasRefer = Object.values(restored.resolutions).some((r) => r.kind === 'refer');
    return hasRefer ? 'alert_only' : 'alert_only';
  });

  const [referralForm, setReferralForm] = useState<ReferralOutcomeFormValues>(() => {
    const saved = existingOutcome?.reasonForReferral?.trim() ?? '';
    return {
      destination: (existingOutcome?.destination as ReferralDestination) || '',
      destinationOtherText: existingOutcome?.destinationOtherText ?? '',
      reasonForReferral: saved && !isGenericComplaintOnlyDraft(saved) ? saved : '',
      additionalNote: existingOutcome?.additionalNote ?? '',
    };
  });

  const [letterOpen, setLetterOpen] = useState(false);
  const [letterDraft, setLetterDraft] = useState(existingOutcome?.referralLetterDraft ?? '');
  const [letterStatus, setLetterStatus] = useState<ReferralLetterUiStatus>(() =>
    mapLetterStatusFromDb(
      existingOutcome?.letterStatus,
      Boolean(existingOutcome?.referralLetterDraft),
    ),
  );
  const [sourceRevision, setSourceRevision] = useState(existingOutcome?.sourceRevision ?? 1);
  const [approvedSourceRevision, setApprovedSourceRevision] = useState<number | null>(
    existingOutcome?.letterApprovedSourceRevision ?? null,
  );
  const [handlingMethod, setHandlingMethod] = useState<ReferralHandlingMethod | null>(() =>
    handlingMethodFromStorage(existingOutcome?.contactMethod, {
      faxConfirmed: existingOutcome?.letterExternalSendConfirmed,
      letterApproved:
        existingOutcome?.letterStatus === 'APPROVED' ||
        existingOutcome?.letterStatus === 'FINALIZED',
    }),
  );
  const [handlingDetail, setHandlingDetail] = useState(
    existingOutcome?.contactMethodOtherText ?? '',
  );
  const [changingHandling, setChangingHandling] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const completeRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `complete-${Date.now()}`,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reasonOrigin, setReasonOrigin] = useState<ReferralReasonDraftOrigin | 'AI_EDITED' | 'NONE'>(
    () => {
      const saved = existingOutcome?.reasonForReferral?.trim() ?? '';
      if (!saved || isGenericComplaintOnlyDraft(saved)) return 'NONE';
      return 'MANUAL';
    },
  );
  const [reasonDraftFailed, setReasonDraftFailed] = useState(false);
  const [assessmentChanged, setAssessmentChanged] = useState(false);
  const [reasonDraftRetry, setReasonDraftRetry] = useState(0);
  const [appliedDraftReason, setAppliedDraftReason] = useState('');
  const reasonPristineRef = useRef(
    !existingOutcome?.reasonForReferral?.trim() ||
      isGenericComplaintOnlyDraft(existingOutcome.reasonForReferral),
  );
  const localEditVersionRef = useRef(0);
  const activeRequestIdRef = useRef('');
  const lastAppliedDraftRef = useRef('');
  const lastRequestedKeyRef = useRef('');
  const documentWorkflowStartedRef = useRef(false);
  const skipInitialTriggerNoticeRef = useRef(true);

  const patientAge = consultation.demographics?.age;
  const patientAgeUnit = consultation.demographics?.ageUnit;

  const ageDerivedFills = useMemo(
    () => deriveAgeGateAnswers(items, patientAge, patientAgeUnit),
    [items, patientAge, patientAgeUnit],
  );
  const ageDerivedById = useMemo(() => {
    const map = new Map<string, (typeof ageDerivedFills)[number]>();
    for (const d of ageDerivedFills) map.set(d.id, d);
    return map;
  }, [ageDerivedFills]);

  const screeningStateRef = useRef({ answers, resolutions, entryMethods });
  screeningStateRef.current = { answers, resolutions, entryMethods };
  const differentialReviewRef = useRef(differentialReview);
  differentialReviewRef.current = differentialReview;

  // Keep AUTO_FROM_AGE answers in sync when Assessment age changes; fill unanswered gates.
  useEffect(() => {
    if (!items.length) return;
    const current = screeningStateRef.current;
    const merged = mergeAgeDerivedAnswers({
      items,
      answers: current.answers,
      resolutions: current.resolutions,
      entryMethods: current.entryMethods,
      age: patientAge,
      ageUnit: patientAgeUnit,
    });
    if (!merged.changed) return;
    setAnswers(merged.answers);
    setResolutions(merged.resolutions);
    setEntryMethods(merged.entryMethods);
    const complete =
      items.every((i) => Boolean(merged.answers[i.id])) &&
      items.every((i) => merged.answers[i.id] === 'no');
    if (complete) {
      setSectionCollapsed(true);
      prevAllNoRef.current = true;
    } else if (items.some((i) => merged.answers[i.id] === 'yes')) {
      setSectionCollapsed(false);
      prevAllNoRef.current = false;
    }
  }, [items, patientAge, patientAgeUnit]);

  const reviewFlags = useMemo(() => {
    const mapped = mapRedFlagItems(consultation.pathway?.redFlags);
    const byId = new Map(mapped.map((flag) => [flag.id, flag]));
    return items.map((item) => {
      const rawId = item.id.replace(/^pathway:/, '');
      const mappedFlag = byId.get(rawId) ?? byId.get(item.id);
      const outcome =
        mappedFlag?.outcome ??
        mapSafetyOutcome({
          action: item.recommendedAction,
          severity: item.severity,
          description: item.description,
        });
      const flag: RedFlagViewItem & { ageHint?: string } = {
        id: item.id,
        label: redFlagLabel(item.question),
        whyText: mappedFlag?.whyText ?? item.description,
        required: mappedFlag?.required ?? true,
        evidenceRefIds: mappedFlag?.evidenceRefIds ?? [],
        outcome,
        actionCode: mappedFlag?.actionCode ?? item.recommendedAction,
        ageHint:
          entryMethods[item.id] === 'AUTO_FROM_AGE' && ageDerivedById.has(item.id)
            ? formatAgeDerivedHint(ageDerivedById.get(item.id)!.ageYears, patientAgeUnit)
            : undefined,
      };
      return flag;
    });
  }, [
    consultation.pathway?.redFlags,
    items,
    entryMethods,
    ageDerivedById,
    patientAgeUnit,
  ]);

  const pathwayEvidence = useMemo(() => {
    const stored = readClinicalAssessment(consultation.aiAnalysis);
    const parsed = parsePathwayEvidence(stored?.evidenceSnapshot);
    if (parsed) return parsed;
    const pathway = consultation.pathway;
    if (!pathway) return null;
    return fallbackPathwayEvidence({
      pathwayId: pathway.id,
      displayName: pathwayDisplayLabel(pathway),
      pathwayVersion: pathway.version != null ? `v${pathway.version}` : null,
    });
  }, [consultation.aiAnalysis, consultation.pathway]);

  const triggeredIds = items.filter((i) => answers[i.id] === 'yes').map((i) => i.id);
  const resolvedSafetyIds = new Set(
    Object.entries(resolutions)
      .filter(([, resolution]) => resolution?.kind === 'refer' || resolution?.kind === 'override')
      .map(([id]) => id),
  );
  const needsAction = unresolvedSafetyIds({
    flags: reviewFlags,
    answers,
    resolvedIds: resolvedSafetyIds,
  });

  const overrideCount = Object.values(resolutions).filter((r) => r.kind === 'override').length;
  const referCount = Object.values(resolutions).filter((r) => r.kind === 'refer').length;
  const allAnswered = items.length === 0 || safetyScreenComplete(reviewFlags, answers);
  const allResolved = needsAction.length === 0;
  const unansweredItems = items.filter((i) => !answers[i.id]);
  const unansweredCount = unansweredItems.length;
  const firstUnansweredId = unansweredItems[0]?.id ?? null;
  const firstUnresolvedId = needsAction[0] ?? null;
  const allNoSelected =
    items.length === 0 || items.every((i) => answers[i.id] === 'no');
  const continueReady = canContinueToTreatment({
    differentialReviewed: differentialReview.reviewed,
    safetyComplete: allAnswered && allNoSelected,
    unresolvedSafetyIds: needsAction,
  });
  /** Prescribe path — only when every red flag is explicitly No (none present). */
  const canContinue = continueReady && referCount === 0 && allNoSelected;
  /** Referral documentation unlocks once every question is answered and resolved. */
  const showReferralPathway =
    referCount > 0 &&
    allAnswered &&
    allResolved &&
    referralView !== 'completed';
  /** Referral chosen but checklist still incomplete — user must finish screening first. */
  const referralPendingScreening =
    referCount > 0 && !showReferralPathway && referralView !== 'completed';

  const referralTriggers = useMemo(() => {
    return items
      .filter((i) => resolutions[i.id]?.kind === 'refer')
      .map((i) => {
        const urgencyCode = severityToUrgencyCode(i.severity) as ReferralUrgencyCode;
        const title =
          pathwayFlags.find((f) => `pathway:${f.id}` === i.id)?.title ??
          i.question.replace(/^Is the following present:\s*/i, '').replace(/\?$/, '');
        return { id: i.id, label: title, urgencyCode };
      });
  }, [items, resolutions, pathwayFlags]);

  const urgencyMeta = useMemo(
    () => pickHighestUrgency(referralTriggers.map((t) => t.urgencyCode)),
    [referralTriggers],
  );

  const reasonTriggerKey = referralTriggers.map((t) => t.id).join('|');
  const reasonDraftSourceKey = `${reasonTriggerKey}::${referralForm.destination}::${referralForm.destinationOtherText}::${urgencyMeta.code}`;

  const localTemplateReason = useMemo(
    () =>
      draftReferralReason({
        presentingConcern: consultation.chiefComplaint,
        pathwayCondition: consultation.pathway?.condition ?? consultation.pathway?.name,
        destination: referralForm.destination || null,
        destinationOtherText: referralForm.destinationOtherText,
        urgencyCode: urgencyMeta.code,
        triggers: referralTriggers,
      }),
    [
      consultation.chiefComplaint,
      consultation.pathway?.condition,
      consultation.pathway?.name,
      referralForm.destination,
      referralForm.destinationOtherText,
      urgencyMeta.code,
      referralTriggers,
    ],
  );

  const letterFallbackSeed = useMemo((): ReferralLetterDocument => {
    const demo = (consultation.demographics ?? {}) as Record<string, unknown>;
    const fullName =
      [demo.firstName, demo.lastName].filter(Boolean).join(' ').trim() ||
      String(demo.fullName ?? demo.patientName ?? '');
    const dobRaw = String(demo.dateOfBirth ?? demo.dob ?? '').trim();
    const dobIso = /^\d{4}-\d{2}-\d{2}/.test(dobRaw) ? dobRaw.slice(0, 10) : '';
    const pharmacistName = [consultation.pharmacist?.firstName, consultation.pharmacist?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return {
      schema: 'referral-letter-v3',
      letterDate: formatReferralLetterDate(new Date(), consultation.tenant?.timezone),
      recipientLine: recipientLineForLetter(
        (referralForm.destination || 'family_doctor_np') as ReferralDestination,
        referralForm.destinationOtherText,
      ),
      subject: subjectLineForLetter({
        urgencyCode: urgencyMeta.code,
        primaryConcern: referralTriggers[0]?.label,
      }),
      salutation: 'Dear Colleague,',
      reasonForReferral: referralForm.reasonForReferral,
      clinicalDetails: {
        ...emptyClinicalDetails(),
        presentingConcern: consultation.chiefComplaint ?? null,
        referralFinding: referralTriggers[0]?.label ?? null,
        allergies: referralAllergiesFromDemographics(demo),
        currentMedications: referralMedicationsFromDemographics(demo),
        relevantMedicalHistory: referralHistoryFromDemographics(demo),
      },
      patient: {
        fullName,
        dateOfBirth: dobIso,
        healthNumber: String(demo.phn ?? demo.healthNumber ?? '').trim(),
        healthNumberNotAvailable: demo.phnNotAvailable === true,
      },
      pharmacist: {
        displayName: pharmacistName,
        credentials: '',
        pharmacyName: consultation.tenant?.name ?? '',
        pharmacyAddress: consultation.tenant?.address ?? '',
        pharmacyPhone: consultation.tenant?.phone ?? null,
        pharmacyFax: consultation.tenant?.faxNumber ?? null,
        pharmacyLicense: null,
      },
      consultationRef: consultation.consultationRef ?? consultation.id,
    };
  }, [
    consultation,
    referralForm.destination,
    referralForm.destinationOtherText,
    referralForm.reasonForReferral,
    referralTriggers,
    urgencyMeta.code,
  ]);

  const referralFormIsValid = useMemo(
    () =>
      validateReferralOutcomeInput({
        destination: referralForm.destination || null,
        destinationOtherText: referralForm.destinationOtherText,
        reasonForReferral: referralForm.reasonForReferral,
        additionalNote: referralForm.additionalNote,
      }).length === 0,
    [referralForm],
  );

  const handlingRecorded = handlingRecordIsComplete(handlingMethod, handlingDetail);
  const canCompleteReferral = canCompleteReferralWithLetter({
    referralFormIsValid,
    referralOutcomeStatus: existingOutcome?.status ?? 'DRAFT',
    letterStatus,
    letterSourceRevision: approvedSourceRevision,
    referralSourceRevision: sourceRevision,
    consultationCompleted: consultation.status === 'COMPLETED',
    isSaving:
      referralView === 'saving' ||
      saveReferral.isPending ||
      createLetter.isPending ||
      approveLetter.isPending ||
      completeConsultation.isPending,
    handlingRecorded,
  });
  const destinationLabel = referralForm.destination
    ? referralForm.destination === 'other'
      ? referralForm.destinationOtherText.trim() || 'Other'
      : REFERRAL_DESTINATION_LABELS[referralForm.destination]
    : '';

  const scrollIntoViewSmooth = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    const pane = document.querySelector<HTMLElement>('[data-consult-scroll]');
    if (pane) {
      const paneRect = pane.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const nextTop = pane.scrollTop + (elRect.top - paneRect.top) - 24;
      pane.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  useEffect(() => {
    if (referCount > 0 && referralView === 'documenting_override') return;
    if (referCount > 0 && referralView !== 'documenting_referral' && referralView !== 'saving' && referralView !== 'completed') {
      setReferralView('alert_only');
    }
    if (referCount === 0 && (referralView === 'alert_only' || referralView === 'documenting_referral')) {
      setReferralView('alert_only');
    }
  }, [referCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Scroll to referral panel the first time it unlocks after a complete screen. */
  const prevShowReferralPathway = useRef(false);
  useEffect(() => {
    if (showReferralPathway && !prevShowReferralPathway.current) {
      const timer = window.setTimeout(() => {
        scrollIntoViewSmooth(referralSectionRef.current ?? outcomeHeadingRef.current);
      }, 80);
      prevShowReferralPathway.current = true;
      return () => window.clearTimeout(timer);
    }
    if (!showReferralPathway) prevShowReferralPathway.current = false;
  }, [showReferralPathway]);

  const setAnswer = (
    id: string,
    answer: RedFlagScreenAnswer,
    method: ScreeningEntryMethod = 'INDIVIDUAL_SELECTION',
  ) => {
    const nextAnswers = { ...answers, [id]: answer };
    const previous = answers[id];
    setAnswers(nextAnswers);
    setEntryMethods((prev) => ({ ...prev, [id]: method }));
    setNonePresentUndo(null);
    setResolutions((prev) => {
      const next = { ...prev };
      if (answer === 'no') {
        next[id] = { kind: 'clear' };
      } else {
        delete next[id];
      }
      return next;
    });
    if (answer === 'yes') {
      setEditingId(null);
      setDraftOverride(emptyOverride());
      setOtherText('');
      setSectionCollapsed(false);
      prevAllNoRef.current = false;
      setDifferentialReview((prev) => ({
        ...prev,
        auditEvents: [
          ...prev.auditEvents,
          {
            action: previous ? 'red_flag_answer_changed' : 'red_flag_answered',
            at: new Date().toISOString(),
            subjectId: id,
          },
          { action: 'red_flag_rule_triggered', at: new Date().toISOString(), subjectId: id },
        ].slice(-40),
      }));
    } else {
      if (editingId === id) setEditingId(null);
      setDifferentialReview((prev) => ({
        ...prev,
        auditEvents: [
          ...prev.auditEvents,
          {
            action: previous ? 'red_flag_answer_changed' : 'red_flag_answered',
            at: new Date().toISOString(),
            subjectId: id,
          },
        ].slice(-40),
      }));
    }
  };

  /** User-set Nos (bulk or individual) — excludes age-derived so Clear is a real undo. */
  const canClearBulkNo = items.some(
    (i) => answers[i.id] === 'no' && entryMethods[i.id] !== 'AUTO_FROM_AGE',
  );
  const showClearBulkNo = allNoSelected && canClearBulkNo;

  const answeredCount = items.filter((i) => Boolean(answers[i.id])).length;

  /** No to all — only fills unanswered; never overwrites an existing Yes.
   * Age-gated items still derive from Assessment age (never force a false No). */
  const focusNextScreeningAction = (preferId?: string | null) => {
    requestAnimationFrame(() => {
      const targetId = preferId ?? firstUnresolvedId ?? firstUnansweredId;
      if (targetId && questionRefs.current[targetId]) {
        scrollIntoViewSmooth(questionRefs.current[targetId]);
        return;
      }
      if (referralProgressRef.current) {
        scrollIntoViewSmooth(referralProgressRef.current);
      }
    });
  };

  const focusReferralSection = () => {
    requestAnimationFrame(() => {
      scrollIntoViewSmooth(referralSectionRef.current ?? outcomeHeadingRef.current);
    });
  };

  /** Fill unanswered items as No (never overwrites Yes / existing answers). */
  const applyNoToUnanswered = (opts?: { toastOnComplete?: boolean }) => {
    if (!items.length) return { filled: 0, nextAnswers: answers, nextResolutions: resolutions };

    const derivedById = new Map(
      deriveAgeGateAnswers(items, patientAge, patientAgeUnit).map((d) => [d.id, d]),
    );

    const nextAnswers = { ...answers };
    const nextMethods = { ...entryMethods };
    const nextResolutions = { ...resolutions };
    let filled = 0;

    for (const item of items) {
      if (nextAnswers[item.id]) continue;
      filled += 1;
      const derived = derivedById.get(item.id);
      if (derived) {
        nextAnswers[item.id] = derived.answer;
        nextMethods[item.id] = 'AUTO_FROM_AGE';
        if (derived.answer === 'no') {
          nextResolutions[item.id] = { kind: 'clear' };
        } else {
          delete nextResolutions[item.id];
        }
      } else {
        nextAnswers[item.id] = 'no';
        nextMethods[item.id] = 'NO_TO_ALL';
        nextResolutions[item.id] = { kind: 'clear' };
      }
    }

    setAnswers(nextAnswers);
    setResolutions(nextResolutions);
    setEntryMethods(nextMethods);
    setEditingId(null);
    setDraftOverride(emptyOverride());
    setOtherText('');

    const complete =
      items.every((i) => Boolean(nextAnswers[i.id])) &&
      items.every((i) => nextAnswers[i.id] === 'no');
    if (complete) {
      setSectionCollapsed(true);
      prevAllNoRef.current = true;
    } else {
      setSectionCollapsed(false);
      prevAllNoRef.current = false;
    }

    if (opts?.toastOnComplete && filled > 0) {
      toast.message(
        filled === 1
          ? '1 remaining question marked No'
          : `${filled} remaining questions marked No`,
      );
    }

    return { filled, nextAnswers, nextResolutions };
  };

  /** Toggle: fill unanswered as No, or clear when every item is already No. */
  const toggleBulkNo = () => {
    if (!items.length) return;
    if (showClearBulkNo) {
      clearAllAnswers();
      toast.message('Cleared safety screening answers');
      return;
    }
    const unanswered = items.filter((i) => !answers[i.id]);
    if (!unanswered.length) return;
    applyNoToUnanswered();
  };

  /** After a referral is chosen, finish unanswered items as No and open referral docs. */
  const markRemainingNoAndDocumentReferral = () => {
    const { nextAnswers, nextResolutions } = applyNoToUnanswered({ toastOnComplete: true });
    const stillNeedsAction = items.some((i) => {
      if (nextAnswers[i.id] !== 'yes') return false;
      const r = nextResolutions[i.id];
      return !r || r.kind === 'clear';
    });
    if (stillNeedsAction) {
      toast.error('Resolve each Yes answer — refer or document clinical judgment');
      const id = items.find((i) => {
        if (nextAnswers[i.id] !== 'yes') return false;
        const r = nextResolutions[i.id];
        return !r || r.kind === 'clear';
      })?.id;
      focusNextScreeningAction(id);
      return;
    }
    setReferralView('alert_only');
    focusReferralSection();
  };

  const selectReferForItem = (itemId: string) => {
    setResolutions((prev) => ({
      ...prev,
      [itemId]: { kind: 'refer' },
    }));
    setEditingId(null);
    setReferralView('alert_only');
    setSectionCollapsed(false);
    prevAllNoRef.current = false;

    // After refer: guide to remaining questions, or to referral documentation.
    requestAnimationFrame(() => {
      const remainingUnanswered = items.find((i) => i.id !== itemId && !answers[i.id]);
      const remainingUnresolved = items.find((i) => {
        if (i.id === itemId) return false;
        if (answers[i.id] !== 'yes') return false;
        const r = resolutions[i.id];
        return !r || r.kind === 'clear';
      });
      if (remainingUnresolved || remainingUnanswered) {
        focusNextScreeningAction(remainingUnresolved?.id ?? remainingUnanswered?.id);
        return;
      }
      focusReferralSection();
    });
  };

  const clearAllAnswers = () => {
    if (!items.length) return;
    const merged = mergeAgeDerivedAnswers({
      items,
      answers: {},
      resolutions: {},
      entryMethods: {},
      age: patientAge,
      ageUnit: patientAgeUnit,
      force: true,
    });
    setAnswers(merged.answers);
    setResolutions(merged.resolutions);
    setEntryMethods(merged.entryMethods);
    setEditingId(null);
    setDraftOverride(emptyOverride());
    setOtherText('');
    const complete =
      items.every((i) => Boolean(merged.answers[i.id])) &&
      items.every((i) => merged.answers[i.id] === 'no');
    if (complete) {
      setSectionCollapsed(true);
      prevAllNoRef.current = true;
    } else {
      setSectionCollapsed(false);
      prevAllNoRef.current = false;
    }
  };

  const buildPayload = (): RedFlagsResult => {
    const acknowledgments: RedFlagAcknowledgment[] = items.map((item, index) => {
      const answer = answers[item.id] ?? 'no';
      const resolution = resolutions[item.id] ?? { kind: 'clear' as const };
      let action: RedFlagAcknowledgment['action'] = 'clear';
      let override: RedFlagOverrideDetail | undefined;
      if (answer === 'yes' && resolution.kind === 'refer') action = 'refer';
      else if (answer === 'yes' && resolution.kind === 'override') {
        action = 'override';
        override = resolution.detail;
      } else action = 'clear';

      return {
        flagIndex: index,
        flagId: item.id,
        flag: item.question,
        answer,
        action,
        override,
        acknowledgedAt: new Date().toISOString(),
        entryMethod: entryMethods[item.id],
      };
    });

    const anyYes = acknowledgments.some((a) => a.answer === 'yes');
    return {
      hasRedFlags: anyYes,
      overallRisk:
        referCount > 0 ? 'high' : overrideCount > 0 ? 'medium' : anyYes ? 'medium' : 'low',
      redFlags: pathwayFlags.map((f) => ({
        flag: f.title,
        severity: f.severity as 'WARNING' | 'HIGH' | 'CRITICAL' | 'EMERGENCY',
        description: f.description ?? '',
        reasoning: f.description ?? 'Pathway-configured safety criterion.',
        recommendedAction: f.action?.trim() || 'Refer the patient for medical assessment.',
        requiresImmediateAction: f.severity === 'CRITICAL' || f.severity === 'EMERGENCY',
      })),
      summary:
        items.length === 0
          ? 'This pathway has no red-flag checklist configured.'
          : overrideCount > 0
            ? `${overrideCount} pathway recommendation${overrideCount === 1 ? '' : 's'} overridden with clinical judgment.`
            : referCount > 0
              ? 'Referral selected for one or more safety criteria.'
              : 'Pathway safety screening completed. No referral criteria triggered.',
      screeningAnswers: answers,
      acknowledgments,
      allAcknowledged: true,
      referralSelected: referCount > 0,
      source: 'pathway',
      differentialReview: differentialReviewRef.current,
    };
  };

  useEffect(() => {
    documentWorkflowStartedRef.current =
      createLetter.isPending ||
      letterStatus === 'generating' ||
      ((letterStatus === 'draft' || letterStatus === 'approved' || letterStatus === 'finalized') &&
        Boolean(letterDraft.trim()));
  }, [createLetter.isPending, letterStatus, letterDraft]);

  useEffect(() => {
    if (skipInitialTriggerNoticeRef.current) {
      skipInitialTriggerNoticeRef.current = false;
      return;
    }
    if (!reasonPristineRef.current) {
      setAssessmentChanged(true);
    }
  }, [reasonDraftSourceKey]);

  useEffect(() => {
    if (!showReferralPathway || referralTriggers.length === 0) return;
    if (documentWorkflowStartedRef.current) {
      activeRequestIdRef.current = '';
      return;
    }
    if (!reasonPristineRef.current) return;
    setAssessmentChanged(false);

    const requestKey = `${reasonDraftSourceKey}::${reasonDraftRetry}`;
    if (lastRequestedKeyRef.current === requestKey) return;
    lastRequestedKeyRef.current = requestKey;

    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `reason-${Date.now()}`;
    activeRequestIdRef.current = requestId;
    const referralId = existingOutcome?.id ?? consultation.id;
    const start = {
      consultationId: consultation.id,
      referralId,
      sourceRevision: reasonDraftSourceKey,
      requestId,
      localEditVersion: localEditVersionRef.current,
    };

    setReasonDraftFailed(false);
    draftReferralReasonAi.mutate(
      {
        destination: referralForm.destination || undefined,
        destinationOtherText:
          referralForm.destination === 'other'
            ? referralForm.destinationOtherText
            : undefined,
        requestId,
        redFlagsData: buildPayload() as unknown as Record<string, unknown>,
      },
      {
        onSuccess: (data) => {
          const current = {
            consultationId: consultation.id,
            referralId,
            sourceRevision: reasonDraftSourceKey,
            activeRequestId: activeRequestIdRef.current,
            localEditVersion: localEditVersionRef.current,
            pristine: reasonPristineRef.current,
            finalized: consultation.status === 'COMPLETED',
            documentWorkflowStarted: documentWorkflowStartedRef.current,
          };
          if (!mayApplyReasonCandidate(start, current)) return;
          const next =
            String(data.draftReason ?? '').trim() || localTemplateReason.trim();
          if (!next) {
            setReasonDraftFailed(true);
            return;
          }
          lastAppliedDraftRef.current = next;
          setAppliedDraftReason(next);
          setReasonOrigin(
            data.origin === 'AI_DRAFT' && String(data.draftReason ?? '').trim()
              ? 'AI_DRAFT'
              : 'RULE_TEMPLATE',
          );
          setReasonDraftFailed(!String(data.draftReason ?? '').trim());
          setReferralForm((prev) =>
            prev.reasonForReferral === next ? prev : { ...prev, reasonForReferral: next },
          );
        },
        onError: () => {
          if (activeRequestIdRef.current !== requestId) return;
          if (!mayApplyReasonCandidate(start, {
            consultationId: consultation.id,
            referralId,
            sourceRevision: reasonDraftSourceKey,
            activeRequestId: activeRequestIdRef.current,
            localEditVersion: localEditVersionRef.current,
            pristine: reasonPristineRef.current,
            finalized: consultation.status === 'COMPLETED',
            documentWorkflowStarted: documentWorkflowStartedRef.current,
          })) {
            return;
          }
          setReasonDraftFailed(true);
          const fallback = localTemplateReason.trim();
          if (!fallback) return;
          lastAppliedDraftRef.current = fallback;
          setAppliedDraftReason(fallback);
          setReasonOrigin('RULE_TEMPLATE');
          setReferralForm((prev) =>
            prev.reasonForReferral === fallback
              ? prev
              : { ...prev, reasonForReferral: fallback },
          );
        },
      },
    );
  }, [
    showReferralPathway,
    reasonDraftSourceKey,
    reasonDraftRetry,
    localTemplateReason,
    consultation.id,
    consultation.status,
    existingOutcome?.id,
    referralTriggers.length,
    referralForm.destination,
    referralForm.destinationOtherText,
  ]);

  const persist = async () => {
    const payload = buildPayload();
    await saveStep.mutateAsync({
      stepIndex: 4,
      currentStep: 'RED_FLAGS',
      data: payload as unknown as Record<string, unknown>,
    });
    return payload;
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const skipAutosaveRef = useRef(true);
  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistRef.current().catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [answers, resolutions, entryMethods, differentialReview]);

  const handleNext = async () => {
    if (!differentialReview.reviewed) {
      setDifferentialOpen(true);
      toast.error(CLINICAL_REVIEW_COPY.differentialIncomplete);
      return;
    }
    if (!allAnswered) {
      setRedFlagsOpen(true);
      toast.error(CLINICAL_REVIEW_COPY.safetyIncomplete);
      if (firstUnansweredId) focusNextScreeningAction(firstUnansweredId);
      return;
    }
    if (!allNoSelected) {
      setRedFlagsOpen(true);
      toast.error(CLINICAL_REVIEW_COPY.safetyMustBeAbsent);
      const firstYesId = items.find((i) => answers[i.id] === 'yes')?.id ?? firstUnresolvedId;
      if (firstYesId) focusNextScreeningAction(firstYesId);
      return;
    }
    if (!allResolved) {
      setRedFlagsOpen(true);
      toast.error(CLINICAL_REVIEW_COPY.unresolvedSafety);
      if (firstUnresolvedId) focusNextScreeningAction(firstUnresolvedId);
      return;
    }
    if (referCount > 0) {
      toast.error('Document the referral before leaving this review.');
      focusReferralSection();
      return;
    }
    try {
      const nextReview = {
        ...differentialReviewRef.current,
        auditEvents: [
          ...differentialReviewRef.current.auditEvents,
          { action: 'treatment_options_continue_selected', at: new Date().toISOString() },
        ].slice(-40),
      };
      differentialReviewRef.current = nextReview;
      setDifferentialReview(nextReview);
      await persist();
      if (consultation.consultationMode === 'CLINICAL_JUDGMENT') {
        await saveStep.mutateAsync({
          stepIndex: 5,
          currentStep: 'PRESCRIBING_READINESS',
          data: {},
        });
      }
      onNext();
    } catch (e) {
      toastError(e, 'Could not save clinical review');
    }
  };

  const confirmNonePresent = () => {
    if (!items.length) return;
    setNonePresentUndo({ answers, resolutions, entryMethods });
    const nextAnswers = { ...answers };
    const nextResolutions = { ...resolutions };
    const nextMethods = { ...entryMethods };
    for (const item of items) {
      nextAnswers[item.id] = 'no';
      nextResolutions[item.id] = { kind: 'clear' };
      nextMethods[item.id] = 'CONFIRM_NONE_PRESENT';
    }
    setAnswers(nextAnswers);
    setResolutions(nextResolutions);
    setEntryMethods(nextMethods);
    setEditingId(null);
    setRedFlagsOpen(true);
    setDifferentialReview((prev) => ({
      ...prev,
      auditEvents: [
        ...prev.auditEvents,
        { action: 'confirm_none_present_selected', at: new Date().toISOString() },
      ].slice(-40),
    }));
  };

  const undoConfirmNone = () => {
    if (!nonePresentUndo) return;
    setAnswers(nonePresentUndo.answers);
    setResolutions(nonePresentUndo.resolutions);
    setEntryMethods(nonePresentUndo.entryMethods);
    setNonePresentUndo(null);
    setDifferentialReview((prev) => ({
      ...prev,
      auditEvents: [
        ...prev.auditEvents,
        { action: 'confirm_none_present_undone', at: new Date().toISOString() },
      ].slice(-40),
    }));
  };

  const buildReferralPayload = (completeConsultation: boolean) => {
    return {
      pathwayId: consultation.selectedPathwayId ?? consultation.pathway?.id ?? '',
      pathwayVersion: consultation.pathway?.version ?? 1,
      destination: referralForm.destination,
      destinationOtherText:
        referralForm.destination === 'other' ? referralForm.destinationOtherText : undefined,
      reasonForReferral: referralForm.reasonForReferral,
      additionalNote: referralForm.additionalNote || undefined,
      clientRequestId: clientRequestIdRef.current,
      completeConsultation,
      redFlagsData: buildPayload(),
      ...(handlingMethod && handlingMethod !== 'FAXED_FROM_SAFESCRIBE'
        ? {
            handlingMethod,
            handlingDetail: handlingMethod === 'SENT_ANOTHER_WAY' ? handlingDetail.trim() : undefined,
          }
        : {}),
    };
  };

  const handleDocumentComplete = () => {
    if (!canCompleteReferral) {
      toast.error(
        handlingRecorded
          ? 'Approve the current referral letter to continue.'
          : 'Record how the referral was handled.',
      );
      return;
    }
    setCompleteOpen(true);
  };

  const handleConfirmComplete = async () => {
    setSubmitError(null);
    setReferralView('saving');
    try {
      await persist();
      await saveReferral.mutateAsync(buildReferralPayload(true));
      await completeConsultation.mutateAsync({
        documentationConfirmed: true,
        clientRequestId: completeRequestIdRef.current,
      });
      purgeConsultationLocalState(consultation.id, {
        tenantId: faxStorageScope.tenantId,
        userId: faxStorageScope.userId,
      });
      setReferralView('completed');
    } catch (e) {
      setReferralView('documenting_referral');
      const msg = getErrorMessage(e, 'The consultation was not completed. Your information remains available; try again.');
      const code = getErrorCode(e) ?? '';
      if (code === 'LETTER_STALE' || /stale|update the letter/i.test(msg)) {
        setLetterStatus('stale');
        setCompleteOpen(false);
      }
      if (code === 'HANDLING_METHOD_MISSING') {
        setCompleteOpen(false);
      }
      setSubmitError(msg);
      throw e;
    }
  };

  const handleLetterAction = async () => {
    setSubmitError(null);
    documentWorkflowStartedRef.current = true;
    activeRequestIdRef.current = '';
    const regeneratingStale = letterStatus === 'stale';
    const regeneratingLegacyDump =
      letterStatus === 'draft' && isLegacyReferralLetterDump(letterDraft);
    // View / edit approved letter without regenerating
    if (
      (letterStatus === 'approved' || letterStatus === 'finalized') &&
      letterDraft.trim()
    ) {
      setLetterOpen(true);
      return;
    }
    // Review existing professional draft without regenerating
    if (letterStatus === 'draft' && letterDraft.trim() && !regeneratingLegacyDump) {
      setLetterOpen(true);
      return;
    }

    try {
      await persist();
      if (regeneratingStale || regeneratingLegacyDump) {
        letterRequestIdRef.current =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `letter-${Date.now()}`;
      }
      const result = await createLetter.mutateAsync({
        outcomeDraft: buildReferralPayload(false),
        clientRequestId: letterRequestIdRef.current,
      });
      setLetterDraft(result.letterDraft ?? '');
      setLetterStatus(mapLetterStatusFromDb(result.letterStatus, Boolean(result.letterDraft)));
      if (typeof result.sourceRevision === 'number') setSourceRevision(result.sourceRevision);
      setApprovedSourceRevision(result.letterApprovedSourceRevision ?? null);
      // New generation gets a fresh idempotency key for the next create
      letterRequestIdRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `letter-${Date.now()}`;
      setLetterOpen(true);
      toast.success(
        regeneratingStale || regeneratingLegacyDump
          ? 'Referral letter updated — review and approve'
          : 'Referral letter draft ready',
      );
    } catch (e) {
      documentWorkflowStartedRef.current = false;
      setLetterStatus((prev) => (prev === 'not_created' ? 'generation_failed' : prev));
      toastError(e, 'Referral letter could not be created. Try again.');
    }
  };

  const handleApproveLetter = async (draftHtml: string) => {
    setSubmitError(null);
    try {
      const result = await approveLetter.mutateAsync({
        clientRequestId: approveRequestIdRef.current,
        letterDraft: draftHtml,
        expectedSourceRevision: sourceRevision,
      });
      setLetterDraft(result.letterDraft ?? draftHtml);
      setLetterStatus('approved');
      if (typeof result.sourceRevision === 'number') setSourceRevision(result.sourceRevision);
      setApprovedSourceRevision(
        result.letterApprovedSourceRevision ?? result.sourceRevision ?? sourceRevision,
      );
      approveRequestIdRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `approve-${Date.now()}`;
      toast.success('Referral letter approved', { announce: true });
    } catch (e) {
      const msg = getErrorMessage(e, 'Could not approve letter');
      if (
        getErrorCode(e) === 'REFERRAL_SOURCE_CHANGED' ||
        /source changed|stale|update the letter/i.test(msg)
      ) {
        setLetterStatus('stale');
      }
      toastError(e, 'Could not approve referral letter');
      throw e;
    }
  };

  const persistHandling = async (
    method: ManualReferralHandlingMethod,
    detail: string,
  ) => {
    setHandlingMethod(method);
    setHandlingDetail(detail);
    if (!handlingRecordIsComplete(method, detail)) return;
    try {
      await persist();
      await saveReferral.mutateAsync({
        ...buildReferralPayload(false),
        handlingMethod: method,
        handlingDetail: method === 'SENT_ANOTHER_WAY' ? detail.trim() : undefined,
      });
      setChangingHandling(false);
    } catch (e) {
      toastError(e, 'The referral method could not be saved. Try again.');
    }
  };

  const handleSendReferralFax = async (payload: {
    recipientName: string;
    faxNumber: string;
    html: string;
  }) => {
    const plain = payload.html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plain) {
      toast.error('Add letter content before faxing');
      throw new Error('EMPTY_REFERRAL_LETTER');
    }
    try {
      const blob = await generateReferralLetterPdf(payload.html, {
        tenantName: consultation.tenant?.name,
        dateLabel: new Date(consultation.createdAt).toLocaleDateString('en-CA', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        documentRef: consultation.consultationRef,
        draft: false,
      });
      const pdfBase64 = await blobToBase64(blob);
      await sendFax.mutateAsync({
        recipientName: payload.recipientName,
        faxNumber: payload.faxNumber,
        documentTypeId: 'referral_letter',
        documentName: 'Referral letter',
        pdfBase64,
      });
      toast.success(
        `Fax submitted to ${payload.recipientName}. Delivery is confirmed when the recipient receives it.`,
        { announce: true },
      );
    } catch (err) {
      toastError(err, 'The fax could not be sent. Try again or use another referral method.');
      throw err;
    }
  };

  const handleReferralFormChange = (next: ReferralOutcomeFormValues) => {
    const reasonChanged = next.reasonForReferral !== referralForm.reasonForReferral;
    const destChanged =
      next.destination !== referralForm.destination ||
      next.destinationOtherText !== referralForm.destinationOtherText;
    if (reasonChanged) {
      localEditVersionRef.current += 1;
      const stillApplied =
        next.reasonForReferral.trim() === lastAppliedDraftRef.current.trim();
      if (!stillApplied) {
        reasonPristineRef.current = false;
        setReasonOrigin((prev: ReferralReasonDraftOrigin | 'AI_EDITED' | 'NONE') =>
          prev === 'AI_DRAFT' || prev === 'AI_EDITED'
            ? 'AI_EDITED'
            : next.reasonForReferral.trim()
              ? 'MANUAL'
              : prev,
        );
      }
    }
    if (destChanged) {
      localEditVersionRef.current += 1;
    }
    setReferralForm(next);
    // Optimistic stale mark when letter-source fields change after approval
    if (
      letterStatus === 'approved' ||
      letterStatus === 'finalized' ||
      (letterStatus === 'draft' && Boolean(letterDraft))
    ) {
      const nextFingerprint = buildReferralSourceFingerprint({
        pathwayId: consultation.selectedPathwayId ?? consultation.pathway?.id,
        pathwayVersion: consultation.pathway?.version,
        urgencyCode: existingOutcome?.urgencyCode,
        destination: next.destination,
        destinationOtherText: next.destinationOtherText,
        reasonForReferral: next.reasonForReferral,
        additionalNote: next.additionalNote,
        presentingConcern: consultation.chiefComplaint,
      });
      const prevFingerprint = buildReferralSourceFingerprint({
        pathwayId: consultation.selectedPathwayId ?? consultation.pathway?.id,
        pathwayVersion: consultation.pathway?.version,
        urgencyCode: existingOutcome?.urgencyCode,
        destination: referralForm.destination,
        destinationOtherText: referralForm.destinationOtherText,
        reasonForReferral: referralForm.reasonForReferral,
        additionalNote: referralForm.additionalNote,
        presentingConcern: consultation.chiefComplaint,
      });
      if (nextFingerprint !== prevFingerprint) {
        setLetterStatus('stale');
        setApprovedSourceRevision(null);
      }
    }
  };

  const clearReferralSelections = () => {
    setResolutions((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id]?.kind === 'refer') delete next[id];
      }
      return next;
    });
    setReferralView('alert_only');
    setSubmitError(null);
  };

  const handleChangeAnswer = () => {
    if (existingOutcome?.status === 'DRAFT' || referralView === 'documenting_referral') {
      setChangeAnswerWarnOpen(true);
      return;
    }
    clearReferralSelections();
    const firstTrigger = referralTriggers[0]?.id ?? triggeredIds[0];
    if (firstTrigger) {
      requestAnimationFrame(() => {
        questionRefs.current[firstTrigger]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  };

  const handleContinueWithoutReferral = () => {
    const targetId = referralTriggers[0]?.id ?? triggeredIds[0];
    if (!targetId) return;
    setResolutions((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setDraftOverride(emptyOverride());
    setOtherText('');
    setEditingId(targetId);
    setReferralView('documenting_override');
    requestAnimationFrame(() => {
      questionRefs.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const openReferralOptions = () => {
    setReferralView('documenting_referral');
    requestAnimationFrame(() => {
      const heading = outcomeHeadingRef.current;
      if (!heading) return;
      const pane = document.querySelector<HTMLElement>('[data-consult-scroll]');
      if (pane) {
        const paneRect = pane.getBoundingClientRect();
        const elRect = heading.getBoundingClientRect();
        const nextTop = pane.scrollTop + (elRect.top - paneRect.top) - 20;
        pane.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
      } else {
        heading.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      // Focus without forcing another scroll jump on subsequent radio clicks.
      heading.focus({ preventScroll: true });
    });
  };

  const saveOverride = (itemId: string) => {
    const isOther = draftOverride.reason === 'Other';
    const reason = isOther ? otherText.trim() : draftOverride.reason.trim();
    if (!reason || !draftOverride.comments.trim() || !draftOverride.acknowledgedResponsibility) {
      toast.error('Complete reason, comments, and acknowledgment');
      return;
    }
    if (isOther && reason.length < 3) {
      toast.error('Please specify the other reason');
      return;
    }
    setResolutions((prev) => ({
      ...prev,
      [itemId]: {
        kind: 'override',
        detail: {
          ...draftOverride,
          reason: isOther ? `Other: ${reason}` : reason,
        },
      },
    }));
    setEditingId(null);
    setOtherText('');
    setReferralView('alert_only');
    toast.success('Clinical judgment override saved');
  };

  const pathwayTotal = items.length;

  const collapsedSummary = useMemo(() => {
    if (referCount > 0) return 'Pathway stopped—referral required';
    if (needsAction.length > 0) return 'Action required';
    if (overrideCount > 0) {
      return `${overrideCount} concern${overrideCount === 1 ? '' : 's'} identified; action documented`;
    }
    if (triggeredIds.length > 0) {
      return `${triggeredIds.length} concern${triggeredIds.length === 1 ? '' : 's'} identified; action documented`;
    }
    return 'No red flags identified';
  }, [referCount, needsAction.length, overrideCount, triggeredIds.length]);

  const showCollapsed = sectionCollapsed && allAnswered && allNoSelected && allResolved;

  const renderResolution = (flag: RedFlagViewItem) => {
    const item = items.find((row) => row.id === flag.id);
    if (!item || answers[item.id] !== 'yes') return null;
    const resolution = resolutions[item.id];
    const isEditing = editingId === item.id;
    const overrideSaved = resolution?.kind === 'override';
    const referred = resolution?.kind === 'refer';
    const allowOverride = flag.outcome.allowJudgmentOverride;

    if (!overrideSaved && !referred && !isEditing && flag.outcome.requiresResolution) {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="h-9 rounded-lg" onClick={() => selectReferForItem(item.id)}>
            {CLINICAL_REVIEW_COPY.refer}
          </Button>
          {allowOverride ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-lg"
              onClick={() => {
                setDraftOverride(emptyOverride());
                setOtherText('');
                setEditingId(item.id);
                setDifferentialReview((prev) => ({
                  ...prev,
                  auditEvents: [
                    ...prev.auditEvents,
                    { action: 'safety_override_started', at: new Date().toISOString(), subjectId: item.id },
                  ].slice(-40),
                }));
              }}
            >
              {CLINICAL_REVIEW_COPY.continueWithJudgment}
            </Button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center text-[13px] font-semibold text-[#0f6f6b] hover:underline"
            onClick={() => setPathwayConfirmOpen(true)}
          >
            {CLINICAL_REVIEW_COPY.choosePathway}
          </button>
        </div>
      );
    }

    if (isEditing) {
      return (
        <OverridePanel
          recommendedAction={item.recommendedAction}
          draft={draftOverride}
          otherText={otherText}
          onOtherTextChange={setOtherText}
          onChange={setDraftOverride}
          onCancel={() => setEditingId(null)}
          onSave={() => {
            saveOverride(item.id);
            setDifferentialReview((prev) => ({
              ...prev,
              auditEvents: [
                ...prev.auditEvents,
                { action: 'safety_override_completed', at: new Date().toISOString(), subjectId: item.id },
              ].slice(-40),
            }));
          }}
          onRefer={() => selectReferForItem(item.id)}
        />
      );
    }

    if (overrideSaved && resolution.kind === 'override') {
      return (
        <div className="mt-3 rounded-[12px] border border-[#d7ece9] bg-[#f3fbfa] px-3.5 py-3">
          <p className="text-[13.5px] font-semibold text-[#0f6f6b]">
            Continued with clinical judgment
          </p>
          <p className="mt-1 text-[13px] text-[#334155]">{resolution.detail.reason}</p>
          <button
            type="button"
            className="mt-2 text-[13px] font-semibold text-[#0f6f6b] hover:underline"
            onClick={() => {
              const detail = resolution.detail;
              const isOtherReason = detail.reason.startsWith('Other:');
              setDraftOverride({ ...detail, reason: isOtherReason ? 'Other' : detail.reason });
              setOtherText(isOtherReason ? detail.reason.replace(/^Other:\s*/, '') : '');
              setResolutions((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
              });
              setEditingId(item.id);
            }}
          >
            Edit override
          </button>
        </div>
      );
    }

    if (referred) {
      return (
        <p className="mt-3 text-[13px] text-[#5b6b76]">
          Referral selected. Complete the referral documentation below, or change this answer.
        </p>
      );
    }

    return null;
  };

  return (
    <div className="mx-auto flex w-full flex-col gap-5 [overflow-anchor:none]">
      {stepper ? <div className="mb-1">{stepper}</div> : null}
      <PathwayClinicalJudgementStatusChip
        record={consultation.pathwayClinicalJudgement}
        onView={onViewClinicalJudgement}
      />
      <ClinicalReviewScreen
        pathwayName={consultation.pathway ? pathwayDisplayLabel(consultation.pathway) : 'Pathway'}
        evidence={pathwayEvidence}
        differentials={mapPathwayDifferentials(consultation.pathway?.differentials)}
        review={differentialReview}
        onReviewChange={setDifferentialReview}
        onChooseDifferentPathway={() => {
          void persist()
            .then(() => onChooseDifferentPathway?.())
            .catch((error) => toastError(error, 'Could not save clinical review'));
        }}
        flags={reviewFlags}
        answers={answers}
        onAnswer={(id, answer) => setAnswer(id, answer, 'INDIVIDUAL_SELECTION')}
        answeredCount={answeredCount}
        confirmNoneActive={Boolean(nonePresentUndo)}
        onConfirmNone={confirmNonePresent}
        onUndoConfirmNone={undoConfirmNone}
        onRequestReset={() => setResetOpen(true)}
        renderResolution={renderResolution}
        differentialOpen={differentialOpen}
        onDifferentialOpenChange={setDifferentialOpen}
        redFlagsOpen={redFlagsOpen}
        onRedFlagsOpenChange={setRedFlagsOpen}
        questionRef={(id, el) => {
          questionRefs.current[id] = el;
        }}
      />

      {showReferralPathway ? (
        <div ref={referralSectionRef} className="flex flex-col gap-4 [overflow-anchor:none]">
          <ReferralAlertCard
            urgencyDisplay={urgencyMeta.display}
            triggers={referralTriggers}
            onReferralOptions={openReferralOptions}
            onChangeAnswer={handleChangeAnswer}
            onContinueWithoutReferral={handleContinueWithoutReferral}
          />
          {(referralView === 'documenting_referral' || referralView === 'saving') && (
            <ReferralOutcomeCard
              values={referralForm}
              onChange={handleReferralFormChange}
              onDocumentComplete={handleDocumentComplete}
              onCreateLetter={handleLetterAction}
              saving={referralView === 'saving' || saveReferral.isPending || saveStep.isPending}
              creatingLetter={createLetter.isPending}
              approvingLetter={approveLetter.isPending}
              submitError={submitError}
              headingRef={outcomeHeadingRef}
              letterStatus={letterStatus}
              canComplete={canCompleteReferral}
              formValidHint={referralFormIsValid}
              autoDraftReason={appliedDraftReason}
              reasonOrigin={reasonOrigin}
              reasonDrafting={draftReferralReasonAi.isPending}
              reasonDraftFailed={reasonDraftFailed}
              assessmentChanged={assessmentChanged}
              onRetryDraft={() => {
                if (!reasonPristineRef.current) return;
                lastRequestedKeyRef.current = '';
                setReasonDraftRetry((n) => n + 1);
              }}
              onKeepVersion={() => setAssessmentChanged(false)}
              onUpdateDraft={() => {
                reasonPristineRef.current = true;
                setAssessmentChanged(false);
                lastRequestedKeyRef.current = '';
                setReasonDraftRetry((n) => n + 1);
              }}
              destinationLabel={destinationLabel}
              handlingMethod={handlingMethod}
              handlingDetail={handlingDetail}
              handlingFaxLocked={handlingMethod === 'FAXED_FROM_SAFESCRIBE'}
              changingHandling={changingHandling}
              onChangeHandlingMethod={(method) => {
                void persistHandling(method, method === 'SENT_ANOTHER_WAY' ? handlingDetail : '');
              }}
              onChangeHandlingDetail={setHandlingDetail}
              onCommitHandlingDetail={(detail) => {
                if (handlingMethod === 'SENT_ANOTHER_WAY') {
                  void persistHandling('SENT_ANOTHER_WAY', detail);
                }
              }}
              onStartChangeHandling={() => setChangingHandling(true)}
            />
          )}
        </div>
      ) : null}

      {/* Footer actions */}
      <div className="flex flex-col gap-4 border-t border-consult-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
        <ClinicalSecondaryButton size="lg" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {CLINICAL_REVIEW_COPY.back}
        </ClinicalSecondaryButton>

        {items.length > 0 && allAnswered && !showCollapsed && !showReferralPathway && !referralPendingScreening && (
          <div className="hidden min-w-0 flex-1 items-start gap-2.5 px-2 lg:flex">
            {overrideCount > 0 || triggeredIds.length > 0 ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {overrideCount > 0
                ? 'Concerns documented with clinical rationale.'
                : needsAction.length > 0
                  ? 'Resolve each triggered red flag before continuing.'
                  : 'No red flags identified.'}
            </p>
          </div>
        )}

        {showReferralPathway ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            {referralView === 'documenting_referral' || referralView === 'saving' ? (
              <p className="text-sm text-muted-foreground sm:text-right">
                Complete the referral form above to finish this consultation.
              </p>
            ) : (
              <ClinicalPrimaryButton
                size="lg"
                onClick={openReferralOptions}
                className="min-w-48 gap-2"
              >
                Document referral
                <ChevronRight className="h-4 w-4" />
              </ClinicalPrimaryButton>
            )}
          </div>
        ) : referralPendingScreening ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:max-w-md sm:items-end">
            <ClinicalPrimaryButton
              size="lg"
              onClick={() => {
                if (unansweredCount > 0) {
                  markRemainingNoAndDocumentReferral();
                  return;
                }
                if (needsAction.length > 0) {
                  focusNextScreeningAction(firstUnresolvedId);
                  return;
                }
                focusReferralSection();
              }}
              className="min-w-48 gap-2"
            >
              {unansweredCount > 0
                ? 'Mark remaining No & document referral'
                : needsAction.length > 0
                  ? 'Resolve remaining findings'
                  : 'Continue to referral'}
              <ChevronRight className="h-4 w-4" />
            </ClinicalPrimaryButton>
            {unansweredCount > 0 ? (
              <button
                type="button"
                className="inline-flex items-center justify-end gap-1 border-0 bg-transparent p-0 text-[13px] font-semibold text-primary hover:underline sm:self-end"
                onClick={() => focusNextScreeningAction(firstUnansweredId)}
              >
                Or answer remaining questions one by one
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : (
          <ClinicalPrimaryButton
            size="lg"
            onClick={handleNext}
            loading={saveStep.isPending}
            busyFeedback={false}
            disabled={!canContinue || saveStep.isPending}
            title={
              canContinue
                ? undefined
                : !differentialReview.reviewed
                  ? CLINICAL_REVIEW_COPY.differentialIncomplete
                  : !allAnswered
                    ? CLINICAL_REVIEW_COPY.safetyIncomplete
                    : !allNoSelected
                      ? CLINICAL_REVIEW_COPY.safetyMustBeAbsent
                      : CLINICAL_REVIEW_COPY.unresolvedSafety
            }
            className="min-w-48 gap-2"
          >
            {CLINICAL_REVIEW_COPY.continue}
            <ChevronRight className="h-4 w-4" />
          </ClinicalPrimaryButton>
        )}
      </div>

      <ConfirmDialog
        open={pathwayConfirmOpen}
        onOpenChange={setPathwayConfirmOpen}
        title={CLINICAL_REVIEW_COPY.choosePathwayTitle}
        description={CLINICAL_REVIEW_COPY.choosePathwayBody}
        cancelLabel={CLINICAL_REVIEW_COPY.choosePathwayCancel}
        confirmLabel={CLINICAL_REVIEW_COPY.choosePathwayConfirm}
        onConfirm={() => {
          setPathwayConfirmOpen(false);
          void persist()
            .then(() => onChooseDifferentPathway?.())
            .catch((error) => toastError(error, 'Could not save clinical review'));
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={CLINICAL_REVIEW_COPY.resetTitle}
        description={CLINICAL_REVIEW_COPY.resetBody}
        cancelLabel="Cancel"
        confirmLabel="Reset answers"
        variant="destructive"
        onConfirm={() => {
          setResetOpen(false);
          clearAllAnswers();
          setReferralView('alert_only');
          setSubmitError(null);
        }}
      />

      <ConfirmDialog
        open={changeAnswerWarnOpen}
        onOpenChange={setChangeAnswerWarnOpen}
        title="Change red-flag answer?"
        description="Changing the answer may clear referral triggers and discard the referral draft you started. Unrelated assessment answers are kept."
        cancelLabel="Keep referral"
        confirmLabel="Change answer"
        variant="destructive"
        onConfirm={() => {
          setChangeAnswerWarnOpen(false);
          clearReferralSelections();
          const firstTrigger = referralTriggers[0]?.id ?? triggeredIds[0];
          if (firstTrigger) {
            requestAnimationFrame(() => {
              questionRefs.current[firstTrigger]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            });
          }
        }}
      />

      <ReferralLetterPreviewDialog
        open={letterOpen}
        onOpenChange={(open) => {
          setLetterOpen(open);
          if (!open) {
            requestAnimationFrame(() => {
              outcomeHeadingRef.current?.focus();
            });
          }
        }}
        letterDraft={letterDraft}
        fallbackSeed={letterFallbackSeed}
        approving={approveLetter.isPending}
        alreadyApproved={letterStatus === 'approved' || letterStatus === 'finalized'}
        onApprove={handleApproveLetter}
        recordedAgeYears={
          Number.isFinite(Number(consultation.demographics?.age))
            ? Number(consultation.demographics?.age)
            : null
        }
        reasonNeedsReview={isGenericComplaintOnlyDraft(
          referralForm.reasonForReferral,
          referralTriggers.map((t) => t.label),
        )}
        reasonOrigin={reasonOrigin === 'NONE' ? undefined : reasonOrigin}
        onDraftChange={async (draftHtml) => {
          setLetterDraft(draftHtml);
          const result = await updateLetterDraft.mutateAsync(draftHtml);
          if (!result.letterStatus) return;
          const next = mapLetterStatusFromDb(
            result.letterStatus,
            Boolean(result.letterDraft),
          );
          setLetterStatus((prev) => {
            if (
              (prev === 'approved' || prev === 'finalized') &&
              (next === 'draft' || next === 'not_created')
            ) {
              return prev;
            }
            return next;
          });
        }}
        onReopenEdit={async () => {
          const result = await updateLetterDraft.mutateAsync(letterDraft);
          setLetterStatus(mapLetterStatusFromDb(result.letterStatus, Boolean(result.letterDraft)));
          setApprovedSourceRevision(null);
          setHandlingMethod(null);
          setHandlingDetail('');
          setChangingHandling(false);
          toast.success('Reapproval required after editing', { announce: true });
        }}
        onSendFax={
          letterStatus === 'approved' || letterStatus === 'finalized'
            ? handleSendReferralFax
            : undefined
        }
        faxSending={sendFax.isPending}
        faxStorageScope={faxStorageScope}
      />

      <CompleteConsultationModal
        open={completeOpen}
        consultationId={consultation.id}
        deletionDeadline={consultation.deletionDeadline}
        variant="referral"
        referralSummary={{
          destinationLabel: destinationLabel || '—',
          letterLabel: 'Approved',
          communicationLabel: referralHandlingLabel(handlingMethod, handlingDetail),
        }}
        startingNext={false}
        onClose={() => setCompleteOpen(false)}
        onConfirmDelete={handleConfirmComplete}
        onCompleted={() => {
          toast.success('Consultation completed');
          router.replace(backHref);
        }}
      />
    </div>
  );
}
