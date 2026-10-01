import type { DocumentMeta, DocumentTypeId } from './types';
import type { PdfLayoutConfig } from './pdf-layout-types';
import { PRESCRIBE_DOC_KEYS, toCanonicalDocId } from './document-keys';
import type { Consultation } from '../types';
import { consultationHasPrescription } from './patient-address';

/** Prescribe-module documents — Clinical Record / Patient Documents */
export const DOCUMENT_DEFINITIONS: DocumentMeta[] = [
  {
    id: PRESCRIBE_DOC_KEYS.CONSULTATION_NOTE,
    name: 'Pharmacist Consultation Note',
    shortName: 'Consultation Note',
    fileName: '01_Pharmacist_Consultation_Note.pdf',
    order: 1,
    category: 'clinical',
    categoryLabel: 'Clinical Record',
    description:
      'Regulatory documentation of this pharmacist consultation. Use this DAP note for your clinical record.',
    bullets: ['Assessment', 'Plan', 'Rationale', 'Follow-up'],
    actions: ['reviewEdit', 'copyKroll', 'printDownload'],
  },
  {
    id: PRESCRIBE_DOC_KEYS.PRESCRIPTION,
    name: 'Prescription',
    shortName: 'Rx',
    fileName: '02_Prescription.pdf',
    order: 5,
    category: 'patient',
    categoryLabel: 'Patient Documents',
    description:
      'Required for the selected treatment. Create and review it before completing this consultation.',
    bullets: ['Patient & PHN', 'Address', 'Sig & directions', 'Qty / refills'],
    actions: ['reviewEdit', 'printDownload', 'fax'],
  },
  {
    id: PRESCRIBE_DOC_KEYS.PRESCRIBER_COMMUNICATION,
    name: 'Pharmacist Communication to Primary Care Provider',
    shortName: 'PCP Communication',
    fileName: '03_Prescriber_Communication.pdf',
    order: 2,
    category: 'communication',
    categoryLabel: 'Clinical Record',
    description:
      'Continuity-of-care letter for the primary care provider summarizing this consultation.',
    bullets: ['Assessment', 'Treatment', 'Follow-up'],
    actions: ['reviewEdit', 'copyCommunication', 'printDownload', 'fax'],
  },
  {
    id: PRESCRIBE_DOC_KEYS.PATIENT_CARE_SUMMARY,
    name: 'Patient Care Summary',
    shortName: 'Your Care Plan',
    fileName: '04_Patient_Care_Summary.pdf',
    order: 4,
    category: 'patient',
    categoryLabel: 'Patient Documents',
    description: 'Plain-language take-home summary of treatment and self-care.',
    bullets: [
      'What to expect',
      'How to use medication',
      'Self-care',
      'Follow-up',
    ],
    actions: ['reviewEdit', 'printDownload'],
  },
];

export type PublishedFormatInput = {
  key: string;
  name: string;
  shortName?: string | null;
  description: string;
  category: string;
  categoryLabel: string;
  bullets: string[];
  fileName: string;
  sortOrder: number;
  actions: string[];
  pdfLayout?: PdfLayoutConfig | null;
};

function resolveActions(
  id: DocumentTypeId,
  fallback: DocumentMeta['actions'],
): DocumentMeta['actions'] {
  if (id === 'consultation_note') {
    return ['reviewEdit', 'copyKroll', 'printDownload'];
  }
  if (id === 'prescription') {
    return ['reviewEdit', 'printDownload', 'fax'];
  }
  if (id === 'prescriber_communication') {
    return ['reviewEdit', 'copyCommunication', 'printDownload', 'fax'];
  }
  if (id === 'patient_care_summary') {
    return ['reviewEdit', 'printDownload'];
  }
  return fallback ?? ['reviewEdit', 'download'];
}

/** Merge Super Admin published formats over local defaults (by key, with legacy alias support). */
export function resolveDocumentDefinitions(
  published?: PublishedFormatInput[] | null,
): DocumentMeta[] {
  if (!published?.length) return DOCUMENT_DEFINITIONS;

  const byCanonical = new Map<string, PublishedFormatInput>();
  for (const p of published) {
    const canonical = toCanonicalDocId(p.key);
    if (!canonical) continue;
    byCanonical.set(canonical, { ...p, key: canonical });
  }

  return DOCUMENT_DEFINITIONS.map((def) => {
    const p = byCanonical.get(def.id);
    if (!p) return def;
    return {
      ...def,
      name: p.name || def.name,
      shortName: p.shortName ?? def.shortName,
      description: p.description || def.description,
      category: (p.category as DocumentMeta['category']) ?? def.category,
      categoryLabel:
        p.category === 'patient' || p.categoryLabel?.toLowerCase().includes('patient')
          ? 'Patient Documents'
          : 'Clinical Record',
      bullets: p.bullets?.length ? p.bullets : def.bullets,
      fileName: p.fileName || def.fileName,
      order: p.sortOrder ?? def.order,
      actions: resolveActions(def.id, def.actions),
      // Prescription always uses the clinical Rx PDF builder (sample template).
      pdfLayout:
        def.id === 'prescription'
          ? {
              mode: 'prescription' as const,
              title: p.name || def.name,
              sections: [],
            }
          : (p.pdfLayout ?? def.pdfLayout),
    };
  }).sort((a, b) => a.order - b.order);
}

/**
 * Documents applicable to this consultation.
 * Prescription is mandatory when a prescription treatment was selected.
 */
export function resolveConsultationDocuments(
  consultation: Consultation,
  published?: PublishedFormatInput[] | null,
): DocumentMeta[] {
  const all = resolveDocumentDefinitions(published);
  if (consultationHasPrescription(consultation)) return all;
  return all.filter((d) => d.id !== 'prescription');
}

export function buildPdfLayoutMap(
  definitions: DocumentMeta[],
): Partial<Record<DocumentTypeId, PdfLayoutConfig | null>> {
  const map: Partial<Record<DocumentTypeId, PdfLayoutConfig | null>> = {};
  for (const def of definitions) {
    if (def.pdfLayout) map[def.id] = def.pdfLayout;
  }
  return map;
}

export function getDocumentDefinition(
  id: DocumentTypeId,
  definitions: DocumentMeta[] = DOCUMENT_DEFINITIONS,
): DocumentMeta {
  const def = definitions.find((d) => d.id === id);
  if (!def) {
    return {
      id,
      name: id,
      fileName: `${id}.pdf`,
      order: 99,
      category: 'clinical',
      categoryLabel: 'Clinical Record',
      description: '',
      bullets: [],
      actions: ['reviewEdit', 'download'],
    };
  }
  return def;
}

export function getDocumentsByCategory(definitions: DocumentMeta[] = DOCUMENT_DEFINITIONS) {
  const groups: Array<{ key: string; label: string; docs: DocumentMeta[] }> = [];

  const clinical = definitions
    .filter((d) => d.category === 'clinical' || d.category === 'communication')
    .sort((a, b) => a.order - b.order);
  if (clinical.length) {
    groups.push({
      key: 'clinical',
      label: 'Clinical Record & Communication',
      docs: clinical,
    });
  }

  const patient = definitions
    .filter((d) => d.category === 'patient')
    .sort((a, b) => a.order - b.order);
  if (patient.length) {
    groups.push({
      key: 'patient',
      label: 'Patient Documents',
      docs: patient,
    });
  }

  return groups;
}
