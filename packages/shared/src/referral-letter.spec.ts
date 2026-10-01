import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleReferralLetter,
  buildReferralLetterPayload,
  formatReferralLetterDate,
  resolveReferralLetterFromAi,
  subjectLineForLetter,
  validateReferralLetter,
} from './referral-letter';
import type { ReferralTriggerSnapshotItem } from './referral-pathway.types';

const septicTrigger: ReferralTriggerSnapshotItem = {
  ruleId: 'flag-1',
  questionId: 'flag-1',
  label: 'Suspected septic arthritis',
  urgencyCode: 'IMMEDIATE_REFERRAL',
  urgencyDisplay: 'Immediate medical assessment required',
};

const goutParams = {
  patientAge: '35',
  patientSex: 'Male',
  consultationRef: 'CS-MTEUY0H7-5BF9',
  pathwayName: 'Acute Gout Exacerbation',
  pathwayCondition: 'Gout flare',
  urgencyDisplay: 'Immediate medical assessment required',
  urgencyCode: 'IMMEDIATE_REFERRAL' as const,
  triggers: [septicTrigger],
  destination: 'emergency_department' as const,
  reasonForReferral:
    'Please assess this patient immediately in the emergency department for suspected septic arthritis. The patient presented with gout symptoms, initially being evaluated as possible gout. Your assessment is requested to clarify the diagnosis and guide further management.',
  chiefComplaint: 'gout symptoms',
  pharmacistName: 'Jane Pharmacist',
  pharmacyName: 'City Care Pharmacy',
  pharmacyFax: '17805550100',
  pharmacyPhone: '17805550101',
  timeZone: 'America/Edmonton',
  now: new Date('2026-08-29T22:54:59Z'),
};

describe('referral letter assembly', () => {
  it('formats an unambiguous letter date without a clock time', () => {
    assert.equal(
      formatReferralLetterDate(new Date('2026-08-29T18:00:00Z'), 'UTC'),
      '29-Aug-2026',
    );
  });

  it('puts recorded timing and the selected concern in the subject', () => {
    assert.equal(
      subjectLineForLetter({
        urgencyCode: 'IMMEDIATE_REFERRAL',
        primaryConcern: 'Suspected septic arthritis',
      }),
      'Immediate assessment requested — suspected septic arthritis',
    );
  });

  it('renders a conventional letter instead of a numbered demographic dump', () => {
    const letter = assembleReferralLetter(buildReferralLetterPayload(goutParams));

    assert.match(letter, /^Jane Pharmacist/);
    assert.match(letter, /To: Emergency department clinician/);
    assert.match(letter, /Re: Immediate assessment requested — suspected septic arthritis/);
    assert.match(letter, /Dear Colleague,/);
    assert.match(letter, /Reason for referral/);
    assert.match(letter, /suspected septic arthritis/);
    assert.match(letter, /Sincerely,/);
    assert.match(letter, /Consultation reference: CS-MTEUY0H7-5BF9/);
    assert.match(letter, /City Care Pharmacy/);
    assert.match(letter, /Fax: 780-555 0100/);

    assert.doesNotMatch(letter, /Presenting concern \/ pathway/);
    assert.doesNotMatch(letter, /Triggered red flags/);
    assert.doesNotMatch(letter, /Not recorded in consultation/);
    assert.doesNotMatch(letter, /prescribing was not initiated/i);
    assert.doesNotMatch(letter, /does not mean a referral was sent/i);
    assert.doesNotMatch(letter, /Further assessment requested for gout symptoms/);
    assert.doesNotMatch(letter, /Pathway: Acute Gout Exacerbation/);
    assert.doesNotMatch(letter, /4:54:59/);
    assert.doesNotMatch(letter, /^1\./m);
  });

  it('omits the patient name line when identity is missing rather than printing a placeholder', () => {
    const letter = assembleReferralLetter(
      buildReferralLetterPayload({ ...goutParams, patientName: undefined }),
    );
    assert.doesNotMatch(letter, /^Name:/m);
    assert.doesNotMatch(letter, /Not recorded in consultation/);
    assert.doesNotMatch(letter, /John Pharmacist|Demo Pharmacy/);
  });

  it('does not treat a gout pathway title as a confirmed diagnosis', () => {
    const letter = assembleReferralLetter(buildReferralLetterPayload(goutParams));
    assert.doesNotMatch(letter, /confirmed gout/i);
    assert.doesNotMatch(letter, /diagnosis of gout/i);
  });

  it('keeps a different pathway from inheriting septic arthritis', () => {
    const letter = assembleReferralLetter(
      buildReferralLetterPayload({
        ...goutParams,
        pathwayName: 'Acute Otitis Media',
        pathwayCondition: 'Ear pain',
        chiefComplaint: 'left ear pain',
        urgencyCode: 'FOLLOW_UP_REFERRAL',
        urgencyDisplay: 'Medical follow-up recommended',
        destination: 'family_doctor_np',
        triggers: [
          {
            ruleId: 'aom-1',
            questionId: 'aom-1',
            label: 'Symptoms lasting more than 4 days',
            urgencyCode: 'FOLLOW_UP_REFERRAL',
            urgencyDisplay: 'Medical follow-up recommended',
          },
        ],
        reasonForReferral:
          'Please assess this patient for follow-up by their family doctor or nurse practitioner for symptoms lasting more than 4 days.',
      }),
    );
    assert.match(letter, /symptoms lasting more than 4 days/i);
    assert.doesNotMatch(letter, /septic arthritis/i);
    assert.doesNotMatch(letter, /Emergency department/);
  });

  it('inserts optional AI context once without repeating the canonical reason', () => {
    const payload = buildReferralLetterPayload(goutParams);
    const letter = assembleReferralLetter(payload, {
      clinicalContext: [
        'Relevant history includes type 2 diabetes treated with metformin.',
      ],
      careProvided: [],
      additionalInformation: [],
      requestAndFollowUp: [],
    });
    const reason = payload.canonical_reason;
    const first = letter.indexOf(reason);
    const second = letter.indexOf(reason, first + reason.length);
    assert.equal(second, -1);
    assert.match(letter, /type 2 diabetes treated with metformin/);
  });

  it('rejects AI extras that invent a send event', () => {
    const payload = buildReferralLetterPayload(goutParams);
    assert.equal(
      resolveReferralLetterFromAi(
        {
          clinicalContext: [
            { text: 'The referral was sent to the emergency department.', sourceIds: ['context-1'] },
          ],
          careProvided: [],
          additionalInformation: [],
          requestAndFollowUp: [],
        },
        payload,
      ),
      null,
    );
  });

  it('rejects unknown source IDs on AI extras', () => {
    const payload = buildReferralLetterPayload({
      ...goutParams,
      confirmedFacts: [{ id: 'context-1', renderedText: 'gout symptoms' }],
    });
    assert.equal(
      resolveReferralLetterFromAi(
        {
          clinicalContext: [{ text: 'Supported extra.', sourceIds: ['other-patient'] }],
          careProvided: [],
          additionalInformation: [],
          requestAndFollowUp: [],
        },
        payload,
      ),
      null,
    );
  });

  it('does not invent a DOB from recorded age', () => {
    const letter = assembleReferralLetter(
      buildReferralLetterPayload({ ...goutParams, patientAge: '35', patientDob: undefined }),
    );
    assert.doesNotMatch(letter, /^Date of birth:/m);
    assert.doesNotMatch(letter, /1991/);
  });

  it('includes prescribing-not-initiated only when that outcome was recorded', () => {
    const omitted = assembleReferralLetter(buildReferralLetterPayload(goutParams));
    assert.doesNotMatch(omitted, /prescribing was not initiated/i);

    const included = assembleReferralLetter(
      buildReferralLetterPayload({ ...goutParams, prescribingNotInitiated: true }),
    );
    assert.match(included, /Pharmacist prescribing was not initiated/);
  });

  it('flags a generic reason when a specific trigger is selected', () => {
    const payload = buildReferralLetterPayload({
      ...goutParams,
      reasonForReferral: 'Further assessment requested for gout symptoms.',
    });
    assert.equal(payload.reason_needs_review, true);
    assert.equal(payload.canonical_reason, 'Further assessment requested for gout symptoms.');
  });

  it('uses UTC for the letter date when no practice timezone is supplied', () => {
    assert.equal(
      formatReferralLetterDate(new Date('2026-08-30T02:00:00Z')),
      '30-Aug-2026',
    );
  });

  it('ignores a legacy full-letter AI dump and keeps renderer structure', () => {
    const payload = buildReferralLetterPayload(goutParams);
    const letter = resolveReferralLetterFromAi(
      { letterText: 'Dear Doctor Smith, the referral was sent yesterday.' },
      payload,
    );
    assert.ok(letter);
    assert.match(letter ?? '', /Dear Colleague,/);
    assert.doesNotMatch(letter ?? '', /Doctor Smith/);
    assert.doesNotMatch(letter ?? '', /referral was sent/i);
  });
});
