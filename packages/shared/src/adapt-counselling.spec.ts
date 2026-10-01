import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAdaptCounsellingPayload,
  buildAdaptHowToUseLine,
  buildAdaptMedicationDisplayName,
  buildDeterministicAdaptCounselling,
  formatPatientFacingMedicationName,
  matchesConfirmedFollowUp,
  renderConfirmedFollowUpDeterministically,
  validateAdaptCounsellingOutput,
  type AdaptCounsellingPayload,
} from './adapt-counselling';
import type { AdaptPayload, ProposedPrescription } from './adapt';

function samplePayload(
  overrides?: Partial<AdaptCounsellingPayload>,
): AdaptCounsellingPayload {
  return {
    module: 'adapt',
    medication: {
      display_name: 'Pravastatin',
      ingredient: 'pravastatin',
      dosage_form: 'tablet',
      route: 'oral',
    },
    adapted_prescription: {
      patient_directions: 'Take 1 tablet by mouth once daily for 30 days.',
    },
    indication: {
      display_name: 'Hyperlipidemia',
      pharmacist_confirmed: true,
    },
    adaptation: {
      type: 'therapeutic substitution',
      reason: 'Adverse effect or intolerance',
    },
    patient_context: {
      age: 58,
      sex: 'female',
      pregnancy: null,
      breastfeeding: null,
      relevant_conditions: [],
      relevant_allergies: [],
      relevant_medications: ['rosuvastatin'],
      relevant_labs: [],
    },
    follow_up_plan: {
      responsible_party: 'Pharmacist',
      timeframe: '4 weeks',
      monitoring_targets: ['treatment tolerability', 'response to therapy'],
      action_if_not_met: 'reassess therapy or refer as clinically appropriate',
      pharmacist_confirmed: true,
    },
    ...overrides,
  };
}

describe('adapt counselling', () => {
  it('formats ALL CAPS catalogue names with strength for Card 1', () => {
    const proposed: ProposedPrescription = {
      drugName: 'PRAVASTATIN',
      genericName: 'PRAVASTATIN',
      strength: '10 mg',
      dose: '10 mg',
      dosageForm: 'tablet',
      sig: 'Take 1 tablet by mouth once daily for 30 days.',
    };
    assert.equal(formatPatientFacingMedicationName('PRAVASTATIN'), 'Pravastatin');
    assert.equal(buildAdaptMedicationDisplayName(proposed), 'Pravastatin 10 mg');
  });

  it('builds card 1 from display name + patient_directions', () => {
    const line = buildAdaptHowToUseLine(
      samplePayload({
        medication: {
          display_name: 'Pravastatin 10 mg',
          ingredient: 'pravastatin',
          dosage_form: 'tablet',
          route: 'oral',
        },
      }),
    );
    assert.equal(
      line,
      'Pravastatin 10 mg: Take 1 tablet by mouth once daily for 30 days.',
    );
  });

  it('includes strength in payload display_name from proposed Rx', () => {
    const payload = buildAdaptCounsellingPayload({
      step1: {
        originalPrescription: {
          id: 'm1',
          raw: { medicationText: 'rosuvastatin', directionsText: 'once daily' },
          normalized: { genericName: 'rosuvastatin' },
        } as never,
        indication: {
          medicationId: 'm1',
          medicationConceptKey: 'rosuvastatin',
          indicationDisplay: 'Hyperlipidemia',
          status: 'confirmed',
          selectionSource: 'manual_search',
          confirmedByPharmacist: true,
        },
        jurisdiction: 'AB',
        adaptationType: 'therapeutic_substitution',
        adaptationReason: { code: 'SUB_ADVERSE_EFFECT', label: 'Adverse effect' },
        dispensingStatus: 'not_yet_dispensed',
      },
      step2A: undefined,
      step2B: undefined,
      step2C: undefined,
      step3A: {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'PRAVASTATIN',
          genericName: 'PRAVASTATIN',
          strength: '10 mg',
          dose: '10 mg',
          dosageForm: 'tablet',
          sig: 'Take 1 tablet by mouth once daily for 30 days.',
        },
        confirmed: true,
      } as never,
      step3B: undefined,
    });
    assert.equal(payload.medication.display_name, 'Pravastatin 10 mg');
  });

  it('renders confirmed follow-up deterministically', () => {
    const bullets = renderConfirmedFollowUpDeterministically(
      samplePayload().follow_up_plan,
    );
    assert.equal(bullets.length, 1);
    assert.match(bullets[0]!, /pharmacist/i);
    assert.match(bullets[0]!, /4 weeks/);
    assert.match(bullets[0]!, /tolerability/i);
  });

  it('replaces drifted AI follow-up with deterministic wording', () => {
    const payload = samplePayload();
    const validated = validateAdaptCounsellingOutput(
      {
        what_to_expect: [
          'This medicine is intended to help lower cholesterol over time.',
        ],
        self_care: [
          'Continue heart-healthy eating and regular physical activity as recommended.',
        ],
        routine_follow_up: ['See your doctor in 6 months for labs.'],
        seek_care: [
          'Contact your pharmacist if concerning symptoms develop.',
        ],
      },
      payload,
    );
    assert.ok(matchesConfirmedFollowUp(validated.routine_follow_up, payload.follow_up_plan!));
    assert.match(validated.routine_follow_up[0]!, /4 weeks/);
    assert.ok(!/6 months/.test(validated.routine_follow_up.join(' ')));
  });

  it('strips SIG reconstruction from cards 2–4', () => {
    const payload = samplePayload();
    const validated = validateAdaptCounsellingOutput(
      {
        what_to_expect: [
          'Take 1 tablet by mouth once daily for 30 days.',
          'You may not feel different even when this medicine is working.',
        ],
        self_care: [],
        routine_follow_up: [],
        seek_care: [],
      },
      payload,
    );
    assert.equal(validated.what_to_expect.length, 1);
    assert.match(validated.what_to_expect[0]!, /not feel/i);
  });

  it('drops invented intervals when follow-up is not confirmed', () => {
    const payload = samplePayload({ follow_up_plan: null });
    const validated = validateAdaptCounsellingOutput(
      {
        what_to_expect: [],
        self_care: [],
        routine_follow_up: ['Follow up with your pharmacist in 2 weeks.'],
        seek_care: [
          'Contact your pharmacist if the treatment is not working as expected.',
        ],
      },
      payload,
    );
    assert.equal(validated.routine_follow_up.length, 0);
    assert.equal(validated.seek_care.length, 1);
  });

  it('builds deterministic statin draft with self-care', () => {
    const draft = buildDeterministicAdaptCounselling(samplePayload());
    assert.ok(draft.what_to_expect.length >= 1);
    assert.ok(draft.self_care.some((s) => /heart-healthy|physical activity/i.test(s)));
    assert.ok(draft.routine_follow_up.some((s) => /4 weeks/.test(s)));
    assert.ok(draft.seek_care.length >= 1);
  });

  it('builds payload from Adapt steps including monitoring follow-up', () => {
    const adapt: Pick<
      AdaptPayload,
      'step1' | 'step2A' | 'step2B' | 'step2C' | 'step3A' | 'step3B'
    > = {
      step1: {
        originalPrescription: {
          id: 'm1',
          raw: { medicationText: 'rosuvastatin 10 mg', directionsText: 'once daily' },
          normalized: {
            genericName: 'rosuvastatin',
            brandName: null,
            strength: '10 mg',
            dosageForm: 'tablet',
            route: 'oral',
            directions: 'once daily',
          },
        } as never,
        indication: {
          medicationId: 'm1',
          medicationConceptKey: 'rosuvastatin',
          indicationDisplay: 'Hyperlipidemia',
          status: 'confirmed',
          selectionSource: 'manual_search',
          confirmedByPharmacist: true,
        },
        jurisdiction: 'AB',
        adaptationType: 'therapeutic_substitution',
        adaptationReason: {
          code: 'SUB_ADVERSE_EFFECT',
          label: 'Adverse effect or intolerance',
        },
        dispensingStatus: 'not_yet_dispensed',
      },
      step2A: undefined,
      step2B: undefined,
      step2C: undefined,
      step3A: {
        proposalMode: 'custom',
        proposedPrescription: {
          drugName: 'Pravastatin',
          genericName: 'pravastatin',
          dose: '20 mg',
          frequency: 'Once daily',
          route: 'By mouth',
          dosageForm: 'tablet',
          sig: 'Take 1 tablet by mouth once daily for 30 days.',
          quantity: 30,
          refills: 0,
        },
        confirmed: true,
      } as never,
      step3B: {
        checks: [
          {
            id: 'monitoring_followup',
            type: 'monitoring',
            title: 'Monitoring / follow-up',
            applicable: true,
            severity: 'review',
            status: 'follow_up_required',
            statusLabel: 'Follow-up required',
            tone: 'warning',
            icon: 'calendar',
            summary:
              'Renal function should be reassessed in 3–6 months or sooner if clinically indicated.',
            assessment: 'Lab monitoring required.',
            recommendation:
              'Schedule renal function recheck in 3–6 months.',
          },
        ],
        selectedCheckId: 'monitoring_followup',
        evaluatedAt: new Date().toISOString(),
        overallStatus: 'review',
        clinicalRationale: '',
        rationaleEditedByPharmacist: false,
        acknowledgedCheckIds: ['monitoring_followup'],
        pharmacistNotes: {},
        confirmed: true,
      } as never,
    };

    const payload = buildAdaptCounsellingPayload(adapt);
    assert.equal(payload.medication.display_name, 'Pravastatin 20 mg');
    assert.equal(payload.indication.display_name, 'Hyperlipidemia');
    assert.equal(payload.follow_up_plan?.timeframe, '3 to 6 months');
    assert.ok(payload.follow_up_plan?.monitoring_targets.includes('kidney function'));
  });
});
