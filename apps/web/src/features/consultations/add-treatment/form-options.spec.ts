import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FORM_OPTIONS,
  QUANTITY_UNITS,
  findFormOption,
  formSelectOptions,
  quantityUnitSelectOptions,
  resolveFormValue,
  resolveSelectValue,
  unitSelectBinding,
} from './form-options';

describe('form and quantity unit catalog', () => {
  it('includes screenshot dose forms in order', () => {
    const expected = [
      'Application(s)',
      'Applicator',
      'Bag(s)',
      'Bottle',
      'Box(es)',
      'Buccal Tablet',
      'Can',
      'Capsule(s)',
      'Cartridge(s)',
      'Cream',
      'Cubic centimeter',
      'Cup(s)',
      'Disks',
      'Dose',
      'Drop(s)',
      'Each',
      'Fluid Ounce',
      'g',
      'Implant(s)',
      'Inhalation(s)',
      'Insert(s)',
      'International units',
      'kg',
      'Litre(s)',
      'Lozenge(s)',
      'mcg',
      'mEq',
      'mg',
      'Micromole',
      'Millimole',
      'Milliunit',
      'mL',
      'Mole',
      'Nebule(s)',
      'Ounce',
      'Package(s)',
      'Packet(s)',
      'Pad(s)',
      'Patch(es)',
      'Pellet(s)',
      'Pen',
      'Pint',
      'Protein Unit',
      'Puffs',
      'Ring(s)',
      'Sniff(s)',
      'Spray(s)',
      'Stick(s)',
      'Strip(s)',
      'Suppositories',
      'Tablespoon(s)',
      'Tablet(s)',
      'Tampon(s)',
      'Teaspoon(s)',
      'Tube',
      'Unit',
      'Units',
      'Vial(s)',
      'Wafer(s)',
    ];
    assert.deepEqual([...FORM_OPTIONS], expected);
  });

  it('keeps device and kit units on the quantity picker', () => {
    assert.ok(QUANTITY_UNITS.includes('Device(s)'));
    assert.ok(QUANTITY_UNITS.includes('Kit(s)'));
    assert.ok(QUANTITY_UNITS.includes('Canister(s)'));
    assert.ok(QUANTITY_UNITS.includes('Inhaler(s)'));
    assert.ok(!(FORM_OPTIONS as readonly string[]).includes('Device(s)'));
  });

  it('resolves legacy labels to screenshot values', () => {
    assert.equal(resolveFormValue('Puff(s)'), 'Puffs');
    assert.equal(resolveFormValue('Suppository'), 'Suppositories');
    assert.equal(resolveFormValue('Bottle(s)'), 'Bottle');
    assert.equal(resolveFormValue('Tube(s)'), 'Tube');
    assert.equal(resolveFormValue('Pack(s)'), 'Package(s)');
    assert.equal(resolveFormValue('tab'), 'Tablet(s)');
    assert.equal(findFormOption('caps'), 'Capsule(s)');
  });

  it('keeps unknown custom forms', () => {
    assert.equal(resolveFormValue('chewable tab'), 'chewable tab');
    assert.equal(formSelectOptions('chewable tab')[0]?.value, 'chewable tab');
  });

  it('filters quantity options by search keywords', () => {
    const options = quantityUnitSelectOptions();
    const iu = options.find((option) => option.value === 'International units');
    assert.ok(iu?.keywords?.includes('iu'));
    const tab = options.find((option) => option.value === 'Tablet(s)');
    assert.ok(tab?.keywords?.includes('tab'));
  });

  it('keeps product-use labels like Tube(s) selectable against catalog aliases', () => {
    const allowed = ['g', 'Tube(s)'];
    const binding = unitSelectBinding('quantity', 'Tube', allowed);
    assert.equal(binding.value, 'Tube(s)');
    assert.deepEqual(
      binding.options.map((option) => option.value),
      ['g', 'Tube(s)'],
    );
    assert.ok(binding.valuesEqual('Tube(s)', 'Tube'));
    assert.ok(binding.options.find((option) => option.value === 'g')?.keywords?.includes('gram'));
    const cubic = binding.searchOptions.find((option) => option.value === 'Cubic centimeter');
    assert.ok(cubic);
    assert.ok(cubic?.keywords?.includes('cube'));
    assert.ok(
      binding.options.find((option) => option.value === 'Tube(s)')?.keywords?.includes('tube'),
    );
  });

  it('keeps a searched unit such as cubic centimeter after it is chosen', () => {
    const binding = unitSelectBinding('quantity', 'Cubic centimeter', ['g', 'Tube(s)']);
    assert.equal(binding.value, 'Cubic centimeter');
    assert.ok(binding.options.some((option) => option.value === 'Cubic centimeter'));
  });

  it('matches bottle and puff aliases used by product-use mapping', () => {
    assert.equal(
      resolveSelectValue(quantityUnitSelectOptions('', ['mL', 'Bottle(s)']), 'Bottle'),
      'Bottle(s)',
    );
    assert.equal(resolveSelectValue(formSelectOptions('', ['Puff(s)']), 'Puffs'), 'Puff(s)');
  });
});
