import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decimalMultiply,
  formatDoseNumber,
  formatMassLabel,
  multiplyStrengthByQuantity,
  parseAdministrationQuantity,
  parseProductStrength,
} from './administered-dose';

describe('administered-dose calculation', () => {
  it('multiplies tablet strength by quantity with decimal-safe arithmetic', () => {
    const strength = parseProductStrength('500 mg');
    const quantity = parseAdministrationQuantity('3', 'Tablet(s)');
    assert.ok(strength);
    assert.ok(quantity);
    const result = multiplyStrengthByQuantity(strength, quantity);
    assert.equal(result.status, 'CALCULATED');
    assert.equal(result.minimum, 1500);
    assert.equal(result.unit, 'mg');
    assert.equal(formatMassLabel(result.minimum!, result.unit!), '1,500 mg');
  });

  it('calculates concentration-based liquids', () => {
    const strength = parseProductStrength('250 mg / 5 mL');
    const quantity = parseAdministrationQuantity('10', 'mL');
    assert.ok(strength);
    assert.ok(quantity);
    const result = multiplyStrengthByQuantity(strength, quantity);
    assert.equal(result.status, 'CALCULATED');
    assert.equal(result.minimum, 500);
    assert.equal(result.unit, 'mg');
  });

  it('does not calculate when administration unit does not match the strength denominator', () => {
    const strength = parseProductStrength('250 mg / 5 mL');
    const quantity = parseAdministrationQuantity('3', 'Tablet(s)');
    assert.ok(strength);
    assert.ok(quantity);
    assert.equal(multiplyStrengthByQuantity(strength, quantity).status, 'NOT_CALCULABLE');
  });

  it('does not sum combination-product strengths', () => {
    const strength = parseProductStrength('5 mg / 500 mg');
    const quantity = parseAdministrationQuantity('1', 'Tablet(s)');
    assert.ok(strength?.combination);
    assert.ok(quantity);
    assert.equal(multiplyStrengthByQuantity(strength, quantity).status, 'NOT_APPLICABLE');
  });

  it('avoids floating-point artifacts', () => {
    assert.equal(decimalMultiply(0.1, 0.2), 0.02);
    assert.equal(decimalMultiply(12.5, 2), 25);
    assert.equal(formatDoseNumber(1500), '1,500');
    assert.equal(formatDoseNumber(12.5), '12.5');
  });
});
