'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Info, Loader2, RotateCw } from 'lucide-react';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import {
  parseCustomDurationInput,
  type RenewDurationId,
} from '@safescript/shared';

export function RenewalPlanBulkBar({
  selectedCount,
  durationOptions,
  customLimits,
  requestedDurationId,
  showDurationControls,
  showRenewAll,
  applying,
  renewingAll,
  disabled,
  onApply,
  onRenewAll,
}: {
  selectedCount: number;
  durationOptions: Array<{ id: RenewDurationId; label: string }>;
  customLimits: { min: number; max: number };
  requestedDurationId?: RenewDurationId | null;
  showDurationControls: boolean;
  showRenewAll: boolean;
  applying?: boolean;
  renewingAll?: boolean;
  disabled?: boolean;
  onApply: (durationId: RenewDurationId, customDurationDays: number | null) => void;
  onRenewAll: () => void;
}) {
  const durationFieldId = useId();
  const customFieldId = useId();
  const defaultDuration = useMemo(
    () => requestedDurationId ?? durationOptions[0]?.id ?? '30_days',
    [durationOptions, requestedDurationId],
  );
  const [durationId, setDurationId] = useState<RenewDurationId>(defaultDuration);
  const [customDays, setCustomDays] = useState('');
  const [customTouched, setCustomTouched] = useState(false);

  useEffect(() => {
    setDurationId((current) =>
      durationOptions.some((option) => option.id === current) ? current : defaultDuration,
    );
  }, [defaultDuration, durationOptions]);

  const customParsed = parseCustomDurationInput(customDays);
  const customError = durationId === 'custom' && customTouched ? customParsed.error : null;
  const canApply =
    Boolean(durationId) &&
    (durationId !== 'custom' || !customParsed.error) &&
    !applying &&
    !disabled &&
    selectedCount >= 2;

  if (!showDurationControls && !showRenewAll) return null;

  return (
    <div className="space-y-2 rounded-xl border border-[#d7e2e6] bg-[#f7fafb] px-3.5 py-3 sm:px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-[#163447]">
            Selected medications: <span className="font-semibold tabular-nums">{selectedCount}</span>
          </p>
          {showDurationControls ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
                <label htmlFor={durationFieldId} className="mb-1 block text-[12px] font-medium text-[#5b6b75]">
                  Set duration for selected
                </label>
                <select
                  id={durationFieldId}
                  className="h-9 w-full rounded-md border border-[#d7e2e6] bg-white px-2.5 text-[13px] text-[#163447]"
                  value={durationId}
                  disabled={disabled || applying}
                  onChange={(event) => {
                    setDurationId(event.target.value as RenewDurationId);
                    setCustomTouched(false);
                  }}
                >
                  {durationOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.id === 'custom' ? '…' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {durationId === 'custom' ? (
                <div>
                  <label htmlFor={customFieldId} className="mb-1 block text-[12px] font-medium text-[#5b6b75]">
                    Days
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={customFieldId}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={customLimits.min}
                      className="h-9 w-20 rounded-md border border-[#d7e2e6] bg-white px-2.5 text-[13px] tabular-nums text-[#163447]"
                      value={customDays}
                      disabled={disabled || applying}
                      aria-invalid={Boolean(customError)}
                      aria-describedby={customError ? `${customFieldId}-error` : undefined}
                      onChange={(event) => {
                        setCustomDays(event.target.value);
                        setCustomTouched(true);
                      }}
                    />
                    <span className="text-[13px] text-[#5b6b75]">days</span>
                  </div>
                </div>
              ) : null}
              <ClinicalPrimaryButton
                className="h-9 px-3.5 text-[13px]"
                disabled={!canApply}
                loading={applying}
                onClick={() => {
                  if (durationId === 'custom') {
                    setCustomTouched(true);
                    if (customParsed.error || customParsed.days == null) return;
                    onApply(durationId, customParsed.days);
                    return;
                  }
                  onApply(durationId, null);
                }}
              >
                Apply to selected
              </ClinicalPrimaryButton>
            </div>
          ) : null}
        </div>
        {showRenewAll ? (
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-md border border-[#d7e2e6] bg-white px-3 text-[13px] font-medium text-[#163447] hover:bg-white/80 disabled:opacity-50 lg:self-end"
            disabled={disabled || renewingAll}
            onClick={onRenewAll}
          >
            {renewingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            Renew all eligible
          </button>
        ) : null}
      </div>
      {customError ? (
        <p id={`${customFieldId}-error`} className="text-[12px] text-amber-800">
          {customError}
        </p>
      ) : null}
      {showDurationControls ? (
        <p
          className="flex items-start gap-1.5 text-[12px] text-[#5b6b75]"
          title="Each medication is validated individually against the applicable renewal rules."
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Applied where eligible. Individual medications can still be adjusted below.
        </p>
      ) : null}
    </div>
  );
}
