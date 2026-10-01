import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAuthoritativeDob,
  applyMatchingDob,
  evaluateStoredOptionalDob,
  sanitizeDocumentationDob,
  unresolvedDocumentationDob,
} from './optional-dob.util';

describe('optional DOB API helpers', () => {
  const demo = {
    age: '27',
    ageUnit: 'years',
    dateOfBirthUnavailable: true,
  };

  it('returns MISMATCH without treating the draft as committed', () => {
    const result = evaluateStoredOptionalDob({
      dob: '2020-05-15',
      demographics: demo,
      consultationDate: '2026-09-03',
    });
    assert.equal(result.status, 'MISMATCH');
    assert.equal(result.derivedAge?.value, 6);
    assert.equal(result.recordedAge?.value, 27);
  });

  it('keeps a valid documentation DOB even when it does not match intake age', () => {
    const kept = sanitizeDocumentationDob(
      { patientInfo: { name: 'Jane', dateOfBirth: '2020-05-15' } },
      demo,
      '2026-09-03',
    );
    assert.equal(
      (kept.patientInfo as { dateOfBirth?: string }).dateOfBirth,
      '2020-05-15',
    );
    assert.equal(
      unresolvedDocumentationDob(
        { patientInfo: { dateOfBirth: '2020-05-15' } },
        demo,
        '2026-09-03',
      ),
      'Resolve the date of birth and recorded age before creating documents.',
    );
  });

  it('strips an incomplete documentation DOB', () => {
    const stripped = sanitizeDocumentationDob(
      { patientInfo: { name: 'Jane', dateOfBirth: '2020-05' } },
      demo,
      '2026-09-03',
    );
    assert.equal(
      (stripped.patientInfo as { dateOfBirth?: string }).dateOfBirth,
      undefined,
    );
  });

  it('keeps a matching documentation DOB', () => {
    const next = applyMatchingDob({ ...demo }, '1999-05-15', {
      value: 27,
      unit: 'YEAR',
      source: 'MANUAL',
      asOfDate: '2026-09-03',
    });
    assert.equal(next.dateOfBirth, '1999-05-15');
    assert.equal(next.dateOfBirthUnavailable, false);
    assert.equal(next.age, '27');
  });

  it('updates clinical age when DOB is accepted as authoritative', () => {
    const next = applyAuthoritativeDob(
      { ...demo },
      '2020-05-15',
      { value: 27, unit: 'YEAR', source: 'MANUAL', asOfDate: '2026-09-03' },
      '2026-09-03',
    );
    assert.equal(next.dateOfBirth, '2020-05-15');
    assert.equal(next.age, '6');
    assert.equal(next.ageUnit, 'years');
    assert.deepEqual(next.originalManualAge, { value: 27, unit: 'YEAR' });
  });
});
