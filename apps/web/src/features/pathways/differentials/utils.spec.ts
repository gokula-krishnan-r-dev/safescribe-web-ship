import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  duplicateDifferentialTitle,
  linkedIdsForDifferential,
  sectionEvidenceIds,
} from './utils';

describe('differential admin helpers', () => {
  it('appends Copy once when duplicating a title', () => {
    assert.equal(duplicateDifferentialTitle('Aphthous ulcer'), 'Aphthous ulcer Copy');
    assert.equal(duplicateDifferentialTitle('Aphthous ulcer Copy'), 'Aphthous ulcer Copy');
  });

  it('unions JSON evidence IDs with differential mappings', () => {
    const ids = linkedIdsForDifferential(
      { id: 'ddx-1', evidenceRefIds: ['a'] },
      [
        {
          id: 'm1',
          pathwayId: 'p',
          referenceId: 'b',
          section: 'differential_review',
          mappingType: 'differential',
          targetId: 'ddx-1',
        },
        {
          id: 'm2',
          pathwayId: 'p',
          referenceId: 'c',
          section: 'differential_review',
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
          section: 'differential_review',
          mappingType: 'section',
          targetId: '',
        },
      ]),
      ['c'],
    );
  });
});
