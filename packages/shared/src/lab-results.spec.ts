import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyLabResultKind,
  formatLatestLabValuesAsText,
  partitionLabAndVitalResults,
  presentLatestLabRows,
  selectLatestLabValues,
  vitalsFieldsFromLabValues,
} from './lab-results';

describe('selectLatestLabValues', () => {
  it('keeps only the newest creatinine, HbA1c, and eGFR rows', () => {
    const latest = selectLatestLabValues([
      { test: 'HbA1c', value: '6.8', unit: '%', referenceRange: '<= 6.7', observedDate: '2024-01-10' },
      { test: 'HbA1c', value: '6.6', unit: '%', referenceRange: '<= 6.7', observedDate: '2025-06-01' },
      { test: 'HbA1c', value: '6.7', unit: '%', referenceRange: '<= 6.7', observedDate: '2025-01-12' },
      { test: 'Creatinine', value: '114', unit: 'umol/L', referenceRange: '60-100', observedDate: '2024-03-01' },
      { test: 'creatinine', value: '178', unit: 'umol/L', referenceRange: '60-100', observedDate: '2025-08-20' },
      { test: 'Creatinine', value: '132', unit: 'umol/L', referenceRange: '60-100', observedDate: '2025-02-02' },
      { test: 'eGFR', value: '42', unit: 'mL/min/1.73m2', referenceRange: '>= 90', observedDate: '2024-03-01' },
      { test: 'eGFR', value: '22', unit: 'mL/min/1.73m2', referenceRange: '>= 90', observedDate: '2025-08-20' },
    ]);
    assert.equal(latest.length, 3);
    assert.equal(latest.find((row) => row.test === 'HbA1c')?.value, '6.6');
    assert.equal(latest.find((row) => row.test === 'Creatinine')?.value, '178');
    assert.equal(latest.find((row) => row.test === 'eGFR')?.value, '22');
  });

  it('does not default missing dates to the first historical value', () => {
    const latest = selectLatestLabValues([
      { test: 'Creatinine', value: '114', unit: 'umol/L' },
      { test: 'Creatinine', value: '178', unit: 'umol/L' },
    ]);
    assert.equal(latest.length, 1);
    assert.equal(latest[0]?.value, '178');
  });

  it('splits labs and vitals and maps vital fields', () => {
    const values = [
      { test: 'Creatinine', value: '114', unit: 'umol/L', observedDate: '2025-08-01' },
      { test: 'BP', value: '132/84', unit: 'mmHg', observedDate: '2025-08-01' },
      { test: 'Heart rate', value: '76', unit: 'bpm', observedDate: '2025-08-01' },
      { test: 'Weight', value: '82', unit: 'kg', observedDate: '2025-08-01' },
    ];
    const { labs, vitals } = partitionLabAndVitalResults(values);
    assert.equal(labs.length, 1);
    assert.equal(vitals.length, 3);
    assert.equal(classifyLabResultKind('Blood pressure'), 'VITAL');
    const patch = vitalsFieldsFromLabValues(values);
    assert.equal(patch.bloodPressureSystolic, '132');
    assert.equal(patch.bloodPressureDiastolic, '84');
    assert.equal(patch.pulse, '76');
    assert.equal(patch.weight, '82');
  });

  it('flags values outside the listed reference range', () => {
    const rows = presentLatestLabRows([
      { test: 'Creatinine', value: '178', unit: 'umol/L', referenceRange: '60-100', observedDate: '2025-08-20' },
      { test: 'eGFR', value: '22', unit: 'mL/min', referenceRange: '>= 90', observedDate: '2025-08-20' },
      { test: 'HbA1c', value: '6.6', unit: '%', referenceRange: '<= 6.7', observedDate: '2025-06-01' },
    ]);
    assert.equal(rows.find((row) => row.canonicalTest === 'Creatinine')?.statusLabel, 'Outside target');
    assert.equal(rows.find((row) => row.canonicalTest === 'eGFR')?.statusLabel, 'Outside target');
    assert.equal(rows.find((row) => row.canonicalTest === 'HbA1c')?.statusLabel, 'In range');
    assert.match(formatLatestLabValuesAsText(rows), /Creatinine: 178 umol\/L/);
  });
});
