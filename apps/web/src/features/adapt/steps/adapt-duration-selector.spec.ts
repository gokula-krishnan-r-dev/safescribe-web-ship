import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveAdaptTherapyDurationSelection,
  ADAPT_THERAPY_DURATION_OPTIONS,
} from '@safescript/shared';
import {
  timingLabelFromFrequency,
  selectedTimingPresetId,
} from '@/features/treatment-editor/timing-presets';
import {
  buildTimingConfiguration,
  buildTimingMenu,
} from '@/features/treatment-editor/build-timing-menu';

describe('Adapt duration and timing selectors', () => {
  it('resolves standard and aliased therapy durations correctly', () => {
    assert.deepEqual(resolveAdaptTherapyDurationSelection('1–3 months'), {
      id: '1_3_months',
      customText: '',
    });
    assert.deepEqual(resolveAdaptTherapyDurationSelection('1-3 months'), {
      id: '1_3_months',
      customText: '',
    });
    assert.deepEqual(resolveAdaptTherapyDurationSelection('Less than 1 month'), {
      id: 'less_than_1_month',
      customText: '',
    });
    assert.deepEqual(resolveAdaptTherapyDurationSelection('< 1 month'), {
      id: 'less_than_1_month',
      customText: '',
    });
    assert.deepEqual(resolveAdaptTherapyDurationSelection('More than 1 year'), {
      id: 'more_than_1_year',
      customText: '',
    });
    assert.deepEqual(resolveAdaptTherapyDurationSelection('Unknown'), {
      id: 'unknown',
      customText: '',
    });
  });

  it('resolves free-form custom durations as custom', () => {
    assert.deepEqual(resolveAdaptTherapyDurationSelection('45 days, since Jan 2025'), {
      id: 'custom',
      customText: '45 days, since Jan 2025',
    });
    assert.deepEqual(resolveAdaptTherapyDurationSelection('started last week after clinic visit'), {
      id: 'custom',
      customText: 'started last week after clinic visit',
    });
  });

  it('resolves clean clinical frequency labels in TimingSelector', () => {
    assert.equal(timingLabelFromFrequency('Three times daily'), 'Three times daily');
    assert.equal(selectedTimingPresetId('Three times daily'), 'THREE_TIMES_DAILY');

    assert.equal(timingLabelFromFrequency('Once daily'), 'Once daily');
    assert.equal(selectedTimingPresetId('Once daily'), 'ONCE_DAILY');

    assert.equal(timingLabelFromFrequency('Twice daily'), 'Twice daily');
    assert.equal(selectedTimingPresetId('Twice daily'), 'TWICE_DAILY');

    assert.equal(timingLabelFromFrequency('Every 8 hours'), 'Every 8 hours');
    assert.equal(selectedTimingPresetId('Every 8 hours'), 'EVERY_8_HOURS');
  });

  it('builds dynamic timing menu for adaptation proposed prescription', () => {
    const config = buildTimingConfiguration({
      pathwayFrequency: 'Three times daily',
      commonTimingPresetIds: [
        'ONCE_DAILY',
        'TWICE_DAILY',
        'THREE_TIMES_DAILY',
        'FOUR_TIMES_DAILY',
        'AT_BEDTIME',
      ],
    });
    const menu = buildTimingMenu(config);

    assert.equal(menu.suggested?.id, 'THREE_TIMES_DAILY');
    assert.equal(menu.suggested?.label, 'Three times daily');
    assert.equal(menu.showMoreSchedules, true);
    assert.ok(!menu.common.some((opt) => opt.id === 'THREE_TIMES_DAILY'));
    assert.ok(menu.common.some((opt) => opt.id === 'TWICE_DAILY'));
    assert.ok(menu.common.some((opt) => opt.id === 'ONCE_DAILY'));
  });
});
