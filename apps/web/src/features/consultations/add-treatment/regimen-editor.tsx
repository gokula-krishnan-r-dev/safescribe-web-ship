'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import type { DurationUnit, FieldErrors, RegimenLineDraft } from './types';
import {
  DURATION_UNITS,
  MAX_REGIMEN_LINES,
  emptyRegimenLine,
  inferCcdDProductPresentation,
  newClientId,
} from './constants';
import { unitSelectBinding } from './form-options';
import { resolveRouteValue, routeSelectOptions } from './route-options';
import {
  FREQUENCY_SELECT_OPTIONS,
  OTHER_FREQUENCY_VALUE,
  frequencyComboboxValue,
  isCustomFrequency,
  isOtherFrequencyPlaceholder,
} from './frequency-options';
import { doseRangeInvalid } from './directions';
import {
  FieldLabel,
  IconTooltipButton,
  LabeledSelect,
} from './ui-bits';

function IconButtonColumn({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="mb-1.5 block h-[18px]" aria-hidden />
      {children}
    </div>
  );
}

function uniqueMessages(messages: Array<string | undefined | null>): string[] {
  return [...new Set(messages.map((m) => m?.trim()).filter((m): m is string => Boolean(m)))];
}

export function collectPrescriptionFieldAlerts(
  lines: RegimenLineDraft[],
  errors?: FieldErrors,
): string[] {
  const msgs: Array<string | undefined> = [];
  const prefix = lines.length > 1;
  lines.forEach((line, idx) => {
    const label = prefix ? `Line ${idx + 1} · ` : '';
    const doseFrom = errors?.[`regimenLines.${idx}.doseFrom`];
    msgs.push(doseFrom ? `${label}${doseFrom}` : undefined);
    if (line.doseTo != null) {
      const range =
        errors?.[`regimenLines.${idx}.doseTo`] ??
        doseRangeInvalid(line.doseFrom, line.doseTo) ??
        undefined;
      msgs.push(range ? `${label}${range}` : undefined);
    }
    const form = errors?.[`regimenLines.${idx}.form`];
    msgs.push(form ? `${label}${form}` : undefined);
    const frequency = errors?.[`regimenLines.${idx}.frequency`];
    msgs.push(frequency ? `${label}${frequency}` : undefined);
    const durationValue = errors?.[`regimenLines.${idx}.durationValue`];
    msgs.push(durationValue ? `${label}${durationValue}` : undefined);
    const durationUnit = errors?.[`regimenLines.${idx}.durationUnit`];
    msgs.push(durationUnit ? `${label}${durationUnit}` : undefined);
  });
  msgs.push(errors?.regimenLines);
  msgs.push(errors?.quantityValue);
  msgs.push(errors?.quantityUnit);
  msgs.push(errors?.refills);
  msgs.push(errors?.route);
  return uniqueMessages(msgs);
}

interface Props {
  lines: RegimenLineDraft[];
  onChange: (lines: RegimenLineDraft[]) => void;
  errors?: FieldErrors;
  defaultForm?: string;
  /** When true, a new line copies form only — not dose, frequency, PRN, or duration. */
  sparseNewLines?: boolean;
  /** Compatible administration units for the matched product. Empty = catalog. */
  unitOptions?: string[];
  doseUnitLabel?: string;
}

export function RegimenEditor({
  lines,
  onChange,
  errors,
  defaultForm,
  sparseNewLines = false,
  unitOptions,
  doseUnitLabel = 'Dose unit',
}: Props) {
  const focusDoseTo = useRef<string | null>(null);
  const focusNewDose = useRef<string | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const [pendingCollapseId, setPendingCollapseId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusDoseTo.current) return;
    const el = document.getElementById(`dose-to-${focusDoseTo.current}`);
    focusDoseTo.current = null;
    el?.focus();
  }, [lines]);

  useEffect(() => {
    if (!focusNewDose.current) return;
    const el = document.getElementById(`dose-from-${focusNewDose.current}`);
    focusNewDose.current = null;
    el?.focus();
  }, [lines]);

  const updateLine = (id: string, patch: Partial<RegimenLineDraft>) => {
    onChange(lines.map((l) => (l.clientId === id ? { ...l, ...patch } : l)));
  };

  const expandRange = (line: RegimenLineDraft) => {
    focusDoseTo.current = line.clientId;
    updateLine(line.clientId, { doseTo: line.doseTo ?? '' });
  };

  const collapseRange = (line: RegimenLineDraft) => {
    if (line.doseTo?.trim()) {
      setPendingCollapseId(line.clientId);
      return;
    }
    updateLine(line.clientId, { doseTo: null });
  };

  const confirmCollapseRange = (id: string) => {
    updateLine(id, { doseTo: null });
    setPendingCollapseId(null);
  };

  const addLine = () => {
    if (lines.length >= MAX_REGIMEN_LINES) return;
    const last = lines[lines.length - 1];
    const next = emptyRegimenLine({
      form: defaultForm ?? last?.form,
      frequency: sparseNewLines ? '' : last?.frequency || '',
      durationValue: sparseNewLines ? null : last?.durationValue ?? null,
      durationUnit: sparseNewLines ? null : last?.durationUnit ?? 'DAY',
      prn: sparseNewLines ? false : last?.prn ?? false,
      doseFrom: '',
    });
    next.clientId = newClientId();
    next.sequence = lines.length + 1;
    focusNewDose.current = next.clientId;
    onChange([...lines, next]);
    if (liveRef.current) {
      liveRef.current.textContent = `Dose line ${next.sequence} added.`;
    }
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    const next = lines
      .filter((l) => l.clientId !== id)
      .map((l, i) => ({ ...l, sequence: i + 1 }));
    onChange(next);
    if (liveRef.current) {
      liveRef.current.textContent = 'Dose line removed.';
    }
  };

  return (
    <div className="space-y-4">
      <div ref={liveRef} className="sr-only" aria-live="polite" />
      {lines.map((line, idx) => {
        const rangeOn = line.doseTo != null;
        const rangeError =
          errors?.[`regimenLines.${idx}.doseTo`] ??
          (rangeOn ? doseRangeInvalid(line.doseFrom, line.doseTo) ?? undefined : undefined);
        return (
          <div key={line.clientId} className="space-y-3">
            {idx > 0 ? (
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-semibold uppercase tracking-wide text-primary">
                  Then
                </p>
                <button
                  type="button"
                  onClick={() => removeLine(line.clientId)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label={`Remove dose line ${idx + 1}`}
                >
                  <X className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[12rem] flex-[1.2]">
                <FieldLabel htmlFor={`dose-from-${line.clientId}`} required>
                  {rangeOn ? 'Dose from' : 'Dose instruction'}
                </FieldLabel>
                <Input
                  id={`dose-from-${line.clientId}`}
                  value={line.doseFrom}
                  inputMode={/^\d/.test(line.doseFrom.trim()) ? 'decimal' : 'text'}
                  placeholder="Apply a thin layer"
                  aria-invalid={Boolean(errors?.[`regimenLines.${idx}.doseFrom`])}
                  onChange={(e) => updateLine(line.clientId, { doseFrom: e.target.value })}
                  className="h-10 rounded-[10px]"
                />
              </div>

              {rangeOn ? (
                <>
                  <div className="w-[5.5rem]">
                    <FieldLabel htmlFor={`dose-to-${line.clientId}`} required>
                      Dose to
                    </FieldLabel>
                    <Input
                      id={`dose-to-${line.clientId}`}
                      value={line.doseTo ?? ''}
                      inputMode="decimal"
                      aria-invalid={Boolean(rangeError)}
                      onChange={(e) =>
                        updateLine(line.clientId, { doseTo: e.target.value })
                      }
                      className="h-10 rounded-[10px]"
                    />
                  </div>
                  <IconButtonColumn>
                    <IconTooltipButton
                      label="Use a single dose"
                      tooltip="Use a single dose"
                      variant="ghost"
                      onClick={() => collapseRange(line)}
                    />
                  </IconButtonColumn>
                </>
              ) : (
                <IconButtonColumn>
                  <IconTooltipButton
                    label="Add variable dose range"
                    tooltip="Add variable dose range"
                    variant="outline"
                    onClick={() => expandRange(line)}
                  />
                </IconButtonColumn>
              )}

              <div className="min-w-[11rem] flex-[1.05]">
                <FieldLabel htmlFor={`form-${line.clientId}`} required>
                  {doseUnitLabel}
                </FieldLabel>
                <SearchableSelect
                  id={`form-${line.clientId}`}
                  {...unitSelectBinding('form', line.form, unitOptions)}
                  placeholder="Select"
                  searchPlaceholder="Search application, tablet, puff…"
                  emptyMessage="No matching units"
                  aria-invalid={Boolean(errors?.[`regimenLines.${idx}.form`])}
                  aria-required
                  aria-describedby={
                    errors?.[`regimenLines.${idx}.form`]
                      ? `form-${line.clientId}-error`
                      : undefined
                  }
                  onChange={(v) => updateLine(line.clientId, { form: v })}
                />
              </div>

              <div className="min-w-[12.5rem] flex-[1.15]">
                <FieldLabel htmlFor={`freq-${line.clientId}`} required>
                  Frequency
                </FieldLabel>
                <SearchableSelect
                  id={`freq-${line.clientId}`}
                  value={frequencyComboboxValue(line.frequency)}
                  placeholder="Select"
                  searchPlaceholder="Search code or description…"
                  emptyMessage="No matching frequencies"
                  aria-invalid={Boolean(errors?.[`regimenLines.${idx}.frequency`])}
                  aria-required
                  aria-describedby={
                    errors?.[`regimenLines.${idx}.frequency`]
                      ? `freq-${line.clientId}-error`
                      : undefined
                  }
                  options={FREQUENCY_SELECT_OPTIONS}
                  onChange={(v) => {
                    if (v === OTHER_FREQUENCY_VALUE) {
                      updateLine(line.clientId, {
                        frequency:
                          isCustomFrequency(line.frequency) && !isOtherFrequencyPlaceholder(line.frequency)
                            ? line.frequency
                            : v,
                      });
                      return;
                    }
                    updateLine(line.clientId, { frequency: v });
                  }}
                />
                {isCustomFrequency(line.frequency) ? (
                  <Input
                    id={`freq-custom-${line.clientId}`}
                    value={isOtherFrequencyPlaceholder(line.frequency) ? '' : line.frequency}
                    placeholder="Enter custom frequency"
                    aria-label="Custom frequency"
                    className="mt-1.5 h-10 rounded-[10px]"
                    onChange={(e) =>
                      updateLine(line.clientId, {
                        frequency: e.target.value.trim() ? e.target.value : OTHER_FREQUENCY_VALUE,
                      })
                    }
                  />
                ) : null}
              </div>

              <div className="min-w-[7.5rem]">
                <FieldLabel htmlFor={`prn-${line.clientId}`}>PRN</FieldLabel>
                <div className="flex h-10 items-center gap-2">
                  <Switch
                    id={`prn-${line.clientId}`}
                    checked={line.prn}
                    onCheckedChange={(checked) =>
                      updateLine(line.clientId, { prn: checked })
                    }
                  />
                  <span className="text-[13px] text-muted-foreground">As needed</span>
                </div>
              </div>

              <div className="w-[5.25rem]">
                <FieldLabel htmlFor={`dur-${line.clientId}`} required>
                  Duration
                </FieldLabel>
                <Input
                  id={`dur-${line.clientId}`}
                  value={line.durationValue ?? ''}
                  inputMode="numeric"
                  aria-invalid={Boolean(errors?.[`regimenLines.${idx}.durationValue`])}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateLine(line.clientId, {
                      durationValue: v,
                      durationUnit: line.durationUnit ?? 'DAY',
                    });
                  }}
                  className="h-10 rounded-[10px]"
                />
              </div>

              <LabeledSelect
                id={`dur-unit-${line.clientId}`}
                label="Unit"
                required
                className="w-[7.5rem]"
                value={line.durationUnit ?? ''}
                error={errors?.[`regimenLines.${idx}.durationUnit`]}
                showInlineError={false}
                onChange={(v) =>
                  updateLine(line.clientId, {
                    durationUnit: (v || null) as DurationUnit | null,
                  })
                }
                options={DURATION_UNITS.map((u) => ({
                  value: u.value,
                  label: u.label,
                }))}
              />

              {idx === lines.length - 1 ? (
                <IconButtonColumn>
                  <IconTooltipButton
                    label="Add another dose line"
                    tooltip={
                      lines.length >= MAX_REGIMEN_LINES
                        ? `Maximum of ${MAX_REGIMEN_LINES} dose lines`
                        : 'Add another dose line'
                    }
                    variant="solid"
                    disabled={lines.length >= MAX_REGIMEN_LINES}
                    onClick={addLine}
                  />
                </IconButtonColumn>
              ) : (
                <span className="w-10 shrink-0" aria-hidden />
              )}
            </div>
            {pendingCollapseId === line.clientId ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12.5px]">
                <span className="text-foreground">Use a single dose and clear Dose to?</span>
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => confirmCollapseRange(line.clientId)}
                >
                  Clear range
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setPendingCollapseId(null)}
                >
                  Keep range
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {lines.length >= MAX_REGIMEN_LINES ? (
        <p className="text-[12.5px] text-muted-foreground">
          A maximum of {MAX_REGIMEN_LINES} dose lines can be added.
        </p>
      ) : null}
    </div>
  );
}

export function QuantityAndRefillsFields({
  quantity,
  quantityUnit,
  refills,
  route,
  showRoute,
  dosageForm,
  errors,
  idPrefix = '',
  disabled,
  allowedQuantityUnits,
  onChange,
}: {
  quantity: string;
  quantityUnit: string;
  refills: number;
  route?: string;
  showRoute?: boolean;
  dosageForm?: string;
  errors?: FieldErrors;
  idPrefix?: string;
  disabled?: boolean;
  allowedQuantityUnits?: string[];
  onChange: (patch: {
    quantityValue?: string;
    quantityUnit?: string;
    refills?: number;
    route?: string;
  }) => void;
}) {
  const ccdMatched =
    Boolean(dosageForm?.trim()) &&
    inferCcdDProductPresentation(dosageForm).quantityUnit === quantityUnit;
  const unitHint = ccdMatched
    ? dosageForm!.trim().toLowerCase()
    : undefined;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'grid gap-2.5',
          showRoute
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,12.5rem)_minmax(12.5rem,16.25rem)_minmax(8.75rem,10.625rem)_minmax(13.75rem,17.5rem)]'
            : 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-[minmax(10rem,12.5rem)_minmax(12.5rem,16.25rem)_minmax(8.75rem,10.625rem)]',
        )}
      >
        <div>
          <FieldLabel htmlFor={`${idPrefix}qty-value`} required>
            Quantity
          </FieldLabel>
          <Input
            id={`${idPrefix}qty-value`}
            value={quantity}
            inputMode="decimal"
            disabled={disabled}
            aria-invalid={Boolean(errors?.quantityValue)}
            onChange={(e) => onChange({ quantityValue: e.target.value })}
            className="h-10 rounded-[10px]"
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}qty-unit`} required>
            Quantity unit
          </FieldLabel>
          <SearchableSelect
            id={`${idPrefix}qty-unit`}
            {...unitSelectBinding('quantity', quantityUnit, allowedQuantityUnits)}
            placeholder="Select"
            searchPlaceholder="Search tablet, vial, mL…"
            emptyMessage="No matching units"
            disabled={disabled}
            aria-invalid={Boolean(errors?.quantityUnit)}
            aria-required
            aria-describedby={
              errors?.quantityUnit ? `${idPrefix}qty-unit-error` : undefined
            }
            onChange={(v) => onChange({ quantityUnit: v })}
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}refills`}>
            Refills
          </FieldLabel>
          <div
            className={cn(
              'flex h-10 overflow-hidden rounded-[10px] border bg-card',
              errors?.refills
                ? 'border-destructive focus-within:ring-2 focus-within:ring-destructive/25'
                : 'border-input focus-within:ring-2 focus-within:ring-ring/40',
            )}
          >
            <button
              type="button"
              aria-label="Decrease refills"
              className="px-2.5 text-muted-foreground hover:bg-muted"
              onClick={() => onChange({ refills: Math.max(0, refills - 1) })}
            >
              −
            </button>
            <input
              id={`${idPrefix}refills`}
              value={String(refills)}
              inputMode="numeric"
              aria-invalid={Boolean(errors?.refills)}
              className="w-full border-0 bg-transparent text-center text-sm outline-none"
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (e.target.value === '') onChange({ refills: 0 });
                else if (Number.isFinite(n) && n >= 0) onChange({ refills: n });
              }}
            />
            <button
              type="button"
              aria-label="Increase refills"
              className="px-2.5 text-muted-foreground hover:bg-muted"
              onClick={() => onChange({ refills: refills + 1 })}
            >
              +
            </button>
          </div>
        </div>
        {showRoute ? (
          <div>
            <FieldLabel htmlFor={`${idPrefix}route`} required>
              Route
            </FieldLabel>
            <SearchableSelect
              id={`${idPrefix}route`}
              value={resolveRouteValue(route) || route || ''}
              placeholder="Select"
              searchPlaceholder="Search oral, IV, topical…"
              emptyMessage="No matching routes"
              disabled={disabled}
              aria-invalid={Boolean(errors?.route)}
              aria-required
              aria-describedby={errors?.route ? `${idPrefix}route-error` : undefined}
              options={routeSelectOptions(route)}
              onChange={(v) => onChange({ route: v })}
            />
          </div>
        ) : null}
      </div>
      {unitHint ? (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Matched product · {unitHint}
        </p>
      ) : null}
    </div>
  );
}
