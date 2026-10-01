import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyRegimenLine } from './constants';
import { composePatientDirections } from './directions';

describe('sequential patient directions', () => {
  it('joins each schedule duration with then, without up to', () => {
    const lines = [
      emptyRegimenLine({
        doseFrom: '4',
        form: 'Tablet(s)',
        frequency: 'Once daily',
        durationValue: '2',
        durationUnit: 'DAY',
      }),
      emptyRegimenLine({
        doseFrom: '2',
        form: 'Tablet(s)',
        frequency: 'Once daily',
        durationValue: '3',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(
      composePatientDirections(lines, 'Oral'),
      'Take 4 tablets by mouth once daily for 2 days, then take 2 tablets by mouth once daily for 3 days.',
    );
  });
});
