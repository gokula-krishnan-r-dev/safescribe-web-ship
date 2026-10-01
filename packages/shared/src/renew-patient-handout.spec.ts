import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateRenewDocuments, toPlanRows, evaluateRenewStep4Gate } from './renew-decision';
import { emptyRenewCommunication, parseRenewPayload, type RenewMedication } from './renew';
import {
  buildPatientHandoutNote,
  buildRenewPatientHandoutSource,
  plainRenewHandoutBody,
  RENEW_PATIENT_HANDOUT_TITLE,
  toPatientFacingSig,
  translateRenewPatientHandoutBody,
  validatePatientHandout,
  validatePatientHandoutAgainstPlan,
} from './renew-patient-handout';

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
    quantity: 30,
    quantityUnit: 'capsules',
  },
});

function payload(overrides: Record<string, unknown> = {}) {
  return parseRenewPayload({
    medicationList: { items: [ramipril], confirmed: true },
    renewalRequest: {
      requestedDuration: '30_days',
      reasons: ['no_refills_remaining'],
      verifiedFrom: 'pharmacy_dispensing_record',
    },
    therapyReview: {
      completed: true,
      mappings: [
        {
          medicationId: 'ram',
          conditionId: 'htn',
          customIndicationText: null,
          mappingSource: 'pharmacist_selected',
          status: 'pharmacist_confirmed',
          pharmacistConfirmed: true,
          candidates: [{ conditionId: 'htn', conditionCode: 'HTN', displayName: 'Hypertension' }],
        },
      ],
      reviews: [
        {
          id: 'r1',
          conditionId: 'htn',
          customConditionText: 'Hypertension',
          adherenceStatus: 'yes',
          effectivenessStatus: 'yes',
          medicationConcernStatus: 'no',
          answerSource: 'individual',
          issues: [],
          manuallyPreserved: false,
        },
      ],
    },
    monitoringSafety: { completed: true, patientContextConfirmed: true },
    renewalDecision: {
      confirmed: true,
      items: [{ medicationId: 'ram', selected: true, decision: 'renew', durationId: '30_days' }],
      patientInfo: {
        patientName: 'Morgan Taylor',
        dateOfBirth: '1990-04-12',
        phn: '1234567890',
        source: 'STEP4_MANUAL',
        confirmedAt: '2026-09-08T12:00:00.000Z',
        confirmedBy: 'pharmacist-1',
      },
      communication: emptyRenewCommunication(),
    },
    ...overrides,
  });
}

function rows(next = payload()) {
  return toPlanRows(
    next.medicationList.items,
    next.renewalDecision.items,
    new Map([['ram', { tone: 'clear', label: 'No concerns', note: 'Appropriate use' }]]),
  );
}

describe('renew patient handout', () => {
  it('renders Your Medication Renewal from confirmed plan data', () => {
    const next = payload();
    const body = buildPatientHandoutNote(next, rows(next), {
      encounter: {
        dateTimeIso: '2026-09-08T20:45:00.000Z',
        pharmacistName: 'Alex Chen',
        pharmacistRole: 'Pharmacist',
        practiceSite: 'Riverbend Pharmacy',
        timeZone: 'America/Edmonton',
        phone: '780-555-0100',
        address: '123 Main Street',
      },
    });
    assert.match(body, /Your Medication Renewal/);
    assert.match(body, /Your pharmacist reviewed your medication and provided a 30-day renewal/);
    assert.match(body, /Your renewed medication/);
    assert.match(body, /Riverbend Pharmacy/);
    assert.match(body, /780-555-0100/);
    assert.match(body, /How to take it: Take 1 capsule by mouth once daily/);
    assert.match(body, /Ramipril/);
    assert.match(body, /Used for: High blood pressure/);
    assert.match(body, /Renewal supply: 30 days/);
    assert.match(body, /When to get help/);
    assert.doesNotMatch(body, /When to contact your pharmacy or healthcare provider/);
    assert.doesNotMatch(body, /Take: Take /);
    assert.doesNotMatch(body, /Renewed for:/);
    assert.doesNotMatch(body, /Please follow up with your regular healthcare provider/);
    assert.doesNotMatch(body, /Continue the monitoring/);
    assert.doesNotMatch(body, /Patient Care Summary/);
    assert.doesNotMatch(body, /Patient:/);
    assert.doesNotMatch(body, /Morgan Taylor/);
    assert.doesNotMatch(body, /PHN/);
    assert.doesNotMatch(body, /1990-04-12/);
    assert.doesNotMatch(body, /drug therapy problem/i);
    assert.doesNotMatch(body, /this medicine is safe/i);
    assert.doesNotMatch(body, /Quantity:/i);
    assert.doesNotMatch(body, /\bbid\b|\bprn\b/i);
    assert.equal(validatePatientHandout(body).length, 0);

    const source = buildRenewPatientHandoutSource(next, rows(next));
    assert.equal(source.patient.preferredFirstName, 'Morgan');
    assert.equal(source.medicationsRenewed[0]?.patientFacingSig, 'Take 1 capsule by mouth once daily');
    assert.equal(source.medicationsRenewed[0]?.indicationPatientLabel, 'High blood pressure');
  });

  it('expands prescription abbreviations into plain language', () => {
    assert.equal(toPatientFacingSig('inhale one puff bid prn'), 'inhale 1 puff twice daily as needed');
    assert.equal(toPatientFacingSig('Take 1 tablet TID PO'), 'Take 1 tablet three times daily by mouth');
    assert.equal(toPatientFacingSig('inhale 1 puff q12h'), 'inhale 1 puff every 12 hours');
    assert.equal(toPatientFacingSig('Take 1 tablet qd'), 'Take 1 tablet once daily');
  });

  it('keeps the confirmed SIG authoritative and rejects mismatched edits', () => {
    const next = payload();
    const planRows = rows(next);
    const body = buildPatientHandoutNote(next, planRows);
    const ok = validatePatientHandoutAgainstPlan(body, planRows);
    assert.equal(ok.ok, true);
    const rewritten = body.replace(
      'How to take it: Take 1 capsule by mouth once daily.',
      'How to take it: Take one tablet every morning.',
    );
    const blocked = validatePatientHandoutAgainstPlan(rewritten, planRows);
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason ?? '', /must match the confirmed renewal prescription/);
  });

  it('accepts formal SIG or approved patient-facing SIG in edited handouts', () => {
    const next = payload();
    const planRows = rows(next);
    const formal = 'Take 1 capsule orally once daily';
    const patient = toPatientFacingSig(formal);
    assert.equal(
      validatePatientHandoutAgainstPlan(`Your Medication Renewal\n\nHow to take it: ${patient}`, planRows).ok,
      true,
    );
    assert.equal(
      validatePatientHandoutAgainstPlan(`Your Medication Renewal\n\n${formal}`, planRows).ok,
      true,
    );
  });

  it('explains a medication that was not renewed without exposing rule language', () => {
    const next = parseRenewPayload({
      ...payload(),
      renewalDecision: {
        ...payload().renewalDecision,
        items: [{ medicationId: 'ram', selected: false, decision: 'do_not_renew', durationId: '30_days' }],
      },
    });
    const planRows = toPlanRows(
      next.medicationList.items,
      next.renewalDecision.items,
      new Map([['ram', { tone: 'review', label: 'Review recommended', note: 'Dialysis dosing unconfirmed' }]]),
    );
    const body = buildPatientHandoutNote(next, planRows, {
      clinical: { uncoveredMedications: [{ id: 'ram', name: 'Ramipril' }] },
    });
    assert.match(body, /Medication requiring follow-up/);
    assert.match(body, /Not renewed today/);
    assert.match(body, /dialysis|kidney/i);
    assert.doesNotMatch(body, /NO_APPLICABLE_RULE/);
    assert.doesNotMatch(body, /REVIEW_REQUIRED/);
    assert.doesNotMatch(body, /Your renewed medication/);
  });

  it('does not convert unavailable monitoring into a normal result', () => {
    const next = parseRenewPayload({
      ...payload(),
      monitoringSafety: {
        completed: true,
        patientContextConfirmed: true,
        results: [
          {
            inputCode: 'EGFR',
            status: 'UNAVAILABLE',
            value: { numericValue: null, secondaryNumericValue: null, valueText: null, unit: null },
            observedDate: null,
            sourceType: 'MANUAL',
            sourceLabel: null,
            note: 'Not available at this visit',
            pharmacistConfirmed: true,
          },
        ],
        itemReviews: [{ inputCode: 'EGFR', action: 'FOLLOW_UP_WITH_PRESCRIBER', note: null, otherText: null }],
      },
    });
    const body = buildPatientHandoutNote(next, rows(next));
    assert.match(body, /not available/i);
    assert.doesNotMatch(body, /kidney function is normal/i);
    assert.doesNotMatch(body, /eGFR 4/);
  });

  it('does not block completion when the optional handout is not generated', () => {
    const next = payload();
    const docs = generateRenewDocuments(next, rows(next), ['consultation_note', 'renewal_summary'], []);
    const reviewed = docs.map((doc) => ({ ...doc, reviewed: true, reviewedAt: '2026-09-08T12:00:00.000Z' }));
    const gate = evaluateRenewStep4Gate({
      ...next.renewalDecision,
      documents: reviewed,
      pharmacistAttested: false,
      communication: { ...emptyRenewCommunication(), noAffectedProfessional: true, requirement: 'REQUIRED' },
    });
    assert.equal(gate.canComplete, true);
    assert.equal(reviewed.some((doc) => doc.kind === 'patient_handout' && doc.status === 'generated'), false);
  });

  it('rejects unsupported clinical claims', () => {
    const warnings = validatePatientHandout('This medicine is safe for you. Your doctor has been notified.');
    assert.ok(warnings.some((row) => row.includes('safe')));
    assert.ok(warnings.some((row) => row.includes('doctor_notified')));
  });

  it('stores English as the canonical handout language on generate', () => {
    const next = payload();
    const docs = generateRenewDocuments(next, rows(next), ['patient_handout'], []);
    const handout = docs.find((doc) => doc.kind === 'patient_handout');
    assert.equal(handout?.title, RENEW_PATIENT_HANDOUT_TITLE);
    assert.equal(handout?.handoutLanguage, 'en');
    assert.match(handout?.englishBody ?? '', /How to take it:/);
    assert.match(handout?.body ?? '', /Renewal supply:/);
  });

  it('translates handout lines without changing protected numbers', async () => {
    const result = await translateRenewPatientHandoutBody({
      englishBody: 'How to take it: Take 1 capsule by mouth once daily.\nRenewal supply: 30 days',
      targetLanguage: 'fr-CA',
      translateTexts: async (texts) => texts.map((text) => text.replace('How to take it', 'Comment le prendre')),
    });
    assert.equal(result.ok, true);
    assert.equal(result.fallback, false);
    assert.equal(result.language, 'fr-CA');
    assert.match(result.body, /Comment le prendre/);
    assert.match(result.body, /1 capsule/);
    assert.match(result.body, /30 days/);
  });

  it('uses one clean medication name and a multi-medication opening', () => {
    const salbutamol = med({
      id: 'sal',
      raw: { medicationText: 'salbutamol · SALBUTAMOL HFA 100 mcg' },
      normalized: {
        genericName: 'salbutamol',
        brandName: 'SALBUTAMOL HFA',
        strength: '100 mcg',
        dosageForm: 'inhaler',
        directions: 'inhale one puff bid prn',
      },
    });
    const next = parseRenewPayload({
      ...payload(),
      medicationList: { items: [ramipril, salbutamol], confirmed: true },
      renewalDecision: {
        ...payload().renewalDecision,
        items: [
          { medicationId: 'ram', selected: true, decision: 'renew', durationId: '30_days' },
          { medicationId: 'sal', selected: true, decision: 'renew', durationId: '7_days' },
        ],
      },
    });
    const planRows = toPlanRows(
      next.medicationList.items,
      next.renewalDecision.items,
      new Map([
        ['ram', { tone: 'clear', label: 'No concerns', note: 'Appropriate use' }],
        ['sal', { tone: 'clear', label: 'No concerns', note: 'Appropriate use' }],
      ]),
    );
    const body = buildPatientHandoutNote(next, planRows);
    assert.match(
      body,
      /Your pharmacist reviewed your medications and renewed the medicines listed below/,
    );
    assert.doesNotMatch(body, /provided a \d+-day renewal/);
    assert.match(body, /Your renewed medications/);
    assert.match(body, /Salbutamol HFA 100 mcg/);
    assert.doesNotMatch(body, /salbutamol ·/i);
    assert.match(body, /How to take it: Inhale 1 puff twice daily as needed/);
    assert.match(body, /Renewal supply: 7 days/);
    assert.match(body, /Renewal supply: 30 days/);
    assert.doesNotMatch(body, /\bbid\b|\bprn\b/i);
  });

  it('keeps English line structure when the stored body is HTML', () => {
    const plain = plainRenewHandoutBody(
      '<h1>Your Medication Renewal</h1><p>How to take it: Take 1 capsule by mouth once daily.</p><p>Renewal supply: 30 days</p>',
    );
    assert.match(plain, /Your Medication Renewal/);
    assert.match(plain, /How to take it: Take 1 capsule by mouth once daily/);
    assert.match(plain, /Renewal supply: 30 days/);
    assert.doesNotMatch(plain, /<p>/);
  });
});
