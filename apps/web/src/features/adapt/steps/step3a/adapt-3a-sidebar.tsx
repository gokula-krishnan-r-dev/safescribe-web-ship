'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Loader2, Pencil, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type {
  AdaptationType,
  AdaptStepTwoOptionA,
  AdaptStepTwoOptionC,
} from '@safescript/shared';
import { useAdaptClinicalGuidance } from '@/features/adapt/hooks';

const GUIDANCE_TABS = [
  { id: 'key_points', label: 'Key points' },
  { id: 'comparative', label: 'Comparative options' },
  { id: 'monitoring', label: 'Monitoring' },
] as const;

type GuidanceTabId = (typeof GUIDANCE_TABS)[number]['id'];

/** Static fallback only when AI is unavailable — still adaptation-type aware. */
const FALLBACK_BY_TYPE: Record<
  string,
  { key_points: string[]; comparative: string[]; monitoring: string[] }
> = {
  therapeutic_substitution: {
    key_points: [
      'Confirm the adaptation reason (e.g. allergy vs intolerance) before selecting a replacement.',
      'Avoid agents with clinically relevant cross-reactivity when hypersensitivity is the driver.',
      'Document counselling on the new agent, expected onset, and when to seek help.',
    ],
    comparative: [
      'Compare candidates against indication coverage, interactions, and patient factors.',
      'Prefer options with clear monograph support for this patient population.',
      'Match dose intensity carefully when switching within a therapeutic class.',
    ],
    monitoring: [
      'Plan follow-up for the symptoms that prompted the switch.',
      'Monitor labs appropriate to the new agent when indicated.',
      'Advise when to contact the pharmacy or prescriber after the change.',
    ],
  },
  dose: {
    key_points: [
      'Confirm symptoms are dose-related before stepping down or up.',
      'Prefer the lowest effective dose that maintains therapeutic goals.',
      'Document monitoring and counselling for the adapted regimen.',
    ],
    comparative: [
      'Compare remaining strengths against guideline-supported options for this molecule.',
      'If dose change is insufficient, consider formulation or substitution pathways.',
    ],
    monitoring: [
      'Reassess clinical response after the dose change.',
      'Recheck labs per guideline interval when relevant.',
    ],
  },
  regimen: {
    key_points: [
      'Simplify schedules when missed doses are driving poor adherence.',
      'Confirm total daily dose remains appropriate after the frequency change.',
    ],
    comparative: [
      'Compare once-daily vs multi-dose schedules against adherence history.',
      'Consider extended-release options when clinically appropriate.',
    ],
    monitoring: [
      'Reassess adherence and symptom control within 2–4 weeks.',
      'Advise what to do if doses are still missed after simplification.',
    ],
  },
  default: {
    key_points: [
      'Ground the proposed adaptation in the documented reason and patient factors.',
      'Complete structured prescription fields so Step 3B safety checks can evaluate the regimen.',
    ],
    comparative: [
      'Compare the proposed change against leaving therapy unchanged.',
      'Consider interactions, organ function, and adherence implications.',
    ],
    monitoring: [
      'Define a clear follow-up plan for efficacy and tolerability.',
      'Counsel the patient on what to report after the adaptation.',
    ],
  },
};

function formatRecentLabs(step2C?: AdaptStepTwoOptionC): string | null {
  if (!step2C) return null;
  const fromExtracted = (step2C.extractedLabValues ?? [])
    .filter((lab) => lab.test?.trim() && lab.value?.trim())
    .slice(0, 3)
    .map((lab) => {
      const unit = lab.unit?.trim() ? ` ${lab.unit.trim()}` : '';
      return `${lab.test.trim()} ${lab.value.trim()}${unit}`;
    });
  if (fromExtracted.length > 0) return fromExtracted.join(' · ');
  const freeText = step2C.labValues?.trim();
  if (freeText) return freeText.length > 90 ? `${freeText.slice(0, 87)}…` : freeText;
  return null;
}

function formatAllergies(step2A?: AdaptStepTwoOptionA): string | null {
  if (!step2A) return null;
  if (step2A.background.allergiesNone) return 'None recorded';
  const entries = (step2A.background.allergyEntries ?? [])
    .map((a) => a.drug?.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;
  return entries.slice(0, 4).join(', ');
}

function fallbackBundle(adaptationType?: AdaptationType | null) {
  if (adaptationType && FALLBACK_BY_TYPE[adaptationType]) {
    return FALLBACK_BY_TYPE[adaptationType];
  }
  return FALLBACK_BY_TYPE.default;
}

export function Adapt3ASidebar({
  consultationId,
  step2A,
  step2C,
  adaptationType,
  onEditPatientContext,
}: {
  consultationId?: string;
  step2A?: AdaptStepTwoOptionA;
  step2C?: AdaptStepTwoOptionC;
  adaptationType?: AdaptationType | null;
  onEditPatientContext?: () => void;
}) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [tab, setTab] = useState<GuidanceTabId>('key_points');

  const guidanceQuery = useAdaptClinicalGuidance(consultationId, true);
  const guidance = guidanceQuery.data;
  const isAi = guidance?.source === 'ai';
  const isLoading = guidanceQuery.isLoading || guidanceQuery.isFetching;
  const isError = guidanceQuery.isError;
  const unavailable = guidance?.source === 'unavailable';

  const ageSex = useMemo(() => {
    const age = step2A?.demographics.age?.trim();
    const unit = step2A?.demographics.ageUnit?.trim();
    const sex = step2A?.demographics.sex?.trim();
    const agePart = age ? `${age}${unit ? ` ${unit}` : ''}` : '';
    if (agePart && sex) return `${agePart} · ${sex}`;
    if (agePart) return agePart;
    if (sex) return sex;
    return null;
  }, [step2A]);

  const conditionList = useMemo(() => {
    if (step2A?.background.conditionsNone) return [] as string[];
    return (step2A?.background.conditions ?? []).map((c) => c.trim()).filter(Boolean);
  }, [step2A]);

  const allergies = useMemo(() => formatAllergies(step2A), [step2A]);
  const recentLabs = useMemo(() => formatRecentLabs(step2C), [step2C]);

  const hasAnyContext = Boolean(
    ageSex ||
      conditionList.length > 0 ||
      step2A?.background.conditionsNone ||
      allergies ||
      recentLabs,
  );

  const fallback = useMemo(() => fallbackBundle(adaptationType), [adaptationType]);

  const guidancePoints = useMemo(() => {
    if (isAi && guidance) {
      if (tab === 'comparative') return guidance.comparativeOptions;
      if (tab === 'monitoring') return guidance.monitoring;
      return guidance.keyPoints;
    }
    if (tab === 'comparative') return fallback.comparative;
    if (tab === 'monitoring') return fallback.monitoring;
    return fallback.key_points;
  }, [isAi, guidance, tab, fallback]);

  const sidebarSummary = useMemo(() => {
    if (isLoading && !guidance) return null;
    if (isAi && guidance?.summary) return guidance.summary;
    if (unavailable || isError) {
      return (
        guidance?.unavailableReason ||
        'Case-specific AI guidance is temporarily unavailable. Static adaptation-type tips are shown instead.'
      );
    }
    return fallback.key_points[0] || 'Review clinical points for this adaptation type.';
  }, [isLoading, guidance, isAi, unavailable, isError, fallback]);

  const previewPoints = useMemo(() => {
    if (isAi && guidance?.keyPoints?.length) return guidance.keyPoints.slice(0, 2);
    return [];
  }, [isAi, guidance]);

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#102a43]">Patient context</h3>
          {onEditPatientContext ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditPatientContext}
              className="h-7 gap-1 px-2 text-xs font-semibold text-[#0F6F6B] hover:bg-[#F0FAF9]"
            >
              <Pencil className="h-3 w-3" aria-hidden />
              View patient assessment
            </Button>
          ) : null}
        </div>

        {!hasAnyContext ? (
          <p className="text-xs leading-relaxed text-[#627d98]">
            No additional patient context available.
          </p>
        ) : (
          <dl className="space-y-2.5 text-xs">
            {ageSex ? (
              <div>
                <dt className="font-medium text-[#829ab1]">Age / Sex</dt>
                <dd className="mt-0.5 font-medium text-[#102a43]">{ageSex}</dd>
              </div>
            ) : null}

            {step2A?.background.conditionsNone || conditionList.length > 0 ? (
              <div>
                <dt className="font-medium text-[#829ab1]">Relevant conditions</dt>
                <dd className="mt-1">
                  {step2A?.background.conditionsNone ? (
                    <span className="text-[#102a43]">None recorded</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {conditionList.map((condition) => (
                        <span
                          key={condition}
                          className="inline-flex rounded-full border border-[#b2dfdb] bg-[#e6f4f1] px-2 py-0.5 text-[10px] font-semibold text-[#0F6F6B]"
                        >
                          {condition}
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
            ) : null}

            {allergies ? (
              <div>
                <dt className="font-medium text-[#829ab1]">Allergies</dt>
                <dd className="mt-0.5 text-[#102a43]">{allergies}</dd>
              </div>
            ) : null}

            {recentLabs ? (
              <div>
                <dt className="font-medium text-[#829ab1]">Recent labs</dt>
                <dd className="mt-0.5 leading-relaxed text-[#102a43]">{recentLabs}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3FAF9] text-[#0F6F6B]">
              <BookOpen className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-semibold text-[#102a43]">Clinical guidance</h3>
                {isAi ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#eef8f7] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#0F6F6B]">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden />
                    AI
                  </span>
                ) : null}
              </div>
              {isAi && guidance?.caseFocus ? (
                <p className="mt-1 text-[11px] font-semibold leading-snug text-[#0F6F6B]">
                  {guidance.caseFocus}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void guidanceQuery.refetch()}
            disabled={isLoading}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#0F6F6B] hover:bg-[#F0FAF9] disabled:opacity-50"
            aria-label="Refresh clinical guidance"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>

        {isLoading && !guidance ? (
          <div className="mt-2 space-y-2 rounded-lg border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-3 py-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#334e68]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0F6F6B]" aria-hidden />
              Generating case-specific guidance…
            </div>
            <div className="space-y-1.5" aria-hidden>
              <div className="h-2.5 w-full animate-pulse rounded bg-[#e2eaed]" />
              <div className="h-2.5 w-11/12 animate-pulse rounded bg-[#e2eaed]" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-[#e2eaed]" />
            </div>
          </div>
        ) : (
          <>
            {(unavailable || isError) && !isAi ? (
              <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{sidebarSummary}</span>
              </div>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-[#627d98]">{sidebarSummary}</p>
            )}

            {previewPoints.length > 0 ? (
              <ul className="mt-2.5 space-y-1.5">
                {previewPoints.map((point) => (
                  <li key={point} className="flex gap-2 text-[11px] leading-snug text-[#486581]">
                    <span
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#0F6F6B]"
                      aria-hidden
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        <Button
          type="button"
          variant="outline"
          disabled={isLoading && !guidance && !isError && !unavailable}
          onClick={() => {
            setTab('key_points');
            setGuidanceOpen(true);
          }}
          className="mt-3 h-9 w-full rounded-lg border-[#d9e4e8] text-[13px] font-semibold text-[#0F6F6B] hover:bg-[#F3FAF9]"
        >
          View clinical guidance
        </Button>
        <p className="mt-2.5 text-[11px] leading-relaxed text-[#829ab1]">
          Safety and clinical appropriateness will be reviewed in Step 3B.
        </p>
      </section>

      <Dialog open={guidanceOpen} onOpenChange={setGuidanceOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogHeader className="space-y-1 border-b border-[#e2eaed] px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold text-[#102a43]">
              Clinical guidance
              {isAi ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#eef8f7] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#0F6F6B]">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  AI
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#627d98]">
              {isAi && guidance?.caseFocus
                ? guidance.caseFocus
                : 'Evidence-linked points for this case. Guidance supports judgment — it does not replace pharmacist decision-making.'}
            </DialogDescription>
          </DialogHeader>

          <div className="border-b border-[#e2eaed] px-5 pt-3">
            <div
              role="tablist"
              aria-label="Clinical guidance sections"
              className="flex gap-1 rounded-lg bg-[#f4f7f8] p-1"
            >
              {GUIDANCE_TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      active
                        ? 'bg-white text-[#0F6F6B] shadow-sm'
                        : 'text-[#627d98] hover:text-[#102a43]',
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading && guidancePoints.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#0F6F6B]" aria-hidden />
              <p className="text-xs font-medium text-[#334e68]">Loading guidance…</p>
            </div>
          ) : guidancePoints.length > 0 ? (
            <ul className="space-y-2.5 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-[#52677a]">
              {guidancePoints.map((point) => (
                <li key={point} className="flex gap-2.5">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F6F6B]"
                    aria-hidden
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center text-xs text-[#829ab1]">
              No guidance points available for this section.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
