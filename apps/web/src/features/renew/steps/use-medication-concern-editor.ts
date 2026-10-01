'use client';

import { useEffect, useRef, useState } from 'react';
import {
  medicationConcerns,
  type RenewConditionReview,
  type RenewTherapyIssue,
  type TherapyConditionGroup,
} from '@safescript/shared';

export function useMedicationConcernEditor(
  group: TherapyConditionGroup,
  onPatch: (reviewId: string, patch: Partial<RenewConditionReview>) => void | Promise<void>,
) {
  const savedConcerns = medicationConcerns(group.review);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingYes, setPendingYes] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'no' | 'clear' | null>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (group.review.medicationConcernStatus === 'yes') {
      committed.current = false;
      setPendingYes(false);
    }
  }, [group.review.medicationConcernStatus]);

  const displayedConcern = pendingYes ? 'yes' : group.review.medicationConcernStatus;
  const showEditor = editorOpen || pendingYes;
  const showSummary = !showEditor && savedConcerns.length > 0;

  const closeEditor = () => {
    setEditorOpen(false);
    if (!committed.current) setPendingYes(false);
  };

  const patchConcerns = async (nextConcerns: RenewTherapyIssue[]) => {
    committed.current = nextConcerns.length > 0;
    const rest = group.review.issues.filter((issue) => issue.issueType !== 'medication_concern');
    await onPatch(group.review.id, {
      medicationConcernStatus: nextConcerns.length ? 'yes' : null,
      issues: [...rest, ...nextConcerns],
    });
  };

  const clearConcern = () => {
    committed.current = false;
    setPendingYes(false);
    setEditorOpen(false);
    setConfirmMode(null);
    void onPatch(group.review.id, {
      medicationConcernStatus: null,
      issues: group.review.issues.filter((issue) => issue.issueType !== 'medication_concern'),
    });
  };

  const setConcernNo = () => {
    committed.current = false;
    setPendingYes(false);
    setEditorOpen(false);
    setConfirmMode(null);
    void onPatch(group.review.id, {
      medicationConcernStatus: 'no',
      issues: group.review.issues.filter((issue) => issue.issueType !== 'medication_concern'),
    });
  };

  const onConcernChange = (next: string | null) => {
    const current = displayedConcern;
    if (!next || next === current) {
      if (savedConcerns.length) {
        setConfirmMode('clear');
        return;
      }
      if (pendingYes || editorOpen) {
        closeEditor();
        return;
      }
      clearConcern();
      return;
    }
    if (next === 'yes') {
      setPendingYes(group.review.medicationConcernStatus !== 'yes');
      setEditorOpen(true);
      return;
    }
    if (savedConcerns.length) {
      setConfirmMode('no');
      return;
    }
    setConcernNo();
  };

  return {
    savedConcerns,
    pendingYes,
    confirmMode,
    setConfirmMode,
    displayedConcern,
    showEditor,
    showSummary,
    closeEditor,
    patchConcerns,
    setConcernNo,
    clearConcern,
    onConcernChange,
    openEditor: () => setEditorOpen(true),
  };
}
