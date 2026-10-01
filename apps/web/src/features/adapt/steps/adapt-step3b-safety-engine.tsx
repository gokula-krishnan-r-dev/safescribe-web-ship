'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTreatmentSafety } from '@/features/consultations/hooks';
import { requiresSafetyAcknowledgment } from '@/features/consultations/treatment-add-safety-preview';
import type {
  ClinicalSafetyWarning,
  SafetySeverity,
} from '@/features/consultations/treatment-safety-types';
import type { ClinicalCheckItem, ProposedPrescription } from '@safescript/shared';

const SEVERITY_RANK: Record<SafetySeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MODERATE: 2,
  INFO: 1,
};

const SEVERITY_STYLES: Record<
  SafetySeverity,
  { badge: string; card: string; icon: string }
> = {
  CRITICAL: {
    badge: 'bg-red-600 text-white',
    card: 'border-red-300/70 bg-red-50/90',
    icon: 'text-red-600',
  },
  HIGH: {
    badge: 'bg-orange-500 text-white',
    card: 'border-orange-300/70 bg-orange-50/90',
    icon: 'text-orange-600',
  },
  MODERATE: {
    badge: 'bg-amber-500 text-amber-950',
    card: 'border-amber-300/70 bg-amber-50/90',
    icon: 'text-amber-700',
  },
  INFO: {
    badge: 'bg-sky-600 text-white',
    card: 'border-sky-300/60 bg-sky-50/80',
    icon: 'text-sky-600',
  },
};

function formatRegimen(proposed?: ProposedPrescription | null): string {
  if (!proposed) return '';
  const parts = [
    proposed.dose,
    proposed.dosageForm,
    proposed.route,
    proposed.frequency,
  ]
    .map((p) => p?.trim())
    .filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return proposed.sig?.trim() || '';
}

function adaptFindingsToWarnings(checks: ClinicalCheckItem[]): ClinicalSafetyWarning[] {
  return checks
    .filter((c) => c.severity === 'block' || c.severity === 'review' || c.severity === 'info')
    .map((c) => {
      const severity: SafetySeverity =
        c.severity === 'block' ? 'CRITICAL' : c.severity === 'review' ? 'HIGH' : 'INFO';
      return {
        ruleId: `adapt_${c.id}`,
        severity,
        title: c.title,
        explanation: c.summary || c.assessment || c.statusLabel || '',
        clinicianAction: c.recommendation || 'Review before confirming this adaptation.',
        source: 'SafeScribe CDS' as const,
        sourceKind: 'PATIENT_CDS' as const,
        clinicalCategory:
          /allerg/i.test(c.id) || /allerg/i.test(c.title)
            ? ('ALLERGY' as const)
            : /interact/i.test(c.id)
              ? ('INTERACTION' as const)
              : /renal/i.test(c.id)
                ? ('RENAL' as const)
                : ('OTHER' as const),
      };
    });
}

export type AdaptSafetyEngineTone = 'avoid' | 'caution' | 'clear' | 'loading' | 'error';

export type AdaptSafetyEngineStatus = {
  requiresAck: boolean;
  hardStop: boolean;
  tone: AdaptSafetyEngineTone;
  isLoading: boolean;
};

export type AdaptClinicalOverrideSummary = {
  reason: string;
  comments?: string;
  overriddenAt: string;
};

export function AdaptStep3BSafetyEnginePanel({
  consultationId,
  proposed,
  adaptChecks,
  acknowledged,
  onAcknowledgedChange,
  onChangeMedication,
  onRequestOverride,
  onClearOverride,
  clinicalOverride,
  onStatusChange,
  refetchToken,
}: {
  consultationId: string;
  proposed?: ProposedPrescription | null;
  adaptChecks: ClinicalCheckItem[];
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
  onChangeMedication: () => void;
  /** Opens documented clinical override dialog (Prescribe-style). */
  onRequestOverride?: () => void;
  onClearOverride?: () => void;
  clinicalOverride?: AdaptClinicalOverrideSummary | null;
  onStatusChange?: (status: AdaptSafetyEngineStatus) => void;
  /** Bump to force a safety re-fetch (Recheck). */
  refetchToken?: number;
}) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const medName = proposed?.drugName?.trim() || '';
  const generic = proposed?.genericName?.trim() || undefined;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const overridden = Boolean(clinicalOverride?.reason?.trim());

  const safety = useTreatmentSafety(
    consultationId === 'preview' ? '' : consultationId,
    medName,
    generic,
  );

  // Allow parent Recheck to invalidate by changing refetchToken
  useEffect(() => {
    if (refetchToken != null && refetchToken > 0) {
      void safety.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional token trigger
  }, [refetchToken]);

  const engineAlerts = useMemo(() => {
    const alerts = [...(safety.data?.patientAlerts ?? [])].filter(
      (a) => a.sourceKind === 'PATIENT_CDS',
    );
    return alerts.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  }, [safety.data?.patientAlerts]);

  const adaptAlerts = useMemo(() => adaptFindingsToWarnings(adaptChecks), [adaptChecks]);

  const mergedAlerts = useMemo(() => {
    const seen = new Set<string>();
    const out: ClinicalSafetyWarning[] = [];
    for (const alert of [...adaptAlerts, ...engineAlerts]) {
      const key = `${alert.title}|${alert.severity}|${alert.explanation.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alert);
    }
    return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  }, [adaptAlerts, engineAlerts]);

  const hasAdaptBlock = adaptChecks.some((c) => c.severity === 'block');
  const top = mergedAlerts[0];
  // Hard stops / critical CDS → Avoid. Soft review & moderate → Review required.
  const isAvoid =
    hasAdaptBlock || top?.severity === 'CRITICAL';
  const isCaution =
    !isAvoid &&
    mergedAlerts.some((a) => a.severity === 'HIGH' || a.severity === 'MODERATE');
  // Override unlocks hard stops; pharmacist must still acknowledge responsibility.
  const hardStop = (hasAdaptBlock || top?.severity === 'CRITICAL') && !overridden;
  const requiresAck =
    !hardStop &&
    (overridden ||
      requiresSafetyAcknowledgment(mergedAlerts) ||
      isCaution ||
      top?.severity === 'CRITICAL' ||
      hasAdaptBlock);

  const tone: AdaptSafetyEngineTone = !medName
    ? 'clear'
    : safety.isLoading && !safety.data
      ? 'loading'
      : safety.isError && !mergedAlerts.length
        ? 'error'
        : isAvoid
          ? 'avoid'
          : isCaution
            ? 'caution'
            : 'clear';

  useEffect(() => {
    onStatusChangeRef.current?.({
      requiresAck,
      hardStop,
      tone,
      isLoading: tone === 'loading',
    });
  }, [requiresAck, hardStop, tone]);
  const regimen = formatRegimen(proposed);
  const whyShown =
    mergedAlerts[0]?.explanation ||
    mergedAlerts[0]?.title ||
    (tone === 'clear' ? 'No patient-specific safety conflicts detected for this adaptation.' : '');

  if (!medName) {
    return (
      <div className="rounded-xl border border-dashed border-[#d9e4e8] bg-[#f8fafb] px-4 py-6 text-center text-sm text-[#829ab1]">
        Complete the proposed adaptation above to run Safety Engine checks.
      </div>
    );
  }

  if (tone === 'loading') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[#d9e4e8] bg-white px-4 py-4 text-sm text-[#52677a]">
        <Loader2 className="h-4 w-4 animate-spin text-[#0F6F6B]" />
        Checking Safety Engine for {medName}…
      </div>
    );
  }

  if (tone === 'error') {
    return (
      <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3.5 text-sm text-amber-950">
        <p className="font-semibold">Safety Engine temporarily unavailable</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-amber-900/80">
          Apply clinical judgment before confirming this adaptation. You can recheck when the
          service recovers.
        </p>
      </div>
    );
  }

  if (tone === 'clear') {
    return (
      <section className="overflow-hidden rounded-[12px] border border-[#c8ead8] bg-[#F6FBF8]">
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e7f6ee] text-[#1b7a4e]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[#1e3a5f]">Safety screening clear</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              No allergy, interaction, or patient-specific conflict flagged for the proposed
              adaptation.
            </p>
            <div className="mt-3 rounded-lg border border-[#d5dee1] bg-white px-3.5 py-3">
              <p className="text-[14px] font-bold text-[#1e3a5f]">{medName}</p>
              {regimen ? (
                <p className="mt-0.5 text-[13px] text-[#52677a]">{regimen}</p>
              ) : null}
              <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-[#1b7a4e]">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Suitable to proceed with pharmacist confirmation and documentation.
              </p>
            </div>
          </div>
        </div>
        <div className="border-t border-[#d5dee1] bg-white px-4 py-2.5 sm:px-5">
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[#627d98]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#0F6F6B]" />
            Suitability does not replace clinical judgment.
          </p>
        </div>
      </section>
    );
  }

  const header =
    tone === 'avoid'
      ? {
          title: 'Avoid / not suitable',
          description:
            'Excluded based on allergy, interaction, contraindication or patient-specific factors.',
          iconWrap: 'bg-[#fdecee] text-[#b42318]',
          border: 'border-[#f3c4c8] bg-[#FDF6F6]',
          badge: 'Avoid',
          badgeClass: 'bg-[#fdecee] text-[#b42318] border-[#f3c4c8]',
        }
      : {
          title: 'Review required',
          description:
            'Safety Engine found patient-specific cautions that need pharmacist acknowledgment.',
          iconWrap: 'bg-[#fbf3e0] text-[#8a5a12]',
          border: 'border-[#ead9b0] bg-[#FFFCF5]',
          badge: 'Review',
          badgeClass: 'bg-[#fbf3e0] text-[#8a5a12] border-[#ead9b0]',
        };

  return (
    <section className={cn('overflow-hidden rounded-[12px] border', header.border)}>
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            header.iconWrap,
          )}
        >
          <Ban className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-[#1e3a5f]">{header.title}</h3>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[#fdecee] px-1.5 text-[12px] font-semibold tabular-nums text-[#b42318]">
              {mergedAlerts.length || 1}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {header.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className={cn(
            'hidden shrink-0 text-[13px] font-semibold sm:inline',
            tone === 'avoid' ? 'text-[#b42318]' : 'text-[#8a5a12]',
          )}
        >
          {detailsOpen ? 'Hide details' : 'View details'}
          <ChevronDown
            className={cn(
              'ml-1 inline h-4 w-4 transition-transform',
              detailsOpen && 'rotate-180',
            )}
          />
        </button>
      </div>

      <div
        className={cn(
          'border-t px-4 py-3.5 sm:px-5',
          tone === 'avoid' ? 'border-[#f3c4c8] bg-[#FDF0F0]' : 'border-[#ead9b0] bg-[#FFF8EB]',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold text-[#1e3a5f]">{medName}</p>
            {generic ? (
              <p className="text-[12.5px] text-[#627d98]">{generic}</p>
            ) : null}
            {regimen ? (
              <p className="mt-1 text-[13px] text-[#334e68]">{regimen}</p>
            ) : null}
            {whyShown ? (
              <p className="mt-1.5 text-[12.5px] leading-snug text-[#52677a]">
                <span className="font-semibold text-[#102a43]">Why shown: </span>
                {whyShown}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <span
              className={cn(
                'inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                header.badgeClass,
              )}
            >
              {header.badge}
            </span>
            {tone === 'avoid' && hardStop ? (
              <span className="text-[12px] font-semibold text-[#b42318]">Cannot select</span>
            ) : overridden ? (
              <span className="text-[12px] font-semibold text-[#0F6F6B]">
                Override documented
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {detailsOpen ? (
        <div className="space-y-3 border-t border-[#e6ecee] bg-white px-4 py-4 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-[#829ab1]">
                  Why flagged
                </p>
                <div className="mt-2 space-y-2">
                  {mergedAlerts.length === 0 ? (
                    <p className="text-[13px] text-[#52677a]">{whyShown}</p>
                  ) : (
                    mergedAlerts.map((alert) => {
                      const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.INFO;
                      return (
                        <div
                          key={`${alert.ruleId}-${alert.title}`}
                          className={cn('rounded-lg border px-3 py-2.5', style.card)}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                                style.badge,
                              )}
                            >
                              {alert.severity}
                            </span>
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-[#829ab1]">
                              {alert.sourceKind === 'PATIENT_CDS' ? 'Patient alert' : 'Label'}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <ShieldAlert className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', style.icon)} />
                            <div className="min-w-0">
                              <p className="text-[12.5px] font-semibold text-[#102a43]">
                                {alert.title}
                              </p>
                              {alert.explanation ? (
                                <p className="mt-0.5 text-[12px] leading-relaxed text-[#52677a]">
                                  {alert.explanation}
                                </p>
                              ) : null}
                              {alert.clinicianAction ? (
                                <p className="mt-1 text-[11.5px] font-medium text-[#334e68]">
                                  Action: {alert.clinicianAction}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onChangeMedication}
                  className="h-9 rounded-lg border-[#f3c4c8] bg-white text-[12.5px] font-semibold text-[#b42318] hover:bg-[#fdecee]"
                >
                  Change medication
                </Button>
                {overridden && onClearOverride ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClearOverride}
                    className="h-9 rounded-lg border-[#d9e4e8] bg-white text-[12.5px] font-semibold text-[#52677a] hover:bg-[#f8fafb]"
                  >
                    Remove override
                  </Button>
                ) : onRequestOverride && (isAvoid || isCaution) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRequestOverride}
                    className="h-9 rounded-lg border-[#ead9b0] bg-[#fbf3e0] text-[12.5px] font-semibold text-[#8a5a12] hover:bg-[#f7ebcf]"
                  >
                    <Scale className="mr-1.5 h-3.5 w-3.5" />
                    Override / overwrite with clinical judgment
                  </Button>
                ) : null}
              </div>

              {overridden ? (
                <div className="rounded-lg border border-[#b7e0db] bg-[#eef8f6] px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#0f6f6b]">
                    <Scale className="h-3.5 w-3.5" />
                    Clinical override documented
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#102a43]">
                    {clinicalOverride?.reason}
                  </p>
                  {clinicalOverride?.comments?.trim() ? (
                    <p className="mt-1 text-[12.5px] text-[#52677a]">
                      {clinicalOverride.comments}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-[#c5e4f3] bg-[#F0F9FC] px-3.5 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-[#0284c7]">
                  Suggested regimen
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#0c4a6e]">
                  {regimen || proposed?.sig || 'Complete dosing details in Step 3A.'}
                </p>
              </div>
              {requiresAck ? (
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                    acknowledged
                      ? 'border-[#0F6F6B]/40 bg-[#F3FAF9]'
                      : 'border-[#d9e4e8] bg-white hover:border-[#0F6F6B]/25',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => onAcknowledgedChange(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[#c5d0d5] accent-[#0F6F6B]"
                  />
                  <span className="text-[13px] leading-snug">
                    <span className="font-semibold text-[#102a43]">
                      {overridden
                        ? 'I accept clinical responsibility for this override'
                        : 'I have reviewed these alerts and accept clinical responsibility'}
                    </span>
                    <span className="mt-1 block text-[12px] text-[#627d98]">
                      Document your rationale below. Safety screening supports judgment — it does
                      not replace it.
                    </span>
                  </span>
                </label>
              ) : hardStop ? (
                <div className="flex items-start gap-2 rounded-lg border border-[#f3c4c8] bg-[#FDF6F6] px-3 py-2.5 text-[12.5px] text-[#912018]">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Hard stop — change the proposed medication, or document a clinical override to
                  proceed.
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-[#d9e4e8] bg-[#f8fafb] px-3 py-2.5 text-[12.5px] text-[#52677a]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  Informational alerts only — confirm suitability before continuing.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-t border-[#e6ecee] bg-white px-4 py-2.5 sm:px-5">
        <p className="inline-flex items-center gap-1.5 text-[12px] text-[#627d98]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#0F6F6B]" />
          All findings remain available for pharmacist review. Suitability does not replace
          clinical judgment.
        </p>
      </div>
    </section>
  );
}

/** Whether Safety Engine / adapt alerts still need pharmacist acknowledgment (soft reviews only). */
export function adaptSafetyEngineNeedsAck(opts: {
  adaptChecks: ClinicalCheckItem[];
  patientAlerts?: ClinicalSafetyWarning[];
}): boolean {
  const hasBlock = opts.adaptChecks.some((c) => c.severity === 'block');
  if (hasBlock) return false;
  const adaptAlerts = adaptFindingsToWarnings(opts.adaptChecks);
  const merged = [...adaptAlerts, ...(opts.patientAlerts ?? [])];
  return (
    requiresSafetyAcknowledgment(merged) ||
    merged.some((a) => a.severity === 'HIGH' || a.severity === 'MODERATE')
  );
}
