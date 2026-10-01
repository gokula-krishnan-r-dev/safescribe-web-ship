import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRenewPharmacistPrescriptionNote,
  buildRenewPharmacistPrescriptionSource,
  resolvePrescriptionQuantity,
  validateRenewPharmacistPrescriptionBody,
} from './renew-pharmacist-prescription';
import { toPlanRows } from './renew-decision';
import { parseRenewPayload, type RenewMedication } from './renew';

function med(patch: Partial<RenewMedication> & { id: string }): RenewMedication {
  return {
    id: patch.id,
    source: patch.source ?? { type: 'manual_search' },
    raw: patch.raw ?? {},
    normalized: {
      brandName: null,
      genericName: null,
      strength: null,
      dosageForm: null,
      ...patch.normalized,
    },
    confidence: patch.confidence ?? {},
    reviewStatus: patch.reviewStatus ?? 'confirmed',
    ccddMatchStatus: patch.ccddMatchStatus ?? 'matched',
    pharmacistEdited: patch.pharmacistEdited ?? false,
  };
}

const ramipril = med({
  id: 'ram',
  normalized: {
    genericName: 'Ramipril',
    strength: '10 mg',
    dosageForm: 'capsule',
    directions: 'Take 1 capsule orally once daily',
    dose: '1',
    doseUnit: 'capsule',
    quantityUnit: 'capsule',
    prescriberName: 'Dr. KB',
    prescribedDate: '2026-06-15',
    lastFillDate: '2026-08-01',
  },
});

const metformin = med({
  id: 'met',
  normalized: {
    genericName: 'Metformin',
    strength: '500 mg',
    dosageForm: 'tablet',
    directions: 'Take 1 tablet orally twice daily',
    dose: '1',
    doseUnit: 'tablet',
    quantityUnit: 'tablet',
    prescriberName: 'Dr. MA',
    prescribedDate: '2026-07-02',
  },
});

function payload(overrides: Record<string, unknown> = {}) {
  return parseRenewPayload({
    medicationList: { items: [ramipril, metformin], confirmed: true },
    renewalRequest: {
      requestedDuration: '30_days',
      reasons: ['no_refills_remaining'],
      verifiedFrom: 'pharmacy_dispensing_record',
    },
    therapyReview: { completed: true, mappings: [], reviews: [] },
    monitoringSafety: { completed: true, patientContextConfirmed: true },
    renewalDecision: {
      confirmed: true,
      items: [
        { medicationId: 'ram', selected: true, decision: 'renew', durationId: '30_days' },
        { medicationId: 'met', selected: true, decision: 'renew', durationId: '30_days' },
      ],
      patientInfo: {
        patientName: 'Morgan Taylor',
        dateOfBirth: '1964-04-12',
        phn: '1234567890',
        source: 'STEP4_MANUAL',
        confirmedAt: '2026-09-14T12:00:00.000Z',
        confirmedBy: 'pharmacist-1',
      },
    },
    ...overrides,
  });
}

function rows(next = payload()) {
  return toPlanRows(
    next.medicationList.items,
    next.renewalDecision.items,
    new Map([
      ['ram', { tone: 'clear' as const, label: 'No concerns', note: null }],
      ['met', { tone: 'clear' as const, label: 'No concerns', note: null }],
    ]),
  );
}

describe('renew pharmacist prescription', () => {
  it('renders a formal ACP prescription deterministically without LLM clinical content', () => {
    const next = payload();
    const body = buildRenewPharmacistPrescriptionNote(next, rows(next), {
      encounter: {
        dateTimeIso: '2026-09-14T18:00:00.000Z',
        pharmacistName: 'Jane Smith',
        pharmacistRole: 'Pharmacist',
        practiceSite: 'Chappelle Pharmacy',
        timeZone: 'America/Edmonton',
        phone: '780-555-0100',
        fax: '780-555-0101',
        address: '100 Pharmacy Way',
      },
      patient: { address: '123 Main Street, Edmonton, AB T5X 1X1' },
    });
    assert.match(body, /^PRESCRIPTION/m);
    assert.match(body, /Name: Morgan Taylor/);
    assert.match(body, /123 Main Street/);
    assert.match(body, /\*\*Rx - RAMIPRIL 10 mg\*\*/);
    assert.match(body, /Take 1 capsule orally once daily, X 30 days/);
    assert.match(body, /Qty: 30 capsules/);
    assert.match(body, /Qty: 60 tablets/);
    assert.match(body, /Refills: 0/);
    assert.match(body, /Route: Oral/);
    assert.match(body, /Original Prescriber: Dr\. KB  ·  Date: 15-Jun-2026/);
    assert.match(body, /Original Prescriber: Dr\. MA  ·  Date: 02-Jul-2026/);
    assert.doesNotMatch(body, /Patient Instructions:/i);
    assert.doesNotMatch(body, /Original prescription:/i);
    assert.doesNotMatch(body, /Jane Smith, Pharmacist/);
    assert.doesNotMatch(body, /^Prescriber$/m);
    assert.doesNotMatch(body, /adaptation/i);
    assert.doesNotMatch(body, /dispense and counsel/i);
    assert.doesNotMatch(body, /01-Aug-2026|08-01|last fill/i);
    assert.doesNotMatch(body, /adherence|monitoring|DTP|Safety Engine/i);
    assert.equal(validateRenewPharmacistPrescriptionBody(body).length, 0);
  });

  it('uses Step 1 last fill date on the Original Prescriber line when prescribed date is absent', () => {
    const withLastFillOnly = med({
      id: 'sal',
      normalized: {
        brandName: 'Salbutamol HFA',
        genericName: 'salbutamol',
        strength: '100 mcg',
        dosageForm: 'HFA',
        directions: 'inhale one puff qid prn',
        dose: '1',
        doseUnit: 'puff',
        quantityUnit: 'inhaler',
        quantity: 1,
        prescriberName: 'Johan',
        lastFillDate: '2026-09-10',
      },
    });
    const next = parseRenewPayload({
      medicationList: { items: [withLastFillOnly], confirmed: true },
      renewalRequest: {
        requestedDuration: '14_days',
        reasons: ['no_refills_remaining'],
        verifiedFrom: 'pharmacy_dispensing_record',
      },
      therapyReview: { completed: true, mappings: [], reviews: [] },
      monitoringSafety: { completed: true, patientContextConfirmed: true },
      renewalDecision: {
        confirmed: true,
        items: [
          {
            medicationId: 'sal',
            selected: true,
            decision: 'renew',
            durationId: '14_days',
          },
        ],
        patientInfo: {
          patientName: 'Dane',
          dateOfBirth: '2020-10-16',
          phn: '',
          phnNotAvailable: true,
          source: 'STEP4_MANUAL',
          confirmedAt: '2026-09-17T12:00:00.000Z',
          confirmedBy: 'pharmacist-1',
        },
      },
    });
    const planRows = toPlanRows(
      next.medicationList.items,
      next.renewalDecision.items,
      new Map([['sal', { tone: 'clear' as const, label: 'No concerns', note: null }]]),
    );
    const body = buildRenewPharmacistPrescriptionNote(next, planRows);
    assert.match(body, /Original Prescriber: Johan  ·  Date: 10-Sept-2026/);
    const source = buildRenewPharmacistPrescriptionSource(next, planRows);
    assert.equal(
      source.prescriptions[0]?.originalPrescriptionReference.originalPrescriptionDate,
      '10-Sept-2026',
    );
  });

  it('prefers prescribed date over last fill date for the Original Prescriber line', () => {
    const next = payload();
    const source = buildRenewPharmacistPrescriptionSource(next, rows(next));
    assert.equal(
      source.prescriptions[0]?.originalPrescriptionReference.originalPrescriptionDate,
      '15-Jun-2026',
    );
    assert.doesNotMatch(
      buildRenewPharmacistPrescriptionNote(next, rows(next)),
      /01-Aug-2026/,
    );
  });

  it('keeps original prescription references medication-specific', () => {
    const next = payload();
    const source = buildRenewPharmacistPrescriptionSource(next, rows(next));
    assert.equal(source.prescriptions[0]?.originalPrescriptionReference.originalPrescriberName, 'Dr. KB');
    assert.equal(source.prescriptions[1]?.originalPrescriptionReference.originalPrescriberName, 'Dr. MA');
    assert.equal(source.prescriptions.every((rx) => rx.refills.count === 0), true);
  });

  it('omits Original Prescriber when Step 1 has no prescriber name', () => {
    const withoutPrescriber = med({
      id: 'ram',
      normalized: {
        genericName: 'Ramipril',
        strength: '10 mg',
        dosageForm: 'capsule',
        directions: 'Take 1 capsule orally once daily',
        dose: '1',
        doseUnit: 'capsule',
        quantityUnit: 'capsule',
        prescribedDate: '2026-06-15',
      },
    });
    const next = parseRenewPayload({
      medicationList: { items: [withoutPrescriber], confirmed: true },
      renewalRequest: {
        requestedDuration: '30_days',
        reasons: ['no_refills_remaining'],
        verifiedFrom: 'pharmacy_dispensing_record',
      },
      therapyReview: { completed: true, mappings: [], reviews: [] },
      monitoringSafety: { completed: true, patientContextConfirmed: true },
      renewalDecision: {
        confirmed: true,
        items: [{ medicationId: 'ram', selected: true, decision: 'renew', durationId: '30_days' }],
        patientInfo: {
          patientName: 'Morgan Taylor',
          dateOfBirth: '1964-04-12',
          phn: '1234567890',
          source: 'STEP4_MANUAL',
          confirmedAt: '2026-09-14T12:00:00.000Z',
          confirmedBy: 'pharm-1',
        },
      },
    });
    const body = buildRenewPharmacistPrescriptionNote(next, toPlanRows(
      next.medicationList.items,
      next.renewalDecision.items,
      new Map(),
    ));
    assert.doesNotMatch(body, /Original Prescriber:/i);
    assert.doesNotMatch(body, /Patient Instructions:/i);
  });

  it('calculates quantity only for deterministic SIG + duration', () => {
    const ok = resolvePrescriptionQuantity({
      enteredLabel: null,
      sig: 'Take 1 tablet orally once daily',
      durationDays: 30,
      dosageForm: 'tablet',
      dose: '1',
      doseUnit: 'tablet',
      quantityUnit: 'tablet',
      prn: false,
    });
    assert.equal(ok.source, 'DETERMINISTIC_CALCULATION');
    assert.equal(ok.display, '30 tablets');

    const prn = resolvePrescriptionQuantity({
      enteredLabel: null,
      sig: 'Take 1 tablet orally as needed',
      durationDays: 30,
      dosageForm: 'tablet',
      dose: '1',
      doseUnit: 'tablet',
      quantityUnit: 'tablet',
      prn: true,
    });
    assert.equal(prn.source, 'UNRESOLVED');
    assert.equal(prn.display, null);
  });

  it('prefers pharmacist-entered quantity over calculation', () => {
    const qty = resolvePrescriptionQuantity({
      enteredLabel: '90 capsules',
      sig: 'Take 1 capsule orally once daily',
      durationDays: 30,
      dosageForm: 'capsule',
      dose: '1',
      doseUnit: 'capsule',
      quantityUnit: 'capsule',
      prn: false,
    });
    assert.equal(qty.source, 'PHARMACIST_ENTERED');
    assert.equal(qty.display, '90 capsules');
  });
});
