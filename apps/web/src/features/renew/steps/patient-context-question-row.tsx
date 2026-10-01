'use client';

import { useEffect, useState, memo } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  HelpCircle,
  Info,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';
import {
  CONTEXT_FINDING_ACTIONS,
  CONTEXT_FINDING_ONSET_OPTIONS,
  CONTEXT_FINDING_SEVERITY_OPTIONS,
  CONTEXT_REMOVAL_REASONS,
  CONTEXT_UNABLE_REASONS,
  PATIENT_INFO_PURPOSE,
  contextChoiceFromAnswer,
  contextConcernSummaryLabel,
  contextFindingActionLabel,
  contextFindingOnsetLabel,
  contextFindingSeverity,
  contextFindingSeverityLabel,
  contextRemovalLabel,
  contextTriggerChoice,
  contextUnableAllowed,
  contextUnableLabel,
  formatRelevantFor,
  isContextTriggered,
  patientInfoItemStatus,
  patientInfoStatusLabel,
  resolvePatientInfoRenderer,
  type ContextChoice,
  type ContextRemovalReasonId,
  type PatientContextFollowup,
  type RenewPatientContextRequirement,
} from '@safescript/shared';
import { PatientContextResponseControl, type SaveContextAnswer } from './patient-context-response';
import { PharmacistActionGroup } from './pharmacist-action-group';

export type { SaveContextAnswer };

export const PatientContextQuestionRow = memo(function PatientContextQuestionRow({
  row,
  derivedBmiLabel,
  saving,
  onSave,
  onRemove,
}: {
  row: RenewPatientContextRequirement;
  derivedBmiLabel?: string;
  saving?: boolean;
  onSave: SaveContextAnswer;
  onRemove: (inputCode: string, reasonCode: ContextRemovalReasonId, reasonText?: string | null) => void;
}) {
  const choice = contextChoiceFromAnswer(row.answer);
  const renderer = resolvePatientInfoRenderer(row);
  const yesNo = renderer === 'YES_NO';
  const triggered = yesNo && isContextTriggered(row);
  const findingComplete = Boolean(row.answer.followup?.completed);
  const unableComplete = Boolean(row.answer.unableReasonCode);
  const severity = contextFindingSeverity(row);
  const status = patientInfoItemStatus(row);
  const [findingOpen, setFindingOpen] = useState(triggered && !findingComplete);
  const [unableOpen, setUnableOpen] = useState(choice === 'unknown' && !unableComplete);
  const [confirmNoOpen, setConfirmNoOpen] = useState(false);

  // Auto-open only when the concern is newly triggered — Cancel may leave Yes + Review required collapsed.
  useEffect(() => {
    if (triggered && !findingComplete) setFindingOpen(true);
  }, [triggered, row.inputCode]);

  useEffect(() => {
    if (triggered && findingComplete) setFindingOpen(false);
  }, [triggered, findingComplete, row.inputCode]);

  useEffect(() => {
    if (choice === 'unknown' && !unableComplete) setUnableOpen(true);
    if (choice !== 'unknown') setUnableOpen(false);
  }, [choice, unableComplete, row.inputCode]);

  const rowState =
    choice === 'unknown'
      ? 'unable'
      : triggered && severity === 'ACTION_REQUIRED'
        ? 'action'
        : triggered
          ? 'finding'
          : 'stable';

  const applyChoice = (next: ContextChoice) => {
    if (next === 'unknown') {
      onSave(row.inputCode, {
        status: 'UNKNOWN',
        valueText: null,
        numericValue: null,
        followup: null,
        unableReasonCode: row.answer.unableReasonCode ?? null,
        unableReasonText: row.answer.unableReasonText ?? null,
      });
      setUnableOpen(true);
      setFindingOpen(false);
      return;
    }
    const trigger = contextTriggerChoice(row);
    onSave(row.inputCode, {
      status: 'ANSWERED',
      valueText: next,
      numericValue: null,
      unableReasonCode: null,
      unableReasonText: null,
      followup: next === trigger ? { completed: false } : null,
    });
    setUnableOpen(false);
    setFindingOpen(next === trigger);
  };

  const saveChoice = (next: ContextChoice) => {
    const trigger = contextTriggerChoice(row);
    if (findingComplete && choice === trigger && next !== trigger && next !== 'unknown') {
      setConfirmNoOpen(true);
      return;
    }
    applyChoice(next);
  };

  return (
    <div className="renew-psi-row-block border-b border-[#f1f4f6] last:border-b-0">
      <div className="renew-psi-row" data-state={rowState}>
        <div className="renew-psi-question min-w-0">
          <p className="text-sm font-semibold leading-5 text-[#163447]">{row.label}</p>
          {row.medicationNames.length ? (
            <p className="mt-0.5 text-[12px] text-[#6b8490]">{formatRelevantFor(row.medicationNames, 2)}</p>
          ) : null}
          {PATIENT_INFO_PURPOSE[row.inputCode.toUpperCase()] ? (
            <p className="mt-1 inline-flex items-start gap-1 text-[12px] leading-4 text-[#7a8b94]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {PATIENT_INFO_PURPOSE[row.inputCode.toUpperCase()]}
            </p>
          ) : null}
        </div>
        <div className="renew-psi-response-wrap">
          {choice === 'unknown' ? (
            <div className="renew-psi-response justify-end">
              <span className="renew-psi-unable-chip">Unable to assess</span>
              {unableComplete && !unableOpen ? (
                <button
                  type="button"
                  className="text-[13px] font-semibold text-primary hover:underline"
                  onClick={() => setUnableOpen(true)}
                >
                  Edit
                </button>
              ) : null}
            </div>
          ) : yesNo ? (
            <div className="renew-psi-response" role="group" aria-label={row.label}>
              {(['yes', 'no'] as const).map((id) => {
                const checked = choice === id;
                const tone = id === contextTriggerChoice(row) ? 'trigger' : 'stable';
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={checked}
                    data-checked={checked ? 'true' : 'false'}
                    data-tone={tone}
                    disabled={saving}
                    className="renew-psi-choice"
                    onClick={() => saveChoice(id)}
                  >
                    {id === 'yes' ? 'Yes' : 'No'}
                  </button>
                );
              })}
            </div>
          ) : (
            <PatientContextResponseControl
              row={row}
              derivedBmiLabel={derivedBmiLabel}
              saving={saving}
              onSave={onSave}
            />
          )}
        </div>
        <div className="renew-psi-status-wrap flex justify-end">
          <PatientInfoStatusBadge status={status} reviewRequired={triggered && !findingComplete} />
        </div>
        <div className="renew-psi-menu-wrap flex justify-end">
          <DispositionMenu
            allowUnable={contextUnableAllowed(row)}
            removable={row.removable !== false}
            allowClear={Boolean(row.answer.numericValue != null || row.answer.valueText?.trim() || choice)}
            onUnable={() => saveChoice('unknown')}
            onClear={() =>
              onSave(row.inputCode, {
                status: 'ANSWERED',
                valueText: null,
                numericValue: null,
                enteredUnit: null,
                followup: null,
                unableReasonCode: null,
                unableReasonText: null,
              })
            }
            onRemove={(reasonCode, reasonText) => onRemove(row.inputCode, reasonCode, reasonText)}
          />
        </div>
      </div>

      {triggered && findingComplete && !findingOpen ? (
        <ConcernReviewSummary row={row} onEdit={() => setFindingOpen(true)} />
      ) : null}

      {triggered && findingOpen ? (
        <FindingPanel
          row={row}
          saving={saving}
          onCancel={() => setFindingOpen(false)}
          onSave={(followup) => {
            onSave(row.inputCode, {
              status: 'ANSWERED',
              valueText: contextTriggerChoice(row),
              followup: { ...followup, completed: true },
              unableReasonCode: null,
              unableReasonText: null,
            });
            setFindingOpen(false);
          }}
        />
      ) : null}

      {choice === 'unknown' && unableComplete && !unableOpen ? (
        <div className="border-t border-[#d7e8f4] bg-[#f5f9fc] px-5 py-2 sm:px-6" aria-live="polite">
          <p className="inline-flex items-center gap-2 text-[12px] text-[#1f4e6b]">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            {contextUnableLabel(row.answer.unableReasonCode, row.answer.unableReasonText)}
          </p>
        </div>
      ) : null}

      {choice === 'unknown' && unableOpen ? (
        <UnablePanel
          row={row}
          saving={saving}
          onCancel={() => {
            if (!unableComplete) {
              onSave(row.inputCode, {
                status: 'ANSWERED',
                valueText: null,
                unableReasonCode: null,
                unableReasonText: null,
                followup: null,
              });
            }
            setUnableOpen(false);
          }}
          onSave={(unableReasonCode, unableReasonText) => {
            onSave(row.inputCode, {
              status: 'UNKNOWN',
              valueText: null,
              unableReasonCode,
              unableReasonText,
              followup: null,
            });
            setUnableOpen(false);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmNoOpen}
        onOpenChange={setConfirmNoOpen}
        title={`Change response to ${contextTriggerChoice(row) === 'yes' ? 'No' : 'Yes'}?`}
        description="The saved concern review will be removed from this consultation."
        confirmLabel={`Change to ${contextTriggerChoice(row) === 'yes' ? 'No' : 'Yes'}`}
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          setConfirmNoOpen(false);
          const stable = contextTriggerChoice(row) === 'yes' ? 'no' : 'yes';
          applyChoice(stable);
        }}
      />
    </div>
  );
});

function ConcernReviewSummary({
  row,
  onEdit,
}: {
  row: RenewPatientContextRequirement;
  onEdit: () => void;
}) {
  const followup = row.answer.followup;
  const parts = [
    contextFindingOnsetLabel(followup?.onset),
    contextFindingSeverityLabel(followup?.severity),
    contextFindingActionLabel(followup?.action),
  ].filter(Boolean);

  return (
    <div
      className="mx-4 mb-3 mt-0 flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-amber-200/80 bg-[#fffaf3] px-3.5 py-3 sm:mx-5"
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          {contextConcernSummaryLabel(row)} — reviewed
        </p>
        {parts.length ? (
          <p className="mt-1 pl-6 text-[12px] leading-4 text-amber-900/80">{parts.join(' · ')}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
    </div>
  );
}

function FindingPanel({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: RenewPatientContextRequirement;
  saving?: boolean;
  onCancel: () => void;
  onSave: (followup: PatientContextFollowup) => void;
}) {
  const saved = row.answer.followup;
  const [onset, setOnset] = useState(saved?.onset ?? '');
  const [grade, setGrade] = useState(saved?.severity ?? '');
  const [action, setAction] = useState(saved?.action ?? '');
  const [otherText, setOtherText] = useState(
    saved?.action === 'OTHER' ? (saved?.details ?? '') : '',
  );
  const [details, setDetails] = useState(
    saved?.action === 'OTHER' ? '' : (saved?.details ?? ''),
  );
  const [noteOpen, setNoteOpen] = useState(
    Boolean(saved?.details?.trim()) && saved?.action !== 'OTHER',
  );
  const [error, setError] = useState<string | null>(null);
  const prompt = row.followupPrompt?.trim() || null;

  const submit = () => {
    if (!onset) {
      setError('Select when the symptom started.');
      return;
    }
    if (!grade) {
      setError('Select a severity.');
      return;
    }
    if (!action) {
      setError('Select a pharmacist action.');
      return;
    }
    const note =
      action === 'OTHER'
        ? [otherText.trim(), details.trim()].filter(Boolean).join('\n') || null
        : details.trim() || null;
    setError(null);
    onSave({
      onset,
      severity: grade,
      details: note,
      action,
      completed: true,
    });
  };

  return (
    <div className="border-t border-amber-100 bg-[#fffaf3] px-4 py-3 sm:px-5" aria-live="polite">
      <div className="rounded-[12px] border border-amber-200/80 bg-white/95 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="border-b border-amber-100 pb-3">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-950">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
            Concern identified
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-[#5b6b75]">
            {prompt || "Assess the reported symptoms and document the pharmacist's action."}
          </p>
        </div>

        <div className="mt-3.5 grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,1.35fr)]">
          <div>
            <p className="text-[12px] font-medium text-[#5b6b75]">When did this start?</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="When did this start?">
              {CONTEXT_FINDING_ONSET_OPTIONS.map((option) => (
                <SegmentChip
                  key={option.id}
                  label={option.label}
                  selected={onset === option.id}
                  disabled={saving}
                  onClick={() => {
                    setOnset(option.id);
                    setError(null);
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-medium text-[#5b6b75]">Severity</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Severity">
              {CONTEXT_FINDING_SEVERITY_OPTIONS.map((option) => (
                <SegmentChip
                  key={option.id}
                  label={option.label}
                  selected={grade === option.id}
                  disabled={saving}
                  onClick={() => {
                    setGrade(option.id);
                    setError(null);
                  }}
                />
              ))}
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <p className="text-[12px] font-medium text-[#5b6b75]">Pharmacist action</p>
            <PharmacistActionGroup
              className="mt-1.5"
              name={`context-action-${row.inputCode}`}
              value={action}
              disabled={saving}
              options={CONTEXT_FINDING_ACTIONS.map((option) => ({
                id: option.id,
                label: option.label,
              }))}
              onChange={(id) => {
                setAction(id);
                setError(null);
              }}
            />
            {action === 'OTHER' ? (
              <input
                value={otherText}
                onChange={(event) => setOtherText(event.target.value.slice(0, 160))}
                disabled={saving}
                placeholder="Describe pharmacist action..."
                className="mt-2 h-10 w-full rounded-[10px] border border-[#C5D0D4] bg-white px-3 text-[13px] text-[#163447] outline-none transition-[border-color,box-shadow] placeholder:text-[#9aa8b0] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ) : null}
          </div>
        </div>

        <div className="mt-3 border-t border-[#edf1f3] pt-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5b6b75] hover:text-[#163447]"
            aria-expanded={noteOpen}
            onClick={() => setNoteOpen((open) => !open)}
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', noteOpen ? 'rotate-0' : '-rotate-90')}
              aria-hidden
            />
            Add clinical note (optional)
          </button>
          {noteOpen ? (
            <div className="relative mt-2">
              <Textarea
                value={details}
                maxLength={500}
                rows={3}
                disabled={saving}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Add any clinically relevant details (e.g., symptom description, patient discussion, follow-up plan)..."
                className="min-h-[88px] resize-y border-[#C5D0D4] bg-white px-3 py-2.5 pb-7 text-[13px] leading-5 shadow-none placeholder:text-[#9aa8b0] focus-visible:border-primary focus-visible:ring-primary/20"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-[#9aa8b0]">
                {details.length} / 500
              </span>
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 font-semibold text-primary hover:bg-[#f7fafb] hover:text-primary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <ClinicalPrimaryButton
            className="h-9 rounded-lg px-4 text-[13px]"
            disabled={saving}
            loading={saving}
            onClick={submit}
          >
            Save review
          </ClinicalPrimaryButton>
        </div>
      </div>
    </div>
  );
}

function SegmentChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-full border px-3 text-[12px] transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-primary bg-primary/[0.08] font-semibold text-[#163447]'
          : 'border-[#d9e4e8] bg-white font-medium text-[#163447] hover:border-primary/40',
      )}
    >
      {label}
    </button>
  );
}

function UnablePanel({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: RenewPatientContextRequirement;
  saving?: boolean;
  onCancel: () => void;
  onSave: (reasonCode: string, reasonText: string | null) => void;
}) {
  const [reason, setReason] = useState(row.answer.unableReasonCode ?? '');
  const [otherText, setOtherText] = useState(row.answer.unableReasonText ?? '');
  const canSave = Boolean(reason) && (reason !== 'OTHER' || otherText.trim().length > 0);

  return (
    <div className="border-t border-[#d7e8f4] bg-[#f5f9fc] px-4 py-3 sm:px-5" aria-live="polite">
      <div className="rounded-[12px] border border-[#d7e8f4] border-l-[3px] border-l-[#3b82a8] bg-white/90 p-3.5">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1f4e6b]">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          Unable to assess
        </p>
        <label className="mt-2.5 block text-[11px] font-medium text-[#5b6b75]">
          Reason unable to assess
          <select
            className="mt-1 h-8 w-full rounded-md border border-[#d7e2e6] bg-white px-2 text-[12px] text-[#163447]"
            value={reason}
            disabled={saving}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="">Select reason…</option>
            {CONTEXT_UNABLE_REASONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2.5 block text-[11px] font-medium text-[#5b6b75]">
          Additional details {reason === 'OTHER' ? null : <span className="font-normal">(optional)</span>}
          <Textarea
            value={otherText}
            maxLength={300}
            rows={2}
            disabled={saving}
            onChange={(event) => setOtherText(event.target.value)}
            placeholder={reason === 'OTHER' ? 'Describe why this cannot be assessed' : undefined}
            className="mt-1 min-h-[44px] resize-y border-[#d7e2e6] px-2.5 py-1.5 text-[12px] leading-4 shadow-none"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 bg-white px-3 text-[12px]"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <ClinicalPrimaryButton
            className="h-8 px-3 text-[12px]"
            disabled={!canSave || saving}
            loading={saving}
            onClick={() => onSave(reason, otherText.trim() || null)}
          >
            Save
          </ClinicalPrimaryButton>
        </div>
      </div>
    </div>
  );
}

function PatientInfoStatusBadge({
  status,
  reviewRequired,
}: {
  status: ReturnType<typeof patientInfoItemStatus>;
  reviewRequired?: boolean;
}) {
  const label = patientInfoStatusLabel(status);
  const reviewed = status === 'REVIEWED' || status === 'EXCEPTION_REVIEWED';
  const unable = status === 'UNABLE_TO_ASSESS';
  const needsReview = Boolean(reviewRequired) || (!reviewed && !unable && status === 'UNANSWERED');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        reviewed && 'bg-[#e8f6ee] text-[#027A48]',
        unable && 'bg-[#e7f1f8] text-[#1f4e6b]',
        needsReview && !reviewed && !unable && 'bg-[#fff6e8] text-[#b45309]',
        !reviewed && !unable && !needsReview && 'bg-[#f3f6f8] text-[#5b6b75]',
      )}
    >
      {reviewed ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      {needsReview && !reviewed && !unable ? <AlertTriangle className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

function DispositionMenu({
  allowUnable,
  removable,
  allowClear,
  onUnable,
  onClear,
  onRemove,
}: {
  allowUnable: boolean;
  removable: boolean;
  allowClear: boolean;
  onUnable: () => void;
  onClear: () => void;
  onRemove: (reasonCode: ContextRemovalReasonId, reasonText?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState<ContextRemovalReasonId | null>(null);
  const [otherText, setOtherText] = useState('');
  const canRemove = Boolean(reason) && (reason !== 'OTHER' || otherText.trim().length > 0);

  if (!allowUnable && !removable && !allowClear) return <span className="renew-psi-menu" aria-hidden />;

  const reset = () => {
    setRemoving(false);
    setReason(null);
    setOtherText('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <button type="button" className="renew-psi-menu rounded-full" aria-label="More actions">
                <MoreVertical className="h-5 w-5" />
              </button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[280px] p-0">
        {!removing ? (
          <div className="py-1">
            {allowUnable ? (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#f6f9fa]"
                onClick={() => {
                  setOpen(false);
                  reset();
                  onUnable();
                }}
              >
                <HelpCircle className="h-4 w-4 shrink-0 text-[#5b6b75]" />
                <span className="text-sm font-medium text-[#163447]">Unable to assess</span>
              </button>
            ) : null}
            {allowClear ? (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#f6f9fa]"
                onClick={() => {
                  setOpen(false);
                  reset();
                  onClear();
                }}
              >
                <RotateCcw className="h-4 w-4 shrink-0 text-[#5b6b75]" />
                <span className="text-sm font-medium text-[#163447]">Clear entry</span>
              </button>
            ) : null}
            {removable ? (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#f6f9fa]"
                onClick={() => setRemoving(true)}
              >
                <Trash2 className="h-4 w-4 shrink-0 text-[#9b1c1c]" />
                <span className="text-sm font-medium text-[#163447]">Not relevant — remove</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="p-3.5">
            <p className="text-sm font-semibold text-[#163447]">Why is this not relevant?</p>
            <div className="mt-2 space-y-1.5">
              {CONTEXT_REMOVAL_REASONS.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm text-[#163447]">
                  <input
                    type="radio"
                    name="psi-remove-reason"
                    className="mt-1"
                    checked={reason === item.id}
                    onChange={() => setReason(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            {reason === 'OTHER' ? (
              <Textarea
                value={otherText}
                maxLength={300}
                onChange={(event) => setOtherText(event.target.value)}
                placeholder="Describe why this is not relevant"
                className="mt-2 min-h-[64px] border-[#d7e2e6] shadow-none"
              />
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canRemove}
                onClick={() => {
                  if (!reason) return;
                  onRemove(reason, reason === 'OTHER' ? otherText.trim() : null);
                  setOpen(false);
                  reset();
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PatientContextRemovedList({
  removed,
  onRestore,
}: {
  removed: Array<{
    questionRuleId: string;
    label: string;
    medicationNames: string[];
    reasonCode: ContextRemovalReasonId;
    reasonText?: string | null;
  }>;
  onRestore: (inputCode: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!removed.length) return null;
  return (
    <div className="border-t border-[#e8eef1] px-5 py-3 sm:px-6">
      <button
        type="button"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#5b6b75]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        Removed from this review ({removed.length})
      </button>
      {open ? (
        <ul className="mt-3 space-y-3">
          {removed.map((row) => (
            <li
              key={row.questionRuleId}
              className="flex items-start justify-between gap-3 rounded-lg bg-[#f7fafb] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#5b6b75] line-through decoration-[#c5d4d8]">{row.label}</p>
                {row.medicationNames.length ? (
                  <p className="mt-0.5 text-[12px] text-[#8aa0aa]">{formatRelevantFor(row.medicationNames, 2)}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-[#e8eef1] px-2 py-0.5 text-[11px] font-medium text-[#5b6b75]">
                    Removed — not relevant
                  </span>
                  <span className="text-[12px] text-[#7a8b94]">
                    {contextRemovalLabel(row.reasonCode, row.reasonText)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                onClick={() => onRestore(row.questionRuleId)}
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

export function PatientContextProgressPills({
  questions,
  reviewed,
  remaining,
  removed,
  findings = 0,
}: {
  questions: number;
  reviewed: number;
  remaining: number;
  removed: number;
  findings?: number;
}) {
  const pills = [
    { label: `${questions} item${questions === 1 ? '' : 's'}`, show: true, tone: 'neutral' as const },
    { label: `${reviewed} reviewed`, show: reviewed > 0 || remaining > 0 || removed > 0, tone: 'reviewed' as const },
    { label: `${remaining} remaining`, show: remaining > 0, tone: 'remaining' as const },
    { label: `${removed} removed`, show: removed > 0, tone: 'neutral' as const },
    { label: `${findings} finding${findings === 1 ? '' : 's'}`, show: findings > 0, tone: 'finding' as const },
  ];
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {pills
        .filter((pill) => pill.show)
        .map((pill) => (
          <span
            key={pill.label}
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              pill.tone === 'reviewed' && 'bg-[#e8f6ee] text-[#027A48]',
              pill.tone === 'remaining' && 'bg-[#e7f6f5] text-primary',
              pill.tone === 'finding' && 'bg-[#fff6e8] text-[#b45309]',
              pill.tone === 'neutral' && 'bg-[#eef3f5] text-[#5b6b75]',
            )}
          >
            {pill.label}
          </span>
        ))}
    </div>
  );
}
