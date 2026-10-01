import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyNoConcernAnswers,
  contextChoiceFromAnswer,
  contextConcernSummaryLabel,
  emptyContextAnswer,
  formatRelevantFor,
  isContextComplete,
  patientContextHeaderCounts,
  undoNoConcernAnswers,
  type RenewPatientContextRequirement,
} from './renew-monitoring';

function row(code: string, extras: Partial<RenewPatientContextRequirement> = {}): RenewPatientContextRequirement {
  return {
    inputCode: code,
    label: code,
    valueShape: 'YES_NO',
    unit: null,
    medicationIds: [],
    medicationNames: ['Atorvastatin'],
    visible: true,
    answer: emptyContextAnswer(code),
    ...extras,
  };
}

describe('patient-specific information helpers', () => {
  it('summarizes relevant medications with overflow', () => {
    assert.equal(formatRelevantFor(['Atorvastatin']), 'Atorvastatin');
    assert.equal(
      formatRelevantFor(['Atorvastatin', 'Empagliflozin', 'Candesartan', 'Metformin']),
      'Atorvastatin · Empagliflozin · Candesartan +1',
    );
  });

  it('applies configured stable answers only to unanswered eligible questions', () => {
    const answered = emptyContextAnswer('Q1');
    answered.valueText = 'yes';
    answered.pharmacistConfirmed = true;
    const rows = [
      row('Q1', { answer: answered }),
      row('Q2'),
      row('Q3', { bulkApplyAllowed: false }),
    ];
    const { next, appliedCodes } = applyNoConcernAnswers(rows, rows.map((item) => item.answer), 'bulk-1');
    assert.deepEqual(appliedCodes, ['Q2']);
    assert.equal(contextChoiceFromAnswer(next.find((item) => item.inputCode === 'Q1')), 'yes');
    assert.equal(contextChoiceFromAnswer(next.find((item) => item.inputCode === 'Q2')), 'no');
    assert.equal(contextChoiceFromAnswer(next.find((item) => item.inputCode === 'Q3')), null);
  });

  it('undoes only answers still owned by that bulk action', () => {
    const rows = [row('Q2')];
    const { next } = applyNoConcernAnswers(rows, rows.map((item) => item.answer), 'bulk-1');
    const manual = next.map((item) =>
      item.inputCode === 'Q2' ? { ...item, source: 'MANUAL' as const, bulkActionId: null, valueText: 'yes' } : item,
    );
    const undone = undoNoConcernAnswers(manual, 'bulk-1');
    assert.equal(contextChoiceFromAnswer(undone.find((item) => item.inputCode === 'Q2')), 'yes');
  });

  it('uses review copy when questions were removed', () => {
    const counts = patientContextHeaderCounts({ active: [row('Q1'), row('Q2')], removedCount: 1 });
    assert.match(counts.label, /2 remaining · 1 removed/);
    assert.equal(counts.remaining, 2);
    assert.equal(counts.removed, 1);
  });

  it('does not count a triggered finding as reviewed until follow-up is saved', () => {
    const openFinding = emptyContextAnswer('Q1');
    openFinding.valueText = 'yes';
    openFinding.followup = { completed: false };
    assert.equal(
      isContextComplete(row('Q1', { answer: openFinding, triggerAnswer: 'YES' })),
      false,
    );

    const savedFinding = emptyContextAnswer('Q1');
    savedFinding.valueText = 'yes';
    savedFinding.followup = {
      completed: true,
      onset: 'today',
      severity: 'mild',
      action: 'CONTINUE_DOCUMENTED',
    };
    assert.equal(
      isContextComplete(row('Q1', { answer: savedFinding, triggerAnswer: 'YES' })),
      true,
    );
  });

  it('counts unable-to-assess only after a reason is documented', () => {
    const unknown = emptyContextAnswer('Q1');
    unknown.status = 'UNKNOWN';
    unknown.pharmacistConfirmed = true;
    assert.equal(isContextComplete(row('Q1', { answer: unknown })), false);

    unknown.unableReasonCode = 'PATIENT_UNABLE';
    assert.equal(isContextComplete(row('Q1', { answer: unknown })), true);
  });

  it('requires a numeric Weight value rather than Yes/No', () => {
    const unanswered = row('WEIGHT', { valueShape: 'NUMERIC', unit: 'kg' });
    assert.equal(isContextComplete(unanswered), false);
    unanswered.answer.numericValue = 82.4;
    unanswered.answer.enteredUnit = 'kg';
    assert.equal(isContextComplete(unanswered), true);
  });

  it('applies each question configured stable answer, not a global No', () => {
    const inverted = row('Q2', { stableAnswer: 'YES', triggerAnswer: 'NO' });
    const { next } = applyNoConcernAnswers([inverted], [inverted.answer], 'bulk-1');
    assert.equal(contextChoiceFromAnswer(next.find((item) => item.inputCode === 'Q2')), 'yes');
  });

  it('prefers configured concern summary labels for collapsed review copy', () => {
    assert.equal(
      contextConcernSummaryLabel({
        label: 'Has the patient developed new unexplained muscle pain or weakness?',
        reviewSummaryLabel: 'Muscle pain/weakness',
      }),
      'Muscle pain/weakness',
    );
    assert.equal(
      contextConcernSummaryLabel({
        label: 'Has the patient developed new unexplained muscle pain or weakness?',
      }),
      'Has the patient developed new unexplained muscle pain or weakness',
    );
  });
});
