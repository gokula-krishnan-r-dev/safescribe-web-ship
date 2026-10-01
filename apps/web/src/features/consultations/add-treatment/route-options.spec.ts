import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ROUTE_OPTIONS,
  findRouteOption,
  resolveRouteValue,
  routeSelectOptions,
} from './route-options';

describe('route catalog', () => {
  it('includes screenshot administration routes', () => {
    const expected = [
      'Apply Externally',
      'Buccal',
      'Inhalation',
      'Intra-articularl',
      'Intramuscular',
      'Nasotracheal Tube',
      'Oral',
      'Other/Miscellaneous',
      'Ventimask',
      'Wound',
    ];
    for (const value of expected) {
      assert.ok((ROUTE_OPTIONS as readonly string[]).includes(value), `missing ${value}`);
    }
    assert.equal(ROUTE_OPTIONS.length, 57);
  });

  it('resolves legacy and abbreviated routes', () => {
    assert.equal(resolveRouteValue('Inhaled'), 'Inhalation');
    assert.equal(resolveRouteValue('po'), 'Oral');
    assert.equal(resolveRouteValue('IV'), 'Intravenous');
    assert.equal(resolveRouteValue('nasotrachial tube'), 'Nasotracheal Tube');
    assert.equal(findRouteOption('im'), 'Intramuscular');
  });

  it('keeps unknown custom routes', () => {
    assert.equal(resolveRouteValue('via nebulizer'), 'via nebulizer');
    assert.equal(routeSelectOptions('via nebulizer')[0]?.value, 'via nebulizer');
  });
});
