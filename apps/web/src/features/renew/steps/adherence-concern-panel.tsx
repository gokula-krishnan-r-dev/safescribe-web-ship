'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SelectChip } from '../select-chip';
import { Checkbox } from '@/components/ui/checkbox';
import {
  RENEW_ADHERENCE_ISSUE_OPTIONS,
  adherenceConcerns,
  adherenceIssueLabel,
  formatAffectedMedicationsLabel,
  getAffectedMedicationSelectorMode,
  isDuplicateAdherenceConcern,
  medicationShortName,
  type RenewMedication,
  type RenewTherapyIssue,
  type TherapyConditionGroup,
} from '@safescript/shared';

const NOTE_MAX = 400;

function newIssueId() {
  return `riss_${Math.random().toString(36).slice(2, 10)}`;
}

type Draft = {
  id: string;
  medicationIds: string[];
  issueCategory: string;
  otherText: string;
  note: string;
};

function emptyDraft(medications: RenewMedication[], existingId?: string): Draft {
  return {
    id: existingId ?? newIssueId(),
    medicationIds: medications.length === 1 && medications[0] ? [medications[0].id] : [],
    issueCategory: '',
    otherText: '',
    note: '',
  };
}

function draftFromIssue(issue: RenewTherapyIssue): Draft {
  return {
    id: issue.id,
    medicationIds: [...issue.medicationIds],
    issueCategory: issue.issueCategory ?? '',
    otherText: issue.otherText ?? '',
    note: issue.details ?? '',
  };
}

export function AdherenceConcernPanel({
  group,
  medications,
  compact = false,
  onCancel,
  onCommit,
}: {
  group: TherapyConditionGroup;
  medications: RenewMedication[];
  compact?: boolean;
  onCancel: () => void;
  onCommit: (issues: RenewTherapyIssue[]) => void | Promise<void>;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const saved = adherenceConcerns(group.review);
  const [issues, setIssues] = useState<RenewTherapyIssue[]>(saved);
  const [draft, setDraft] = useState<Draft>(() =>
    saved[0] && saved.length === 1 ? draftFromIssue(saved[0]) : emptyDraft(medications),
  );
  const [editingId, setEditingId] = useState<string | null>(
    saved.length === 1 ? saved[0]?.id ?? null : saved.length === 0 ? draft.id : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const mode = getAffectedMedicationSelectorMode(medications.length);
  const composing = editingId === draft.id;

  const bothSelected =
    medications.length === 2 &&
    draft.medicationIds.length === 2 &&
    medications.every((med) => draft.medicationIds.includes(med.id));

  const canSave =
    Boolean(draft.issueCategory) &&
    (mode === 'HIDDEN' || draft.medicationIds.length > 0) &&
    (draft.issueCategory !== 'other' || Boolean(draft.otherText.trim()));

  const persistDraft = async (nextIssues: RenewTherapyIssue[]) => {
    await onCommit(nextIssues);
    setIssues(nextIssues);
  };

  const saveDraft = async (keepOpen: boolean) => {
    if (!canSave) {
      setError(
        mode !== 'HIDDEN' && draft.medicationIds.length === 0
          ? 'Select which medication is affected.'
          : draft.issueCategory === 'other' && !draft.otherText.trim()
            ? 'Specify the other reason.'
            : 'Select what is happening.',
      );
      return;
    }
    const medicationIds =
      mode === 'HIDDEN' && medications[0] ? [medications[0].id] : draft.medicationIds;
    if (
      isDuplicateAdherenceConcern(issues, { medicationIds, issueCategory: draft.issueCategory }, draft.id)
    ) {
      setError('This adherence concern has already been documented.');
      return;
    }
    const nextIssue: RenewTherapyIssue = {
      id: draft.id,
      conditionKey: group.key,
      medicationIds,
      issueType: 'adherence',
      issueCategory: draft.issueCategory,
      actionTaken: null,
      details: draft.note.trim() || null,
      otherText: draft.issueCategory === 'other' ? draft.otherText.trim() : null,
      requiresStep3Review: true,
    };
    const nextIssues = [...issues.filter((row) => row.id !== draft.id), nextIssue];
    setSaving(true);
    try {
      await persistDraft(nextIssues);
      setError(null);
      if (keepOpen) {
        const fresh = emptyDraft(medications);
        setDraft(fresh);
        setEditingId(fresh.id);
        return;
      }
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  const startAnother = () => {
    if (composing && (draft.issueCategory || draft.note || draft.otherText || draft.medicationIds.length)) {
      void saveDraft(true);
      return;
    }
    const fresh = emptyDraft(medications);
    setDraft(fresh);
    setEditingId(fresh.id);
    setError(null);
  };

  return (
    <div
      className={cn(
        'rounded-[14px] border border-amber-200/90 border-l-[3px] border-l-amber-400 bg-[#fbf6ea]',
        compact ? 'p-3.5' : 'p-5 sm:p-6',
      )}
    >
      <p
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className={cn(
          'font-semibold text-[#7a4b2e] outline-none',
          compact ? 'text-[14px]' : 'text-[15px]',
        )}
      >
        Adherence concern
      </p>
      <p className={cn('text-[#52677a]', compact ? 'mt-1 text-[12px] leading-snug' : 'mt-1.5 text-[13px]')}>
        Please provide details about the adherence issue.
      </p>

      {issues.length && !composing ? (
        <ul className="mt-3 space-y-2">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-200/70 bg-white/70 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-[#102a43]">
                  {formatAffectedMedicationsLabel(issue.medicationIds, group.medicationIds, medications)}
                </p>
                <p className="text-[13px] text-[#52677a]">{adherenceIssueLabel(issue.issueCategory)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-[13px] font-medium text-primary"
                  onClick={() => {
                    setDraft(draftFromIssue(issue));
                    setEditingId(issue.id);
                    setError(null);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[13px] font-medium text-[#9a4a3a]"
                  onClick={() => {
                    const next = issues.filter((row) => row.id !== issue.id);
                    void persistDraft(next).then(() => {
                      if (editingId === issue.id) {
                        const fresh = emptyDraft(medications);
                        setDraft(fresh);
                        setEditingId(next.length ? null : fresh.id);
                      }
                    });
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {composing ? (
        <div className={cn(compact ? 'mt-3 space-y-3' : 'mt-4 space-y-4')}>
          {mode === 'TWO_MED_CHIPS' ? (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-[#102a43]">
                Which medication is affected?
              </legend>
              <div role="radiogroup" aria-label="Which medication is affected?" className="flex flex-wrap gap-2">
                {medications.map((med) => {
                  const selected =
                    !bothSelected && draft.medicationIds.length === 1 && draft.medicationIds[0] === med.id;
                  return (
                    <SelectChip
                      key={med.id}
                      role="radio"
                      showCheck
                      selected={selected}
                      label={medicationShortName(med)}
                      onClick={() => setDraft((prev) => ({ ...prev, medicationIds: [med.id] }))}
                    />
                  );
                })}
                <SelectChip
                  role="radio"
                  showCheck
                  selected={bothSelected}
                  label="Both medications"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, medicationIds: medications.map((med) => med.id) }))
                  }
                />
              </div>
            </fieldset>
          ) : null}

          {mode === 'MULTI_CHECKBOX' ? (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-[#102a43]">
                Which medication(s) are affected?
              </legend>
              <div className="space-y-1.5">
                {medications.map((med) => {
                  const checked = draft.medicationIds.includes(med.id);
                  return (
                    <label key={med.id} className="flex items-center gap-2.5 text-sm text-[#102a43]">
                      <Checkbox
                        checked={checked}
                        size="sm"
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            medicationIds: event.target.checked
                              ? [...prev.medicationIds, med.id]
                              : prev.medicationIds.filter((id) => id !== med.id),
                          }))
                        }
                      />
                      {medicationShortName(med)}
                    </label>
                  );
                })}
                <label className="flex items-center gap-2.5 text-sm font-medium text-[#102a43]">
                  <Checkbox
                    checked={draft.medicationIds.length === medications.length && medications.length > 0}
                    size="sm"
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        medicationIds: event.target.checked ? medications.map((med) => med.id) : [],
                      }))
                    }
                  />
                  Select all
                </label>
              </div>
            </fieldset>
          ) : null}

          <label className="block text-[13px] font-medium text-[#102a43]">
            What is the concern?
            <Select
              className="mt-1.5 bg-white"
              value={draft.issueCategory}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  issueCategory: event.target.value,
                  otherText: event.target.value === 'other' ? prev.otherText : '',
                }))
              }
              placeholder="Select reason"
              options={RENEW_ADHERENCE_ISSUE_OPTIONS.map((row) => ({ value: row.id, label: row.label }))}
            />
          </label>

          {draft.issueCategory === 'other' ? (
            <label className="block text-[13px] font-medium text-[#102a43]">
              Specify
              <Input
                className="mt-1.5 bg-white"
                value={draft.otherText}
                onChange={(event) => setDraft((prev) => ({ ...prev, otherText: event.target.value }))}
                placeholder="Describe the adherence issue"
              />
            </label>
          ) : null}

          <label className="block text-[13px] font-medium text-[#102a43]">
            Optional note
            <Textarea
              className={cn('mt-1.5 bg-white', compact ? 'min-h-[64px]' : 'min-h-[76px]')}
              value={draft.note}
              maxLength={NOTE_MAX}
              onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Add a short clinical note if needed"
            />
            <span className="mt-1 block text-[11px] font-normal text-[#7b8b99]">
              {draft.note.length}/{NOTE_MAX}
            </span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-[13px] text-[#9a4a3a]" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          'mt-4 flex flex-col gap-3',
          compact ? 'items-stretch' : 'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <button
          type="button"
          className="inline-flex items-center text-sm font-medium text-primary"
          onClick={startAnother}
        >
          + Add another adherence concern
        </button>
        <div className={cn('flex gap-2', compact ? 'justify-stretch' : 'justify-end')}>
          <Button
            type="button"
            variant="outline"
            className={cn('h-10 rounded-lg bg-white', compact && 'flex-1')}
            onClick={onCancel}
          >
            Cancel
          </Button>
          {composing ? (
            <Button
              type="button"
              className={cn('h-10 rounded-lg', compact && 'flex-1')}
              disabled={!canSave || saving}
              onClick={() => void saveDraft(false)}
            >
              Save concern
            </Button>
          ) : (
            <Button type="button" className={cn('h-10 rounded-lg', compact && 'flex-1')} onClick={onCancel}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdherenceConcernSummary({
  group,
  medications,
  onEdit,
}: {
  group: TherapyConditionGroup;
  medications: RenewMedication[];
  onEdit: () => void;
}) {
  const issues = adherenceConcerns(group.review);
  if (!issues.length) return null;
  const label =
    issues.length > 1
      ? `${issues.length} adherence concerns documented`
      : `Adherence concern documented — ${formatAffectedMedicationsLabel(issues[0]!.medicationIds, group.medicationIds, medications)}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
      <p className="flex items-center gap-2 text-[13px] font-medium text-[#7a4b2e]">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        {label}
      </p>
      <button type="button" className="text-[13px] font-medium text-primary" onClick={onEdit}>
        View / edit
      </button>
    </div>
  );
}
