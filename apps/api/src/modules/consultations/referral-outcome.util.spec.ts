import {
  validateReferralOutcomeInput,
  deriveReferralOutcome,
  buildReferralDocumentationText,
  buildReferralSourceFingerprint,
  canCompleteReferralWithLetter,
  draftReferralReason,
  severityToUrgencyCode,
  pickHighestUrgency,
  buildReferralLetterPayload,
  resolveReferralLetterFromAi,
} from '@safescript/shared';
import {
  buildServerTriggerSnapshot,
  buildDocumentationFromOutcome,
  buildReferralLetterDraft,
} from './referral-outcome.util';

describe('referral outcome util', () => {
  it('builds server trigger snapshot from refer acknowledgments', () => {
    const { triggers, urgencyCode } = buildServerTriggerSnapshot(
      {
        referralSelected: true,
        acknowledgments: [
          {
            flagId: 'pathway:rf1',
            flag: 'Severe or rapidly worsening symptoms?',
            answer: 'yes',
            action: 'refer',
          },
        ],
      },
      [{ id: 'rf1', title: 'Severe or rapidly worsening symptoms', severity: 'CRITICAL' }],
    );

    expect(triggers).toHaveLength(1);
    expect(triggers[0].label).toBe('Severe or rapidly worsening symptoms');
    expect(urgencyCode).toBe('SAME_DAY_REFERRAL');
  });

  it('validates destination and reason without action or patient response', () => {
    expect(
      validateReferralOutcomeInput({
        destination: 'walk_in_clinic',
        reasonForReferral: 'Further assessment requested for left pinky finger pain.',
      }),
    ).toEqual([]);
  });

  it('rejects a missing reason for referral', () => {
    expect(
      validateReferralOutcomeInput({
        destination: 'emergency_department',
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'reasonForReferral' }),
      ]),
    );
  });

  it('derives documentation without inventing formal handoff', () => {
    const docs = buildDocumentationFromOutcome({
      urgencyDisplay: 'Same-day medical assessment recommended',
      triggers: [
        {
          ruleId: 'rf1',
          questionId: 'pathway:rf1',
          label: 'Severe or rapidly worsening symptoms',
          urgencyCode: 'SAME_DAY_REFERRAL',
          urgencyDisplay: 'Same-day medical assessment recommended',
        },
      ],
      destination: 'emergency_department',
      reasonForReferral: 'Further assessment requested for left pinky finger pain.',
      actionTaken: 'patient_advised',
      patientResponse: 'agreed',
    });

    expect(docs.derivedCode).toBe('referral_advice_provided');
    expect(docs.documentationText).toContain('emergency department');
    expect(docs.documentationText).toContain('Reason for referral:');
    expect(docs.documentationText).not.toContain('provider contacted');
    expect(docs.documentationText).not.toContain('Patient response: agreed');
    expect(docs.documentationText).not.toContain('patient advised to seek care');
  });

  it('maps severity helpers', () => {
    expect(severityToUrgencyCode('EMERGENCY')).toBe('IMMEDIATE_REFERRAL');
    expect(pickHighestUrgency(['FOLLOW_UP_REFERRAL', 'SAME_DAY_REFERRAL']).code).toBe(
      'SAME_DAY_REFERRAL',
    );
    expect(deriveReferralOutcome('referral_sent', 'declined')).toBe(
      'referral_recommended_patient_declined',
    );
  });

  it('builds declined documentation text', () => {
    const text = buildReferralDocumentationText({
      urgencyDisplay: 'Same-day medical assessment recommended',
      triggerLabels: ['Severe or rapidly worsening symptoms'],
      destination: 'emergency_department',
      actionTaken: 'patient_advised',
      patientResponse: 'declined',
    });
    expect(text).toContain('Patient declined the referral recommendation');
  });

  it('attaches pharmacy fax details on the referral letter when present', () => {
    const letter = buildReferralLetterDraft({
      patientName: 'Alex Patient',
      patientAge: '25',
      patientSex: 'Male',
      consultationRef: 'CS-TEST-1',
      pathwayName: 'Seborrheic Dermatitis / Dandruff',
      pathwayCondition: 'Itchy scalp',
      urgencyDisplay: 'Same-day medical assessment recommended',
      triggers: [
        {
          ruleId: 'rf1',
          questionId: 'pathway:rf1',
          label: 'Severe or rapidly worsening symptoms',
          urgencyCode: 'SAME_DAY_REFERRAL',
          urgencyDisplay: 'Same-day medical assessment recommended',
        },
      ],
      destination: 'emergency_department',
      reasonForReferral: 'Further assessment requested for left pinky finger pain.',
      pharmacistName: 'Jane Pharmacist',
      pharmacyName: 'City Care Pharmacy',
      pharmacyFax: '17805550100',
      now: new Date('2026-08-22T12:00:00Z'),
    });

    expect(letter).toContain('Dear Colleague,');
    expect(letter).toContain('Further assessment requested for left pinky finger pain.');
    expect(letter).not.toContain('Action already taken');
    expect(letter).not.toContain('Patient advised to seek care');
    expect(letter).not.toContain('Presenting concern / pathway');
    expect(letter).toContain('Sincerely,');
    expect(letter).toContain('Jane Pharmacist');
    expect(letter).toContain('City Care Pharmacy');
    expect(letter).toContain('Fax: 780-555 0100');
    expect(letter).not.toMatch(/prescribing was not initiated/i);
    expect(letter).not.toMatch(/does not mean a referral was sent/i);
  });

  it('omits pharmacy fax when the number is missing or too short', () => {
    const letter = buildReferralLetterDraft({
      consultationRef: 'CS-TEST-2',
      pathwayName: 'Pathway',
      pathwayCondition: 'Concern',
      urgencyDisplay: 'Follow-up recommended',
      triggers: [],
      destination: 'family_doctor_np',
      reasonForReferral: 'Further assessment requested.',
      pharmacistName: 'Jane Pharmacist',
      pharmacyName: 'City Care Pharmacy',
      pharmacyFax: '555',
    });
    expect(letter).toContain('City Care Pharmacy');
    expect(letter).not.toMatch(/Fax:/);
  });

  it('does not invent a reason from the presenting concern alone', () => {
    expect(
      draftReferralReason({
        presentingConcern: 'Patient reports pain in left pinky finger.',
      }),
    ).toBe('');
  });

  it('drafts Fixture E with the selected concern and immediate ED request', () => {
    const draft = draftReferralReason({
      presentingConcern: 'gout symptoms',
      pathwayCondition: 'Gout flare',
      destination: 'emergency_department',
      urgencyCode: 'IMMEDIATE_REFERRAL',
      triggerLabels: ['Suspected septic arthritis'],
    });
    expect(draft.startsWith(
      'Please assess this patient immediately in the emergency department for suspected septic arthritis.',
    )).toBe(true);
    expect(draft.toLowerCase()).toContain('suspected septic arthritis');
    expect(draft.toLowerCase()).toContain('gout');
    expect(draft).not.toMatch(/Further assessment requested for gout symptoms/i);
    expect(draft).not.toMatch(/fever|bear weight|agreed to attend/i);
  });

  it('invalidates the letter fingerprint when the reason changes', () => {
    const base = {
      pathwayId: 'pw1',
      pathwayVersion: 1,
      destination: 'walk_in_clinic',
      reasonForReferral: 'Further assessment requested for left pinky finger pain.',
    };
    const next = buildReferralSourceFingerprint({
      ...base,
      reasonForReferral: 'Further assessment requested for worsening finger pain.',
    });
    expect(buildReferralSourceFingerprint(base)).not.toBe(next);
  });

  it('unlocks complete after letter approval without a send-confirmation field', () => {
    expect(
      canCompleteReferralWithLetter({
        referralFormIsValid: true,
        referralOutcomeStatus: 'DRAFT',
        letterStatus: 'approved',
        letterSourceRevision: 1,
        referralSourceRevision: 1,
        handlingRecorded: true,
      }),
    ).toBe(true);
  });

  it('keeps complete locked until a handling method is recorded', () => {
    expect(
      canCompleteReferralWithLetter({
        referralFormIsValid: true,
        referralOutcomeStatus: 'DRAFT',
        letterStatus: 'approved',
        letterSourceRevision: 1,
        referralSourceRevision: 1,
        handlingRecorded: false,
      }),
    ).toBe(false);
  });
});

describe('referral letter AI resolution', () => {
  const letterParams = {
    patientName: 'Alex Patient',
    patientAge: '25',
    patientSex: 'Male',
    consultationRef: 'CS-TEST-1',
    pathwayName: 'Seborrheic Dermatitis / Dandruff',
    pathwayCondition: 'Itchy scalp',
    urgencyDisplay: 'Same-day medical assessment recommended',
    triggers: [
      {
        ruleId: 'rf1',
        questionId: 'pathway:rf1',
        label: 'Severe or rapidly worsening symptoms',
        urgencyCode: 'SAME_DAY_REFERRAL' as const,
        urgencyDisplay: 'Same-day medical assessment recommended',
      },
    ],
    destination: 'emergency_department' as const,
    reasonForReferral: 'Further assessment requested for left pinky finger pain.',
    pharmacistName: 'Jane Pharmacist',
    pharmacyName: 'City Care Pharmacy',
    pharmacyFax: '17805550100',
    now: new Date('2026-08-22T12:00:00Z'),
  };

  it('accepts optional AI context and still renders a professional letter', () => {
    const payload = buildReferralLetterPayload(letterParams);
    const letter = resolveReferralLetterFromAi(
      {
        clinicalContext: [],
        careProvided: [],
        additionalInformation: [],
        requestAndFollowUp: [],
      },
      payload,
    );
    expect(letter).toContain('CS-TEST-1');
    expect(letter).toContain('Further assessment requested for left pinky finger pain.');
    expect(letter).toContain('Dear Colleague,');
    expect(letter).not.toContain('Presenting concern / pathway');
  });

  it('rejects AI extras that invent a send', () => {
    const payload = buildReferralLetterPayload(letterParams);
    expect(
      resolveReferralLetterFromAi(
        {
          clinicalContext: [
            { text: 'Please see this patient in ED. Referral was sent.', sourceIds: [] },
          ],
          careProvided: [],
          additionalInformation: [],
          requestAndFollowUp: [],
        },
        payload,
      ),
    ).toBeNull();
  });
});
