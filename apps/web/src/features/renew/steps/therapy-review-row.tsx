'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  effectivenessConcernAnswer,
  effectivenessStatusFromConcernAnswer,
  formatConditionCategory,
  getConditionReviewCompletion,
  isUnableToAssessStatus,
  medicationShortName,
  therapyReviewFieldErrors,
  type RenewConditionReview,
  type RenewMedication,
  type TherapyConditionGroup,
} from '@safescript/shared';
import { AdherenceConcernPanel, AdherenceConcernSummary } from './adherence-concern-panel';
import { EffectivenessConcernPanel, EffectivenessConcernSummary } from './effectiveness-concern-panel';
import { MedicationConcernPanel, MedicationConcernSummary } from './medication-concern-panel';
import { documentedFindingLines, linkedMedicationMutedLabel } from './therapy-review-ui';
import { useAdherenceConcernEditor } from './use-adherence-concern-editor';
import { useEffectivenessEditor } from './use-effectiveness-editor';
import { useMedicationConcernEditor } from './use-medication-concern-editor';
import { visibleReviewFieldErrors } from './therapy-review-field-errors';

export function TherapyReviewRow({
  group,
  linkedMeds,
  showFieldErrors,
  highlight,
  linking: _linking,
  layout,
  onPatch,
  onViewDetails,
  onRemoveCondition,
}: {
  group: TherapyConditionGroup;
  linkedMeds: RenewMedication[];
  showFieldErrors: boolean;
  highlight: boolean;
  linking?: boolean;
  layout: 'desktop' | 'mobile';
  onPatch: (reviewId: string, patch: Partial<RenewConditionReview>) => void | Promise<void>;
  onViewDetails: () => void;
  onRemoveCondition: () => void;
}) {
  const [editingResponses, setEditingResponses] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const {
    pendingAdherenceNo,
    confirmMode,
    setConfirmMode,
    displayedAdherence,
    showAdherenceEditor,
    showAdherenceSummary,
    closeAdherenceEditor,
    patchAdherenceIssues,
    setAdherenceYes,
    clearAdherence,
    onAdherenceChange,
    openAdherenceEditor,
  } = useAdherenceConcernEditor(group, onPatch);
  const {
    displayedEffectiveness,
    showEffectivenessEditor,
    showEffectivenessSummary,
    pendingEffectiveness,
    confirm: confirmEffectiveness,
    closeEditor: closeEffectivenessEditor,
    persistIssue,
    onEffectivenessChange,
    confirmChange,
    openEditor: openEffectivenessEditor,
    keepCurrent,
  } = useEffectivenessEditor(group, onPatch);
  const {
    pendingYes: pendingMedicationYes,
    confirmMode: concernConfirmMode,
    setConfirmMode: setConcernConfirmMode,
    displayedConcern,
    showEditor: showMedicationEditor,
    showSummary: showMedicationSummary,
    closeEditor: closeMedicationEditor,
    patchConcerns,
    setConcernNo,
    clearConcern,
    onConcernChange,
    openEditor: openMedicationEditor,
  } = useMedicationConcernEditor(group, onPatch);

  const fieldErrors = visibleReviewFieldErrors(
    group,
    pendingAdherenceNo,
    pendingEffectiveness,
    pendingMedicationYes,
  );
  const errorByField = Object.fromEntries(fieldErrors.map((row) => [row.field, row.message])) as Partial<
    Record<(typeof fieldErrors)[number]['field'], string>
  >;
  const completion = getConditionReviewCompletion(group.review, group.medicationIds.length);
  const pendingException = pendingAdherenceNo || Boolean(showEffectivenessEditor) || pendingMedicationYes;
  const compactStable =
    completion === 'COMPLETE_STABLE' &&
    !editingResponses &&
    !pendingException;
  const exceptionComplete =
    (completion === 'COMPLETE_WITH_CONCERN' || completion === 'COMPLETE_UNABLE_TO_ASSESS') &&
    !pendingException;
  const findings = documentedFindingLines(group);
  const category = formatConditionCategory(group.category);
  const uiEffectiveness = effectivenessConcernAnswer(displayedEffectiveness);

  const reviewFieldErrors = therapyReviewFieldErrors(group.review, group.medicationIds.length);
  const adherenceStepComplete =
    !pendingAdherenceNo && !reviewFieldErrors.some((row) => row.field === 'adherence');
  const effectivenessStepComplete =
    adherenceStepComplete &&
    !pendingEffectiveness &&
    !reviewFieldErrors.some((row) => row.field === 'effectiveness');
  const effectivenessEnabled = adherenceStepComplete;
  const medicationEnabled = effectivenessStepComplete;

  useEffect(() => {
    if (completion !== 'COMPLETE_STABLE') setEditingResponses(false);
  }, [completion]);

  useEffect(() => {
    if (showFieldErrors && fieldErrors.length) setExceptionOpen(true);
  }, [showFieldErrors, fieldErrors.length]);

  useEffect(() => {
    if (adherenceStepComplete) return;
    closeEffectivenessEditor();
    closeMedicationEditor();
    // close* helpers are recreated each render; only react to step completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [adherenceStepComplete]);

  useEffect(() => {
    if (effectivenessStepComplete) return;
    closeMedicationEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [effectivenessStepComplete]);

  const openAnyEditor = () => {
    setEditingResponses(true);
    setExceptionOpen(true);
    if (group.review.adherenceStatus === 'no') openAdherenceEditor();
    else if (isUnableToAssessStatus(group.review.effectivenessStatus) || group.review.effectivenessStatus === 'no') {
      openEffectivenessEditor(
        isUnableToAssessStatus(group.review.effectivenessStatus) ? 'unable_to_assess' : 'no',
      );
    } else if (group.review.medicationConcernStatus === 'yes') {
      openMedicationEditor();
    }
  };

  const onUiEffectivenessChange = (next: string | null) => {
    onEffectivenessChange(effectivenessStatusFromConcernAnswer(next === 'yes' || next === 'no' ? next : null));
  };

  const showAdherenceSlot =
    showAdherenceEditor ||
    ((exceptionOpen || showFieldErrors) && showAdherenceSummary);
  const showEffectivenessSlot =
    Boolean(showEffectivenessEditor) ||
    ((exceptionOpen || showFieldErrors) && showEffectivenessSummary);
  const showMedicationSlot =
    showMedicationEditor ||
    ((exceptionOpen || showFieldErrors) && showMedicationSummary);
  const showExpanded = showAdherenceSlot || showEffectivenessSlot || showMedicationSlot;

  const rowClass = cn(
    highlight && 'ring-2 ring-inset ring-amber-300',
    compactStable && 'bg-[#eef8f2]',
    (exceptionComplete || pendingException) && 'bg-[#fdf6eb]',
  );

  const identity = (
    <div className="min-w-0">
      <p className="font-semibold leading-snug text-[#102a43]">{group.displayName}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">
        {linkedMedicationMutedLabel(linkedMeds) || 'No medications linked yet'}
      </p>
      {category ? (
        <span className="mt-1.5 inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-[#52677a] ring-1 ring-[#d9e4e8]">
          {category}
        </span>
      ) : null}
      {exceptionComplete && findings[0] && !showExpanded ? (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-amber-200/80 bg-[#fff8ee] px-2.5 py-2">
          <p className="flex min-w-0 items-start gap-1.5 text-[12px] font-medium leading-snug text-[#7a4b2e]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
            <span>{findings[0]}</span>
          </p>
          <button
            type="button"
            className="shrink-0 text-[12px] font-semibold text-primary"
            onClick={openAnyEditor}
          >
            View / edit
          </button>
        </div>
      ) : null}
    </div>
  );

  const toggles = (
    <>
      <ChoiceToggle
        labelledBy="Taking as prescribed?"
        value={displayedAdherence}
        invalid={showFieldErrors && Boolean(errorByField.adherence)}
        warningIds={['no']}
        options={[
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ]}
        onChange={onAdherenceChange}
      />
      <FieldError show={showFieldErrors} message={errorByField.adherence} />
      <ChoiceToggle
        labelledBy="Effectiveness / stability concerns?"
        value={uiEffectiveness}
        invalid={showFieldErrors && Boolean(errorByField.effectiveness)}
        disabled={!effectivenessEnabled}
        disabledReason="Complete Taking as prescribed first."
        positiveId="no"
        warningIds={['yes']}
        options={[
          { id: 'no', label: 'No' },
          { id: 'yes', label: 'Yes' },
        ]}
        onChange={onUiEffectivenessChange}
      />
      <FieldError show={showFieldErrors} message={errorByField.effectiveness} />
      <ChoiceToggle
        labelledBy="Medication concerns?"
        value={displayedConcern}
        invalid={showFieldErrors && Boolean(errorByField.medicationConcern)}
        disabled={!medicationEnabled}
        disabledReason="Complete the previous responses first."
        positiveId="no"
        warningIds={['yes']}
        options={[
          { id: 'no', label: 'No' },
          { id: 'yes', label: 'Yes' },
        ]}
        onChange={onConcernChange}
      />
      <FieldError show={showFieldErrors} message={errorByField.medicationConcern} />
    </>
  );

  const stableBanner = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0b7a52]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Stable therapy responses documented.
      </p>
      <button
        type="button"
        className="text-[13px] font-semibold text-primary hover:underline"
        onClick={() => setEditingResponses(true)}
      >
        Edit responses
      </button>
    </div>
  );

  const menu = (
    <RowActionsMenu
      onEditResponses={openAnyEditor}
      onViewDetails={onViewDetails}
      onRemove={onRemoveCondition}
    />
  );

  const renderAdherenceSlot = (compact: boolean) =>
    showAdherenceEditor ? (
      <div
        data-pending-review-editor={pendingAdherenceNo ? 'true' : undefined}
        data-review-id={group.review.id}
      >
        <AdherenceConcernPanel
          group={group}
          medications={linkedMeds}
          compact={compact}
          onCancel={closeAdherenceEditor}
          onCommit={patchAdherenceIssues}
        />
      </div>
    ) : showAdherenceSummary && showAdherenceSlot ? (
      <AdherenceConcernSummary group={group} medications={linkedMeds} onEdit={openAdherenceEditor} />
    ) : null;

  const renderEffectivenessSlot = (compact: boolean) =>
    showEffectivenessEditor ? (
      <div
        data-pending-review-editor={pendingEffectiveness ? 'true' : undefined}
        data-review-id={group.review.id}
      >
        <EffectivenessConcernPanel
          group={group}
          mode={showEffectivenessEditor}
          compact={compact}
          onCancel={closeEffectivenessEditor}
          onCommit={(issue, status) => persistIssue(issue, status)}
        />
      </div>
    ) : showEffectivenessSummary && showEffectivenessSlot ? (
      <EffectivenessConcernSummary
        group={group}
        onEdit={() =>
          openEffectivenessEditor(
            isUnableToAssessStatus(group.review.effectivenessStatus) ? 'unable_to_assess' : 'no',
          )
        }
      />
    ) : null;

  const renderMedicationSlot = (compact: boolean) =>
    showMedicationEditor ? (
      <div
        data-pending-review-editor={pendingMedicationYes ? 'true' : undefined}
        data-review-id={group.review.id}
      >
        <MedicationConcernPanel
          group={group}
          medications={linkedMeds}
          compact={compact}
          onCancel={closeMedicationEditor}
          onCommit={patchConcerns}
        />
      </div>
    ) : showMedicationSummary && showMedicationSlot ? (
      <MedicationConcernSummary group={group} medications={linkedMeds} onEdit={openMedicationEditor} />
    ) : null;

  const editors = (
    <div className="space-y-3">
      {renderAdherenceSlot(false)}
      {renderEffectivenessSlot(false)}
      {renderMedicationSlot(false)}
    </div>
  );

  const dialogs = (
    <>
      <AdherenceChangeDialog
        mode={confirmMode}
        onKeep={() => setConfirmMode(null)}
        onYes={setAdherenceYes}
        onClear={clearAdherence}
      />
      <EffectivenessChangeDialog
        confirm={confirmEffectiveness}
        savedStatus={group.review.effectivenessStatus}
        onKeep={keepCurrent}
        onChange={confirmChange}
      />
      <MedicationConcernChangeDialog
        mode={concernConfirmMode}
        onKeep={() => setConcernConfirmMode(null)}
        onNo={setConcernNo}
        onClear={clearConcern}
      />
    </>
  );

  if (layout === 'mobile') {
    return (
      <article
        className={cn(
          'rounded-[14px] border border-[#d9e4e8] bg-white p-3.5',
          rowClass,
          (exceptionComplete || pendingException) && 'border-l-[3px] border-l-amber-400',
        )}
        data-review-row={group.key}
        data-review-id={group.review.id}
        data-incomplete-review={fieldErrors.length ? 'true' : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          {identity}
          <div className="flex items-center gap-1">
            {exceptionComplete ? (
              <button
                type="button"
                aria-expanded={exceptionOpen}
                aria-label={exceptionOpen ? 'Collapse concern details' : 'Expand concern details'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#52677a] hover:bg-white/70"
                onClick={() => setExceptionOpen((open) => !open)}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', exceptionOpen && 'rotate-180')} />
              </button>
            ) : null}
            {menu}
          </div>
        </div>
        {compactStable ? <div className="mt-3">{stableBanner}</div> : <div className="mt-3 space-y-3">{toggles}</div>}
        {showExpanded ? <div className="mt-3">{editors}</div> : null}
        {dialogs}
      </article>
    );
  }

  return (
    <>
      <tr
        className={cn(
          'border-b border-[#e8eef0] align-top',
          rowClass,
          (exceptionComplete || pendingException) && 'shadow-[inset_3px_0_0_0_#f0b429]',
        )}
        data-review-row={group.key}
        data-review-id={group.review.id}
        data-incomplete-review={fieldErrors.length ? 'true' : undefined}
      >
        <td className="px-4 py-3.5">{identity}</td>
        {compactStable ? (
          <td colSpan={3} className="px-3 py-3.5">
            {stableBanner}
          </td>
        ) : (
          <>
            <td
              className={cn(
                'px-3 py-3.5',
                showAdherenceSlot && 'rounded-t-lg bg-[#fbf6ea]/70',
              )}
            >
              <ChoiceToggle
                labelledBy="Taking as prescribed?"
                value={displayedAdherence}
                invalid={showFieldErrors && Boolean(errorByField.adherence)}
                warningIds={['no']}
                options={[
                  { id: 'yes', label: 'Yes' },
                  { id: 'no', label: 'No' },
                ]}
                onChange={onAdherenceChange}
              />
              <FieldError show={showFieldErrors} message={errorByField.adherence} />
            </td>
            <td
              className={cn(
                'px-3 py-3.5',
                showEffectivenessSlot && 'rounded-t-lg bg-[#fbf6ea]/70',
                !effectivenessEnabled && 'opacity-70',
              )}
            >
              <ChoiceToggle
                labelledBy="Effectiveness / stability concerns?"
                value={uiEffectiveness}
                invalid={showFieldErrors && Boolean(errorByField.effectiveness)}
                disabled={!effectivenessEnabled}
                disabledReason="Complete Taking as prescribed first."
                positiveId="no"
                warningIds={['yes']}
                options={[
                  { id: 'no', label: 'No' },
                  { id: 'yes', label: 'Yes' },
                ]}
                onChange={onUiEffectivenessChange}
              />
              <FieldError show={showFieldErrors} message={errorByField.effectiveness} />
            </td>
            <td
              className={cn(
                'px-3 py-3.5',
                showMedicationSlot && 'rounded-t-lg bg-[#fbf6ea]/70',
                !medicationEnabled && 'opacity-70',
              )}
            >
              <ChoiceToggle
                labelledBy="Medication concerns?"
                value={displayedConcern}
                invalid={showFieldErrors && Boolean(errorByField.medicationConcern)}
                disabled={!medicationEnabled}
                disabledReason="Complete the previous responses first."
                positiveId="no"
                warningIds={['yes']}
                options={[
                  { id: 'no', label: 'No' },
                  { id: 'yes', label: 'Yes' },
                ]}
                onChange={onConcernChange}
              />
              <FieldError show={showFieldErrors} message={errorByField.medicationConcern} />
            </td>
          </>
        )}
        <td className="px-2 py-3.5">
          <div className="flex items-center justify-end gap-1">
            {exceptionComplete ? (
              <button
                type="button"
                aria-expanded={exceptionOpen}
                aria-label={exceptionOpen ? 'Collapse concern details' : 'Expand concern details'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#52677a] hover:bg-white/80"
                onClick={() => setExceptionOpen((open) => !open)}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', exceptionOpen && 'rotate-180')} />
              </button>
            ) : null}
            {menu}
          </div>
        </td>
      </tr>
      {showExpanded ? (
        <tr
          className={cn(
            'border-b border-[#e8eef0]',
            (exceptionComplete || pendingException) && 'bg-[#fdf6eb]',
          )}
        >
          <td className="px-4 py-0" aria-hidden />
          <td
            className={cn(
              'px-3 pb-3.5 pt-0 align-top',
              showAdherenceSlot && 'bg-[#fbf6ea]/70',
            )}
          >
            {showAdherenceSlot ? <ColumnExpandRail>{renderAdherenceSlot(true)}</ColumnExpandRail> : null}
          </td>
          <td
            className={cn(
              'px-3 pb-3.5 pt-0 align-top',
              showEffectivenessSlot && 'bg-[#fbf6ea]/70',
            )}
          >
            {showEffectivenessSlot ? (
              <ColumnExpandRail>{renderEffectivenessSlot(true)}</ColumnExpandRail>
            ) : null}
          </td>
          <td
            className={cn(
              'px-3 pb-3.5 pt-0 align-top',
              showMedicationSlot && 'bg-[#fbf6ea]/70',
            )}
          >
            {showMedicationSlot ? <ColumnExpandRail>{renderMedicationSlot(true)}</ColumnExpandRail> : null}
          </td>
          <td className="px-2 py-0" aria-hidden />
        </tr>
      ) : null}
      {dialogs}
    </>
  );
}

function ColumnExpandRail({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-w-0 pt-2.5">
      <div
        className="pointer-events-none absolute left-3 right-3 top-0 h-px bg-gradient-to-r from-amber-300/80 via-amber-200/50 to-transparent"
        aria-hidden
      />
      {children}
    </div>
  );
}

function RowActionsMenu({
  onEditResponses,
  onViewDetails,
  onRemove,
}: {
  onEditResponses: () => void;
  onViewDetails: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Row options"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#667085] hover:bg-white/80 hover:text-[#102a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onEditResponses}>Edit responses</DropdownMenuItem>
        <DropdownMenuItem onSelect={onViewDetails}>View condition details</DropdownMenuItem>
        <DropdownMenuItem className="text-[#b4232a] focus:text-[#b4232a]" onSelect={onRemove}>
          Remove condition
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ConditionDetailsDialog({
  open,
  group,
  linkedMeds,
  onClose,
}: {
  open: boolean;
  group: TherapyConditionGroup | null;
  linkedMeds: RenewMedication[];
  onClose: () => void;
}) {
  if (!group) return null;
  const completion = getConditionReviewCompletion(group.review, group.medicationIds.length);
  const statusLabel =
    completion === 'COMPLETE_STABLE'
      ? 'Stable therapy responses documented'
      : completion === 'COMPLETE_WITH_CONCERN' || completion === 'COMPLETE_UNABLE_TO_ASSESS'
        ? 'Concern documented'
        : 'Review in progress';
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Condition details</DialogTitle>
          <DialogDescription>Linked medications and current review status for this indication.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[12px] font-medium text-[#667085]">Condition</dt>
            <dd className="mt-0.5 font-semibold text-[#102a43]">{group.displayName}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-[#667085]">Linked medication(s)</dt>
            <dd className="mt-0.5 text-[#102a43]">
              {linkedMeds.length ? linkedMeds.map((med) => medicationShortName(med)).join(', ') : 'None'}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-[#667085]">Review status</dt>
            <dd className="mt-0.5 text-[#102a43]">{statusLabel}</dd>
          </div>
        </dl>
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ show, message }: { show: boolean; message?: string }) {
  if (!show || !message) return null;
  return (
    <p className="mt-1.5 text-[12px] font-medium text-[#9a4a3a]" role="alert">
      {message}
    </p>
  );
}

function ChoiceToggle({
  value,
  options,
  onChange,
  labelledBy,
  invalid,
  disabled,
  disabledReason,
  positiveId = 'yes',
  warningIds,
}: {
  value: string | null;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string | null) => void;
  labelledBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  positiveId?: string;
  warningIds?: string[];
}) {
  return (
    <div
      role="group"
      aria-label={labelledBy}
      aria-required
      aria-invalid={invalid || undefined}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledReason : undefined}
      className={cn(
        'flex flex-wrap gap-1.5 rounded-lg',
        invalid && 'ring-2 ring-[#9a4a3a]/25',
        disabled && 'opacity-55',
      )}
    >
      {options.map((option) => {
        const selected = value === option.id;
        const warning = Boolean(selected && warningIds?.includes(option.id));
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onChange(selected ? null : option.id);
            }}
            className={cn(
              'inline-flex h-9 min-w-[3.5rem] items-center justify-center rounded-lg border px-3.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
              'disabled:cursor-not-allowed disabled:hover:border-[#d9e4e8]',
              selected && !warning && 'border-primary bg-primary text-primary-foreground',
              selected && warning && 'border-[#e67e22] bg-[#e67e22] text-white',
              !selected && 'border-[#d9e4e8] bg-white text-[#102a43] hover:border-primary/40',
              disabled && !selected && 'bg-[#f4f7f8] text-[#98a2b3]',
            )}
            data-positive={option.id === positiveId || undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function AdherenceChangeDialog({
  mode,
  onKeep,
  onYes,
  onClear,
}: {
  mode: 'yes' | 'clear' | null;
  onKeep: () => void;
  onYes: () => void;
  onClear: () => void;
}) {
  return (
    <Dialog open={Boolean(mode)} onOpenChange={(open) => !open && onKeep()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'clear' ? 'Clear this adherence response?' : 'Change to taking as prescribed?'}
          </DialogTitle>
          <DialogDescription>
            This condition has documented adherence concerns.
            {mode === 'clear'
              ? ' Clearing the answer will remove those concerns.'
              : ' Changing to Yes will remove those concerns.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onKeep}>
            Keep No
          </Button>
          <Button type="button" className="h-10" onClick={mode === 'clear' ? onClear : onYes}>
            {mode === 'clear' ? 'Clear and remove concerns' : 'Change to Yes and remove concerns'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EffectivenessChangeDialog({
  confirm,
  savedStatus,
  onKeep,
  onChange,
}: {
  confirm: 'yes' | 'no' | 'unable_to_assess' | 'clear' | null;
  savedStatus: string | null;
  onKeep: () => void;
  onChange: () => void;
}) {
  const unable = isUnableToAssessStatus(savedStatus);
  return (
    <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && onKeep()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirm === 'clear' ? 'Clear this effectiveness response?' : 'Change the effectiveness response?'}
          </DialogTitle>
          <DialogDescription>
            {unable
              ? 'This condition has an “Unable to confirm” reason documented. Changing or clearing the response will remove that reason.'
              : 'This condition has a documented effectiveness / stability concern. Changing or clearing the response will remove that documentation.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onKeep}>
            Keep current response
          </Button>
          <Button type="button" className="h-10" onClick={onChange}>
            {confirm === 'clear' ? 'Clear response' : 'Change response'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MedicationConcernChangeDialog({
  mode,
  onKeep,
  onNo,
  onClear,
}: {
  mode: 'no' | 'clear' | null;
  onKeep: () => void;
  onNo: () => void;
  onClear: () => void;
}) {
  return (
    <Dialog open={Boolean(mode)} onOpenChange={(open) => !open && onKeep()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'clear' ? 'Clear this medication-related concern response?' : 'Change to no concerns?'}
          </DialogTitle>
          <DialogDescription>
            This condition has documented medication-related concerns.
            {mode === 'clear'
              ? ' Clearing the answer will remove those concern records.'
              : ' Changing to No will remove those concern records.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onKeep}>
            Keep Yes
          </Button>
          <Button type="button" className="h-10" onClick={mode === 'clear' ? onClear : onNo}>
            {mode === 'clear' ? 'Clear and remove concerns' : 'Change to No and remove concerns'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
