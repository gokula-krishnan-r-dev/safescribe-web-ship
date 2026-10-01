import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatFillDate } from './format';

describe('renew format', () => {
  it('displays fill dates as yyyy-mm-dd', () => {
    assert.equal(formatFillDate('2026-08-26'), '2026-08-26');
    assert.equal(formatFillDate('26-Aug-2026'), '2026-08-26');
    assert.equal(formatFillDate(''), null);
    assert.equal(formatFillDate(null), null);
  });
});
