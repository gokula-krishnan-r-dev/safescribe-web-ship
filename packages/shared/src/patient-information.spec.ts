import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allergiesResolved,
  canConfirmPatientInformation,
  dobAgeConsistent,
  firstUnresolvedPatientInformation,
} from './patient-information';

const ready = {
  dateOfBirth: '1990-01-15',
  dateOfBirthUnavailable: false,
  age: '36',
  sex: 'Male',
  allergiesCount: 1,
  noKnownAllergies: false,
  medicationsCount: 1,
  noCurrentMedications: false,
  conditionsCount: 1,
  noKnownConditions: false,
};

describe('patient information confirmation', () => {
  it('allows confirm when snapshot and three mandatory rows are resolved', () => {
    assert.equal(canConfirmPatientInformation(ready), true);
    assert.equal(firstUnresolvedPatientInformation(ready), null);
  });

  it('treats no-known checkboxes as resolving empty rows', () => {
    assert.equal(allergiesResolved({ allergiesCount: 0, noKnownAllergies: true }), true);
    assert.equal(
      canConfirmPatientInformation({
        ...ready,
        allergiesCount: 0,
        noKnownAllergies: true,
        medicationsCount: 0,
        noCurrentMedications: true,
        conditionsCount: 0,
        noKnownConditions: true,
      }),
      true,
    );
  });

  it('blocks confirm until the first unresolved required item', () => {
    assert.equal(
      firstUnresolvedPatientInformation({ ...ready, dateOfBirth: '', age: '' }),
      'dob',
    );
    assert.equal(
      firstUnresolvedPatientInformation({ ...ready, sex: '' }),
      'sex',
    );
    assert.equal(
      firstUnresolvedPatientInformation({
        ...ready,
        allergiesCount: 0,
        noKnownAllergies: false,
      }),
      'allergies',
    );
  });

  it('does not treat lifestyle or vitals as required', () => {
    assert.equal(canConfirmPatientInformation(ready), true);
  });

  it('rejects an age that does not match the date of birth', () => {
    assert.equal(dobAgeConsistent({ dateOfBirth: '1990-01-15', age: '20' }), false);
    assert.equal(
      firstUnresolvedPatientInformation({ ...ready, age: '20' }),
      'age',
    );
  });
});
