import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isMedicationQuestion } from './medication-utils';

describe('isMedicationQuestion', () => {
  it('uses only the pathway question type, never the prompt wording', () => {
    const eligibilityWording =
      'Can an appropriate antifungal treatment be selected safely after reviewing pregnancy status, allergies, current medications, liver disease, previous antifungal use, and previous treatment response';

    const withWording = (type: string) =>
      ({ type, question: eligibilityWording }) as { type?: string | null };
    assert.equal(isMedicationQuestion(withWording('YES_NO')), false);
    assert.equal(isMedicationQuestion(withWording('BOOLEAN')), false);
    assert.equal(isMedicationQuestion(withWording('SELECT')), false);
    assert.equal(isMedicationQuestion(withWording('MULTI_SELECT')), false);
  });

  it('shows medication search only for TEXT and TEXTAREA questions', () => {
    assert.equal(isMedicationQuestion({ type: 'TEXT' }), true);
    assert.equal(isMedicationQuestion({ type: 'textarea' }), true);
    assert.equal(isMedicationQuestion({ type: 'NUMBER' }), false);
    assert.equal(isMedicationQuestion({ type: 'DATE' }), false);
    assert.equal(isMedicationQuestion({ type: 'SCALE' }), false);
    assert.equal(isMedicationQuestion({ type: '' }), false);
    assert.equal(isMedicationQuestion(null), false);
  });
});
