import {
  buildPcpCommunicationPayload,
  type PcpCommunicationPayload,
  type PcpPayloadSource,
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
  selectedPathwayId?: string | null;
};

/**
 * Dedicated PCP letter mapper. Do not send the raw consultation / DAP payload
 * to the PCP writer.
 */
export function buildPcpCommunicationPayloadFromConsultation(
  consultation: ConsultationRecord,
  extras: {
    pharmacist?: { firstName?: string | null; lastName?: string | null } | null;
    pathway?: { condition?: string | null; name?: string | null } | null;
    clinicalJudgmentAssessment?: PcpPayloadSource['clinicalJudgmentAssessment'];
    treatmentRationale?: PcpPayloadSource['treatmentRationale'];
    referralOutcome?: PcpPayloadSource['referralOutcome'];
    patientDisplayName?: string | null;
    pcpDisplayName?: string | null;
    pharmacistCredentials?: string | null;
  } = {},
): PcpCommunicationPayload {
  const docs = (consultation.documentation ?? {}) as {
    patientInfo?: { name?: string };
  };
  const source: PcpPayloadSource = {
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
    treatmentRationale: extras.treatmentRationale ?? null,
    referralOutcome: extras.referralOutcome ?? null,
    pharmacist: extras.pharmacist ?? null,
    patientDisplayName:
      extras.patientDisplayName ?? docs.patientInfo?.name ?? null,
    pcpDisplayName: extras.pcpDisplayName ?? null,
    pharmacistCredentials: extras.pharmacistCredentials ?? 'RPh',
  };
  return buildPcpCommunicationPayload(source);
}
