'use client';

import { CheckCircle2, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  ManualReferralHandlingMethod,
  ReferralHandlingMethod,
  ReferralLetterStatus,
} from '@safescript/shared';
import { ReferralHandlingSelector } from './referral-handling-selector';

export type ReferralLetterUiStatus = ReferralLetterStatus | 'void';

interface ReferralFooterActionsProps {
  letterStatus: ReferralLetterUiStatus;
  formValid: boolean;
  canComplete: boolean;
  saving?: boolean;
  creatingLetter?: boolean;
  approvingLetter?: boolean;
  destinationLabel?: string;
  handlingMethod?: ReferralHandlingMethod | null;
  handlingDetail?: string;
  handlingFaxLocked?: boolean;
  changingHandling?: boolean;
  onChangeHandlingMethod?: (method: ManualReferralHandlingMethod) => void;
  onChangeHandlingDetail?: (detail: string) => void;
  onCommitHandlingDetail?: (detail: string) => void;
  onStartChangeHandling?: () => void;
  onDocumentComplete: () => void;
  onLetterAction: () => void;
  className?: string;
}

function letterActionLabel(
  status: ReferralLetterUiStatus,
  creating: boolean,
): string {
  if (creating) return 'Creating letter…';
  switch (status) {
    case 'approved':
    case 'finalized':
      return 'View or edit letter';
    case 'stale':
      return 'Update referral letter';
    case 'draft':
      return 'Review referral letter';
    case 'generation_failed':
      return 'Retry referral letter';
    default:
      return 'Create referral letter';
  }
}

function completeHelper(params: {
  formValid: boolean;
  letterStatus: ReferralLetterUiStatus;
  canComplete: boolean;
  handlingRecorded: boolean;
}): string | null {
  if (!params.formValid) return 'Complete the required referral fields to create a letter.';
  if (params.letterStatus !== 'approved' && params.letterStatus !== 'finalized') {
    return 'Approve the current referral letter to continue.';
  }
  if (!params.handlingRecorded) return 'Record how the referral was handled.';
  if (!params.canComplete) return 'Resolve the highlighted referral information.';
  return null;
}

export function ReferralFooterActions({
  letterStatus,
  formValid,
  canComplete,
  saving,
  creatingLetter,
  approvingLetter,
  destinationLabel,
  handlingMethod = null,
  handlingDetail = '',
  handlingFaxLocked,
  changingHandling,
  onChangeHandlingMethod,
  onChangeHandlingDetail,
  onCommitHandlingDetail,
  onStartChangeHandling,
  onDocumentComplete,
  onLetterAction,
  className,
}: ReferralFooterActionsProps) {
  const busy = Boolean(saving || creatingLetter || approvingLetter);
  const letterPrimary =
    !canComplete &&
    formValid &&
    (letterStatus === 'not_created' ||
      letterStatus === 'stale' ||
      letterStatus === 'generation_failed' ||
      letterStatus === 'draft');
  const completePrimary = canComplete && !busy;
  const letterEnabled = formValid && !busy;
  const completeEnabled = canComplete && !busy;
  const approved = letterStatus === 'approved' || letterStatus === 'finalized';
  const showStale = letterStatus === 'stale';
  const handlingRecorded = Boolean(handlingMethod) && !changingHandling;
  const helper = completeHelper({
    formValid,
    letterStatus,
    canComplete,
    handlingRecorded,
  });

  return (
    <div className={cn('space-y-3', className)}>
      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
        <span>Treatment and Documentation remain locked after referral completion.</span>
      </p>

      {approved ? (
        <div
          role="status"
          className="space-y-3 rounded-lg border border-primary/20 bg-[#F0FAF9] px-3.5 py-3"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-[13.5px] font-semibold text-primary">Referral letter approved</p>
              {destinationLabel ? (
                <p className="text-[13px] text-foreground">
                  <span className="font-semibold">Patient directed to:</span> {destinationLabel}
                </p>
              ) : null}
            </div>
          </div>
          {onChangeHandlingMethod && onChangeHandlingDetail ? (
            <ReferralHandlingSelector
              method={handlingMethod}
              detail={handlingDetail}
              faxLocked={handlingFaxLocked}
              disabled={busy}
              changing={changingHandling}
              onChangeMethod={onChangeHandlingMethod}
              onChangeDetail={onChangeHandlingDetail}
              onCommitDetail={onCommitHandlingDetail}
              onStartChange={onStartChangeHandling}
            />
          ) : null}
        </div>
      ) : null}

      {showStale ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium text-amber-900"
        >
          Referral details changed — update the letter before completing.
        </div>
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-2.5 sm:flex-row sm:items-center',
          completePrimary && 'max-sm:flex-col-reverse',
        )}
      >
        <Button
          type="button"
          onClick={onLetterAction}
          disabled={!letterEnabled}
          aria-disabled={!letterEnabled}
          className={cn(
            'h-11 min-h-11 min-w-[200px] rounded-md px-5 text-sm font-semibold shadow-none',
            letterPrimary
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-primary/50 bg-card text-primary hover:bg-primary/5',
          )}
          variant={letterPrimary ? 'default' : 'outline'}
        >
          {creatingLetter ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating letter…
            </>
          ) : (
            letterActionLabel(letterStatus, false)
          )}
        </Button>

        <Button
          type="button"
          onClick={onDocumentComplete}
          disabled={!completeEnabled}
          aria-disabled={!completeEnabled}
          className={cn(
            'h-11 min-h-11 min-w-[180px] rounded-md px-5 text-sm font-semibold shadow-none',
            completePrimary
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-transparent bg-muted text-muted-foreground',
          )}
          variant={completePrimary ? 'default' : 'secondary'}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Completing…
            </>
          ) : (
            'Complete consultation'
          )}
        </Button>
      </div>

      {helper && !completeEnabled ? (
        <p className="text-[12.5px] text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
