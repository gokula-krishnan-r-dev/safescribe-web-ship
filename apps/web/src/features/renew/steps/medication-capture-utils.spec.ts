import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  captureGridClass,
  digitsOnly,
  formatFileBytes,
  isImageFile,
  isRenewSearchResultAdded,
  isUploadFile,
  pasteEventShouldIgnore,
  POPULAR_RENEW_SEARCHES,
  renewSearchAddedLookup,
} from './medication-capture-utils';

describe('renew medication capture helpers', () => {
  it('keeps three equal columns when no method is active', () => {
    assert.equal(captureGridClass('none'), 'renew-capture-grid none');
  });

  it('expands the active capture control on desktop', () => {
    assert.equal(captureGridClass('search'), 'renew-capture-grid search');
    assert.equal(captureGridClass('screenshot'), 'renew-capture-grid paste');
    assert.equal(captureGridClass('upload'), 'renew-capture-grid upload');
  });

  it('formats file sizes for pharmacists', () => {
    assert.equal(formatFileBytes(512), '512 B');
    assert.equal(formatFileBytes(2048), '2 KB');
    assert.equal(formatFileBytes(2 * 1024 * 1024), '2.0 MB');
  });

  it('accepts screenshot images and rejects PDF in paste', () => {
    const png = new File(['x'], 'shot.png', { type: 'image/png' });
    const pdf = new File(['x'], 'profile.pdf', { type: 'application/pdf' });
    assert.equal(isImageFile(png), true);
    assert.equal(isImageFile(pdf), false);
    assert.equal(isUploadFile(pdf), true);
  });

  it('lists the screenshot popular searches', () => {
    assert.deepEqual([...POPULAR_RENEW_SEARCHES], [
      'Amlodipine',
      'Metformin',
      'Ramipril',
      'Rosuvastatin',
      'Pantoprazole',
    ]);
  });

  it('does not treat an empty paste target as a text field', () => {
    assert.equal(pasteEventShouldIgnore(null), false);
    assert.equal(pasteEventShouldIgnore({ tagName: 'INPUT' } as unknown as EventTarget), true);
    assert.equal(pasteEventShouldIgnore({ tagName: 'DIV' } as unknown as EventTarget), false);
  });

  it('marks search results already on the added list by concept or DIN', () => {
    assert.equal(digitsOnly('DIN 02353377'), '02353377');
    const lookup = renewSearchAddedLookup([
      { normalized: { medicationConceptId: 'ccdd-metformin-500', din: '02353377' } },
    ]);
    assert.equal(
      isRenewSearchResultAdded({ id: 'ccdd-metformin-500', codeDisplay: 'DIN 00000000' }, lookup),
      true,
    );
    assert.equal(
      isRenewSearchResultAdded({ id: 'other', codeDisplay: 'DIN 02353377' }, lookup),
      true,
    );
    assert.equal(
      isRenewSearchResultAdded({ id: 'other', codeDisplay: 'DIN 11111111' }, lookup),
      false,
    );
  });
});
