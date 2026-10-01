import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { documentedFindingLines, linkedMedicationMutedLabel } from './therapy-review-ui';
import type { RenewMedication, TherapyConditionGroup } from '@safescript/shared';

function med(id: string, genericName: string): RenewMedication {
  return {
    id,
    source: { type: 'manual_search' },
    raw: {},
    normalized: { genericName },
    confidence: {},
    reviewStatus: 'not_reviewed',
    ccddMatchStatus: 'unmatched',
    pharmacistEdited: false,
  };
}

describe('therapy-review-ui', () => {
  it('summarizes documented adherence details for the collapsed amber row', () => {
    const group = {
      key: 'cond:adhd',
      conditionId: 'adhd',
      customConditionText: null,
      displayName: 'ADHD',
      conditionCode: 'ADHD',
      category: 'mental_health',
      effectivenessQuestion: 'Therapy effective / condition stable?',
      medicationIds: ['m1'],
      review: {
        id: 'r1',
        conditionId: 'adhd',
        customConditionText: null,
        adherenceStatus: 'no',
        effectivenessStatus: 'yes',
        medicationConcernStatus: 'no',
        answerSource: 'individual',
        issues: [
          {
            id: 'i1',
            conditionKey: 'cond:adhd',
            medicationIds: ['m1'],
            issueType: 'adherence',
            issueCategory: 'missed_occasionally',
            actionTaken: null,
            details: 'Patient reports missed doses due to GI side effects.',
            requiresStep3Review: false,
          },
        ],
        manuallyPreserved: false,
      },
    } satisfies TherapyConditionGroup;

    assert.match(
      documentedFindingLines(group)[0] ?? '',
      /Adherence concern documented — Patient reports missed doses/,
    );
  });

  it('joins linked medication names as muted secondary text', () => {
    assert.equal(
      linkedMedicationMutedLabel([med('m1', 'Methylphenidate hydrochloride')]),
      'Methylphenidate hydrochloride',
    );
  });
});
