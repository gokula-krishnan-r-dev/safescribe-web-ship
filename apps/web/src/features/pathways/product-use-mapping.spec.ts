import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  administrationUnitsFor,
  findProductUseMapping,
  inferProductForm,
  preferredAdministrationUnit,
  reconcileRegimenUse,
  validateProductUse,
} from './product-use-mapping';

describe('product-use-mapping', () => {
  it('maps ZORYVE foam to topical applications, never tablets', () => {
    assert.equal(inferProductForm('Foam', 'ZORYVE roflumilast 0.3%'), 'Foam');
    assert.equal(preferredAdministrationUnit('Foam', 'Topical'), 'Application(s)');
    assert.deepEqual(administrationUnitsFor('Foam', 'Topical'), ['Application(s)']);
    assert.match(
      validateProductUse('Foam', 'Topical', 'Tablet(s)') ?? '',
      /not used/i,
    );
    assert.match(
      validateProductUse('Foam', 'Oral', 'Application(s)') ?? '',
      /not compatible/i,
    );
  });

  it('does not invent a tablet form when CCDD text is incomplete', () => {
    assert.equal(inferProductForm(undefined), null);
    assert.equal(inferProductForm('unknown product'), null);
  });

  it('keeps oral tablets as tablet units', () => {
    assert.equal(inferProductForm('oral tablet'), 'Tablet');
    assert.equal(findProductUseMapping('Tablet', 'Oral')?.sigVerb, 'Take');
  });

  it('maps cream before checking tablet-like defaults', () => {
    assert.equal(inferProductForm('topical cream'), 'Cream');
    assert.equal(preferredAdministrationUnit('Cream', 'Topical'), 'Application(s)');
  });

  it('maps Ventolin HFA to a metered-dose inhaler', () => {
    assert.equal(inferProductForm('HFA', 'salbutamol VENTOLIN HFA'), 'Metered-dose inhaler');
    assert.equal(findProductUseMapping('Metered-dose inhaler', 'Inhalation')?.sigVerb, 'Inhale');
  });

  it('clears a contradictory oral route on foam instead of inventing a tablet', () => {
    const next = reconcileRegimenUse({
      productForm: 'Foam',
      route: 'Oral',
      administrationUnit: 'Tablet(s)',
    });
    assert.equal(next.route, 'Topical');
    assert.equal(next.administrationUnit, 'Application(s)');
    assert.equal(next.productForm, 'Foam');
  });

  it('does not fill oral/tablet when form is unknown', () => {
    const next = reconcileRegimenUse({
      productForm: '',
      route: '',
      administrationUnit: 'mg',
    });
    assert.equal(next.productForm, '');
    assert.equal(next.route, '');
    assert.equal(next.administrationUnit, '');
  });
});
