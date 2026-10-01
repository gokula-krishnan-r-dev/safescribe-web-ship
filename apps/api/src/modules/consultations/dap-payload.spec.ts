import {
  DAP_CONSENT_SENTENCE,
  DAP_NOTE_TITLE,
  containsPlannedFollowUpLanguage,
  normalizeDapFinding,
  repairDapNoteFields,
  renderDapPlanTreatments,
  toLlmDapPayload,
  validateDapNote,
  type DapPayload,
} from '@safescript/shared';
import { buildDapPayloadFromConsultation } from './dap-payload.builder';

function payload(overrides: Partial<DapPayload> = {}): DapPayload {
  return {
    patient_context: {
      age_years: 35,
      sex: 'Male',
      allergies: [],
      conditions: [],
      current_medications: [],
      labs: [],
      vitals: [],
    },
    presenting_concern: 'recurrent cold sore',
    clinical_findings: [
      {
        clinical_label: 'Prodromal symptoms',
        status: 'present',
        documentation_value:
          'Patient reported prodromal tingling/burning around the affected lip area.',
      },
    ],
    eligibility_findings: [],
    red_flags: {
      screening_completed: true,
      negative_findings: ['Ocular involvement'],
      positive_findings: [],
      uncertain_findings: [],
      referral_required: false,
      no_red_flags_requiring_referral_confirmed: true,
    },
    assessment: {
      condition: 'Cold sores (oral herpes labialis)',
      eligible_for_pharmacist_management: true,
    },
    meaningful_differentials: ['Aphthous ulcer'],
    objective_data: [],
    patient_specific_safety: [],
    treatment_safety: { review_completed: true, clinically_significant_findings: [] },
    selected_treatments: [
      {
        display_name: 'valacyclovir',
        patient_directions: 'Take 2 g by mouth twice daily for 1 day.',
        dose: '2 g',
        route: 'oral',
        frequency: 'twice daily',
        duration: '1 day',
      },
    ],
    treatment_rationale: null,
    counselling_confirmed: true,
    confirmed_counselling: {
      medication_use: [],
      expected_response: [],
      self_care: [],
      follow_up: [],
    },
    patient_handout_provided: true,
    referral: { recommended: false, action_completed: false },
    pcp_communication: { planned: false, completed: false },
    ...overrides,
  };
}

describe('DAP payload contract', () => {
  it('renders the structured pharmacist follow-up supplied for DAP generation', () => {
    const built = buildDapPayloadFromConsultation({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingNotes: { counselling_status: 'confirmed' },
      followUpRequired: true,
      chiefComplaint: 'cold sores',
      followUpPlan: {
        responsible_party: 'Pharmacist',
        timeframe: '7 days',
        primary_monitoring_target: 'lesion improvement or resolution',
        clinically_important_additional_parameter: 'treatment tolerability',
        expected_outcome: 'significant improvement',
        action_if_not_met: 'referral advised if symptoms are not resolving',
      },
    });
    expect(built.follow_up_plan?.pharmacist_confirmed).toBe(true);
    expect(toLlmDapPayload(built).FOLLOW_UP_PLAN).toEqual(
      expect.objectContaining({
        responsible_party: 'Pharmacist',
        timeframe: '7 days',
        effectiveness_parameters: ['lesion improvement or resolution'],
        safety_parameters: ['treatment tolerability'],
      }),
    );

    const repaired = repairDapNoteFields(
      { data: 'Assessed for cold sores.', assessment: 'Cold sores.', plan: '' },
      payload({ follow_up_plan: built.follow_up_plan }),
    );
    expect(repaired.fields.plan).toMatch(
        /Pharmacist follow-up planned in 7 days to assess lesion improvement or resolution and treatment tolerability; referral advised if symptoms are not resolving\./,
    );
    expect(repaired.validation.ok).toBe(true);
  });

  it('requires pharmacist review when a required follow-up has not been confirmed', () => {
    const built = buildDapPayloadFromConsultation({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingNotes: { counselling_status: 'review_required' },
      followUpRequired: true,
      followUpPlan: {
        responsible_party: 'Pharmacist',
        timeframe: '7 days',
        primary_monitoring_target: 'symptom improvement',
      },
    });
    expect(built.follow_up_incomplete).toBe(true);
    expect(built.follow_up_plan?.pharmacist_confirmed).toBe(false);
    expect(repairDapNoteFields({ plan: '' }, built).fields.plan).not.toMatch(
      /follow-up planned/i,
    );
  });

  it('keeps a separately confirmed structured follow-up when counselling data is stale', () => {
    const built = buildDapPayloadFromConsultation({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingNotes: { counselling_status: 'review_required' },
      followUpRequired: true,
      chiefComplaint: 'cold sore',
      followUpPlan: {
        responsible_party: 'Pharmacist',
        timeframe: '7 days',
        primary_monitoring_target: 'lesion improvement or resolution',
        clinically_important_additional_parameter: 'treatment tolerability',
        action_if_not_met: 'referral advised if symptoms are not resolving',
        pharmacist_confirmed: true,
      },
    });

    expect(built.follow_up_incomplete).toBeUndefined();
    expect(built.follow_up_plan?.pharmacist_confirmed).toBe(true);
    const repaired = repairDapNoteFields({ plan: '' }, built);
    expect(repaired.fields.plan).toMatch(
      /Pharmacist follow-up planned in 7 days to assess lesion improvement or resolution and treatment tolerability; referral advised if symptoms are not resolving\./,
    );
    expect(repaired.validation.ok).toBe(true);
  });

  it('does not mistake a safety-net mention for a planned pharmacist follow-up', () => {
    expect(
      containsPlannedFollowUpLanguage(
        'Contact the pharmacist for follow-up if symptoms worsen.',
      ),
    ).toBe(false);
    expect(
      containsPlannedFollowUpLanguage(
        'Pharmacist follow-up planned in 7 days to assess symptom improvement.',
      ),
    ).toBe(true);
  });

  it('normalizes a raw Yes/No question into a documentation value', () => {
    const finding = normalizeDapFinding({
      question:
        'Has the patient experienced tingling, burning, itching, pain, numbness, or swelling at the affected area?',
      answer: 'yes',
    });
    expect(finding?.clinical_label).toMatch(/tingling|prodromal|burning/i);
    expect(finding?.documentation_value).not.toMatch(/^Has the patient/i);
    expect(finding?.documentation_value).not.toMatch(/\?$/);
  });

  it('omits unanswered and not-assessed findings', () => {
    expect(normalizeDapFinding({ question: 'Any fever?', answer: '' })).toBeNull();
    expect(normalizeDapFinding({ question: 'Any fever?', answer: 'not assessed' })).toBeNull();
  });

  it('builds a clean payload without question text or pathway IDs', () => {
    const built = buildDapPayloadFromConsultation({
      chiefComplaint: 'cold sore',
      demographics: { age: 35, ageUnit: 'years', sex: 'Male', allergies: 'NKDA' },
      questionResponses: {
        q1: {
          questionId: 'q1',
          question: 'Has the patient experienced tingling, burning, or pain?',
          answer: 'yes',
        },
      },
      pathway: {
        condition: 'Cold sores (oral herpes labialis)',
        questions: [
          {
            id: 'q1',
            question: 'Has the patient experienced tingling, burning, or pain?',
            section: { name: 'diagnosisConfirmation' },
          },
        ],
      },
      redFlags: {
        hasRedFlags: false,
        acknowledgments: [
          { flag: 'Ocular Involvement', answer: 'no', action: 'clear' },
        ],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            dose: '2 g',
            route: 'oral',
            frequency: 'twice daily',
            duration: '1 day',
            directions: 'Take 2 g by mouth twice daily for 1 day.',
          },
        ],
      },
      counsellingNotes: { counselling_status: 'confirmed', patientHandoutProvided: true },
    });

    expect(JSON.stringify(built)).not.toMatch(/Has the patient/i);
    expect(JSON.stringify(built)).not.toMatch(/q1/);
    expect(built.selected_treatments[0].display_name).toBe('valacyclovir');
    expect(built.red_flags.negative_findings.join(' ')).toMatch(/ocular/i);
    expect(built.counselling_confirmed).toBe(true);
    expect(built.patient_handout_provided).toBe(true);
    expect(built.selected_treatments[0].dose).toBe('2 g');
    expect(built.selected_treatments[0].route).toBe('oral');
  });

  it('does not mark a handout as provided unless the pharmacist confirmed it', () => {
    const built = buildDapPayloadFromConsultation({
      counsellingNotes: { counselling_status: 'confirmed', includeDetailedHandout: true },
    });
    expect(built.counselling_confirmed).toBe(true);
    expect(built.patient_handout_provided).toBe(false);
  });

  it('copies explicit consent into the DAP payload and repaired Data section', () => {
    const built = buildDapPayloadFromConsultation({
      demographics: { age: 25, sex: 'Female', patientConsentObtained: true },
      chiefComplaint: 'migraine',
    });
    expect(built.consent_obtained).toBe(true);
    const repaired = repairDapNoteFields(
      {
        data: '25-year-old female assessed for migraine.',
        assessment: 'Presentation consistent with migraine.',
        plan: 'Continue therapy.',
      },
      payload({ consent_obtained: true }),
    );
    expect(repaired.fields.data).toMatch(
      new RegExp(`^${DAP_CONSENT_SENTENCE.replace('.', '\\.')}\\n\\n25-year-old female assessed for migraine`),
    );
    expect(repaired.validation.ok).toBe(true);
  });

  it('does not leak a generic renal warning when renal function is not impaired', () => {
    const built = buildDapPayloadFromConsultation({
      demographics: { age: 30, sex: 'Female', medicalConditions: 'migraine', pregnancyStatus: 'No' },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'almotriptan',
            directions: 'Take 1 tablet at onset of migraine.',
            renalAdjustmentReason: 'Severe renal impairment requires dose adjustment.',
          },
        ],
      },
    });
    expect(built.treatment_safety.clinically_significant_findings.join(' ')).not.toMatch(
      /renal impairment/i,
    );
  });

  it('does not allow an overall no-red-flag sentence unless explicitly confirmed', () => {
    const result = validateDapNote(
      {
        data: 'Thunderclap headache was not present. No red flags requiring referral were identified.',
        assessment: 'Gout flare.',
        plan: 'Refer.',
      },
      payload({
        red_flags: {
          screening_completed: true,
          negative_findings: ['Thunderclap/worst-ever headache'],
          positive_findings: [],
          uncertain_findings: [],
          referral_required: false,
          no_red_flags_requiring_referral_confirmed: false,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/red-flag/i);
  });

  it('does not treat a generated PCP letter draft as completed communication', () => {
    const built = buildDapPayloadFromConsultation({
      documentation: {
        documents: { prescriber_communication: { assessment: 'draft' } },
      },
    });
    expect(built.pcp_communication.completed).toBe(false);
  });

  it('replaces invented treatment lines with exact confirmed directions', () => {
    const repaired = repairDapNoteFields(
      {
        documentTitle: 'Note',
        data: '35-year-old male assessed for a cold sore.',
        assessment: 'Presentation is consistent with cold sores.',
        plan: 'Valacyclovir (Valtrex®, generics) 1 g daily as directed.',
      },
      payload(),
    );
    expect(repaired.fields.documentTitle).toBe(DAP_NOTE_TITLE);
    expect(repaired.fields.plan).toContain('**valacyclovir:** Take 2 g by mouth twice daily for 1 day.');
    expect(repaired.fields.plan).not.toMatch(/Valtrex/);
  });

  it('rejects raw questions, UUIDs, and unconfirmed handout/referral claims', () => {
    const result = validateDapNote(
      {
        data: 'Has the patient experienced tingling? Pathway 77f96502-8a1e-4576-9fd5-343bae93e064.',
        assessment: 'SafeScribe Clinical Judgment confirmed the diagnosis.',
        plan: 'Patient education handout provided. Referral was completed.',
      },
      payload({
        patient_handout_provided: false,
        referral: { recommended: true, action_completed: false },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/question|identifier|handout|referral|system/i);
  });

  it('renders deterministic treatment lines for every confirmed therapy', () => {
    const lines = renderDapPlanTreatments([
      {
        display_name: 'valacyclovir',
        patient_directions: 'Take 2 g by mouth twice daily for 1 day.',
      },
      {
        display_name: 'acyclovir 5% topical',
        patient_directions:
          'Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
      },
    ]);
    expect(lines).toContain('**valacyclovir:**');
    expect(lines).toContain('**acyclovir 5% topical:**');
  });

  it('omits empty labs and vitals from the model payload', () => {
    const built = buildDapPayloadFromConsultation({
      chiefComplaint: 'stomach ache and heartburn',
      demographics: { age: 45, sex: 'Female' },
    });
    expect(built.patient_context.labs).toBeUndefined();
    expect(built.patient_context.vitals).toBeUndefined();
  });

  it('strips missing-entry padding such as undocumented labs and vitals', () => {
    const repaired = repairDapNoteFields(
      {
        data:
          '45-year-old female assessed for stomach ache and heartburn. History of hypothyroidism and dyslipidemia. No laboratory results or vital signs were documented.',
        assessment: 'Assessed condition: GERD - gastroesophageal reflux disease.',
        plan: 'Continue therapy.',
      },
      payload(),
    );
    expect(repaired.fields.data).toContain('hypothyroidism');
    expect(repaired.fields.data).not.toMatch(/laboratory results/i);
    expect(repaired.fields.data).not.toMatch(/vital signs/i);
    expect(repaired.fields.data).not.toMatch(/not documented/i);
  });

  it('statically opens every repaired DAP Data section with the consent sentence', () => {
    const repaired = repairDapNoteFields(
      {
        data: '35-year-old male assessed for a cold sore.',
        assessment: 'Presentation is consistent with cold sores.',
        plan: 'Continue therapy.',
      },
      payload({ consent_obtained: false }),
    );
    expect(repaired.fields.data.startsWith(DAP_CONSENT_SENTENCE)).toBe(true);
    expect(repaired.fields.data).toContain('35-year-old male assessed for a cold sore.');
  });

  it('Test A — links a treatment-relevant eGFR to a confirmed renal implication', () => {
    const built = buildDapPayloadFromConsultation({
      demographics: {
        age: 62,
        sex: 'Female',
        extractedLabValues: [{ test: 'eGFR', value: '22', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            directions: 'Take 500 mg by mouth every 12 hours for 2 doses.',
            renalAdjustmentRequired: true,
            renalAdjustmentReason:
              'Dose reduction is recommended in severe renal impairment.',
          },
        ],
      },
    });
    expect(built.objective_data).toEqual([
      { type: 'eGFR', value: 22, unit: 'mL/min', clinically_relevant: true },
    ]);
    expect(built.patient_specific_safety).toEqual([
      expect.objectContaining({
        factor: 'renal_function',
        patient_finding: 'eGFR 22 mL/min',
        confirmed: true,
        documentation_summary:
          'Renal function was a patient-specific consideration in treatment selection and dosing.',
      }),
    ]);
    expect(JSON.stringify(built.patient_specific_safety)).not.toMatch(/Dose reduction is recommended/i);
    const llm = toLlmDapPayload(built);
    expect(llm.OBJECTIVE_DATA).toEqual(built.objective_data);
    expect(llm.PATIENT_SPECIFIC_SAFETY).toEqual(built.patient_specific_safety);
    const repaired = repairDapNoteFields(
      {
        data: 'eGFR was 22 mL/min.',
        assessment: 'Presentation was consistent with recurrent herpes labialis.',
        plan: 'Continue therapy.',
      },
      built,
    );
    expect(repaired.fields.assessment).toMatch(/Renal function was a patient-specific consideration/);
  });

  it('Test B — omits clinically irrelevant eGFR from the DAP payload', () => {
    const built = buildDapPayloadFromConsultation({
      demographics: {
        age: 25,
        sex: 'Female',
        extractedLabValues: [{ test: 'eGFR', value: '95', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            directions: 'Take 2 g by mouth twice daily for 1 day.',
          },
        ],
      },
    });
    expect(built.objective_data).toEqual([]);
    expect(built.patient_context.labs ?? []).toEqual([]);
    expect(JSON.stringify(toLlmDapPayload(built))).not.toMatch(/eGFR|95/);
  });

  it('does not send impaired eGFR without a confirmed treatment implication', () => {
    const built = buildDapPayloadFromConsultation({
      demographics: {
        age: 62,
        sex: 'Female',
        extractedLabValues: [{ test: 'eGFR', value: '22', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            directions: 'Take 2 g by mouth twice daily for 1 day.',
          },
        ],
      },
    });
    expect(built.objective_data).toEqual([]);
    expect(built.patient_specific_safety).toEqual([]);
    expect(JSON.stringify(toLlmDapPayload(built))).not.toMatch(/eGFR|22/);
  });

  it('Test C — empty safety review produces no generic safety sentence', () => {
    const built = buildDapPayloadFromConsultation({
      chiefComplaint: 'cold sore',
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            directions: 'Take 2 g by mouth twice daily for 1 day.',
          },
        ],
      },
    });
    expect(built.patient_specific_safety).toEqual([]);
    expect(built.treatment_safety.clinically_significant_findings).toEqual([]);
    const repaired = repairDapNoteFields(
      {
        data: '25-year-old assessed for a cold sore.',
        assessment:
          'Presentation was consistent with cold sores. No clinically significant patient-specific treatment-safety findings were identified in the confirmed review.',
        plan: 'Continue therapy.',
      },
      built,
    );
    expect(repaired.fields.assessment).not.toMatch(/no clinically significant/i);
    expect(repaired.fields.assessment).not.toMatch(/safety findings were identified/i);
  });

  it('Test D — defaults follow-up responsibility to the pharmacist', () => {
    const built = buildDapPayloadFromConsultation({
      consultationMode: 'GUIDED_PATHWAY',
      followUpPlan: {
        responsible_party: null,
        timeframe: '7 days',
        primary_monitoring_target: 'symptom improvement',
      },
    });
    expect(built.follow_up_plan?.responsible_party).toBe('Pharmacist');
    expect(built.follow_up_plan?.timeframe).toBe('7 days');
    expect(built.follow_up_plan?.effectiveness_parameters).toContain('symptom improvement');
    expect(toLlmDapPayload(built).FOLLOW_UP_PLAN).toEqual(
      expect.objectContaining({ responsible_party: 'Pharmacist' }),
    );
  });

  it('Test E — incomplete follow-up is not finalized', () => {
    const built = buildDapPayloadFromConsultation({
      consultationMode: 'GUIDED_PATHWAY',
      followUpPlan: {
        responsible_party: 'Pharmacist',
        timeframe: '7 days',
      },
    });
    expect(built.follow_up_incomplete).toBe(true);
    const repaired = repairDapNoteFields(
      {
        data: 'Assessed for a cold sore.',
        assessment: 'Cold sores.',
        plan: 'Continue therapy.',
      },
      built,
    );
    expect(repaired.validation.ok).toBe(false);
    expect(repaired.validation.reasons.join(' ')).toMatch(/follow-up plan incomplete/i);
    expect(repaired.fields.plan).not.toMatch(/follow-up planned/i);
  });

  it('Test F — counselling and natural history do not leak into FOLLOW_UP_PLAN', () => {
    const built = buildDapPayloadFromConsultation({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: {
          status: 'REVIEWED',
          sections: [
            {
              section_key: 'FOLLOW_UP',
              items: [
                { text: 'Most outbreaks heal in 7–14 days.' },
                { text: 'Avoid kissing.' },
                { text: 'Wash hands.' },
                { text: 'Follow up in 7 days.' },
                { text: 'Assess lesion improvement.' },
              ],
            },
          ],
        },
      },
    });
    expect(built.follow_up_plan?.responsible_party).toBe('Pharmacist');
    expect(built.follow_up_plan?.timeframe).toBe('7 days');
    expect(built.follow_up_plan?.effectiveness_parameters.join(' ')).toMatch(/lesion improvement/i);
    expect(built.follow_up_plan?.pharmacist_confirmed).toBe(true);
    const serialized = JSON.stringify(built.follow_up_plan);
    expect(serialized).not.toMatch(/heal in 7|avoid kissing|wash hands/i);
    expect(built.confirmed_counselling?.follow_up ?? []).toEqual([]);
  });

  it('preserves AI Plan counselling narrative and follow-up after treatments', () => {
    const repaired = repairDapNoteFields(
      {
        data: 'Patient informed consent obtained. Assessed for cold sores.',
        assessment: 'Presentation was consistent with cold sores.',
        plan:
          'Medication use, expected response, supportive self-care and infection-control measures were reviewed. Safety-net advice was provided regarding worsening or spreading lesions, ocular symptoms, signs of secondary infection, or failure to heal as expected. Pharmacist follow-up planned in 7 days to assess lesion improvement/resolution and treatment tolerability; referral advised if symptoms are not resolving.',
      },
      payload({
        follow_up_plan: {
          responsible_party: 'Pharmacist',
          timeframe: '7 days',
          effectiveness_parameters: ['lesion improvement'],
          safety_parameters: ['treatment tolerability'],
          adherence_parameters: [],
          expected_outcomes: [],
          action_if_not_met: ['referral advised if symptoms are not resolving'],
          responsibility_override_confirmed: false,
          pharmacist_confirmed: true,
        },
        selected_treatments: [
          {
            display_name: 'Valtrex',
            patient_directions: 'Take 500 mg by mouth every 12 hours for 2 doses.',
          },
          {
            display_name: 'ABREVA',
            patient_directions:
              'Apply 1 application topically 5 times a day for 10 days.',
            ingredient_id: 'docosanol',
          },
        ],
      }),
    );
    expect(repaired.fields.plan).toMatch(/\*\*Valtrex:\*\*/);
    expect(repaired.fields.plan).toMatch(/self-care/);
    expect(repaired.fields.plan).toMatch(/Safety-net advice was provided/i);
    expect(repaired.fields.plan).toMatch(/follow-up planned/i);
    expect(repaired.fields.plan.indexOf('**Valtrex:**')).toBeLessThan(
      repaired.fields.plan.toLowerCase().indexOf('self-care'),
    );
    expect(repaired.validation.ok).toBe(true);
  });

  it('injects structured follow-up when AI Plan omitted it', () => {
    const repaired = repairDapNoteFields(
      {
        data: 'Assessed for a cold sore.',
        assessment: 'Cold sores.',
        plan: '',
      },
      payload({
        follow_up_plan: {
          responsible_party: 'Pharmacist',
          timeframe: '7 days',
          effectiveness_parameters: ['lesion improvement'],
          safety_parameters: [],
          adherence_parameters: [],
          expected_outcomes: [],
          action_if_not_met: [],
          responsibility_override_confirmed: false,
          pharmacist_confirmed: true,
        },
      }),
    );
    expect(repaired.fields.plan).toMatch(/Pharmacist follow-up planned in 7 days/i);
    expect(repaired.fields.plan).toMatch(/\*\*valacyclovir:\*\*/);
    expect(repaired.validation.ok).toBe(true);
  });

  it('injects planned follow-up even when Plan has safety-net "follow up if" wording', () => {
    const repaired = repairDapNoteFields(
      {
        data: 'Assessed for a cold sore.',
        assessment: 'Cold sores.',
        plan:
          'Medication use and expected response were reviewed. Safety-net advice was provided regarding worsening lesions. Patient was advised to follow up if symptoms worsen or the lesion does not heal.',
      },
      payload({
        follow_up_plan: {
          responsible_party: 'Pharmacist',
          timeframe: '7 days',
          effectiveness_parameters: ['lesion improvement or resolution'],
          safety_parameters: ['treatment tolerability'],
          adherence_parameters: [],
          expected_outcomes: [],
          action_if_not_met: ['referral advised if symptoms are not resolving'],
          responsibility_override_confirmed: false,
          pharmacist_confirmed: true,
        },
        selected_treatments: [
          {
            display_name: 'Valtrex',
            patient_directions: 'Take 2 tablets by mouth twice daily for 1 day.',
          },
          {
            display_name: 'ABREVA',
            patient_directions:
              'Apply 1 application topically 5 times a day for 10 days.',
          },
        ],
      }),
    );
    expect(repaired.fields.plan).toMatch(/Pharmacist follow-up planned in 7 days/i);
    expect(repaired.fields.plan).toMatch(/lesion improvement/i);
    expect(repaired.fields.plan).toMatch(/\*\*Valtrex:\*\*/);
    expect(repaired.fields.plan).not.toMatch(/\[exact confirmed patient_directions\]/i);
    expect(repaired.validation.ok).toBe(true);
  });

  it('strips LLM SIG placeholders and keeps counselling + follow-up narrative', () => {
    const repaired = repairDapNoteFields(
      {
        data: 'Assessed for a cold sore.',
        assessment: 'Cold sores.',
        plan: [
          'Valtrex: [exact confirmed patient_directions]',
          'ABREVA: [exact confirmed patient_directions]',
          'Medication use, expected response, supportive self-care and infection-control measures were reviewed. Safety-net advice was provided regarding worsening/spreading lesions.',
        ].join('\n\n'),
      },
      payload({
        follow_up_plan: {
          responsible_party: 'Pharmacist',
          timeframe: '7 days',
          effectiveness_parameters: ['lesion improvement or resolution'],
          safety_parameters: ['treatment tolerability'],
          adherence_parameters: [],
          expected_outcomes: [],
          action_if_not_met: ['referral advised if symptoms are not resolving'],
          responsibility_override_confirmed: false,
          pharmacist_confirmed: true,
        },
        selected_treatments: [
          {
            display_name: 'Valtrex',
            patient_directions: 'Take 2 tablets by mouth twice daily for 1 day.',
          },
          {
            display_name: 'ABREVA',
            patient_directions:
              'Apply 1 application topically 5 times a day for 10 days.',
          },
        ],
      }),
    );
    expect(repaired.fields.plan).toMatch(/\*\*Valtrex:\*\* Take 2 tablets/i);
    expect(repaired.fields.plan).toMatch(/\*\*ABREVA:\*\* Apply 1 application/i);
    expect(repaired.fields.plan).not.toMatch(/\[exact confirmed patient_directions\]/i);
    expect(repaired.fields.plan).toMatch(/self-care/i);
    expect(repaired.fields.plan).toMatch(/Pharmacist follow-up planned in 7 days/i);
    expect(repaired.validation.ok).toBe(true);
  });

  it('flags confirmed follow-up missing from the final Plan', () => {
    const result = validateDapNote(
      {
        data: 'Assessed for a cold sore.',
        assessment: 'Cold sores.',
        plan: '**valacyclovir:** Take 2 g by mouth twice daily for 1 day.',
      },
      payload({
        follow_up_plan: {
          responsible_party: 'Pharmacist',
          timeframe: '7 days',
          effectiveness_parameters: ['lesion improvement'],
          safety_parameters: [],
          adherence_parameters: [],
          expected_outcomes: [],
          action_if_not_met: [],
          responsibility_override_confirmed: false,
          pharmacist_confirmed: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/confirmed follow-up missing/i);
  });

  it('flags duplicate canonical brand/generic treatment selections', () => {
    const result = validateDapNote(
      {
        data: 'Assessed for a cold sore.',
        assessment: 'Cold sores.',
        plan:
          '**ABREVA:** Apply topically.\n\n**Docosanol 10% cream:** Apply topically.\n\nPharmacist follow-up planned in 7 days to assess lesion improvement.',
      },
      payload({
        selected_treatments: [
          {
            display_name: 'ABREVA',
            patient_directions: 'Apply 1 application topically 5 times a day for 10 days.',
            ingredient_id: 'docosanol',
          },
          {
            display_name: 'Docosanol 10% cream',
            patient_directions: 'Apply 1 application topically 5 times a day for 10 days.',
            ingredient_id: 'docosanol',
          },
        ],
        follow_up_plan: {
          responsible_party: 'Pharmacist',
          timeframe: '7 days',
          effectiveness_parameters: ['lesion improvement'],
          safety_parameters: [],
          adherence_parameters: [],
          expected_outcomes: [],
          action_if_not_met: [],
          responsibility_override_confirmed: false,
          pharmacist_confirmed: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/duplicate canonical treatment/i);
  });
});
