import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  looksLikePrescribeRxTemplate,
  parseRenewPrescriptionFields,
  renewPrescriptionToEditorHtml,
} from './renew-prescription-template';

const SAMPLE = [
  'PRESCRIPTION',
  'Name: Morgan Taylor',
  '',
  'Date of birth: 12-Apr-1964',
  '',
  'PHN: 1234567890',
  '',
  '**Rx - RAMIPRIL 10 mg**',
  '',
  'Take 1 capsule orally once daily, X 30 days',
  '',
  'Qty: 30 capsules  ·  Refills: 0  ·  Route: Oral',
  '',
  'Start: 14-Sep-2026  ·  End: 14-Oct-2026  ·  Expiry: 14-Sep-2027',
  '',
  'Original Prescriber: Dr. KB  ·  Date: 15-Jun-2026',
].join('\n');

const LEGACY_SAMPLE = [
  'PRESCRIPTION',
  'Name: Morgan Taylor',
  '',
  '**Rx - RAMIPRIL 10 mg**',
  '',
  'Take 1 capsule orally once daily, X 30 days',
  '',
  'Patient Instructions: Original prescription: Dr. KB · 15-Jun-2026',
  '',
  'Qty: 30 capsules  ·  Refills: 0  ·  Route: Oral',
  '',
  'Start: 14-Sep-2026  ·  End: 14-Oct-2026  ·  Expiry: 14-Sep-2027',
].join('\n');

describe('renew prescription Prescribe template', () => {
  it('detects the clinical Rx template', () => {
    assert.equal(looksLikePrescribeRxTemplate(SAMPLE), true);
    assert.equal(looksLikePrescribeRxTemplate('Your Medication Renewal\nHow to take it: once daily'), false);
  });

  it('parses patient and medication blocks for the Notion editor', () => {
    const parsed = parseRenewPrescriptionFields(SAMPLE);
    assert.match(parsed.patientBlock, /Name: Morgan Taylor/);
    assert.match(parsed.patientBlock, /PHN: 1234567890/);
    assert.match(parsed.medicationBlock, /Rx - RAMIPRIL 10 mg/);
    assert.equal(parsed.medications.length, 1);
    assert.match(parsed.medications[0]?.name ?? '', /RAMIPRIL/i);
    assert.equal(parsed.medications[0]?.quantity, '30 capsules');
    assert.equal(parsed.medications[0]?.refills, '0');
    assert.equal(parsed.medications[0]?.route, 'Oral');
    assert.equal(parsed.medications[0]?.originalPrescriber, 'Dr. KB');
    assert.equal(parsed.medications[0]?.originalPrescriptionDate, '15-Jun-2026');
    assert.equal(parsed.medications[0]?.instructions, undefined);
  });

  it('migrates legacy Patient Instructions original-prescription lines', () => {
    const parsed = parseRenewPrescriptionFields(LEGACY_SAMPLE);
    assert.equal(parsed.medications[0]?.originalPrescriber, 'Dr. KB');
    assert.equal(parsed.medications[0]?.originalPrescriptionDate, '15-Jun-2026');
    assert.equal(parsed.medications[0]?.instructions, undefined);
  });

  it('renders the same Notion Rx sections as Prescribe', () => {
    const html = renewPrescriptionToEditorHtml(SAMPLE);
    assert.match(html, /<h1>Prescription<\/h1>/);
    assert.match(html, /data-field="patientBlock"/);
    assert.match(html, /data-field="medicationBlock"/);
    assert.match(html, /Rx - RAMIPRIL 10 mg/);
    assert.match(html, /ss-rx-gap|Qty:/);
  });
});
