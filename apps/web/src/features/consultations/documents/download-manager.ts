import { format } from 'date-fns';
import type { Consultation } from '../types';
import { DOCUMENT_DEFINITIONS } from './document-definitions';
import {
  buildPdfContext,
  downloadBlob,
  generateAllPdfs,
  generateDocumentPdf,
} from './pdf-generator';
import { buildStoreZip } from './zip-store';
import type {
  DocumentationPackage,
  DocumentMeta,
  DocumentTypeId,
  PatientDocumentInfo,
} from './types';

export function buildFolderName(
  consultation: Consultation,
  patientInfo: PatientDocumentInfo,
): string {
  const date = format(new Date(consultation.createdAt), 'yyyy-MM-dd');
  const ref = consultation.consultationRef;
  if (patientInfo.name?.trim()) {
    const safeName = patientInfo.name.trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
    return `${safeName}_${date}_${ref}`;
  }
  return `${ref}_${date}`;
}

/**
 * Download all consultation PDFs as a ZIP into the browser Downloads folder.
 * No folder picker and no File System Access API — works in every modern browser.
 */
export async function downloadAllDocuments(
  consultation: Consultation,
  pkg: DocumentationPackage,
  patientInfo: PatientDocumentInfo,
  options?: { definitions?: DocumentMeta[] },
): Promise<{ fileName: string; fileCount: number }> {
  const ctx = buildPdfContext(consultation, patientInfo);
  const definitions = options?.definitions ?? DOCUMENT_DEFINITIONS;
  const layouts = Object.fromEntries(
    definitions.map((d) => [d.id, d.pdfLayout ?? null]),
  ) as Partial<Record<DocumentTypeId, import('./pdf-layout-types').PdfLayoutConfig | null>>;
  const pdfs = await generateAllPdfs(pkg, ctx, layouts, definitions);

  const entries = await Promise.all(
    definitions.map(async (def) => {
      const blob = pdfs.get(def.id);
      if (!blob) return null;
      const data = new Uint8Array(await blob.arrayBuffer());
      return { name: def.fileName, data };
    }),
  );
  const files = entries.filter(
    (entry): entry is NonNullable<(typeof entries)[number]> => entry != null,
  );
  if (!files.length) {
    throw new Error('No documents available to download');
  }

  const zip = buildStoreZip(files);
  const zipCopy = new Uint8Array(zip.byteLength);
  zipCopy.set(zip);
  const fileName = `${buildFolderName(consultation, patientInfo)}.zip`;
  downloadBlob(new Blob([zipCopy], { type: 'application/zip' }), fileName);
  return { fileName, fileCount: files.length };
}

export async function downloadSingleDocument(
  typeId: DocumentTypeId,
  consultation: Consultation,
  pkg: DocumentationPackage,
  patientInfo: PatientDocumentInfo,
  definitions: DocumentMeta[] = DOCUMENT_DEFINITIONS,
) {
  const ctx = buildPdfContext(consultation, patientInfo);
  const def =
    definitions.find((d) => d.id === typeId) ??
    DOCUMENT_DEFINITIONS.find((d) => d.id === typeId)!;
  const blob = await generateDocumentPdf(typeId, pkg, ctx, def.pdfLayout);
  downloadBlob(blob, def.fileName);
}
