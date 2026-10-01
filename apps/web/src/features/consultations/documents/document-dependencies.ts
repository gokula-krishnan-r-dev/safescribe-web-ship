import type { Consultation } from '../types';
import type {
  DocumentTypeId,
  PatientDocumentInfo,
  PrescriptionMedication,
} from './types';
import { formatPatientAddressInline } from './patient-address';
import { consultationHasPrescription } from './patient-address';

/** Stable fingerprint of patient fields that appear on clinical documents. */
export function patientInfoFingerprint(info: PatientDocumentInfo): string {
  const addr = formatPatientAddressInline(info.addressLines, info.address);
  return [
    info.name?.trim() ?? '',
    info.dateOfBirth?.trim() ?? '',
    info.patientId?.trim() ?? '',
    info.phone?.trim() ?? '',
    addr,
    info.sex?.trim() ?? '',
    info.age?.trim() ?? '',
  ].join('|');
}

/**
 * Documents whose headers / Rx blocks depend on patient demographics.
 * Spec: changing patient info marks these SOURCE_CHANGED.
 */
export const PATIENT_DEPENDENT_DOCS: DocumentTypeId[] = [
  'consultation_note',
  'prescription',
  'prescriber_communication',
  'patient_care_summary',
];

export function docsAffectedByPatientChange(
  previous: PatientDocumentInfo,
  next: PatientDocumentInfo,
  available: DocumentTypeId[],
): DocumentTypeId[] {
  if (patientInfoFingerprint(previous) === patientInfoFingerprint(next)) {
    return [];
  }
  return PATIENT_DEPENDENT_DOCS.filter((id) => available.includes(id));
}

export interface PrescriptionValidationResult {
  ok: boolean;
  errors: string[];
  medicationLabels: string[];
}

export function validatePrescriptionDocument(input: {
  consultation: Consultation;
  patientInfo: PatientDocumentInfo;
  medications?: PrescriptionMedication[];
}): PrescriptionValidationResult {
  const errors: string[] = [];
  const requiresRx = consultationHasPrescription(input.consultation);
  if (!requiresRx) {
    return { ok: true, errors: [], medicationLabels: [] };
  }

  // Patient demographics are optional on documents — only validate Rx content.
  const meds = input.medications ?? [];
  if (!meds.length) {
    errors.push('No prescription medication was selected.');
  } else {
    for (const med of meds) {
      if (!med.name?.trim()) errors.push('Medication name is missing.');
      if (!med.dosage?.trim() && !med.frequency?.trim() && !med.instructions?.trim()) {
        errors.push(`Directions are missing for ${med.name || 'a medication'}.`);
      }
    }
  }

  const medicationLabels = meds
    .map((m) => {
      const brand = m.name?.trim();
      if (!brand) return null;
      return m.genericName?.trim()
        ? `${brand} (${m.genericName.trim()})`
        : brand;
    })
    .filter((x): x is string => Boolean(x));

  return { ok: errors.length === 0, errors, medicationLabels };
}

export type PrescriptionCompletionBlocker = 'create' | 'review' | null;

/** Gate Complete & Delete when a prescription treatment was selected. */
export function getPrescriptionCompletionBlocker(input: {
  rxRequired: boolean;
  rxCreated: boolean;
  rxReviewed: boolean;
}): PrescriptionCompletionBlocker {
  if (!input.rxRequired) return null;
  if (!input.rxCreated) return 'create';
  if (!input.rxReviewed) return 'review';
  return null;
}

export function prescriptionCompletionMessage(
  blocker: PrescriptionCompletionBlocker,
): string | null {
  if (blocker === 'create') {
    return 'Create and review the Prescription before completing this consultation.';
  }
  if (blocker === 'review') {
    return 'Review the Prescription before completing this consultation.';
  }
  return null;
}

/** Enrich document meta bullets with live medication labels for the Rx card. */
export function enrichPrescriptionBullets(
  bullets: string[] | undefined,
  medicationLabels: string[],
): string[] {
  const base = bullets?.length
    ? bullets
    : ['Patient & PHN', 'Address', 'Sig & directions', 'Qty / refills'];
  if (!medicationLabels.length) return base.slice(0, 4);
  return [medicationLabels[0], ...base.filter((b) => b !== medicationLabels[0])].slice(
    0,
    4,
  );
}
