'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, type SelectOptionGroup } from '@/components/ui/select';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';
import { IsoDateField } from '../iso-date-field';
import {
  buildMonitoringResultSaveBody,
  hydrateMonitoringResultDraft,
  isoDateLocal,
  monitoringResultDraftsEqual,
  monitoringResultEditorKind,
  monitoringResultPlaceholders,
  resolveMonitoringItem,
  unitsForMonitoringItem,
  validateMonitoringResultDraft,
  type MonitoringResultDraft,
  type MonitoringResultSaveBody,
  type RenewMonitoringRequirement,
} from '@safescript/shared';

const SOURCE_LABELS = [
  'Netcare',
  'Pharmacy record',
  'Patient',
  'Prescriber',
  'Lab report',
  'Other',
] as const;

const FIELD =
  'h-10 rounded-[10px] border-[#C5D0D4] shadow-none focus-visible:border-[#0F6F6B]/40 focus-visible:ring-[#0F6F6B]/20';

export type { MonitoringResultSaveBody };

export function MonitoringResultDialog({
  open,
  items,
  initialCode,
  saving,
  onClose,
  onSave,
  onRequestUnavailable,
}: {
  open: boolean;
  items: RenewMonitoringRequirement[];
  initialCode: string | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (inputCode: string, body: MonitoringResultSaveBody) => void;
  onRequestUnavailable: (inputCode: string) => void;
}) {
  const formId = useId();
  const firstInputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const baselineRef = useRef<MonitoringResultDraft | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(initialCode);
  const [draft, setDraft] = useState<MonitoringResultDraft>(() => ({
    systolic: '',
    diastolic: '',
    numeric: '',
    text: '',
    unit: '',
    observedDate: '',
    sourceLabel: '',
  }));
  const [error, setError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const row = resolveMonitoringItem(items, selectedCode);
  const kind = monitoringResultEditorKind(row?.valueShape);
  const busy = Boolean(saving);

  const itemOptions = useMemo(() => monitoringSelectModel(items), [items]);
  const unitOptions = useMemo(() => (row ? unitsForMonitoringItem(row) : []), [row]);
  const placeholders = useMemo(
    () =>
      row
        ? monitoringResultPlaceholders(row.inputCode, row.valueShape)
        : { primary: 'Value' as const },
    [row],
  );
  const sourceOptions = useMemo(
    () => sourceSelectOptions(draft.sourceLabel || row?.result.sourceLabel),
    [draft.sourceLabel, row?.result.sourceLabel],
  );

  const patchDraft = (patch: Partial<MonitoringResultDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const applyItem = (next: RenewMonitoringRequirement, carry?: Pick<MonitoringResultDraft, 'observedDate' | 'sourceLabel'>) => {
    const nextDraft = hydrateMonitoringResultDraft(next, carry);
    setSelectedCode(next.inputCode);
    setDraft(nextDraft);
    baselineRef.current = nextDraft;
    setError(null);
    setPendingCode(null);
  };

  useEffect(() => {
    if (!open) {
      setError(null);
      setPendingCode(null);
      baselineRef.current = null;
      return;
    }
    const initial = resolveMonitoringItem(items, initialCode);
    if (!initial) return;
    applyItem(initial);
    // Hydrate once when the dialog opens for an item, not on parent refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCode]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (kind === 'yes_no') selectRef.current?.focus();
      else firstInputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, selectedCode, kind]);

  if (!row) return null;

  const dirty = Boolean(baselineRef.current && !monitoringResultDraftsEqual(draft, baselineRef.current));
  const resultErrorId = `${formId}-result-error`;
  const dateId = `${formId}-date`;
  const sourceId = `${formId}-source`;
  const itemId = `${formId}-item`;

  const requestSelect = (nextCode: string) => {
    if (!nextCode || nextCode === row.inputCode) return;
    const next = resolveMonitoringItem(items, nextCode);
    if (!next) return;
    if (dirty) {
      setPendingCode(nextCode);
      return;
    }
    applyItem(next, { observedDate: draft.observedDate, sourceLabel: draft.sourceLabel });
  };

  const submitResult = () => {
    const nextError = validateMonitoringResultDraft(row, draft);
    if (nextError) {
      setError(nextError);
      firstInputRef.current?.focus();
      return;
    }
    setError(null);
    onSave(row.inputCode, buildMonitoringResultSaveBody(row, draft));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
        <DialogContent className="max-w-[440px] gap-5 p-6 sm:rounded-2xl">
          <DialogHeader className="space-y-1 pr-6">
            <DialogTitle className="text-[17px] font-semibold text-[#163447]">
              Edit monitoring result
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter the most recent result for {row.label}
              {row.medicationNames.length ? ` (${row.medicationNames.join(', ')})` : ''}.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitResult();
            }}
          >
            {row.result.status === 'UNAVAILABLE' ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Currently marked unavailable. Save a result to replace it.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={itemId} className="text-[13px] text-[#344054]">
                Monitoring item
              </Label>
              <Select
                id={itemId}
                value={row.inputCode}
                disabled={busy}
                options={itemOptions.options}
                groups={itemOptions.groups}
                onChange={(event) => requestSelect(event.target.value)}
                className={cn(FIELD, 'bg-white')}
              />
              {row.medicationNames.length ? (
                <p className="text-[12px] text-[#7a8b94]">Applies to {row.medicationNames.join(', ')}</p>
              ) : null}
            </div>

            <div className="space-y-1.5" key={row.inputCode}>
              <Label htmlFor={`${formId}-result`} className="text-[13px] text-[#344054]">
                Result
              </Label>
              {kind === 'systolic_diastolic' ? (
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    ref={firstInputRef}
                    id={`${formId}-result`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={placeholders.primary}
                    aria-label="Systolic"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? resultErrorId : undefined}
                    value={draft.systolic}
                    onChange={(event) => patchDraft({ systolic: sanitizeInteger(event.target.value) })}
                    className={cn(FIELD, 'min-w-0 flex-1')}
                  />
                  <span className="shrink-0 text-sm font-medium text-[#667085]" aria-hidden>
                    /
                  </span>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={placeholders.secondary ?? '78'}
                    aria-label="Diastolic"
                    aria-invalid={Boolean(error)}
                    value={draft.diastolic}
                    onChange={(event) => patchDraft({ diastolic: sanitizeInteger(event.target.value) })}
                    className={cn(FIELD, 'min-w-0 flex-1')}
                  />
                  <UnitSelect options={unitOptions} value={draft.unit} onChange={(unit) => patchDraft({ unit })} />
                </div>
              ) : kind === 'numeric' ? (
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    ref={firstInputRef}
                    id={`${formId}-result`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={placeholders.primary}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? resultErrorId : undefined}
                    value={draft.numeric}
                    onChange={(event) => patchDraft({ numeric: sanitizeDecimal(event.target.value) })}
                    className={cn(FIELD, 'min-w-0 flex-1')}
                  />
                  <UnitSelect options={unitOptions} value={draft.unit} onChange={(unit) => patchDraft({ unit })} />
                </div>
              ) : kind === 'yes_no' ? (
                <Select
                  ref={selectRef}
                  id={`${formId}-result`}
                  value={draft.text}
                  disabled={busy}
                  placeholder="Select"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? resultErrorId : undefined}
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                  onChange={(event) => patchDraft({ text: event.target.value })}
                  className={cn(FIELD, 'bg-white')}
                />
              ) : (
                <Input
                  ref={firstInputRef}
                  id={`${formId}-result`}
                  autoComplete="off"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? resultErrorId : undefined}
                  value={draft.text}
                  onChange={(event) => patchDraft({ text: event.target.value })}
                  className={FIELD}
                />
              )}
              {error ? (
                <p id={resultErrorId} className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={dateId} className="text-[13px] text-[#344054]">
                Date measured
              </Label>
              <IsoDateField
                id={dateId}
                value={draft.observedDate}
                onChange={(observedDate) => patchDraft({ observedDate })}
                disabled={busy}
                max={isoDateLocal()}
                aria-label="Date measured"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={sourceId} className="text-[13px] text-[#344054]">
                Source <span className="font-normal text-[#7a8b94]">(optional)</span>
              </Label>
              <Select
                id={sourceId}
                value={draft.sourceLabel}
                disabled={busy}
                placeholder="Select source"
                options={sourceOptions}
                onChange={(event) => patchDraft({ sourceLabel: event.target.value })}
                className={cn(FIELD, 'bg-white')}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={busy}
                onClick={() => onRequestUnavailable(row.inputCode)}
                className="min-h-10 text-left text-sm font-medium text-[#5b6b75] underline-offset-2 hover:text-[#163447] hover:underline disabled:opacity-50"
              >
                Result not available
              </button>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="h-10 px-4">
                  Cancel
                </Button>
                <ClinicalPrimaryButton type="submit" loading={saving} disabled={busy} className="h-10 rounded-lg px-4">
                  Save changes
                </ClinicalPrimaryButton>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingCode)}
        onOpenChange={(next) => {
          if (!next) setPendingCode(null);
        }}
        variant="default"
        title="Discard unsaved result?"
        description="You have unsaved changes for this monitoring item. Switching parameters will discard them."
        confirmLabel="Switch item"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const next = resolveMonitoringItem(items, pendingCode);
          if (next) applyItem(next);
        }}
      />
    </>
  );
}

function monitoringSelectModel(items: RenewMonitoringRequirement[]): {
  options: Array<{ value: string; label: string }>;
  groups?: SelectOptionGroup[];
} {
  const options = items.map((item) => ({ value: item.inputCode, label: item.label }));
  const hasVitals = items.some((item) => item.inputType === 'VITAL');
  const hasLabs = items.some((item) => item.inputType === 'LAB');
  if (!hasVitals || !hasLabs) return { options };

  const groups: SelectOptionGroup[] = [
    {
      label: 'Vitals',
      options: items
        .filter((item) => item.inputType === 'VITAL')
        .map((item) => ({ value: item.inputCode, label: item.label })),
    },
    {
      label: 'Labs',
      options: items
        .filter((item) => item.inputType === 'LAB')
        .map((item) => ({ value: item.inputCode, label: item.label })),
    },
  ].filter((group) => group.options.length > 0);

  return { options: [], groups };
}

function UnitSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  if (!options.length) return null;
  return (
    <Select
      aria-label="Unit"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={options.map((option) => ({ value: option, label: option }))}
      className={cn(
        FIELD,
        'bg-white',
        options.some((option) => option.length > 8) ? 'w-[158px]' : 'w-[108px]',
      )}
    />
  );
}

function sourceSelectOptions(current: string | null | undefined) {
  const labels = [...SOURCE_LABELS];
  if (current && !labels.includes(current as (typeof SOURCE_LABELS)[number])) {
    return [{ value: current, label: current }, ...labels.map((label) => ({ value: label, label }))];
  }
  return labels.map((label) => ({ value: label, label }));
}

function sanitizeInteger(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned.slice(0, 8);
  const whole = cleaned.slice(0, firstDot).slice(0, 6);
  const fraction = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 3);
  return `${whole}.${fraction}`;
}
