import type { DocumentTypeId } from './types';

/**
 * Editable section fields for each Prescribe-module document.
 * Labels match the canonical Notion / PDF / fax format.
 */
export const DOCUMENT_EDITABLE_FIELDS: Record<
  DocumentTypeId,
  Array<{ key: string; label: string }>
> = {
  consultation_note: [
    { key: 'data', label: 'D — Data' },
    { key: 'assessment', label: 'A — Assessment' },
    { key: 'plan', label: 'P — Plan' },
  ],
  prescription: [
    { key: 'patientBlock', label: 'Patient details (name, DOB, PHN, address)' },
    { key: 'medicationBlock', label: 'Medication & directions' },
    { key: 'diagnosis', label: 'Indication / diagnosis' },
    { key: 'notes', label: 'Notes' },
    { key: 'specialInstructions', label: 'Special instructions' },
  ],
  prescriber_communication: [
    { key: 'headerBlock', label: 'Patient header' },
    { key: 'salutation', label: 'Greeting' },
    { key: 'openingSentence', label: 'Opening' },
    { key: 'assessment', label: 'Assessment' },
    { key: 'treatment', label: 'Treatment' },
    { key: 'followUp', label: 'Follow-up' },
    { key: 'closingSentence', label: 'Closing' },
    { key: 'signatureBlock', label: 'Signature' },
  ],
  patient_care_summary: [
    { key: 'assessment', label: 'Your assessment' },
    { key: 'treatment', label: 'How to use your medicine' },
    { key: 'expectedResponse', label: 'What to expect' },
    { key: 'selfCare', label: 'Self-care & non-drug measures' },
    { key: 'seekCare', label: 'When to get medical help' },
    { key: 'followUp', label: 'Follow-up' },
    { key: 'questionsContact', label: 'Questions?' },
  ],
};
