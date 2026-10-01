import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RenewMedicationPlanItem } from './renew';
import {
  applyBulkDuration,
  bulkDurationResultCopy,
  confirmPlanIncompleteCopy,
  confirmedPlanDurationSummary,
  parseCustomDurationInput,
  planConfirmIssues,
  undoBulkDuration,
  validateRenewalDuration,
} from './renew-duration';

function item(patch: Partial<RenewMedicationPlanItem> & { medicationId: string }): RenewMedicationPlanItem {
  return {
    selected: true,
    decision: 'renew',
    durationId: '30_days',
    customDurationDays: null,
    customDurationText: null,
    pharmacistOverride: false,
    durationSource: 'DEFAULT',
    durationBulkActionId: null,
    durationApplyNote: null,
    ...patch,
  };
}

describe('renew bulk duration', () => {
  it('rejects blank, zero, negative, and non-numeric custom days', () => {
    assert.equal(parseCustomDurationInput('').error, 'Enter a valid number of days.');
    assert.equal(parseCustomDurationInput('0').error, 'Enter a valid number of days.');
    assert.equal(parseCustomDurationInput('-5').error, 'Enter a valid number of days.');
    assert.equal(parseCustomDurationInput('12.5').error, 'Enter a valid number of days.');
    assert.equal(parseCustomDurationInput('abc').error, 'Enter a valid number of days.');
    assert.equal(parseCustomDurationInput('45').days, 45);
  });

  it('applies a custom duration to eligible medications only', () => {
    const items = [
      item({ medicationId: 'rosuva' }),
      item({ medicationId: 'ramipril' }),
      item({ medicationId: 'metformin' }),
    ];
    const safetyById = new Map([
      ['rosuva', { tone: 'clear' as const }],
      ['ramipril', { tone: 'clear' as const }],
      ['metformin', { tone: 'review' as const }],
    ]);
    const applied = applyBulkDuration(items, safetyById, {
      durationId: 'custom',
      customDurationDays: 45,
    });
    assert.equal(applied.result.appliedCount, 2);
    assert.equal(applied.result.skippedReviewCount, 1);
    assert.equal(applied.items[0]?.durationId, 'custom');
    assert.equal(applied.items[0]?.customDurationDays, 45);
    assert.equal(applied.items[0]?.durationSource, 'BULK');
    assert.equal(applied.items[2]?.durationId, '30_days');
    assert.match(applied.items[2]?.durationApplyNote ?? '', /Custom 45 days not applied/);
    const copy = bulkDurationResultCopy(applied.result);
    assert.equal(copy.success, '45 days applied to 2 medications.');
    assert.equal(copy.warning, '1 medication requires individual review.');
  });

  it('does not overwrite a manual duration unless asked', () => {
    const items = [
      item({ medicationId: 'a', durationSource: 'DEFAULT' }),
      item({ medicationId: 'b', durationId: '14_days', durationSource: 'MANUAL' }),
    ];
    const safetyById = new Map([
      ['a', { tone: 'clear' as const }],
      ['b', { tone: 'clear' as const }],
    ]);
    const applied = applyBulkDuration(items, safetyById, {
      durationId: 'custom',
      customDurationDays: 45,
    });
    assert.equal(applied.items[0]?.customDurationDays, 45);
    assert.equal(applied.items[1]?.durationId, '14_days');
    assert.equal(applied.items[1]?.durationSource, 'MANUAL');
    assert.equal(applied.result.preservedManualCount, 1);
  });

  it('restores only bulk-owned durations on undo', () => {
    const items = [
      item({ medicationId: 'a' }),
      item({ medicationId: 'b' }),
    ];
    const safetyById = new Map([
      ['a', { tone: 'clear' as const }],
      ['b', { tone: 'clear' as const }],
    ]);
    const applied = applyBulkDuration(items, safetyById, {
      durationId: 'custom',
      customDurationDays: 45,
    });
    const afterManual = applied.items.map((row) =>
      row.medicationId === 'b'
        ? {
            ...row,
            durationId: '30_days' as const,
            customDurationDays: null,
            customDurationText: null,
            durationSource: 'MANUAL' as const,
            durationBulkActionId: null,
          }
        : row,
    );
    const undone = undoBulkDuration(afterManual, applied.bulk);
    assert.equal(undone[0]?.durationId, '30_days');
    assert.equal(undone[0]?.durationSource, 'DEFAULT');
    assert.equal(undone[1]?.durationId, '30_days');
    assert.equal(undone[1]?.durationSource, 'MANUAL');
  });

  it('blocks confirm until selected rows have a valid duration', () => {
    const items = [
      item({ medicationId: 'a', durationId: null }),
      item({ medicationId: 'b', selected: false, durationId: null, decision: 'do_not_renew' }),
    ];
    const issues = planConfirmIssues(items);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.medicationId, 'a');
    assert.equal(confirmPlanIncompleteCopy(1), '1 medication needs review before confirming.');
    const valid = planConfirmIssues([item({ medicationId: 'a' })]);
    assert.equal(valid.length, 0);
    assert.equal(
      confirmedPlanDurationSummary([
        item({ medicationId: 'a', durationId: 'custom', customDurationDays: 45 }),
        item({ medicationId: 'b', durationId: 'custom', customDurationDays: 45 }),
        item({ medicationId: 'c', durationId: '30_days' }),
      ]),
      '3 medications · 2 at 45 days · 1 at 30 days',
    );
  });

  it('requires individual review during bulk apply for review-tone medications', () => {
    const result = validateRenewalDuration({
      durationId: 'custom',
      customDurationDays: 45,
      safetyTone: 'review',
      mode: 'bulk',
    });
    assert.equal(result.status, 'REQUIRES_INDIVIDUAL_REVIEW');
    const confirm = validateRenewalDuration({
      durationId: 'custom',
      customDurationDays: 45,
      safetyTone: 'review',
      mode: 'confirm',
    });
    assert.equal(confirm.status, 'VALID');
  });
});
