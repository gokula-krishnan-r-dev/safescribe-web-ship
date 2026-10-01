import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractNanpDigits,
  formatNanpPhoneDisplay,
  formatNanpPhoneInput,
  optionalPhoneError,
} from './phone';

describe('extractNanpDigits', () => {
  it('keeps 10 digits and drops a leading country code 1', () => {
    assert.equal(extractNanpDigits('7802502555'), '7802502555');
    assert.equal(extractNanpDigits('1-780-250-2555'), '7802502555');
    assert.equal(extractNanpDigits('+1 (780) 250-2555'), '7802502555');
    assert.equal(extractNanpDigits('780-250 2555 extra'), '7802502555');
  });
});

describe('formatNanpPhoneDisplay', () => {
  it('formats progressively into XXX-XXX-XXXX', () => {
    assert.equal(formatNanpPhoneDisplay('7'), '7');
    assert.equal(formatNanpPhoneDisplay('780'), '780');
    assert.equal(formatNanpPhoneDisplay('7802'), '780-2');
    assert.equal(formatNanpPhoneDisplay('780250'), '780-250');
    assert.equal(formatNanpPhoneDisplay('7802502'), '780-250-2');
    assert.equal(formatNanpPhoneDisplay('7802502555'), '780-250-2555');
    assert.equal(formatNanpPhoneDisplay('780-250 2555'), '780-250-2555');
  });
});

describe('formatNanpPhoneInput', () => {
  it('keeps the caret on the same digit after inserting hyphens', () => {
    const typed = formatNanpPhoneInput('7802', 4);
    assert.equal(typed.value, '780-2');
    assert.equal(typed.caret, 5);

    const pasted = formatNanpPhoneInput('7802502555', 10);
    assert.equal(pasted.value, '780-250-2555');
    assert.equal(pasted.caret, 12);
  });
});

describe('optionalPhoneError', () => {
  it('allows a blank number', () => {
    assert.equal(optionalPhoneError(''), undefined);
    assert.equal(optionalPhoneError('   '), undefined);
  });

  it('accepts a complete formatted NANP number', () => {
    assert.equal(optionalPhoneError('780-250-2555'), undefined);
  });

  it('rejects incomplete, invalid, or unformatted values', () => {
    assert.match(optionalPhoneError('780-250-255') ?? '', /10-digit/);
    assert.match(optionalPhoneError('7802502555') ?? '', /10-digit/);
    assert.match(optionalPhoneError('000-000-0000') ?? '', /10-digit/);
    assert.match(optionalPhoneError('180-250-2555') ?? '', /10-digit/);
  });
});
