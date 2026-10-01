import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNestedTimingSurface, timingPanelBox } from './timing-panel-layout';

describe('timing panel layout', () => {
  it('keeps the compact menu auto-sized', () => {
    assert.equal(isNestedTimingSurface('menu'), false);
    assert.deepEqual(timingPanelBox('menu', 320), { maxHeight: 320 });
  });

  it('gives More schedules a definite height so the catalogue can scroll', () => {
    assert.equal(isNestedTimingSurface('more'), true);
    const box = timingPanelBox('more', 320);
    assert.equal(box.height, 320);
    assert.equal(box.minHeight, 280);
    assert.equal(box.maxHeight, 320);
  });

  it('does the same for hourly and custom nested forms', () => {
    assert.equal(timingPanelBox('hourly', 180).height, 220);
    assert.equal(timingPanelBox('custom', 400).height, 400);
  });
});
