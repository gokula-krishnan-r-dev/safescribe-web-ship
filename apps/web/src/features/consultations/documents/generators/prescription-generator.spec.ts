import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generatePrescriptionContent,
  ensurePrescriptionTreatmentGapsHtml,
  upsertPrescriptionPatientHtml,
  upsertPrescriptionRxTitlesHtml,
  formatPrescriptionRxTitle,
  looksLikeMedicationStrength,
  applyPrescriptionEdits,
  syncPrescriptionMedicationsFromBlock,
  parsePatientBlockForPdf,
} from './prescription-generator';
import type { Consultation } from '../../types';

function consultationStub(): Consultation {
  return {
    id: 'c1',
    createdAt: '2026-09-05T13:02:00.000Z',
    treatmentPlan: {
      recommendedTreatments: [
        {
          medicationName: 'APO-PREDNISONE',
          genericName: 'prednisone',
          strength: '5 mg',
          dose: '6',
          frequency: 'QD - Once daily',
          duration: '5 days',
          category: 'PRESCRIPTION',
        },
        {
          medicationName: 'APO-NAPROXEN',
          genericName: 'naproxen',
          strength: '500 mg',
          dose: '1 Tablet(s)',
          frequency: 'BID - Two times daily',
          duration: '5 days',
          category: 'PRESCRIPTION',
        },
      ],
      selectedIndexes: [0, 1],
    },
  } as Consultation;
}

describe('prescription document fields', () => {
  it('renders labeled patient details instead of a Patient stub', () => {
    const fields = generatePrescriptionContent(consultationStub(), {
      name: 'Jane Doe',
      dateOfBirth: '1990-01-15',
      patientId: '123456789',
      address: '12 Main St\nCalgary AB',
    });
    assert.match(fields.patientBlock ?? '', /^Name: Jane Doe$/m);
    assert.match(fields.patientBlock ?? '', /Date of birth:/);
    assert.match(fields.patientBlock ?? '', /PHN: 123456789/);
    assert.doesNotMatch(fields.patientBlock ?? '', /^Patient$/m);
    assert.match(fields.patientBlock ?? '', /\n\nName:|\n\nDate of birth:|\n\nPHN:/);
  });

  it('keeps medication directions on separate paragraphs', () => {
    const fields = generatePrescriptionContent(consultationStub(), { name: 'Jane Doe' });
    assert.match(fields.medicationBlock ?? '', /\n\nQty:/);
    assert.match(fields.medicationBlock ?? '', /\n\nStart:/);
  });

  it('replaces a stub Patient paragraph in stored HTML', () => {
    const html = upsertPrescriptionPatientHtml(
      '<h1>Prescription</h1><h2 data-field="patientBlock">Patient details (name, DOB, PHN, address)</h2><p>Patient</p><h2 data-field="medicationBlock">Medication &amp; directions</h2><p>Rx</p>',
      'Name: Jane Doe\n\nDate of birth: 15-Jan-1990\n\nPHN: 123456789',
    );
    assert.match(html, /Name: Jane Doe/);
    assert.doesNotMatch(html, />Patient</);
    assert.match(html, /data-field="medicationBlock"/);
  });

  it('inserts a gap before the second treatment in stored HTML', () => {
    const html = ensurePrescriptionTreatmentGapsHtml(
      [
        '<h2 data-field="medicationBlock">Medication &amp; directions</h2>',
        '<p><strong>Rx - APO-PREDNISONE (prednisone)</strong></p>',
        '<p>6, QD - Once daily, X 5 days</p>',
        '<p>Qty: As directed</p>',
        '<p><strong>Rx - APO-NAPROXEN (naproxen)</strong></p>',
        '<p>1 Tablet(s), BID - Two times daily, X 5 days</p>',
      ].join(''),
    );
    assert.match(html, /ss-rx-gap/);
    assert.equal((html.match(/ss-rx-gap/g) ?? []).length, 1);
    const prednisoneAt = html.indexOf('APO-PREDNISONE');
    const gapAt = html.indexOf('ss-rx-gap');
    const naproxenAt = html.indexOf('APO-NAPROXEN');
    assert.ok(prednisoneAt < gapAt);
    assert.ok(gapAt < naproxenAt);
    const again = ensurePrescriptionTreatmentGapsHtml(html);
    assert.equal((again.match(/ss-rx-gap/g) ?? []).length, 1);
  });

  it('puts product strength on the Rx headline, not the tablet count', () => {
    const fields = generatePrescriptionContent(consultationStub(), { name: 'Jane Doe' });
    assert.match(
      fields.medicationBlock ?? '',
      /\*\*Rx - APO-PREDNISONE 5 mg \(prednisone\)\*\*/,
    );
    assert.match(
      fields.medicationBlock ?? '',
      /\*\*Rx - APO-NAPROXEN 500 mg \(naproxen\)\*\*/,
    );
    assert.doesNotMatch(fields.medicationBlock ?? '', /Rx - APO-PREDNISONE 6\b/);
    assert.equal(fields.medications?.[0]?.strength, '5 mg');
    assert.equal(fields.medications?.[1]?.strength, '500 mg');
    assert.equal(
      formatPrescriptionRxTitle(fields.medications![0]),
      'Rx - APO-PREDNISONE 5 mg (prednisone)',
    );
  });

  it('does not treat a tablet count as strength', () => {
    assert.equal(looksLikeMedicationStrength('6'), false);
    assert.equal(looksLikeMedicationStrength('1 Tablet(s)'), false);
    assert.equal(looksLikeMedicationStrength('5 mg'), true);
    assert.equal(looksLikeMedicationStrength('500 mg'), true);
  });

  it('patches stored Rx headlines that omitted strength', () => {
    const html = upsertPrescriptionRxTitlesHtml(
      [
        '<p><strong>Rx - APO-PREDNISONE (prednisone)</strong></p>',
        '<p><strong>Rx - APO-NAPROXEN (naproxen)</strong></p>',
      ].join(''),
      [
        'Rx - APO-PREDNISONE 5 mg (prednisone)',
        'Rx - APO-NAPROXEN 500 mg (naproxen)',
      ],
    );
    assert.match(html, /Rx - APO-PREDNISONE 5 mg \(prednisone\)/);
    assert.match(html, /Rx - APO-NAPROXEN 500 mg \(naproxen\)/);
    const again = upsertPrescriptionRxTitlesHtml(html, [
      'Rx - APO-PREDNISONE 5 mg (prednisone)',
      'Rx - APO-NAPROXEN 500 mg (naproxen)',
    ]);
    assert.equal((again.match(/5 mg/g) ?? []).length, 1);
  });

  it('syncs TipTap medicationBlock edits into structured medications for PDF', () => {
    const generated = generatePrescriptionContent(consultationStub(), {
      name: 'Emma',
    });
    const editedBlock = [
      '**Rx - MONUROL (fosfomycin)**',
      '',
      'one sachet',
      '',
      'Patient Instructions: mix the contents of one sachet in 120 ml of water and drink at once.',
      '',
      'Qty: As directed  ·  Refills: 0  ·  Route: Oral',
      '',
      'Start: 05-Sept-2026  ·  End: 06-Sept-2026  ·  Expiry: 05-Sept-2027',
    ].join('\n');

    const existing = {
      ...generated,
      medications: [
        {
          name: 'MONUROL',
          genericName: 'fosfomycin',
          dosage: '1',
          frequency: 'AT_ONSET - At symptom onset',
          duration: '1 days',
          instructions: 'Take 1 packet by mouth at symptom onset for 1 day.',
          quantity: 'As directed',
          refills: '0',
          route: 'Oral',
          startDate: '05-Sept-2026',
          endDate: '06-Sept-2026',
          expiryDate: '05-Sept-2027',
        },
      ],
      medicationBlock: editedBlock,
    };

    const synced = syncPrescriptionMedicationsFromBlock(
      existing.medications,
      editedBlock,
    );
    assert.equal(synced?.[0]?.dosage, 'one sachet');
    assert.equal(synced?.[0]?.frequency, '');
    assert.equal(synced?.[0]?.duration, '');
    assert.match(
      synced?.[0]?.instructions ?? '',
      /mix the contents of one sachet in 120 ml/i,
    );

    const saved = applyPrescriptionEdits(existing, {
      medicationBlock: editedBlock,
      diagnosis: existing.diagnosis ?? '',
      notes: existing.notes ?? '',
      patientBlock: existing.patientBlock ?? '',
    });
    assert.equal(saved.medications?.[0]?.dosage, 'one sachet');
    assert.match(
      saved.medications?.[0]?.instructions ?? '',
      /120 ml of water/i,
    );
  });

  it('formats bare dose counts with administration unit', () => {
    const fields = generatePrescriptionContent(
      {
        ...consultationStub(),
        treatmentPlan: {
          recommendedTreatments: [
            {
              medicationName: 'VALTREX',
              genericName: 'valacyclovir',
              dose: '1',
              doseUnit: 'Tablet(s)',
              frequency: 'BID - Two times daily',
              duration: '1 days',
              quantity: '2',
              quantityUnit: 'Tablet(s)',
              route: 'Oral',
              category: 'PRESCRIPTION',
              patientDirections:
                'Take 1000 mg by mouth every 12 hours for 2 doses.',
            },
          ],
          selectedIndexes: [0],
        },
      } as Consultation,
      { name: 'Jane Doe' },
    );
    assert.equal(fields.medications?.[0]?.dosage, '1 Tablet(s)');
    assert.equal(fields.medications?.[0]?.quantity, '2 Tablet(s)');
    assert.match(fields.medicationBlock ?? '', /1 Tablet\(s\), BID/);
    assert.match(fields.medicationBlock ?? '', /Qty: 2 Tablet\(s\)/);
    assert.doesNotMatch(fields.medicationBlock ?? '', /^1, BID/m);
  });

  it('uses product form when dose unit is missing', () => {
    const fields = generatePrescriptionContent(
      {
        ...consultationStub(),
        treatmentPlan: {
          recommendedTreatments: [
            {
              medicationName: 'XERESE',
              genericName: 'acyclovir / hydrocortisone',
              dose: '1',
              productForm: 'Application',
              frequency: '5ID - 5 times a day',
              duration: '5 days',
              route: 'Topical',
              category: 'PRESCRIPTION',
            },
          ],
          selectedIndexes: [0],
        },
      } as Consultation,
      { name: 'Jane Doe' },
    );
    assert.match(fields.medications?.[0]?.dosage ?? '', /1 Application/);
    assert.match(fields.medicationBlock ?? '', /1 Application/);
  });

  it('ignores TipTap numbered-list dumps when syncing medicationBlock for PDF', () => {
    const contaminated = [
      '1. RX - XERESE 5% / 1% (acyclovir / hydrocortisone) 2. 1 Application(s), 5ID - 5 times a day, X 5 days 3.',
      'Patient Instructions: Apply 1 application topically 5 times a day for 5 days. 4. Qty: 5 g . Refills: 0 . Route: Topical',
      '5. Start: 14-Sept-2026 · End: 19-Sept-2026 · Expiry: 14-Sept-2027',
      '',
      '1. RX - VALTREX 500 mg (valacyclovir)',
      '2. 2 Tablet(s), BID - Two times daily X 1 day',
      '3. Patient Instructions: Take 2 tablets by mouth two times daily for 1 day.',
      '4. Qty: 4 Tablet(s) · Refills: 0 · Route: Oral',
      '5. Start: 14-Sept-2026 · End: 15-Sept-2026 · Expiry: 14-Sept-2027',
    ].join('\n');

    const synced = syncPrescriptionMedicationsFromBlock(
      [
        {
          name: 'XERESE',
          genericName: 'acyclovir / hydrocortisone',
          dosage: '1 Application(s)',
          frequency: '5ID - 5 times a day',
          duration: '5 days',
          instructions: 'Apply 1 application topically 5 times a day for 5 days.',
          quantity: '5 g',
          refills: '0',
          route: 'Topical',
          startDate: '14-Sept-2026',
          endDate: '19-Sept-2026',
          expiryDate: '14-Sept-2027',
        },
        {
          name: 'VALTREX',
          genericName: 'valacyclovir',
          dosage: '2 Tablet(s)',
          frequency: 'BID - Two times daily',
          duration: '1 day',
          instructions: 'Take 2 tablets by mouth two times daily for 1 day.',
          quantity: '4 Tablet(s)',
          refills: '0',
          route: 'Oral',
          startDate: '14-Sept-2026',
          endDate: '15-Sept-2026',
          expiryDate: '14-Sept-2027',
        },
      ],
      contaminated,
    );

    assert.equal(synced?.[0]?.dosage, '1 Application(s)');
    assert.equal(synced?.[0]?.frequency, '5ID - 5 times a day');
    assert.doesNotMatch(synced?.[0]?.dosage ?? '', /Patient Instructions:/i);
    assert.doesNotMatch(synced?.[0]?.dosage ?? '', /Qty:/i);
    assert.match(
      synced?.[0]?.instructions ?? '',
      /Apply 1 application topically 5 times a day/i,
    );
    assert.equal(synced?.[1]?.dosage, '2 Tablet(s)');
    assert.match(synced?.[1]?.frequency ?? '', /BID/i);
  });
});

describe('parsePatientBlockForPdf', () => {
  it('parses a full patient block into named fields', () => {
    const block = [
      'Name: JANE DOE',
      'Date of birth: 15-Jan-1990',
      'PHN: 123456789',
      'Address: 123 Main St, Vancouver, BC V6B 1A1',
      'Phone: (604) 555-1234',
    ].join('\n');
    const result = parsePatientBlockForPdf(block);
    assert.equal(result.name, 'JANE DOE');
    assert.equal(result.dateOfBirth, '15-Jan-1990');
    assert.equal(result.patientId, '123456789');
    assert.equal(result.address, '123 Main St, Vancouver, BC V6B 1A1');
    assert.equal(result.phone, '(604) 555-1234');
  });

  it('ignores stub DOB placeholders like "SAMPLE BIRTH DAY"', () => {
    const block = 'Name: JANE DOE\nDate of birth: - SAMPLE BIRTH DAY\nPHN: — SAMPLE PHN';
    const result = parsePatientBlockForPdf(block);
    assert.equal(result.name, 'JANE DOE');
    assert.equal(result.dateOfBirth, undefined);
    assert.equal(result.patientId, undefined);
  });

  it('handles "PHN: Not available" correctly', () => {
    const block = 'Name: ALICE\nDate of birth: 01-Jan-2000\nPHN: Not available';
    const result = parsePatientBlockForPdf(block);
    assert.equal(result.patientId, 'Not available');
  });

  it('strips HTML tags from patientBlock', () => {
    const block = '<p>Name: <strong>JOHN SMITH</strong></p><p>Date of birth: 02-Feb-1985</p>';
    const result = parsePatientBlockForPdf(block);
    assert.equal(result.name, 'JOHN SMITH');
    assert.equal(result.dateOfBirth, '02-Feb-1985');
  });

  it('returns empty object for empty or null input', () => {
    assert.deepEqual(parsePatientBlockForPdf(''), {});
    assert.deepEqual(parsePatientBlockForPdf(null), {});
    assert.deepEqual(parsePatientBlockForPdf(undefined), {});
  });

  it('ignores em-dash placeholder values', () => {
    const block = 'Name: —\nDate of birth: —\nPHN: —';
    const result = parsePatientBlockForPdf(block);
    assert.equal(result.name, undefined);
    assert.equal(result.dateOfBirth, undefined);
    assert.equal(result.patientId, undefined);
  });
});
