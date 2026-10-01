/**
 * Canonical Doc Download Format catalog.
 * Seeded into DocumentFormatTemplate on boot; used as reset defaults.
 * Controls Doc cards, AI prompts, response schema, and PDF download layout.
 */

import type { DocResponseSchema, PdfLayoutConfig } from './pdf-layout.types';
import { PATIENT_CARE_SUMMARY_PROMPT } from '@safescript/shared';

export const DOC_FORMAT_KEYS = {
  CONSULTATION_NOTE: 'consultation_note',
  PRESCRIBER_COMMUNICATION: 'prescriber_communication',
  PATIENT_CARE_SUMMARY: 'patient_care_summary',
} as const;

/** Legacy keys kept for migration / published-format aliasing */
export const LEGACY_DOC_FORMAT_KEYS = {
  dapNote: DOC_FORMAT_KEYS.CONSULTATION_NOTE,
  physicianLetter: DOC_FORMAT_KEYS.PRESCRIBER_COMMUNICATION,
  patientHandout: DOC_FORMAT_KEYS.PATIENT_CARE_SUMMARY,
} as const;

export type DocFormatKey = (typeof DOC_FORMAT_KEYS)[keyof typeof DOC_FORMAT_KEYS];

export type DocFormatCategory = 'clinical' | 'communication' | 'patient';

export interface DocFormatDefinition {
  key: DocFormatKey;
  name: string;
  shortName: string;
  description: string;
  category: DocFormatCategory;
  categoryLabel: string;
  bullets: string[];
  fileName: string;
  sortOrder: number;
  actions: Array<'preview' | 'copy' | 'copyKroll' | 'download' | 'print' | 'edit'>;
  aiPrompt: string;
  styleNotes: string;
  exampleOutput: string;
  pdfLayout: PdfLayoutConfig;
  responseSchema: DocResponseSchema;
}

function sid(prefix: string, n: number) {
  return `${prefix}-${n}`;
}

const DAP_LAYOUT: PdfLayoutConfig = {
  mode: 'sections',
  title: 'Pharmacist Consultation Note',
  showPatientHeader: false,
  showPageFooter: true,
  sections: [
    { id: sid('dap', 1), type: 'heading', label: 'D — Data' },
    {
      id: sid('dap', 2),
      type: 'field',
      field: 'data',
      showIfEmpty: false,
    },
    { id: sid('dap', 3), type: 'heading', label: 'A — Assessment' },
    {
      id: sid('dap', 4),
      type: 'field',
      field: 'assessment',
      showIfEmpty: false,
    },
    { id: sid('dap', 5), type: 'heading', label: 'P — Plan' },
    {
      id: sid('dap', 6),
      type: 'field',
      field: 'plan',
      showIfEmpty: false,
    },
  ],
};

const PHYSICIAN_LAYOUT: PdfLayoutConfig = {
  mode: 'sections',
  title: 'Pharmacist Communication to Primary Care Provider',
  showPatientHeader: false,
  showPageFooter: true,
  sections: [
    {
      id: sid('pl', 1),
      type: 'field',
      field: 'headerBlock',
      showIfEmpty: false,
    },
    {
      id: sid('pl', 2),
      type: 'field',
      field: 'salutation',
      fallback: 'Dear Primary Care Provider,',
      showIfEmpty: true,
    },
    {
      id: sid('pl', 3),
      type: 'field',
      field: 'openingSentence',
      showIfEmpty: false,
    },
    { id: sid('pl', 4), type: 'heading', label: 'Assessment' },
    {
      id: sid('pl', 5),
      type: 'field',
      field: 'assessment',
      showIfEmpty: false,
    },
    { id: sid('pl', 6), type: 'heading', label: 'Treatment' },
    {
      id: sid('pl', 7),
      type: 'field',
      field: 'treatment',
      showIfEmpty: false,
    },
    { id: sid('pl', 8), type: 'heading', label: 'Follow-up' },
    {
      id: sid('pl', 9),
      type: 'field',
      field: 'followUp',
      showIfEmpty: false,
    },
    {
      id: sid('pl', 10),
      type: 'field',
      field: 'closingSentence',
      fallback:
        'This update is provided for your information and continuity of care.',
      showIfEmpty: true,
    },
    {
      id: sid('pl', 11),
      type: 'field',
      field: 'signatureBlock',
      showIfEmpty: false,
    },
  ],
};

const PATIENT_LAYOUT: PdfLayoutConfig = {
  mode: 'sections',
  title: 'Patient Care Summary',
  showPatientHeader: false,
  showPageFooter: true,
  sections: [
    {
      id: sid('ph', 1),
      type: 'field',
      field: 'documentTitle',
      fallback: 'Your Care Plan',
      showIfEmpty: true,
    },
    { id: sid('ph', 2), type: 'heading', label: 'Your assessment' },
    {
      id: sid('ph', 3),
      type: 'field',
      field: 'assessment',
      showIfEmpty: false,
    },
    { id: sid('ph', 4), type: 'heading', label: 'Your treatment' },
    {
      id: sid('ph', 5),
      type: 'field',
      field: 'treatment',
      showIfEmpty: false,
    },
    { id: sid('ph', 6), type: 'heading', label: 'What to expect' },
    {
      id: sid('ph', 7),
      type: 'field',
      field: 'expectedResponse',
      showIfEmpty: false,
    },
    { id: sid('ph', 8), type: 'heading', label: 'Things you can do' },
    {
      id: sid('ph', 9),
      type: 'bullets',
      field: 'selfCare',
      showIfEmpty: false,
    },
    { id: sid('ph', 10), type: 'heading', label: 'When to get medical help' },
    {
      id: sid('ph', 11),
      type: 'bullets',
      field: 'seekCare',
      showIfEmpty: false,
    },
    { id: sid('ph', 12), type: 'heading', label: 'Follow-up' },
    {
      id: sid('ph', 13),
      type: 'field',
      field: 'followUp',
      showIfEmpty: false,
    },
    { id: sid('ph', 14), type: 'heading', label: 'Questions?' },
    {
      id: sid('ph', 15),
      type: 'field',
      field: 'questionsContact',
      showIfEmpty: false,
    },
  ],
};

const DAP_SCHEMA: DocResponseSchema = {
  fields: [
    { key: 'documentTitle', label: 'Title', type: 'string', required: true },
    { key: 'data', label: 'D — Data', type: 'string', required: true },
    { key: 'assessment', label: 'A — Assessment', type: 'string', required: true },
    { key: 'plan', label: 'P — Plan', type: 'string' },
  ],
};

const PHYSICIAN_SCHEMA: DocResponseSchema = {
  fields: [
    {
      key: 'headerBlock',
      label: 'Patient header',
      type: 'string',
      description: 'Backend-rendered. Leave empty.',
    },
    {
      key: 'salutation',
      label: 'Greeting',
      type: 'string',
      description: 'Backend-rendered. Leave empty.',
    },
    { key: 'openingSentence', label: 'Opening', type: 'string', required: true },
    { key: 'assessment', label: 'Assessment', type: 'string', required: true },
    {
      key: 'treatment',
      label: 'Treatment',
      type: 'string',
      description: 'Leave empty. Backend inserts display_name: patient_directions.',
    },
    {
      key: 'followUp',
      label: 'Follow-up',
      type: 'string',
      description: 'Leave empty. Backend renders the confirmed PCP follow-up plan.',
    },
    {
      key: 'closingSentence',
      label: 'Closing',
      type: 'string',
      description: 'Backend-rendered. Leave empty.',
    },
    {
      key: 'signatureBlock',
      label: 'Signature',
      type: 'string',
      description: 'Backend-rendered. Leave empty.',
    },
  ],
};

const PATIENT_SCHEMA: DocResponseSchema = {
  fields: [
    { key: 'documentTitle', label: 'Title', type: 'string', required: true },
    { key: 'assessment', label: 'Your assessment', type: 'string', required: true },
    { key: 'treatment', label: 'Your treatment', type: 'string' },
    { key: 'expectedResponse', label: 'What to expect', type: 'string' },
    { key: 'selfCare', label: 'Things you can do', type: 'string' },
    { key: 'seekCare', label: 'When to get medical help', type: 'string' },
    { key: 'followUp', label: 'Follow-up', type: 'string' },
    { key: 'questionsContact', label: 'Questions?', type: 'string' },
  ],
};

export const DEFAULT_DOC_FORMATS: DocFormatDefinition[] = [
  {
    key: DOC_FORMAT_KEYS.CONSULTATION_NOTE,
    name: 'Pharmacist Consultation Note',
    shortName: 'Consultation Note',
    description:
      'Permanent DAP clinical record. Print, PDF, fax, and Kroll copy use the same format for Guided Pathway and Clinical Judgment.',
    category: 'clinical',
    categoryLabel: 'Clinical Record',
    bullets: ['D — Data', 'A — Assessment', 'P — Plan'],
    fileName: '01_Pharmacist_Consultation_Note.pdf',
    sortOrder: 1,
    actions: ['preview', 'copyKroll', 'download', 'print', 'edit'],
    styleNotes:
      'Natural pharmacist DAP note. Visible D — Data / A — Assessment / P — Plan headings. Omit empty sections. Never convert missing data into negatives. Preserve diagnostic certainty. Follow the Super Admin Assist System DAP prompt.',
    aiPrompt: `JSON contract only. Follow the Super Admin Assist System prompt for Consultation note (DAP).

Return JSON only with keys:
- documentTitle: exactly "Pharmacist Consultation Note"
- data: D — Data prose
- assessment: A — Assessment prose
- plan: P — Plan prose without repeating treatment/SIG lines (backend inserts those)

Do not add other keys, markdown fences, or D/A/P headings inside the strings.`,
    exampleOutput: JSON.stringify(
      {
        documentTitle: 'Pharmacist Consultation Note',
        data:
          '35-year-old female assessed for a recurrent cold sore. Patient reported tingling around the lip and a blister near the lip border.\n\nPregnancy recorded; patient is not breastfeeding.\n\nSafety screening was negative for ocular involvement. No red flags requiring referral were identified.\n\nPatient met the assessed criteria for treatment, including onset within the treatment window.',
        assessment:
          'Presentation is consistent with recurrent herpes labialis and appropriate for pharmacist management based on the history and assessment findings obtained.\n\nNo red flags requiring referral were identified. Relevant patient-specific treatment considerations included pregnancy and significantly reduced renal function.\n\nTopical acyclovir was selected as the treatment plan following assessment of clinical suitability and patient-specific safety considerations.',
        plan:
          'Treatment: Acyclovir 5% topical. Apply a thin layer to the affected area 5 times daily for 4 days, or as directed.\n\nMedication use and expected treatment response were reviewed with the patient.\n\nPatient education/handout provided.',
      },
      null,
      2,
    ),
    pdfLayout: DAP_LAYOUT,
    responseSchema: DAP_SCHEMA,
  },
  {
    key: DOC_FORMAT_KEYS.PRESCRIBER_COMMUNICATION,
    name: 'Pharmacist Communication to Primary Care Provider',
    shortName: 'PCP Communication',
    description:
      'Brief pharmacist-to-PCP continuity-of-care letter. Print, PDF, and fax use the same format.',
    category: 'communication',
    categoryLabel: 'Communication',
    bullets: ['Assessment', 'Treatment', 'Follow-up'],
    fileName: '02_Prescriber_Communication.pdf',
    sortOrder: 2,
    actions: ['preview', 'copy', 'download', 'print', 'edit'],
    styleNotes:
      'Brief continuity-of-care letter. Super Admin Assist System prompt is the writing authority. LLM drafts opening and assessment only. Treatment and Follow-up are backend-rendered. Omit empty sections.',
    aiPrompt: `JSON contract only. Follow the Super Admin Assist System prompt for PCP communication.

Return JSON only with keys:
- openingSentence: one sentence explaining why the pharmacist assessment occurred
- assessment: 1–2 sentences from the pharmacist-confirmed assessment
- treatment: exactly ""
- followUp: exactly ""

Do not generate title, header, salutation, closing, or signature. Do not add other keys or markdown fences.`,
    exampleOutput: JSON.stringify(
      {
        openingSentence:
          'I am writing to provide a brief update following a pharmacist assessment for cold sore symptoms.',
        assessment:
          'Presentation was consistent with cold sores (oral herpes labialis), with no red flags requiring referral identified.',
        treatment: '',
        followUp: '',
      },
      null,
      2,
    ),
    pdfLayout: PHYSICIAN_LAYOUT,
    responseSchema: PHYSICIAN_SCHEMA,
  },
  {
    key: DOC_FORMAT_KEYS.PATIENT_CARE_SUMMARY,
    name: 'Patient Care Summary',
    shortName: 'Care Summary',
    description: 'Treatment, self-care, expectations, and follow-up in plain language for the patient.',
    category: 'patient',
    categoryLabel: 'Patient',
    bullets: ['Your assessment', 'Your treatment', 'What to expect', 'Follow-up'],
    fileName: '03_Patient_Care_Summary.pdf',
    sortOrder: 3,
    actions: ['preview', 'print', 'download', 'edit'],
    styleNotes:
      'Grade 6–8 reading level. Short headings. One page where practical. Omit empty sections. Treatment is display_name: patient_directions. Do not invent counselling. Medication names and numbers stay exact.',
    aiPrompt: PATIENT_CARE_SUMMARY_PROMPT,
    exampleOutput: JSON.stringify(
      {
        documentTitle: 'Cold sores (oral herpes labialis) — Your Care Plan',
        assessment:
          'Your symptoms are consistent with cold sores (oral herpes labialis).',
        treatment:
          'valacyclovir: Take 2 g by mouth twice daily for 1 day.\nacyclovir 5% topical: Apply a thin layer to the affected cold sore 5 times daily for 4 days.',
        expectedResponse: '',
        selfCare: '',
        seekCare: '',
        followUp: '',
        questionsContact: 'Call us at:\nTel: 780-000 0000\nExample Pharmacy, 123 Main Street, Edmonton, AB.',
      },
      null,
      2,
    ),
    pdfLayout: PATIENT_LAYOUT,
    responseSchema: PATIENT_SCHEMA,
  },
];

export function getDefaultDocFormat(key: string): DocFormatDefinition | undefined {
  return DEFAULT_DOC_FORMATS.find((d) => d.key === key);
}
