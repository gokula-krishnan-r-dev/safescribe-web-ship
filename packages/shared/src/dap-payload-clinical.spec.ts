import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDapFollowUpPlan,
  buildDapObjectiveData,
  buildDapPatientSpecificSafety,
  containsPlannedFollowUpLanguage,
  ensureFollowUpInPlan,
  isGenericNegativeSafetySummary,
  stripCounsellingLeakageFromPlan,
  stripGenericSafetySentences,
} from './dap-payload-clinical';

describe('DAP clinical payload filters', () => {
  it('keeps impaired eGFR only when it is clinically relevant', () => {
    const objective = buildDapObjectiveData({
      demographics: {
        extractedLabValues: [{ test: 'eGFR', value: '22', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            renalAdjustmentRequired: true,
            renalAdjustmentReason: 'Dose reduction is recommended in severe renal impairment.',
          },
        ],
      },
    });
    assert.deepEqual(objective, [
      { type: 'eGFR', value: 22, unit: 'mL/min', clinically_relevant: true },
    ]);
    const safety = buildDapPatientSpecificSafety({
      demographics: {
        extractedLabValues: [{ test: 'eGFR', value: '22', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [
          {
            genericName: 'valacyclovir',
            renalAdjustmentRequired: true,
            renalAdjustmentReason: 'Dose reduction is recommended in severe renal impairment.',
          },
        ],
      },
      objectiveData: objective,
    });
    assert.equal(safety[0]?.documentation_summary.includes('Renal function'), true);
    assert.equal(/Dose reduction is recommended/.test(JSON.stringify(safety)), false);
  });

  it('omits a normal eGFR that did not affect treatment', () => {
    const objective = buildDapObjectiveData({
      demographics: {
        extractedLabValues: [{ test: 'eGFR', value: '95', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [{ genericName: 'valacyclovir' }],
      },
    });
    assert.deepEqual(objective, []);
  });

  it('omits an impaired eGFR until a treatment implication is confirmed', () => {
    const input = {
      demographics: {
        extractedLabValues: [{ test: 'eGFR', value: '22', unit: 'mL/min' }],
      },
      treatmentPlan: {
        selectedItemsSnapshot: [{ genericName: 'valacyclovir' }],
      },
    };
    assert.deepEqual(buildDapObjectiveData(input), []);
    assert.deepEqual(buildDapPatientSpecificSafety(input), []);
  });

  it('strips generic empty-safety sentences', () => {
    assert.equal(
      isGenericNegativeSafetySummary(
        'No clinically significant patient-specific treatment-safety findings were identified in the confirmed review.',
      ),
      true,
    );
    const stripped = stripGenericSafetySentences(
      'Presentation was consistent with cold sores. No clinically significant patient-specific treatment-safety findings were identified in the confirmed review.',
    );
    assert.match(stripped, /cold sores/i);
    assert.doesNotMatch(stripped, /no clinically significant/i);
  });

  it('builds follow-up from monitoring instructions, not healing or self-care', () => {
    const { plan, incomplete } = buildDapFollowUpPlan({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingConfirmed: true,
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
    assert.equal(incomplete, false);
    assert.equal(plan?.responsible_party, 'Pharmacist');
    assert.equal(plan?.timeframe, '7 days');
    assert.equal(plan?.pharmacist_confirmed, true);
    assert.match(plan?.effectiveness_parameters.join(' ') ?? '', /lesion improvement/i);
    assert.doesNotMatch(JSON.stringify(plan), /heal in 7|avoid kissing|wash hands/i);
  });

  it('keeps Plan documentation narrative that mentions self-care', () => {
    const narrative =
      'Medication use, expected response, supportive self-care and infection-control measures were reviewed. Safety-net advice was provided regarding ocular symptoms. Pharmacist follow-up planned in 7 days to assess lesion improvement.';
    const kept = stripCounsellingLeakageFromPlan(narrative);
    assert.match(kept, /self-care/);
    assert.match(kept, /Safety-net advice/);
    assert.match(kept, /follow-up planned/i);
    assert.equal(
      stripCounsellingLeakageFromPlan('Most outbreaks heal in 7–14 days.'),
      '',
    );
    assert.equal(stripCounsellingLeakageFromPlan('Avoid kissing.'), '');
  });

  it('does not treat safety-net "follow up if" as planned follow-up', () => {
    const safetyNet =
      'Patient was advised to follow up if symptoms worsen or the lesion does not heal.';
    assert.equal(containsPlannedFollowUpLanguage(safetyNet), false);
    const withPlanned = ensureFollowUpInPlan(
      safetyNet,
      'Pharmacist follow-up planned in 7 days to assess lesion improvement and treatment tolerability; referral advised if symptoms are not resolving.',
    );
    assert.match(withPlanned, /Pharmacist follow-up planned in 7 days/i);
    assert.match(withPlanned, /follow up if symptoms worsen/i);
  });

  it('does not mark incomplete follow-up as pharmacist_confirmed', () => {
    const { plan, incomplete } = buildDapFollowUpPlan({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingConfirmed: true,
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: {
          status: 'REVIEWED',
          sections: [
            {
              section_key: 'FOLLOW_UP',
              items: [{ text: 'Follow up in 7 days.' }],
            },
          ],
        },
      },
    });
    assert.equal(incomplete, true);
    assert.equal(plan?.pharmacist_confirmed, false);
  });

  it('captures treatment tolerability as a safety monitoring parameter', () => {
    const { plan, incomplete } = buildDapFollowUpPlan({
      consultationMode: 'GUIDED_PATHWAY',
      counsellingConfirmed: true,
      counsellingNotes: {
        counselling_status: 'confirmed',
        plan: {
          status: 'REVIEWED',
          sections: [
            {
              section_key: 'FOLLOW_UP',
              items: [
                {
                  text: 'Pharmacist follow-up in 7 days to assess lesion improvement/resolution and treatment tolerability; refer if symptoms are not resolving.',
                },
              ],
            },
          ],
        },
      },
    });
    assert.equal(incomplete, false);
    assert.equal(plan?.pharmacist_confirmed, true);
    assert.equal(plan?.timeframe, '7 days');
    assert.match(plan?.effectiveness_parameters.join(' ') ?? '', /lesion improvement/i);
    assert.match(plan?.safety_parameters.join(' ') ?? '', /tolerability/i);
  });
});
