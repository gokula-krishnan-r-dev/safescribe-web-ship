import {
  buildPatientSummaryPayload,
  coercePatientHandoutLlmOutput,
  englishHandoutFieldsFromPayload,
  patientHandoutGenerationAllowed,
  mergeMedicationUseIntoTreatment,
  renderPatientSummaryTreatmentLines,
  repairPatientCareSummaryFields,
  splitFollowUpForHandout,
  validatePatientCareSummary,
} from '@safescript/shared';
import { buildPatientSummaryPayloadFromConsultation } from './patient-summary-payload.builder';

const source = {
  chiefComplaint: 'cold sore symptoms',
  createdAt: '2026-08-13T15:00:00.000Z',
  consultationMode: 'GUIDED_PATHWAY',
  pathway: { condition: 'cold sores (oral herpes labialis)', name: 'Cold sores' },
  selectedLanguage: 'en',
  pharmacyName: 'Example Pharmacy',
  pharmacyPhone: '780-000-0000',
  treatmentPlan: {
    confirmStatus: 'CONFIRMED',
    confirmation: {
      confirmationId: 'c1',
      confirmedAt: '2026-08-13T15:00:00.000Z',
      planVersion: 1,
      planHash: 'tp_abc',
      selectedIndexes: [0, 1],
      selectedNames: ['valacyclovir', 'acyclovir 5% topical'],
    },
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
        patientDirections:
          'Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
      },
    ],
  },
  counsellingNotes: {
    counselling_status: 'confirmed',
    plan: {
      status: 'REVIEWED',
      include_detailed_handout: true,
      sections: [
        {
          section_key: 'EXPECTED_RESPONSE',
          items: [
            {
              text: 'Symptoms should gradually improve over the expected course of the episode.',
            },
          ],
        },
        {
          section_key: 'SELF_CARE',
          items: [
            { text: 'Avoid touching or picking the sore.' },
            { text: 'Wash your hands after touching the affected area.' },
          ],
        },
        {
          section_key: 'FOLLOW_UP',
          items: [
            {
              text: 'Seek reassessment if symptoms worsen or do not improve as expected.',
            },
            { text: 'Return in 48 hours if you are concerned.' },
          ],
        },
      ],
    },
  },
};

describe('Patient Care Summary payload and treatment rendering', () => {
  it('renders exact display_name: patient_directions without brand expansion', () => {
    const payload = buildPatientSummaryPayload(source);
    expect(payload.selected_treatments.map((t) => t.display_name)).toEqual([
      'valacyclovir',
      'acyclovir 5% topical',
    ]);
    const treatment = renderPatientSummaryTreatmentLines(payload.selected_treatments);
    expect(treatment).toContain('valacyclovir: Take 2 g by mouth twice daily for 1 day.');
    expect(treatment).toContain(
      'acyclovir 5% topical: Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
    );
    expect(treatment).not.toMatch(/Valtrex|generics|®|Zovirax|as directed|BID/i);
  });

  it('uses only pharmacist-confirmed counselling and splits urgent vs routine follow-up', () => {
    const payload = buildPatientSummaryPayload(source);
    expect(payload.confirmed_counselling.EXPECTED_RESPONSE).toHaveLength(1);
    expect(payload.confirmed_counselling.SELF_CARE).toHaveLength(2);
    const split = splitFollowUpForHandout(payload.confirmed_counselling.FOLLOW_UP);
    expect(split.seekCare.some((p) => /worsen/i.test(p))).toBe(true);
    expect(split.followUp.some((p) => /48 hours/i.test(p))).toBe(true);
  });

  it('keeps confirmed treatment lines and adds unused medication-use counselling', () => {
    const payload = buildPatientSummaryPayload(source);
    const treatment = renderPatientSummaryTreatmentLines(payload.selected_treatments);
    const merged = mergeMedicationUseIntoTreatment(treatment, [
      'Take 2 g by mouth twice daily for 1 day.',
      'Wash your hands after applying the cream.',
    ]);
    expect(merged).toContain('valacyclovir: Take 2 g by mouth twice daily for 1 day.');
    expect(merged).toContain('Wash your hands after applying the cream.');
    expect(merged.match(/Take 2 g by mouth twice daily for 1 day/g)).toHaveLength(1);
  });

  it('does not invent counselling when the pharmacist has not confirmed it', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      counsellingNotes: { counselling_status: 'draft' },
    });
    expect(payload.status).toBe('awaiting_counselling_confirmation');
    expect(payload.confirmed_counselling.SELF_CARE).toEqual([]);
    expect(payload.confirmed_counselling.FOLLOW_UP).toEqual([]);
  });

  it('omits counselling when include_detailed_handout is false', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      counsellingNotes: {
        ...source.counsellingNotes,
        plan: {
          ...source.counsellingNotes.plan,
          include_detailed_handout: false,
        },
      },
    });
    expect(payload.status).toBe('not_requested');
    expect(payload.confirmed_counselling.EXPECTED_RESPONSE).toEqual([]);
  });

  it('replaces invented brand Treatment and drops unsupported counselling', () => {
    const payload = buildPatientSummaryPayload(source);
    const broken = {
      treatment:
        'Valtrex®, generics (valacyclovir) — 2 g, Oral, Twice daily (BID), for As directed.',
      expectedResponse: 'Most cold sores heal in 7–10 days without treatment.',
      selfCare: 'Drink plenty of fluids and rest.',
      seekCare: 'Go to emergency if you have a fever.',
      followUp: 'Follow up in 2 weeks.',
    };
    const failed = validatePatientCareSummary(broken, payload);
    expect(failed.ok).toBe(false);
    expect(failed.medicationFailed).toBe(true);
    expect(failed.counsellingFailed).toBe(true);

    const repaired = repairPatientCareSummaryFields(broken, payload);
    expect(repaired.fields.treatment).toContain('valacyclovir: Take 2 g by mouth twice daily');
    expect(repaired.fields.treatment).not.toMatch(/Valtrex|generics|BID|as directed/i);
    expect(repaired.fields.expectedResponse).toBe(
      payload.confirmed_counselling.EXPECTED_RESPONSE[0],
    );
    expect(repaired.fields.selfCare).not.toMatch(/fluids|rest/i);
    expect(repaired.fields.seekCare).not.toMatch(/emergency|fever/i);
  });

  it('coerces LLM array output onto stored handout fields', () => {
    const fields = coercePatientHandoutLlmOutput({
      title: 'Cold sores (oral herpes labialis) — Your Care Plan',
      assessment: ['Your symptoms are consistent with cold sores (oral herpes labialis).'],
      treatment: [],
      expected_response: [
        'Symptoms should gradually improve over the expected course of the episode.',
      ],
      self_care: ['Avoid touching or picking the sore.'],
      seek_care: [],
      follow_up: ['Return in 48 hours if you are concerned.'],
      questions_contact: ['Contact Example Pharmacy at 780-000-0000.'],
    });
    expect(fields.documentTitle).toMatch(/Your Care Plan/);
    expect(fields.assessment).toMatch(/cold sores/i);
    expect(fields.selfCare).toBe('Avoid touching or picking the sore.');
    expect(fields.treatment).toBe('');
  });

  it('puts pharmacy phone and address on the Questions contact line', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      pharmacyAddress: '123 Main Street, Edmonton, AB',
    });
    expect(payload.pharmacy_details).toEqual({
      name: 'Example Pharmacy',
      phone: '780-000-0000',
      address: '123 Main Street, Edmonton, AB',
    });
    expect(englishHandoutFieldsFromPayload(payload, 'en').questionsContact).toBe(
      'Call us at:\nTel: 780-000 0000\nExample Pharmacy, 123 Main Street, Edmonton, AB',
    );
  });

  it('formats raw pharmacy digits as Tel: XXX-XXX XXXX', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      pharmacyPhone: '7802223333',
      pharmacyAddress: '123 Main Street, Edmonton T1A 1A1',
    });
    expect(englishHandoutFieldsFromPayload(payload, 'en').questionsContact).toBe(
      'Call us at:\nTel: 780-222 3333\nExample Pharmacy, 123 Main Street, Edmonton T1A 1A1',
    );
  });

  it('does not allow final generation until counselling is confirmed', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      counsellingNotes: { counselling_status: 'draft' },
    });
    expect(patientHandoutGenerationAllowed(payload)).toBe(false);
  });

  it('maps a consultation record through the dedicated server builder', () => {
    const payload = buildPatientSummaryPayloadFromConsultation(
      {
        chiefComplaint: 'cold sore symptoms',
        consultationMode: 'CLINICAL_JUDGMENT',
        treatmentPlan: source.treatmentPlan,
        counsellingNotes: source.counsellingNotes,
      },
      {
        clinicalJudgmentAssessment: {
          workingDiagnosisText: 'cold sores (oral herpes labialis)',
        },
        pharmacyName: 'Example Pharmacy',
        pharmacyPhone: '780-000-0000',
      },
    );
    expect(payload.confirmed_assessment.display_name).toMatch(/cold sores/i);
    expect(payload.selected_treatments).toHaveLength(2);
    expect(payload.pharmacy_details.name).toBe('Example Pharmacy');
    expect(patientHandoutGenerationAllowed(payload)).toBe(true);
  });

  it('removes a reconstructed SIG from MEDICATION_USE and keeps the canonical treatment once', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      treatmentPlan: {
        selectedTreatments: [
          {
            displayName: 'ALMOTRIPTAN',
            patientDirections:
              'Take 1 tablet by mouth at onset of migraine. If the migraine returns after an initial response, may repeat 1 tablet after at least 2 hours. Maximum 2 tablets (25 mg) in 24 hours.',
          },
        ],
      },
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: {
          status: 'REVIEWED',
          include_detailed_handout: true,
          sections: [
            {
              section_key: 'MEDICATION_USE',
              items: [
                {
                  text: 'Take almotriptan (almotriptan malate) 1 Tablet(s) by Oral route Once daily for 1 days.',
                },
              ],
            },
            {
              section_key: 'EXPECTED_RESPONSE',
              items: [
                {
                  text: 'The degree and timing of relief may vary between individuals and attacks.',
                },
              ],
            },
          ],
        },
      },
    });
    expect(payload.confirmed_counselling.MEDICATION_USE).toEqual([]);
    const treatment = renderPatientSummaryTreatmentLines(payload.selected_treatments);
    expect((treatment.match(/ALMOTRIPTAN/g) ?? []).length).toBe(1);
    expect(treatment).not.toMatch(/Tablet\(s\)|Oral route/i);
    expect(payload.confirmed_counselling.EXPECTED_RESPONSE.join(' ')).toMatch(/degree and timing of relief/i);
    expect(payload.confirmed_counselling.EXPECTED_RESPONSE.join(' ')).not.toMatch(/light sensitivity|nausea/i);
  });

  it('restores a cold pack instruction when the model used an ambiguous pronoun', () => {
    const payload = buildPatientSummaryPayload({
      ...source,
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: {
          status: 'REVIEWED',
          include_detailed_handout: true,
          sections: [
            {
              section_key: 'SELF_CARE',
              items: [
                {
                  text: 'Apply a cold pack to the forehead or back of the neck for comfort.',
                },
              ],
            },
          ],
        },
      },
    });
    const repaired = repairPatientCareSummaryFields(
      {
        selfCare: 'Apply it to the forehead or back of the neck for comfort.',
      },
      payload,
    );
    expect(repaired.fields.selfCare).toMatch(/cold pack/i);
    expect(repaired.fields.selfCare).not.toMatch(/Apply it /i);
  });
});
