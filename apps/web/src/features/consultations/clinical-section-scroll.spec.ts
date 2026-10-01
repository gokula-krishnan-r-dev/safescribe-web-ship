import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampConsultScrollTop,
  cancelClinicalSectionFocus,
  pinConsultScroll,
} from './clinical-section-scroll';

describe('consult pane scroll', () => {
  it('clamps to the pane range so expand/select cannot overscroll', () => {
    assert.equal(clampConsultScrollTop(800, 400, 900), 400);
    assert.equal(clampConsultScrollTop(800, 400, -20), 0);
    assert.equal(clampConsultScrollTop(800, 400, 200), 200);
    assert.equal(clampConsultScrollTop(400, 400, 50), 0);
  });

  it('treats near-aligned positions as already settled', () => {
    // Epsilon used by align helpers — micro deltas must not re-scroll.
    assert.equal(clampConsultScrollTop(2000, 800, 100), 100);
    assert.equal(clampConsultScrollTop(2000, 800, 100.5), 100.5);
  });

  it('pinConsultScroll is a no-op without a consult pane', () => {
    cancelClinicalSectionFocus();
    const unpin = pinConsultScroll({ holdMs: 10 });
    assert.equal(typeof unpin, 'function');
    unpin();
  });
});
