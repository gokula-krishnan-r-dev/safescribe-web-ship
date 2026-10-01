/**
 * Map Renew pharmacist-prescription bodies onto the Prescribe clinical Rx
 * Notion editor + PDF template so both modules share one layout.
 */

import {
  DOCUMENT_HTML_KEY,
  fieldsToNotionHtml,
  notionHtmlToFields,
} from '@/features/consultations/documents/notion-document-model';
import {
  medicationsFromMedicationBlock,
  prescriptionToEditableFields,
} from '@/features/consultations/documents/generators/prescription-generator';
import { fieldToPlainText, looksLikeHtml } from '@/features/consultations/documents/tiptap-text';
import type {
  DocumentationPackage,
  PatientDocumentInfo,
  PdfContext,
  PrescriptionMedication,
} from '@/features/consultations/documents/types';
import { finalizePatientDocumentInfo } from '@/features/consultations/documents/patient-address';

export const RENEW_PRESCRIPTION_EDITOR_TITLE = 'Prescription';

function extractDataFieldPlain(html: string, key: string): string {
  const re = new RegExp(
    `<h2[^>]*data-field=["']${key}["'][^>]*>[\\s\\S]*?<\\/h2>([\\s\\S]*?)(?=<h2\\b|$)`,
    'i',
  );
  const match = html.match(re);
  return match ? fieldToPlainText(match[1] ?? '') : '';
}

export function looksLikePrescribeRxTemplate(body: string): boolean {
  const raw = String(body ?? '');
  if (!raw.trim()) return false;
  if (/data-field\s*=\s*["']medicationBlock["']/i.test(raw)) return true;
  if (/\bRx\s*-/i.test(raw)) return true;
  const plain = fieldToPlainText(raw);
  return /\bRx\s*-/i.test(plain) || /^Qty:/m.test(plain);
}

export function parseRenewPrescriptionFields(body: string): {
  patientBlock: string;
  medicationBlock: string;
  notes: string;
  specialInstructions: string;
  diagnosis: string;
  medications: PrescriptionMedication[];
  documentHtml?: string;
} {
  const raw = String(body ?? '').trim();
  if (looksLikeHtml(raw) && /data-field\s*=/.test(raw)) {
    const fields = notionHtmlToFields('prescription', raw);
    const medicationBlock =
      fields.medicationBlock?.trim() || extractDataFieldPlain(raw, 'medicationBlock');
    const patientBlock =
      fields.patientBlock?.trim() || extractDataFieldPlain(raw, 'patientBlock');
    return {
      patientBlock,
      medicationBlock,
      notes: fields.notes?.trim() || extractDataFieldPlain(raw, 'notes'),
      specialInstructions:
        fields.specialInstructions?.trim() || extractDataFieldPlain(raw, 'specialInstructions'),
      diagnosis: fields.diagnosis?.trim() || extractDataFieldPlain(raw, 'diagnosis'),
      medications: medicationsFromMedicationBlock(medicationBlock),
      documentHtml: raw,
    };
  }

  const plain = looksLikeHtml(raw) ? fieldToPlainText(raw) : raw;
  const lines = plain.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  if (i < lines.length && /^(?:prescription|pharmacist prescription)$/i.test(lines[i]!.trim())) {
    i += 1;
  }
  const rest = lines.slice(i).join('\n').trim();
  const rxSplit = rest.split(/(?=^(?:\*\*)?Rx\s*-)/im);
  const prefix = (rxSplit[0] ?? '').trim();
  const rxParts = rxSplit.slice(1).map((part) => part.trim()).filter(Boolean);
  const patientBlock = prefix.replace(/^patient\s*$/im, '').trim();
  const medicationBlock = rxParts.join('\n\n\n');
  return {
    patientBlock,
    medicationBlock,
    notes: '',
    specialInstructions: '',
    diagnosis: '',
    medications: medicationsFromMedicationBlock(medicationBlock),
  };
}

export function renewPrescriptionToEditorHtml(body: string, title = RENEW_PRESCRIPTION_EDITOR_TITLE): string {
  const parsed = parseRenewPrescriptionFields(body);
  const fields = {
    ...prescriptionToEditableFields({
      patientBlock: parsed.patientBlock,
      medicationBlock: parsed.medicationBlock,
      notes: parsed.notes,
      specialInstructions: parsed.specialInstructions,
      diagnosis: parsed.diagnosis,
      medications: parsed.medications,
    }),
    ...(parsed.documentHtml ? { [DOCUMENT_HTML_KEY]: parsed.documentHtml } : {}),
  };
  return fieldsToNotionHtml('prescription', fields, title);
}

export function buildRenewPrescriptionPdfPackage(
  body: string,
  patientInfo: PatientDocumentInfo,
): DocumentationPackage {
  const parsed = parseRenewPrescriptionFields(body);
  return {
    patientInfo: finalizePatientDocumentInfo(patientInfo),
    documents: {
      prescription: {
        patientBlock: parsed.patientBlock,
        medicationBlock: parsed.medicationBlock,
        notes: parsed.notes || undefined,
        specialInstructions: parsed.specialInstructions || undefined,
        diagnosis: parsed.diagnosis || undefined,
        medications: parsed.medications,
        ...(parsed.documentHtml ? { documentHtml: parsed.documentHtml } : {}),
      },
    },
  };
}

export function buildRenewPrescriptionPdfContext(
  patientInfo: PatientDocumentInfo,
  meta: {
    consultationId?: string | null;
    consultationRef?: string | null;
    dateLabel?: string | null;
    pharmacistName?: string | null;
    pharmacistCredentials?: string | null;
    tenantName?: string | null;
    pharmacyAddress?: string | null;
    pharmacyPhone?: string | null;
    pharmacyFax?: string | null;
  },
): PdfContext {
  const consultationId = meta.consultationId?.trim();
  return {
    consultationRef: meta.consultationRef?.trim() || consultationId || 'renewal',
    consultationDate: meta.dateLabel?.trim() || new Date().toLocaleDateString('en-CA'),
    pharmacistName: meta.pharmacistName?.trim() || 'Pharmacist',
    pharmacistCredentials: meta.pharmacistCredentials?.trim() || 'RPh',
    tenantName: meta.tenantName?.trim() || undefined,
    pharmacyAddress: meta.pharmacyAddress?.trim() || undefined,
    pharmacyPhone: meta.pharmacyPhone?.trim() || undefined,
    pharmacyFax: meta.pharmacyFax?.trim() || undefined,
    patientInfo: finalizePatientDocumentInfo(patientInfo),
    pharmacistSignatureUrl: consultationId
      ? `/consultations/${consultationId}/branding/signature`
      : undefined,
    pharmacyLogoUrl: consultationId
      ? `/consultations/${consultationId}/branding/logo`
      : undefined,
  };
}
