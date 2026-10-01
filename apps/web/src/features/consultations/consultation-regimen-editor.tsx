'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DOSE_UNITS,
  DURATION_OPTIONS,
  composeDoseDisplay,
  parseDoseAndUnit,
} from '@/features/pathways/treatment-option-editor-constants';
import { PRESCRIPTION_ROUTES } from '@/features/pathways/pathway-constants';
import { TimingSelector } from '@/features/treatment-editor/timing-selector';
import { buildTimingConfiguration } from '@/features/treatment-editor/build-timing-menu';
import type { TreatmentRecommendation, TreatmentRegimenOption } from './types';

const selectClass =
  'h-9 w-full appearance-none rounded-md border border-[#C5D0D4] bg-card px-2.5 text-[13px] text-foreground shadow-none focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const inputClass =
  'h-9 rounded-md border-[#C5D0D4] text-[13px] shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20';

export type ConsultationRegimenFields = Pick<
  TreatmentRecommendation,
  | 'dose'
  | 'doseAmount'
  | 'doseUnit'
  | 'frequency'
  | 'route'
  | 'duration'
  | 'instructions'
  | 'clinicalNotes'
  | 'clinicalIndication'
  | 'followUpAdvice'
  | 'strength'
  | 'quantity'
  | 'maxDose'
  | 'selectedRegimenId'
  | 'regimens'
  | 'category'
>;

function MiniField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function resolveAmountAndUnit(t: ConsultationRegimenFields): {
  amount: string;
  unit: string;
} {
  if (t.doseAmount?.trim()) {
    return {
      amount: t.doseAmount.trim(),
      unit: t.doseUnit?.trim() || 'mg',
    };
  }
  const parsed = parseDoseAndUnit(t.dose);
  return { amount: parsed.dose, unit: parsed.unit };
}

function applyRegimenPatch(
  current: ConsultationRegimenFields,
  patch: Partial<ConsultationRegimenFields>,
): ConsultationRegimenFields {
  const next = { ...current, ...patch };
  const { amount, unit } = resolveAmountAndUnit(next);
  if (patch.doseAmount !== undefined || patch.doseUnit !== undefined || patch.dose !== undefined) {
    next.doseAmount = amount;
    next.doseUnit = unit;
    next.dose = composeDoseDisplay(amount, unit) || next.dose;
  }
  return next;
}

export function applyPathwayRegimen(
  current: TreatmentRecommendation,
  regimen: TreatmentRegimenOption,
): TreatmentRecommendation {
  return {
    ...current,
    selectedRegimenId: regimen.id,
    doseAmount: regimen.dose,
    doseUnit: regimen.unit,
    dose: composeDoseDisplay(regimen.dose, regimen.unit) || regimen.dose,
    frequency: regimen.frequency,
    route: regimen.route,
    duration: regimen.duration,
  };
}

/** Structured regimen editor — mirrors Super Admin pathway treatment fields. */
export function ConsultationRegimenEditor({
  value,
  onChange,
  editing,
  showNonDrugFields = false,
  className,
}: {
  value: ConsultationRegimenFields;
  onChange?: (next: ConsultationRegimenFields) => void;
  editing: boolean;
  showNonDrugFields?: boolean;
  className?: string;
}) {
  const isNonDrug = value.category === 'NON_DRUG' || showNonDrugFields;
  const { amount, unit } = resolveAmountAndUnit(value);
  const durationKnown = DURATION_OPTIONS.some((d) => d.value === value.duration);
  const regimens = value.regimens ?? [];

  const set = (patch: Partial<ConsultationRegimenFields>) => {
    if (!onChange) return;
    onChange(applyRegimenPatch(value, patch));
  };

  if (!editing) {
    return (
      <div className={cn('space-y-3', className)}>
        {regimens.length > 1 ? (
          <p className="text-[12px] text-muted-foreground">
            Regimen ·{' '}
            <span className="font-semibold text-foreground">
              {regimens.find((r) => r.id === value.selectedRegimenId)?.label ??
                regimens[0]?.label ??
                'Standard'}
            </span>
          </p>
        ) : null}

        {isNonDrug ? (
          <dl className="grid grid-cols-1 gap-2">
            <ReadOnlyBlock
              label="Instructions"
              value={value.instructions || value.clinicalIndication}
            />
            {value.clinicalIndication ? (
              <ReadOnlyBlock label="Clinical context" value={value.clinicalIndication} />
            ) : null}
          </dl>
        ) : (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <ReadOnlyBlock
              label="Dose"
              value={composeDoseDisplay(amount, unit) || value.dose}
            />
            <ReadOnlyBlock label="Unit" value={unit !== 'other' ? unit : undefined} />
            <ReadOnlyBlock label="Frequency" value={value.frequency} />
            <ReadOnlyBlock label="Route" value={value.route} />
            <ReadOnlyBlock label="Duration" value={value.duration} />
            {value.strength ? <ReadOnlyBlock label="Strength" value={value.strength} /> : null}
          </dl>
        )}

        {value.instructions && !isNonDrug ? (
          <ReadOnlyBlock label="Patient directions" value={value.instructions} />
        ) : null}
        {value.clinicalNotes ? (
          <ReadOnlyBlock label="Clinical rationale" value={value.clinicalNotes} />
        ) : null}
        {value.followUpAdvice ? (
          <ReadOnlyBlock label="Monitoring / follow-up" value={value.followUpAdvice} />
        ) : null}
        {(value.quantity || value.maxDose) && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {value.quantity ? (
              <ReadOnlyBlock label="Quantity" value={value.quantity} />
            ) : null}
            {value.maxDose ? (
              <ReadOnlyBlock label="Max dose" value={value.maxDose} />
            ) : null}
          </dl>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {regimens.length > 1 && onChange ? (
        <MiniField label="Pathway regimen">
          <select
            value={value.selectedRegimenId ?? regimens[0]?.id ?? ''}
            onChange={(e) => {
              const regimen = regimens.find((r) => r.id === e.target.value);
              if (!regimen) return;
              onChange({
                ...applyPathwayRegimen(value as TreatmentRecommendation, regimen),
              });
            }}
            className={selectClass}
            aria-label="Select pathway regimen"
          >
            {regimens.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.dose
                  ? ` — ${composeDoseDisplay(r.dose, r.unit)} · ${r.frequency}`
                  : ''}
              </option>
            ))}
          </select>
        </MiniField>
      ) : null}

      {isNonDrug ? (
        <div className="space-y-2.5">
          <MiniField label="Instructions">
            <Textarea
              value={value.instructions ?? ''}
              onChange={(e) => set({ instructions: e.target.value })}
              rows={2}
              className="resize-none rounded-md border-[#C5D0D4] text-[13px] shadow-none"
              placeholder="How to use this non-drug option…"
            />
          </MiniField>
          <MiniField label="Clinical context">
            <Textarea
              value={value.clinicalIndication ?? ''}
              onChange={(e) => set({ clinicalIndication: e.target.value })}
              rows={2}
              className="resize-none rounded-md border-[#C5D0D4] text-[13px] shadow-none"
              placeholder="When this option applies…"
            />
          </MiniField>
        </div>
      ) : (
        <div className="rounded-xl border border-[#D8E0E3] bg-[#FAFCFC] p-3">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Structured regimen
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <MiniField label="Dose">
              <Input
                value={amount}
                onChange={(e) => set({ doseAmount: e.target.value })}
                placeholder="500"
                className={inputClass}
              />
            </MiniField>
            <MiniField label="Unit">
              <select
                value={unit}
                onChange={(e) => set({ doseUnit: e.target.value })}
                className={selectClass}
              >
                {DOSE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </MiniField>
            <MiniField label="Frequency">
              <TimingSelector
                id="consultation-regimen-timing"
                value={value.frequency === 'other' ? '' : value.frequency ?? ''}
                configuration={buildTimingConfiguration({
                  pathwayFrequency: value.frequency,
                })}
                onChange={(frequency) => set({ frequency })}
              />
            </MiniField>
            <MiniField label="Route">
              <select
                value={
                  PRESCRIPTION_ROUTES.some((r) => r.value === value.route)
                    ? value.route
                    : value.route
                      ? 'other'
                      : 'oral'
                }
                onChange={(e) =>
                  set({
                    route:
                      e.target.value === 'other'
                        ? value.route &&
                          !PRESCRIPTION_ROUTES.some((r) => r.value === value.route)
                          ? value.route
                          : ''
                        : e.target.value,
                  })
                }
                className={selectClass}
              >
                {PRESCRIPTION_ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
                <option value="other">Other</option>
              </select>
            </MiniField>
            <MiniField label="Duration">
              <select
                value={durationKnown ? value.duration : 'other'}
                onChange={(e) =>
                  set({
                    duration:
                      e.target.value === 'other'
                        ? value.duration && !durationKnown
                          ? value.duration
                          : ''
                        : e.target.value,
                  })
                }
                className={selectClass}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </MiniField>
          </div>

          {value.route &&
            !PRESCRIPTION_ROUTES.some((r) => r.value === value.route) && (
              <Input
                className={cn(inputClass, 'mt-2')}
                value={value.route}
                onChange={(e) => set({ route: e.target.value })}
                placeholder="Custom route"
              />
            )}
          {(!durationKnown || value.duration === 'other') && (
            <Input
              className={cn(inputClass, 'mt-2')}
              value={value.duration ?? ''}
              onChange={(e) => set({ duration: e.target.value })}
              placeholder="Custom duration"
            />
          )}

          <div className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-3">
            <MiniField label="Strength">
              <Input
                value={value.strength ?? ''}
                onChange={(e) => set({ strength: e.target.value })}
                placeholder="e.g. 250 mg/5 mL"
                className={inputClass}
              />
            </MiniField>
            <MiniField label="Quantity">
              <Input
                value={value.quantity ?? ''}
                onChange={(e) => set({ quantity: e.target.value })}
                placeholder="e.g. 20 tablets"
                className={inputClass}
              />
            </MiniField>
            <MiniField label="Max dose" className="col-span-2 md:col-span-1">
              <Input
                value={value.maxDose ?? ''}
                onChange={(e) => set({ maxDose: e.target.value })}
                placeholder="e.g. 4 g/day"
                className={inputClass}
              />
            </MiniField>
          </div>
        </div>
      )}

      {!isNonDrug ? (
        <MiniField label="Patient directions">
          <Textarea
            value={value.instructions ?? ''}
            onChange={(e) => set({ instructions: e.target.value })}
            rows={2}
            className="resize-none rounded-md border-[#C5D0D4] text-[13px] shadow-none"
            placeholder="How the patient should take this…"
          />
        </MiniField>
      ) : null}

      <MiniField label="Clinical rationale">
        <Textarea
          value={value.clinicalNotes ?? ''}
          onChange={(e) => set({ clinicalNotes: e.target.value })}
          rows={2}
          className="resize-none rounded-md border-[#C5D0D4] text-[13px] shadow-none"
          placeholder="Why this option fits this patient…"
        />
      </MiniField>

      <MiniField label="Monitoring / follow-up">
        <Textarea
          value={value.followUpAdvice ?? ''}
          onChange={(e) => set({ followUpAdvice: e.target.value })}
          rows={2}
          className="resize-none rounded-md border-[#C5D0D4] text-[13px] shadow-none"
          placeholder="Labs, review timing, or monitoring notes…"
        />
      </MiniField>
    </div>
  );
}

function ReadOnlyBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card px-2.5 py-2">
      <dt className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-[13px] font-semibold leading-snug text-foreground">
        {value?.trim() || '—'}
      </dd>
    </div>
  );
}

/** Defaults for newly added manual treatments */
export function emptyRegimenFormFields(
  seed?: Partial<ConsultationRegimenFields>,
): ConsultationRegimenFields {
  const parsed = parseDoseAndUnit(seed?.dose);
  return {
    dose: seed?.dose ?? '',
    doseAmount: seed?.doseAmount ?? parsed.dose,
    doseUnit: seed?.doseUnit ?? parsed.unit,
    frequency: seed?.frequency ?? 'Once daily',
    route: seed?.route ?? 'oral',
    duration: seed?.duration ?? '7 days',
    instructions: seed?.instructions ?? '',
    clinicalNotes: seed?.clinicalNotes ?? '',
    clinicalIndication: seed?.clinicalIndication ?? '',
    followUpAdvice: seed?.followUpAdvice ?? '',
    strength: seed?.strength ?? '',
    quantity: seed?.quantity ?? '',
    maxDose: seed?.maxDose ?? '',
    category: seed?.category ?? 'PRESCRIPTION',
  };
}
