import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agePartsFromDateOfBirth,
  ageYearsFromDateOfBirth,
  ageYearsFromDemographics,
  dateOfBirthError,
  demographicsAgeFromDob,
  formatAgeDisplay,
  isDateOfBirthReady,
  isDateOfBirthUnavailable,
  formatIsoDateInput,
  isoCalendarDateError,
  parseIsoDateLocal,
  sanitizeDateOfBirth,
  toIsoCalendarDate,
} from './patient-age';
import { normalizePatientDemographics } from './patient-vitals';

describe('patient-age', () => {
  const asOf = new Date(2026, 7, 25); // 25 Aug 2026

  it('normalizes calendar dates to yyyy-mm-dd', () => {
    assert.equal(toIsoCalendarDate('2026-08-26'), '2026-08-26');
    assert.equal(toIsoCalendarDate('26-Aug-2026'), '2026-08-26');
    assert.equal(toIsoCalendarDate('2026-02-30'), null);
    assert.equal(isoCalendarDateError(''), null);
    assert.equal(isoCalendarDateError('2026-08'), 'Enter a complete date (yyyy-mm-dd).');
    assert.equal(isoCalendarDateError('2026-02-30'), 'Enter a valid date (yyyy-mm-dd).');
    assert.equal(isoCalendarDateError('2026-08-26', { max: '2026-08-25' }), 'Date cannot be in the future.');
    assert.equal(formatIsoDateInput('20260826'), '2026-08-26');
  });

  it('rejects invalid and future dates', () => {
    assert.equal(parseIsoDateLocal('2026-02-30'), null);
    assert.equal(dateOfBirthError(''), 'Required');
    assert.equal(dateOfBirthError('not-a-date'), 'Enter a valid date.');
    assert.equal(dateOfBirthError('2026-08-26', asOf), 'Date of birth cannot be in the future.');
    assert.equal(dateOfBirthError('1880-01-01', asOf), 'Enter a realistic date of birth.');
    assert.equal(dateOfBirthError('2000-10-15', asOf), null);
    assert.equal(sanitizeDateOfBirth('2026-02-30', asOf), '');
    assert.equal(sanitizeDateOfBirth('2000-10-15', asOf), '2000-10-15');
  });

  it('calculates completed years and total months from DOB', () => {
    assert.deepEqual(agePartsFromDateOfBirth('2000-10-15', asOf), {
      years: 25,
      months: 25 * 12 + 10,
    });
    assert.deepEqual(agePartsFromDateOfBirth('2000-08-26', asOf), {
      years: 25,
      months: 25 * 12 + 11,
    });
    assert.deepEqual(demographicsAgeFromDob('2000-10-15', asOf), {
      age: '25',
      ageUnit: 'years',
    });
  });

  it('stores neonates under 28 days in days', () => {
    assert.deepEqual(demographicsAgeFromDob('2026-08-20', asOf), {
      age: '5',
      ageUnit: 'days',
    });
    assert.equal(formatAgeDisplay('5', 'days'), '5 days');
    assert.equal(formatAgeDisplay('1', 'week'), '1 week');
  });

  it('stores infants under 24 months in months', () => {
    assert.deepEqual(demographicsAgeFromDob('2025-08-25', asOf), {
      age: '12',
      ageUnit: 'months',
    });
    assert.deepEqual(demographicsAgeFromDob('2024-08-25', asOf), {
      age: '2',
      ageUnit: 'years',
    });
  });

  it('prefers DOB over typed age for safety calculations', () => {
    const years = ageYearsFromDateOfBirth('2008-08-25', asOf);
    assert.ok(years != null);
    assert.equal(Math.round(years), 18);
    assert.equal(
      ageYearsFromDemographics(
        { age: '99', ageUnit: 'years', dateOfBirth: '2008-08-25' },
        asOf,
      ),
      years,
    );
    assert.equal(
      ageYearsFromDemographics({
        age: '18',
        ageUnit: 'months',
        dateOfBirthUnavailable: true,
      }),
      1.5,
    );
  });

  it('treats legacy age-only records as DOB unavailable', () => {
    assert.equal(isDateOfBirthUnavailable({ age: '45' }), true);
    assert.equal(isDateOfBirthUnavailable({ dateOfBirth: '2000-10-15' }), false);
    assert.equal(
      isDateOfBirthUnavailable({ dateOfBirthUnavailable: true, dateOfBirth: '2000-10-15' }),
      true,
    );
    assert.equal(isDateOfBirthReady({ dateOfBirth: '2000-10-15' }), true);
    assert.equal(isDateOfBirthReady({ dateOfBirthUnavailable: true, age: '32' }), true);
    assert.equal(isDateOfBirthReady({ dateOfBirthUnavailable: true }), false);
    assert.equal(formatAgeDisplay('25', 'years'), '25 years');
    assert.equal(formatAgeDisplay('1', 'months'), '1 month');
  });

  it('normalizes demographics so DOB drives stored age', () => {
    const withDob = normalizePatientDemographics({
      dateOfBirth: '2000-10-15',
      age: '99',
      sex: 'Female',
    });
    assert.equal(withDob.dateOfBirth, '2000-10-15');
    assert.equal(withDob.dateOfBirthUnavailable, false);
    assert.deepEqual(
      { age: withDob.age, ageUnit: withDob.ageUnit },
      demographicsAgeFromDob('2000-10-15'),
    );

    const unavailable = normalizePatientDemographics({
      dateOfBirth: '2000-10-15',
      dateOfBirthUnavailable: true,
      age: '32',
      ageUnit: 'years',
    });
    assert.equal(unavailable.dateOfBirth, undefined);
    assert.equal(unavailable.dateOfBirthUnavailable, true);
    assert.equal(unavailable.age, '32');

    const legacy = normalizePatientDemographics({ age: '45', sex: 'Male' });
    assert.equal(legacy.dateOfBirthUnavailable, undefined);
    assert.equal(legacy.age, '45');
  });
});
