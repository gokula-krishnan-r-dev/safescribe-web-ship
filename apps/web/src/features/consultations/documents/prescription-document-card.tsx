'use client';

import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Pill,
  Printer,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentMeta, DocumentState } from './types';
import { isDocumentReviewed } from './types';
import { DocumentStatusBadge } from './documents-review-ui';

interface Props {
  def: DocumentMeta;
  state: DocumentState;
  generating?: boolean;
  creating?: boolean;
  /** When false, show the compact “Create printable prescription” row. */
  included: boolean;
  /** Prescription treatment was selected — create + review is required to complete. */
  required?: boolean;
  medicationLabel?: string;
  onCreate: () => void;
  onReviewEdit: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onFax?: () => void;
  actionsLocked?: boolean;
  onLockedAction?: () => void;
}

/**
 * Prescription card matching the Consultation Documents mock:
 * create CTA + open document, then full review actions after create.
 */
export function PrescriptionDocumentCard({
  def,
  state,
  generating = false,
  creating = false,
  included,
  required = false,
  medicationLabel,
  onCreate,
  onReviewEdit,
  onPrint,
  onDownload,
  onFax,
  actionsLocked = false,
  onLockedAction,
}: Props) {
  const reviewed = isDocumentReviewed(state);
  const busy =
    generating ||
    creating ||
    state.status === 'GENERATING' ||
    state.status === 'preparing';
  const failed =
    state.status === 'GENERATION_FAILED' || state.status === 'error';
  const canExport = reviewed && !busy && !failed;

  const runLocked = (fn: () => void) => {
    if (actionsLocked) {
      onLockedAction?.();
      return;
    }
    fn();
  };

  // ── Compact create state (matches mock) ───────────────────────────────────
  if (!included) {
    return (
      <article
        className={cn(
          'prescription-create-card grid grid-cols-1 items-start gap-4 rounded-xl border border-[#cbdde2] bg-white p-4',
          'shadow-[0_2px_4px_rgba(15,23,42,0.06)] sm:p-5',
          'min-[901px]:grid-cols-[52px_minmax(0,1fr)_minmax(200px,220px)]',
        )}
      >
        <div className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl bg-[#fff7ed]">
          <Pill className="h-5 w-5 text-[#c2410c]" aria-hidden />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 text-[18px] font-bold leading-[1.35] text-[#111827]">
              {def.name}
            </h3>
            {actionsLocked ? (
              <span className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c7dde2] bg-white px-[11px] text-[13px] font-semibold text-[#0f6f6b]">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Locked
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[15px] leading-[1.45] text-[#58636f]">
            {required
              ? 'Required for the selected treatment. Create and review it before completing this consultation.'
              : 'Create a printable prescription if needed.'}
          </p>
          {medicationLabel ? (
            <p className="mt-2 text-[13.5px] font-semibold text-[#0f7e99]">
              Selected: {medicationLabel}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2.5 max-[900px]:col-span-full">
          <button
            type="button"
            onClick={() => runLocked(onCreate)}
            disabled={busy && !actionsLocked}
            aria-disabled={busy || actionsLocked}
            className={cn(
              'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-[#0f766e] bg-[#0f766e] px-[13px]',
              'text-[14px] font-semibold text-white hover:bg-[#0c5e5b]',
              'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,129,124,0.22)]',
              'disabled:pointer-events-none disabled:opacity-55',
              (busy || actionsLocked) && 'cursor-not-allowed opacity-55',
            )}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : actionsLocked ? (
              <>
                <Lock className="h-4 w-4" aria-hidden />
                Create printable prescription
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" aria-hidden />
                Create printable prescription
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => runLocked(onReviewEdit)}
            disabled={busy && !actionsLocked}
            aria-disabled={busy || actionsLocked}
            className={cn(
              'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-[#0f7e99] bg-white px-[13px]',
              'text-[14px] font-semibold text-[#0f7e99] hover:bg-[#f0f9fb]',
              'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,126,153,0.25)]',
              'disabled:pointer-events-none disabled:opacity-55',
              (busy || actionsLocked) && 'cursor-not-allowed opacity-55',
            )}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open document
          </button>
        </div>
      </article>
    );
  }

  // ── Created / review state — same card language as other documents ────────
  return (
    <article
      className={cn(
        'prescription-panel grid grid-cols-1 items-start gap-4 rounded-xl border border-[#cbdde2] bg-white p-4',
        'shadow-[0_2px_4px_rgba(15,23,42,0.07)] sm:p-5',
        'min-[901px]:grid-cols-[52px_minmax(0,1fr)_minmax(200px,220px)]',
      )}
    >
      <div className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl bg-[#fff7ed]">
        <Pill className="h-5 w-5 text-[#c2410c]" aria-hidden />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="m-0 text-[18px] font-bold leading-[1.35] text-[#111827]">
            {def.name}
          </h3>
          <DocumentStatusBadge status={state.status} />
          {actionsLocked ? (
            <span className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c7dde2] bg-white px-[11px] text-[13px] font-semibold text-[#0f6f6b]">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Locked
            </span>
          ) : null}
        </div>
        <p className="mt-[7px] text-[15px] leading-[1.45] text-[#58636f]">
          {reviewed
            ? 'Prescription reviewed and ready to print, download, or fax.'
            : 'Review the prescription before finishing.'}
        </p>
        {medicationLabel ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0f7e99]">
            <Check className="h-3.5 w-3.5 text-[#0f766e]" aria-hidden />
            Selected: {medicationLabel}
          </p>
        ) : null}
        {!failed ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              disabled={!canExport && !actionsLocked}
              onClick={() => runLocked(onPrint)}
              className={cn(
                'inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0f7e99] hover:underline',
                !canExport && 'cursor-not-allowed opacity-45 hover:no-underline',
              )}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Print / Download PDF
            </button>
            {onFax ? (
              <button
                type="button"
                disabled={!canExport && !actionsLocked}
                onClick={() => runLocked(onFax)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0f7e99] hover:underline',
                  !canExport && 'cursor-not-allowed opacity-45 hover:no-underline',
                )}
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Fax
              </button>
            ) : null}
          </div>
        ) : null}
        {failed && state.error ? (
          <p className="mt-2 text-[13px] text-[#b4232a]" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2.5 max-[900px]:col-span-full">
        <ActionBtn
          label="Open document"
          icon={Pencil}
          primary
          disabled={busy || failed}
          locked={actionsLocked}
          onLockedClick={onLockedAction}
          onClick={onReviewEdit}
        />
        <ActionBtn
          label="Print / Download PDF"
          icon={Download}
          disabled={!canExport}
          locked={actionsLocked}
          onLockedClick={onLockedAction}
          onClick={onPrint}
        />
      </div>
    </article>
  );
}

function ActionBtn({
  label,
  icon: Icon,
  primary,
  disabled,
  locked,
  onLockedClick,
  onClick,
}: {
  label: string;
  icon: typeof Pencil;
  primary?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onLockedClick?: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled && !locked}
      aria-disabled={disabled || locked}
      onClick={(e) => {
        e.stopPropagation();
        if (locked) {
          onLockedClick?.();
          return;
        }
        if (disabled) return;
        onClick();
      }}
      className={cn(
        'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border px-[13px] text-[14px] font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,129,124,0.22)]',
        'disabled:pointer-events-none disabled:opacity-45',
        (disabled || locked) && 'opacity-45',
        locked && 'cursor-not-allowed',
        primary
          ? 'border-[#0f766e] bg-[#0f766e] text-white hover:bg-[#0c5e5b]'
          : 'border-[#0f7e99] bg-white text-[#0f7e99] hover:bg-[#f0f9fb]',
      )}
    >
      {locked ? <Lock className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
      {label}
    </button>
  );
}
