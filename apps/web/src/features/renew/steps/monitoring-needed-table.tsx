'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  HelpCircle,
  MinusCircle,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  formatMonitoringResultWithDate,
  formatRelevantFor,
  type MonitoringResultSaveBody,
  type MonitoringReviewAction,
  type MonitoringRowPresentation,
  type RenewMonitoringRequirement,
} from '@safescript/shared';
import { MonitoringReferencePopover } from './monitoring-reference-popover';
import { MonitoringReviewPanel } from './monitoring-review-panel';
import { MonitoringViewPanel } from './monitoring-view-panel';

export type MonitoringExpandMode = 'view' | 'review';

export function MonitoringNeededTable({
  rows,
  busyCode,
  expandedCode,
  expandedMode,
  savingReviewCode,
  embedded,
  onEdit,
  onToggleExpand,
  onSaveReview,
  onSaveResult,
  onMarkUnavailable,
  onRemove,
  onAddOther,
}: {
  rows: Array<RenewMonitoringRequirement & { presentation: MonitoringRowPresentation }>;
  busyCode?: string | null;
  expandedCode: string | null;
  expandedMode: MonitoringExpandMode | null;
  savingReviewCode?: string | null;
  embedded?: boolean;
  onEdit: (row: RenewMonitoringRequirement) => void;
  onToggleExpand: (code: string, mode: MonitoringExpandMode) => void;
  onSaveReview: (
    inputCode: string,
    body: {
      action: MonitoringReviewAction;
      note: string;
      otherText?: string | null;
      affectedMedicationIds?: string[];
      shorterDurationId?: string | null;
    },
  ) => void;
  onSaveResult: (inputCode: string, body: MonitoringResultSaveBody) => void;
  onMarkUnavailable: (row: RenewMonitoringRequirement) => void;
  onRemove: (row: RenewMonitoringRequirement) => void;
  onViewReference?: (row: RenewMonitoringRequirement) => void;
  onAddOther: () => void;
}) {
  return (
    <TooltipProvider delayDuration={200}>
    <section className={cn(embedded ? 'overflow-hidden bg-white' : 'overflow-hidden rounded-2xl border border-[#d7e2e6] bg-white')}>
      <div className="renew-mon-head text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">
        <span>Monitoring item</span>
        <span>Result (most recent)</span>
        <span>Clinical status</span>
        <span className="text-right">Action</span>
        <span className="sr-only">More options</span>
      </div>
      <div>
        {rows.map((row) => {
          const presentation = row.presentation;
          const expanded = expandedCode === row.inputCode;
          const rowState =
            presentation.tone === 'unavailable'
              ? 'unavailable'
              : presentation.rowHighlight === 'action'
                ? 'action'
                : presentation.rowHighlight === 'review' || presentation.needsReview
                  ? 'review'
                  : 'stable';
          return (
            <div key={row.inputCode} className="border-b border-[#f1f4f6] last:border-b-0">
              <div className="renew-mon-row" data-state={rowState}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-[#163447]">{row.label}</p>
                  {row.addedBecause ? (
                    <p className="mt-0.5 text-[12px] text-[#b54708]">{row.addedBecause}</p>
                  ) : row.medicationNames.length ? (
                    <p className="mt-0.5 text-[12px] text-[#6b8490]">{formatRelevantFor(row.medicationNames, 3)}</p>
                  ) : null}
                  {presentation.category ? (
                    <span className="mt-1 inline-flex rounded-full bg-[#eef3f5] px-2 py-0.5 text-[11px] font-medium text-[#5b6b75]">
                      {presentation.category}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0">
                  {presentation.tone === 'unavailable' || row.result.status === 'UNAVAILABLE' ? (
                    <p className="text-sm italic text-[#667085]">Not available</p>
                  ) : presentation.interpretation === 'PENDING' ? (
                    <p className="text-sm text-[#98a2b3]">—</p>
                  ) : (
                    <p
                      className={cn(
                        'text-sm font-semibold leading-5',
                        presentation.resultEmphasis === 'critical' ? 'text-[#b42318]' : 'text-[#163447]',
                      )}
                    >
                      {formatMonitoringResultWithDate(row.result, row.unit)}
                    </p>
                  )}
                  {presentation.reference.label ? (
                    <div className="mt-0.5 flex items-center gap-1">
                      <p className="text-[12px] text-[#6b8490]">{presentation.reference.label}</p>
                      {presentation.reference.infoAvailable ? (
                        <MonitoringReferencePopover {...presentation.reference.popover}>
                          <button
                            type="button"
                            className="inline-flex text-[#8aa0aa] hover:text-[#0F6F6B]"
                            aria-label={`Reference details for ${row.label}`}
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </MonitoringReferencePopover>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <StatusBadge presentation={presentation} />
                  {presentation.exceptionNote && presentation.needsReview ? (
                    <p className="mt-1 text-[12px] leading-4 text-[#9a3412]">{presentation.exceptionNote}</p>
                  ) : null}
                </div>
                <div className="flex justify-end">
                  <RowAction
                    inputCode={row.inputCode}
                    presentation={presentation}
                    busy={busyCode === row.inputCode}
                    expanded={expanded && expandedMode === expandModeFor(presentation)}
                    onClick={() => {
                      if (presentation.actionKind === 'add_result') onEdit(row);
                      else onToggleExpand(row.inputCode, expandModeFor(presentation));
                    }}
                  />
                </div>
                <div className="flex justify-end">
                  <DispositionMenu
                    label={row.label}
                    allowUnavailable={row.allowNotAvailable !== false}
                    removable={row.removable !== false}
                    onUnavailable={() => onMarkUnavailable(row)}
                    onRemove={() => onRemove(row)}
                  />
                </div>
              </div>
              {expanded && expandedMode === 'view' ? (
                <div className="px-4 py-3 sm:px-5">
                  <MonitoringViewPanel
                    key={`${row.inputCode}-${row.result.observedDate}-${row.result.value?.numericValue ?? ''}-${row.result.value?.valueText ?? ''}`}
                    row={row}
                    presentation={presentation}
                    saving={busyCode === row.inputCode}
                    onEditResult={(body) => onSaveResult(row.inputCode, body)}
                    onClose={() => closeView(row.inputCode, onToggleExpand)}
                  />
                </div>
              ) : null}
              {expanded && expandedMode === 'review' ? (
                <div className="px-4 py-3 sm:px-5">
                  <MonitoringReviewPanel
                    key={row.inputCode}
                    row={row}
                    presentation={presentation}
                    saving={savingReviewCode === row.inputCode}
                    onCancel={() => onToggleExpand(row.inputCode, 'review')}
                    onSave={(body) => onSaveReview(row.inputCode, body)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="border-t border-[#edf1f3] px-5 py-3 sm:px-6">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 text-sm font-semibold text-[#0F6F6B] hover:underline"
          onClick={onAddOther}
        >
          <Plus className="h-4 w-4" />
          Add another result
        </button>
      </div>
    </section>
    </TooltipProvider>
  );
}

function expandModeFor(presentation: MonitoringRowPresentation): MonitoringExpandMode {
  return presentation.actionKind === 'review' || Boolean(presentation.review) ? 'review' : 'view';
}

function closeView(
  inputCode: string,
  onToggleExpand: (code: string, mode: MonitoringExpandMode) => void,
) {
  onToggleExpand(inputCode, 'view');
  requestAnimationFrame(() => {
    document.getElementById(`monitoring-action-${inputCode}`)?.focus();
  });
}

function DispositionMenu({
  label,
  allowUnavailable,
  removable,
  onUnavailable,
  onRemove,
}: {
  label: string;
  allowUnavailable: boolean;
  removable: boolean;
  onUnavailable: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!allowUnavailable && !removable) return <span className="renew-mon-menu" aria-hidden />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <button
                type="button"
                className="renew-mon-menu rounded-full"
                aria-label={`Result unavailable / not relevant for ${label}`}
              >
                <MinusCircle className="h-5 w-5" />
              </button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>Result unavailable / not relevant</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[260px] p-0">
        <div className="py-1">
          {allowUnavailable ? (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#f6f9fa]"
              onClick={() => {
                setOpen(false);
                onUnavailable();
              }}
            >
              <HelpCircle className="h-4 w-4 shrink-0 text-[#5b6b75]" />
              <span className="text-sm font-medium text-[#163447]">Result unavailable</span>
            </button>
          ) : null}
          {removable ? (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#f6f9fa]"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0 text-[#9b1c1c]" />
              <span className="text-sm font-medium text-[#163447]">Not relevant — remove</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RowAction({
  inputCode,
  presentation,
  busy,
  expanded,
  onClick,
}: {
  inputCode: string;
  presentation: MonitoringRowPresentation;
  busy?: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  const isReview = presentation.actionKind === 'review';
  const isView = presentation.actionKind === 'view';
  const label =
    presentation.actionKind === 'add_result'
      ? 'Add result'
      : presentation.actionKind === 'review'
        ? presentation.validationStatus === 'UNIT_MISMATCH' ||
          presentation.validationStatus === 'MISSING_UNIT'
          ? 'Review result'
          : 'Review'
        : 'View';
  const panelId = isReview ? `monitoring-review-${inputCode}` : isView ? `monitoring-details-${inputCode}` : undefined;
  return (
    <button
      type="button"
      id={`monitoring-action-${inputCode}`}
      disabled={busy}
      aria-expanded={isReview || isView ? expanded : undefined}
      aria-controls={expanded ? panelId : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 min-w-[72px] items-center justify-center gap-1 rounded-lg px-3 text-sm font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6F6B]/30',
        'disabled:opacity-50',
        isReview
          ? 'bg-[#0F6F6B] text-white hover:bg-[#0c5c59]'
          : 'border border-[#0F6F6B] bg-white text-[#0F6F6B] hover:bg-[#0F6F6B]/5',
      )}
    >
      {label}
      {isReview ? (
        expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
      ) : isView ? (
        expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
      ) : null}
    </button>
  );
}

function StatusBadge({ presentation }: { presentation: MonitoringRowPresentation }) {
  const { tone, badgeLabel, detail } = presentation;
  const showDetail =
    Boolean(detail) &&
    detail !== badgeLabel &&
    !(tone === 'ok' && (detail === 'No action needed' || !detail));
  return (
    <div>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
          tone === 'action' && 'bg-[#fce8e8] text-[#b42318]',
          tone === 'review' && 'bg-[#fdedd3] text-[#b54708]',
          tone === 'ok' && 'bg-[#e8f6ee] text-[#027A48]',
          tone === 'unavailable' && 'bg-[#e7f1f8] text-[#1f4e6b]',
          tone === 'pending' && 'bg-[#f3f6f8] text-[#5b6b75]',
        )}
      >
        {tone === 'action' || tone === 'review' ? <AlertTriangle className="h-3 w-3" /> : null}
        {tone === 'ok' ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        {tone === 'unavailable' ? <Circle className="h-2.5 w-2.5 fill-current" /> : null}
        {badgeLabel}
      </span>
      {showDetail ? <p className="mt-1 text-[11px] text-[#7a8b94]">{detail}</p> : null}
    </div>
  );
}

export function MonitoringRemovedSection({
  items,
  onRestore,
}: {
  items: Array<{ inputCode: string; label: string; medicationNames: string[]; reasonLabel: string }>;
  onRestore: (inputCode: string) => void;
  onRestoreAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="border-t border-[#e8eef1] px-5 py-3 sm:px-6">
      <button
        type="button"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#5b6b75]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        Removed from this review ({items.length})
      </button>
      {open ? (
        <ul className="mt-3 space-y-3">
          {items.map((row) => (
            <li key={row.inputCode} className="flex items-start justify-between gap-3 rounded-lg bg-[#f7fafb] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#5b6b75] line-through decoration-[#c5d4d8]">{row.label}</p>
                {row.medicationNames.length ? (
                  <p className="mt-0.5 text-[12px] text-[#8aa0aa]">{formatRelevantFor(row.medicationNames, 3)}</p>
                ) : null}
                <p className="mt-1 text-[12px] text-[#7a8b94]">Removed: {row.reasonLabel}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#0F6F6B] hover:underline"
                onClick={() => onRestore(row.inputCode)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
