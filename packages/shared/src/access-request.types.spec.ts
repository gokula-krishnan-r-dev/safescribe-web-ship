import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS_REQUEST_SOURCES,
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TAB_LABELS,
  accessRequestSourceLabel,
  accessRequestStatusLabel,
  formatCanadianPhoneDisplay,
  formatAccessRequestId,
  isValidOptionalPhone,
  licenceNumbersMatch,
  normalizeAccessEmail,
  normalizeAccessPhone,
  normalizeLicenceNumber,
  normalizePharmacyNameForMatch,
  pharmacyNamesMatch,
} from './access-request.types';

describe('access-request helpers', () => {
  it('normalizes email to lowercase trimmed', () => {
    assert.equal(normalizeAccessEmail('  Jane@Pharmacy.CA '), 'jane@pharmacy.ca');
  });

  it('collapses licence whitespace without forcing digits', () => {
    assert.equal(normalizeLicenceNumber('  AB  12345  '), 'AB 12345');
    assert.equal(licenceNumbersMatch('ab 12345', 'AB  12345'), true);
  });

  it('normalizes Canadian phone numbers', () => {
    assert.equal(normalizeAccessPhone(''), null);
    assert.equal(normalizeAccessPhone('780-123-4567'), '7801234567');
    assert.equal(normalizeAccessPhone('1 (780) 123-4567'), '7801234567');
    assert.equal(formatCanadianPhoneDisplay('7801234567'), '780-123 4567');
    assert.equal(isValidOptionalPhone(''), true);
    assert.equal(isValidOptionalPhone('7801234567'), true);
    assert.equal(isValidOptionalPhone('123'), false);
  });

  it('matches pharmacy names case-insensitively', () => {
    assert.equal(pharmacyNamesMatch('Main Street Pharmacy', 'main street pharmacy'), true);
  });

  it('normalizes pharmacy names for matching without changing meaning', () => {
    assert.equal(
      normalizePharmacyNameForMatch('AAA Homehealth Pharmacy & Café'),
      'aaa homehealth pharmacy and cafe',
    );
  });

  it('formats friendly request identifiers', () => {
    assert.equal(formatAccessRequestId(125), 'REQ-000125');
  });

  it('labels known statuses and sources', () => {
    assert.equal(accessRequestStatusLabel(ACCESS_REQUEST_STATUSES.PENDING), 'Pending Review');
    assert.equal(ACCESS_REQUEST_TAB_LABELS.all, 'All Requests');
    assert.equal(accessRequestSourceLabel(ACCESS_REQUEST_SOURCES.ALBERTA_QR_LAUNCH), 'Web Form — Alberta Launch');
    assert.equal(
      accessRequestSourceLabel(ACCESS_REQUEST_SOURCES.ALBERTA_QR_LAUNCH, { source: 'fax', medium: 'qr' }),
      'QR Code — Alberta Launch',
    );
  });
});
