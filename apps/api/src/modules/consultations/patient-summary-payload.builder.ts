import {
  buildPatientSummaryPayload,
  type PatientSummaryPayload,
  type PatientSummarySource,
} from '@safescript/shared';

type ConsultationRecord = {
  chiefComplaint?: string | null;
  createdAt?: Date | string | null;
  consultationMode?: string | null;
  demographics?: unknown;
  treatmentPlan?: unknown;
  counsellingNotes?: unknown;
  redFlags?: unknown;
  eligibility?: unknown;
  documentation?: unknown;
};

/**
 * Dedicated Patient Care Summary mapper. Do not send raw consultation,
 * pathway questions, or medication database objects to the handout writer.
 */
export function buildPatientSummaryPayloadFromConsultation(
  consultation: ConsultationRecord,
  extras: {
    pathway?: { condition?: string | null; name?: string | null } | null;
    clinicalJudgmentAssessment?: PatientSummarySource['clinicalJudgmentAssessment'];
    selectedLanguage?: string | null;
    pharmacyName?: string | null;
    pharmacyPhone?: string | null;
    pharmacyAddress?: string | null;
  } = {},
): PatientSummaryPayload {
  const docs = (consultation.documentation ?? {}) as {
    patient_care_summary?: { handoutLanguage?: string };
    patientHandout?: { handoutLanguage?: string };
  };
  const source: PatientSummarySource = {
    chiefComplaint: consultation.chiefComplaint,
    createdAt: consultation.createdAt,
    consultationMode: consultation.consultationMode,
    demographics: consultation.demographics,
    treatmentPlan: consultation.treatmentPlan,
    counsellingNotes: consultation.counsellingNotes,
    redFlags: consultation.redFlags,
    eligibility: consultation.eligibility,
    pathway: extras.pathway ?? null,
    clinicalJudgmentAssessment: extras.clinicalJudgmentAssessment ?? null,
    selectedLanguage:
      extras.selectedLanguage ??
      docs.patient_care_summary?.handoutLanguage ??
      docs.patientHandout?.handoutLanguage ??
      'en',
    pharmacyName: extras.pharmacyName ?? null,
    pharmacyPhone: extras.pharmacyPhone ?? null,
    pharmacyAddress: extras.pharmacyAddress ?? null,
  };
  return buildPatientSummaryPayload(source);
}
