import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHourlyInterval } from '../consultations/add-treatment/frequency-options';
import {
  frequencyValueFromCustomTiming,
  frequencyValueFromHours,
  parseCustomTimingDraft,
  selectedTimingPresetId,
  timingLabelFromFrequency,
} from './timing-presets';

describe('custom timing resolution', () => {
  it('never displays the blank hourly placeholder for Other or incomplete custom values', () => {
    assert.equal(timingLabelFromFrequency('OTH - Other'), '');
    assert.equal(timingLabelFromFrequency('Every ___ hours'), '');
    assert.equal(timingLabelFromFrequency('Custom timing or frequency…'), '');
    assert.equal(selectedTimingPresetId('OTH - Other'), undefined);
  });

  it('resolves a typed hourly interval into a closed-selector label', () => {
    assert.equal(frequencyValueFromHours(5), 'Q5H - Every 5 hours');
    assert.equal(timingLabelFromFrequency('Q5H - Every 5 hours'), 'Every 5 hours');
    assert.equal(selectedTimingPresetId('Q5H - Every 5 hours'), 'CUSTOM_HOURLY_INTERVAL');
    assert.equal(parseHourlyInterval('Q5H - Every 5 hours'), 5);
  });

  it('maps standard hourly intervals to catalogue presets', () => {
    assert.equal(frequencyValueFromHours(6), 'Q6H - Every 6 hours');
    assert.equal(timingLabelFromFrequency('Q6H - Every 6 hours'), 'Every 6 hours');
    assert.equal(selectedTimingPresetId('Q6H'), 'EVERY_6_HOURS');
  });

  it('stores a custom schedule from the structured builder, not a placeholder', () => {
    assert.equal(frequencyValueFromCustomTiming(2, 'DAY', 'Every other day'), 'Every other day');
    assert.equal(frequencyValueFromCustomTiming(5, 'HOUR', 'Every 5 hours'), 'Q5H - Every 5 hours');
    assert.equal(timingLabelFromFrequency('Every other day'), 'Every other day');
    assert.equal(selectedTimingPresetId('Every other day'), 'CUSTOM_SCHEDULE');
    assert.equal(parseCustomTimingDraft('OTH - Other').label, '');
  });
});
