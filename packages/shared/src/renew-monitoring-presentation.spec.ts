import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyMonitoringResult } from './renew-monitoring';
import {
  bloodPressureTarget,
  evaluatePresentedMonitoringGate,
  monitoringSummaryCounts,
  presentMonitoringRow,
  presentMonitoringRows,
  reviewFindingNarrative,
  validateMonitoringReview,
  buildMonitoringViewDetails,
} from './renew-monitoring-presentation';

describe('renew monitoring presentation', () => {
  it('interprets BP above the diabetes hypertension target as review required', () => {
    const presented = presentMonitoringRow(
      {
        inputCode: 'BP',
        label: 'Blood pressure',
        inputType: 'VITAL',
        valueShape: 'SYSTOLIC_DIASTOLIC',
        unit: 'mmHg',
        medicationIds: ['amlo', 'per'],
        medicationNames: ['Amlodipine', 'Perindopril Erbumine'],
        result: {
          ...emptyMonitoringResult('BP'),
          status: 'AVAILABLE',
          value: { numericValue: 144, secondaryNumericValue: 95, valueText: '144 / 95', unit: 'mmHg' },
          observedDate: '2026-08-12',
          pharmacistConfirmed: true,
        },
      },
      {
        indications: [
          { code: 'HYPERTENSION', label: 'Hypertension' },
          { code: 'T2DM', label: 'Type 2 diabetes' },
        ],
      },
    );
    assert.equal(presented.interpretation, 'OUTSIDE_TARGET');
    assert.equal(presented.badgeLabel, 'Above target');
    assert.equal(presented.detail, 'Review required');
    assert.equal(presented.actionKind, 'review');
    assert.equal(presented.needsReview, true);
    assert.equal(presented.reference.label, 'Target <130/80 mmHg');
    assert.deepEqual(presented.reference.popover.appliesBecause, ['Hypertension', 'Type 2 diabetes']);
  });

  it('marks metformin eGFR action required from a safety finding', () => {
    const presented = presentMonitoringRow(
      {
        inputCode: 'EGFR',
        label: 'eGFR',
        inputType: 'LAB',
        valueShape: 'NUMERIC',
        unit: 'mL/min/1.73m²',
        medicationIds: ['met', 'per'],
        medicationNames: ['Metformin', 'Perindopril Erbumine'],
        result: {
          ...emptyMonitoringResult('EGFR'),
          status: 'AVAILABLE',
          value: { numericValue: 25, secondaryNumericValue: null, valueText: '25', unit: 'mL/min/1.73m²' },
          observedDate: '2026-08-12',
          pharmacistConfirmed: true,
        },
      },
      {
        findings: [
          {
            key: 'renal:metformin',
            summary: 'Metformin is contraindicated',
            detail: 'eGFR 25 mL/min/1.73m²',
            clinicalSeverity: 'AVOID',
            recommendedAction: 'Do not renew metformin',
            inputCode: 'EGFR',
          },
        ],
      },
    );
    assert.equal(presented.interpretation, 'ACTION_REQUIRED');
    assert.equal(presented.badgeLabel, 'Action required');
    assert.equal(presented.detail, 'Metformin');
    assert.equal(presented.tone, 'action');
    assert.equal(presented.reference.type, 'MEDICATION_SPECIFIC_RULES');
  });

  it('keeps potassium within range as view-only', () => {
    const presented = presentMonitoringRow({
      inputCode: 'POTASSIUM',
      label: 'Potassium',
      inputType: 'LAB',
      valueShape: 'NUMERIC',
      unit: 'mmol/L',
      medicationIds: ['per'],
      medicationNames: ['Perindopril Erbumine'],
      result: {
        ...emptyMonitoringResult('POTASSIUM'),
        status: 'AVAILABLE',
        value: { numericValue: 4.2, secondaryNumericValue: null, valueText: '4.2', unit: 'mmol/L' },
        observedDate: '2026-08-12',
        pharmacistConfirmed: true,
      },
    });
    assert.equal(presented.badgeLabel, 'Within range');
    assert.equal(presented.actionKind, 'view');
    assert.equal(presented.needsReview, false);
    assert.equal(presented.reference.label, 'Reference 3.5–5.1 mmol/L');
    const details = buildMonitoringViewDetails(
      {
        inputCode: 'POTASSIUM',
        label: 'Potassium',
        inputType: 'LAB',
        valueShape: 'NUMERIC',
        unit: 'mmol/L',
        medicationIds: ['per'],
        medicationNames: ['Perindopril Erbumine'],
        result: {
          ...emptyMonitoringResult('POTASSIUM'),
          status: 'AVAILABLE',
          value: { numericValue: 4.2, secondaryNumericValue: null, valueText: '4.2', unit: 'mmol/L' },
          observedDate: '2026-08-12',
          sourceType: 'MANUAL',
          sourceLabel: 'Lab report',
          pharmacistConfirmed: true,
        },
      },
      presented,
    );
    assert.equal(details.title, 'Potassium details');
    assert.equal(details.interpretationLabel, 'Within normal limits');
    assert.equal(details.interpretationType, 'WITHIN_RANGE');
    assert.equal(details.clinicalSummary, 'No action needed based on the current value.');
    assert.deepEqual(
      details.fields.map((field) => [field.label, field.value]),
      [
        ['Current value', '4.2 mmol/L'],
        ['Date collected', '2026-08-12'],
        ['Reference range', '3.5–5.1 mmol/L'],
        ['Source', 'Lab report'],
        ['Applies to', 'Perindopril Erbumine'],
      ],
    );
  });

  it('does not call eGFR within-range copy when no renal rule is triggered', () => {
    const row = {
      inputCode: 'EGFR',
      label: 'eGFR',
      inputType: 'LAB' as const,
      valueShape: 'NUMERIC' as const,
      unit: 'mL/min/1.73m²',
      medicationIds: ['met', 'per'],
      medicationNames: ['Metformin', 'Perindopril Erbumine'],
      result: {
        ...emptyMonitoringResult('EGFR'),
        status: 'AVAILABLE' as const,
        value: { numericValue: 68, secondaryNumericValue: null, valueText: '68', unit: 'mL/min/1.73m²' },
        observedDate: '2026-06-15',
        pharmacistConfirmed: true,
      },
    };
    const presented = presentMonitoringRow(row);
    assert.equal(presented.actionKind, 'view');
    assert.equal(presented.badgeLabel, 'No unresolved renal dosing issue identified');
    const details = buildMonitoringViewDetails(row, presented);
    assert.equal(details.interpretationLabel, 'No unresolved renal dosing issue identified');
    assert.notEqual(details.interpretationLabel, 'Within normal limits');
    assert.notEqual(details.interpretationLabel, 'No renal dosing concern identified');
    assert.equal(
      details.clinicalSummary,
      'No unresolved renal dosing issue was identified from published medication-specific rules.',
    );
    assert.equal(details.fields.find((field) => field.key === 'reference')?.label, 'Reference');
    assert.equal(
      details.fields.find((field) => field.key === 'reference')?.value,
      'Medication-specific renal thresholds',
    );
  });

  it('does not block Continue for unavailable results without a required review', () => {
    const monitoring = [
      {
        inputCode: 'PSA',
        label: 'PSA',
        inputType: 'LAB' as const,
        valueShape: 'NUMERIC' as const,
        unit: 'ng/mL',
        medicationIds: ['fin'],
        medicationNames: ['Finasteride'],
        result: {
          ...emptyMonitoringResult('PSA'),
          status: 'UNAVAILABLE' as const,
          note: 'No recent result found',
          pharmacistConfirmed: true,
        },
      },
    ];
    const presented = presentMonitoringRow(monitoring[0]!);
    assert.equal(presented.badgeLabel, 'Result unavailable — documented');
    assert.equal(presented.actionKind, 'add_result');
    const gate = evaluatePresentedMonitoringGate({
      monitoring,
      context: [],
      findings: [],
      acknowledgedFindingKeys: [],
    });
    assert.equal(gate.ok, true);
  });

  it('blocks Continue until an above-target BP review is saved', () => {
    const bp = {
      inputCode: 'BP',
      label: 'Blood pressure',
      inputType: 'VITAL' as const,
      valueShape: 'SYSTOLIC_DIASTOLIC' as const,
      unit: 'mmHg',
      medicationIds: ['amlo'],
      medicationNames: ['Amlodipine'],
      result: {
        ...emptyMonitoringResult('BP'),
        status: 'AVAILABLE' as const,
        value: { numericValue: 144, secondaryNumericValue: 95, valueText: '144 / 95', unit: 'mmHg' },
        observedDate: '2026-08-12',
        pharmacistConfirmed: true,
      },
    };
    const indications = [{ code: 'HYPERTENSION', label: 'Hypertension' }];
    const blocked = evaluatePresentedMonitoringGate({
      monitoring: [bp],
      context: [],
      findings: [],
      acknowledgedFindingKeys: [],
      indications,
    });
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.blockingReviewCodes, ['BP']);

    const cleared = evaluatePresentedMonitoringGate({
      monitoring: [bp],
      context: [],
      findings: [],
      acknowledgedFindingKeys: [],
      indications,
      itemReviews: [
        {
          inputCode: 'BP',
          action: 'CONTINUE_AND_MONITOR',
          note: null,
          reviewedAt: '2026-08-12T12:00:00.000Z',
        },
      ],
    });
    assert.equal(cleared.ok, true);
    const after = presentMonitoringRow(bp, {
      indications,
      reviews: cleared.ok
        ? [
            {
              inputCode: 'BP',
              action: 'CONTINUE_AND_MONITOR',
              note: null,
              reviewedAt: '2026-08-12T12:00:00.000Z',
            },
          ]
        : [],
    });
    assert.equal(after.badgeLabel, 'Above target — reviewed');
    assert.equal(after.needsReview, false);
    assert.equal(after.actionKind, 'view');
  });

  it('summarizes screenshot-style status counts', () => {
    const rows = presentMonitoringRows(
      [
        {
          inputCode: 'BP',
          label: 'Blood pressure',
          inputType: 'VITAL',
          valueShape: 'SYSTOLIC_DIASTOLIC',
          unit: 'mmHg',
          medicationIds: ['a'],
          medicationNames: ['Amlodipine'],
          result: {
            ...emptyMonitoringResult('BP'),
            status: 'AVAILABLE',
            value: { numericValue: 144, secondaryNumericValue: 95, valueText: '144 / 95', unit: 'mmHg' },
            observedDate: '2026-08-12',
            pharmacistConfirmed: true,
          },
        },
        {
          inputCode: 'EGFR',
          label: 'eGFR',
          inputType: 'LAB',
          valueShape: 'NUMERIC',
          unit: 'mL/min/1.73m²',
          medicationIds: ['m'],
          medicationNames: ['Metformin'],
          result: {
            ...emptyMonitoringResult('EGFR'),
            status: 'AVAILABLE',
            value: { numericValue: 25, secondaryNumericValue: null, valueText: '25', unit: 'mL/min/1.73m²' },
            observedDate: '2026-08-12',
            pharmacistConfirmed: true,
          },
        },
        {
          inputCode: 'POTASSIUM',
          label: 'Potassium',
          inputType: 'LAB',
          valueShape: 'NUMERIC',
          unit: 'mmol/L',
          medicationIds: ['p'],
          medicationNames: ['Perindopril Erbumine'],
          result: {
            ...emptyMonitoringResult('POTASSIUM'),
            status: 'AVAILABLE',
            value: { numericValue: 4.2, secondaryNumericValue: null, valueText: '4.2', unit: 'mmol/L' },
            observedDate: '2026-08-12',
            pharmacistConfirmed: true,
          },
        },
        {
          inputCode: 'TSH',
          label: 'TSH',
          inputType: 'LAB',
          valueShape: 'NUMERIC',
          unit: 'mIU/L',
          medicationIds: ['l'],
          medicationNames: ['Levothyroxine'],
          result: {
            ...emptyMonitoringResult('TSH'),
            status: 'AVAILABLE',
            value: { numericValue: 2.3, secondaryNumericValue: null, valueText: '2.3', unit: 'mIU/L' },
            observedDate: '2026-08-12',
            pharmacistConfirmed: true,
          },
        },
        {
          inputCode: 'PSA',
          label: 'PSA',
          inputType: 'LAB',
          valueShape: 'NUMERIC',
          unit: 'ng/mL',
          medicationIds: ['f'],
          medicationNames: ['Finasteride'],
          result: { ...emptyMonitoringResult('PSA'), status: 'UNAVAILABLE', pharmacistConfirmed: true },
        },
      ],
      {
        indications: [
          { code: 'HYPERTENSION', label: 'Hypertension' },
          { code: 'T2DM', label: 'Type 2 diabetes' },
        ],
        findings: [
          {
            key: 'renal:metformin',
            summary: 'Metformin is contraindicated at this eGFR',
            detail: '',
            clinicalSeverity: 'AVOID',
            recommendedAction: null,
            inputCode: 'EGFR',
          },
        ],
      },
    );
    assert.deepEqual(monitoringSummaryCounts(rows), {
      actionRequired: 1,
      reviewRequired: 1,
      unavailable: 1,
      noActionNeeded: 2,
      pending: 0,
      reviewed: 3,
      total: 5,
    });
  });

  it('uses the diabetes-specific BP target when both indications are present', () => {
    const target = bloodPressureTarget([
      { code: 'HYPERTENSION', label: 'Hypertension' },
      { code: 'T2DM', label: 'Type 2 diabetes' },
    ]);
    assert.deepEqual(target, {
      systolic: 130,
      diastolic: 80,
      appliesBecause: ['Hypertension', 'Type 2 diabetes'],
    });
  });

  it('writes the screenshot BP finding copy from the configured indications', () => {
    const presented = presentMonitoringRow(
      {
        inputCode: 'BP',
        label: 'Blood pressure',
        inputType: 'VITAL',
        valueShape: 'SYSTOLIC_DIASTOLIC',
        unit: 'mmHg',
        medicationIds: ['amlo', 'per'],
        medicationNames: ['Amlodipine', 'Perindopril Erbumine'],
        result: {
          ...emptyMonitoringResult('BP'),
          status: 'AVAILABLE',
          value: { numericValue: 144, secondaryNumericValue: 95, valueText: '144 / 95', unit: 'mmHg' },
          observedDate: '2026-08-12',
          pharmacistConfirmed: true,
        },
      },
      {
        indications: [
          { code: 'HYPERTENSION', label: 'Hypertension' },
          { code: 'T2DM', label: 'Type 2 diabetes' },
        ],
      },
    );
    assert.equal(
      reviewFindingNarrative(
        { inputCode: 'BP', label: 'Blood pressure' },
        presented,
      ),
      'BP is above the configured treatment target for hypertension with Type 2 diabetes.',
    );
    assert.deepEqual(presented.allowedActions, [
      'CONTINUE_AND_MONITOR',
      'SHORTER_RENEWAL',
      'FOLLOW_UP_WITH_PRESCRIBER',
      'DO_NOT_RENEW_MEDICATION',
      'OTHER',
    ]);
  });

  it('requires Other specify text or a note, and a medication when not renewing two or more', () => {
    assert.equal(
      validateMonitoringReview({
        action: 'OTHER',
        note: '',
        otherText: '',
        medicationCount: 1,
      }),
      'Specify the other action.',
    );
    assert.equal(
      validateMonitoringReview({
        action: 'OTHER',
        note: 'Documented separately',
        otherText: '',
        medicationCount: 1,
      }),
      null,
    );
    assert.equal(
      validateMonitoringReview({
        action: 'DO_NOT_RENEW_MEDICATION',
        note: '',
        medicationCount: 2,
        affectedMedicationIds: [],
      }),
      'Select which medication should not be renewed.',
    );
    assert.equal(
      validateMonitoringReview({
        action: 'FOLLOW_UP_WITH_PRESCRIBER',
        note: '',
        medicationCount: 2,
      }),
      null,
    );
  });

  it('does not treat a missing dialysis rule as renal clearance', () => {
    const presented = presentMonitoringRow(
      {
        inputCode: 'EGFR',
        label: 'eGFR',
        inputType: 'LAB',
        valueShape: 'NUMERIC',
        unit: 'mL/min/1.73m²',
        medicationIds: ['gab', 'furo'],
        medicationNames: ['Gabapentin', 'Furosemide'],
        result: {
          ...emptyMonitoringResult('EGFR'),
          status: 'AVAILABLE',
          value: { numericValue: 4, secondaryNumericValue: null, valueText: '4', unit: 'mL/min/1.73m²' },
          observedDate: '2026-09-06',
          pharmacistConfirmed: true,
        },
      },
      { dialysisStatus: 'HEMODIALYSIS' },
    );
    assert.equal(presented.badgeLabel, 'Renal review required');
    assert.equal(presented.needsReview, true);
    assert.equal(presented.actionKind, 'review');
    assert.equal(presented.reference.label, 'Dialysis-specific medication review');
    assert.equal(presented.dialysisStatus, 'HEMODIALYSIS');
    const gabapentin = presented.renalEvaluations.find((row) => row.medicationName === 'Gabapentin');
    const furosemide = presented.renalEvaluations.find((row) => row.medicationName === 'Furosemide');
    assert.equal(gabapentin?.coverage, 'EXPECTED_BUT_MISSING');
    assert.equal(gabapentin?.badgeLabel, 'Dialysis-specific rule not available');
    assert.equal(furosemide?.coverage, 'NOT_REQUIRED');
  });

  it('does not amber-warn dialysis when no linked medication needs a renal rule', () => {
    const presented = presentMonitoringRow(
      {
        inputCode: 'EGFR',
        label: 'eGFR',
        inputType: 'LAB',
        valueShape: 'NUMERIC',
        unit: 'mL/min/1.73m²',
        medicationIds: ['ator'],
        medicationNames: ['Atorvastatin'],
        result: {
          ...emptyMonitoringResult('EGFR'),
          status: 'AVAILABLE',
          value: { numericValue: 4, secondaryNumericValue: null, valueText: '4', unit: 'mL/min/1.73m²' },
          observedDate: '2026-09-06',
          pharmacistConfirmed: true,
        },
      },
      { dialysisStatus: 'HEMODIALYSIS' },
    );
    assert.equal(presented.needsReview, false);
    assert.equal(presented.badgeLabel, 'Dialysis context documented');
    assert.notEqual(presented.badgeLabel, 'No renal dosing concern');
  });

  it('marks potassium Leu/µL as unit mismatch — never Outside range', () => {
    const presented = presentMonitoringRow({
      inputCode: 'POTASSIUM',
      label: 'Potassium',
      inputType: 'LAB',
      valueShape: 'NUMERIC',
      unit: 'mmol/L',
      medicationIds: ['per'],
      medicationNames: ['Perindopril Erbumine'],
      result: {
        ...emptyMonitoringResult('POTASSIUM'),
        status: 'AVAILABLE',
        value: { numericValue: 25, secondaryNumericValue: null, valueText: '25', unit: 'Leu/uL' },
        observedDate: null,
        pharmacistConfirmed: true,
      },
    });
    assert.equal(presented.validationStatus, 'UNIT_MISMATCH');
    assert.equal(presented.interpretation, 'NOT_EVALUABLE');
    assert.equal(presented.badgeLabel, 'Result/unit mismatch');
    assert.equal(presented.detail, 'Expected unit: mmol/L');
    assert.notEqual(presented.badgeLabel, 'Outside range');
    assert.equal(presented.needsReview, true);
    assert.equal(presented.actionKind, 'review');
    assert.equal(presented.tone, 'review');
    assert.match(
      reviewFindingNarrative(
        { inputCode: 'POTASSIUM', label: 'Potassium' },
        presented,
      ),
      /incompatible/i,
    );
  });

  it('marks ACR µmol/L as unit mismatch — never Outside range', () => {
    const presented = presentMonitoringRow({
      inputCode: 'URINE_ACR',
      label: 'Urine albumin-to-creatinine ratio (ACR)',
      inputType: 'LAB',
      valueShape: 'NUMERIC',
      unit: 'mg/mmol',
      medicationIds: ['met'],
      medicationNames: ['Metformin'],
      result: {
        ...emptyMonitoringResult('URINE_ACR'),
        status: 'AVAILABLE',
        value: { numericValue: 81, secondaryNumericValue: null, valueText: '81', unit: 'umol/L' },
        observedDate: null,
        pharmacistConfirmed: true,
      },
    });
    assert.equal(presented.validationStatus, 'UNIT_MISMATCH');
    assert.equal(presented.badgeLabel, 'Result/unit mismatch');
    assert.equal(presented.expectedUnit, 'mg/mmol');
    assert.notEqual(presented.interpretation, 'OUTSIDE_TARGET');
  });

  it('still interprets potassium when unit is compatible', () => {
    const presented = presentMonitoringRow({
      inputCode: 'POTASSIUM',
      label: 'Potassium',
      inputType: 'LAB',
      valueShape: 'NUMERIC',
      unit: 'mmol/L',
      medicationIds: ['per'],
      medicationNames: ['Perindopril Erbumine'],
      result: {
        ...emptyMonitoringResult('POTASSIUM'),
        status: 'AVAILABLE',
        value: { numericValue: 4.6, secondaryNumericValue: null, valueText: '4.6', unit: 'mmol/L' },
        observedDate: '2026-08-12',
        pharmacistConfirmed: true,
      },
    });
    assert.equal(presented.validationStatus, 'VALID');
    assert.equal(presented.badgeLabel, 'Within range');
    assert.equal(presented.needsReview, false);
  });

  it('blocks Continue while unit mismatch is unresolved', () => {
    const monitoring = [
      {
        inputCode: 'POTASSIUM',
        label: 'Potassium',
        inputType: 'LAB' as const,
        valueShape: 'NUMERIC' as const,
        unit: 'mmol/L',
        medicationIds: ['per'],
        medicationNames: ['Perindopril Erbumine'],
        result: {
          ...emptyMonitoringResult('POTASSIUM'),
          status: 'AVAILABLE' as const,
          value: { numericValue: 25, secondaryNumericValue: null, valueText: '25', unit: 'Leu/µL' },
          observedDate: null,
          pharmacistConfirmed: true,
        },
      },
    ];
    const gate = evaluatePresentedMonitoringGate({
      monitoring,
      context: [],
      findings: [],
      acknowledgedFindingKeys: [],
    });
    assert.equal(gate.ok, false);
    assert.deepEqual(gate.blockingReviewCodes, ['POTASSIUM']);
  });
});
