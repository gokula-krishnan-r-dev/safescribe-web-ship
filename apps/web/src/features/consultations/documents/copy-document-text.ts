import type { DocumentationPackage, DocumentTypeId } from './types';
import { buildConsultationNotePlainText } from './generators/consultation-note-generator';
import { buildPcpCommunicationPlainText } from './generators/pcp-communication-generator';
import { buildPatientHandoutPlainText } from './generators/patient-handout-generator';
import { buildPrescriptionPlainText } from './generators/prescription-generator';
import { fieldsToPlainText, fieldToPlainText } from './tiptap-text';

/** Build clean plain text for clipboard (Kroll / EMR paste) — not a live integration */
export function buildDocumentPlainText(
  typeId: DocumentTypeId,
  pkg: DocumentationPackage,
): string {
  if (typeId === 'consultation_note') {
    return buildConsultationNotePlainText(
      fieldsToPlainText(pkg.documents?.consultation_note ?? {}),
    );
  }
  if (typeId === 'prescription') {
    const rx = pkg.documents?.prescription;
    if (!rx || typeof rx !== 'object') return buildPrescriptionPlainText({});
    const normalized = {
      ...rx,
      ...fieldsToPlainText(
        Object.fromEntries(
          Object.entries(rx).filter(([, v]) => typeof v === 'string') as Array<
            [string, string]
          >,
        ),
      ),
    };
    return buildPrescriptionPlainText(normalized);
  }
  if (typeId === 'prescriber_communication') {
    return buildPcpCommunicationPlainText(
      fieldsToPlainText(pkg.documents?.prescriber_communication ?? {}),
    );
  }
  if (typeId === 'patient_care_summary') {
    return buildPatientHandoutPlainText(
      fieldsToPlainText(pkg.documents?.patient_care_summary ?? {}),
    );
  }
  return '';
}

export async function writeClipboardText(text: string): Promise<void> {
  const value = fieldToPlainText(text).trim();
  if (!value) throw new Error('Nothing to copy');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === 'undefined') throw new Error('Clipboard unavailable');
  const el = document.createElement('textarea');
  el.value = value;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('Clipboard unavailable');
}

export async function copyDocumentToClipboard(
  typeId: DocumentTypeId,
  pkg: DocumentationPackage,
): Promise<void> {
  const structured = fieldToPlainText(buildDocumentPlainText(typeId, pkg)).trim();
  const htmlFallback = fieldToPlainText(documentHtmlFromPackage(typeId, pkg)).trim();
  await writeClipboardText(structured || htmlFallback);
}

function documentHtmlFromPackage(
  typeId: DocumentTypeId,
  pkg: DocumentationPackage,
): string {
  const docs = pkg.documents;
  if (!docs) return '';
  if (typeId === 'consultation_note') return docs.consultation_note?.documentHtml ?? '';
  if (typeId === 'prescriber_communication') {
    return docs.prescriber_communication?.documentHtml ?? '';
  }
  if (typeId === 'patient_care_summary') return docs.patient_care_summary?.documentHtml ?? '';
  if (typeId === 'prescription') {
    const rx = docs.prescription as { documentHtml?: string } | undefined;
    return rx?.documentHtml ?? '';
  }
  return '';
}
