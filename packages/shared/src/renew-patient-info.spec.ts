import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyNoConcernAnswers,
  emptyContextAnswer,
  isContextComplete,
  isYesNoContextQuestion,
  type RenewPatientContextRequirement,
} from './renew-monitoring';
import {
  attachPatientInfoPriors,
  canonicalPatientInfoNumber,
  convertPatientInfoValue,
  derivedBmiFromContext,
  displayPatientInfoNumber,
  patientInfoItemStatus,
  patientInfoPriorsFromDemographics,
  resolvePatientInfoRenderer,
} from './renew-patient-info';

function row(
  code: string,
  extras: Partial<RenewPatientContextRequirement> = {},
): RenewPatientContextRequirement {
  return {
    inputCode: code,
    label: code,
    valueShape: 'YES_NO',
    unit: null,
    medicationIds: [],
    medicationNames: ['semaglutide'],
    visible: true,
    answer: emptyContextAnswer(code),
    ...extras,
  };
}

describe('renew patient-info renderer', () => {
  it('renders Weight as a number with unit even if the row was stored as Yes/No', () => {
    assert.equal(
      resolvePatientInfoRenderer(row('WEIGHT', { valueShape: 'YES_NO', uiComponent: 'YES_NO' })),
      'NUMBER_WITH_UNIT',
    );
    assert.equal(isYesNoContextQuestion(row('WEIGHT', { valueShape: 'YES_NO' })), false);
  });

  it('keeps safety questions as Yes/No', () => {
    assert.equal(
      resolvePatientInfoRenderer(row('ALARM_FEATURES', { valueShape: 'YES_NO', uiComponent: 'YES_NO' })),
      'YES_NO',
    );
  });

  it('treats BMI as derived and Height as numeric with unit', () => {
    assert.equal(resolvePatientInfoRenderer(row('BMI', { valueShape: 'NUMERIC', unit: 'kg/m²' })), 'DERIVED');
    assert.equal(
      resolvePatientInfoRenderer(row('HEIGHT', { valueShape: 'NUMERIC', unit: 'cm', uiComponent: 'NUMBER_WITH_UNIT' })),
      'NUMBER_WITH_UNIT',
    );
  });
});

describe('weight conversion and completion', () => {
  it('converts lb to canonical kg and back for display', () => {
    const kg = canonicalPatientInfoNumber('WEIGHT', 182.5, 'lb', 'kg');
    assert.equal(kg, 82.8);
    assert.equal(displayPatientInfoNumber('WEIGHT', 82.8, 'lb', 'kg'), convertPatientInfoValue('WEIGHT', 82.8, 'kg', 'lb'));
  });

  it('does not mark Weight complete until a numeric value is entered', () => {
    const unanswered = row('WEIGHT', { valueShape: 'NUMERIC', unit: 'kg' });
    assert.equal(isContextComplete(unanswered), false);
    assert.equal(patientInfoItemStatus(unanswered), 'UNANSWERED');

    const answered = row('WEIGHT', {
      valueShape: 'NUMERIC',
      unit: 'kg',
      answer: { ...emptyContextAnswer('WEIGHT'), numericValue: 82.4, enteredUnit: 'kg', valueText: '82.4 kg' },
    });
    assert.equal(isContextComplete(answered), true);
    assert.equal(patientInfoItemStatus(answered), 'REVIEWED');
  });

  it('does not block Save when BMI is derived', () => {
    assert.equal(isContextComplete(row('BMI', { valueShape: 'NUMERIC', unit: 'kg/m²', uiComponent: 'DERIVED' })), true);
  });

  it('calculates BMI from canonical weight and height', () => {
    const items = [
      row('WEIGHT', {
        valueShape: 'NUMERIC',
        unit: 'kg',
        answer: { ...emptyContextAnswer('WEIGHT'), numericValue: 82.4 },
      }),
      row('HEIGHT', {
        valueShape: 'NUMERIC',
        unit: 'cm',
        answer: { ...emptyContextAnswer('HEIGHT'), numericValue: 172 },
      }),
    ];
    const bmi = derivedBmiFromContext(items);
    assert.equal(bmi.value, 27.9);
    assert.equal(bmi.label, '27.9 kg/m²');
  });

  it('never bulk-applies No to Weight', () => {
    const weight = row('WEIGHT', { valueShape: 'NUMERIC', unit: 'kg' });
    const safety = row('ALARM_FEATURES', { valueShape: 'YES_NO', bulkApplyAllowed: true });
    const { appliedCodes } = applyNoConcernAnswers([weight, safety], [weight.answer, safety.answer], 'bulk-1');
    assert.deepEqual(appliedCodes, ['ALARM_FEATURES']);
  });

  it('attaches a real intake prior without fabricating values', () => {
    const priors = patientInfoPriorsFromDemographics({ weight: '76.0', height: '' });
    assert.equal(priors.WEIGHT?.numericValue, 76);
    assert.equal(priors.HEIGHT, undefined);
    const attached = attachPatientInfoPriors([row('WEIGHT', { valueShape: 'NUMERIC', unit: 'kg' })], priors);
    assert.equal(attached[0]?.priorValue?.numericValue, 76);
    assert.equal(attached[0]?.answer.numericValue, null);
  });
});
