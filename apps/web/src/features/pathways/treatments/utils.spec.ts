import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  lineOfTherapyLabel,
  linkedIdsForTreatment,
  sectionEvidenceIds,
  treatmentRegimenSummary,
} from './utils';

describe('treatment options admin helpers', () => {
  it('maps stored recommendation levels to line-of-therapy labels', () => {
    assert.equal(lineOfTherapyLabel('FIRST_LINE'), 'First-line');
    assert.equal(lineOfTherapyLabel('ALTERNATIVE'), 'Alternative');
    assert.equal(lineOfTherapyLabel('SECOND_LINE'), 'Alternative');
    assert.equal(lineOfTherapyLabel('ADJUNCTIVE'), 'Adjunct');
    assert.equal(lineOfTherapyLabel('SUPPORTIVE_CARE'), 'Suitable');
    assert.equal(lineOfTherapyLabel('SPECIALIST'), 'Suitable');
  });

  it('unions JSON evidence IDs with treatment mappings', () => {
    const ids = linkedIdsForTreatment(
      { id: 'tx-1', evidenceRefIds: ['a'] },
      [
        {
          id: 'm1',
          pathwayId: 'p',
          referenceId: 'b',
          section: 'treatment_options',
          mappingType: 'treatment',
          targetId: 'tx-1',
        },
        {
          id: 'm2',
          pathwayId: 'p',
          referenceId: 'c',
          section: 'treatment_options',
          mappingType: 'section',
          targetId: '',
        },
      ],
    );
    assert.deepEqual(ids, ['a', 'b']);
    assert.deepEqual(
      sectionEvidenceIds([
        {
          id: 'm2',
          pathwayId: 'p',
          referenceId: 'c',
          section: 'treatment_options',
          mappingType: 'section',
          targetId: '',
        },
      ]),
      ['c'],
    );
  });

  it('summarizes dose, frequency, and duration', () => {
    assert.equal(
      treatmentRegimenSummary({
        dose: '1 g',
        frequency: 'Twice daily (BID)',
        duration: '1 day',
        directions: 'Take with water',
      }),
      '1 g · Twice daily (BID) · 1 day',
    );
    assert.equal(
      treatmentRegimenSummary({
        dose: null,
        frequency: null,
        duration: null,
        directions: 'Apply thin layer five times daily',
      }),
      'Apply thin layer five times daily',
    );
  });
});
