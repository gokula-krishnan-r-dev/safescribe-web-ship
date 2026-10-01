import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LANDING_BENEFITS } from './hero-content';
import { LANDING_WORKFLOW_STEPS } from './workflow-preview';

describe('landing / login approved copy', () => {
  it('uses the approved benefit wording', () => {
    assert.equal(
      LANDING_BENEFITS[2]?.description,
      'DAP notes, patient handouts, and communications.',
    );
  });

  it('uses Pathway confirmed and Treatment selected', () => {
    assert.deepEqual(
      LANDING_WORKFLOW_STEPS.map((step) => step.title),
      ['Consultation captured', 'Pathway confirmed', 'Treatment selected', 'Documentation'],
    );
    assert.equal(LANDING_WORKFLOW_STEPS[2]?.detail, 'Valacyclovir 2 g');
  });
});
