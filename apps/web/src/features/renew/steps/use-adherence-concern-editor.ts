'use client';

import { useEffect, useRef, useState } from 'react';
import {
  adherenceConcerns,
  type RenewConditionReview,
  type RenewTherapyIssue,
  type TherapyConditionGroup,
} from '@safescript/shared';

export function useAdherenceConcernEditor(
  group: TherapyConditionGroup,
  onPatch: (reviewId: string, patch: Partial<RenewConditionReview>) => void | Promise<void>,
) {
  const savedAdherence = adherenceConcerns(group.review);
  const [adherenceEditorOpen, setAdherenceEditorOpen] = useState(false);
  const [pendingAdherenceNo, setPendingAdherenceNo] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'yes' | 'clear' | null>(null);
  const committedAdherence = useRef(false);

  useEffect(() => {
    if (group.review.adherenceStatus === 'no') {
      committedAdherence.current = false;
      setPendingAdherenceNo(false);
    }
  }, [group.review.adherenceStatus]);

  const displayedAdherence = pendingAdherenceNo ? 'no' : group.review.adherenceStatus;
  const showAdherenceEditor = adherenceEditorOpen || pendingAdherenceNo;
  const showAdherenceSummary = !showAdherenceEditor && savedAdherence.length > 0;

  const closeAdherenceEditor = () => {
    setAdherenceEditorOpen(false);
    if (!committedAdherence.current) setPendingAdherenceNo(false);
  };

  const patchAdherenceIssues = async (nextAdherence: RenewTherapyIssue[]) => {
    committedAdherence.current = nextAdherence.length > 0;
    const rest = group.review.issues.filter((issue) => issue.issueType !== 'adherence');
    await onPatch(group.review.id, {
      adherenceStatus: nextAdherence.length ? 'no' : null,
      issues: [...rest, ...nextAdherence],
    });
  };

  const clearAdherence = () => {
    committedAdherence.current = false;
    setPendingAdherenceNo(false);
    setAdherenceEditorOpen(false);
    setConfirmMode(null);
    void onPatch(group.review.id, {
      adherenceStatus: null,
      issues: group.review.issues.filter((issue) => issue.issueType !== 'adherence'),
    });
  };

  const setAdherenceYes = () => {
    committedAdherence.current = false;
    setPendingAdherenceNo(false);
    setAdherenceEditorOpen(false);
    setConfirmMode(null);
    void onPatch(group.review.id, {
      adherenceStatus: 'yes',
      issues: group.review.issues.filter((issue) => issue.issueType !== 'adherence'),
    });
  };

  const onAdherenceChange = (adherenceStatus: string | null) => {
    const current = displayedAdherence;
    if (!adherenceStatus || adherenceStatus === current) {
      if (savedAdherence.length) {
        setConfirmMode('clear');
        return;
      }
      if (pendingAdherenceNo || adherenceEditorOpen) {
        closeAdherenceEditor();
        return;
      }
      clearAdherence();
      return;
    }
    if (adherenceStatus === 'no') {
      setPendingAdherenceNo(group.review.adherenceStatus !== 'no');
      setAdherenceEditorOpen(true);
      return;
    }
    if (savedAdherence.length) {
      setConfirmMode('yes');
      return;
    }
    setAdherenceYes();
  };

  return {
    savedAdherence,
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
    openAdherenceEditor: () => setAdherenceEditorOpen(true),
  };
}
