'use client';

import { useId } from 'react';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ReferralUrgencyCode } from '@safescript/shared';

export interface ReferralTriggerDisplay {
  id: string;
  label: string;
  urgencyCode: ReferralUrgencyCode;
}

interface ReferralAlertCardProps {
  urgencyDisplay: string;
  triggers: ReferralTriggerDisplay[];
  onReferralOptions: () => void;
  onChangeAnswer: () => void;
  onContinueWithoutReferral: () => void;
  className?: string;
}

export function ReferralAlertCard({
  urgencyDisplay,
  triggers,
  onReferralOptions,
  onChangeAnswer,
  onContinueWithoutReferral,
  className,
}: ReferralAlertCardProps) {
  const headingId = useId();
  const hasMultiple = triggers.length > 1;
  const summary = hasMultiple
    ? `${triggers.length} red flags triggered`
    : `Triggered red flag: ${triggers[0]?.label ?? 'Safety criterion'}`;

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      aria-live="polite"
      className={cn(
        'rounded-xl border border-destructive/35 bg-destructive/[0.06] px-4 py-4 sm:px-5 sm:py-[18px]',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15"
            aria-hidden
          >
            <ShieldAlert className="h-5 w-5 text-destructive" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2
              id={headingId}
              className="m-0 text-[17px] font-bold leading-snug tracking-tight text-destructive sm:text-[18px]"
            >
              {urgencyDisplay}
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-destructive/80">{summary}</p>
            {hasMultiple ? (
              <ul className="mt-2 space-y-1">
                {triggers.map((trigger) => (
                  <li
                    key={trigger.id}
                    className="flex items-start gap-2 text-[13.5px] text-destructive/80"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-destructive/70" />
                    <span>{trigger.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-end sm:pt-0.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={onReferralOptions}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
            >
              Referral options
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onChangeAnswer}
              className="h-10 rounded-lg border-primary/40 bg-card px-4 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              Change answer
            </Button>
          </div>
          <button
            type="button"
            onClick={onContinueWithoutReferral}
            className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[13.5px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Continue without referral
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
