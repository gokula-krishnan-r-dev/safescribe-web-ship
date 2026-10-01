import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAdaptDoseOptions } from './build-adapt-dose-options';

describe('buildAdaptDoseOptions', () => {
  it('keeps azithromycin-relevant strengths around 250 mg', () => {
    const opts = buildAdaptDoseOptions(['250 mg', 'azithromycin 250 mg']);
    const values = opts.map((o) => o.value);
    assert.ok(values.includes('250 mg'));
    assert.ok(values.includes('125 mg') || values.includes('500 mg'));
    assert.equal(values.includes('850 mg'), false);
    assert.equal(values.includes('10 mg'), false);
    assert.equal(values.includes('40 mg'), false);
  });

  it('does not inject statin defaults when only a current dose is known', () => {
    const opts = buildAdaptDoseOptions(['500 mg']);
    const values = opts.map((o) => o.value);
    assert.ok(values[0] === '500 mg');
    assert.equal(values.includes('10 mg'), false);
    assert.equal(values.includes('20 mg'), false);
  });

  it('prefers explicit extras from a product card', () => {
    const opts = buildAdaptDoseOptions(
      ['250 mg'],
      [
        { value: '250 mg', label: '250 mg' },
        { value: '500 mg', label: '500 mg' },
      ],
    );
    assert.deepEqual(
      opts.slice(0, 2).map((o) => o.value),
      ['250 mg', '500 mg'],
    );
  });
});
