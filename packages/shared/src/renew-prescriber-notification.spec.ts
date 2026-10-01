import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateRenewDocuments, toPlanRows } from './renew-decision';
import { parseRenewPayload, emptyRenewCommunication, type RenewMedication } from './renew';
import {
  buildPrescriberNotificationNote,
  sanitizeProviderNotificationBody,
  validateGeneratedProviderCommunication,
  validatePrescriberNotification,
} from './renew-prescriber-notification';
import { buildRenewConsultationNote } from './renew-dap-note';

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
    },
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

describe('renew prescriber notification', () => {
  it('renders a concise ACP notification without claiming communication occurred', () => {
    const next = payload();
    const body = buildPrescriberNotificationNote(next, rows(next), {
      encounter: {
        dateTimeIso: '2026-09-08T20:45:00.000Z',
        pharmacistName: 'Alex Chen',
        pharmacistRole: 'Pharmacist',
        practiceSite: 'Riverbend Pharmacy',
        timeZone: 'America/Edmonton',
        ageYears: 36,
        mode: null,
        prescribingBasis: 'ADAPTATION_RENEWAL_CONTINUITY_OF_CARE',
        jurisdiction: 'Alberta',
        phone: '780-555-0100',
        fax: '780-555-0101',
      },
    });
    assert.match(body, /PHARMACIST RENEWAL NOTIFICATION/);
    assert.match(body, /Patient: Morgan Taylor · DOB: 12-Apr-1990/);
    assert.match(body, /Re: Pharmacist prescription renewal/);
    assert.match(body, /Dear Colleague,/);
    assert.match(body, /Ramipril/);
    assert.match(body, /Medication renewed/);
    assert.match(body, /Renewal duration: 30 days/);
    assert.match(body, /Date prescribed:/);
    assert.match(body, /Morgan Taylor/);
    assert.match(body, /Alex Chen/);
    assert.match(body, /unavailable/i);
    assert.match(body, /Relevant clinical information/);
    assert.doesNotMatch(body, /^To:/m);
    assert.doesNotMatch(body, /1\.\s+Patient:/);
    assert.doesNotMatch(body, /adaptation/i);
    assert.doesNotMatch(body, /prescriber notified/i);
    assert.doesNotMatch(body, /patient understands/i);
    assert.doesNotMatch(body, /no renal (?:dosing )?concern/i);
    assert.doesNotMatch(body, /labs? normal/i);
    assert.doesNotMatch(body, /Recipient not specified/);
    assert.equal(validatePrescriberNotification(body).length, 0);
  });

  it('records Original Prescriber Notified in DAP even before mark-complete', () => {
    const next = payload();
    const docs = generateRenewDocuments(next, rows(next), ['prescriber_notification'], []);
    const withLetter = parseRenewPayload({
      ...next,
      renewalDecision: { ...next.renewalDecision, documents: docs },
    });
    const note = buildRenewConsultationNote(withLetter, rows(withLetter));
    assert.match(note, /Original Prescriber Notified on \d{2}-[A-Za-z]{3,}-\d{4}/);
    assert.doesNotMatch(note, /notification pending/i);
  });

  it('sanitizes numbered To/Patient headers into the natural-flow letter chrome', () => {
    const repaired = sanitizeProviderNotificationBody(
      [
        'PHARMACIST PRESCRIBING / RENEWAL NOTIFICATION',
        '1. Patient: Mani',
        '2. To: Recipient not specified in supplied payload',
        '3. Re: Pharmacist prescription adaptation',
        'This communication is to advise the following patient has received a renewal.',
      ].join('\n'),
    );
    assert.match(repaired, /^PHARMACIST RENEWAL NOTIFICATION/m);
    assert.match(repaired, /Patient: Mani/);
    assert.match(repaired, /Re: Pharmacist prescription renewal/);
    assert.match(repaired, /Dear Colleague,/);
    assert.doesNotMatch(repaired, /^To:/m);
    assert.doesNotMatch(repaired, /Recipient not specified/);
    assert.doesNotMatch(repaired, /1\.\s+Patient:/);
    assert.doesNotMatch(repaired, /adaptation/i);
    assert.equal(validatePrescriberNotification(repaired).length, 0);
  });

  it('rejects leftover To: lines, adaptation wording, and placeholder text', () => {
    const issues = validateGeneratedProviderCommunication({
      generatedText: [
        'PHARMACIST PRESCRIBING / RENEWAL NOTIFICATION',
        '1. Patient: Mani',
        '2. To: Recipient not specified in supplied payload',
        '3. Re: Pharmacist prescription adaptation',
      ].join('\n'),
      patientName: 'Mani',
    });
    assert.ok(issues.some((row) => /To line|placeholder|adaptation|numbered|title/i.test(row)));
  });
});
