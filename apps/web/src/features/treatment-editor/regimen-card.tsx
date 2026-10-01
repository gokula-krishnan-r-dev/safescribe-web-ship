'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import type { DurationUnit, RegimenLineDraft } from '@/features/consultations/add-treatment/types';
import {
  MAX_REGIMEN_LINES,
  emptyRegimenLine,
  newClientId,
} from '@/features/consultations/add-treatment/constants';
import { unitSelectBinding } from '@/features/consultations/add-treatment/form-options';
import { doseRangeInvalid } from '@/features/consultations/add-treatment/directions';
import { draftString } from '@/features/consultations/inline-prescription';
import { resolveAdministrationAction } from './administration-action';
import { buildTimingConfiguration } from './build-timing-menu';
import { editorInputCompactClass } from './editor-styles';
import { DurationUnitSelect, DurationValueInput } from './duration-controls';
import { TimingSelector } from './timing-selector';
import {
  EditorCard,
  EditLinkButton,
  OutlineActionButton,
} from './selected-treatment-header';

interface Props {
  lines: RegimenLineDraft[];
  onChange: (lines: RegimenLineDraft[]) => void;
  productForm: string;
  route: string;
  medicationHaystack?: string;
  pathwayFrequency?: string | null;
  unitOptions?: string[];
  limitsSummary?: string;
  onEditLimits?: () => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  idPrefix?: string;
  sourceBadge?: string;
}

function rangeIsOpen(line: RegimenLineDraft | undefined, expandedIds: Set<string>): boolean {
  if (!line) return false;
  return line.doseTo != null || expandedIds.has(line.clientId);
}

export function RegimenCard({
  lines,
  onChange,
  productForm,
  route,
  medicationHaystack,
  pathwayFrequency,
  unitOptions,
  limitsSummary,
  onEditLimits,
  errors,
  disabled,
  idPrefix = 'regimen',
  sourceBadge,
}: Props) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [pendingCollapseId, setPendingCollapseId] = useState<string | null>(null);
  const [rangeOpenIds, setRangeOpenIds] = useState<Set<string>>(() => new Set());
  const focusDoseTo = useRef<string | null>(null);
  const focusNewDose = useRef<string | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const { label: actionLabel, action } = resolveAdministrationAction({
    productForm,
    route,
    medicationHaystack,
  });
  const timingConfig = buildTimingConfiguration({ pathwayFrequency });
  const firstWithoutRange = lines.find((line) => !rangeIsOpen(line, rangeOpenIds));
  const sequential = lines.length > 1;

  useEffect(() => {
    if (!focusDoseTo.current) return;
    const el = document.getElementById(`dose-to-${focusDoseTo.current}`);
    focusDoseTo.current = null;
    el?.focus();
  }, [lines, rangeOpenIds]);

  useEffect(() => {
    if (!focusNewDose.current) return;
    const el = document.getElementById(`${idPrefix}-dose-${focusNewDose.current}`);
    focusNewDose.current = null;
    el?.focus();
  }, [idPrefix, lines]);

  const announce = (message: string) => {
    if (liveRef.current) liveRef.current.textContent = message;
  };

  const updateLine = (id: string, patch: Partial<RegimenLineDraft>) => {
    onChange(lines.map((l) => (l.clientId === id ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    if (lines.length >= MAX_REGIMEN_LINES) return;
    const last = lines[lines.length - 1];
    const next = emptyRegimenLine({
      form: last?.form,
      frequency: last?.frequency || '',
      prn: false,
      doseFrom: '',
      durationValue: null,
      durationUnit: last?.durationUnit ?? 'DAY',
    });
    next.clientId = newClientId();
    next.sequence = lines.length + 1;
    focusNewDose.current = next.clientId;
    onChange([...lines, next]);
    announce(`Dosing schedule ${next.sequence} added.`);
  };

  const expandRange = (line: RegimenLineDraft) => {
    focusDoseTo.current = line.clientId;
    setRangeOpenIds((prev) => {
      const next = new Set(prev);
      next.add(line.clientId);
      return next;
    });
    if (line.doseTo == null) {
      updateLine(line.clientId, { doseTo: '' });
    }
    announce('Dose range added. Enter the maximum dose.');
  };

  const collapseRange = (line: RegimenLineDraft) => {
    if (line.doseTo?.trim()) {
      setPendingCollapseId(line.clientId);
      return;
    }
    setRangeOpenIds((prev) => {
      const next = new Set(prev);
      next.delete(line.clientId);
      return next;
    });
    updateLine(line.clientId, { doseTo: null });
  };

  const confirmCollapseRange = (id: string) => {
    setRangeOpenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    updateLine(id, { doseTo: null });
    setPendingCollapseId(null);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setRangeOpenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onChange(
      lines.filter((l) => l.clientId !== id).map((l, i) => ({ ...l, sequence: i + 1 })),
    );
    announce('Dosing schedule removed.');
  };

  return (
    <>
      <EditorCard title="Dosing schedule" badge={sourceBadge}>
        <div ref={liveRef} className="sr-only" aria-live="polite" />
        <div>
          {lines.map((line, idx) => {
            const rangeOn = rangeIsOpen(line, rangeOpenIds);
            const rangeError =
              errors?.[`regimenLines.${idx}.doseTo`] ??
              (rangeOn ? doseRangeInvalid(line.doseFrom, line.doseTo) ?? undefined : undefined);
            const durationError = errors?.[`regimenLines.${idx}.durationValue`];
            const durationUnit = line.durationUnit ?? 'DAY';

            return (
              <div key={line.clientId}>
                {sequential && idx > 0 ? (
                  <div className="relative ml-[13px] flex h-8 items-center">
                    <div className="absolute inset-y-0 left-0 w-px bg-[#c5e4e1]" aria-hidden />
                    <span className="relative z-[1] -ml-[13px] inline-flex min-w-[3.25rem] items-center justify-center rounded-md bg-[#e8f1fb] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#2f5f8f]">
                      THEN
                    </span>
                  </div>
                ) : null}

                <div
                  className={cn(
                    'flex items-start gap-2.5',
                    action === 'REVIEW_REQUIRED' && 'opacity-85',
                  )}
                >
                  {sequential ? (
                    <span
                      className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-[12px] font-bold text-white"
                      aria-hidden
                    >
                      {idx + 1}
                    </span>
                  ) : null}

                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2.5">
                    <span
                      className={cn(
                        'shrink-0 text-[13.5px] font-semibold',
                        action === 'REVIEW_REQUIRED' ? 'text-amber-800' : 'text-[#1e3a5f]',
                      )}
                    >
                      {actionLabel}
                    </span>

                    <Input
                      id={`${idPrefix}-dose-${line.clientId}`}
                      value={line.doseFrom ?? ''}
                      inputMode={/^\d/.test(draftString(line.doseFrom).trim()) ? 'decimal' : 'text'}
                      disabled={disabled}
                      aria-label={
                        rangeOn
                          ? `Dose from for dosing schedule ${idx + 1}`
                          : `Dose amount for dosing schedule ${idx + 1}`
                      }
                      aria-invalid={Boolean(errors?.[`regimenLines.${idx}.doseFrom`])}
                      onChange={(e) => updateLine(line.clientId, { doseFrom: e.target.value })}
                      className={editorInputCompactClass}
                    />

                    {rangeOn ? (
                      <>
                        <span className="text-[13px] text-[#667085]">to</span>
                        <Input
                          id={`dose-to-${line.clientId}`}
                          value={line.doseTo ?? ''}
                          inputMode="decimal"
                          disabled={disabled}
                          aria-label={`Dose to for dosing schedule ${idx + 1}`}
                          aria-invalid={Boolean(rangeError)}
                          onChange={(e) => updateLine(line.clientId, { doseTo: e.target.value })}
                          className={editorInputCompactClass}
                        />
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => collapseRange(line)}
                          className="text-[12px] font-semibold text-[#3d6b9a] hover:underline"
                        >
                          Remove dose range
                        </button>
                      </>
                    ) : null}

                    <SearchableSelect
                      id={`${idPrefix}-unit-${line.clientId}`}
                      {...unitSelectBinding('form', line.form, unitOptions)}
                      placeholder="Unit"
                      searchPlaceholder="Search unit…"
                      emptyMessage="No units"
                      disabled={disabled}
                      aria-label={`Dose unit for dosing schedule ${idx + 1}`}
                      aria-invalid={Boolean(errors?.[`regimenLines.${idx}.form`])}
                      onChange={(v) => updateLine(line.clientId, { form: v })}
                      className="min-w-[7.5rem] max-w-[11rem]"
                    />

                    <TimingSelector
                      id={`${idPrefix}-timing-${line.clientId}`}
                      value={line.frequency}
                      configuration={timingConfig}
                      disabled={disabled}
                      invalid={Boolean(errors?.[`regimenLines.${idx}.frequency`])}
                      onChange={(v) => updateLine(line.clientId, { frequency: v })}
                    />

                    {sequential ? (
                      <>
                        <span className="shrink-0 text-[13.5px] font-medium text-[#344054]">for</span>
                        <DurationValueInput
                          id={`${idPrefix}-duration-${line.clientId}`}
                          value={line.durationValue ?? ''}
                          disabled={disabled}
                          invalid={Boolean(durationError)}
                          ariaLabel={`Duration for dosing schedule ${idx + 1}`}
                          onChange={(value) =>
                            updateLine(line.clientId, {
                              durationValue: value.trim() || null,
                              durationUnit,
                            })
                          }
                        />
                        <DurationUnitSelect
                          value={durationUnit}
                          count={line.durationValue}
                          disabled={disabled}
                          invalid={Boolean(errors?.[`regimenLines.${idx}.durationUnit`])}
                          ariaLabel={`Duration unit for dosing schedule ${idx + 1}`}
                          onChange={(unit: DurationUnit) =>
                            updateLine(line.clientId, { durationUnit: unit })
                          }
                        />
                      </>
                    ) : null}

                    <div className="inline-flex shrink-0 items-center gap-2 pl-0.5">
                      <Switch
                        id={`${idPrefix}-prn-${line.clientId}`}
                        checked={line.prn}
                        disabled={disabled}
                        aria-label={`PRN — use as needed for dosing schedule ${idx + 1}`}
                        className="data-[state=checked]:bg-[#0F817C]"
                        onCheckedChange={(checked) => updateLine(line.clientId, { prn: checked })}
                      />
                      <label
                        htmlFor={`${idPrefix}-prn-${line.clientId}`}
                        className="whitespace-nowrap text-[13px] font-semibold text-[#1e3a5f]"
                      >
                        PRN
                      </label>
                    </div>

                    {sequential ? (
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Remove dosing schedule ${idx + 1}`}
                        onClick={() => removeLine(line.clientId)}
                        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#98a2b3] transition-colors hover:bg-[#f4f7f8] hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
                {sequential && durationError ? (
                  <p className="ml-9 mt-1.5 text-[12px] font-medium text-destructive" role="alert">
                    {durationError}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <OutlineActionButton
            label="Add dose range (e.g., 1–2 tablets)"
            disabled={disabled || !firstWithoutRange}
            onClick={() => firstWithoutRange && expandRange(firstWithoutRange)}
          />
          <OutlineActionButton
            label="Add another dosing schedule"
            disabled={disabled || lines.length >= MAX_REGIMEN_LINES}
            onClick={addLine}
          />
        </div>

        {limitsSummary ? (
          <p className="mt-3.5 border-t border-[#eef2f4] pt-3 text-[12.5px] leading-snug text-[#667085]">
            <span className="font-semibold text-[#344054]">Limits:</span>{' '}
            {limitsSummary.replace(/^Limits:\s*/i, '')}
            <EditLinkButton
              label="Edit"
              onClick={onEditLimits ?? (() => setLimitsOpen(true))}
              className="ml-2"
            />
          </p>
        ) : null}
      </EditorCard>

      <ConfirmDialog
        open={Boolean(pendingCollapseId)}
        onOpenChange={(open) => !open && setPendingCollapseId(null)}
        title="Remove dose range?"
        description="This clears the upper dose limit and keeps a single dose amount."
        confirmLabel="Remove range"
        onConfirm={() => {
          if (pendingCollapseId) confirmCollapseRange(pendingCollapseId);
        }}
      />

      {limitsOpen ? (
        <ConfirmDialog
          open={limitsOpen}
          onOpenChange={setLimitsOpen}
          title="Dosing guidance"
          description={
            limitsSummary ||
            'No additional dosing guidance is available for this product.'
          }
          confirmLabel="Close"
          onConfirm={() => setLimitsOpen(false)}
        />
      ) : null}
    </>
  );
}
