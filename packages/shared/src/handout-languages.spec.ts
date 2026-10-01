import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { questionsContactLine } from './handout-languages';

describe('questionsContactLine', () => {
  it('formats a structured Call us / Tel / identity block', () => {
    const text = questionsContactLine(
      'Edmonton Test Pharmacy',
      '7802223333',
      'en',
      '123 Main Street, Edmonton T1A 1A1',
    );
    assert.equal(
      text,
      [
        'Call us at:',
        'Tel: 780-222 3333',
        'Edmonton Test Pharmacy, 123 Main Street, Edmonton T1A 1A1',
      ].join('\n'),
    );
  });

  it('does not duplicate the pharmacy name when the address already starts with it', () => {
    const text = questionsContactLine(
      'Example Pharmacy',
      '780-000-0000',
      'en',
      'Example Pharmacy, 123 Main Street, Edmonton, AB',
    );
    assert.equal(
      text,
      [
        'Call us at:',
        'Tel: 780-000 0000',
        'Example Pharmacy, 123 Main Street, Edmonton, AB',
      ].join('\n'),
    );
  });

  it('omits Call us / Tel when there is no phone', () => {
    assert.equal(
      questionsContactLine('Example Pharmacy', '', 'en', '123 Main Street'),
      'Example Pharmacy, 123 Main Street',
    );
  });

  it('uses French chrome for fr-CA', () => {
    const text = questionsContactLine('Pharmacie Exemple', '7800000000', 'fr-CA', '123 rue Principale');
    assert.equal(
      text,
      ['Appelez-nous :', 'Tél. : 780-000 0000', 'Pharmacie Exemple, 123 rue Principale'].join('\n'),
    );
  });

  it('returns empty when no pharmacy details are supplied', () => {
    assert.equal(questionsContactLine('', '', 'en', ''), '');
  });
});
