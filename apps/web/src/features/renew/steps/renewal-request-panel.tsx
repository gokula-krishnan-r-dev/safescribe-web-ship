'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  RENEW_DURATION_OPTIONS,
  RENEW_REASON_OPTIONS,
  RENEW_VERIFIED_FROM_OPTIONS,
  type RenewDurationId,
  type RenewReasonId,
  type RenewRequestState,
  type RenewVerifiedFromId,
} from '@safescript/shared';
import { SelectChip } from '../select-chip';

function SectionLegend({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <legend className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
        {n}
      </span>
      <span className="text-[15px] font-semibold leading-[22px] text-[#102a43]">{children}</span>
    </legend>
  );
}

export function RenewalRequestPanel({
  value,
  onChange,
  disabled,
}: {
  value: RenewRequestState;
  onChange: (next: RenewRequestState) => void;
  disabled?: boolean;
}) {
  const toggleReason = (id: RenewReasonId) => {
    const next = value.reasons.includes(id)
      ? value.reasons.filter((r) => r !== id)
      : [...value.reasons, id];
    onChange({ ...value, reasons: next });
  };

  return (
    <div className={cn(disabled && 'pointer-events-none opacity-50')}>
      <fieldset className="renew-request-section">
        <SectionLegend n={1}>Requested duration</SectionLegend>
        <div className="renew-chip-wrap">
          {RENEW_DURATION_OPTIONS.map((opt) => (
            <SelectChip
              key={opt.id}
              label={opt.label}
              selected={value.requestedDuration === opt.id}
              onClick={() => onChange({ ...value, requestedDuration: opt.id as RenewDurationId })}
            />
          ))}
        </div>
        {value.requestedDuration === 'custom' ? (
          <div className="mt-3 flex items-end gap-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#52677a]">
                Custom duration
              </label>
              <Input
                inputMode="numeric"
                className="h-10 w-[88px] rounded-[10px]"
                value={value.customDurationDays != null ? String(value.customDurationDays) : ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    customDurationDays: e.target.value.trim()
                      ? Number(e.target.value) || null
                      : null,
                  })
                }
                placeholder="21"
                aria-label="Custom duration in days"
              />
            </div>
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#d9e4e8] bg-[#f7fbfb] px-3 text-sm text-[#52677a]">
              days
            </span>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="renew-request-section">
        <SectionLegend n={2}>Why is renewal needed?</SectionLegend>
        <div className="renew-chip-wrap">
          {RENEW_REASON_OPTIONS.map((opt) => (
            <SelectChip
              key={opt.id}
              multi
              label={opt.label}
              selected={value.reasons.includes(opt.id)}
              onClick={() => toggleReason(opt.id)}
            />
          ))}
        </div>
        {value.reasons.includes('other') ? (
          <div className="mt-3 max-w-md">
            <label className="mb-1.5 block text-[12px] font-medium text-[#52677a]">Other reason</label>
            <Input
              value={value.otherReasonText ?? ''}
              onChange={(e) => onChange({ ...value, otherReasonText: e.target.value })}
              placeholder="Specify other reason"
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="renew-request-section">
        <SectionLegend n={3}>Therapy verified from</SectionLegend>
        <div className="renew-chip-wrap">
          {RENEW_VERIFIED_FROM_OPTIONS.map((opt) => (
            <SelectChip
              key={opt.id}
              multi
              label={opt.label}
              selected={value.verifiedFrom === opt.id}
              onClick={() =>
                onChange({
                  ...value,
                  verifiedFrom:
                    value.verifiedFrom === opt.id ? null : (opt.id as RenewVerifiedFromId),
                })
              }
            />
          ))}
        </div>
        {value.verifiedFrom === 'other' ? (
          <div className="mt-3 max-w-md">
            <label className="mb-1.5 block text-[12px] font-medium text-[#52677a]">Other source</label>
            <Input
              value={value.otherVerifiedText ?? ''}
              onChange={(e) => onChange({ ...value, otherVerifiedText: e.target.value })}
              placeholder="Specify source"
            />
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}
