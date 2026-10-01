import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeAdminDirections,
  createEmptyRegimen,
} from './treatment-option-editor-constants';

describe('composeAdminDirections', () => {
  it('starts a new regimen with blank dose, frequency, and duration', () => {
    const empty = createEmptyRegimen();
    assert.equal(empty.dose, '');
    assert.equal(empty.frequency, '');
    assert.equal(empty.durationValue, '');
    assert.equal(empty.durationUnit, '');
  });

  it('builds topical foam directions without inventing tablets', () => {
    const regimen = {
      ...createEmptyRegimen(),
      dose: 'Apply a thin layer',
      administrationUnit: 'Application(s)',
      productForm: 'Foam',
      frequency: 'Once daily',
      route: 'Topical',
      durationValue: '8',
      durationUnit: 'Weeks',
    };
    assert.equal(
      composeAdminDirections(regimen),
      'Apply a thin layer to the affected area once daily for up to 8 weeks.',
    );
  });
});
