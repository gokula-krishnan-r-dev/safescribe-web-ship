import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canCompareResultToReference,
  normalizeMonitoringUnit,
  validateMonitoringResultUnit,
} from './renew-monitoring-units';

describe('renew monitoring unit compatibility', () => {
  it('normalizes micro and case aliases', () => {
    assert.equal(normalizeMonitoringUnit('umol/L'), 'µmol/L');
    assert.equal(normalizeMonitoringUnit('MMOL/L'), 'mmol/L');
    assert.equal(normalizeMonitoringUnit('Leu/uL'), 'Leu/µL');
    assert.equal(normalizeMonitoringUnit('mg/mmol'), 'mg/mmol');
  });

  it('accepts potassium in mmol/L as valid', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'POTASSIUM',
      resultUnit: 'mmol/L',
      expectedUnit: 'mmol/L',
      numericValue: 4.6,
    });
    assert.equal(result.status, 'VALID');
    assert.equal(result.compatible, true);
    assert.equal(result.canonicalNumeric, 4.6);
  });

  it('rejects potassium Leu/µL without comparing', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'POTASSIUM',
      resultUnit: 'Leu/uL',
      expectedUnit: 'mmol/L',
      numericValue: 25,
    });
    assert.equal(result.status, 'UNIT_MISMATCH');
    assert.equal(result.compatible, false);
    assert.equal(result.canonicalNumeric, null);
    assert.equal(result.expectedUnit, 'mmol/L');
    assert.equal(result.detectedUnit, 'Leu/µL');
    assert.equal(canCompareResultToReference({
      inputCode: 'POTASSIUM',
      resultUnit: 'Leu/µL',
      referenceUnit: 'mmol/L',
      expectedUnit: 'mmol/L',
    }), false);
  });

  it('rejects ACR concentration values (µmol/L)', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'URINE_ACR',
      resultUnit: 'umol/L',
      expectedUnit: 'mg/mmol',
      numericValue: 51,
    });
    assert.equal(result.status, 'UNIT_MISMATCH');
    assert.equal(result.compatible, false);
    assert.equal(result.expectedUnit, 'mg/mmol');
  });

  it('accepts ACR in mg/mmol', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'URINE_ACR',
      resultUnit: 'mg/mmol',
      expectedUnit: 'mg/mmol',
      numericValue: 1.7,
    });
    assert.equal(result.status, 'VALID');
    assert.equal(result.compatible, true);
  });

  it('accepts hemoglobin g/L and rejects mmol/L', () => {
    const ok = validateMonitoringResultUnit({
      inputCode: 'HEMOGLOBIN',
      resultUnit: 'g/L',
      expectedUnit: 'g/L',
      numericValue: 135,
    });
    assert.equal(ok.status, 'VALID');

    const bad = validateMonitoringResultUnit({
      inputCode: 'HEMOGLOBIN',
      resultUnit: 'mmol/L',
      expectedUnit: 'g/L',
      numericValue: 135,
    });
    assert.equal(bad.status, 'UNIT_MISMATCH');
  });

  it('flags missing unit', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'POTASSIUM',
      resultUnit: null,
      expectedUnit: 'mmol/L',
      numericValue: 4.2,
    });
    assert.equal(result.status, 'MISSING_UNIT');
    assert.equal(result.compatible, false);
  });

  it('converts potassium mEq/L to mmol/L 1:1', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'POTASSIUM',
      resultUnit: 'mEq/L',
      expectedUnit: 'mmol/L',
      numericValue: 4.1,
    });
    assert.equal(result.status, 'VALID');
    assert.equal(result.canonicalNumeric, 4.1);
    assert.equal(result.canonicalUnit, 'mmol/L');
  });

  it('converts creatinine mg/dL to µmol/L', () => {
    const result = validateMonitoringResultUnit({
      inputCode: 'CREATININE',
      resultUnit: 'mg/dL',
      expectedUnit: 'µmol/L',
      numericValue: 1.0,
    });
    assert.equal(result.status, 'VALID');
    assert.ok(Math.abs((result.canonicalNumeric ?? 0) - 88.4) < 0.001);
  });
});
