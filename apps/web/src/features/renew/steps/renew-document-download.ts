import { generateReferralLetterPdf } from '@/features/consultations/referral/referral-letter-pdf';
import { buildStoreZip } from '@/features/consultations/documents/zip-store';
import { generateDocumentPdf } from '@/features/consultations/documents/pdf-generator';
import type { PatientDocumentInfo } from '@/features/consultations/documents/types';
import type { RenewDocumentKind, RenewGeneratedDocument } from '@safescript/shared';
import {
  downloadRenewDocumentBlob,
  renewDocumentToHtml,
} from './renew-document-html';
import {
  buildRenewPrescriptionPdfContext,
  buildRenewPrescriptionPdfPackage,
  looksLikePrescribeRxTemplate,
} from './renew-prescription-template';

export const RENEW_PDF_FILE_NAMES: Record<RenewDocumentKind, string> = {
  consultation_note: '01_Pharmacist_Renewal_Assessment.pdf',
  renewal_summary: '02_Prescription.pdf',
  prescriber_notification: '03_Prescriber_Communication.pdf',
  patient_handout: '04_Medication_Renewal_Handout.pdf',
};

export interface RenewPdfMeta {
  tenantName?: string | null;
  dateLabel?: string | null;
  consultationRef?: string | null;
  createdAt?: string | null;
  consultationId?: string | null;
  pharmacistName?: string | null;
  pharmacistCredentials?: string | null;
  pharmacyAddress?: string | null;
  pharmacyPhone?: string | null;
  pharmacyFax?: string | null;
  patientInfo?: PatientDocumentInfo | null;
}

export function isRenewDocumentReviewed(doc: RenewGeneratedDocument): boolean {
  return doc.status === 'generated' && doc.reviewed === true && Boolean(doc.body.trim());
}

export function renewPdfFileName(kind: RenewDocumentKind, title?: string): string {
  return RENEW_PDF_FILE_NAMES[kind] ?? `${(title || 'renew-document').replace(/[^\w.-]+/g, '_')}.pdf`;
}

export async function generateRenewDocumentPdf(
  body: string,
  title: string,
  meta: RenewPdfMeta = {},
  kind?: RenewDocumentKind,
): Promise<Blob> {
  if (kind === 'renewal_summary' || looksLikePrescribeRxTemplate(body)) {
    const patient = meta.patientInfo ?? {};
    const pkg = buildRenewPrescriptionPdfPackage(body, patient);
    const ctx = buildRenewPrescriptionPdfContext(patient, meta);
    return generateDocumentPdf('prescription', pkg, ctx);
  }
  return generateReferralLetterPdf(renewDocumentToHtml(body, title), {
    tenantName: meta.tenantName,
    dateLabel: meta.dateLabel,
  });
}

export async function downloadRenewDocumentPdf(
  doc: RenewGeneratedDocument,
  meta: RenewPdfMeta = {},
): Promise<string> {
  const blob = await generateRenewDocumentPdf(doc.body, doc.title, meta, doc.kind);
  const fileName = renewPdfFileName(doc.kind, doc.title);
  downloadRenewDocumentBlob(blob, fileName);
  return fileName;
}

export function buildRenewZipName(consultationRef?: string | null, createdAt?: string | null): string {
  const date = isoDate(createdAt);
  const ref = (consultationRef?.trim() || 'renewal').replace(/[^\w.-]+/g, '_');
  return `${ref}_${date}.zip`;
}

/**
 * Download reviewed renew PDFs as one ZIP (same STORE zip as Prescribe).
 * PDFs generate on click — never in the render path.
 */
export async function downloadAllRenewDocuments(
  documents: RenewGeneratedDocument[],
  meta: RenewPdfMeta = {},
): Promise<{ fileName: string; fileCount: number }> {
  const reviewed = documents.filter(isRenewDocumentReviewed);
  if (!reviewed.length) {
    throw new Error('NO_REVIEWED_DOCUMENTS');
  }

  const files: Array<{ name: string; data: Uint8Array }> = [];
  for (const doc of reviewed) {
    const blob = await generateRenewDocumentPdf(doc.body, doc.title, meta, doc.kind);
    files.push({
      name: renewPdfFileName(doc.kind, doc.title),
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }

  const zip = buildStoreZip(files);
  const zipCopy = new Uint8Array(zip.byteLength);
  zipCopy.set(zip);
  const fileName = buildRenewZipName(meta.consultationRef, meta.createdAt);
  downloadRenewDocumentBlob(new Blob([zipCopy], { type: 'application/zip' }), fileName);
  return { fileName, fileCount: files.length };
}

function isoDate(value?: string | null): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
