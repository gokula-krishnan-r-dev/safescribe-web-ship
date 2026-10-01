import {
  PCP_CLOSING_SENTENCE,
  PCP_LETTER_TITLE,
  applyDeterministicPcpTreatment,
  buildPcpCommunicationPayload,
  getPharmacistConfirmedTreatments,
  pcpDisplayNameFromTreatment,
  pcpPatientDirectionsFromTreatment,
  renderPcpTreatmentSection,
  repairPcpCommunicationFields,
  toLlmPcpPayload,
  validatePcpCommunication,
  buildPcpSignatureBlock,
} from '@safescript/shared';
import { buildPcpCommunicationPayloadFromConsultation } from './pcp-communication-payload.builder';

describe('PCP communication payload and treatment rendering', () => {
  const source = {
    chiefComplaint: 'cold sore symptoms',
    createdAt: '2026-08-13T15:00:00.000Z',
    consultationMode: 'GUIDED_PATHWAY',
    redFlags: { hasRedFlags: false, referralSelected: false },
    pathway: { condition: 'cold sores (oral herpes labialis)', name: 'Cold sores' },
    pharmacist: { firstName: 'John', lastName: 'Pharmacist' },
    patientDisplayName: 'Jane Doe',
    pharmacistCredentials: 'RPh',
    counsellingNotes: {
      counselling_status: 'confirmed',
      plan: {
        status: 'REVIEWED',
        sections: [
          {
            section_key: 'FOLLOW_UP',
            items: [
              {
                text: 'Patient was advised to seek reassessment if symptoms worsen or do not improve as expected.',
              },
            ],
          },
        ],
      },
    },
    treatmentPlan: {
      selectedTreatments: [
        {
          medicationName: 'valacyclovir',
          genericName: 'valacyclovir',
          brandName: 'Valtrex',
          dose: '2 g',
          route: 'Oral',
          frequency: 'twice daily',
          duration: '1 day',
          instructions: 'Take 2 g by mouth twice daily for 1 day.',
        },
        {
          displayName: 'acyclovir 5% topical',
          medicationName: 'Zovirax® Cream, generics',
          genericName: 'acyclovir',
          patientDirections:
            'Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
        },
      ],
    },
  };

  it('uses exact display_name and patient_directions without brand expansion', () => {
    const payload = buildPcpCommunicationPayload(source);
    expect(payload.selected_treatments.map((t) => t.display_name)).toEqual([
      'valacyclovir',
      'acyclovir 5% topical',
    ]);
    expect(payload.selected_treatments[0].patient_directions).toBe(
      'Take 2 g by mouth twice daily for 1 day.',
    );
    expect(payload.selected_treatments[1].patient_directions).toContain(
      'Apply a thin layer to the affected cold sore',
    );

    const treatment = renderPcpTreatmentSection(payload.selected_treatments);
    expect(treatment).toBe(
      [
        'valacyclovir: Take 2 g by mouth twice daily for 1 day.',
        'acyclovir 5% topical: Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
      ].join('\n'),
    );
    expect(treatment).not.toMatch(/Valtrex|generics|®|Zovirax/i);
    expect(treatment).not.toMatch(/as directed/i);
  });

  it('renders treatment names when patient_directions was stripped during payload cleaning', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      treatmentPlan: {
        selectedTreatments: [
          {
            medicationName: 'valacyclovir',
            genericName: 'valacyclovir',
            dose: '2 g',
            route: 'Oral',
            frequency: 'twice daily',
            duration: '1 day',
          },
          {
            displayName: 'acyclovir 5% topical',
            medicationName: 'acyclovir',
            genericName: 'acyclovir',
          },
        ],
      },
    });

    expect(
      payload.selected_treatments.map((t) => t.patient_directions),
    ).toEqual(['', '']);

    const treatment = renderPcpTreatmentSection(payload.selected_treatments);
    expect(treatment).toBe('valacyclovir\nacyclovir 5% topical');

    const fields = applyDeterministicPcpTreatment(
      { documentTitle: PCP_LETTER_TITLE },
      payload,
    );
    expect(fields.treatment).toBe('valacyclovir\nacyclovir 5% topical');
  });

  it('does not reconstruct SIG when patient_directions is supplied', () => {
    const directions = pcpPatientDirectionsFromTreatment({
      dose: '500 mg',
      route: 'Oral',
      frequency: 'twice daily',
      duration: 'As directed',
      patientDirections: 'Take 2 g by mouth twice daily for 1 day.',
    });
    expect(directions).toBe('Take 2 g by mouth twice daily for 1 day.');
    expect(pcpDisplayNameFromTreatment({ medicationName: 'valacyclovir', genericName: 'valacyclovir', brandName: 'Valtrex' })).toBe(
      'valacyclovir',
    );
  });

  it('does not reconstruct a SIG from dose/route/frequency when directions are missing', () => {
    const directions = pcpPatientDirectionsFromTreatment({
      medicationName: 'valacyclovir',
      dose: '2 g',
      route: 'Oral',
      frequency: 'twice daily',
      duration: 'As directed',
    });
    expect(directions).toBe('');
  });

  it('renders pharmacist follow-up from counselling action plus prescribing defaults', () => {
    const withFollowUp = buildPcpCommunicationPayload(source);
    expect(withFollowUp.follow_up_required).toBe(true);
    expect(withFollowUp.follow_up_incomplete).toBe(false);
    expect(withFollowUp.confirmed_follow_up[0]).toMatch(
      /Pharmacist follow-up planned in 7 days to assess/,
    );

    const without = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: { counselling_status: 'draft' },
    });
    expect(without.follow_up_required).toBe(true);
    expect(without.follow_up_incomplete).toBe(false);
    expect(without.confirmed_follow_up[0]).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement or resolution; referral advised if symptoms are not resolving.',
    );
  });

  it('does not describe a recommended referral as completed', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      redFlags: { hasRedFlags: true, referralSelected: true },
      referralOutcome: {
        actionTaken: 'patient_advised',
        documentationText: 'Patient advised to see their physician.',
      },
    });
    expect(payload.referral.recommended).toBe(true);
    expect(payload.referral.completed).toBe(false);
    expect(payload.confirmed_follow_up.join(' ')).not.toMatch(/was completed/i);
  });

  it('prefers selectedTreatments snapshot over the first catalog item', () => {
    const treatments = getPharmacistConfirmedTreatments({
      recommendedTreatments: [
        { medicationName: 'unselected option' },
        { medicationName: 'valacyclovir', instructions: 'Take 2 g by mouth twice daily for 1 day.' },
      ],
      selectedIndex: -1,
      selectedTreatments: [
        { medicationName: 'valacyclovir', instructions: 'Take 2 g by mouth twice daily for 1 day.' },
      ],
    });
    expect(treatments).toHaveLength(1);
    expect(treatments[0].display_name).toBe('valacyclovir');
  });

  it('replaces invented brand/as-directed Treatment with deterministic lines', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
    });
    const broken = {
      treatment:
        'Valtrex®, generics (valacyclovir), 2 g, oral, twice daily, for As directed. Zovirax® Cream, generics.',
      followUp: 'Continue monitoring as usual.',
      closingSentence: 'Please continue care.',
    };
    const failed = validatePcpCommunication(broken, payload);
    expect(failed.ok).toBe(false);
    expect(failed.medicationFailed).toBe(true);

    const repaired = repairPcpCommunicationFields(broken, payload);
    expect(repaired.fields.treatment).toContain('valacyclovir: Take 2 g by mouth twice daily');
    expect(repaired.fields.treatment).not.toMatch(/Valtrex|generics|as directed/i);
    expect(repaired.fields.followUp).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement or resolution; referral advised if symptoms are not resolving.',
    );
    expect(repaired.fields.closingSentence).toBe(PCP_CLOSING_SENTENCE);
  });

  it('maps a consultation record through the dedicated server builder', () => {
    const payload = buildPcpCommunicationPayloadFromConsultation(
      {
        chiefComplaint: 'cold sore symptoms',
        createdAt: new Date('2026-08-13T15:00:00.000Z'),
        consultationMode: 'CLINICAL_JUDGMENT',
        treatmentPlan: source.treatmentPlan,
        counsellingNotes: source.counsellingNotes,
        redFlags: { hasRedFlags: false },
      },
      {
        pharmacist: { firstName: 'John', lastName: 'Pharmacist' },
        clinicalJudgmentAssessment: {
          workingDiagnosisText: 'cold sores (oral herpes labialis)',
          diagnosticCertainty: 'CONFIRMED',
        },
        patientDisplayName: 'Jane Doe',
      },
    );

    expect(payload.patient.display_name).toBe('Jane Doe');
    expect(payload.assessment?.condition).toMatch(/cold sores/i);
    expect(payload.assessment?.no_red_flags_requiring_referral_confirmed).toBe(true);
    expect(applyDeterministicPcpTreatment({}, payload).treatment.split('\n')).toHaveLength(2);
  });

  it('builds a professional signature with pharmacy name and fax', () => {
    const withFax = buildPcpSignatureBlock({
      pharmacistDisplayName: 'Jane Pharmacist',
      credentials: 'RPh',
      pharmacyName: 'City Care Pharmacy',
      pharmacyFax: '17805550100',
    });
    expect(withFax).toBe(
      ['Kind regards,', 'Jane Pharmacist, RPh', '', 'City Care Pharmacy', 'Fax: 780-555 0100'].join(
        '\n',
      ),
    );

    const withoutFax = buildPcpSignatureBlock({
      pharmacistDisplayName: 'Jane Pharmacist',
      credentials: 'RPh',
      pharmacyName: 'City Care Pharmacy',
    });
    expect(withoutFax).toContain('City Care Pharmacy');
    expect(withoutFax).not.toMatch(/Fax:/);
  });

  it('defaults follow-up responsibility to the pharmacist for prescribing encounters', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        timeframe: 'in 7 days',
        primary_monitoring_target: 'symptom improvement',
      },
    });
    expect(payload.pcp_follow_up_plan?.responsible_party).toBe('Pharmacist');
    expect(payload.confirmed_follow_up[0]).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement; referral advised if symptoms are not resolving.',
    );
    expect(applyDeterministicPcpTreatment({}, payload).followUp).toBe(
      payload.confirmed_follow_up[0],
    );
  });

  it('respects an explicit PCP follow-up responsibility override', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        responsible_party: 'Primary care provider',
        responsibility_override_confirmed: true,
        timeframe: 'within 1 week',
        primary_monitoring_target: 'persistent symptoms',
      },
    });
    expect(payload.pcp_follow_up_plan?.responsible_party).toBe('Primary care provider');
    expect(payload.pcp_follow_up_plan?.responsibility_override_confirmed).toBe(true);
    expect(payload.confirmed_follow_up[0]).toMatch(/^Primary care provider follow-up planned/);
    expect(payload.confirmed_follow_up[0]).not.toMatch(/Pharmacist/);
  });

  it('does not leak counselling or natural-history fragments into PCP follow-up', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: {
          status: 'REVIEWED',
          sections: [
            {
              section_key: 'FOLLOW_UP',
              items: [
                { text: 'Early initiation of antiviral treatment.' },
                { text: 'Most recurrent episodes heal within 1 to 2 weeks.' },
                { text: 'Follow up in 7 days' },
                { text: 'Significant improvement expected in 7 days' },
                { text: 'Refer if not resolving' },
              ],
            },
          ],
        },
      },
    });
    const followUp = payload.confirmed_follow_up.join(' ');
    expect(followUp).toBe(
      'Pharmacist follow-up planned in 7 days to assess clinical improvement; referral advised if symptoms are not resolving.',
    );
    expect(followUp).not.toMatch(/early initiation|heal within|natural history/i);
  });

  it('fills a missing monitoring target with the prescribing default', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        timeframe: 'in 7 days',
      },
    });
    expect(payload.follow_up_incomplete).toBe(false);
    expect(payload.confirmed_follow_up[0]).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement or resolution; referral advised if symptoms are not resolving.',
    );
  });

  it('sends a compact LLM payload without follow-up or administrative chrome', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        timeframe: 'in 7 days',
        primary_monitoring_target: 'symptom improvement',
      },
    });
    const llm = toLlmPcpPayload(payload);
    expect(llm).toHaveProperty('PATIENT_CONTEXT');
    expect(llm).toHaveProperty('ASSESSMENT');
    expect(llm).toHaveProperty('SELECTED_TREATMENTS');
    expect(JSON.stringify(llm)).not.toMatch(/PCP_FOLLOW_UP|confirmed_follow_up|headerBlock|signature/i);
  });

  it('always overwrites LLM treatment and follow-up with backend-rendered sections', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        timeframe: 'in 7 days',
        primary_monitoring_target: 'symptom improvement',
      },
    });
    const repaired = repairPcpCommunicationFields(
      {
        openingSentence: 'I am writing to provide a brief update following a pharmacist assessment for cold sore symptoms.',
        assessment: 'Presentation was consistent with cold sores (oral herpes labialis).',
        treatment: 'Valtrex® as directed',
        followUp: 'See your doctor next year.',
      },
      payload,
    );
    expect(repaired.fields.treatment).toContain('valacyclovir: Take 2 g by mouth twice daily');
    expect(repaired.fields.treatment).not.toMatch(/Valtrex|as directed/i);
    expect(repaired.fields.followUp).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement; referral advised if symptoms are not resolving.',
    );
    expect(repaired.fields.openingSentence).toMatch(/pharmacist assessment/);
  });

  it('Test A — renders WHO WHEN WHAT from the structured follow-up plan', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        responsible_party: 'Pharmacist',
        timeframe: '7 days',
        primary_monitoring_target: 'symptom improvement or resolution',
        action_if_not_met: 'referral advised if symptoms are not resolving',
        pharmacist_confirmed: true,
      },
    });
    expect(payload.follow_up_required).toBe(true);
    expect(payload.follow_up_incomplete).toBe(false);
    expect(applyDeterministicPcpTreatment({}, payload).followUp).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement or resolution; referral advised if symptoms are not resolving.',
    );
  });

  it('Test C — pharmacist-prescribing follow-up uses WHO/WHEN/WHAT defaults instead of omitting the section', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      counsellingNotes: {},
      pcpFollowUpPlan: {
        responsible_party: 'Pharmacist',
        timeframe: null,
        primary_monitoring_target: null,
      },
    });
    expect(payload.follow_up_required).toBe(true);
    expect(payload.follow_up_incomplete).toBe(false);
    const repaired = repairPcpCommunicationFields(
      { followUp: '', treatment: '' },
      payload,
    );
    expect(repaired.fields.followUp).toBe(
      'Pharmacist follow-up planned in 7 days to assess symptom improvement or resolution; referral advised if symptoms are not resolving.',
    );
  });

  it('Test E — omits follow-up when it is not required', () => {
    const payload = buildPcpCommunicationPayload({
      ...source,
      consultationMode: 'DOCUMENTATION_REFERRAL',
      counsellingNotes: {},
      treatmentPlan: { selectedTreatments: [] },
    });
    expect(payload.follow_up_required).toBe(false);
    expect(payload.follow_up_incomplete).toBe(false);
    expect(applyDeterministicPcpTreatment({}, payload).followUp).toBe('');
  });
});
