import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calendarDateInTimeZone,
  completedYears,
  completedMonths,
  completedDays,
  validateOptionalDob,
  optionalDobBlocksDocumentActions,
  mismatchAlertCopy,
  stripUncommittedPatientDob,
  committedOptionalDob,
  seedDocumentationDateOfBirth,
  settleOptionalDobResult,
  recordedAgeForDocumentation,
  documentationDobFieldError,
} from './optional-dob';

describe('optional DOB vs recorded age', () => {
  const recorded = {
    value: 27,
    unit: 'YEAR' as const,
    source: 'MANUAL' as const,
    asOfDate: '2026-09-03',
  };

  it('does not shift a date-only DOB through UTC parsing', () => {
    assert.equal(completedYears('2020-05-15', '2026-09-03'), 6);
    assert.equal(calendarDateInTimeZone('2026-09-03T06:30:00.000Z', 'America/Edmonton'), '2026-09-03');
  });

  it('rejects the 27-year intake vs 2020-05-15 mismatch', () => {
    const result = validateOptionalDob({
      dob: '2020-05-15',
      recordedAge: recorded,
      consultationDate: '2026-09-03',
    });
    assert.equal(result.status, 'MISMATCH');
    assert.equal(result.derivedAge?.value, 6);
    assert.equal(result.derivedAge?.unit, 'YEAR');
    assert.equal(result.recordedAge?.value, 27);
    assert.equal(optionalDobBlocksDocumentActions(result.status), true);
    const copy = mismatchAlertCopy(result);
    assert.match(copy?.message ?? '', /6 years/);
    assert.match(copy?.message ?? '', /27 years/);
  });

  it('accepts a matching DOB for the same recorded years', () => {
    const result = validateOptionalDob({
      dob: '1999-05-15',
      recordedAge: recorded,
      consultationDate: '2026-09-03',
    });
    assert.equal(result.status, 'MATCH');
    assert.equal(result.derivedAge?.value, 27);
    assert.equal(optionalDobBlocksDocumentActions(result.status), false);
  });

  it('treats a blank optional DOB as valid', () => {
    const result = validateOptionalDob({
      dob: '',
      recordedAge: recorded,
      consultationDate: '2026-09-03',
    });
    assert.equal(result.status, 'NOT_ENTERED');
    assert.equal(optionalDobBlocksDocumentActions(result.status), false);
  });

  it('stays silent while the date is still being typed', () => {
    const result = validateOptionalDob({
      dob: '2020-05',
      recordedAge: recorded,
      consultationDate: '2026-09-03',
    });
    assert.equal(result.status, 'EDITING');
  });

  it('surfaces a format error once a partial date has settled', () => {
    const typing = validateOptionalDob({
      dob: '1',
      recordedAge: recorded,
      consultationDate: '2026-09-03',
    });
    assert.equal(typing.status, 'EDITING');
    assert.equal(settleOptionalDobResult(typing).status, 'EDITING');
    const settled = settleOptionalDobResult(typing, { settled: true });
    assert.equal(settled.status, 'INVALID');
    assert.equal(settled.errorCode, 'INCOMPLETE_DOB');
    assert.match(settled.message ?? '', /YYYY-MM-DD/);
  });

  it('rejects impossible and future calendar dates', () => {
    assert.equal(
      validateOptionalDob({
        dob: '2020-02-30',
        recordedAge: recorded,
        consultationDate: '2026-09-03',
      }).status,
      'INVALID',
    );
    assert.equal(
      validateOptionalDob({
        dob: '2026-09-04',
        recordedAge: recorded,
        consultationDate: '2026-09-03',
      }).errorCode,
      'DOB_AFTER_CONSULTATION',
    );
  });

  it('does not apply a ±1 year tolerance', () => {
    const result = validateOptionalDob({
      dob: '1998-05-15',
      recordedAge: recorded,
      consultationDate: '2026-09-03',
    });
    assert.equal(result.status, 'MISMATCH');
    assert.equal(result.derivedAge?.value, 28);
  });

  it('compares birthday boundaries in completed years', () => {
    assert.equal(completedYears('1999-09-03', '2026-09-03'), 27);
    assert.equal(completedYears('1999-09-04', '2026-09-03'), 26);
  });

  it('compares pediatric ages in the recorded unit', () => {
    assert.equal(completedMonths('2025-11-03', '2026-09-03'), 10);
    assert.equal(completedDays('2026-08-20', '2026-09-03'), 14);
    const months = validateOptionalDob({
      dob: '2025-11-03',
      recordedAge: { value: 10, unit: 'MONTH', asOfDate: '2026-09-03' },
      consultationDate: '2026-09-03',
    });
    assert.equal(months.status, 'MATCH');
    const mismatchMonths = validateOptionalDob({
      dob: '2025-11-03',
      recordedAge: { value: 8, unit: 'MONTH', asOfDate: '2026-09-03' },
      consultationDate: '2026-09-03',
    });
    assert.equal(mismatchMonths.status, 'MISMATCH');
  });

  it('handles leap-day DOB on a non-leap consultation year', () => {
    assert.equal(completedYears('2016-02-29', '2025-02-28'), 8);
    assert.equal(completedYears('2016-02-29', '2025-03-01'), 9);
  });

  it('never commits a mismatched draft DOB onto clinical age, but keeps it on document identity', () => {
    const demo = {
      age: '27',
      ageUnit: 'years',
      dateOfBirthUnavailable: true,
    };
    const kept = stripUncommittedPatientDob(
      { patientInfo: { name: 'Jane', dateOfBirth: '2020-05-15' } },
      demo,
      '2026-09-03',
    );
    assert.equal(kept.patientInfo?.dateOfBirth, '2020-05-15');
    assert.equal(kept.patientInfo?.name, 'Jane');
    const strippedPartial = stripUncommittedPatientDob(
      { patientInfo: { name: 'Jane', dateOfBirth: '2020-05' } },
      demo,
      '2026-09-03',
    );
    assert.equal(strippedPartial.patientInfo?.dateOfBirth, undefined);
    assert.equal(
      committedOptionalDob({
        draftDob: '1999-05-15',
        demographics: demo,
        consultationDate: '2026-09-03',
      }),
      '1999-05-15',
    );
    assert.equal(
      committedOptionalDob({
        draftDob: '2020-05-15',
        demographics: demo,
        consultationDate: '2026-09-03',
      }),
      '',
    );
    assert.equal(
      seedDocumentationDateOfBirth({
        storedDob: '2020-05-15',
        demographics: demo,
        consultationDate: '2026-09-03',
      }),
      '2020-05-15',
    );
    assert.equal(
      seedDocumentationDateOfBirth({
        storedDob: '',
        demographics: { dateOfBirth: '1990-01-15' },
        consultationDate: '2026-09-03',
      }),
      '1990-01-15',
    );
  });
});

describe('documentation DOB vs stated consultation age', () => {
  it('prefers structured intake age over conversation text', () => {
    const resolved = recordedAgeForDocumentation({
      demographics: { age: '25', ageUnit: 'years' },
      consultationDate: '2026-09-15',
      narrative: 'Patients have a cool sore age of 40',
    });
    assert.equal(resolved?.origin, 'intake');
    assert.equal(resolved?.age.value, 25);
  });

  it('reads age of 25 from conversation summary when intake age is missing', () => {
    const resolved = recordedAgeForDocumentation({
      demographics: {},
      consultationDate: '2026-09-15',
      narrative: 'Presenting concern Patients have a cool sore age of 25',
    });
    assert.equal(resolved?.origin, 'conversation');
    assert.equal(resolved?.age.value, 25);
    assert.equal(resolved?.age.unit, 'YEAR');
  });

  it('does not treat medication doses as an age', () => {
    const resolved = recordedAgeForDocumentation({
      demographics: {},
      consultationDate: '2026-09-15',
      narrative: 'Apply cream 25 mg twice daily for 5 days',
    });
    assert.equal(resolved, null);
  });

  it('explains a 2002 DOB that does not match a recorded age of 25', () => {
    const recorded = {
      value: 25,
      unit: 'YEAR' as const,
      source: 'MANUAL' as const,
      asOfDate: '2026-09-15',
    };
    const result = validateOptionalDob({
      dob: '2002-12-08',
      recordedAge: recorded,
      consultationDate: '2026-09-15',
    });
    assert.equal(result.status, 'MISMATCH');
    assert.equal(result.derivedAge?.value, 23);
    const intakeMessage = documentationDobFieldError(result, 'intake');
    assert.match(intakeMessage ?? '', /23 years/);
    assert.match(intakeMessage ?? '', /25 years/);
    assert.match(intakeMessage ?? '', /intake/);
    const conversationMessage = documentationDobFieldError(result, 'conversation');
    assert.match(conversationMessage ?? '', /conversation summary/);
  });
});
