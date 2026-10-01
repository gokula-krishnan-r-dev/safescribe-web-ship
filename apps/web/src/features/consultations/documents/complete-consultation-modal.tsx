'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export type CompleteConsultationModalState =
  | 'confirm'
  | 'deleting'
  | 'success'
  | 'error';

export type ReferralCompletionSummary = {
  destinationLabel: string;
  letterLabel: string;
  communicationLabel: string;
};

interface CompleteConsultationModalProps {
  open: boolean;
  consultationId: string;
  /** Server-owned deletion deadline (ISO). Used for a11y; display copy stays fixed. */
  deletionDeadline?: string | null;
  onClose: () => void;
  /** Performs server deletion + client cleanup. Throw on failure. */
  onConfirmDelete: () => Promise<void>;
  /** Called after success UI (~900ms). Navigate to the next consult or list. */
  onCompleted: () => void;
  /** When true, success copy indicates a new consultation is opening. */
  startingNext?: boolean;
  variant?: 'default' | 'referral';
  referralSummary?: ReferralCompletionSummary | null;
}

/**
 * Privacy-critical completion confirmation.
 * Visual source of truth: approved Complete Consultation modal mock.
 * No patient/clinical content may appear in this dialog.
 */
export function CompleteConsultationModal({
  open,
  consultationId,
  deletionDeadline,
  onClose,
  onConfirmDelete,
  onCompleted,
  startingNext = true,
  variant = 'default',
  referralSummary = null,
}: CompleteConsultationModalProps) {
  const titleId = 'complete-consultation-title';
  const checkboxId = useId();
  const [documentationConfirmed, setDocumentationConfirmed] = useState(false);
  const [status, setStatus] = useState<CompleteConsultationModalState>('confirm');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setDocumentationConfirmed(false);
    setStatus('confirm');
    setErrorMessage(null);
    submittingRef.current = false;
  }, [open, consultationId]);

  useEffect(() => {
    if (status !== 'success') return;
    const timer = window.setTimeout(() => {
      onCompleted();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [status, onCompleted]);

  const busy = status === 'deleting';
  const canSubmit = documentationConfirmed && status === 'confirm' && !busy;

  const handleClose = () => {
    if (busy || status === 'success') return;
    onClose();
  };

  const handleComplete = async () => {
    if (!documentationConfirmed || submittingRef.current || status === 'deleting') return;
    submittingRef.current = true;
    setStatus('deleting');
    setErrorMessage(null);
    try {
      await onConfirmDelete();
      setStatus('success');
    } catch (err) {
      setErrorMessage(
        getErrorMessage(
          err,
          'SafeScribe could not complete this consultation. Your session was not deleted — try again.',
        ),
      );
      setStatus('error');
      submittingRef.current = false;
    }
  };

  const deadlineLabel = deletionDeadline
    ? new Date(deletionDeadline).toLocaleString('en-CA', {
        timeZone: 'America/Edmonton',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : '12:00 midnight MT';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        hideCloseButton
        overlayClassName="bg-[rgba(10,30,50,0.48)] backdrop-blur-[2px]"
        className={cn(
          // Match mock: 560–600px, soft radius, generous padding
          'w-[min(600px,calc(100vw-24px))] max-w-[600px] gap-0 overflow-y-auto rounded-[18px] border border-[#d5e2e6] bg-white p-0',
          'shadow-[0_24px_60px_rgba(15,23,42,0.22)] sm:w-[min(600px,calc(100vw-32px))]',
        )}
        onEscapeKeyDown={(e) => {
          if (busy || status === 'success') e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy || status === 'success') e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy || status === 'success') e.preventDefault();
        }}
      >
        {status === 'success' ? (
          <SuccessBody startingNext={startingNext} />
        ) : status === 'error' ? (
          <ErrorBody
            message={errorMessage}
            onCancel={handleClose}
            onRetry={() => {
              setErrorMessage(null);
              setStatus('confirm');
            }}
          />
        ) : (
          <div className="px-7 py-8 sm:px-8 sm:py-9">
            {/* Centered shield — mock hierarchy */}
            <div className="flex flex-col items-center text-center">
              <div
                className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#008CA4] text-white shadow-[0_6px_16px_rgba(0,140,164,0.28)]"
                aria-hidden
              >
                <ShieldCheck className="h-7 w-7" strokeWidth={2.25} />
              </div>

              <DialogTitle
                id={titleId}
                className="mt-4 text-[22px] font-bold leading-snug tracking-tight text-[#111827]"
              >
                {variant === 'referral' ? 'Complete referral consultation?' : 'Complete Consultation?'}
              </DialogTitle>

              <DialogDescription className="mt-2.5 max-w-[440px] text-[14.5px] leading-relaxed text-[#52606d]">
                {variant === 'referral'
                  ? 'Confirm the referral outcome and ensure any required documentation has been saved to the pharmacy record.'
                  : 'Before completing this consultation, make sure any required documentation has been saved to your pharmacy record.'}
              </DialogDescription>
            </div>

            {variant === 'referral' && referralSummary ? (
              <div className="mt-6 overflow-hidden rounded-[12px] border border-[#d5e2e6] bg-[#f5f8fa] text-left">
                <dl>
                  {[
                    ['Patient directed to', referralSummary.destinationLabel],
                    ['Referral letter', referralSummary.letterLabel],
                    ['Communication', referralSummary.communicationLabel],
                  ].map(([label, value], index) => (
                    <div
                      key={label}
                      className={cn(
                        'grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3 px-4 py-2.5 text-[13.5px]',
                        index > 0 && 'border-t border-[#e2eaed]',
                      )}
                    >
                      <dt className="font-semibold text-[#3e4b55]">{label}</dt>
                      <dd className="font-medium text-[#111827]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {/* Amber permanent-deletion warning */}
            <div
              role="status"
              className="mt-6 flex items-start gap-3 rounded-[12px] border border-[#F2D38A] bg-[#FFF8E8] px-3.5 py-3.5 text-left"
            >
              <AlertTriangle
                className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#C47A00]"
                aria-hidden
              />
              <p className="text-[13.5px] font-medium leading-relaxed text-[#7A4E00]">
                When you complete this consultation, temporary consultation data will be permanently
                deleted from SafeScribe and cannot be recovered.
              </p>
            </div>

            {/* Clock + automatic deletion */}
            <div
              className="mt-3.5 flex items-start gap-2.5 text-left"
              aria-label={`Automatic deletion deadline: ${deadlineLabel}`}
            >
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#008CA4]" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-[#3e4b55]">
                If you do not complete it now, consultation data will be automatically deleted at{' '}
                <span className="font-semibold">12:00 midnight MT</span>.
              </p>
            </div>

            {variant === 'referral' ? <RetentionInfoNote /> : null}

            {/* Required pharmacist attestation — never auto-checked */}
            <label
              htmlFor={checkboxId}
              className={cn(
                'mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border border-[#d5e2e6] bg-[#fafcfc] px-3.5 py-3.5 text-left',
                'focus-within:ring-2 focus-within:ring-[#008CA4]/30',
                busy && 'pointer-events-none opacity-60',
              )}
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={documentationConfirmed}
                disabled={busy}
                onChange={(e) => setDocumentationConfirmed(e.target.checked)}
                onKeyDown={(e) => {
                  // Enter on checkbox must not submit the destructive action
                  if (e.key === 'Enter') e.preventDefault();
                }}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-[#aebfc5] text-[#008CA4] accent-[#008CA4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008CA4]/45"
                aria-required="true"
              />
              <span className="text-[14px] font-medium leading-snug text-[#1f2937]">
                I have saved any required documentation to the pharmacy record.{' '}
                <span className="font-bold text-[#c62828]" aria-hidden>
                  *
                </span>
                <span className="sr-only">(required)</span>
              </span>
            </label>

            {variant !== 'referral' ? <RetentionInfoNote /> : null}

            {/* Actions — Cancel left, Complete & Delete right; stack on narrow */}
            <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-stretch">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={handleClose}
                className="h-12 min-h-12 flex-1 rounded-[10px] border-[#c5d0d6] bg-white px-5 text-[15px] font-semibold text-[#1e293b] hover:bg-[#f7fafb]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canSubmit}
                onClick={() => void handleComplete()}
                className={cn(
                  'h-12 min-h-12 flex-1 rounded-[10px] px-5 text-[15px] font-semibold text-white shadow-none',
                  canSubmit
                    ? 'bg-[#008CA4] hover:bg-[#007a8f]'
                    : 'cursor-not-allowed bg-[#008CA4]/45 hover:bg-[#008CA4]/45',
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Completing consultation…
                  </>
                ) : (
                  'Complete & Delete'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RetentionInfoNote() {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-[#B9DCEB] bg-[#F2F9FD] px-3.5 py-3 text-left">
      <span
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#008CA4]/15 text-[11px] font-bold text-[#008CA4]"
        aria-hidden
      >
        i
      </span>
      <p className="text-[13.5px] leading-relaxed text-[#3e4b55]">
        Copying, downloading, printing, or faxing documents does not delete the consultation.
      </p>
    </div>
  );
}

function SuccessBody({ startingNext }: { startingNext?: boolean }) {
  return (
    <div className="flex flex-col items-center px-8 py-11 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f6f5] text-[#008CA4]">
        {startingNext ? (
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        ) : (
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        )}
      </div>
      <h2 className="mt-4 text-[22px] font-bold text-[#111827]">Consultation completed</h2>
      <p className="mt-2 max-w-sm text-[14.5px] leading-relaxed text-[#52606d]">
        {startingNext
          ? 'Temporary data deleted. Opening a new consultation…'
          : 'Temporary consultation data has been deleted from SafeScribe.'}
      </p>
    </div>
  );
}

function ErrorBody({
  message,
  onCancel,
  onRetry,
}: {
  message?: string | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="px-7 py-8 sm:px-8">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fff5f5] text-[#b4232a]">
          <AlertTriangle className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-[#111827]">
          We couldn&apos;t complete the consultation
        </h2>
        <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-[#52606d]">
          {message?.trim() ||
            'SafeScribe could not complete this consultation. Your session was not deleted — please try again.'}
        </p>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[#7a8691]">
          Nothing was permanently removed. You can fix the issue and try again, or cancel and stay
          on Documents.
        </p>
      </div>
      <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-12 min-h-12 flex-1 rounded-[10px] border-[#c5d0d6] bg-white text-[15px] font-semibold"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onRetry}
          className="h-12 min-h-12 flex-1 rounded-[10px] bg-[#008CA4] text-[15px] font-semibold text-white hover:bg-[#007a8f]"
        >
          Try Again
        </Button>
      </div>
    </div>
  );
}
