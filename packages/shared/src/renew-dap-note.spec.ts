import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRenewConsultationNote,
  buildRenewDapPayload,
  validateRenewDapNote,
} from './renew-dap-note';
import { generateRenewDocuments, toPlanRows } from './renew-decision';
import { parseRenewPayload, emptyRenewCommunication, type RenewMedication } from './renew';

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

function basePayload(overrides: Record<string, unknown> = {}) {
  return parseRenewPayload({
    medicationList: { items: [ramipril], confirmed: true },
    renewalRequest: {
      requestedDuration: '30_days',
      reasons: ['no_refills_remaining', 'unable_to_see_prescriber'],
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
        patientName: 'Jane Doe',
        dateOfBirth: '1985-03-12',
        phn: '123456789',
        source: 'STEP4_MANUAL',
        confirmedAt: '2026-09-08T20:35:00.000Z',
        confirmedBy: 'pharm-1',
      },
    },
    ...overrides,
  });
}

function planRows(payload = basePayload()) {
  return toPlanRows(
    payload.medicationList.items,
    payload.renewalDecision.items,
    new Map([['ram', { tone: 'clear' as const, label: 'No concerns', note: null }]]),
  );
}

describe('renew DAP note', () => {
  it('maps confirmed Step 1–4 state into an encounter DAP without inventing missing facts', () => {
    const payload = basePayload();
    const note = buildRenewConsultationNote(payload, planRows(payload), {
      encounter: {
        dateTimeIso: '2026-09-08T20:35:00.000Z',
        pharmacistName: 'Jane Smith',
        pharmacistRole: 'Pharmacist',
        practiceSite: 'Riverside Community Pharmacy',
        timeZone: 'America/Edmonton',
      },
    });
    assert.match(note, /D — Data/);
    assert.match(note, /A — Assessment/);
    assert.match(note, /P — Plan/);
    assert.match(
      note,
      /D — Data\nPatient informed consent obtained prior to the pharmacist assessment\./,
    );
    assert.match(note, /Renewal requested because no remaining refills before regular prescriber follow-up/i);
    assert.match(note, /Therapy verified against the pharmacy dispensing record/i);
    assert.match(note, /Current therapy: Ramipril 10 mg capsule, Take 1 capsule orally once daily, for Hypertension/i);
    assert.match(
      note,
      /Patient reports taking the medication as directed and reports no concerns with effectiveness or tolerability/i,
    );
    assert.match(note, /Based on the information obtained, continued Ramipril therapy remains appropriate/i);
    assert.match(note, /No drug therapy problem requiring a change in therapy was identified/i);
    assert.match(note, /A 30-day renewal was provided to maintain continuity of therapy/i);
    assert.match(note, /Renewed Ramipril 10 mg capsule: Take 1 capsule orally once daily/i);
    assert.match(note, /Renewal authorized for a 30-day supply/i);
    assert.match(note, /Original Prescriber Notified on \d{2}-[A-Za-z]{3,}-\d{4}/);
    assert.doesNotMatch(note, /once daily for 30 days/i);
    assert.doesNotMatch(note, /Pharmacist Consultation Note/);
    assert.doesNotMatch(note, /Pharmacist Renewal Assessment/);
    assert.doesNotMatch(note, /Patient: Jane Doe/);
    assert.doesNotMatch(note, /DOB:/);
    assert.doesNotMatch(note, /PHN:/);
    assert.doesNotMatch(note, /Jane Smith, Pharmacist/);
    assert.doesNotMatch(note, /Riverside Community Pharmacy/);
    assert.doesNotMatch(note, /Reason for renewal:/);
    assert.doesNotMatch(note, /Patient counselled and understands/i);
    assert.doesNotMatch(note, /In person|Virtual/i);
    assert.doesNotMatch(note, /No allergies/i);
    assert.doesNotMatch(note, /notification pending/i);
    assert.doesNotMatch(note, /no red flags/i);
    assert.doesNotMatch(note, /Safety Engine/i);
    assert.doesNotMatch(note, /no effectiveness\/stability/i);
    assert.doesNotMatch(note, /renewal is appropriate/i);
    assert.doesNotMatch(note, /method\/date not yet documented/i);
    assert.doesNotMatch(note, /Medication-specific safety review identified no new relevant concerns/i);
    assert.doesNotMatch(note, /Available monitoring was reviewed/i);
    assert.doesNotMatch(note, /Continue established monitoring/i);
  });

  it('documents unavailable monitoring without converting it to a normal result', () => {
    const payload = basePayload({
      monitoringSafety: {
        completed: true,
        patientContextConfirmed: true,
        results: [
          {
            inputCode: 'POTASSIUM',
            status: 'UNAVAILABLE',
            value: null,
            observedDate: null,
            sourceType: null,
            sourceLabel: null,
            note: 'No recent result available',
            pharmacistConfirmed: true,
          },
        ],
      },
    });
    const note = buildRenewConsultationNote(payload, planRows(payload));
    assert.match(note, /No recent (?:POTASSIUM|Potassium)/i);
    assert.match(note, /No recent result available/);
    assert.doesNotMatch(note, /Potassium normal/i);
  });

  it('does not claim no DTP unless therapy and monitoring review are complete', () => {
    const incomplete = basePayload({
      therapyReview: { completed: false, mappings: [], reviews: [] },
      monitoringSafety: { completed: false },
    });
    const incompleteNote = buildRenewConsultationNote(incomplete, planRows(incomplete));
    assert.doesNotMatch(incompleteNote, /no (?:actual or potential )?(?:dtp|drug therapy problem)/i);

    const complete = basePayload();
    const completeNote = buildRenewConsultationNote(complete, planRows(complete));
    assert.match(completeNote, /No drug therapy problem requiring a change in therapy was identified/);
  });

  it('records a documented medication concern as a DTP and omits counselling unless captured', () => {
    const payload = basePayload({
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
            medicationConcernStatus: 'yes',
            answerSource: 'individual',
            issues: [
              {
                id: 'i1',
                conditionKey: 'htn',
                medicationIds: ['ram'],
                issueType: 'medication_concern',
                issueCategory: 'side_effect',
                actionTaken: 'continue_and_monitor',
                details: 'Occasional dry cough',
                requiresStep3Review: false,
              },
            ],
            manuallyPreserved: false,
          },
        ],
      },
    });
    const generation = buildRenewDapPayload(payload, planRows(payload));
    assert.equal(generation.dtpState, 'ACTUAL');
    assert.equal(generation.counselling.length, 0);
    const note = buildRenewConsultationNote(payload, planRows(payload));
    assert.match(note, /drug therapy problem/i);
    assert.doesNotMatch(note, /Patient counselled/i);
  });

  it('records notified wording in the DAP only after communication is completed', () => {
    const payload = parseRenewPayload({
      ...basePayload(),
      renewalDecision: {
        ...basePayload().renewalDecision,
        communication: {
          ...emptyRenewCommunication(),
          requirement: 'REQUIRED',
          status: 'COMMUNICATED',
          method: 'SECURE_FAX',
          communicatedAt: '2026-09-08T20:45:00.000Z',
          recipient: {
            recipientType: 'PRIMARY_CARE_PRESCRIBER',
            name: 'Dr. Jane Doe',
            profession: 'Family Medicine',
            clinicName: null,
            fax: null,
            phone: null,
            secureMessageAddress: null,
          },
        },
      },
    });
    const note = buildRenewConsultationNote(payload, planRows(payload));
    assert.match(note, /Original Prescriber Notified by fax on 08-Sept?-2026/);
    assert.doesNotMatch(note, /at 14:45/);
    assert.doesNotMatch(note, /Dr\. Jane Doe/);
  });

  it('records Original Prescriber Notified with current date when notification is still pending', () => {
    const payload = basePayload();
    const rows = planRows(payload);
    const docs = generateRenewDocuments(payload, rows, ['prescriber_notification'], []);
    const withLetter = parseRenewPayload({
      ...payload,
      renewalDecision: { ...payload.renewalDecision, documents: docs },
    });
    const note = buildRenewConsultationNote(withLetter, rows);
    assert.match(note, /Original Prescriber Notified on \d{2}-[A-Za-z]{3,}-\d{4}/);
    assert.doesNotMatch(note, /notification pending/i);
    assert.doesNotMatch(note, /transmission not yet documented/i);
  });

  it('rejects invented counselling claims', () => {
    const payload = basePayload();
    const generation = buildRenewDapPayload(payload, planRows(payload));
    const warnings = validateRenewDapNote(
      'Patient counselled and understands. Original Prescriber Notified on 08-Sep-2026.',
      generation,
    );
    assert.ok(warnings.some((row) => row.includes('counselled')));
    assert.ok(!warnings.some((row) => row.includes('notified')));
  });

  it('keeps required-document generation compatible with the Step 4 gate', () => {
    const payload = basePayload();
    const docs = generateRenewDocuments(payload, planRows(payload), ['consultation_note', 'renewal_summary'], []);
    assert.match(docs[0]?.body ?? '', /Ramipril/);
    assert.match(docs[0]?.body ?? '', /D — Data/);
    assert.equal(docs[0]?.title, 'Pharmacist Renewal Assessment');
    assert.doesNotMatch(docs[0]?.body ?? '', /Pharmacist Consultation Note/);
    assert.doesNotMatch(docs[0]?.body ?? '', /Pharmacist Renewal Assessment/);
    assert.equal(docs[0]?.reviewed, false);
  });
});
