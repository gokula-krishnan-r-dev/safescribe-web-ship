import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Consultation } from './types';
import {
  approvedPathwayGuidanceBySection,
  canContinueFromCounselling,
  generateCounsellingPlan,
  mapAiCounsellingToPlan,
  overlayApprovedPathwayGuidance,
  parsePathwayCounsellingRows,
  type CounsellingPlan,
} from './counselling-panel-model';
import type { TreatmentRecommendation } from './types';

function consultationWithGuidance(
  counsellings: Array<Record<string, unknown>>,
): Consultation {
  return {
    id: 'consult-1',
    selectedPathwayId: 'pathway-gout',
    pathway: {
      id: 'pathway-gout',
      name: 'Gout flare',
      condition: 'Gout flare',
      counsellings,
    },
  } as Consultation;
}

const goutExpect = [
  {
    id: 'g1',
    point: 'Gout flares can cause sudden, intense joint pain, swelling, warmth, and redness.',
    detail: 'symptoms are caused by inflammation around urate crystals in the joint',
    outputSection: 'what_to_expect',
    approved: true,
    displayOrder: 1,
    priority: 'alternative',
  },
  {
    id: 'g2',
    point: 'Symptoms should gradually improve once the flare is treated.',
    detail: null,
    outputSection: 'what_to_expect',
    approved: true,
    displayOrder: 2,
  },
  {
    id: 'g3',
    point: 'The affected joint may remain sensitive even as the flare improves.',
    outputSection: 'what_to_expect',
    approved: true,
    displayOrder: 3,
  },
  {
    id: 'g4',
    point: 'Having one gout flare increases the chance of future attacks.',
    outputSection: 'what_to_expect',
    approved: true,
    displayOrder: 4,
  },
  {
    id: 'g5',
    point: 'Long-term prevention is different from treating the current flare.',
    outputSection: 'what_to_expect',
    approved: true,
    displayOrder: 5,
  },
];

describe('approvedPathwayGuidanceBySection', () => {
  it('places every approved pathway row into the matching counselling card', () => {
    const grouped = approvedPathwayGuidanceBySection(
      consultationWithGuidance([
        ...goutExpect,
        {
          id: 'sc1',
          point: 'Avoid activities that worsen pain.',
          outputSection: 'self_care',
          approved: true,
          displayOrder: 1,
        },
        {
          id: 'fu1',
          point: 'Seek care if the joint is hot, the patient is febrile, or pain rapidly worsens.',
          outputSection: 'follow_up',
          approved: true,
          displayOrder: 1,
        },
        {
          id: 'draft',
          point: 'Draft only',
          outputSection: 'what_to_expect',
          approved: false,
          displayOrder: 99,
        },
        {
          id: 'archived',
          point: 'Archived',
          outputSection: 'self_care',
          approved: true,
          archivedAt: '2026-01-01T00:00:00.000Z',
          displayOrder: 2,
        },
      ]),
    );

    assert.equal(grouped.EXPECTED_RESPONSE.length, 5);
    assert.equal(grouped.SELF_CARE.length, 1);
    assert.equal(grouped.FOLLOW_UP.length, 1);
    assert.equal(
      grouped.EXPECTED_RESPONSE[0]?.headline,
      'Gout flares can cause sudden, intense joint pain, swelling, warmth, and redness.',
    );
    assert.match(grouped.EXPECTED_RESPONSE[0]?.detail ?? '', /urate crystals/);
    assert.equal(grouped.EXPECTED_RESPONSE[4]?.headline, goutExpect[4]?.point);
  });

  it('shows authored draft Patient Guidance when nothing is approved yet', () => {
    const grouped = approvedPathwayGuidanceBySection(
      consultationWithGuidance([
        {
          id: 'exp-draft',
          point: 'Start antiviral treatment as soon as possible after the first prodromal symptoms.',
          detail: 'Treatment is ideally started within 1 to 2 hours of prodromal symptoms.',
          outputSection: 'what_to_expect',
          approved: false,
          displayOrder: 1,
        },
        {
          id: 'sc-draft',
          point: 'Keep the area clean and dry and avoid sharing towels or lip products.',
          outputSection: 'self_care',
          approved: false,
          displayOrder: 1,
        },
        {
          id: 'fu-draft',
          point: 'Seek care if lesions spread toward the eye or you become systemically unwell.',
          outputSection: 'follow_up',
          approved: false,
          displayOrder: 1,
        },
      ]),
    );

    assert.equal(grouped.EXPECTED_RESPONSE.length, 1);
    assert.equal(grouped.SELF_CARE.length, 1);
    assert.equal(grouped.FOLLOW_UP.length, 1);
    assert.match(grouped.EXPECTED_RESPONSE[0]?.text ?? '', /prodromal/i);
  });

  it('keeps pathway displayOrder and ignores unparseable rows', () => {
    const rows = parsePathwayCounsellingRows([
      { id: 'b', point: 'Second', approved: true, displayOrder: 2, outputSection: 'self_care' },
      { id: 'a', point: 'First', approved: true, displayOrder: 1, outputSection: 'self_care' },
      { point: '   ' },
      null,
    ]);
    assert.deepEqual(
      rows.map((row) => row.id),
      ['a', 'b'],
    );
  });
});

describe('overlayApprovedPathwayGuidance', () => {
  function planWithAiFiller(): CounsellingPlan {
    return {
      consultation_id: 'consult-1',
      source_revision: 'rev-1',
      status: 'READY',
      context_factors: [],
      include_detailed_handout: true,
      generated_at: new Date().toISOString(),
      sections: [
        { section_key: 'MEDICATION_USE', title: 'How to use your medicine', items: [] },
        {
          section_key: 'EXPECTED_RESPONSE',
          title: 'What to expect',
          items: [
            {
              item_id: 'AI-1',
              text: 'Generic AI filler.',
              priority: 'RECOMMENDED',
              source_type: 'AI_GENERATED',
              editable: true,
              removable: true,
              pharmacist_modified: false,
              document_targets: ['PATIENT_HANDOUT'],
              visibility: 'SCREEN',
            },
          ],
        },
        { section_key: 'SELF_CARE', title: 'Self-care & non-drug measures', items: [] },
        { section_key: 'FOLLOW_UP', title: 'Follow-up & when to seek care', items: [] },
      ],
    };
  }

  it('replaces AI filler with the full approved pathway list', () => {
    const next = overlayApprovedPathwayGuidance(
      planWithAiFiller(),
      consultationWithGuidance(goutExpect),
    );
    const expectSection = next.sections.find((s) => s.section_key === 'EXPECTED_RESPONSE');
    assert.equal(expectSection?.items.length, 5);
    assert.equal(expectSection?.items[0]?.source_type, 'PATHWAY_COUNSELLING');
  });

  it('does not restore removed pathway items once the card already uses pathway sources', () => {
    const grouped = approvedPathwayGuidanceBySection(
      consultationWithGuidance(goutExpect),
    );
    const current = planWithAiFiller();
    current.sections = current.sections.map((section) =>
      section.section_key === 'EXPECTED_RESPONSE'
        ? { ...section, items: grouped.EXPECTED_RESPONSE.slice(0, 2) }
        : section,
    );
    const next = overlayApprovedPathwayGuidance(
      current,
      consultationWithGuidance(goutExpect),
    );
    const expectSection = next.sections.find((s) => s.section_key === 'EXPECTED_RESPONSE');
    assert.equal(expectSection?.items.length, 2);
  });
});

describe('mapAiCounsellingToPlan — how to use your medicine', () => {
  it('rewrites inventory SIG dumps into patient-facing directions', () => {
    const selected = [
      {
        genericName: 'naproxen',
        medicationName: 'naproxen',
        dose: '1 Tablet(s)',
        route: 'Oral',
        frequency: 'Twice daily {BID}',
        duration: '7 days',
        instructions:
          'Take naproxen: 1 Tablet(s) by Oral route Twice daily {BID} for 7 days.',
      },
      {
        genericName: 'colchicine',
        medicationName: 'colchicine',
        dose: '2 Tablet(s)',
        route: 'Oral',
        frequency: 'Once daily',
        duration: '1 day',
        instructions:
          'Take colchicine: 2 Tablet(s) by Oral route Once daily for 1 day.',
      },
    ] as TreatmentRecommendation[];

    const plan = mapAiCounsellingToPlan(
      consultationWithGuidance([]),
      selected,
      {
        sections: [
          {
            section_key: 'MEDICATION_USE',
            bullets: [
              'Take naproxen: 1 Tablet(s) by Oral route Twice daily {BID} for 7 days.',
              'Directions: 1 tablet(s) oral twice daily Usually 3-5 days for an uncomplicated flare.',
              'Take colchicine: 2 Tablet(s) by Oral route Once daily for 1 day.',
            ],
          },
        ],
      },
    );

    const how = plan?.sections.find((s) => s.section_key === 'MEDICATION_USE')?.items ?? [];
    const text = how.map((i) => i.text).join(' ');
    assert.match(text, /naproxen 1 tablet by mouth twice daily for 7 days/i);
    assert.match(text, /colchicine 2 tablets by mouth once daily for 1 day/i);
    assert.doesNotMatch(text, /Tablet\(s\)|Oral route|\{BID\}|Directions:/i);
    assert.equal(
      how.some((i) => /^Take 1 tablet by mouth/i.test(i.text)),
      false,
    );
  });

  it('replaces AI 3-bullet splits with one named line per selected treatment', () => {
    const selected = [
      {
        displayName: 'ALMOTRIPTAN 12.5 MG',
        genericName: 'almotriptan',
        medicationName: 'almotriptan',
        patientDirections:
          'Take 1 tablet by mouth at onset of migraine. If the migraine returns after an initial response, may repeat 1 tablet after at least 2 hours. Maximum 2 tablets (25 mg) in 24 hours.',
      },
      {
        displayName: 'Amoxicillin',
        genericName: 'amoxicillin',
        medicationName: 'amoxicillin',
        patientDirections: 'Take 1 capsule by mouth three times daily for 7 days.',
      },
    ] as TreatmentRecommendation[];

    const plan = mapAiCounsellingToPlan(
      consultationWithGuidance([]),
      selected,
      {
        sections: [
          {
            section_key: 'MEDICATION_USE',
            bullets: [
              'Take 1 tablet by mouth at onset of migraine.',
              'If the migraine returns after an initial response, may repeat 1 tablet after at least 2 hours.',
              'Maximum 2 tablets (25 mg) in 24 hours.',
            ],
          },
        ],
      },
    );

    const how = plan?.sections.find((s) => s.section_key === 'MEDICATION_USE')?.items ?? [];
    assert.equal(how.length, 2);
    assert.equal(how[0]?.headline, 'ALMOTRIPTAN 12.5 MG');
    assert.match(how[0]?.text ?? '', /onset of migraine/i);
    assert.match(how[0]?.text ?? '', /Maximum 2 tablets/i);
    assert.doesNotMatch(how[0]?.detail ?? '', /\n/);
    assert.equal(how[1]?.headline, 'Amoxicillin');
  });
});

describe('generateCounsellingPlan — how to use your medicine', () => {
  it('shows every selected treatment name with compact patient directions', () => {
    const selected = [
      {
        displayName: 'ALMOTRIPTAN 12.5 MG',
        medicationName: 'almotriptan',
        patientDirections:
          'Take 1 tablet by mouth at onset of migraine.\nIf the migraine returns after an initial response, may repeat 1 tablet after at least 2 hours.\nMaximum 2 tablets (25 mg) in 24 hours.',
      },
      {
        displayName: 'Amoxicillin',
        medicationName: 'amoxicillin',
        patientDirections: 'Take 1 capsule by mouth three times daily for 7 days.',
      },
      {
        displayName: 'Ibuprofen',
        medicationName: 'ibuprofen',
        patientDirections: 'Take 400 mg by mouth every 6 hours as needed.',
      },
      {
        displayName: 'Ondansetron',
        medicationName: 'ondansetron',
        patientDirections: 'Take 1 tablet by mouth at onset of nausea.',
      },
    ] as TreatmentRecommendation[];

    const plan = generateCounsellingPlan(consultationWithGuidance([]), selected);
    const how = plan.sections.find((s) => s.section_key === 'MEDICATION_USE')?.items ?? [];
    assert.equal(how.length, 4);
    assert.equal(how[0]?.headline, 'ALMOTRIPTAN 12.5 MG');
    assert.match(how[0]?.detail ?? '', /onset of migraine.*Maximum 2 tablets/i);
    assert.doesNotMatch(how[0]?.detail ?? '', /\n/);
    assert.equal(how.every((item) => item.visibility === 'SCREEN'), true);
  });
});

describe('canContinueFromCounselling', () => {
  function plan(status: CounsellingPlan['status']): CounsellingPlan {
    return {
      consultation_id: 'consult-1',
      source_revision: '1',
      status,
      context_factors: [],
      sections: [],
      include_detailed_handout: true,
      generated_at: '2026-09-15T00:00:00.000Z',
    };
  }

  it('allows continue from a ready draft without a separate review checkbox', () => {
    assert.equal(canContinueFromCounselling(plan('READY')).ok, true);
    assert.equal(canContinueFromCounselling(plan('PHARMACIST_MODIFIED')).ok, true);
    assert.equal(canContinueFromCounselling(plan('REVIEWED')).ok, true);
  });

  it('still blocks continue when the draft is not ready', () => {
    assert.equal(canContinueFromCounselling(null).ok, false);
    assert.equal(canContinueFromCounselling(plan('GENERATING')).ok, false);
    assert.equal(canContinueFromCounselling(plan('OUTDATED')).ok, false);
    assert.equal(canContinueFromCounselling(plan('SAFETY_BLOCKED')).ok, false);
  });
});
