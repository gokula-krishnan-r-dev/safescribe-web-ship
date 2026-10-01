import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyContextAnswer, type RenewPatientContextRequirement } from './renew-monitoring';
import {
  evaluateRenalMedications,
  parseDialysisContext,
  renalRowNeedsReview,
} from './renew-renal-coverage';

describe('renew renal coverage', () => {
  it('reads dialysis from patient-specific information rather than eGFR', () => {
    const row: RenewPatientContextRequirement = {
      inputCode: 'DIALYSIS_STATUS',
      label: 'Is the patient on dialysis?',
      valueShape: 'YES_NO',
      unit: null,
      medicationIds: [],
      medicationNames: [],
      visible: true,
      answer: { ...emptyContextAnswer('DIALYSIS_STATUS'), valueText: 'hemodialysis', pharmacistConfirmed: true },
    };
    const dialysis = parseDialysisContext({ patientContext: [row] });
    assert.equal(dialysis.onDialysis, true);
    assert.equal(dialysis.dialysisStatus, 'HEMODIALYSIS');
    assert.equal(parseDialysisContext({}).onDialysis, false);
  });

  it('marks expected dialysis medications as coverage gaps instead of cleared', () => {
    const dialysis = parseDialysisContext({ dialysisStatus: 'HEMODIALYSIS' });
    const evaluations = evaluateRenalMedications({
      medicationIds: ['gab', 'furo'],
      medicationNames: ['Gabapentin 300 mg', 'Furosemide'],
      dialysis,
      findings: [],
    });
    assert.equal(evaluations[0]?.coverage, 'EXPECTED_BUT_MISSING');
    assert.equal(evaluations[1]?.coverage, 'NOT_REQUIRED');
    assert.equal(renalRowNeedsReview(evaluations), true);
  });
});
