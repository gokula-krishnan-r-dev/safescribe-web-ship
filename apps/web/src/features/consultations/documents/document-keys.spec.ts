import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isFaxablePrescribeDocument } from './document-keys';

describe('prescribe faxable documents', () => {
  it('allows fax only for the PCP letter and prescription', () => {
    assert.equal(isFaxablePrescribeDocument('prescriber_communication'), true);
    assert.equal(isFaxablePrescribeDocument('prescription'), true);
    assert.equal(isFaxablePrescribeDocument('consultation_note'), false);
    assert.equal(isFaxablePrescribeDocument('patient_care_summary'), false);
  });
});
