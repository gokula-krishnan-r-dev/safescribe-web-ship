'use client';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Pill,
  Printer,
  Send,
  Shield,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DocumentAction,
  DocumentMeta,
  DocumentState,
  DocumentStatus,
  DocumentTypeId,
} from './types';
import { isDocumentReviewed } from './types';

const DOC_ICON_STYLES: Record<
  DocumentTypeId,
  { wrap: string; icon: string; Icon: LucideIcon }
> = {
  consultation_note: {
    wrap: 'bg-[#eff9f8]',
    icon: 'text-[#0f766e]',
    Icon: FileText,
  },
  prescription: {
    wrap: 'bg-[#fff7ed]',
    icon: 'text-[#c2410c]',
    Icon: Pill,
  },
  prescriber_communication: {
    wrap: 'bg-[#eef6fb]',
    icon: 'text-[#0f7e99]',
    Icon: Mail,
  },
  patient_care_summary: {
    wrap: 'bg-[#f3effa]',
    icon: 'text-[#6d28d9]',
    Icon: User,
  },
};

export function DocumentProgressSummary({
  generatedCount,
  reviewedCount,
  totalCount,
}: {
  generatedCount: number;
  reviewedCount: number;
  totalCount: number;
}) {
  const allReviewed =
    totalCount > 0 && reviewedCount >= totalCount && generatedCount >= totalCount;
  const label = allReviewed
    ? 'All required documents reviewed'
    : `${generatedCount} document${generatedCount === 1 ? '' : 's'} generated · ${reviewedCount} reviewed`;

  return (
    <div
      className="document-progress-summary inline-flex min-h-[52px] items-center gap-[11px] rounded-[10px] border border-[#c7dde2] bg-[#f6fbfb] px-[17px] text-[14px] font-semibold text-[#25303b]"
      aria-live="polite"
    >
      <FileText className="h-4 w-4 shrink-0 text-[#0f766e]" aria-hidden />
      {label}
    </div>
  );
}

export function DocumentReviewBanner({
  remainingRequired,
  prescriptionBlocker,
}: {
  remainingRequired: number;
  prescriptionBlocker?: 'create' | 'review' | null;
}) {
  if (prescriptionBlocker === 'create') {
    return (
      <div
        role="alert"
        className="document-review-banner mt-[18px] flex min-h-[52px] items-start gap-2.5 rounded-[9px] border border-[#efc57f] bg-[#fff8eb] px-4 py-3 text-[14px] text-[#9a5600]"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Create and review the Prescription first</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#9a5600]/90">
            A prescription treatment was selected. Create the printable prescription and
            mark it reviewed before you can complete and delete this consultation.
          </p>
        </div>
      </div>
    );
  }

  if (prescriptionBlocker === 'review') {
    return (
      <div
        role="alert"
        className="document-review-banner mt-[18px] flex min-h-[52px] items-start gap-2.5 rounded-[9px] border border-[#efc57f] bg-[#fff8eb] px-4 py-3 text-[14px] text-[#9a5600]"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Review the Prescription before completing</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#9a5600]/90">
            Open the Prescription, confirm the details, and mark it reviewed. Complete
            &amp; Delete stays unavailable until then.
          </p>
        </div>
      </div>
    );
  }

  if (remainingRequired <= 0) {
    return (
      <div className="document-review-banner complete mt-[18px] flex min-h-[52px] items-center gap-2.5 rounded-[9px] border border-[#acd8d5] bg-[#f2faf9] px-4 py-3 text-[14px] text-[#0f6f6b]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">All required documents reviewed</p>
          <p className="mt-0.5 text-[13px] text-[#0f6f6b]/90">
            The consultation can now be completed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="document-review-banner mt-[18px] flex min-h-[52px] items-center gap-2.5 rounded-[9px] border border-[#b7d3da] bg-[#f4f9fa] px-4 py-3 text-[14px] text-[#3e4b55]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d7e8ed] text-[11px] font-bold text-[#0f7e99]">
        i
      </span>
      <p>Review all required documents before completing this consultation.</p>
    </div>
  );
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  if (
    status === 'REVIEWED'
  ) {
    return (
      <span className="document-status reviewed inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#acd8d5] bg-[#eff9f8] px-[11px] text-[13px] font-semibold text-[#0f6f6b]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Reviewed
      </span>
    );
  }

  if (status === 'GENERATING' || status === 'preparing') {
    return (
      <span className="document-status inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c7dde2] bg-[#f6fbfb] px-[11px] text-[13px] font-semibold text-[#3e4b55]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Generating…
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="document-status inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#d5dee2] bg-[#f8fafb] px-[11px] text-[13px] font-semibold text-[#58636f]">
        Waiting…
      </span>
    );
  }

  if (status === 'GENERATION_FAILED' || status === 'error') {
    return (
      <span className="document-status generation-failed inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e6a6aa] bg-[#fff5f5] px-[11px] text-[13px] font-semibold text-[#b4232a]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Generation failed
      </span>
    );
  }

  if (status === 'SOURCE_CHANGED') {
    return (
      <span className="document-status source-changed inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e6a6aa] bg-[#fff5f5] px-[11px] text-[13px] font-semibold text-[#b4232a]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Update required
      </span>
    );
  }

  if (status === 'UPDATED_REVIEW_REQUIRED') {
    return (
      <span className="document-status updated-review-required inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#efc57f] bg-[#fff8eb] px-[11px] text-[13px] font-semibold text-[#9a5600]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Updated — review again
      </span>
    );
  }

  return (
    <span className="document-status review-required inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#efc57f] bg-[#fff8eb] px-[11px] text-[13px] font-semibold text-[#9a5600]">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Review required
    </span>
  );
}

function ActionButton({
  label,
  ariaLabel,
  icon: Icon,
  primary,
  disabled,
  onClick,
  copied,
  locked,
  onLockedClick,
}: {
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
  primary?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onLockedClick?: () => void;
  onClick: () => void;
  copied?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-disabled={disabled || locked}
      disabled={disabled && !locked}
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
        'document-action inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border px-[13px] text-[14px] font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,129,124,0.22)]',
        'disabled:pointer-events-none disabled:opacity-45',
        (disabled || locked) && 'opacity-45',
        locked && 'cursor-not-allowed',
        primary
          ? 'border-[#0f766e] bg-[#0f766e] text-white hover:bg-[#0c5e5b]'
          : 'border-[#0f7e99] bg-white text-[#0f7e99] hover:bg-[#f0f9fb]',
      )}
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : locked ? (
        <Lock className="h-4 w-4" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {copied ? 'Copied' : label}
    </button>
  );
}

function DocumentTextLink({
  label,
  icon: Icon,
  disabled,
  locked,
  onLockedClick,
  onClick,
  copied,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  locked?: boolean;
  onLockedClick?: () => void;
  onClick: () => void;
  copied?: boolean;
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
        'inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0f7e99] hover:underline',
        'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,126,153,0.25)]',
        (disabled || locked) && 'cursor-not-allowed opacity-45 hover:no-underline',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function DocumentCard({
  def,
  state,
  copied,
  generating,
  onReviewEdit,
  onCopy,
  onDownload,
  onPrint,
  onFax,
  onRetry,
  actionsLocked,
  onLockedAction,
}: {
  def: DocumentMeta;
  state: DocumentState;
  copied: boolean;
  generating: boolean;
  onReviewEdit: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onPrint?: () => void;
  onFax?: () => void;
  onRetry?: () => void;
  actionsLocked?: boolean;
  onLockedAction?: () => void;
}) {
  const style = DOC_ICON_STYLES[def.id] ?? DOC_ICON_STYLES.consultation_note;
  const Icon = style.Icon;
  const reviewed = isDocumentReviewed(state);
  const busy =
    generating ||
    state.status === 'GENERATING' ||
    state.status === 'preparing';
  const failed =
    state.status === 'GENERATION_FAILED' || state.status === 'error';
  const actions = def.actions?.length
    ? def.actions
    : (['reviewEdit', 'download'] as DocumentAction[]);
  const canExport = reviewed && !busy && !failed;

  const secondaryAction = (() => {
    if (actions.includes('fax') && onFax) {
      return {
        key: 'fax' as const,
        label: 'Fax',
        icon: Send,
        onClick: () => onFax(),
        disabled: !canExport,
      };
    }
    if (actions.includes('copyKroll')) {
      return {
        key: 'copyKroll' as const,
        label: 'Copy to Kroll',
        icon: ClipboardCopy,
        onClick: onCopy,
        disabled: !canExport,
      };
    }
    if (actions.includes('copyCommunication') || actions.includes('copy')) {
      return {
        key: 'copy' as const,
        label: 'Copy communication',
        icon: ClipboardCopy,
        onClick: onCopy,
        disabled: !canExport,
      };
    }
    if (actions.includes('printDownload') || actions.includes('print')) {
      return {
        key: 'print' as const,
        label: 'Print / Download PDF',
        icon: Printer,
        onClick: onPrint ?? onDownload,
        disabled: !canExport,
      };
    }
    if (actions.includes('download')) {
      return {
        key: 'download' as const,
        label: 'Download PDF',
        icon: Download,
        onClick: onDownload,
        disabled: !canExport,
      };
    }
    return null;
  })();

  const showPrintLink =
    actions.includes('printDownload') ||
    actions.includes('print') ||
    actions.includes('download');
  const showCopyLink =
    actions.includes('copyKroll') ||
    actions.includes('copyCommunication') ||
    actions.includes('copy');

  return (
    <article
      className={cn(
        'document-card relative grid grid-cols-1 items-start gap-4 rounded-xl border bg-white p-4 shadow-[0_2px_4px_rgba(15,23,42,0.07)] sm:p-5',
        'min-[901px]:grid-cols-[52px_minmax(0,1fr)_minmax(200px,220px)]',
        busy && 'opacity-95',
        actionsLocked
          ? 'cursor-pointer border-[#c7dde2] bg-[#f8fbfc]'
          : 'border-[#cbdde2]',
      )}
      title={
        actionsLocked
          ? 'Save or skip patient details to unlock document actions.'
          : undefined
      }
      aria-disabled={actionsLocked || undefined}
      onClick={
        actionsLocked
          ? (e) => {
              e.preventDefault();
              onLockedAction?.();
            }
          : undefined
      }
    >
      <div
        className={cn(
          'document-icon grid h-[50px] w-[50px] place-items-center rounded-xl',
          style.wrap,
        )}
      >
        <Icon className={cn('h-5 w-5', style.icon)} aria-hidden />
      </div>

      <div className="min-w-0">
        <div className="document-title-row flex flex-wrap items-center gap-2.5">
          <h3 className="document-title m-0 text-[18px] font-bold leading-[1.35] text-[#111827]">
            {def.name}
          </h3>
          {actionsLocked && state.status === 'pending' ? null : (
            <DocumentStatusBadge status={state.status} />
          )}
          {actionsLocked ? (
            <span className="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c7dde2] bg-white px-[11px] text-[13px] font-semibold text-[#0f6f6b]">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Locked
            </span>
          ) : null}
        </div>
        {def.description ? (
          <p className="document-description mt-[7px] text-[15px] leading-[1.45] text-[#58636f]">
            {def.description}
          </p>
        ) : null}
        {def.bullets && def.bullets.length > 0 ? (
          <ul className="document-feature-list mt-3 flex flex-wrap items-center gap-x-[18px] gap-y-2 p-0 text-[13px] text-[#58636f]">
            {def.bullets.slice(0, 4).map((b) => (
              <li key={b} className="inline-flex items-center gap-1.5">
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-[#0f766e]"
                  aria-hidden
                />
                {b}
              </li>
            ))}
          </ul>
        ) : null}

        {(showPrintLink || showCopyLink) && !failed ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {showPrintLink ? (
              <DocumentTextLink
                label="Print / Download PDF"
                icon={Printer}
                disabled={!canExport}
                locked={actionsLocked}
                onLockedClick={onLockedAction}
                onClick={onPrint ?? onDownload}
              />
            ) : null}
            {showCopyLink ? (
              <DocumentTextLink
                label={
                  actions.includes('copyKroll') ? 'Copy to Kroll' : 'Copy communication'
                }
                icon={ClipboardCopy}
                disabled={!canExport}
                locked={actionsLocked}
                onLockedClick={onLockedAction}
                onClick={onCopy}
                copied={copied}
              />
            ) : null}
          </div>
        ) : null}

        {failed ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-[#b4232a]" role="alert">
              {state.error ?? 'Generation failed for this document.'}
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={busy}
                className="text-[13px] font-semibold text-[#0f766e] underline-offset-2 hover:underline disabled:opacity-50"
              >
                Retry generation
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="document-actions grid gap-2.5 min-[901px]:w-full max-[900px]:col-span-full max-[640px]:grid-cols-1">
        <ActionButton
          label="Open document"
          ariaLabel={`Open ${def.name}`}
          icon={Pencil}
          primary
          disabled={busy || failed}
          locked={actionsLocked}
          onLockedClick={onLockedAction}
          onClick={onReviewEdit}
        />
        {secondaryAction ? (
          <ActionButton
            label={secondaryAction.label}
            ariaLabel={`${secondaryAction.label} — ${def.name}`}
            icon={secondaryAction.icon}
            disabled={secondaryAction.disabled}
            locked={actionsLocked}
            onLockedClick={onLockedAction}
            onClick={secondaryAction.onClick}
            copied={
              copied &&
              (secondaryAction.key === 'copy' || secondaryAction.key === 'copyKroll')
            }
          />
        ) : null}
      </div>
    </article>
  );
}

export function FinishConsultationButton({
  disabled,
  loading,
  blockedReason,
  onClick,
}: {
  disabled: boolean;
  loading?: boolean;
  blockedReason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      title={disabled ? blockedReason : undefined}
      onClick={onClick}
      className={cn(
        'finish-consultation footer-button inline-flex min-h-[50px] min-w-[230px] items-center justify-center gap-2 rounded-[9px] px-[18px] text-[15px] font-semibold',
        'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(0,140,164,0.28)]',
        disabled || loading
          ? 'cursor-not-allowed border border-[#d4dade] bg-[#eef1f2] text-[#9aa4aa]'
          : 'border-0 bg-[#008CA4] text-white hover:bg-[#007a8f]',
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : disabled ? (
        <Lock className="h-4 w-4" aria-hidden />
      ) : (
        <CheckCircle2 className="h-4 w-4" aria-hidden />
      )}
      Complete & Delete
    </button>
  );
}

export function footerReviewHint(
  remaining: number,
  generating: boolean,
  hasErrors: boolean,
  hasSourceChanged = false,
  prescriptionBlocker?: 'create' | 'review' | null,
): string | undefined {
  if (generating) return 'Documents are still generating';
  if (hasErrors) return 'Resolve generation errors before completing';
  if (hasSourceChanged) {
    return 'Patient or clinical data changed — regenerate and re-review affected documents';
  }
  if (prescriptionBlocker === 'create') {
    return 'Create and review the Prescription before completing';
  }
  if (prescriptionBlocker === 'review') {
    return 'Review the Prescription before completing';
  }
  if (remaining <= 0) return undefined;
  if (remaining === 1) return '1 document still requires review';
  return `${remaining} documents still require review`;
}

export function DocumentsPrivacyFooter() {
  return (
    <div className="mt-5 space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex items-start gap-2.5 rounded-xl border border-[#acd8d5] bg-[#f2faf9] px-4 py-3.5 text-[13.5px] leading-relaxed text-[#0f6f6b]">
          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Save documents to your pharmacy record before completing.</span>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-[#efc57f] bg-[#fff8eb] px-4 py-3.5 text-[13.5px] leading-relaxed text-[#9a5600]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Completing deletes consultation data. Unfinished data is deleted at{' '}
            <span className="font-semibold">12:00 midnight MT</span>.
          </span>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-[#B9DCEB] bg-[#F2F9FD] px-4 py-3.5 text-[13.5px] leading-relaxed text-[#3e4b55]">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#008CA4]" aria-hidden />
          <span>Copying, downloading, or printing does not delete the consultation.</span>
        </div>
      </div>
      <p className="flex items-center gap-2 text-[12px] text-[#66727d]">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Consultation data is temporary and is not used to train models.
      </p>
    </div>
  );
}
