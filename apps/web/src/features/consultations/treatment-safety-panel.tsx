'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Info,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ClinicalSafetyWarning,
  SafetySeverity,
  TreatmentSafetyProfile,
} from './treatment-safety-types';
import { SAFETY_OVERRIDE_REASONS } from '@safescript/shared';
import { useSafetyOverride } from '@/features/safety-engine/hooks';
import { asArray } from './safe-data';

const SEVERITY: Record<
  SafetySeverity,
  {
    label: string;
    badge: string;
    card: string;
    icon: string;
  }
> = {
  CRITICAL: {
    label: 'Critical',
    badge: 'bg-red-600 text-white',
    card: 'border-red-300/70 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/30',
    icon: 'text-red-600 dark:text-red-400',
  },
  HIGH: {
    label: 'High',
    badge: 'bg-orange-500 text-white',
    card: 'border-orange-300/70 bg-orange-50/80 dark:border-orange-900/45 dark:bg-orange-950/25',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  MODERATE: {
    label: 'Moderate',
    badge: 'bg-amber-400 text-amber-950',
    card: 'border-amber-300/70 bg-amber-50/80 dark:border-amber-800/45 dark:bg-amber-950/25',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  INFO: {
    label: 'Information',
    badge: 'bg-sky-600 text-white',
    card: 'border-sky-300/60 bg-sky-50/70 dark:border-sky-900/45 dark:bg-sky-950/25',
    icon: 'text-sky-600 dark:text-sky-400',
  },
};

function Section({
  title,
  subtitle,
  open,
  onToggle,
  count,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <div className={cn('h-5 w-1 shrink-0 rounded-full', accent ?? 'bg-primary/50')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            {typeof count === 'number' && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {count}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2.5 border-t border-border/60 px-3.5 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function WarningCard({ warning }: { warning: ClinicalSafetyWarning }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY[warning.severity] ?? SEVERITY.INFO;
  const isCds = warning.sourceKind === 'PATIENT_CDS';

  return (
    <div className={cn('rounded-lg border px-3 py-2.5', sev.card)}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
            sev.badge,
          )}
        >
          {sev.label}
        </span>
        {isCds && (
          <span className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-destructive">
            Patient alert
          </span>
        )}
        {!isCds && (
          <span className="inline-flex items-center rounded border border-border/70 bg-background/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Label reference
          </span>
        )}
      </div>
      <div className="flex items-start gap-2">
        <ShieldAlert className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', sev.icon)} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground">{warning.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-foreground/85">
            {warning.explanation}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug">
            <span className="font-semibold text-foreground">Recommendation: </span>
            <span className="text-foreground/80">{warning.clinicianAction}</span>
          </p>
          {warning.fullText && (
            <button
              type="button"
              onClick={() => setExpanded((o) => !o)}
              className="mt-2 text-[11px] font-semibold text-primary hover:underline"
            >
              {expanded ? 'Hide full label text' : 'View full label'}
            </button>
          )}
          {expanded && warning.fullText && (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-background/80 p-2 text-[10px] leading-relaxed text-foreground/80">
              {warning.fullText}
            </pre>
          )}
          {warning.clinicalCategory ? (
            <p className="mt-1.5 text-[9px] text-muted-foreground/80">
              {warning.clinicalCategory}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/10 px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-[12px] font-semibold leading-snug text-foreground">
        {value?.trim() || '—'}
      </p>
    </div>
  );
}

interface Props {
  profile?: TreatmentSafetyProfile | null;
  loading?: boolean;
  error?: boolean;
  medicationName?: string;
}

export function TreatmentSafetyPanel({
  profile,
  loading,
  error,
  medicationName,
}: Props) {
  const [open, setOpen] = useState({
    recommended: true,
    alerts: true,
    label: true,
    interactions: true,
    monitoring: false,
    counselling: false,
    evidence: false,
  });

  const evaluationId = profile?.safetyEvaluation?.evaluationId ?? '';
  const overrideMutation = useSafetyOverride(evaluationId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-4 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading clinical safety profile for {medicationName || 'selected medicine'}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-3.5 py-3 text-[12px] text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/25 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Safety profile unavailable right now. Continue with pathway cautions and clinical judgment.
      </div>
    );
  }

  if (!profile) return null;

  const rec = profile.recommended ?? { medicationName: medicationName || 'Selected medicine' };
  const patientAlerts = asArray<ClinicalSafetyWarning>(profile.patientAlerts);
  const labelWarnings = asArray<ClinicalSafetyWarning>(profile.labelWarnings);
  const interactions = asArray<import('./treatment-safety-types').DrugInteractionCard>(
    profile.interactions,
  );
  const monitoring = asArray<import('./treatment-safety-types').MonitoringRequirement>(
    profile.monitoring,
  );
  const counselling = asArray<string>(profile.counselling);
  const evidence = profile.evidence ?? {};
  const safetyEval = profile.safetyEvaluation;

  const handleOverride = async (reasonCode: string) => {
    if (!safetyEval?.evaluationId) return;
    try {
      await overrideMutation.mutateAsync({
        reasonCode,
        reasonComment: reasonCode === 'OTHER' ? 'Documented clinical override' : undefined,
      });
    } catch {
      // silent — pharmacist can retry
    }
  };

  return (
    <div className="space-y-2.5">
      {safetyEval?.status === 'VERIFICATION_INCOMPLETE' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/70 bg-amber-50/80 px-3.5 py-3 text-[12px] text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Safety verification incomplete</p>
            <p className="mt-0.5 text-[11px] opacity-90">
              {safetyEval.mappingWarnings.join(' ') || 'One or more ingredients could not be fully resolved. Review before proceeding.'}
            </p>
          </div>
        </div>
      )}

      {safetyEval?.status === 'SERVICE_UNAVAILABLE' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50/80 px-3.5 py-3 text-[12px] text-red-900">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Safety engine unavailable. Do not assume no interactions — verify manually.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            Treatment Safety — {rec.medicationName || medicationName}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Patient-specific safety alerts are shown separately from pathway guidance.
          </p>
        </div>
        {!profile.found && (
          <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            Limited label data — pathway fields used
          </span>
        )}
      </div>

      <Section
        title="Recommended Treatment"
        subtitle="Regimen details for the selected medicine"
        open={open.recommended}
        onToggle={() => setOpen((s) => ({ ...s, recommended: !s.recommended }))}
        accent="bg-emerald-500"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <MetaCell label="Medication" value={rec.medicationName} />
          <MetaCell label="Generic" value={rec.genericName} />
          <MetaCell label="Brand" value={rec.brandName} />
          <MetaCell label="Therapeutic Class" value={rec.therapeuticClass} />
          <MetaCell label="Adult Dose" value={rec.adultDose} />
          <MetaCell label="Pediatric Dose" value={rec.pediatricDose} />
          <MetaCell label="Route" value={rec.route} />
          <MetaCell label="Frequency" value={rec.frequency} />
          <MetaCell label="Duration" value={rec.duration} />
        </div>
        {rec.indications && (
          <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Indications / Uses
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/85">{rec.indications}</p>
          </div>
        )}
      </Section>

      <Section
        title="Patient-Specific Alerts"
        subtitle="Allergy / Pregnancy / Condition / Lab — live CDS for this consultation"
        open={open.alerts}
        onToggle={() => setOpen((s) => ({ ...s, alerts: !s.alerts }))}
        count={patientAlerts.length}
        accent="bg-red-500"
      >
        {patientAlerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            No patient-specific allergy, pregnancy, condition, or lab alerts for this medicine.
          </div>
        ) : (
          <div className="space-y-2">
            {patientAlerts.map((w) => (
              <WarningCard key={w.ruleId} warning={w} />
            ))}
            {safetyEval?.findings?.some((f) => f.overrideAllowed) && (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-foreground">Document override</p>
                <div className="flex flex-wrap gap-1.5">
                  {SAFETY_OVERRIDE_REASONS.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      disabled={overrideMutation.isPending}
                      onClick={() => void handleOverride(r.code)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[10px] hover:bg-muted/60"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Clinical Safety Warnings"
        subtitle="Pathway safety guidance"
        open={open.label}
        onToggle={() => setOpen((s) => ({ ...s, label: !s.label }))}
        count={labelWarnings.length}
        accent="bg-orange-500"
      >
        {labelWarnings.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No structured label warnings returned for this medicine.
          </p>
        ) : (
          <div className="space-y-2">
            {labelWarnings.map((w) => (
              <WarningCard key={w.ruleId} warning={w} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Drug Interactions"
        open={open.interactions}
        onToggle={() => setOpen((s) => ({ ...s, interactions: !s.interactions }))}
        count={interactions.length}
        accent="bg-orange-400"
      >
        {interactions.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            No significant interactions flagged.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {interactions.map((i) => {
              const sev = SEVERITY[i.severity] ?? SEVERITY.MODERATE;
              return (
                <div
                  key={i.ruleId}
                  className={cn('rounded-lg border px-3 py-2.5', sev.card)}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-foreground">{i.drug}</p>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                        sev.badge,
                      )}
                    >
                      {sev.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/85">{i.clinicalEffect}</p>
                  <p className="mt-1.5 text-[11px]">
                    <span className="font-semibold">Action: </span>
                    {i.recommendedAction}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{i.source}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Monitoring Requirements"
        open={open.monitoring}
        onToggle={() => setOpen((s) => ({ ...s, monitoring: !s.monitoring }))}
        count={monitoring.length}
        accent="bg-violet-500"
      >
        {monitoring.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No specific monitoring extracted.</p>
        ) : (
          <div className="space-y-2">
            {monitoring.map((m) => (
              <div
                key={m.ruleId}
                className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/10 px-3 py-2"
              >
                <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                <div>
                  <p className="text-[12px] font-semibold text-foreground">{m.test}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {m.reason} · {m.frequency}
                  </p>
                  <p className="mt-1 text-[11px] text-foreground/80">{m.clinicalRationale}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Patient Counseling"
        open={open.counselling}
        onToggle={() => setOpen((s) => ({ ...s, counselling: !s.counselling }))}
        count={counselling.length}
        accent="bg-sky-500"
      >
        {counselling.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No counselling points from label.</p>
        ) : (
          <ul className="space-y-1.5">
            {counselling.map((point, idx) => (
              <li
                key={`${idx}-${point.slice(0, 24)}`}
                className="flex items-start gap-2 text-[11px] leading-snug text-foreground/85"
              >
                <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Evidence Source"
        open={open.evidence}
        onToggle={() => setOpen((s) => ({ ...s, evidence: !s.evidence }))}
        accent="bg-slate-400"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetaCell label="Evidence Level" value={evidence.evidenceLevel} />
          <MetaCell label="Publication Date" value={evidence.publicationDate} />
          <MetaCell label="Last Reviewed" value={evidence.lastReviewed} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" />
            Patient cautions are governed by the current Safety Alert release.
            Generated {new Date(profile.generatedAt).toLocaleString()}
          </span>
        </div>
      </Section>
    </div>
  );
}
