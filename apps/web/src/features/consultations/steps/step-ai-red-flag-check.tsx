'use client';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Info,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  ShieldPlus,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import type { Consultation } from '../types';
import {
  useCjRedFlags,
  useGenerateCjRedFlags,
  useSaveCjRedFlagAnswer,
  useSaveCjRedFlagAttestation,
  useAddCjRedFlagConcern,
  useConfirmCjRedFlags,
} from '../hooks';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '../clinical-ui';

type Answer = 'NO' | 'YES';

interface Props {
  consultation: Consultation;
  onNext: (options?: { targetStep?: string }) => void;
  onBack: () => void;
  backLabel?: string;
}

const REGEN_REASONS = [
  { value: 'PATIENT_INFORMATION_UPDATED', label: 'Patient information updated' },
  { value: 'CLINICAL_IMPRESSION_UPDATED', label: 'Clinical impression updated' },
  { value: 'NOT_RELEVANT', label: 'Questions are not relevant' },
  { value: 'NEW_INFORMATION', label: 'New information became available' },
  { value: 'OTHER', label: 'Other' },
] as const;

const ANSWER_OPTIONS: { value: Answer; label: string }[] = [
  { value: 'NO', label: 'No' },
  { value: 'YES', label: 'Yes' },
];

/**
 * Clinical Judgment — Red Flags to Confirm (mock-aligned).
 * AI ranks questions; pharmacist answers and confirms. Guided Pathway uses Step5RedFlags.
 */
export function StepAiRedFlagCheck({ consultation, onNext, onBack, backLabel = 'Back' }: Props) {
  const { data, isLoading, isFetching, refetch } = useCjRedFlags(consultation.id);
  const generate = useGenerateCjRedFlags(consultation.id);
  const saveAnswer = useSaveCjRedFlagAnswer(consultation.id);
  const saveAttestation = useSaveCjRedFlagAttestation(consultation.id);
  const addConcern = useAddCjRedFlagConcern(consultation.id);
  const confirm = useConfirmCjRedFlags(consultation.id);

  const [localAnswers, setLocalAnswers] = useState<Record<string, Answer | null>>(
    {},
  );
  const [otherConcern, setOtherConcern] = useState<boolean | null>(null);
  const [otherDetail, setOtherDetail] = useState('');
  const [showRegen, setShowRegen] = useState(false);
  const [regenReason, setRegenReason] = useState<string>('NOT_RELEVANT');
  const [showAddConcern, setShowAddConcern] = useState(false);
  const [concernText, setConcernText] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const firstUnansweredRef = useRef<HTMLDivElement | null>(null);
  const pendingAnswerRef = useRef<Set<string>>(new Set());
  const autoGenKeyRef = useRef<string | null>(null);

  const questions = useMemo(
    () => (data?.questions ?? []).filter((q) => q.question.trim().length > 0),
    [data?.questions],
  );

  // Auto-generate on first visit, stale check, or empty persisted set
  useEffect(() => {
    if (!data || generate.isPending) return;
    const empty = questions.length === 0;
    const needsGenerate =
      data.status === 'GENERATION_REQUIRED' ||
      data.status === 'STALE' ||
      (empty &&
        data.status !== 'CONFIRMED_CLEAR' &&
        data.status !== 'REFERRAL_REQUIRED');
    if (!needsGenerate) return;
    const key = `${consultation.id}:${data.checkId ?? 'none'}:${data.status}:${questions.length}`;
    if (autoGenKeyRef.current === key) return;
    autoGenKeyRef.current = key;
    void generate
      .mutateAsync({
        reason: data.status === 'STALE' ? 'NEW_INFORMATION' : 'INITIAL',
      })
      .then(() => refetch())
      .catch((e) => toastError(e, 'Could not generate red-flag questions'));
  }, [
    consultation.id,
    data?.checkId,
    data?.status,
    generate.isPending,
    generate.mutateAsync,
    questions.length,
    refetch,
  ]);

  useEffect(() => {
    if (!data?.questions || hydrated) return;
    const next: Record<string, Answer | null> = {};
    for (const q of data.questions) {
      next[q.id] = q.answer === 'NO' || q.answer === 'YES' ? q.answer : null;
    }
    setLocalAnswers(next);
    setOtherConcern(
      data.otherUnresolvedConcern === true
        ? true
        : data.otherUnresolvedConcern === false
          ? false
          : null,
    );
    setOtherDetail(data.otherConcernDetails ?? '');
    setHydrated(true);
  }, [data, hydrated]);

  useEffect(() => {
    setHydrated(false);
  }, [data?.checkId]);

  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => localAnswers[q.id] === 'NO' || localAnswers[q.id] === 'YES');
  const anyYes = questions.some((q) => localAnswers[q.id] === 'YES');
  const allNo =
    questions.length > 0 &&
    questions.every((q) => localAnswers[q.id] === 'NO') &&
    otherConcern === false;

  const diagnosisLabel = useMemo(() => {
    const text =
      data?.workingDiagnosis ||
      consultation.clinicalJudgmentAssessment?.workingDiagnosisText ||
      '';
    const certainty =
      consultation.clinicalJudgmentAssessment?.diagnosticCertainty;
    if (!text) return '—';
    if (!certainty) return text;
    const c =
      certainty.charAt(0) + certainty.slice(1).toLowerCase();
    // Avoid double-prefix if already present
    if (text.toLowerCase().startsWith(c.toLowerCase())) return text;
    return `${c} ${text}`;
  }, [
    data?.workingDiagnosis,
    consultation.clinicalJudgmentAssessment?.workingDiagnosisText,
    consultation.clinicalJudgmentAssessment?.diagnosticCertainty,
  ]);

  const primaryLabel = useMemo(() => {
    if (generate.isPending || data?.status === 'GENERATING') {
      return 'Generating red flags…';
    }
    if (anyYes || otherConcern === true) return 'Document & Refer';
    if (allNo) return 'Continue to Prescribing Readiness';
    return 'Continue to Prescribing Readiness';
  }, [generate.isPending, data?.status, anyYes, allNo, otherConcern]);

  const primaryDisabled =
    generate.isPending ||
    confirm.isPending ||
    !data?.checkId ||
    data.status === 'STALE' ||
    data.status === 'GENERATION_REQUIRED' ||
    !allAnswered ||
    otherConcern == null ||
    (otherConcern === true && !otherDetail.trim());

  const confirmPayload = useCallback(() => {
    const answers = questions
      .map((q) => {
        const answer = localAnswers[q.id];
        if (answer !== 'NO' && answer !== 'YES') {
          return null;
        }
        return { questionId: q.id, answer };
      })
      .filter((a): a is { questionId: string; answer: Answer } => a != null);
    return {
      checkId: data?.checkId as string,
      otherUnresolvedConcern: otherConcern === true,
      otherConcernDetails:
        otherConcern === true ? otherDetail.trim() || undefined : null,
      expectedSourceSnapshotHash: data?.sourceSnapshotHash,
      answers,
    };
  }, [questions, localAnswers, data?.checkId, data?.sourceSnapshotHash, otherConcern, otherDetail]);

  const handleAnswer = useCallback(
    async (questionId: string, answer: Answer) => {
      setLocalAnswers((prev) => ({ ...prev, [questionId]: answer }));
      if (!data?.checkId) return;
      pendingAnswerRef.current.add(questionId);
      try {
        await saveAnswer.mutateAsync({
          checkId: data.checkId,
          questionId,
          answer,
        });
      } catch (e) {
        toastError(e, 'Could not save answer');
      } finally {
        pendingAnswerRef.current.delete(questionId);
      }
    },
    [data?.checkId, saveAnswer],
  );

  const handleAttestation = async (value: boolean) => {
    setOtherConcern(value);
    if (!data?.checkId) return;
    try {
      await saveAttestation.mutateAsync({
        checkId: data.checkId,
        otherUnresolvedConcern: value,
        otherConcernDetails: value ? otherDetail.trim() || undefined : null,
      });
    } catch (e) {
      toastError(e, 'Could not save attestation');
    }
  };

  const handleRegenerate = async () => {
    try {
      await generate.mutateAsync({ reason: regenReason });
      autoGenKeyRef.current = null;
      setShowRegen(false);
      setHydrated(false);
      toast.success('Red-flag questions regenerated');
      await refetch();
    } catch (e) {
      toastError(e, 'Could not regenerate questions');
    }
  };

  const handleAddConcern = async () => {
    if (!data?.checkId || concernText.trim().length < 3) {
      toast.error('Enter a concern (at least 3 characters)');
      return;
    }
    try {
      await addConcern.mutateAsync({
        checkId: data.checkId,
        concernText: concernText.trim(),
        responseStatus: 'UNRESOLVED',
      });
      setConcernText('');
      setShowAddConcern(false);
      toast.success('Concern added');
      await refetch();
    } catch (e) {
      toastError(e, 'Could not add concern');
    }
  };

  const handlePrimary = async () => {
    if (!data?.checkId) return;
    if (!allAnswered || otherConcern == null) {
      toast.error('Answer all questions to continue');
      firstUnansweredRef.current?.focus();
      return;
    }
    try {
      const res = await confirm.mutateAsync(confirmPayload());

      if (res.decision === 'READY_FOR_PRESCRIBING_READINESS') {
        toast.success('Red-flag review confirmed');
        onNext({ targetStep: 'PRESCRIBING_READINESS' });
        return;
      }
      if (res.decision === 'DOCUMENTATION_REFERRAL') {
        toast.message('Routed to documentation & referral');
        onNext({ targetStep: 'DOCUMENTATION' });
        return;
      }
      toast.success('Red-flag review confirmed');
      onNext({ targetStep: 'PRESCRIBING_READINESS' });
    } catch (e) {
      toastError(e, 'Could not confirm red-flag check');
      await refetch();
      firstUnansweredRef.current?.focus();
    }
  };

  const handleDocumentRefer = async () => {
    if (!data?.checkId) return;
    setOtherConcern(true);
    try {
      await confirm.mutateAsync({
        ...confirmPayload(),
        otherUnresolvedConcern: true,
        otherConcernDetails:
          otherDetail.trim() || 'Referral requested from red-flag review',
      });
      toast.message('Routed to documentation & referral');
      onNext({ targetStep: 'DOCUMENTATION' });
    } catch (e) {
      toastError(e, 'Could not start referral');
    }
  };

  if (isLoading && !data) {
    return (
      <div className="mx-auto flex w-full max-w-[920px] flex-col items-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading red-flag check…</p>
      </div>
    );
  }

  const generating = generate.isPending || data?.status === 'GENERATING';
  const firstUnansweredIdx = questions.findIndex((qq) => !localAnswers[qq.id]);

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col pb-8">
      {/* Header — matches mock */}
      <header className="mb-5">
        <h1 className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[32px]">
          Red Flags to Confirm
        </h1>
        <p className="mt-2 text-[13.5px] font-medium text-muted-foreground">
          Clinical Judgment · Assisted screening
        </p>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-muted-foreground">
          SafeScribe generated these priority questions from the clinical
          impression and confirmed patient information.
        </p>
      </header>

      {/* Working diagnosis banner */}
      <div
        className={cn(
          'mb-5 flex flex-col gap-3 rounded-[12px] border border-primary/20 bg-primary/[0.05]',
          'px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldPlus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <p className="min-w-0 text-[13.5px] leading-snug text-foreground">
              <span className="font-semibold">Working diagnosis:</span>{' '}
              <span className="font-medium">{diagnosisLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-primary sm:shrink-0">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span>
              {questions.length} priority question
              {questions.length === 1 ? '' : 's'} generated
              {data?.generationMode === 'MANUAL_FALLBACK' ? ' · Manual fallback' : ''}
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={generating || data?.status === 'CONFIRMED_CLEAR'}
          onClick={() => setShowRegen((v) => !v)}
          className={cn(
            'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px]',
            'border border-primary/50 bg-background px-3.5 text-[13px] font-semibold text-primary',
            'transition-colors hover:bg-primary/[0.06]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
            'disabled:pointer-events-none disabled:opacity-45',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', generating && 'animate-spin')} />
          Regenerate questions
        </button>
      </div>

      {showRegen && (
        <div className="mb-5 rounded-[12px] border border-[color:var(--consult-card-border)] bg-card px-4 py-4 sm:px-5">
          <p className="mb-2.5 text-[13px] font-semibold text-foreground">
            Why regenerate?
          </p>
          <div className="flex flex-wrap gap-2">
            {REGEN_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRegenReason(r.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  regenReason === r.value
                    ? 'border-primary bg-primary/[0.08] text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <ClinicalPrimaryButton
              onClick={() => void handleRegenerate()}
              loading={generate.isPending}
              size="md"
            >
              Confirm regenerate
            </ClinicalPrimaryButton>
            <ClinicalSecondaryButton size="md" onClick={() => setShowRegen(false)}>
              Cancel
            </ClinicalSecondaryButton>
          </div>
        </div>
      )}

      {data?.status === 'STALE' && (
        <div className="mb-5 flex items-start gap-3 rounded-[12px] border border-amber-200 bg-amber-50/90 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[14px] font-semibold text-amber-950">
              Red-flag review is out of date
            </p>
            <p className="mt-0.5 text-[13px] text-amber-900/90">
              Clinical or patient information changed. Regenerate questions before
              continuing.
            </p>
          </div>
        </div>
      )}

      {/* Questions list — single card */}
      {generating && questions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[color:var(--consult-card-border)] bg-card py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-semibold text-foreground">Generating priority questions…</p>
          <p className="text-sm text-muted-foreground">
            Ranking approved red-flag criteria for this patient
          </p>
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[color:var(--consult-card-border)] bg-card px-6 py-16 text-center">
          <AlertTriangle className="h-7 w-7 text-amber-600" />
          <p className="font-semibold text-foreground">No red-flag questions yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            SafeScribe could not load priority questions for this visit. Generate them
            to continue the safety review.
          </p>
          <ClinicalPrimaryButton
            size="md"
            className="mt-1"
            loading={generate.isPending}
            onClick={() => {
              autoGenKeyRef.current = null;
              void generate
                .mutateAsync({ reason: 'INITIAL' })
                .then(() => {
                  setHydrated(false);
                  return refetch();
                })
                .catch((e) => toastError(e, 'Could not generate red-flag questions'));
            }}
          >
            Generate questions
          </ClinicalPrimaryButton>
        </div>
      ) : (
        <section
          className={cn(
            'overflow-hidden rounded-2xl border border-[color:var(--consult-card-border)] bg-card',
            'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
          )}
        >
          <ul className="m-0 list-none divide-y divide-[color:var(--consult-divider)] p-0">
            {questions.map((q, idx) => (
              <li key={q.id}>
                <QuestionRow
                  cardRef={idx === firstUnansweredIdx ? firstUnansweredRef : undefined}
                  sequence={idx + 1}
                  question={q.question}
                  whyItMatters={q.whyItMatters}
                  answer={localAnswers[q.id] ?? null}
                  onAnswer={(a) => void handleAnswer(q.id, a)}
                  disabled={generating}
                />
              </li>
            ))}
          </ul>

          {/* Add another concern — dashed control inside / below list */}
          <div className="border-t border-[color:var(--consult-divider)] px-4 py-4 sm:px-5">
            {!showAddConcern ? (
              <button
                type="button"
                onClick={() => setShowAddConcern(true)}
                className={cn(
                  'inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px]',
                  'border border-dashed border-primary/45 bg-primary/[0.02]',
                  'text-[13.5px] font-semibold text-primary',
                  'transition-colors hover:bg-primary/[0.05]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  'sm:w-auto sm:px-4',
                )}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Add another concern
              </button>
            ) : (
              <div className="rounded-[10px] border border-[color:var(--consult-card-border)] bg-background p-4">
                <label className="mb-1.5 block text-[13px] font-semibold">
                  Pharmacist concern
                </label>
                <Textarea
                  value={concernText}
                  onChange={(e) => setConcernText(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Describe the additional clinical concern…"
                  className="rounded-[10px] text-[14px]"
                />
                <div className="mt-2.5 flex gap-2">
                  <ClinicalPrimaryButton
                    size="md"
                    onClick={() => void handleAddConcern()}
                    loading={addConcern.isPending}
                  >
                    Save concern
                  </ClinicalPrimaryButton>
                  <ClinicalSecondaryButton
                    size="md"
                    onClick={() => setShowAddConcern(false)}
                  >
                    Cancel
                  </ClinicalSecondaryButton>
                </div>
              </div>
            )}

            {(data?.manualConcerns?.length ?? 0) > 0 && (
              <div className="mt-3 space-y-2">
                {data!.manualConcerns!.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-[10px] border border-amber-200/80 bg-amber-50/60 px-3.5 py-2.5 text-[13.5px]"
                  >
                    <p className="font-semibold text-foreground">{c.concernText}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Pharmacist-added ·{' '}
                      {c.responseStatus.replace(/_/g, ' ').toLowerCase()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Final pharmacist confirmation */}
      <div
        className={cn(
          'mt-5 rounded-[12px] border border-amber-200/90 bg-amber-50/80',
          'px-4 py-4 sm:px-5',
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <Shield className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14.5px] font-bold text-foreground">
                Final pharmacist confirmation
              </p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-foreground/85">
                Based on your assessment, are there any unresolved concerns
                requiring referral or further investigation?
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <div
              role="radiogroup"
              aria-label="Unresolved concerns requiring referral"
              className="flex gap-2"
            >
              {(['No', 'Yes'] as const).map((label) => {
                const value = label === 'Yes';
                const selected = otherConcern === value;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => void handleAttestation(value)}
                    className={cn(
                      'inline-flex h-10 min-w-[4.75rem] items-center justify-center rounded-[10px] border px-4',
                      'text-[14px] font-semibold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50',
                      selected
                        ? 'border-amber-700 bg-amber-700 text-white'
                        : 'border-amber-400/80 bg-white text-amber-900 hover:bg-amber-50',
                    )}
                  >
                    {selected ? (
                      <Check className="mr-1 h-3.5 w-3.5" strokeWidth={3} />
                    ) : null}
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="max-w-[220px] text-[11.5px] leading-snug text-muted-foreground lg:text-right">
              Suggested questions do not make the referral decision. Pharmacist confirmation is
              required.
            </p>
          </div>
        </div>

        {otherConcern === true && (
          <div className="mt-3 pl-0 sm:pl-11">
            <Input
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
              placeholder="Briefly describe the unresolved concern…"
              className="bg-white"
            />
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div
        className={cn(
          'mt-7 flex flex-col gap-4 border-t border-[color:var(--consult-divider)] pt-5',
          'sm:flex-row sm:items-start sm:justify-between',
        )}
      >
        <button
          type="button"
          onClick={onBack}
          className={cn(
            'inline-flex items-center gap-1 text-[14px] font-semibold text-primary',
            'hover:underline focus-visible:outline-none focus-visible:underline',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </button>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:gap-3">
          <ClinicalSecondaryButton
            size="md"
            className="h-11 border-[color:var(--consult-card-border)] text-foreground"
            disabled={confirm.isPending || !data?.checkId}
            onClick={() => void handleDocumentRefer()}
          >
            Document & Refer
          </ClinicalSecondaryButton>

          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <ClinicalPrimaryButton
              onClick={() => void handlePrimary()}
              loading={confirm.isPending || generating}
              disabled={primaryDisabled}
              loadingLabel={generating ? 'Generating…' : 'Confirming…'}
              size="md"
              className="h-11 min-w-[15.5rem] rounded-[10px] px-5"
            >
              {primaryLabel}
            </ClinicalPrimaryButton>
            {primaryDisabled && !generating ? (
              <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground sm:justify-end">
                <Lock className="h-3 w-3" />
                Answer all questions to continue
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Compliance bar */}
      <div
        className={cn(
          'mt-6 flex flex-col gap-1.5 rounded-[10px] bg-muted/45 px-4 py-3',
          'text-[11.5px] leading-relaxed text-muted-foreground',
          'sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        )}
      >
        <span className="inline-flex items-start gap-1.5 sm:items-center">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" aria-hidden />
          Suggested questions support — but do not replace — pharmacist
          assessment.
        </span>
        <span className="sm:text-right">
          Questions are based on approved clinical references and confirmed
          consultation data.
        </span>
      </div>

      <div aria-live="polite" className="sr-only">
        {generating
          ? 'Generating red-flag questions'
          : isFetching
            ? 'Updating red-flag check'
            : ''}
      </div>
    </div>
  );
}

const QuestionRow = memo(function QuestionRow({
  sequence,
  question,
  whyItMatters,
  answer,
  onAnswer,
  disabled,
  cardRef,
}: {
  sequence: number;
  question: string;
  whyItMatters: string;
  answer: Answer | null;
  onAnswer: (a: Answer) => void;
  disabled?: boolean;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const legendId = useId();

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="outline-none px-4 py-5 sm:px-5 sm:py-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-1 gap-3">
          <span
            className={cn(
              'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              'bg-primary/10 text-[13px] font-bold text-primary',
            )}
            aria-hidden
          >
            {sequence}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start gap-2">
              <p
                id={legendId}
                className="m-0 text-[14.5px] font-bold leading-snug text-foreground"
              >
                {question}
              </p>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full',
                  'bg-primary px-2 py-0.5 text-[10.5px] font-semibold text-primary-foreground',
                )}
              >
                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                Suggested
              </span>
            </div>
            {whyItMatters ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-primary/90">
                <span className="font-semibold">Why it matters:</span>{' '}
                {whyItMatters}
              </p>
            ) : null}
          </div>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={legendId}
          className="flex w-full shrink-0 flex-wrap gap-2 lg:w-auto lg:justify-end"
        >
          {ANSWER_OPTIONS.map((opt) => {
            const selected = answer === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onAnswer(opt.value)}
                className={cn(
                  'inline-flex h-10 min-w-[5.25rem] items-center justify-center gap-1 rounded-[10px] border px-4',
                  'text-[13px] font-semibold transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-primary/40 bg-background text-primary hover:bg-primary/[0.05]',
                  disabled && 'opacity-55',
                )}
              >
                {selected ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                ) : null}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
