import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  finalizePatientDocumentInfo,
  formatPatientAddressLine,
} from './patient-address';

describe('formatPatientAddressLine', () => {
  it('title-cases a messy street and city and joins a split civic number', () => {
    assert.equal(
      formatPatientAddressLine('325, wEST sTREET, eDMONTON'),
      '325 West Street, Edmonton',
    );
  });

  it('uppercases province codes and normalizes a Canadian postal code', () => {
    assert.equal(
      formatPatientAddressLine('123 jasper avenue, edmonton, ab t5j1n3'),
      '123 Jasper Avenue, Edmonton, AB T5J 1N3',
    );
  });

  it('keeps directionals, PO Box, and hyphenated / apostrophe names', () => {
    assert.equal(
      formatPatientAddressLine('12a west-end road nw, calgary, ab'),
      '12A West-End Road NW, Calgary, AB',
    );
    assert.equal(
      formatPatientAddressLine("po box 12, o'leary street, edmonton"),
      "PO Box 12, O'Leary Street, Edmonton",
    );
  });

  it('collapses extra spaces and leaves a blank address empty', () => {
    assert.equal(formatPatientAddressLine('  100   main   st  '), '100 Main St');
    assert.equal(formatPatientAddressLine('   '), '');
  });
});

describe('finalizePatientDocumentInfo address', () => {
  it('formats an unstructured address on save even if blur did not run', () => {
    const info = finalizePatientDocumentInfo({
      address: '325, wEST sTREET, eDMONTON',
    });
    assert.equal(info.address, '325 West Street, Edmonton');
  });
});
