import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySearchableSelectQuery,
  computeSearchableSelectPosition,
  isSearchableSelectQueryKey,
} from './searchable-select-position';

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9\s.+/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionMatchesQuery(
  option: { value: string; label: string; keywords?: string },
  query: string,
): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const haystack = normalizeSearchText(`${option.keywords ?? ''} ${option.label} ${option.value}`);
  return haystack.includes(q);
}

describe('computeSearchableSelectPosition', () => {
  it('places the panel below the trigger in viewport space', () => {
    const box = computeSearchableSelectPosition(
      { top: 80, bottom: 120, left: 40, width: 200 },
      { width: 800, height: 600 },
    );
    assert.equal(box.top, 126);
    assert.equal(box.left, 40);
    assert.equal(box.width, 280);
    assert.ok(box.maxHeight >= 160);
  });

  it('converts viewport coordinates into dialog-local space', () => {
    const box = computeSearchableSelectPosition(
      { top: 180, bottom: 220, left: 120, width: 300 },
      { width: 800, height: 600 },
      { top: 40, left: 80 },
    );
    assert.equal(box.top, 186);
    assert.equal(box.left, 40);
    assert.equal(box.width, 300);
  });
});

describe('searchable select query keys', () => {
  it('accepts typed characters and backspace without modifiers', () => {
    assert.equal(isSearchableSelectQueryKey('i', false), true);
    assert.equal(isSearchableSelectQueryKey('Backspace', false), true);
    assert.equal(isSearchableSelectQueryKey('i', true), false);
    assert.equal(isSearchableSelectQueryKey('Enter', false), false);
  });

  it('builds the filter string from keypresses', () => {
    assert.equal(applySearchableSelectQuery('', 'i'), 'i');
    assert.equal(applySearchableSelectQuery('in', 'h'), 'inh');
    assert.equal(applySearchableSelectQuery('inh', 'Backspace'), 'in');
  });

  it('matches inhalation when the pharmacist types inh', () => {
    const inhalation = {
      value: 'Inhalation',
      label: 'Inhalation',
      keywords: 'inhaled inhale inhaler neb nebulizer po inhalation',
    };
    assert.equal(optionMatchesQuery(inhalation, 'inh'), true);
    assert.equal(optionMatchesQuery({ value: 'Oral', label: 'Oral' }, 'inh'), false);
  });
});
