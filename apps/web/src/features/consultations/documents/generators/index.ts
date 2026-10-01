import type { Consultation } from '../../types';
import type { DocumentContents, PatientDocumentInfo } from '../types';
import { generateConsultationNoteFields } from './consultation-note-generator';
import { generatePcpCommunicationFields } from './pcp-communication-generator';
import { generatePatientHandoutFields } from './patient-handout-generator';
import { generatePrescriptionContent } from './prescription-generator';

export {
  generateConsultationNoteFields,
  buildConsultationNotePlainText,
} from './consultation-note-generator';
export {
  generatePcpCommunicationFields,
  buildPcpCommunicationPlainText,
} from './pcp-communication-generator';
export {
  generatePatientHandoutFields,
  buildPatientHandoutPlainText,
} from './patient-handout-generator';
export {
  generatePrescriptionContent,
  buildPrescriptionPlainText,
  prescriptionToEditableFields,
  applyPrescriptionEdits,
  syncPrescriptionMedicationsFromBlock,
  splitMedicationBlockSections,
  formatPrescriptionRxTitle,
  upsertPrescriptionRxTitlesHtml,
} from './prescription-generator';
export { projectConsultationSource } from './source-projection';

export interface GenerateDocumentsOptions {
  handoutLanguage?: string;
}

/** Deterministic package documents from confirmed consultation facts. */
export function generateAllDocumentFields(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
  options?: GenerateDocumentsOptions,
): DocumentContents {
  return {
    consultation_note: generateConsultationNoteFields(consultation, patientInfo),
    prescription: generatePrescriptionContent(consultation, patientInfo),
    prescriber_communication: generatePcpCommunicationFields(
      consultation,
      patientInfo,
    ),
    patient_care_summary: generatePatientHandoutFields(consultation, patientInfo, {
      language: options?.handoutLanguage,
    }),
  };
}
