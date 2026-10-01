'use client';

import { CheckCircle2, ExternalLink, Info, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { INTAKE_COPY, PRIVACY_POLICY_URL } from './intake-copy';

type Props = {
  obtained: boolean;
  onChange: (next: boolean) => void;
};

export function IntakeConsentBanner({ obtained, onChange }: Props) {
  return (
    <div
      className={cn(
        'rounded-[12px] border px-4 py-3 sm:px-5',
        obtained
          ? 'border-[#b7e0db] bg-[#eef8f6]'
          : 'border-[#9fd4cf] bg-[#f3fbfb] shadow-[0_0_0_1px_rgba(126,201,196,0.28)]',
      )}
      role="group"
      aria-labelledby="patient-consent-label"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              obtained ? 'bg-[#d8f1ee] text-[#0f6f6b]' : 'bg-white text-[#0f6f6b] shadow-sm',
            )}
            aria-hidden
          >
            {obtained ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </span>
          <div className="min-w-0 space-y-1">
            <label
              id="patient-consent-label"
              className="inline-flex cursor-pointer items-center gap-2.5 select-none"
            >
              <input
                type="checkbox"
                checked={obtained}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-[#AEBFC4] accent-[#0F766E]"
                aria-describedby="patient-consent-helper"
              />
              <span className="text-[15px] font-semibold text-[#0f6f6b]">
                {INTAKE_COPY.consentLabel}
              </span>
            </label>
            <p
              id="patient-consent-helper"
              className="max-w-[52rem] text-[13px] leading-relaxed text-[#3d6f6c]"
            >
              {obtained ? INTAKE_COPY.consentConfirmed : INTAKE_COPY.consentLocked}
            </p>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[#1d6b9a] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {INTAKE_COPY.explainLink}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(100vw-2rem,380px)] rounded-xl border-[#d5e2e6] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
          >
            <p className="text-[14px] font-semibold text-[#111827]">
              {INTAKE_COPY.consentPopoverTitle}
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#4b5563]">
              {INTAKE_COPY.consentBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#1d6b9a] hover:underline"
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
              {INTAKE_COPY.viewPrivacy}
            </a>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
