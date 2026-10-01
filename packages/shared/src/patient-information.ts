import { dateOfBirthError, demographicsAgeFromDob, isDateOfBirthReady } from './patient-age';

export type PatientInfoUnresolved =
  | 'dob'
  | 'age'
  | 'sex'
  | 'allergies'
  | 'medications'
  | 'conditions';

export type PatientInformationCheckInput = {
  dateOfBirth?: string | null;
  dateOfBirthUnavailable?: boolean | null;
  age?: string | number | null;
  sex?: string | null;
  allergiesCount: number;
  noKnownAllergies: boolean;
  medicationsCount: number;
  noCurrentMedications: boolean;
  conditionsCount: number;
  noKnownConditions: boolean;
};

export function allergiesResolved(input: Pick<PatientInformationCheckInput, 'allergiesCount' | 'noKnownAllergies'>): boolean {
  return input.allergiesCount > 0 || input.noKnownAllergies === true;
}

export function medicationsResolved(
  input: Pick<PatientInformationCheckInput, 'medicationsCount' | 'noCurrentMedications'>,
): boolean {
  return input.medicationsCount > 0 || input.noCurrentMedications === true;
}

export function conditionsResolved(
  input: Pick<PatientInformationCheckInput, 'conditionsCount' | 'noKnownConditions'>,
): boolean {
  return input.conditionsCount > 0 || input.noKnownConditions === true;
}

export function patientSnapshotValid(
  input: Pick<PatientInformationCheckInput, 'dateOfBirth' | 'dateOfBirthUnavailable' | 'age' | 'sex'>,
): boolean {
  return Boolean(input.sex?.trim()) && isDateOfBirthReady(input);
}

/** When both DOB and age are present, they must agree within one year. */
export function dobAgeConsistent(input: {
  dateOfBirth?: string | null;
  dateOfBirthUnavailable?: boolean | null;
  age?: string | number | null;
}): boolean {
  if (input.dateOfBirthUnavailable) return true;
  if (dateOfBirthError(input.dateOfBirth) != null) return true;
  const ageRaw = String(input.age ?? '').trim();
  if (!ageRaw) return true;
  const entered = Number(ageRaw);
  if (!Number.isFinite(entered)) return false;
  const derived = demographicsAgeFromDob(input.dateOfBirth ?? '');
  if (!derived?.age || derived.ageUnit !== 'years') return true;
  const expected = Number(derived.age);
  if (!Number.isFinite(expected)) return true;
  return Math.abs(entered - expected) <= 1;
}

export function firstUnresolvedPatientInformation(
  input: PatientInformationCheckInput,
): PatientInfoUnresolved | null {
  if (!isDateOfBirthReady(input)) {
    return input.dateOfBirthUnavailable ? 'age' : 'dob';
  }
  if (!dobAgeConsistent(input)) return 'age';
  if (!input.sex?.trim()) return 'sex';
  if (!allergiesResolved(input)) return 'allergies';
  if (!medicationsResolved(input)) return 'medications';
  if (!conditionsResolved(input)) return 'conditions';
  return null;
}

export function canConfirmPatientInformation(input: PatientInformationCheckInput): boolean {
  return firstUnresolvedPatientInformation(input) == null;
}
