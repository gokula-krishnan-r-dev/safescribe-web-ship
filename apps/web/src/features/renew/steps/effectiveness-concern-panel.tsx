'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  effectivenessConcernReasonOptions,
  effectivenessIssue,
  effectivenessStatusForConcernReason,
  getEffectivenessReviewCopy,
  isUnableToAssessStatus,
  lookupEffectivenessReasonLabel,
  type RenewTherapyIssue,
  type TherapyConditionGroup,
} from '@safescript/shared';

const NOTE_MAX = 500;

function newIssueId() {
  return `riss_${Math.random().toString(36).slice(2, 10)}`;
}

export function EffectivenessConcernPanel({
  group,
  mode: _mode,
  compact = false,
  onCancel,
  onCommit,
}: {
  group: TherapyConditionGroup;
  mode: 'no' | 'unable_to_assess';
  compact?: boolean;
  onCancel: () => void;
  onCommit: (
    issue: RenewTherapyIssue,
    status: 'no' | 'unable_to_assess',
  ) => void | Promise<void>;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const copy = getEffectivenessReviewCopy(group.conditionCode, group.displayName);
  const existing = effectivenessIssue(group.review);
  const reasons = effectivenessConcernReasonOptions(copy);
  const matchesSaved =
    group.review.effectivenessStatus === 'no' || isUnableToAssessStatus(group.review.effectivenessStatus);
  const [reasonId, setReasonId] = useState(matchesSaved ? existing?.issueCategory ?? '' : '');
  const [otherText, setOtherText] = useState(matchesSaved ? existing?.otherText ?? '' : '');
  const [note, setNote] = useState(matchesSaved ? existing?.details ?? '' : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, [_mode]);

  const canSave = Boolean(reasonId) && (reasonId !== 'other' || Boolean(otherText.trim()));

  const save = async () => {
    if (!canSave) {
      setError(
        reasonId === 'other' && !otherText.trim()
          ? 'Specify the other reason.'
          : 'Select a reason.',
      );
      return;
    }
    setSaving(true);
    try {
      const status = effectivenessStatusForConcernReason(reasonId, copy);
      await onCommit(
        {
          id: existing?.id ?? newIssueId(),
          conditionKey: group.key,
          medicationIds: group.medicationIds,
          issueType: 'effectiveness',
          issueCategory: reasonId,
          actionTaken: null,
          details: note.trim() || null,
          otherText: reasonId === 'other' ? otherText.trim() : null,
          requiresStep3Review: true,
        },
        status,
      );
      onCancel();
    } finally {
      setSaving(false);
    }
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
        Effectiveness / stability concern
      </p>
      <p className={cn('text-[#52677a]', compact ? 'mt-1 text-[12px] leading-snug' : 'mt-1.5 text-[13px]')}>
        Please provide details about the concern.
      </p>

      <label className={cn('block text-[13px] font-medium text-[#102a43]', compact ? 'mt-3' : 'mt-4')}>
        What is the concern?
        <Select
          className="mt-1.5 bg-white"
          value={reasonId}
          onChange={(event) => {
            setReasonId(event.target.value);
            if (event.target.value !== 'other') setOtherText('');
            setError(null);
          }}
          placeholder="Select a reason"
          options={reasons.map((row) => ({ value: row.id, label: row.label }))}
        />
      </label>

      {reasonId === 'other' ? (
        <label className={cn('block text-[13px] font-medium text-[#102a43]', compact ? 'mt-3' : 'mt-4')}>
          Specify reason
          <Input
            className="mt-1.5 bg-white"
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            placeholder="Describe the reason"
          />
        </label>
      ) : null}

      <label className={cn('block text-[13px] font-medium text-[#102a43]', compact ? 'mt-3' : 'mt-4')}>
        Additional details (optional)
        <Textarea
          className={cn('mt-1.5 bg-white', compact ? 'min-h-[64px]' : 'min-h-[76px]')}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a short clinical note if needed"
        />
        <span className="mt-1 block text-[11px] font-normal text-[#7b8b99]">
          {note.length}/{NOTE_MAX}
        </span>
      </label>

      {error ? (
        <p className="mt-3 text-[13px] text-[#9a4a3a]" role="alert">
          {error}
        </p>
      ) : null}

      <div className={cn('mt-4 flex gap-2', compact ? 'justify-stretch' : 'justify-end')}>
        <Button
          type="button"
          variant="outline"
          className={cn('h-10 rounded-lg bg-white', compact && 'flex-1')}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className={cn('h-10 rounded-lg', compact && 'flex-1')}
          disabled={!canSave || saving}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function EffectivenessConcernSummary({
  group,
  onEdit,
}: {
  group: TherapyConditionGroup;
  onEdit: () => void;
}) {
  const issue = effectivenessIssue(group.review);
  if (!issue) return null;
  const reason = lookupEffectivenessReasonLabel(issue.issueCategory);
  const label = `Effectiveness / stability concern documented — ${reason}`;

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
