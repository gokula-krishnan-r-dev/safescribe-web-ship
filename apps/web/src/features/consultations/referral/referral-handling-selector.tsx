'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  MANUAL_REFERRAL_HANDLING_METHODS,
  REFERRAL_HANDLING_DETAIL_MAX,
  REFERRAL_HANDLING_OPTION_LABELS,
  referralHandlingLabel,
  type ManualReferralHandlingMethod,
  type ReferralHandlingMethod,
} from '@safescript/shared';

interface Props {
  method: ReferralHandlingMethod | null;
  detail: string;
  faxLocked?: boolean;
  disabled?: boolean;
  changing?: boolean;
  onChangeMethod: (method: ManualReferralHandlingMethod) => void;
  onChangeDetail: (detail: string) => void;
  onCommitDetail?: (detail: string) => void;
  onStartChange?: () => void;
}

export function ReferralHandlingSelector({
  method,
  detail,
  faxLocked,
  disabled,
  changing,
  onChangeMethod,
  onChangeDetail,
  onCommitDetail,
  onStartChange,
}: Props) {
  const groupId = useId();
  const recorded = Boolean(method) && !changing;

  if (faxLocked && method === 'FAXED_FROM_SAFESCRIBE') {
    return (
      <p className="text-[13.5px] leading-relaxed text-foreground">
        <span className="font-semibold">Letter delivery:</span>{' '}
        {referralHandlingLabel(method, detail)}
      </p>
    );
  }

  if (recorded) {
    return (
      <p className="text-[13.5px] leading-relaxed text-foreground">
        <span className="font-semibold">Letter delivery:</span>{' '}
        {referralHandlingLabel(method, detail)}
        {onStartChange ? (
          <>
            {' '}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              disabled={disabled}
              onClick={onStartChange}
            >
              Change
            </button>
          </>
        ) : null}
      </p>
    );
  }

  return (
    <fieldset className="min-w-0 space-y-2.5" disabled={disabled}>
      <legend className="text-[14px] font-semibold text-foreground">
        How was the referral handled?
      </legend>
      <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={groupId}>
        {MANUAL_REFERRAL_HANDLING_METHODS.map((value) => {
          const selected = method === value;
          return (
            <label
              key={value}
              className={cn(
                'inline-flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2 text-[13.5px] font-medium',
                selected
                  ? 'border-primary bg-[#F0FAF9] shadow-[0_0_0_1px_rgba(15,118,110,0.12)]'
                  : 'border-[#D5DEE1] hover:border-primary/35',
              )}
            >
              <input
                type="radio"
                name={groupId}
                className="accent-primary"
                checked={selected}
                onChange={() => onChangeMethod(value)}
              />
              {REFERRAL_HANDLING_OPTION_LABELS[value]}
            </label>
          );
        })}
      </div>
      {method === 'SENT_ANOTHER_WAY' ? (
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor={`${groupId}-detail`}>
            Method or details
          </label>
          <Input
            id={`${groupId}-detail`}
            value={detail}
            maxLength={REFERRAL_HANDLING_DETAIL_MAX}
            placeholder="For example, secure email or external fax service"
            onChange={(e) => onChangeDetail(e.target.value.slice(0, REFERRAL_HANDLING_DETAIL_MAX))}
            onBlur={() => onCommitDetail?.(detail)}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
