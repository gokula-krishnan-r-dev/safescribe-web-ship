'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { useTreatmentSafety } from './hooks';
import type {
  ClinicalSafetyWarning,
  SafetySeverity,
  TreatmentSafetyProfile,
} from './treatment-safety-types';

const CONSULTATIONS_BASE = '/consultations';

const SEVERITY_RANK: Record<SafetySeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MODERATE: 2,
  INFO: 1,
};

const SEVERITY_STYLES: Record<
  SafetySeverity,
  { card: string; badge: string; icon: typeof AlertTriangle }
> = {
  CRITICAL: {
    card: 'border-red-500/40 bg-red-500/10',
    badge: 'bg-red-600 text-white',
    icon: ShieldAlert,
  },
  HIGH: {
    card: 'border-orange-500/40 bg-orange-500/10',
    badge: 'bg-orange-500 text-white',
    icon: AlertTriangle,
  },
  MODERATE: {
    card: 'border-amber-500/40 bg-amber-500/10',
    badge: 'bg-amber-500 text-amber-950',
    icon: AlertTriangle,
  },
  INFO: {
    card: 'border-sky-500/30 bg-sky-500/10',
    badge: 'bg-sky-600 text-white',
    icon: Info,
  },
};

export function requiresSafetyAcknowledgment(alerts: ClinicalSafetyWarning[]): boolean {
  return alerts.some(
    (a) =>
      a.sourceKind === 'PATIENT_CDS' &&
      (a.severity === 'CRITICAL' || a.severity === 'HIGH' || a.severity === 'MODERATE'),
  );
}

export type TreatmentSafetyTarget = {
  id: string;
  medicationName: string;
  genericName?: string;
};

export function useMultiTreatmentSafetyAlerts(
  consultationId: string | undefined,
  targets: TreatmentSafetyTarget[],
) {
  const queries = useQueries({
    queries: targets.map((target) => ({
      queryKey: [
        'consultations',
        consultationId,
        'treatment-safety',
        target.id,
        target.medicationName,
        target.genericName ?? '',
      ],
      queryFn: async () => {
        const qs = new URLSearchParams({
          medicationName: target.medicationName.trim(),
        });
        if (target.genericName?.trim()) qs.set('genericName', target.genericName.trim());
        return api.get<TreatmentSafetyProfile>(
          `${CONSULTATIONS_BASE}/${consultationId}/treatment-safety?${qs}`,
        );
      },
      enabled: Boolean(
        consultationId && target.medicationName.trim().length >= 2,
      ),
      staleTime: 60_000,
    })),
  });

  const byTargetId = useMemo(() => {
    const map = new Map<
      string,
      {
        cdsAlerts: ClinicalSafetyWarning[];
        mappingWarnings: string[];
        requiresAck: boolean;
      }
    >();
    targets.forEach((target, index) => {
      const data = queries[index]?.data;
      const cdsAlerts = [...(data?.patientAlerts ?? [])]
        .filter((a) => a.sourceKind === 'PATIENT_CDS')
        .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
      map.set(target.id, {
        cdsAlerts,
        mappingWarnings: data?.safetyEvaluation?.mappingWarnings ?? [],
        requiresAck: requiresSafetyAcknowledgment(cdsAlerts),
      });
    });
    return map;
  }, [queries, targets]);

  const allCdsAlerts = useMemo(
    () =>
      [...byTargetId.values()].flatMap((entry) => entry.cdsAlerts).sort(
        (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
      ),
    [byTargetId],
  );

  const mappingWarnings = useMemo(
    () => [...new Set([...byTargetId.values()].flatMap((e) => e.mappingWarnings))],
    [byTargetId],
  );

  return {
    byTargetId,
    allCdsAlerts,
    mappingWarnings,
    requiresAck: allCdsAlerts.some(
      (a) =>
        a.sourceKind === 'PATIENT_CDS' &&
        (a.severity === 'CRITICAL' || a.severity === 'HIGH' || a.severity === 'MODERATE'),
    ),
    topSeverity: allCdsAlerts[0]?.severity ?? null,
    isFetching: queries.some((q) => q.isFetching),
    isError: queries.some((q) => q.isError),
    isReady: targets.length === 0 || queries.every((q) => q.isFetched || q.isError),
  };
}

export function useTreatmentAddSafetyAlerts(
  consultationId: string | undefined,
  medicationName: string | undefined,
  genericName: string | undefined,
) {
  const safety = useTreatmentSafety(
    consultationId ?? '',
    medicationName,
    genericName,
  );

  const cdsAlerts = useMemo(() => {
    const alerts = safety.data?.patientAlerts ?? [];
    return [...alerts]
      .filter((a) => a.sourceKind === 'PATIENT_CDS')
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  }, [safety.data?.patientAlerts]);

  const mappingWarnings = safety.data?.safetyEvaluation?.mappingWarnings ?? [];

  return {
    ...safety,
    cdsAlerts,
    mappingWarnings,
    requiresAck: requiresSafetyAcknowledgment(cdsAlerts),
    topSeverity: cdsAlerts[0]?.severity ?? null,
  };
}

interface TreatmentAddSafetyPreviewProps {
  consultationId?: string;
  medicationName?: string;
  genericName?: string;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

export function TreatmentAddSafetyPreview({
  consultationId,
  medicationName,
  genericName,
  acknowledged,
  onAcknowledgedChange,
}: TreatmentAddSafetyPreviewProps) {
  const {
    cdsAlerts,
    mappingWarnings,
    requiresAck,
    isFetching,
    isError,
    data,
  } = useTreatmentAddSafetyAlerts(consultationId, medicationName, genericName);

  if (!medicationName?.trim() || !consultationId) return null;

  if (isFetching && !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Checking clinical safety for this patient…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100/90">
        <p className="font-medium">Safety checks could not be completed</p>
        <p className="text-xs mt-1 text-amber-100/75">
          Try again before adding this treatment.
        </p>
      </div>
    );
  }

  if (!cdsAlerts.length && !mappingWarnings.length) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            No safety alerts
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-100/70 mt-0.5">
            Published safety rules found no allergy, renal, pregnancy, lactation, or interaction
            conflict for this patient and medicine.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Safety Alert
        </p>
      </div>


      <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
        {cdsAlerts.map((alert) => (
          <AlertCard key={`${alert.ruleId}-${alert.title}`} alert={alert} />
        ))}
      </div>

      {requiresAck ? (
        <label
          className={cn(
            'flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-colors',
            acknowledged
              ? 'border-primary/40 bg-primary/5'
              : 'border-border/80 bg-muted/15 hover:border-primary/25',
          )}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledgedChange(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="text-sm leading-snug">
            <span className="font-medium text-foreground">
              I have reviewed these alerts and accept clinical responsibility
            </span>
            <span className="block text-xs text-muted-foreground mt-1">
              You may still add this treatment when clinically justified. Document your rationale in
              instructions or counselling notes.
            </span>
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground px-0.5">
          Informational alerts only — you may add this treatment when appropriate.
        </p>
      )}
    </div>
  );
}

interface MultiTreatmentSafetyPreviewProps {
  consultationId?: string;
  targets: TreatmentSafetyTarget[];
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

/** Aggregated CDS review when adding multiple medicines at once */
export function MultiTreatmentSafetyPreview({
  consultationId,
  targets,
  acknowledged,
  onAcknowledgedChange,
}: MultiTreatmentSafetyPreviewProps) {
  const {
    byTargetId,
    allCdsAlerts,
    mappingWarnings,
    requiresAck,
    isFetching,
    isError,
    isReady,
  } = useMultiTreatmentSafetyAlerts(consultationId, targets);

  if (!consultationId || targets.length === 0) return null;

  if (isFetching && !isReady) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Checking clinical safety for {targets.length} medicine
        {targets.length === 1 ? '' : 's'}…
      </div>
    );
  }

  if (isError && !allCdsAlerts.length) {
    return (
      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-sm">
        <p className="font-medium text-foreground">Safety check unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Apply your clinical judgement before adding these medicines.
        </p>
      </div>
    );
  }

  if (!allCdsAlerts.length && !mappingWarnings.length) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">No safety alerts</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Published safety rules found no allergy, renal, pregnancy, lactation, or interaction
            conflict for these medicines on this patient profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Safety Review
        </p>
      </div>

      {mappingWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          {mappingWarnings.map((w) => (
            <p key={w}>• {w}</p>
          ))}
        </div>
      )}

      <div className="space-y-3 max-h-56 overflow-y-auto pr-0.5">
        {targets.map((target) => {
          const entry = byTargetId.get(target.id);
          if (!entry?.cdsAlerts.length) return null;
          return (
            <div key={target.id} className="space-y-2">
              <p className="text-xs font-semibold text-foreground">{target.medicationName}</p>
              {entry.cdsAlerts.map((alert) => (
                <AlertCard key={`${target.id}-${alert.ruleId}-${alert.title}`} alert={alert} />
              ))}
            </div>
          );
        })}
      </div>

      {requiresAck ? (
        <label
          className={cn(
            'flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-colors',
            acknowledged
              ? 'border-primary/40 bg-primary/5'
              : 'border-border/80 bg-muted/15 hover:border-primary/25',
          )}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledgedChange(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="text-sm leading-snug">
            <span className="font-medium text-foreground">
              I have reviewed these alerts and accept clinical responsibility
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              You may still add these treatments when clinically justified. Document rationale in
              instructions or counselling notes.
            </span>
          </span>
        </label>
      ) : (
        <p className="px-0.5 text-xs text-muted-foreground">
          Informational alerts only — you may add these treatments when appropriate.
        </p>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: ClinicalSafetyWarning }) {
  const style = SEVERITY_STYLES[alert.severity];
  const Icon = style.icon;

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 space-y-1.5', style.card)}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0 mt-0.5 opacity-90" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', style.badge)}>
              {alert.severity}
            </span>
            {alert.clinicalCategory && (
              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                {alert.clinicalCategory}
              </span>
            )}
          </div>
          <p className="text-sm font-medium mt-1">{alert.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.explanation}</p>
          {alert.clinicianAction && (
            <p className="text-xs mt-1.5 text-foreground/85">
              <span className="font-medium">Action:</span> {alert.clinicianAction}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
