'use client';

import { Check, Pencil, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { TreatmentRecommendation } from './types';
import { formatSourceBadge } from './medication-utils';

interface Props {
  treatment: TreatmentRecommendation;
  preferred?: boolean;
  editing: boolean;
  onEditToggle: () => void;
  onChange: (updated: TreatmentRecommendation) => void;
  onRemove?: () => void;
}

function buildDirections(t: TreatmentRecommendation): string {
  if (t.instructions?.trim()) return t.instructions.trim();
  const parts: string[] = [];
  if (t.dose && t.route) {
    parts.push(`Take ${t.dose} by ${t.route.toLowerCase()}`);
  } else if (t.dose) {
    parts.push(`Take ${t.dose}`);
  } else if (t.medicationName) {
    parts.push(t.medicationName);
  }
  if (t.frequency) parts.push(t.frequency.toLowerCase());
  if (t.duration) parts.push(`for ${t.duration}`);
  const base = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!base) return '';
  return base.endsWith('.') ? base : `${base}.`;
}

export function TreatmentCard({
  treatment,
  preferred,
  editing,
  onEditToggle,
  onChange,
  onRemove,
}: Props) {
  const set = <K extends keyof TreatmentRecommendation>(
    key: K,
    value: TreatmentRecommendation[K],
  ) => {
    onChange({ ...treatment, [key]: value });
  };

  const directions = buildDirections(treatment);

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Prescription Details</p>
          {treatment.medicationName && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {treatment.medicationName} selected
              {preferred ? ' · Preferred' : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label="Remove treatment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg border-border/80 bg-background px-3 text-xs font-semibold shadow-none transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
            onClick={onEditToggle}
          >
            {editing ? (
              <>
                <Check className="h-3.5 w-3.5" /> Done
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" /> Change
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        {!editing ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <ReadField label="Medication" value={treatment.medicationName} />
              <ReadField label="Dose" value={treatment.dose} />
              <ReadField label="Frequency" value={treatment.frequency} />
              <ReadField label="Duration" value={treatment.duration} />
              <ReadField label="Route" value={treatment.route} />
            </div>
            {directions && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Directions for Patient
                </p>
                <p className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-[12px] leading-relaxed text-foreground">
                  {directions}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Medication
                </label>
                <Input
                  value={treatment.medicationName}
                  onChange={(e) => set('medicationName', e.target.value)}
                  className="h-8 rounded-md text-[12px] shadow-none"
                />
                {treatment.terminologyLabel && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {treatment.terminologyLabel}
                    {treatment.source &&
                    treatment.source !== 'ai' &&
                    formatSourceBadge(treatment.source) ? (
                      <span> · {formatSourceBadge(treatment.source)}</span>
                    ) : null}
                  </p>
                )}
              </div>
              <DoseField label="Dose" value={treatment.dose ?? ''} onChange={(v) => set('dose', v)} />
              <DoseField
                label="Frequency"
                value={treatment.frequency ?? ''}
                onChange={(v) => set('frequency', v)}
              />
              <DoseField
                label="Duration"
                value={treatment.duration ?? ''}
                onChange={(v) => set('duration', v)}
              />
              <DoseField label="Route" value={treatment.route ?? ''} onChange={(v) => set('route', v)} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Directions for Patient
              </label>
              <Textarea
                value={treatment.instructions ?? ''}
                onChange={(e) => set('instructions', e.target.value)}
                rows={2}
                className="resize-none rounded-lg text-[12px] shadow-none"
                placeholder="Patient instructions (SIG)…"
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-1.5">
          {treatment.interactions?.map((c, j) => (
            <span
              key={`i-${j}`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Interaction: {c}
            </span>
          ))}
          {!treatment.interactions?.length && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              No cautions flagged
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value?: string }) {
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

function DoseField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md text-[12px] shadow-none"
      />
    </div>
  );
}

/** Compact full-width treatment option card */
export function TreatmentOptionCard({
  treatment,
  selected,
  preferred,
  onSelect,
  onRemove,
  benefits,
}: {
  treatment: TreatmentRecommendation;
  selected: boolean;
  preferred?: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  benefits?: string[];
}) {
  const points =
    benefits?.length
      ? benefits
      : (treatment.reasoning ?? '')
          .split(/[.;\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 6 && s.length < 100)
          .slice(0, 3);

  const fallbackPoints = [
    treatment.dose && `Dose ${treatment.dose}`,
    treatment.frequency,
    treatment.duration && `${treatment.duration} course`,
  ].filter(Boolean) as string[];

  const displayPoints = points.length ? points : fallbackPoints.slice(0, 3);

  const blocked = Boolean(treatment.allergyBlocked);
  const warning = treatment.allergyWarning;

  return (
    <div
      className={cn(
        'relative flex min-h-[148px] w-full flex-col rounded-lg border p-3.5 text-left transition-colors',
        blocked && 'opacity-95',
        selected
          ? 'border-primary bg-primary/[0.03] ring-1 ring-primary/15'
          : blocked
            ? 'border-destructive/40 bg-destructive/[0.04]'
            : 'border-border/70 bg-card hover:border-primary/30 hover:bg-muted/10',
      )}
    >
      <button type="button" onClick={onSelect} className="flex flex-1 flex-col text-left">
        {selected && !blocked && (
          <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />
        )}

        <div className="mb-2.5 flex items-start gap-2">
          <span
            className={cn(
              'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2',
              blocked
                ? 'border-destructive/50'
                : selected
                  ? 'border-primary'
                  : 'border-muted-foreground/35',
            )}
          >
            {selected && !blocked && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            {blocked && <AlertTriangle className="h-2.5 w-2.5 text-destructive" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  {treatment.medicationName}
                </p>
                {(treatment.genericName || treatment.brandName) && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {[treatment.genericName, treatment.brandName].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {blocked && (
                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive">
                    Safety block
                  </span>
                )}
                {!blocked && preferred && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    Preferred
                  </span>
                )}
                {treatment.recommendationLevel === 'FIRST_LINE' && (
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                    First-line
                  </span>
                )}
                {treatment.category && treatment.category !== 'PRESCRIPTION' && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {treatment.category === 'OTC'
                      ? 'OTC'
                      : treatment.category === 'SUPPLEMENT'
                        ? 'Supplement'
                        : 'Non-drug'}
                  </span>
                )}
              </div>
            </div>
            {(treatment.dose || treatment.route || treatment.frequency) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {[treatment.dose, treatment.route, treatment.frequency]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>

        {blocked && warning ? (
          <div className="mb-2.5 rounded-md border border-destructive/25 bg-destructive/[0.06] px-2.5 py-2 pl-5">
            <p className="text-[11px] font-semibold text-destructive">
              {warning.patientAllergy
                ? `Recorded allergy: ${warning.patientAllergy}`
                : 'Not suitable for this patient'}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {warning.reason ||
                [
                  warning.matchedDrugClass && `Class: ${warning.matchedDrugClass}`,
                  warning.parentClass && `Parent: ${warning.parentClass}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
            </p>
          </div>
        ) : displayPoints.length > 0 ? (
          <ul className="mb-2.5 flex-1 space-y-1 pl-5">
            {displayPoints.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground/75"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/45" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto border-t border-border/50 pt-2 pl-5">
          {blocked ? (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Not suitable — Safety Alert
            </p>
          ) : selected || preferred ? (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              Selected
            </p>
          ) : (
            <p className="text-[11px] font-medium text-muted-foreground">Available</p>
          )}
        </div>
      </button>

      {blocked && onRemove && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full gap-1 border-destructive/30 text-[11px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3 w-3" />
          Remove — safety conflict
        </Button>
      )}
    </div>
  );
}
