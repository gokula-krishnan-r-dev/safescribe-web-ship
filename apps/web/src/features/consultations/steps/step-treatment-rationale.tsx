'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import type { Consultation, TreatmentRationale, TreatmentRecommendation } from '../types';
import {
  useTreatmentRationale,
  useSaveTreatmentRationale,
  useGenerateRationale,
  useConfirmRationale,
  useGenerateDocumentation,
} from '../hooks';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '../clinical-ui';
import {
  clearDocumentationPrefetch,
  startDocumentationPrefetch,
} from '../documents/documentation-prefetch';
import type { DocumentationPackage } from '../documents/types';
import {
  ALTERNATIVE_CATEGORIES,
  ALTERNATIVE_CATEGORY_LABELS,
  type AlternativeCategory,
} from '@safescript/shared';

interface Props {
  consultation: Consultation;
  onNext: () => void;
  onBack: () => void;
  backLabel?: string;
  onEditTreatment?: () => void;
}

const WORD_LIMIT_SINGLE = 120;
const WORD_LIMIT_MULTI = 160;

const OPTION_CATEGORIES: { value: AlternativeCategory; label: string }[] = [
  { value: 'WATCHFUL_WAITING', label: 'No medication / watchful waiting' },
  { value: 'NON_DRUG', label: 'Non-drug or supportive care' },
  {
    value: 'OTC_MODIFICATION',
    label: 'Continue or modify current non-prescription treatment',
  },
  { value: 'ALTERNATIVE_PRESCRIPTION', label: 'Another prescription treatment' },
  { value: 'INVESTIGATION', label: 'Further assessment or investigation' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'OTHER', label: 'Other' },
];

const NOT_SELECTED_REASONS = [
  'Previously ineffective',
  'Contraindicated or unsuitable',
  'Less appropriate for this patient',
  'Selected treatment better fits the documented goal',
  'Less convenient or more difficult to follow',
  'Patient declined or preferred another option',
  'Additional investigation not required at this time',
  'Referral not required at this time',
  'Other',
] as const;

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function formatTreatmentLine(t: TreatmentRecommendation): string {
  const name = t.medicationName || t.genericName || 'Treatment';
  const parts = [name];
  if (t.dose) parts.push(t.dose);
  if (t.route) parts.push(t.route);
  if (t.frequency) parts.push(t.frequency);
  if (t.duration) parts.push(`for ${t.duration}`);
  return parts.join(' ');
}

/**
 * Treatment Rationale v1.0 — single combined editor (Clinical Judgment only).
 * Supersedes the four-accordion design.
 */
export function StepTreatmentRationale({
  consultation,
  onNext,
  onBack,
  backLabel = 'Back',
  onEditTreatment,
}: Props) {
  const { data: remote, isLoading, error: loadError } = useTreatmentRationale(
    consultation.id,
    true,
  );
  const saveRationale = useSaveTreatmentRationale(consultation.id);
  const generate = useGenerateRationale(consultation.id);
  const confirm = useConfirmRationale(consultation.id);
  const generateDocumentation = useGenerateDocumentation(consultation.id);

  const seed =
    (remote as TreatmentRationale | undefined) ??
    consultation.treatmentRationale ??
    null;

  const [rationaleText, setRationaleText] = useState('');
  const [contentSource, setContentSource] = useState<string>('PHARMACIST');
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('DRAFT');
  const [hydrated, setHydrated] = useState(false);
  const [showInfoUsed, setShowInfoUsed] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Optional alternative card
  const [showAltCard, setShowAltCard] = useState(false);
  const [altCategory, setAltCategory] = useState<AlternativeCategory | ''>('');
  const [altDetails, setAltDetails] = useState('');
  const [altReason, setAltReason] = useState('');
  const [altNote, setAltNote] = useState('');
  const [savedAlt, setSavedAlt] = useState<{
    category: AlternativeCategory;
    details: string;
    reason: string;
    note: string;
  } | null>(null);

  const plan = consultation.treatmentPlan;
  const treatments = useMemo(() => {
    const selected =
      plan?.selectedTreatments ??
      plan?.selectedItemsSnapshot ??
      plan?.recommendedTreatments ??
      [];
    return (selected as TreatmentRecommendation[]).filter(
      (t) => t?.medicationName || t?.genericName,
    );
  }, [plan]);

  const indication =
    plan?.intendedIndication?.trim() ||
    consultation.clinicalJudgmentAssessment?.workingDiagnosisText ||
    '—';
  const goal = plan?.treatmentGoal?.trim() || '';
  const assessment = consultation.clinicalJudgmentAssessment;

  useEffect(() => {
    if (!seed || hydrated) return;
    // Prefer selection rationale as the combined field; fall back to reason
    const combined =
      seed.selectionRationale?.trim() ||
      seed.reasonForPrescribing?.trim() ||
      '';
    setRationaleText(combined);
    setContentSource(seed.rationaleSource ?? seed.reasonSource ?? 'PHARMACIST');
    setConfirmed(Boolean(seed.selectionConfirmed && seed.reasonConfirmed));
    setStatus(seed.status ?? 'DRAFT');
    const found = seed.alternatives?.find((a) => a.selected);
    if (found) {
      setSavedAlt({
        category: found.category as AlternativeCategory,
        details: found.details ?? '',
        reason: found.notSelectedReason ?? '',
        note: found.details ?? '',
      });
    }
    setHydrated(true);
  }, [seed, hydrated]);

  const wordLimit = treatments.length > 1 ? WORD_LIMIT_MULTI : WORD_LIMIT_SINGLE;
  const wordCount = countWords(rationaleText);
  const overLimit = wordCount > wordLimit;
  const hasAiDraft =
    contentSource === 'AI_DRAFT' ||
    contentSource === 'AI_EDITED' ||
    contentSource === 'AI_ACCEPTED';
  const isStale = status === 'STALE';

  const aiStatusLabel = useMemo(() => {
    if (isStale) return 'Outdated — treatment or clinical information changed. Review again.';
    if (confirmed && status === 'CONFIRMED') return 'Confirmed by pharmacist';
    if (generate.isPending) return 'Drafting from confirmed consultation information…';
    if (contentSource === 'AI_EDITED') return 'Assisted draft — edited by pharmacist';
    if (contentSource === 'AI_DRAFT' || contentSource === 'AI_ACCEPTED') {
      return 'Draft · Review required';
    }
    if (!rationaleText.trim()) return 'Draft assistance is optional';
    return 'Pharmacist-authored';
  }, [isStale, confirmed, status, generate.isPending, contentSource, rationaleText]);

  const canConfirm =
    rationaleText.trim().length >= 20 &&
    !overLimit &&
    confirmed &&
    !isStale &&
    (!showAltCard || Boolean(savedAlt)) &&
    !generate.isPending &&
    !confirm.isPending;

  const persist = async (partial?: Record<string, unknown>) => {
    const alternatives = savedAlt
      ? [
          {
            category: savedAlt.category,
            selected: true,
            details: savedAlt.details || savedAlt.note || undefined,
            notSelectedReason: savedAlt.reason || undefined,
          },
        ]
      : Object.values(ALTERNATIVE_CATEGORIES).map((category) => ({
          category,
          selected: false,
        }));

    return saveRationale.mutateAsync({
      reasonForPrescribing: rationaleText.trim(),
      selectionRationale: rationaleText.trim(),
      safetyMitigationSummary:
        'Safety review complete. No unresolved blocking medication-safety concerns remaining for the selected treatment.',
      reasonSource: contentSource,
      rationaleSource: contentSource,
      safetySummarySource: 'SYSTEM',
      reasonConfirmed: confirmed,
      selectionConfirmed: confirmed,
      alternativesConfirmed: true,
      safetyConfirmed: true,
      noAlternativesDocumented: !savedAlt,
      alternatives,
      ...partial,
    });
  };

  const handleTextChange = (value: string) => {
    setRationaleText(value);
    setConfirmed(false);
    if (contentSource === 'AI_DRAFT' || contentSource === 'AI_ACCEPTED') {
      setContentSource('AI_EDITED');
    } else if (contentSource !== 'AI_EDITED') {
      setContentSource('PHARMACIST');
    }
    setStatus('REVIEW_REQUIRED');
  };

  const handleGenerate = async () => {
    try {
      const res = (await generate.mutateAsync({ section: 'ALL' })) as {
        reasonForPrescribing?: string;
        selectionRationale?: string;
        safetyMitigationSummary?: string;
      };
      const draft =
        res.selectionRationale?.trim() ||
        res.reasonForPrescribing?.trim() ||
        '';
      if (!draft) {
        toast.error('Could not generate a draft — enter the rationale manually');
        return;
      }
      setRationaleText(draft);
      setContentSource('AI_DRAFT');
      setConfirmed(false);
      setEditing(false);
      setStatus('REVIEW_REQUIRED');
      setShowRegenConfirm(false);
      toast.message('Draft ready — review required');
    } catch (e) {
      toastError(e, 'Could not generate rationale — you can enter it manually');
    }
  };

  const handleAddAlternative = () => {
    if (!altCategory) {
      toast.error('Select an option considered');
      return;
    }
    if (!altReason) {
      toast.error('Select why it was not selected');
      return;
    }
    if (
      (altCategory === 'ALTERNATIVE_PRESCRIPTION' ||
        altCategory === 'OTHER') &&
      !altDetails.trim()
    ) {
      toast.error('Enter option details');
      return;
    }
    if (altReason === 'Other' && !altNote.trim()) {
      toast.error('Enter reason details');
      return;
    }

    const optionLabel =
      altDetails.trim() ||
      OPTION_CATEGORIES.find((c) => c.value === altCategory)?.label ||
      'Another option';
    const sentence = `${optionLabel} was considered but was not selected because ${altReason.toLowerCase()}.`;

    setSavedAlt({
      category: altCategory,
      details: altDetails.trim(),
      reason: altReason,
      note: altNote.trim(),
    });

    // Append to rationale if not already present
    setRationaleText((prev) => {
      const base = prev.trim();
      if (base.includes('was considered but was not selected')) {
        return base;
      }
      return base ? `${base} ${sentence}` : sentence;
    });
    setConfirmed(false);
    setContentSource((s) =>
      s === 'AI_DRAFT' || s === 'AI_ACCEPTED' ? 'AI_EDITED' : s === 'PHARMACIST' ? 'PHARMACIST' : s,
    );
    setShowAltCard(false);
    setStatus('REVIEW_REQUIRED');
    toast.success('Option added to rationale');
  };

  const handleSuggestAltWording = () => {
    if (!altCategory || !altReason) {
      toast.error('Select option and reason first');
      return;
    }
    const optionLabel =
      altDetails.trim() ||
      OPTION_CATEGORIES.find((c) => c.value === altCategory)?.label ||
      'Another option';
    setAltNote(
      `${optionLabel} was considered but was not selected because ${altReason.toLowerCase()}.`,
    );
  };

  const handleConfirm = async () => {
    if (!canConfirm) {
      toast.error('Review and confirm the rationale before continuing');
      return;
    }
    try {
      const sourceOnConfirm =
        contentSource === 'AI_DRAFT'
          ? 'AI_ACCEPTED'
          : contentSource === 'AI_EDITED'
            ? 'AI_EDITED'
            : 'PHARMACIST';
      await persist({
        reasonConfirmed: true,
        selectionConfirmed: true,
        rationaleSource: sourceOnConfirm,
        reasonSource: sourceOnConfirm,
      });
      await confirm.mutateAsync();
      toast.success('Rationale confirmed');
      clearDocumentationPrefetch(consultation.id);
      void startDocumentationPrefetch(consultation.id, async () => {
        const result = await generateDocumentation.mutateAsync({
          requestedDocumentTypes: [
            'consultation_note',
            'prescriber_communication',
            'patient_care_summary',
            'prescription',
          ],
          force: false,
        });
        return result as DocumentationPackage;
      }).catch(() => undefined);
      onNext();
    } catch (e) {
      toastError(e, 'Could not confirm rationale');
    }
  };

  if (isLoading && !hydrated) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Loading treatment rationale…
      </div>
    );
  }

  if (loadError && !hydrated) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <div>
          <p className="font-semibold text-foreground">Treatment rationale not available yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Complete assessment, treatment selection, and the safety check before documenting
            rationale.
          </p>
        </div>
        <ClinicalSecondaryButton onClick={onBack} size="md" className="mt-2">
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </ClinicalSecondaryButton>
      </div>
    );
  }

  const primaryTreatment = treatments[0];
  const treatmentDisplay = primaryTreatment
    ? formatTreatmentLine(primaryTreatment)
    : 'No treatment selected';

  return (
    <div className="mx-auto flex w-full flex-col pb-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[34px]">
            Treatment Rationale
          </h1>
          <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-[3px] text-[11px] font-semibold text-amber-900">
            Clinical Judgment
          </span>
        </div>
        <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Review and confirm why the selected treatment is appropriate for this
          patient.
        </p>
      </header>

      {isStale && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-[13.5px] text-amber-950">
            Outdated — treatment or clinical information changed. Review the
            rationale again before continuing.
          </p>
        </div>
      )}

      {/* Confirmed treatment */}
      <section
        className={cn(
          'mb-5 overflow-hidden rounded-2xl border border-[color:var(--consult-card-border)] bg-card',
          'shadow-[var(--consult-card-shadow)]',
        )}
      >
        <div className="flex flex-col gap-3 border-b border-[color:var(--consult-divider)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Confirmed treatment
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[12px] text-muted-foreground">Treatment</p>
                <p className="mt-0.5 text-[14.5px] font-semibold text-foreground">
                  {treatmentDisplay}
                </p>
              </div>
              <div>
                <p className="text-[12px] text-muted-foreground">Indication</p>
                <p className="mt-0.5 text-[14.5px] font-semibold text-foreground">
                  {indication}
                </p>
              </div>
            </div>
            {goal ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Goal: <span className="text-foreground">{goal}</span>
              </p>
            ) : null}
            <p className="mt-1 text-[12px] text-muted-foreground">
              Treatment source: Pharmacist selected
            </p>
            {treatments.length > 1 && (
              <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
                {treatments.slice(1).map((t, i) => (
                  <li key={i}>+ {formatTreatmentLine(t)}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Safety review complete
            </span>
            <button
              type="button"
              onClick={() => onEditTreatment?.() ?? onBack()}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit treatment
            </button>
          </div>
        </div>
        <p className="px-5 py-2.5 text-[12.5px] text-muted-foreground sm:px-6">
          No unresolved blocking medication-safety concerns
        </p>
      </section>

      {/* Rationale editor */}
      <section
        className={cn(
          'overflow-hidden rounded-2xl border border-[color:var(--consult-card-border)] bg-card',
          'shadow-[var(--consult-card-shadow)]',
        )}
      >
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-[16px] font-bold text-foreground">
              Why was this treatment selected?
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              SafeScribe can draft a patient-specific rationale from the confirmed
              assessment, treatment and safety findings.
            </p>
          </div>

          {!rationaleText.trim() && !generate.isPending ? (
            <div className="flex flex-wrap items-center gap-3">
              <ClinicalSecondaryButton
                onClick={() => void handleGenerate()}
                disabled={generate.isPending || treatments.length === 0}
                size="md"
                className="h-10 border-primary/45 text-primary"
              >
                <Sparkles className="h-4 w-4" />
                Generate draft
              </ClinicalSecondaryButton>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[13.5px] font-semibold text-primary hover:underline"
                >
                  Or write manually
                </button>
              ) : null}
            </div>
          ) : null}

          {(rationaleText.trim() || generate.isPending || editing) && (
            <div
              className={cn(
                'rounded-xl border px-4 py-4',
                hasAiDraft
                  ? 'border-primary/25 bg-primary/[0.03]'
                  : 'border-[color:var(--consult-card-border)] bg-background',
              )}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[12.5px] font-semibold',
                    isStale
                      ? 'text-amber-700'
                      : hasAiDraft
                        ? 'text-primary'
                        : 'text-muted-foreground',
                  )}
                >
                  {hasAiDraft ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {aiStatusLabel}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {hasAiDraft && (
                    <button
                      type="button"
                      onClick={() => setShowRegenConfirm(true)}
                      disabled={generate.isPending}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          generate.isPending && 'animate-spin',
                        )}
                      />
                      Regenerate
                    </button>
                  )}
                </div>
              </div>

              {editing || !hasAiDraft ? (
                <Textarea
                  value={rationaleText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  rows={6}
                  className="min-h-[180px] resize-y rounded-xl border-[color:var(--consult-card-border)] text-[14.5px] leading-relaxed"
                  placeholder="Explain why this treatment is appropriate based on the working diagnosis, assessment findings, treatment goal, and completed safety review…"
                />
              ) : (
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground">
                  {generate.isPending ? (
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Drafting…
                    </span>
                  ) : (
                    rationaleText
                  )}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setShowInfoUsed((v) => !v)}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <Info className="h-3.5 w-3.5" />
                  View information used
                </button>
                <span className={cn(overLimit && 'font-semibold text-destructive')}>
                  {wordCount} / {wordLimit} words
                </span>
              </div>

              {showInfoUsed && (
                <ul className="mt-3 space-y-1 rounded-lg bg-muted/40 px-3 py-2.5 text-[12.5px] text-muted-foreground">
                  <li>
                    Working diagnosis:{' '}
                    {assessment?.diagnosticCertainty
                      ? `${assessment.diagnosticCertainty.charAt(0)}${assessment.diagnosticCertainty.slice(1).toLowerCase()} `
                      : ''}
                    {assessment?.workingDiagnosisText ?? '—'}
                  </li>
                  <li>Treatment: {treatmentDisplay}</li>
                  <li>Indication: {indication}</li>
                  {goal ? <li>Treatment goal: {goal}</li> : null}
                  <li>
                    Safety result: No unresolved blocking concerns
                  </li>
                </ul>
              )}
            </div>
          )}

          {showRegenConfirm && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3.5">
              <p className="text-[14px] font-semibold text-amber-950">
                Replace the current draft?
              </p>
              <p className="mt-1 text-[13px] text-amber-900/90">
                Your current wording will remain available in version history until
                this consultation is deleted.
              </p>
              <div className="mt-3 flex gap-2">
                <ClinicalPrimaryButton
                  size="md"
                  onClick={() => void handleGenerate()}
                  loading={generate.isPending}
                >
                  Regenerate and replace
                </ClinicalPrimaryButton>
                <ClinicalSecondaryButton
                  size="md"
                  onClick={() => setShowRegenConfirm(false)}
                >
                  Cancel
                </ClinicalSecondaryButton>
              </div>
            </div>
          )}

          {/* Optional alternative */}
          {!showAltCard && !savedAlt && (
            <button
              type="button"
              onClick={() => setShowAltCard(true)}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline"
            >
              + Document another option considered
            </button>
          )}

          {savedAlt && !showAltCard && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--consult-card-border)] bg-muted/20 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  Another option documented
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {savedAlt.details ||
                    ALTERNATIVE_CATEGORY_LABELS[savedAlt.category]}{' '}
                  — {savedAlt.reason}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAltCategory(savedAlt.category);
                    setAltDetails(savedAlt.details);
                    setAltReason(savedAlt.reason);
                    setAltNote(savedAlt.note);
                    setShowAltCard(true);
                  }}
                  className="text-[12.5px] font-semibold text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSavedAlt(null);
                    setConfirmed(false);
                  }}
                  className="text-[12.5px] font-semibold text-destructive hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {showAltCard && (
            <div className="rounded-xl border border-[color:var(--consult-card-border)] bg-background px-4 py-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-[14px] font-bold text-foreground">
                    <ChevronDown className="h-4 w-4" />
                    Another option considered
                  </p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Document an option that was actually considered for this patient.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setShowAltCard(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold">
                    Option considered <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      value={altCategory}
                      onChange={(e) =>
                        setAltCategory(e.target.value as AlternativeCategory | '')
                      }
                      className="h-10 w-full appearance-none rounded-lg border border-[color:var(--consult-card-border)] bg-card pl-9 pr-3 text-[14px]"
                    >
                      <option value="">Select an option…</option>
                      {OPTION_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(altCategory === 'ALTERNATIVE_PRESCRIPTION' ||
                    altCategory === 'OTHER') && (
                    <Input
                      className="mt-2"
                      value={altDetails}
                      onChange={(e) => setAltDetails(e.target.value)}
                      placeholder="e.g. Topical acyclovir"
                    />
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold">
                    Why was it not selected?{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={altReason}
                    onChange={(e) => setAltReason(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[color:var(--consult-card-border)] bg-card px-3 text-[14px]"
                  >
                    <option value="">Select a reason…</option>
                    {NOT_SELECTED_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold">
                    Optional clinical note
                  </label>
                  <Textarea
                    value={altNote}
                    onChange={(e) => setAltNote(e.target.value)}
                    rows={3}
                    placeholder="Brief clinical note…"
                    className="rounded-xl text-[14px]"
                  />
                  <button
                    type="button"
                    onClick={handleSuggestAltWording}
                    className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Suggest wording
                  </button>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <ClinicalSecondaryButton
                    size="md"
                    onClick={() => setShowAltCard(false)}
                  >
                    Cancel
                  </ClinicalSecondaryButton>
                  <ClinicalPrimaryButton size="md" onClick={handleAddAlternative}>
                    Add to rationale
                  </ClinicalPrimaryButton>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="mt-4 text-[12.5px] text-muted-foreground">
        Based on: clinical impression, patient information, selected treatment and
        confirmed safety review.
      </p>

      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
        />
        <span className="text-[14px] font-medium leading-snug text-foreground">
          I have reviewed this rationale and confirm that it accurately reflects
          my clinical decision. <span className="text-destructive">*</span>
        </span>
      </label>

      <div
        className={cn(
          'mt-8 flex flex-col gap-3 border-t border-[color:var(--consult-divider)] pt-5',
          'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <ClinicalSecondaryButton
          onClick={onBack}
          size="md"
          className="h-11 border-primary/45 text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </ClinicalSecondaryButton>

        <ClinicalPrimaryButton
          onClick={() => void handleConfirm()}
          loading={confirm.isPending || saveRationale.isPending}
          disabled={!canConfirm}
          size="md"
          className="h-11 min-w-[16rem] px-5"
        >
          Confirm Rationale & Continue to Documents
        </ClinicalPrimaryButton>
      </div>
    </div>
  );
}
