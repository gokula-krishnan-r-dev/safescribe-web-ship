'use client';

import { useEffect, useRef, useState } from 'react';
import {
  effectivenessIssue,
  isUnableToAssessStatus,
  type RenewConditionReview,
  type RenewEffectivenessStatus,
  type RenewTherapyIssue,
  type TherapyConditionGroup,
} from '@safescript/shared';

type EffectivenessChoice = 'yes' | 'no' | 'unable_to_assess';

function choiceOf(status: string | null | undefined): EffectivenessChoice | null {
  if (status === 'yes' || status === 'no') return status;
  if (isUnableToAssessStatus(status)) return 'unable_to_assess';
  return null;
}

export function useEffectivenessEditor(
  group: TherapyConditionGroup,
  onPatch: (reviewId: string, patch: Partial<RenewConditionReview>) => void | Promise<void>,
) {
  const savedChoice = choiceOf(group.review.effectivenessStatus);
  const savedIssue = effectivenessIssue(group.review);
  const hasSavedDetail = Boolean(savedIssue && (savedIssue.issueCategory || savedIssue.details));
  const [editor, setEditor] = useState<Exclude<EffectivenessChoice, 'yes'> | null>(null);
  const [pending, setPending] = useState<Exclude<EffectivenessChoice, 'yes'> | null>(null);
  const [confirm, setConfirm] = useState<EffectivenessChoice | 'clear' | null>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (savedChoice === 'no' || savedChoice === 'unable_to_assess') {
      committed.current = false;
      setPending(null);
    }
  }, [savedChoice]);

  const displayedEffectiveness = pending ?? savedChoice;
  const showEffectivenessEditor = editor ?? pending;
  const showEffectivenessSummary =
    !showEffectivenessEditor && hasSavedDetail && (savedChoice === 'no' || savedChoice === 'unable_to_assess');

  const closeEditor = () => {
    setEditor(null);
    if (!committed.current) setPending(null);
  };

  const stripEffectiveness = (issues = group.review.issues) =>
    issues.filter((issue) => issue.issueType !== 'effectiveness');

  const clearEffectiveness = () => {
    committed.current = false;
    setPending(null);
    setEditor(null);
    setConfirm(null);
    void onPatch(group.review.id, {
      effectivenessStatus: null,
      issues: stripEffectiveness(),
    });
  };

  const commitYes = () => {
    committed.current = false;
    setPending(null);
    setEditor(null);
    setConfirm(null);
    void onPatch(group.review.id, {
      effectivenessStatus: 'yes',
      issues: stripEffectiveness(),
    });
  };

  const persistIssue = async (issue: RenewTherapyIssue, status: Exclude<EffectivenessChoice, 'yes'>) => {
    committed.current = true;
    await onPatch(group.review.id, {
      effectivenessStatus: status as RenewEffectivenessStatus,
      issues: [...stripEffectiveness(), issue],
    });
  };

  const onEffectivenessChange = (next: string | null) => {
    const choice = choiceOf(next);
    const current = displayedEffectiveness;
    if (!choice || choice === current) {
      if (hasSavedDetail) {
        setConfirm('clear');
        return;
      }
      if (pending || editor) {
        closeEditor();
        return;
      }
      clearEffectiveness();
      return;
    }
    if (choice === 'yes') {
      if (hasSavedDetail) {
        setConfirm('yes');
        return;
      }
      commitYes();
      return;
    }
    if (hasSavedDetail && savedChoice && savedChoice !== choice) {
      setConfirm(choice);
      return;
    }
    setPending(savedChoice === choice ? null : choice);
    setEditor(choice);
  };

  const confirmChange = () => {
    const next = confirm;
    setConfirm(null);
    if (next === 'clear') {
      clearEffectiveness();
      return;
    }
    if (next === 'yes') {
      commitYes();
      return;
    }
    if (next === 'no' || next === 'unable_to_assess') {
      setPending(next);
      setEditor(next);
    }
  };

  return {
    displayedEffectiveness,
    showEffectivenessEditor,
    showEffectivenessSummary,
    pendingEffectiveness: pending,
    savedChoice,
    confirm,
    setConfirm,
    closeEditor,
    persistIssue,
    onEffectivenessChange,
    confirmChange,
    openEditor: (mode: 'no' | 'unable_to_assess') => setEditor(mode),
    keepCurrent: () => setConfirm(null),
  };
}
