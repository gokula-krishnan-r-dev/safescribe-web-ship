import {
  COUNSELLING_CARD_KEYS,
  asMedicationUseBullet,
  composeCounsellingSections,
  fallbackMedicationUse,
  humanizeMedicationDirections,
  mergeApprovedCounselling,
  toSelectedTreatmentPayload,
  validateCounsellingOutput,
  type CounsellingLlmPayload,
} from '@safescript/shared';
import { buildCounsellingLlmPayload } from './counselling-payload.builder';

function payload(
  overrides: Partial<CounsellingLlmPayload> = {},
): CounsellingLlmPayload {
  return {
    patient_context: {
      confirmed_assessment: 'Uncomplicated cystitis',
      age_years: 34,
      relevant_allergies: [],
      relevant_conditions: [],
      relevant_medications: [],
      relevant_labs: [],
      confirmed_red_flags: [],
      confirmed_follow_up: [],
    },
    selected_treatments: [
      {
        treatment_id: 't1',
        display_name: 'Nitrofurantoin',
        dose: '100 mg',
        route: 'oral',
        frequency: 'twice daily',
        duration: '5 days',
        directions: 'Take Nitrofurantoin 100 mg by mouth twice daily for 5 days.',
      },
    ],
    approved_counselling: {
      medication_use: [],
      expected_response: [],
      self_care: [],
      follow_up: [],
      safety_net: [],
    },
    ...overrides,
  };
}

describe('counselling payload contract', () => {
  it('merges approved pathway and treatment counselling into the five buckets', () => {
    const merged = mergeApprovedCounselling({
      conditionRows: [
        { category: 'expected_response', point: 'Symptoms usually settle in 48 hours.' },
        { category: 'self_care', point: 'Drink extra water.' },
        { category: 'other', point: 'Ignore this unmatched bucket.' },
      ],
      treatmentRows: [{ category: 'medication_use', text: 'Swallow the capsule whole.' }],
      followups: [
        { action: 'Return if fever develops', condition: 'fever', timeframe: '24 hours', urgency: 'urgent' },
      ],
    });

    expect(merged.medication_use).toEqual(['Swallow the capsule whole.']);
    expect(merged.expected_response).toEqual(['Symptoms usually settle in 48 hours.']);
    expect(merged.self_care).toEqual(['Drink extra water.']);
    expect(merged.safety_net[0]).toContain('Return if fever develops');
    expect(merged.follow_up).toEqual([]);
  });

  it('keeps Patient Guidance outputSection on cards 2–4 even if the wording mentions take/apply', () => {
    const merged = mergeApprovedCounselling({
      conditionRows: [
        {
          outputSection: 'what_to_expect',
          category: 'What to expect',
          point: 'Take time to rest while the lesion settles over several days.',
        },
        {
          outputSection: 'self_care',
          category: 'Non-drug advice',
          point: 'Keep the area clean and dry.',
        },
        {
          outputSection: 'follow_up',
          category: 'Follow-up',
          point: 'Return if symptoms are not improving.',
        },
      ],
    });

    expect(merged.expected_response.join(' ')).toMatch(/lesion settles/i);
    expect(merged.self_care).toEqual(['Keep the area clean and dry.']);
    expect(merged.follow_up).toEqual(['Return if symptoms are not improving.']);
    expect(merged.medication_use).toEqual([]);
  });

  it('routes typical pathway education categories into all four counselling cards', () => {
    const merged = mergeApprovedCounselling({
      conditionRows: [
        { category: 'Medication counselling', point: 'Take the full course as directed.' },
        {
          category: 'Medication counselling',
          point: 'Symptoms usually settle within 48 hours of starting treatment.',
        },
        { category: 'Non-drug advice', point: 'Keep the area clean and dry.' },
        { category: 'Prevention', point: 'Avoid sharing towels or lip products.' },
        { category: 'Follow-up', point: 'Return if symptoms are not improving.' },
        {
          category: 'When to seek urgent care',
          point: 'Seek care if lesions spread toward the eye.',
        },
        { category: 'Handouts', point: 'Wash hands after touching the affected area.' },
      ],
    });

    expect(merged.medication_use.join(' ')).toMatch(/full course/i);
    expect(merged.expected_response.join(' ')).toMatch(/settle within 48 hours/i);
    expect(merged.self_care.join(' ')).toMatch(/clean and dry/i);
    expect(merged.self_care.join(' ')).toMatch(/avoid sharing/i);
    expect(merged.self_care.join(' ')).toMatch(/wash hands/i);
    expect(merged.follow_up.join(' ')).toMatch(/return if symptoms/i);
    expect(merged.safety_net.join(' ')).toMatch(/toward the eye/i);
  });

  it('fills expected response from related side-effect counselling when no course text exists', () => {
    const merged = mergeApprovedCounselling({
      conditionRows: [
        { category: 'Medication counselling', point: 'Swallow the capsule whole with food.' },
        { category: 'Medication counselling', point: 'Mild nausea or headache may occur.' },
      ],
    });
    expect(merged.expected_response.join(' ')).toMatch(/nausea or headache/i);
    expect(merged.medication_use.join(' ')).toMatch(/swallow the capsule/i);
    expect(merged.medication_use.join(' ')).not.toMatch(/nausea/i);
  });

  it('keeps cards 2–4 empty when there is no approved source', () => {
    const result = validateCounsellingOutput(
      {
        sections: [
          {
            section_key: 'MEDICATION_USE',
            bullets: ['Take Nitrofurantoin 100 mg by mouth twice daily for 5 days.'],
          },
          {
            section_key: 'EXPECTED_RESPONSE',
            bullets: ['You should notice improvement within 48 to 72 hours.'],
          },
          {
            section_key: 'SELF_CARE',
            bullets: ['No additional self-care measures for this visit.'],
          },
          {
            section_key: 'FOLLOW_UP',
            bullets: ['Seek urgent care if symptoms worsen.'],
          },
        ],
      },
      payload(),
    );

    expect(result.sections.map((s) => s.section_key)).toEqual([...COUNSELLING_CARD_KEYS]);
    expect(result.sections.find((s) => s.section_key === 'EXPECTED_RESPONSE')?.bullets).toEqual([]);
    expect(result.sections.find((s) => s.section_key === 'SELF_CARE')?.bullets).toEqual([]);
    expect(result.sections.find((s) => s.section_key === 'FOLLOW_UP')?.bullets).toEqual([]);
    expect(result.droppedUnapproved.EXPECTED_RESPONSE).toBe(1);
  });

  it('replaces invalid medication counselling with exact regimen directions', () => {
    const result = validateCounsellingOutput(
      {
        sections: [
          { section_key: 'MEDICATION_USE', bullets: ['Take the antibiotic as directed.'] },
        ],
      },
      payload(),
    );

    expect(result.medicationFallbackUsed).toBe(true);
    expect(result.sections[0].bullets[0]).toContain('Nitrofurantoin');
    expect(result.sections[0].bullets[0]).toContain('100 mg');
  });

  it('keeps approved expected-response wording and drops invented extras', () => {
    const approved = payload({
      approved_counselling: {
        medication_use: [],
        expected_response: ['Bladder symptoms usually settle within 48 hours of starting treatment.'],
        self_care: [],
        follow_up: [],
        safety_net: [],
      },
    });
    const result = validateCounsellingOutput(
      {
        sections: [
          {
            section_key: 'MEDICATION_USE',
            bullets: ['Take Nitrofurantoin 100 mg by mouth twice daily for 5 days.'],
          },
          {
            section_key: 'EXPECTED_RESPONSE',
            bullets: [
              'Bladder symptoms usually settle within 48 hours of starting treatment.',
              'This antibiotic also prevents kidney stones.',
            ],
          },
        ],
      },
      approved,
    );

    const expected = result.sections.find((s) => s.section_key === 'EXPECTED_RESPONSE')?.bullets ?? [];
    expect(expected).toHaveLength(1);
    expect(expected[0]).toMatch(/bladder symptoms usually settle/i);
  });

  it('maps selected treatments and approved rows into the LLM payload', () => {
    const built = buildCounsellingLlmPayload({
      assessment: 'Uncomplicated cystitis',
      demographics: { age: 34, ageUnit: 'years', allergies: 'NKDA' },
      redFlags: { hasRedFlags: false },
      selectedTreatments: [
        {
          genericName: 'Nitrofurantoin',
          dose: '100 mg',
          route: 'oral',
          frequency: 'twice daily',
          duration: '5 days',
          counsellingNotes: 'Swallow whole with food.',
          followUpAdvice: 'Call the pharmacy if fever starts.',
        },
      ],
      conditionRows: [
        { category: 'self_care', point: 'Drink extra water.', approved: true },
        { category: 'self_care', point: 'Unapproved rest advice.', approved: false },
      ],
      followups: [
        {
          action: 'Reassess if not improving',
          condition: 'ongoing dysuria',
          timeframe: '48 hours',
          urgency: 'ROUTINE',
        },
      ],
    });

    expect(built.selected_treatments[0].display_name).toBe('Nitrofurantoin');
    expect(built.approved_counselling.medication_use).toContain('Swallow whole with food.');
    expect(built.approved_counselling.self_care).toEqual(['Drink extra water.']);
    expect(built.approved_counselling.follow_up.join(' ')).toContain(
      'Call the pharmacy if fever starts.',
    );
    expect(built.approved_counselling.follow_up.join(' ')).toContain(
      'Reassess if not improving',
    );
    expect(toSelectedTreatmentPayload({ genericName: '' }, 0)).toBeNull();
    expect(fallbackMedicationUse(built.selected_treatments)[0]).toContain('Nitrofurantoin');
  });

  it('includes authored draft Patient Guidance when no approved rows exist', () => {
    const built = buildCounsellingLlmPayload({
      assessment: 'Cold sore',
      demographics: { age: 25, ageUnit: 'years' },
      redFlags: { hasRedFlags: false },
      selectedTreatments: [
        {
          genericName: 'famciclovir',
          dose: '1500 mg',
          route: 'oral',
          frequency: 'once',
          duration: '1 day',
        },
      ],
      conditionRows: [
        {
          category: 'What to expect',
          point: 'Start antiviral treatment as soon as possible after the first prodromal symptoms.',
          detail: 'Treatment is ideally started within 1 to 2 hours.',
          outputSection: 'what_to_expect',
          approved: false,
        },
        {
          category: 'Non-drug advice',
          point: 'Keep the area clean and dry and avoid sharing towels or lip products.',
          outputSection: 'self_care',
          approved: false,
        },
        {
          category: 'Follow-up',
          point: 'No.',
          outputSection: 'follow_up',
          approved: false,
        },
      ],
    });

    expect(built.approved_counselling.expected_response.join(' ')).toMatch(/ideally started within 1 to 2 hours/i);
    expect(built.approved_counselling.self_care.join(' ')).toMatch(/clean and dry/i);
    expect(built.approved_counselling.follow_up).toEqual([]);
  });

  it('composes card 1 from the regimen and cards 2–4 from Patient Guidance', () => {
    const composed = composeCounsellingSections({
      conditionName: 'Cold sore',
      treatments: [
        {
          displayName: 'Acyclovir',
          dose: '400 mg',
          route: 'oral',
          frequency: 'five times daily',
          duration: '5 days',
        },
      ],
      pathwayRows: [
        {
          outputSection: 'what_to_expect',
          category: 'What to expect',
          point: 'Lesions usually crust over several days.',
        },
        {
          outputSection: 'self_care',
          category: 'Non-drug advice',
          point: 'Keep the area clean and dry.',
        },
        {
          outputSection: 'follow_up',
          category: 'Follow-up',
          point: 'Seek care if lesions spread toward the eye.',
        },
      ],
    });

    expect(composed.howToUse.join(' ')).toMatch(/Acyclovir/i);
    expect(composed.whatToExpect[0]).toMatch(/crust/i);
    expect(composed.selfCare[0]).toMatch(/clean and dry/i);
    expect(composed.followUp[0]).toMatch(/toward the eye/i);
  });

  it('fills empty LLM cards from related approved sources instead of leaving them blank', () => {
    const result = validateCounsellingOutput(
      {
        sections: [
          {
            section_key: 'MEDICATION_USE',
            bullets: ['Take Nitrofurantoin 100 mg by mouth twice daily for 5 days.'],
          },
        ],
      },
      payload({
        approved_counselling: {
          medication_use: [],
          expected_response: [
            'Bladder symptoms usually settle within 48 hours of starting treatment.',
          ],
          self_care: ['Drink extra water.'],
          follow_up: ['Return if symptoms are not improving.'],
          safety_net: ['Seek care if fever develops.'],
        },
      }),
    );

    expect(result.sections.find((s) => s.section_key === 'EXPECTED_RESPONSE')?.bullets[0]).toMatch(
      /settle/i,
    );
    expect(result.sections.find((s) => s.section_key === 'SELF_CARE')?.bullets[0]).toMatch(/water/i);
    expect(result.sections.find((s) => s.section_key === 'FOLLOW_UP')?.bullets.join(' ')).toMatch(
      /fever|return/i,
    );
  });

  it('composes all four cards from pathway education categories', () => {
    const composed = composeCounsellingSections({
      conditionName: 'Cold sores',
      treatments: [
        {
          displayName: 'valacyclovir',
          dose: '2 g',
          route: 'oral',
          frequency: 'twice daily',
          duration: '1 day',
        },
      ],
      pathwayRows: [
        {
          category: 'Medication counselling',
          point: 'Symptoms usually settle over the expected course of the episode.',
        },
        { category: 'Non-drug advice', point: 'Avoid touching or picking the sore.' },
        { category: 'Follow-up', point: 'Seek reassessment if symptoms worsen.' },
      ],
    });

    expect(composed.howToUse[0]).toMatch(/valacyclovir/i);
    expect(composed.whatToExpect[0]).toMatch(/settle/i);
    expect(composed.selfCare[0]).toMatch(/avoid touching/i);
    expect(composed.followUp[0]).toMatch(/worsen/i);
  });

  it('keeps empty Patient Guidance cards empty instead of inventing advice', () => {
    const composed = composeCounsellingSections({
      conditionName: 'Cold sores (oral herpes labialis)',
      treatments: [
        {
          displayName: 'valacyclovir',
          dose: '2 g',
          route: 'oral',
          frequency: 'twice daily',
          duration: '1 day',
        },
      ],
      pathwayRows: [
        { category: 'Non-drug advice', point: 'Keep the area clean with mild soap and water.' },
        {
          category: 'Follow-up',
          point: 'Return for reassessment if lesions are not settling.',
        },
      ],
    });

    expect(composed.howToUse[0]).toMatch(/valacyclovir/i);
    expect(composed.whatToExpect).toEqual([]);
    expect(composed.selfCare[0]).toMatch(/keep the area clean/i);
    expect(composed.followUp[0]).toMatch(/reassessment/i);
  });

  it('does not invent self-care or follow-up when those pathway buckets are empty', () => {
    const composed = composeCounsellingSections({
      conditionName: 'Uncomplicated cystitis',
      treatments: [
        {
          displayName: 'Nitrofurantoin',
          dose: '100 mg',
          route: 'oral',
          frequency: 'twice daily',
          duration: '5 days',
        },
      ],
      pathwayRows: [],
    });

    expect(composed.howToUse[0]).toMatch(/Nitrofurantoin/i);
    expect(composed.whatToExpect).toEqual([]);
    expect(composed.selfCare).toEqual([]);
    expect(composed.followUp).toEqual([]);
  });

  it('humanizes inventory SIG fragments into patient-facing how-to-use lines', () => {
    expect(
      humanizeMedicationDirections(
        'Take naproxen: 1 Tablet(s) by Oral route Twice daily {BID} for 7 days.',
      ),
    ).toBe('Take naproxen 1 tablet by mouth twice daily for 7 days.');
    expect(
      humanizeMedicationDirections(
        'Take colchicine: 2 Tablet(s) by Oral route Once daily for 1 day.',
      ),
    ).toBe('Take colchicine 2 tablets by mouth once daily for 1 day.');
    expect(
      asMedicationUseBullet('Swallow the capsule whole with food.'),
    ).toBe('Swallow the capsule whole with food.');

    const gout = payload({
      selected_treatments: [
        {
          treatment_id: 'nap',
          display_name: 'naproxen',
          dose: '1 Tablet(s)',
          route: 'Oral',
          frequency: 'Twice daily {BID}',
          duration: '7 days',
          directions:
            'Take naproxen: 1 Tablet(s) by Oral route Twice daily {BID} for 7 days.',
        },
        {
          treatment_id: 'col',
          display_name: 'colchicine',
          dose: '2 Tablet(s)',
          route: 'Oral',
          frequency: 'Once daily',
          duration: '1 day',
          directions:
            'Take colchicine: 2 Tablet(s) by Oral route Once daily for 1 day.',
        },
      ],
    });

    const fallback = fallbackMedicationUse(gout.selected_treatments);
    expect(fallback.join(' ')).not.toMatch(/Tablet\(s\)|Oral route|\{BID\}|Directions:/i);
    expect(fallback[0]).toMatch(/naproxen 1 tablet by mouth twice daily for 7 days/i);
    expect(fallback[1]).toMatch(/colchicine 2 tablets by mouth once daily for 1 day/i);

    const result = validateCounsellingOutput(
      {
        sections: [
          {
            section_key: 'MEDICATION_USE',
            bullets: [
              'Take naproxen: 1 Tablet(s) by Oral route Twice daily {BID} for 7 days.',
              'Directions: 1 tablet(s) oral twice daily Usually 3-5 days for an uncomplicated flare; reduce or discontinue once clear clinical improvement occurs.',
              'Take colchicine: 2 Tablet(s) by Oral route Once daily for 1 day.',
            ],
          },
        ],
      },
      gout,
    );

    const med = result.sections.find((s) => s.section_key === 'MEDICATION_USE')?.bullets ?? [];
    expect(med.join(' ')).not.toMatch(/Tablet\(s\)|Oral route|\{BID\}|^Directions:/i);
    expect(med.some((b) => /naproxen/i.test(b))).toBe(true);
    expect(med.some((b) => /colchicine/i.test(b))).toBe(true);
    expect(med.some((b) => /^Take 1 tablet by mouth/i.test(b))).toBe(false);

    const composed = composeCounsellingSections({
      conditionName: 'Gout flare',
      treatments: [
        {
          displayName: 'naproxen',
          dose: '1 Tablet(s)',
          route: 'Oral',
          frequency: 'Twice daily {BID}',
          duration: '7 days',
          instructions:
            'Take naproxen: 1 Tablet(s) by Oral route Twice daily {BID} for 7 days.',
        },
        {
          displayName: 'colchicine',
          dose: '2 Tablet(s)',
          route: 'Oral',
          frequency: 'Once daily',
          duration: '1 day',
          patientDirections:
            'Take colchicine: 2 Tablet(s) by Oral route Once daily for 1 day.',
        },
      ],
      pathwayRows: [],
    });
    expect(composed.howToUse.join(' ')).not.toMatch(/Tablet\(s\)|Oral route|\{BID\}/i);
    expect(composed.howToUse[0]).toMatch(/naproxen/i);
    expect(composed.howToUse[1]).toMatch(/colchicine/i);
  });

  it('keeps every selected treatment and does not split patient directions into 3 bullets', () => {
    const directions =
      'Take 1 tablet by mouth at onset of migraine. If the migraine returns after an initial response, may repeat 1 tablet after at least 2 hours. Maximum 2 tablets (25 mg) in 24 hours.';
    const composed = composeCounsellingSections({
      conditionName: 'Migraine',
      treatments: [
        {
          displayName: 'ALMOTRIPTAN 12.5 MG',
          patientDirections: directions,
        },
        {
          displayName: 'naproxen',
          dose: '1 tablet',
          route: 'oral',
          frequency: 'twice daily',
          duration: '5 days',
        },
        {
          displayName: 'colchicine',
          patientDirections: 'Take 2 tablets by mouth once daily for 1 day.',
        },
        {
          displayName: 'Amoxicillin',
          patientDirections:
            'Take 1 capsule by mouth three times daily for 7 days.',
        },
      ],
      pathwayRows: [],
    });

    expect(composed.howToUse).toHaveLength(4);
    expect(composed.howToUse[0]).toMatch(/ALMOTRIPTAN 12.5 MG/i);
    expect(composed.howToUse[0]).toMatch(/onset of migraine/i);
    expect(composed.howToUse[0]).toMatch(/Maximum 2 tablets/i);
    expect(composed.howToUse[0]).not.toMatch(/\n/);
    expect(composed.howToUse[3]).toMatch(/Amoxicillin/i);
  });
});
