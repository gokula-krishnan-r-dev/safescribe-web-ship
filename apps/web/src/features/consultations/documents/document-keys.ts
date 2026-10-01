import type { DocumentTypeId } from './types';

/** Canonical Prescribe-module document keys. */
export const PRESCRIBE_DOC_KEYS = {
  CONSULTATION_NOTE: 'consultation_note',
  PRESCRIPTION: 'prescription',
  PRESCRIBER_COMMUNICATION: 'prescriber_communication',
  PATIENT_CARE_SUMMARY: 'patient_care_summary',
} as const;

export const PRESCRIBE_DOC_IDS: DocumentTypeId[] = [
  PRESCRIBE_DOC_KEYS.CONSULTATION_NOTE,
  PRESCRIBE_DOC_KEYS.PRESCRIPTION,
  PRESCRIBE_DOC_KEYS.PRESCRIBER_COMMUNICATION,
  PRESCRIBE_DOC_KEYS.PATIENT_CARE_SUMMARY,
];

/** Prescribe documents that expose Send Fax (PCP letter + prescription). */
export const FAXABLE_PRESCRIBE_DOC_IDS: readonly DocumentTypeId[] = [
  PRESCRIBE_DOC_KEYS.PRESCRIPTION,
  PRESCRIBE_DOC_KEYS.PRESCRIBER_COMMUNICATION,
];

export function isFaxablePrescribeDocument(id: DocumentTypeId): boolean {
  return (FAXABLE_PRESCRIBE_DOC_IDS as readonly string[]).includes(id);
}

/** Legacy camelCase keys → canonical snake_case */
const LEGACY_TO_CANONICAL: Record<string, DocumentTypeId> = {
  dapNote: 'consultation_note',
  physicianLetter: 'prescriber_communication',
  patientHandout: 'patient_care_summary',
  consultation_note: 'consultation_note',
  prescription: 'prescription',
  prescriber_communication: 'prescriber_communication',
  patient_care_summary: 'patient_care_summary',
};

export function toCanonicalDocId(key: string): DocumentTypeId | null {
  return LEGACY_TO_CANONICAL[key] ?? null;
}

export function isPrescribeDocId(key: string): key is DocumentTypeId {
  return PRESCRIBE_DOC_IDS.includes(key as DocumentTypeId);
}
