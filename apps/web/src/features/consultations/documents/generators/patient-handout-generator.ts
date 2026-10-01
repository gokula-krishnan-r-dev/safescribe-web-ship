import {
  englishHandoutFieldsFromPayload,
  buildPatientSummaryPayload,
} from '@safescript/shared';
import type { Consultation } from '../../types';
import type { PatientDocumentInfo } from '../types';
import {
  buildPatientHandoutPlainText,
  normalizeHandoutLanguage,
  upgradePatientHandoutFields,
} from '../handout-format';
import { projectConsultationSource } from './source-projection';

export { buildPatientHandoutPlainText };

export interface GenerateHandoutOptions {
  language?: string;
}

/**
 * Patient Care Summary / Handout — formatter only.
 * Treatment is always `{display_name}: {patient_directions}`.
 * Counselling comes only from pharmacist-confirmed content.
 * Non-English clinical text is produced by the server translation endpoint.
 */
export function generatePatientHandoutFields(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
  options?: GenerateHandoutOptions,
): Record<string, string> {
  const src = projectConsultationSource(consultation, patientInfo);
  const language = normalizeHandoutLanguage(
    options?.language ?? src.handoutLanguage,
  );
  const payload = buildPatientSummaryPayload({
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
        }
      : null,
    selectedLanguage: language,
    pharmacyName: src.pharmacyName ?? consultation.tenant?.name,
    pharmacyPhone: src.pharmacyPhone ?? consultation.tenant?.phone,
    pharmacyAddress: src.pharmacyAddress ?? consultation.tenant?.address,
  });

  return upgradePatientHandoutFields(
    englishHandoutFieldsFromPayload(payload, language),
  );
}
