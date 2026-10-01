import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPhnDigits, optionalPhnError } from './phn';

describe('formatPhnDigits', () => {
  it('keeps only digits and caps at nine', () => {
    assert.equal(formatPhnDigits('123456789'), '123456789');
    assert.equal(formatPhnDigits('1234-567-890'), '123456789');
    assert.equal(formatPhnDigits('12ab34'), '1234');
    assert.equal(formatPhnDigits(''), '');
  });
});

describe('optionalPhnError', () => {
  it('allows a blank PHN', () => {
    assert.equal(optionalPhnError(''), undefined);
    assert.equal(optionalPhnError('   '), undefined);
  });

  it('accepts exactly nine digits', () => {
    assert.equal(optionalPhnError('123456789'), undefined);
  });

  it('rejects shorter, longer, or non-digit values', () => {
    assert.match(optionalPhnError('12345678') ?? '', /9-digit/);
    assert.match(optionalPhnError('1234567890') ?? '', /9-digit/);
    assert.match(optionalPhnError('12345-6789') ?? '', /9-digit/);
    assert.match(optionalPhnError('ABC') ?? '', /9-digit/);
  });
});
