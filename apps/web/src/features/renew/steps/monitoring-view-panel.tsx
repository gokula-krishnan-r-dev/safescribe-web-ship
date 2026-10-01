'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Pencil } from 'lucide-react';
import {
  buildMonitoringResultSaveBody,
  buildMonitoringViewDetails,
  hydrateMonitoringResultDraft,
  isoDateLocal,
  monitoringResultEditorKind,
  monitoringResultPlaceholders,
  unitsForMonitoringItem,
  validateMonitoringResultDraft,
  type MonitoringResultDraft,
  type MonitoringResultSaveBody,
  type MonitoringRowPresentation,
  type RenewMonitoringRequirement,
} from '@safescript/shared';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { IsoDateField } from '../iso-date-field';

const SOURCE_OPTIONS = [
  { value: 'Lab report', label: 'Lab report' },
  { value: 'Netcare', label: 'Netcare' },
  { value: 'Pharmacy record', label: 'Pharmacy record' },
  { value: 'Patient', label: 'Patient' },
  { value: 'Prescriber', label: 'Prescriber' },
  { value: 'Pharmacist entered', label: 'Pharmacist entered' },
  { value: 'Other', label: 'Other' },
];

const FIELD =
  'h-10 rounded-[10px] border-[#C5D0D4] bg-white shadow-none focus-visible:border-[#0F6F6B]/40 focus-visible:ring-[#0F6F6B]/20';

export function MonitoringViewPanel({
  row,
  presentation,
  saving,
  onEditResult,
  onClose,
}: {
  row: RenewMonitoringRequirement;
  presentation: MonitoringRowPresentation;
  saving?: boolean;
  onEditResult: (body: MonitoringResultSaveBody) => void;
  onClose: () => void;
}) {
  const details = useMemo(() => buildMonitoringViewDetails(row, presentation), [row, presentation]);
  const [editing, setEditing] = useState(false);

  if (editing && details.canEdit) {
    return (
      <InlineResultEditor
        row={row}
        saving={saving}
        onCancel={() => setEditing(false)}
        onSave={(body) => onEditResult(body)}
      />
    );
  }

  return (
    <section
      id={`monitoring-details-${row.inputCode}`}
      className="rounded-[12px] border border-[#cfe8d8] bg-[#f4faf6] px-5 py-4"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="text-[15px] font-semibold text-[#163447]">{details.title}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ee] px-2.5 py-0.5 text-[12px] font-semibold text-[#027A48]">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {details.interpretationLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
        {details.fields.map((field) => (
          <div key={field.key} className="min-w-0">
            <p className="text-[12px] font-medium text-[#7a8b94]">{field.label}</p>
            <p className="mt-0.5 text-[14px] font-semibold leading-5 text-[#163447]">{field.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="inline-flex items-start gap-1.5 text-[13px] leading-5 text-[#3d7a55]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {details.clinicalSummary}
        </p>
        <div className="flex shrink-0 items-center justify-end gap-4">
          {details.canEdit ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0F6F6B] hover:underline"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit result
            </button>
          ) : null}
          <button
            type="button"
            className="text-[13px] font-semibold text-[#0F6F6B] hover:underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </section>
  );
}

function InlineResultEditor({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: RenewMonitoringRequirement;
  saving?: boolean;
  onCancel: () => void;
  onSave: (body: MonitoringResultSaveBody) => void;
}) {
  const kind = monitoringResultEditorKind(row.valueShape);
  const units = unitsForMonitoringItem(row);
  const placeholders = monitoringResultPlaceholders(row.inputCode, row.valueShape);
  const [draft, setDraft] = useState<MonitoringResultDraft>(() => hydrateMonitoringResultDraft(row));
  const [error, setError] = useState<string | null>(null);
  const sourceOptions = useMemo(() => {
    const current = draft.sourceLabel.trim();
    if (current && !SOURCE_OPTIONS.some((option) => option.value === current)) {
      return [{ value: current, label: current }, ...SOURCE_OPTIONS];
    }
    return SOURCE_OPTIONS;
  }, [draft.sourceLabel]);

  const patch = (next: Partial<MonitoringResultDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...next }));
  };

  const submit = () => {
    const nextError = validateMonitoringResultDraft(row, draft);
    if (nextError) {
      setError(nextError);
      return;
    }
    onSave(buildMonitoringResultSaveBody(row, draft));
  };

  return (
    <section
      id={`monitoring-details-${row.inputCode}`}
      className="rounded-[12px] border border-[#cfe8d8] bg-[#f4faf6] px-5 py-4"
    >
      <p className="text-[15px] font-semibold text-[#163447]">Edit {row.label.toLowerCase()} result</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 sm:col-span-1">
          <p className="mb-1.5 text-[12px] font-medium text-[#5b6b75]">Value</p>
          {kind === 'systolic_diastolic' ? (
            <div className="flex items-center gap-2">
              <Input
                inputMode="numeric"
                autoComplete="off"
                aria-label="Systolic"
                placeholder={placeholders.primary}
                value={draft.systolic}
                onChange={(event) => patch({ systolic: sanitizeInteger(event.target.value) })}
                className={cn(FIELD, 'min-w-0 flex-1')}
              />
              <span className="text-sm text-[#667085]">/</span>
              <Input
                inputMode="numeric"
                autoComplete="off"
                aria-label="Diastolic"
                placeholder={placeholders.secondary ?? '78'}
                value={draft.diastolic}
                onChange={(event) => patch({ diastolic: sanitizeInteger(event.target.value) })}
                className={cn(FIELD, 'min-w-0 flex-1')}
              />
            </div>
          ) : kind === 'numeric' ? (
            <Input
              inputMode="decimal"
              autoComplete="off"
              aria-label={`${row.label} value`}
              placeholder={placeholders.primary}
              value={draft.numeric}
              onChange={(event) => patch({ numeric: sanitizeDecimal(event.target.value) })}
              className={FIELD}
            />
          ) : kind === 'yes_no' ? (
            <Select
              aria-label={row.label}
              value={draft.text}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              onChange={(event) => patch({ text: event.target.value })}
              className={cn(FIELD, 'bg-white')}
            />
          ) : (
            <Input
              autoComplete="off"
              aria-label={row.label}
              value={draft.text}
              onChange={(event) => patch({ text: event.target.value })}
              className={FIELD}
            />
          )}
        </div>
        {units.length ? (
          <div className="min-w-0">
            <p className="mb-1.5 text-[12px] font-medium text-[#5b6b75]">Unit</p>
            <Select
              aria-label="Unit"
              value={draft.unit}
              options={units.map((unit) => ({ value: unit, label: unit }))}
              onChange={(event) => patch({ unit: event.target.value })}
              className={cn(FIELD, 'bg-white')}
            />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="mb-1.5 text-[12px] font-medium text-[#5b6b75]">Date</p>
          <IsoDateField
            id="monitoring-view-date"
            value={draft.observedDate}
            onChange={(observedDate) => patch({ observedDate })}
            max={isoDateLocal()}
            aria-label="Date"
          />
        </div>
        <div className="min-w-0 sm:col-span-3">
          <p className="mb-1.5 text-[12px] font-medium text-[#5b6b75]">
            Source <span className="font-normal text-[#7a8b94]">Optional</span>
          </p>
          <Select
            aria-label="Source"
            value={draft.sourceLabel}
            placeholder="Select source"
            options={sourceOptions}
            onChange={(event) => patch({ sourceLabel: event.target.value })}
            className={cn(FIELD, 'max-w-sm bg-white')}
          />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className="h-9 px-3 text-[13px] font-semibold text-[#0F6F6B] hover:underline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <ClinicalPrimaryButton type="button" className="h-9 rounded-lg px-4" loading={saving} onClick={submit}>
          Save
        </ClinicalPrimaryButton>
      </div>
    </section>
  );
}

function sanitizeInteger(raw: string): string {
  return raw.replace(/[^\d]/g, '').slice(0, 3);
}

function sanitizeDecimal(raw: string): string {
  const next = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = next.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}
