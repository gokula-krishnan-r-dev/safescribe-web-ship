import {
  applyDeterministicPcpTreatment,
  buildPcpCommunicationPayload,
} from '@safescript/shared';
import type { Consultation } from '../../types';
import type { PatientDocumentInfo } from '../types';
import { upgradePcpCommunicationFields } from '../pcp-format';
import { projectConsultationSource } from './source-projection';

export { buildPcpCommunicationPlainText } from '../pcp-format';

/**
 * Pharmacist Communication to Primary Care Provider.
 *
 * Layout is deterministic. Treatment is always
 * `{display_name}: {patient_directions}` from pharmacist-confirmed data.
 * Spec: SafeScribe PCP Communication Prompt + Backend Preprocessing.
 */
export function generatePcpCommunicationFields(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
): Record<string, string> {
  const src = projectConsultationSource(consultation, patientInfo);
  const payload = buildPcpCommunicationPayload({
    chiefComplaint: consultation.chiefComplaint,
    createdAt: consultation.createdAt,
    consultationMode: consultation.consultationMode,
    demographics: consultation.demographics,
    treatmentPlan: consultation.treatmentPlan,
    counsellingNotes: consultation.counsellingNotes,
    redFlags: consultation.redFlags,
    eligibility: consultation.eligibility,
    pathway: consultation.pathway
      ? {
          condition: consultation.pathway.condition,
          name: consultation.pathway.name,
        }
      : null,
    clinicalJudgmentAssessment: consultation.clinicalJudgmentAssessment
      ? {
          workingDiagnosisText:
            consultation.clinicalJudgmentAssessment.workingDiagnosisText,
          diagnosticCertainty:
            consultation.clinicalJudgmentAssessment.diagnosticCertainty,
          assessmentSummary:
            consultation.clinicalJudgmentAssessment.assessmentSummary,
          assessmentSufficient:
            consultation.clinicalJudgmentAssessment.assessmentSufficient,
        }
      : null,
    treatmentRationale: consultation.treatmentRationale
      ? {
          status: consultation.treatmentRationale.status,
          selectionRationale: consultation.treatmentRationale.selectionRationale,
          reasonForPrescribing: consultation.treatmentRationale.reasonForPrescribing,
        }
      : null,
    referralOutcome: consultation.referralOutcome
      ? {
          documentationText: consultation.referralOutcome.documentationText,
          actionTaken: consultation.referralOutcome.actionTaken,
          referralSendConfirmed:
            consultation.referralOutcome.letterExternalSendConfirmed,
          action_completed:
            consultation.referralOutcome.status === 'COMPLETED' ||
            Boolean(consultation.referralOutcome.completedAt),
        }
      : null,
    pharmacist: consultation.pharmacist,
    patientDisplayName: src.patient.name,
    pharmacistCredentials: src.pharmacistCredentials || 'RPh',
  });

  const concern = payload.presenting_concern?.trim();
  const opening = concern
    ? `I am writing to provide a brief update following a pharmacist assessment for ${lowerIfSentence(concern.replace(/\.$/, ''))}.`
    : 'I am writing to provide a brief update following a pharmacist assessment.';

  return upgradePcpCommunicationFields(
    applyDeterministicPcpTreatment(
      {
        openingSentence: opening,
        assessment: payload.assessment?.summary ?? '',
      },
      payload,
      {
        dateOfBirth: src.patient.dateOfBirth,
        patientPhn: src.patient.patientId,
        pharmacyName: src.pharmacyName ?? consultation.tenant?.name,
        pharmacyFax: src.pharmacyFax ?? consultation.tenant?.faxNumber,
      },
    ),
  );
}

function lowerIfSentence(text: string): string {
  if (text === text.toUpperCase() && text.length > 3) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}
