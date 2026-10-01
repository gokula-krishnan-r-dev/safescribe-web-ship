import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  duplicateRedFlagTitle,
  linkedIdsForRedFlag,
  redFlagQuestionText,
  sectionEvidenceIds,
} from './utils';

describe('red flag admin helpers', () => {
  it('prefers the stored question over legacy description', () => {
    assert.equal(
      redFlagQuestionText({
        question: 'Does the patient have ocular involvement?',
        description: 'Legacy body',
      }),
      'Does the patient have ocular involvement?',
    );
    assert.equal(
      redFlagQuestionText({ question: null, description: 'Legacy body' }),
      'Legacy body',
    );
  });

  it('appends Copy once when duplicating a title', () => {
    assert.equal(duplicateRedFlagTitle('Ocular involvement'), 'Ocular involvement Copy');
    assert.equal(duplicateRedFlagTitle('Ocular involvement Copy'), 'Ocular involvement Copy');
  });

  it('unions JSON evidence IDs with red-flag mappings', () => {
    const ids = linkedIdsForRedFlag(
      { id: 'rf-1', evidenceRefIds: ['a'] },
      [
        { id: 'm1', pathwayId: 'p', referenceId: 'b', section: 'red_flags', mappingType: 'red_flag', targetId: 'rf-1' },
        { id: 'm2', pathwayId: 'p', referenceId: 'c', section: 'red_flags', mappingType: 'section', targetId: '' },
      ],
    );
    assert.deepEqual(ids, ['a', 'b']);
    assert.deepEqual(
      sectionEvidenceIds([
        { id: 'm2', pathwayId: 'p', referenceId: 'c', section: 'red_flags', mappingType: 'section', targetId: '' },
      ]),
      ['c'],
    );
  });
});
