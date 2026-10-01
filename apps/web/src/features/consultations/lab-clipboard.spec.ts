import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  htmlFragmentToPlainText,
  insertTextAtCaret,
  isEditablePasteTarget,
  laboratoryTextFromClipboardData,
} from './lab-clipboard';

describe('lab clipboard paste', () => {
  it('uses plain text when the clipboard includes it', () => {
    assert.equal(
      laboratoryTextFromClipboardData({
        plain: 'HbA1c: 7.2% — Jul 20, 2026',
        html: '<p>ignored html</p>',
      }),
      'HbA1c: 7.2% — Jul 20, 2026',
    );
  });

  it('recovers laboratory values from HTML-only EMR / PDF copies', () => {
    const html =
      '<html><body><table><tr><td>HbA1c</td><td>7.2%</td></tr><tr><td>eGFR</td><td>65</td></tr></table></body></html>';
    const text = laboratoryTextFromClipboardData({ plain: '  ', html });
    assert.match(text, /HbA1c/);
    assert.match(text, /7\.2%/);
    assert.match(text, /eGFR/);
  });

  it('strips tags from an HTML fragment', () => {
    assert.equal(htmlFragmentToPlainText('<p>Creatinine: 98 µmol/L</p>'), 'Creatinine: 98 µmol/L');
  });

  it('inserts at the caret without wiping existing values', () => {
    const result = insertTextAtCaret('A1c  ', '7.2%', {
      selectionStart: 5,
      selectionEnd: 5,
    });
    assert.equal(result.next, 'A1c  7.2%');
    assert.equal(result.caret, 9);
  });

  it('does not treat a textarea as a screenshot drop target', () => {
    const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
    assert.equal(isEditablePasteTarget(textarea as unknown as EventTarget), true);
    assert.equal(isEditablePasteTarget(null), false);
  });
});
