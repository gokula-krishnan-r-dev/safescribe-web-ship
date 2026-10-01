import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyRegimenLine } from './constants';
import {
  administrationsPerDay,
  formatCourseDurationDisplay,
  formatSuggestedDispenseQuantity,
  suggestedCourseDuration,
  suggestedDispenseQuantity,
  withAutoDispenseQuantity,
  withAutoQuantityUnitFromDoseForm,
} from './quantity';

function line(patch: Partial<ReturnType<typeof emptyRegimenLine>>) {
  return emptyRegimenLine(patch);
}

describe('dispense quantity from SIG', () => {
  it('calculates 1 capsule once daily for 10 days as 10', () => {
    const lines = [
      line({
        form: 'Capsule(s)',
        doseFrom: '1',
        frequency: 'Once daily',
        durationValue: '10',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Capsule(s)'), 10);
    assert.equal(formatSuggestedDispenseQuantity(lines, 'Capsule(s)'), '10');
  });

  it('does not guess a dispense quantity until frequency and duration are set', () => {
    assert.equal(formatSuggestedDispenseQuantity([emptyRegimenLine()], 'Tablet(s)'), null);
  });

  it('calculates 1 tablet three times daily for 5 days as 15', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        frequency: 'Three times daily',
        durationValue: '5',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(formatSuggestedDispenseQuantity(lines, 'Tablet(s)'), '15');
  });

  it('does not guess a quantity from a dose range', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        doseTo: '2',
        frequency: 'Once daily',
        durationValue: '10',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Tablet(s)'), null);
  });

  it('does not guess a quantity from a PRN schedule', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        frequency: 'Every 6 hours',
        durationValue: '5',
        durationUnit: 'DAY',
        prn: true,
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Tablet(s)'), null);
  });

  it('sums sequential tablet schedules for quantity and course length', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '4',
        frequency: 'Once daily',
        durationValue: '2',
        durationUnit: 'DAY',
      }),
      line({
        form: 'Tablet(s)',
        doseFrom: '2',
        frequency: 'Once daily',
        durationValue: '3',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Tablet(s)'), 14);
    assert.equal(formatSuggestedDispenseQuantity(lines, 'Tablet(s)'), '14');
    assert.deepEqual(suggestedCourseDuration(lines), { value: '5', unit: 'DAY' });
  });

  it('sums a three-stage daily taper', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '4',
        frequency: 'Once daily',
        durationValue: '3',
        durationUnit: 'DAY',
      }),
      line({
        form: 'Tablet(s)',
        doseFrom: '2',
        frequency: 'Once daily',
        durationValue: '3',
        durationUnit: 'DAY',
      }),
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        frequency: 'Once daily',
        durationValue: '3',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Tablet(s)'), 21);
    assert.deepEqual(suggestedCourseDuration(lines), { value: '9', unit: 'DAY' });
    assert.equal(formatCourseDurationDisplay(lines), '9 days');
  });

  it('calculates 1 tablet twice daily for 5 days as 10', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        frequency: 'Twice daily',
        durationValue: '5',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(formatSuggestedDispenseQuantity(lines, 'Tablet(s)'), '10');
    assert.equal(formatCourseDurationDisplay(lines), '5 days');
  });

  it('uses the more frequent end of an every-n-to-m-hours range', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        frequency: 'Every 6–8 hours',
        durationValue: '7',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(formatSuggestedDispenseQuantity(lines, 'Tablet(s)'), '28');
  });

  it('converts weeks and every-n-hours frequencies', () => {
    const lines = [
      line({
        form: 'Tablet(s)',
        doseFrom: '1',
        frequency: 'Every 8 hours',
        durationValue: '2',
        durationUnit: 'WEEK',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Tablet(s)'), 42);
  });

  it('calculates 20 capsules QD for 4 weeks as 560', () => {
    const lines = [
      line({
        form: 'Capsule(s)',
        doseFrom: '20',
        frequency: 'QD - Once daily',
        durationValue: '4',
        durationUnit: 'WEEK',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'Capsule(s)'), 560);
    assert.equal(formatSuggestedDispenseQuantity(lines, 'Capsule(s)'), '560');
  });

  it('auto-fills empty quantity from SIG on inline-style drafts (lines key)', () => {
    const last = { current: null as string | null };
    const next = withAutoDispenseQuantity(
      {
        quantityValue: '',
        quantityUnit: 'Capsule(s)',
        lines: [
          line({
            form: 'Capsule(s)',
            doseFrom: '20',
            frequency: 'QD - Once daily',
            durationValue: '4',
            durationUnit: 'WEEK',
          }),
        ],
      },
      last,
    );
    assert.equal(next.quantityValue, '560');
    assert.equal(last.current, '560');
  });

  it('does not guess tubes or grams from applications', () => {
    const lines = [
      line({
        form: 'Application(s)',
        frequency: 'Twice daily',
        durationValue: '6',
        durationUnit: 'DAY',
      }),
    ];
    assert.equal(suggestedDispenseQuantity(lines, 'g'), null);
    assert.equal(suggestedDispenseQuantity(lines, 'Tube(s)'), null);
  });

  it('does not auto-copy application dose units onto the dispense field', () => {
    const last = { current: null as string | null };
    const next = withAutoQuantityUnitFromDoseForm(
      {
        quantityValue: '',
        quantityUnit: '',
        lines: [line({ form: 'Application(s)' })],
      },
      last,
    );
    assert.equal(next.quantityUnit, '');
    assert.equal(last.current, null);
  });

  it('keeps a pharmacist-selected tube unit', () => {
    const last = { current: 'g' as string | null };
    const next = withAutoQuantityUnitFromDoseForm(
      {
        quantityValue: '2',
        quantityUnit: 'Tube(s)',
        lines: [line({ form: 'Application(s)' })],
      },
      last,
    );
    assert.equal(next.quantityUnit, 'Tube(s)');
  });

  it('keeps a pharmacist override when the SIG changes', () => {
    const last = { current: '10' };
    const next = withAutoDispenseQuantity(
      {
        quantityValue: '20',
        quantityUnit: 'Capsule(s)',
        regimenLines: [
          line({
            form: 'Capsule(s)',
            doseFrom: '1',
            frequency: 'Once daily',
            durationValue: '14',
            durationUnit: 'DAY',
          }),
        ],
      },
      last,
    );
    assert.equal(next.quantityValue, '20');
  });

  it('updates quantity when it still matches the last auto value', () => {
    const last = { current: '15' };
    const next = withAutoDispenseQuantity(
      {
        quantityValue: '15',
        quantityUnit: 'Capsule(s)',
        regimenLines: [
          line({
            form: 'Capsule(s)',
            doseFrom: '1',
            frequency: 'Once daily',
            durationValue: '10',
            durationUnit: 'DAY',
          }),
        ],
      },
      last,
    );
    assert.equal(next.quantityValue, '10');
  });
});

describe('administrationsPerDay', () => {
  it('maps structured frequencies', () => {
    assert.equal(administrationsPerDay('Once daily'), 1);
    assert.equal(administrationsPerDay('At bedtime'), 1);
    assert.equal(administrationsPerDay('Twice daily'), 2);
    assert.equal(administrationsPerDay('Three times daily'), 3);
    assert.equal(administrationsPerDay('Every 4 hours'), 6);
    assert.equal(administrationsPerDay('As directed'), null);
    assert.equal(administrationsPerDay('BID - Two times daily'), 2);
    assert.equal(administrationsPerDay('Q4H'), 6);
  });
});
