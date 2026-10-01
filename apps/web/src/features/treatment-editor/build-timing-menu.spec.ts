import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTimingConfiguration, buildTimingMenu } from './build-timing-menu';

describe('timing menu', () => {
  it('keeps More schedules available for the full catalogue', () => {
    const menu = buildTimingMenu(buildTimingConfiguration({ pathwayFrequency: 'Twice daily' }));
    assert.equal(menu.suggested?.id, 'TWICE_DAILY');
    assert.equal(menu.showMoreSchedules, true);
    assert.ok(menu.common.length <= 5);
    assert.ok(!menu.common.some((option) => option.id === 'TWICE_DAILY'));
  });
});
