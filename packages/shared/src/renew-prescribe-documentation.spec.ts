import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAP_NOTE_TITLE } from './dap-payload';
import {
  assembleRenewConsultationNoteFromAi,
  assembleRenewPcpFromAi,
  buildRenewPrescribeDapPayload,
  buildRenewPrescribePcpPayload,
  formatPrescribeDapBody,
  PRESCRIBE_DOC_ID_TO_RENEW_KIND,
  RENEW_KIND_TO_PRESCRIBE_DOC_ID,
} from './renew-prescribe-documentation';
import { emptyRenewCommunication, parseRenewPayload, type RenewMedication } from './renew';
import { toPlanRows } from './renew-decision';

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

function basePayload() {
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
        patientName: 'Jane Doe',
        dateOfBirth: '1968-04-12',
        phn: '12345',
        source: 'STEP4_MANUAL',
        confirmedAt: '2026-09-14T12:00:00.000Z',
        confirmedBy: 'pharm',
      },
      communication: emptyRenewCommunication(),
    },
  });
}

describe('renew prescribe documentation mapping', () => {
  it('maps renew kinds onto Prescribe document ids', () => {
    assert.equal(RENEW_KIND_TO_PRESCRIBE_DOC_ID.renewal_summary, 'prescription');
    assert.equal(RENEW_KIND_TO_PRESCRIBE_DOC_ID.patient_handout, 'patient_care_summary');
    assert.equal(PRESCRIBE_DOC_ID_TO_RENEW_KIND.prescription, 'renewal_summary');
  });

  it('builds a Prescribe DAP payload from confirmed renewal state', () => {
    const payload = basePayload();
    const rows = toPlanRows(payload.medicationList.items, payload.renewalDecision.items, new Map());
    const dap = buildRenewPrescribeDapPayload(payload, rows);
    assert.equal(dap.assessment.condition, 'Hypertension');
    assert.equal(dap.selected_treatments.length, 1);
    assert.equal(dap.selected_treatments[0]?.display_name.includes('Ramipril'), true);
    assert.match(dap.selected_treatments[0]?.patient_directions ?? '', /once daily/i);
    assert.equal(dap.patient_handout_provided, false);
    assert.equal(dap.pcp_communication.completed, false);
  });

  it('builds a Prescribe PCP payload with backend-owned treatment lines', () => {
    const payload = basePayload();
    const rows = toPlanRows(payload.medicationList.items, payload.renewalDecision.items, new Map());
    const pcp = buildRenewPrescribePcpPayload(payload, rows);
    assert.equal(pcp.patient.display_name, 'Jane Doe');
    assert.equal(pcp.presenting_concern, 'Hypertension');
    assert.equal(pcp.selected_treatments[0]?.display_name.includes('Ramipril'), true);
    assert.equal(pcp.referral.completed, false);
  });

  it('assembles DAP and PCP bodies from structured AI fields', () => {
    const payload = basePayload();
    const rows = toPlanRows(payload.medicationList.items, payload.renewalDecision.items, new Map());
    const dap = buildRenewPrescribeDapPayload(payload, rows);
    const note = assembleRenewConsultationNoteFromAi(
      {
        documentTitle: DAP_NOTE_TITLE,
        data: 'Requested 30-day renewal of established Ramipril due to no remaining refills.',
        assessment: 'Current therapy remains indicated and appropriate to continue.',
        plan: 'Renewed Ramipril 10 mg daily for 30 days.',
      },
      dap,
    );
    assert.equal(note.ok, true);
    assert.match(note.body, /D — Data/);
    assert.match(note.body, /A — Assessment/);
    assert.match(note.body, /P — Plan/);
    assert.match(note.body, /Ramipril/);
    assert.doesNotMatch(note.body, /Pharmacist Consultation Note/);
    const letter = assembleRenewPcpFromAi({
      documentTitle: 'PHARMACIST RENEWAL NOTIFICATION',
      body: [
        'PHARMACIST RENEWAL NOTIFICATION',
        '',
        'Patient: Jane Doe',
        'DOB: 12-Apr-1968',
        '',
        'Re: Pharmacist renewal of established therapy',
        '',
        'The patient requested a 30-day renewal because no refills remained.',
        '',
        'Renewed for 30 days:',
        '- Ramipril 10 mg — Take 1 capsule orally once daily',
        '',
        'Plan: Continue established monitoring and follow up before the renewed supply is exhausted.',
      ].join('\n'),
    });
    assert.equal(letter.ok, true);
    assert.match(letter.body, /PHARMACIST RENEWAL NOTIFICATION/);
    assert.match(letter.body, /Dear Colleague,/);
    assert.match(letter.body, /Ramipril/);
    assert.doesNotMatch(letter.body, /^To:/m);
    assert.doesNotMatch(letter.body, /prescriber notified/i);
  });

  it('formats DAP fields without repeating headings inside prose', () => {
    const body = formatPrescribeDapBody({
      documentTitle: DAP_NOTE_TITLE,
      data: 'Consent obtained.',
      assessment: 'Hypertension.',
      plan: 'Ramipril continued.',
    });
    assert.equal(body.startsWith(DAP_NOTE_TITLE), true);
    assert.match(body, /A — Assessment\nHypertension/);
  });
});
