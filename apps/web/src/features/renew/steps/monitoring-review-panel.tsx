'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Info, OctagonX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import {
  MONITORING_REVIEW_ACTION_OPTIONS,
  dialysisDisplayLabel,
  formatMonitoringDate,
  formatMonitoringResult,
  reviewFindingNarrative,
  validateMonitoringReview,
  type MonitoringReviewAction,
  type MonitoringRowPresentation,
  type RenewMonitoringRequirement,
} from '@safescript/shared';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { MonitoringReferencePopover } from './monitoring-reference-popover';
import { PharmacistActionGroup } from './pharmacist-action-group';

const DURATION_OPTIONS = [
  { id: '7_days', label: '7 days' },
  { id: '14_days', label: '14 days' },
  { id: 'custom', label: 'Custom' },
] as const;

export function MonitoringReviewPanel({
  row,
  presentation,
  saving,
  onCancel,
  onSave,
}: {
  row: RenewMonitoringRequirement;
  presentation: MonitoringRowPresentation;
  saving?: boolean;
  onCancel: () => void;
  onSave: (body: {
    action: MonitoringReviewAction;
    note: string;
    otherText?: string | null;
    affectedMedicationIds?: string[];
    shorterDurationId?: string | null;
  }) => void;
}) {
  const saved = presentation.review;
  const [action, setAction] = useState<MonitoringReviewAction | ''>(saved?.action ?? '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [otherText, setOtherText] = useState(saved?.otherText ?? '');
  const [durationId, setDurationId] = useState(saved?.shorterDurationId ?? '');
  const [affectedIds, setAffectedIds] = useState<string[]>(
    saved?.affectedMedicationIds?.length
      ? saved.affectedMedicationIds
      : row.medicationIds.length === 1
        ? row.medicationIds
        : [],
  );
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => MONITORING_REVIEW_ACTION_OPTIONS.filter((option) => presentation.allowedActions.includes(option.id)),
    [presentation.allowedActions],
  );
  const renalReview = Boolean(presentation.dialysisStatus && presentation.renalEvaluations?.length);
  const actionFinding = presentation.interpretation === 'ACTION_REQUIRED';
  const narrative = reviewFindingNarrative(row, presentation);
  const medications = row.medicationIds.map((id, index) => ({
    id,
    name: row.medicationNames[index] ?? id,
  }));

  const submit = () => {
    const nextError = validateMonitoringReview({
      action,
      note,
      otherText,
      affectedMedicationIds: affectedIds,
      medicationCount: row.medicationIds.length,
      rationaleRequired: actionFinding,
    });
    if (nextError || !action) {
      setError(nextError ?? 'Select a pharmacist action before saving.');
      return;
    }
    setError(null);
    onSave({
      action,
      note,
      otherText: action === 'OTHER' ? otherText.trim() || null : null,
      affectedMedicationIds: action === 'DO_NOT_RENEW_MEDICATION' ? affectedIds : [],
      shorterDurationId: action === 'SHORTER_RENEWAL' ? durationId || null : null,
    });
  };

  return (
    <div id={`monitoring-review-${row.inputCode}`} className="rounded-[12px] border border-[#e4ecee] bg-[#f5f7f8] px-5 py-4">
      <p className="text-[15px] font-semibold text-[#163447]">
        {renalReview ? 'Medication-specific renal review' : `${row.label} review`}
      </p>
      {renalReview && presentation.dialysisStatus ? (
        <p className="mt-1 text-[13px] text-[#5b6b75]">
          Dialysis status: {dialysisDisplayLabel(presentation.dialysisStatus)}
        </p>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(0,1.55fr)_minmax(0,1.25fr)]">
        <section className="min-w-0">
          <SectionLabel n={1}>Current result</SectionLabel>
          <p className="mt-2 text-[18px] font-semibold leading-6 text-[#163447]">
            {formatMonitoringResult(row.result, row.unit)}
          </p>
          {presentation.resultHint ? (
            <p
              className={cn(
                'mt-0.5 text-[12px] font-medium',
                presentation.validationStatus === 'UNIT_MISMATCH' ||
                  presentation.validationStatus === 'MISSING_UNIT'
                  ? 'text-[#b54708]'
                  : 'text-[#b42318]',
              )}
            >
              {presentation.resultHint}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] text-[#5b6b75]">Date</p>
          <p className="text-[13px] text-[#163447]">
            {row.result.observedDate ? formatMonitoringDate(row.result.observedDate) : 'Not identified'}
          </p>
        </section>

        <section className="min-w-0">
          <SectionLabel n={2}>Clinical context / finding</SectionLabel>
          <div className="mt-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                actionFinding ? 'bg-[#fce8e8] text-[#b42318]' : 'bg-[#fdedd3] text-[#b54708]',
              )}
            >
              {actionFinding ? <OctagonX className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {presentation.badgeLabel.replace(' — reviewed', '')}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#344054]">{narrative}</p>
          {row.medicationNames.length && !renalReview ? (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-[#5b6b75]">Linked medications</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {row.medicationNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-[#0F6F6B]/30 bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#0F6F6B]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {renalReview ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-[#edf1f3] bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-[#edf1f3] bg-[#f7fafb] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">
                <span>Medication</span>
                <span>Evaluation</span>
              </div>
              <ul>
                {presentation.renalEvaluations.map((item) => (
                  <li
                    key={item.medicationId}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-[#f1f4f6] px-3 py-2.5 last:border-b-0"
                  >
                    <p className="text-[13px] font-medium text-[#163447]">{item.medicationName}</p>
                    <div>
                      <p className="text-[13px] font-semibold text-[#163447]">{item.badgeLabel}</p>
                      <p className="mt-0.5 text-[12px] leading-4 text-[#5b6b75]">{item.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {presentation.reference.infoAvailable ? (
            <MonitoringReferencePopover {...presentation.reference.popover}>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[#0F6F6B] hover:underline"
              >
                Why this target?
                <Info className="h-3 w-3" />
              </button>
            </MonitoringReferencePopover>
          ) : null}
        </section>

        <section className="min-w-0 lg:min-w-[220px]">
          <SectionLabel n={3}>Pharmacist action</SectionLabel>
          <PharmacistActionGroup
            className="mt-2"
            name={`review-action-${row.inputCode}`}
            value={action}
            options={options.map((option) => ({
              id: option.id,
              label: option.reviewLabel,
            }))}
            disabled={saving}
            onChange={(id) => {
              setAction(id as MonitoringReviewAction);
              setError(null);
            }}
          />

          {action === 'SHORTER_RENEWAL' ? (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-[#5b6b75]">Renewal duration</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DURATION_OPTIONS.map((option) => (
                  <ChoiceChip
                    key={option.id}
                    role="radio"
                    label={option.label}
                    selected={durationId === option.id}
                    onClick={() => setDurationId(option.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {action === 'DO_NOT_RENEW_MEDICATION' && medications.length > 1 ? (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-[#5b6b75]">Which medication should not be renewed?</p>
              {medications.length >= 3 ? (
                <div className="mt-1.5 space-y-1">
                  {medications.map((med) => {
                    const selected = affectedIds.includes(med.id);
                    return (
                      <label key={med.id} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#163447]">
                        <Checkbox
                          checked={selected}
                          size="sm"
                          onChange={() =>
                            setAffectedIds((current) =>
                              selected ? current.filter((id) => id !== med.id) : [...current, med.id],
                            )
                          }
                          aria-label={med.name}
                        />
                        {med.name}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {medications.map((med) => {
                    const selected = affectedIds.includes(med.id);
                    return (
                      <ChoiceChip
                        key={med.id}
                        label={med.name}
                        selected={selected}
                        onClick={() =>
                          setAffectedIds((current) =>
                            selected ? current.filter((id) => id !== med.id) : [...current, med.id],
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {action === 'OTHER' ? (
            <input
              value={otherText}
              onChange={(event) => {
                setOtherText(event.target.value.slice(0, 160));
                setError(null);
              }}
              placeholder="Specify the action"
              className="mt-3 h-10 w-full rounded-[10px] border border-[#C5D0D4] bg-white px-3 text-[13px] text-[#163447] outline-none transition-[border-color,box-shadow] placeholder:text-[#9aa8b0] focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          ) : null}

          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionLabel n={4}>
            Pharmacist note <span className="font-normal text-[#7a8b94]">Optional</span>
          </SectionLabel>
          <div className="relative mt-2 flex min-h-[148px] flex-1 flex-col">
            <textarea
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              rows={7}
              disabled={saving}
              placeholder="Add notes about the decision, patient discussion or follow-up plan..."
              className="min-h-[148px] w-full flex-1 resize-none rounded-[10px] border border-[#C5D0D4] bg-white px-3 py-2.5 pb-7 text-[13px] leading-5 text-[#163447] outline-none transition-[border-color,box-shadow] placeholder:text-[#9aa8b0] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            />
            <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-[#9aa8b0]">
              {note.length} / 500
            </span>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3 font-semibold text-primary hover:bg-white hover:text-primary"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <ClinicalPrimaryButton
              type="button"
              className="h-9 rounded-lg px-4"
              loading={saving}
              onClick={submit}
            >
              {renalReview ? 'Mark renal review complete' : 'Save review'}
            </ClinicalPrimaryButton>
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="text-[13px] font-semibold text-[#163447]">
      <span className="mr-1 text-[#7a8b94]">{n}</span>
      {children}
    </p>
  );
}

function ChoiceChip({
  label,
  selected,
  onClick,
  role,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role === 'radio' ? undefined : selected}
      aria-checked={role === 'radio' ? selected : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6F6B]/25',
        selected
          ? 'border-[#0F6F6B] bg-[#0F6F6B] text-white'
          : 'border-[#d9e4e8] bg-white text-[#163447] hover:border-[#0F6F6B]/40',
      )}
    >
      {label}
    </button>
  );
}
