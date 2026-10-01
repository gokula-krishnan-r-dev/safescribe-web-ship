import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareResultToReference,
  resolveMonitoringReference,
} from './clinical-reference-resolver';

describe('clinical reference resolver', () => {
  it('uses MCC adult fallback for potassium when no lab interval is present', () => {
    const resolved = resolveMonitoringReference({ inputCode: 'POTASSIUM' });
    assert.equal(resolved.mode, 'PUBLISHED_ADULT_REFERENCE');
    assert.equal(resolved.displayText, '3.5–5.1 mmol/L');
    assert.equal(resolved.sourceCode, 'MCC_ADULT');
    assert.equal(resolved.lowerBound, 3.5);
    assert.equal(resolved.upperBound, 5.1);
  });

  it('prefers a result-specific lab interval over MCC', () => {
    const resolved = resolveMonitoringReference({
      inputCode: 'POTASSIUM',
      labLower: 3.5,
      labUpper: 5.1,
      labReferenceDisplay: '3.5–5.1 mmol/L',
    });
    assert.equal(resolved.mode, 'LAB_RESULT_REFERENCE');
    assert.equal(resolved.sourceCode, 'LAB_RESULT');
  });

  it('uses a diabetes BP treatment target instead of a population range', () => {
    const resolved = resolveMonitoringReference({
      inputCode: 'BP',
      indications: [
        { code: 'HTN', label: 'Hypertension' },
        { code: 'T2DM', label: 'Type 2 diabetes' },
      ],
    });
    assert.equal(resolved.mode, 'TREATMENT_TARGET');
    assert.match(resolved.displayText, /130\/80/);
    assert.equal(resolved.sourceCode, 'HTN_CA_DM');
  });

  it('uses the most-adults A1C treatment target', () => {
    const resolved = resolveMonitoringReference({
      inputCode: 'A1C',
      indications: [{ code: 'T2DM', label: 'Type 2 diabetes' }],
    });
    assert.equal(resolved.mode, 'TREATMENT_TARGET');
    assert.equal(resolved.targetValue, 7);
    assert.equal(compareResultToReference(7.8, null, resolved), 'above');
    assert.equal(compareResultToReference(6.8, null, resolved), 'within');
  });

  it('does not use adult MCC fallback for pediatric potassium', () => {
    const resolved = resolveMonitoringReference({ inputCode: 'POTASSIUM', pediatric: true });
    assert.equal(resolved.mode, 'PEDIATRIC_REFERENCE');
    assert.notEqual(resolved.sourceCode, 'MCC_ADULT');
  });

  it('keeps eGFR on medication-specific thresholds', () => {
    const resolved = resolveMonitoringReference({
      inputCode: 'EGFR',
      medicationNames: ['Ramipril', 'Metformin'],
    });
    assert.equal(resolved.mode, 'MEDICATION_SPECIFIC');
    assert.match(resolved.displayText, /Medication-specific/);
  });

  it('never uses the non-anticoagulated INR range as a treatment target', () => {
    const resolved = resolveMonitoringReference({ inputCode: 'INR' });
    assert.equal(resolved.mode, 'MEDICATION_SPECIFIC');
    assert.doesNotMatch(resolved.displayText, /0\.9/);
  });
});
