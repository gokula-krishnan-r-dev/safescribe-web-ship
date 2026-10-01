'use client';

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Scale,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import type { Consultation, DiagnosticCertainty } from '../types';
import {
  useSaveClinicalImpression,
  useGenerateAssessmentSummary,
} from '../hooks';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '../clinical-ui';
import { useWizardBeforeLeave } from '../wizard-nav';

interface Props {
  consultation: Consultation;
  onNext: () => void;
  onBack: () => void;
  backLabel?: string;
  nextHint?: string;
}

const CERTAINTY_OPTIONS: { value: DiagnosticCertainty; label: string }[] = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROBABLE', label: 'Probable' },
  { value: 'UNCERTAIN', label: 'Uncertain' },
];

const MAX_DIAGNOSIS_LEN = 250;
const MIN_DIAGNOSIS_LEN = 3;
const MIN_SUMMARY_LEN = 10;
const MAX_SUMMARY_LEN = 4000;

const DIAGNOSIS_SUGGESTIONS = [
  'Acute otitis media',
  'Recurrent herpes labialis',
  'Uncomplicated urinary tract infection',
  'Allergic rhinitis',
  'Acute bacterial sinusitis',
  'Streptococcal pharyngitis',
  'Impetigo',
  'Contact dermatitis',
  'Migraine',
  'Gastroesophageal reflux',
  'Asthma exacerbation',
  'Community-acquired pneumonia (suspected)',
  'Acute bronchitis',
  'Conjunctivitis',
  'Oral candidiasis',
] as const;

function sanitizeDiagnosis(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * Clinical Impression — mock-aligned layout for Clinical Judgment.
 * Single card: diagnosis → certainty → summary → AI draft → footer actions.
 */
export function StepClinicalAssessment({
  consultation,
  onNext,
  onBack,
  backLabel = 'Back',
  nextHint,
}: Props) {
  const existing = consultation.clinicalJudgmentAssessment;
  const isReadOnly = consultation.status === 'COMPLETED';

  const [diagnosis, setDiagnosis] = useState(
    () => existing?.workingDiagnosisText?.trim() ?? '',
  );
  const [diagnosisCode, setDiagnosisCode] = useState<string | null>(
    existing?.workingDiagnosisCode ?? null,
  );
  const [diagnosisSystem, setDiagnosisSystem] = useState<string | null>(
    existing?.workingDiagnosisSystem ?? null,
  );
  const [certainty, setCertainty] = useState<DiagnosticCertainty | null>(
    (existing?.diagnosticCertainty as DiagnosticCertainty) ?? null,
  );
  const [summary, setSummary] = useState(existing?.assessmentSummary ?? '');
  const [summarySource, setSummarySource] = useState(
    existing?.assessmentSummarySource ?? 'PHARMACIST',
  );
  const [aiReviewRequired, setAiReviewRequired] = useState(
    existing?.assessmentSummarySource === 'AI_DRAFT',
  );
  const [aiFailed, setAiFailed] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveImpression = useSaveClinicalImpression(consultation.id);
  const generateSummary = useGenerateAssessmentSummary(consultation.id);

  const diagnosisClean = sanitizeDiagnosis(diagnosis);
  const summaryTrim = summary.trim();

  const impressionValid =
    diagnosisClean.length >= MIN_DIAGNOSIS_LEN &&
    diagnosisClean.length <= MAX_DIAGNOSIS_LEN &&
    certainty != null &&
    summaryTrim.length >= MIN_SUMMARY_LEN &&
    summaryTrim.length <= MAX_SUMMARY_LEN;

  const hasAiSource =
    consultation.chiefComplaint?.trim() ||
    consultation.transcript?.trim() ||
    summaryTrim.length >= 3;

  const canDraftAi =
    !isReadOnly &&
    diagnosisClean.length >= MIN_DIAGNOSIS_LEN &&
    certainty != null &&
    Boolean(hasAiSource) &&
    !generateSummary.isPending &&
    !saveImpression.isPending;

  const filteredSuggestions = useMemo(() => {
    const q = diagnosis.trim().toLowerCase();
    if (q.length < 1) return DIAGNOSIS_SUGGESTIONS.slice(0, 6);
    return DIAGNOSIS_SUGGESTIONS.filter((s) => s.toLowerCase().includes(q)).slice(
      0,
      6,
    );
  }, [diagnosis]);

  const markDirty = useCallback(() => {
    setDirty(true);
    setDraftSavedAt(null);
  }, []);

  const buildPayload = useCallback(
    (confirm: boolean) => ({
      workingDiagnosisText: diagnosisClean,
      workingDiagnosisCode: diagnosisCode ?? undefined,
      workingDiagnosisSystem: diagnosisSystem ?? undefined,
      diagnosticCertainty: certainty ?? undefined,
      assessmentSummary: summaryTrim,
      assessmentSummarySource:
        summarySource === 'AI_DRAFT' || summarySource === 'AI_EDITED'
          ? summarySource
          : ('PHARMACIST' as const),
      confirm,
      action: confirm
        ? ('CONFIRM_AND_CONTINUE' as const)
        : ('SAVE_DRAFT' as const),
    }),
    [
      diagnosisClean,
      diagnosisCode,
      diagnosisSystem,
      certainty,
      summaryTrim,
      summarySource,
    ],
  );

  const persistDraft = useCallback(async () => {
    if (isReadOnly || diagnosisClean.length < MIN_DIAGNOSIS_LEN) return;
    try {
      await saveImpression.mutateAsync(buildPayload(false));
      setDirty(false);
      setDraftSavedAt(new Date());
    } catch {
      // Silent autosave — pharmacist can still Save draft manually
    }
  }, [isReadOnly, diagnosisClean, buildPayload, saveImpression]);

  useWizardBeforeLeave(async () => {
    if (!dirty) return;
    await persistDraft();
  });

  const appliedServerKey = useRef<string | null>(null);
  useEffect(() => {
    const key = [
      existing?.workingDiagnosisText ?? '',
      existing?.workingDiagnosisCode ?? '',
      existing?.diagnosticCertainty ?? '',
      existing?.assessmentSummary ?? '',
      existing?.assessmentSummarySource ?? '',
    ].join('\0');
    if (appliedServerKey.current === key) return;
    if (dirty && appliedServerKey.current != null) return;
    appliedServerKey.current = key;
    setDiagnosis(existing?.workingDiagnosisText?.trim() ?? '');
    setDiagnosisCode(existing?.workingDiagnosisCode ?? null);
    setDiagnosisSystem(existing?.workingDiagnosisSystem ?? null);
    setCertainty((existing?.diagnosticCertainty as DiagnosticCertainty) ?? null);
    setSummary(existing?.assessmentSummary ?? '');
    setSummarySource(existing?.assessmentSummarySource ?? 'PHARMACIST');
    setAiReviewRequired(existing?.assessmentSummarySource === 'AI_DRAFT');
  }, [
    dirty,
    existing?.workingDiagnosisText,
    existing?.workingDiagnosisCode,
    existing?.workingDiagnosisSystem,
    existing?.diagnosticCertainty,
    existing?.assessmentSummary,
    existing?.assessmentSummarySource,
  ]);

  useEffect(() => {
    if (!dirty || isReadOnly) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistDraft();
    }, 1100);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, diagnosis, certainty, summary, summarySource, isReadOnly, persistDraft]);

  useEffect(
    () => () => {
      if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
    },
    [],
  );

  const handleSaveDraft = async () => {
    if (diagnosisClean.length < MIN_DIAGNOSIS_LEN) {
      toast.error('Enter a working diagnosis (at least 3 characters) to save a draft');
      return;
    }
    try {
      await saveImpression.mutateAsync(buildPayload(false));
      setDirty(false);
      setDraftSavedAt(new Date());
      toast.success('Draft saved');
    } catch (e) {
      toastError(e, 'Could not save draft');
    }
  };

  const handleConfirm = async () => {
    if (!impressionValid || !certainty) {
      toast.error('Enter diagnosis, certainty, and assessment summary before continuing');
      return;
    }
    try {
      const sourceOnConfirm =
        summarySource === 'AI_DRAFT'
          ? 'AI_ACCEPTED'
          : summarySource === 'AI_EDITED'
            ? 'AI_EDITED'
            : 'PHARMACIST';
      await saveImpression.mutateAsync({
        ...buildPayload(true),
        diagnosticCertainty: certainty,
        assessmentSummarySource: sourceOnConfirm,
      });
      setAiReviewRequired(false);
      toast.success('Clinical impression confirmed');
      onNext();
    } catch (e) {
      toastError(e, 'Could not confirm clinical impression');
    }
  };

  const runGenerate = async () => {
    setAiFailed(false);
    try {
      if (diagnosisClean.length >= MIN_DIAGNOSIS_LEN && certainty) {
        await saveImpression.mutateAsync({
          ...buildPayload(false),
          diagnosticCertainty: certainty,
          assessmentSummary:
            summaryTrim.length >= MIN_SUMMARY_LEN
              ? summaryTrim
              : 'Draft pending pharmacist review.',
          assessmentSummarySource: 'PHARMACIST',
        });
      }
      const res = await generateSummary.mutateAsync({
        workingDiagnosisText: diagnosisClean,
        diagnosticCertainty: certainty ?? undefined,
      });
      setSummary(res.summary);
      setSummarySource('AI_DRAFT');
      setAiReviewRequired(true);
      setShowReplaceConfirm(false);
      markDirty();
      toast.message(
        res.label || 'Draft — review and edit before continuing',
      );
    } catch (e) {
      setAiFailed(true);
      toastError(
        e,
        'Drafting is temporarily unavailable. You can enter the assessment summary manually.',
      );
    }
  };

  const handleDraftAi = () => {
    if (!canDraftAi) {
      if (!certainty) toast.error('Select diagnostic certainty before drafting the summary');
      else if (diagnosisClean.length < MIN_DIAGNOSIS_LEN) {
        toast.error('Enter a working diagnosis before drafting the summary');
      } else {
        toast.error('Add a presenting concern or notes before drafting the summary');
      }
      return;
    }
    if (summaryTrim.length >= MIN_SUMMARY_LEN) {
      setShowReplaceConfirm(true);
      return;
    }
    void runGenerate();
  };

  const selectSuggestion = (value: string) => {
    setDiagnosis(value);
    setDiagnosisCode(null);
    setDiagnosisSystem('LOCAL');
    setSuggestOpen(false);
    markDirty();
  };

  const busy = saveImpression.isPending || generateSummary.isPending;

  if (isReadOnly) {
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col pb-10">
        <PageHeader />
        <div className="mt-5 rounded-2xl border border-[color:var(--consult-card-border)] bg-card px-6 py-5 text-sm text-muted-foreground">
          This consultation is finalized. Clinical impression is read-only.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col pb-12">
      <PageHeader />

      {/* Main form card — matches mock composition */}
      <section
        className={cn(
          'mt-5 overflow-visible rounded-2xl border border-[color:var(--consult-card-border)] bg-card',
          'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        )}
      >
        <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-7">
          <h2 className="m-0 text-[18px] font-bold tracking-[-0.01em] text-foreground">
            Clinical Impression
          </h2>

          {/* 1. Working diagnosis */}
          <div>
            <label
              htmlFor="cj-working-diagnosis"
              className="mb-2 block text-[13px] font-semibold text-foreground"
            >
              Working diagnosis or clinical Impression
            </label>
            <div className="relative">
              <div
                className={cn(
                  'group relative flex h-[46px] items-center rounded-[10px]',
                  'border border-[color:var(--consult-card-border)] bg-background',
                  'transition-[border-color,box-shadow] duration-150',
                  'focus-within:border-primary/50 focus-within:ring-[3px] focus-within:ring-primary/12',
                )}
              >
                <Search
                  className="ml-3.5 h-[15px] w-[15px] shrink-0 text-muted-foreground/80"
                  aria-hidden
                />
                <input
                  id="cj-working-diagnosis"
                  ref={inputRef}
                  value={diagnosis}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, MAX_DIAGNOSIS_LEN);
                    startTransition(() => {
                      setDiagnosis(next);
                      setDiagnosisCode(null);
                      setDiagnosisSystem(null);
                      setSuggestOpen(true);
                      markDirty();
                    });
                  }}
                  onFocus={() => {
                    if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
                    setSuggestOpen(true);
                  }}
                  onBlur={() => {
                    blurCloseTimer.current = setTimeout(() => setSuggestOpen(false), 120);
                  }}
                  placeholder="Enter the condition or clinical impression being assessed…"
                  maxLength={MAX_DIAGNOSIS_LEN}
                  autoComplete="off"
                  spellCheck={false}
                  aria-autocomplete="list"
                  aria-expanded={suggestOpen && filteredSuggestions.length > 0}
                  aria-controls="cj-diagnosis-suggestions"
                  className={cn(
                    'h-full w-full border-0 bg-transparent pl-2.5 text-[14.5px] font-medium text-foreground',
                    'shadow-none outline-none placeholder:font-normal placeholder:text-muted-foreground/50',
                    diagnosis.trim() ? 'pr-10' : 'pr-3.5',
                  )}
                />
                {diagnosis.trim() ? (
                  <button
                    type="button"
                    aria-label="Clear diagnosis"
                    onClick={() => {
                      setDiagnosis('');
                      setDiagnosisCode(null);
                      setDiagnosisSystem(null);
                      markDirty();
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      'absolute right-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full',
                      'text-muted-foreground/70 transition-colors',
                      'hover:bg-muted hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    )}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                ) : null}
              </div>

              {suggestOpen && filteredSuggestions.length > 0 && (
                <ul
                  id="cj-diagnosis-suggestions"
                  role="listbox"
                  className={cn(
                    'absolute z-30 mt-1.5 max-h-52 w-full overflow-auto rounded-[10px]',
                    'border border-[color:var(--consult-card-border)] bg-card py-1',
                    'shadow-[0_8px_24px_rgba(15,23,42,0.08)]',
                  )}
                >
                  {filteredSuggestions.map((s) => (
                    <li key={s} role="option" aria-selected={diagnosis === s}>
                      <button
                        type="button"
                        className="flex w-full px-3.5 py-2.5 text-left text-[14px] text-foreground transition-colors hover:bg-primary/[0.06]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(s)}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 2. Diagnostic certainty — connected segmented control */}
          <div>
            <p
              id="cj-certainty-label"
              className="mb-2.5 block text-[13px] font-semibold text-foreground"
            >
              Diagnostic certainty
            </p>
            <div
              role="radiogroup"
              aria-labelledby="cj-certainty-label"
              className={cn(
                'inline-flex w-full max-w-md overflow-hidden rounded-[10px]',
                'border border-[color:var(--consult-card-border)] bg-background',
              )}
            >
              {CERTAINTY_OPTIONS.map((opt, idx) => {
                const selected = certainty === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setCertainty(opt.value);
                      markDirty();
                    }}
                    className={cn(
                      'relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5',
                      'text-[13.5px] font-semibold transition-colors duration-150',
                      'focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/35',
                      idx > 0 && 'border-l border-[color:var(--consult-card-border)]',
                      selected
                        ? 'bg-primary/[0.07] text-primary'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    )}
                  >
                    {opt.label}
                    {selected ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-primary"
                        strokeWidth={2.75}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Assessment summary */}
          <div>
            <label
              htmlFor="cj-assessment-summary"
              className="block text-[13px] font-semibold text-foreground"
            >
              Assessment summary
            </label>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Include key findings supporting the clinical impression, relevant
              negative findings, and previous treatment response.
            </p>

            <Textarea
              id="cj-assessment-summary"
              value={summary}
              onChange={(e) => {
                const next = e.target.value.slice(0, MAX_SUMMARY_LEN);
                startTransition(() => {
                  setSummary(next);
                  if (
                    summarySource === 'AI_DRAFT' ||
                    summarySource === 'AI_ACCEPTED'
                  ) {
                    setSummarySource('AI_EDITED');
                    setAiReviewRequired(false);
                  } else if (summarySource !== 'AI_EDITED') {
                    setSummarySource('PHARMACIST');
                  }
                  markDirty();
                });
              }}
              rows={5}
              maxLength={MAX_SUMMARY_LEN}
              placeholder="Summarize the relevant clinical findings and why this impression is suspected…"
              className={cn(
                'mt-3 min-h-[148px] resize-y rounded-[10px]',
                'border-[color:var(--consult-card-border)] bg-background',
                'px-3.5 py-3 text-[14.5px] leading-[1.55] shadow-none',
                'focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-primary/12',
              )}
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDraftAi}
                disabled={!canDraftAi}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-primary/45',
                  'bg-background px-3.5 text-[13px] font-semibold text-primary',
                  'transition-colors hover:bg-primary/[0.05]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  'disabled:pointer-events-none disabled:opacity-45',
                )}
              >
                {generateSummary.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {summarySource === 'AI_DRAFT' || summarySource === 'AI_EDITED'
                  ? 'Regenerate draft'
                  : 'Draft summary'}
              </button>

              {generateSummary.isPending ? (
                <span className="text-[12.5px] font-medium text-primary">
                  Drafting summary…
                </span>
              ) : null}
            </div>

            {aiReviewRequired && !generateSummary.isPending ? (
              <p className="mt-2.5 text-[12.5px] font-medium text-primary">
                Draft — review and edit before continuing.
              </p>
            ) : null}

            {aiFailed ? (
              <p className="mt-2.5 text-[12.5px] text-amber-800">
                Drafting is temporarily unavailable. You can enter the assessment
                summary manually.
              </p>
            ) : null}

            {showReplaceConfirm ? (
              <div className="mt-3 rounded-[10px] border border-amber-200/90 bg-amber-50/90 px-4 py-3.5">
                <p className="text-[13.5px] font-semibold text-amber-950">
                  Replace the current assessment summary with a new draft?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ClinicalPrimaryButton
                    size="md"
                    onClick={() => void runGenerate()}
                    loading={generateSummary.isPending}
                  >
                    Replace draft
                  </ClinicalPrimaryButton>
                  <ClinicalSecondaryButton
                    size="md"
                    onClick={() => setShowReplaceConfirm(false)}
                  >
                    Cancel
                  </ClinicalSecondaryButton>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Footer — previous step (left) · Continue (right) */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <ClinicalSecondaryButton
            onClick={onBack}
            size="md"
            className="h-11 min-w-[7.5rem] border-primary/50 text-primary hover:bg-primary/[0.05] hover:text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLabel}
          </ClinicalSecondaryButton>
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={busy || diagnosisClean.length < MIN_DIAGNOSIS_LEN}
            className={cn(
              'text-[14px] font-semibold text-primary transition-opacity',
              'hover:opacity-80 focus-visible:outline-none focus-visible:underline',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            {saveImpression.isPending && !impressionValid
              ? 'Saving…'
              : draftSavedAt && !dirty
                ? 'Draft saved'
                : 'Save draft'}
          </button>
        </div>

        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <ClinicalPrimaryButton
            onClick={() => void handleConfirm()}
            loading={saveImpression.isPending && impressionValid}
            disabled={!impressionValid || busy}
            size="md"
            className="h-11 min-w-[15.5rem] rounded-[10px] px-5 text-[14.5px]"
          >
            Continue to Patient Information
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </ClinicalPrimaryButton>
          {nextHint ? (
            <p className="text-center text-[12px] text-muted-foreground sm:text-right">
              {nextHint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <header className="flex flex-wrap items-center gap-2.5">
      <h1 className="m-0 text-[28px] font-bold leading-none tracking-[-0.025em] text-foreground sm:text-[32px]">
        Clinical Impression
      </h1>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full',
          'border border-primary/40 bg-primary/[0.06]',
          'px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] text-primary',
        )}
      >
        <Scale className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        Clinical Judgment
      </span>
    </header>
  );
}
