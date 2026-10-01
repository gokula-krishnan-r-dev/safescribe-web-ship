import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PATIENT_INFO_COPY } from './patient-info-copy';

describe('Step 3 patient information copy', () => {
  it('uses a single confirm CTA', () => {
    assert.equal(PATIENT_INFO_COPY.confirm, 'Confirm patient information →');
    assert.equal(PATIENT_INFO_COPY.title, 'Patient information');
  });

  it('keeps mandatory none-checkboxes and optional lifestyle/labs', () => {
    assert.equal(PATIENT_INFO_COPY.allergiesNone, 'No known allergies');
    assert.equal(PATIENT_INFO_COPY.medicationsNone, 'No current medications');
    assert.equal(PATIENT_INFO_COPY.conditionsNone, 'No known conditions');
    assert.equal(PATIENT_INFO_COPY.optional, 'Optional');
    assert.equal(PATIENT_INFO_COPY.fromConsultation, 'From consultation');
    assert.doesNotMatch(PATIENT_INFO_COPY.lifestyle, /\*/);
  });
});
