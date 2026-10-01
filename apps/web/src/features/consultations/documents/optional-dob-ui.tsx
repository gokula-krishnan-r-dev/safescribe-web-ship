'use client';

import { AlertTriangle, CircleAlert, Loader2, Lock } from 'lucide-react';
import { displayDob } from '@safescript/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ConfirmedAge, OptionalDobValidationResult } from '@safescript/shared';
import { formatConfirmedAge, mismatchAlertCopy } from '@safescript/shared';

export function OptionalDobMismatchAlert({
  result,
  onRemove,
  onReviewAge,
}: {
  result: OptionalDobValidationResult;
  onRemove: () => void;
  onReviewAge: () => void;
}) {
  const copy = mismatchAlertCopy(result);
  if (!copy || !result.derivedAge || !result.recordedAge) return null;

  return (
    <div
      className="rounded-[12px] border border-[#f0c7c7] bg-[#fdeeee] px-4 py-3.5"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#c2410c]"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15px] font-bold leading-snug text-[#b42318]">
            {copy.heading}
          </p>
          <p className="mt-1.5 text-[14px] leading-[1.45] text-[#7f1d1d]">
            This DOB indicates an age of{' '}
            <strong className="font-semibold">{formatConfirmedAge(result.derivedAge)}</strong>
            , but{' '}
            <strong className="font-semibold">{formatConfirmedAge(result.recordedAge)}</strong>
            {' '}was recorded at intake.
          </p>
          <p className="mt-1 text-[13px] leading-[1.45] text-[#9f3a3a]">
            {copy.support}
          </p>
          <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="button"
              onClick={onRemove}
              className={cn(
                'inline-flex h-10 items-center justify-center rounded-[9px] border border-[#0f817c] bg-white px-4',
                'text-[14px] font-semibold text-[#0f6f6a]',
                'hover:bg-[#f3fbfb]',
                'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,129,124,0.25)]',
                'max-[640px]:w-full',
              )}
            >
              Remove DOB and continue
            </button>
            <button
              type="button"
              onClick={onReviewAge}
              className="inline-flex min-h-10 items-center justify-center text-[14px] font-semibold text-[#0f7e99] underline underline-offset-[3px] hover:text-[#0b6478] max-[640px]:w-full"
            >
              DOB is correct — review age
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentActionLockHint() {
  return (
    <p className="mt-2.5 flex items-start gap-1.5 text-[13px] leading-[1.45] text-[#66727d]">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a96a1]" aria-hidden />
      Document actions remain unavailable until this mismatch is resolved.
    </p>
  );
}

export function OptionalDobFieldStatus({
  invalid,
}: {
  invalid: boolean;
}) {
  if (!invalid) return null;
  return (
    <CircleAlert
      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#dc2626]"
      aria-hidden
    />
  );
}

export function OptionalDobNetworkError({
  onRetry,
  onRemove,
}: {
  onRetry: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rounded-[12px] border border-[#f0c7c7] bg-[#fdeeee] px-4 py-3.5"
      role="alert"
    >
      <p className="m-0 text-[14px] leading-[1.45] text-[#7f1d1d]">
        DOB could not be verified. Try again or remove it to continue without DOB.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center justify-center rounded-[9px] bg-[#0f7f98] px-4 text-[14px] font-semibold text-white hover:bg-[#0c6f86]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-10 items-center justify-center text-[14px] font-semibold text-[#0f7e99] underline underline-offset-[3px]"
        >
          Remove DOB and continue
        </button>
      </div>
    </div>
  );
}

export function OptionalDobValidatingHint() {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#66727d]" aria-live="polite">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      Checking DOB against recorded age…
    </p>
  );
}

export function AgeDobResolutionDialog({
  open,
  onOpenChange,
  dob,
  derivedAge,
  recordedAge,
  resolving,
  onUseDob,
  onKeepAge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dob: string;
  derivedAge: ConfirmedAge;
  recordedAge: ConfirmedAge;
  resolving: boolean;
  onUseDob: () => void;
  onKeepAge: () => void;
}) {
  const recordedLabel = formatConfirmedAge(recordedAge);
  const derivedLabel = formatConfirmedAge(derivedAge);
  const dobLabel = displayDob(dob) || dob;

  return (
    <Dialog open={open} onOpenChange={resolving ? () => undefined : onOpenChange}>
      <DialogContent hideCloseButton={resolving} className="max-w-[520px] gap-0 p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-3 px-6 pb-2 pt-6 text-left">
          <DialogTitle className="text-[20px] font-bold tracking-tight text-[#111827]">
            Confirm the patient’s age
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-[1.5] text-[#3f4c57]">
            The entered DOB, <strong className="font-semibold text-[#111827]">{dobLabel}</strong>,
            indicates an age of{' '}
            <strong className="font-semibold text-[#111827]">{derivedLabel}</strong>. The
            consultation used{' '}
            <strong className="font-semibold text-[#111827]">{recordedLabel}</strong>.
          </DialogDescription>
        </DialogHeader>
        <p className="px-6 pb-5 text-[14px] leading-[1.5] text-[#52606d]">
          Using this DOB will update the patient’s clinical age and recheck affected eligibility,
          treatment, dosing and safety information. You will not need to repeat the consultation.
        </p>
        <DialogFooter className="flex-col gap-2 border-t border-[#e5eef1] bg-[#f8fbfc] px-6 py-4 sm:flex-col sm:space-x-0">
          <button
            type="button"
            disabled={resolving}
            onClick={onUseDob}
            className="inline-flex h-11 w-full items-center justify-center rounded-[9px] bg-[#0f7f98] text-[15px] font-bold text-white hover:bg-[#0c6f86] disabled:opacity-60"
          >
            {resolving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Updating age…
              </>
            ) : (
              'Use DOB and recheck affected items'
            )}
          </button>
          <button
            type="button"
            disabled={resolving}
            onClick={onKeepAge}
            className="inline-flex h-11 w-full items-center justify-center rounded-[9px] border border-[#aebfc5] bg-white text-[15px] font-semibold text-[#25303b] hover:bg-[#f7fafb] disabled:opacity-60"
          >
            Keep age {recordedAge.value} and remove DOB
          </button>
          <button
            type="button"
            disabled={resolving}
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 w-full items-center justify-center text-[14px] font-medium text-[#52606d] hover:text-[#111827] disabled:opacity-60"
          >
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
