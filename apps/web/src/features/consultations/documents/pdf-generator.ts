import { jsPDF } from 'jspdf';
import type { Consultation } from '../types';
import { DOCUMENT_DEFINITIONS } from './document-definitions';
import { formatPatientAddress, finalizePatientDocumentInfo } from './patient-address';
import {
  listPopulatedHandoutSections,
  resolveHandoutTitle,
  upgradePatientHandoutFields,
} from './handout-format';
import { isRtlHandoutLanguage, formatDocumentFaxNumber } from '@safescript/shared';
import {
  DAP_NOTE_TITLE,
  listPopulatedDapSections,
  upgradeDapNoteFields,
} from './dap-note-format';
import {
  PCP_CLOSING_SENTENCE,
  PCP_LETTER_TITLE,
  listPopulatedPcpSections,
  pcpSalutation,
  upgradePcpCommunicationFields,
} from './pcp-format';
import { formatPcpPatientDob, pcpIdentityFromPatientInfo } from './pcp-patient-information';
import { renderPdfFromLayout } from './pdf-layout-renderer';
import type { PdfLayoutConfig } from './pdf-layout-types';
import { formatPrescriptionRxBrandLine, parsePatientBlockForPdf, syncPrescriptionMedicationsFromBlock } from './generators/prescription-generator';
import { fieldToPlainText, looksLikeHtml } from './tiptap-text';
import {
  partitionMarkdownBlocks,
  splitInlineMarkdownRuns,
  stripInlineMarkdown,
} from './clinical-markdown';
import { drawPdfImage, fitImageBox, hydratePdfImages } from './pdf-branding';
import type {
  DocumentationPackage,
  DocumentMeta,
  DocumentTypeId,
  PdfContext,
  PatientDocumentInfo,
} from './types';

const MARGIN = 18;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5.2;
const INK: [number, number, number] = [28, 28, 28];
const MUTED: [number, number, number] = [100, 100, 100];
const RULE: [number, number, number] = [210, 210, 210];

function patientLabel(info: PatientDocumentInfo): string {
  if (info.name?.trim()) return info.name.trim();
  return 'Patient';
}

function ensureSpace(doc: jsPDF, y: number, need = 20): number {
  if (y > 275 - need) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function addFooter(
  doc: jsPDF,
  ctx: PdfContext,
  pageNum: number,
  totalPages: number,
  _omitConsultationRef = false,
) {
  const y = 287;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, y - 4, PAGE_WIDTH - MARGIN, y - 4);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  const left = ctx.tenantName ?? '';
  if (left) doc.text(left, MARGIN, y);
  doc.text(ctx.consultationDate, PAGE_WIDTH / 2, y, { align: 'center' });
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
}

function finalizePages(
  doc: jsPDF,
  ctx: PdfContext,
  options?: { omitConsultationRef?: boolean },
) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    addFooter(doc, ctx, i, total, options?.omitConsultationRef);
  }
}

/** Clean document title — no coloured brand banner */
function addDocTitle(doc: jsPDF, title: string, ctx: PdfContext): number {
  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, y);
  y += 6;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const patient = patientLabel(ctx.patientInfo);
  const addressInline = formatPatientAddress(
    ctx.patientInfo.addressLines,
    ctx.patientInfo.address,
  )
    .split('\n')
    .join(', ');
  const metaLeft = [
    `Patient: ${patient}`,
    ctx.patientInfo.dateOfBirth ? `DOB: ${ctx.patientInfo.dateOfBirth}` : null,
    ctx.patientInfo.patientId ? `Patient ID: ${ctx.patientInfo.patientId}` : null,
    addressInline ? `Address: ${addressInline}` : null,
  ].filter(Boolean) as string[];
  const metaRight = [
    `Pharmacist: ${ctx.pharmacistName}`,
    ctx.pathwayName ? `Pathway: ${ctx.pathwayName}` : null,
    `Date: ${ctx.consultationDate}`,
  ].filter(Boolean) as string[];

  const rows = Math.max(metaLeft.length, metaRight.length);
  for (let i = 0; i < rows; i++) {
    if (metaLeft[i]) doc.text(metaLeft[i], MARGIN, y);
    if (metaRight[i]) doc.text(metaRight[i], PAGE_WIDTH - MARGIN, y, { align: 'right' });
    y += 4.5;
  }
  y += 4;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  return y + 8;
}

function wrapText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  align: 'left' | 'right' = 'left',
): number {
  if (!text?.trim()) return y;
  const lines = doc.splitTextToSize(text.trim(), maxWidth) as string[];
  for (const line of lines) {
    y = ensureSpace(doc, y, 10);
    if (align === 'right') {
      doc.text(line, x + maxWidth, y, { align: 'right' });
    } else {
      doc.text(line, x, y);
    }
    y += LINE_HEIGHT;
  }
  return y;
}

function wrapMarkdownRuns(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): number {
  const runs = splitInlineMarkdownRuns(text);
  if (!runs.length) return y;

  type Token = { text: string; bold?: boolean };
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      tokens.push({ text: part, bold: run.bold });
    }
  }

  const line: Token[] = [];
  let lineWidth = 0;

  const flush = () => {
    if (!line.length) return;
    y = ensureSpace(doc, y, 10);
    let cursor = x;
    for (const token of line) {
      doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
      doc.text(token.text, cursor, y);
      cursor += doc.getTextWidth(token.text);
    }
    y += LINE_HEIGHT;
    line.length = 0;
    lineWidth = 0;
  };

  for (const token of tokens) {
    doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
    const width = doc.getTextWidth(token.text);
    const isSpace = /^\s+$/.test(token.text);
    if (!isSpace && lineWidth + width > maxWidth && line.length > 0) {
      flush();
    }
    if (isSpace && line.length === 0) continue;
    line.push(token);
    lineWidth += width;
  }
  flush();
  return y;
}

function heading(doc: jsPDF, label: string, y: number): number {
  y = ensureSpace(doc, y, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(label, MARGIN, y);
  y += 2;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, y + 1, PAGE_WIDTH - MARGIN, y + 1);
  return y + 7;
}

function subheading(doc: jsPDF, label: string, y: number): number {
  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(label, MARGIN, y);
  return y + 5;
}

function body(doc: jsPDF, text: string | undefined, y: number, indent = 0): number {
  const source = looksLikeHtml(text ?? '')
    ? fieldToPlainText(text)
    : String(text ?? '');
  if (!source.trim()) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  return renderMarkdownFlow(doc, source, MARGIN + indent, y, CONTENT_WIDTH - indent) + 3;
}

function bullets(doc: jsPDF, items: string[], y: number): number {
  const clean = items.map((s) => fieldToPlainText(s).trim()).filter(Boolean);
  if (!clean.length) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  for (const item of clean) {
    y = ensureSpace(doc, y, 10);
    const lines = doc.splitTextToSize(`•  ${item}`, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      doc.text(line, MARGIN, y);
      y += LINE_HEIGHT;
    }
    y += 1;
  }
  return y + 2;
}

function paragraph(
  doc: jsPDF,
  text: string | undefined,
  y: number,
  options?: { blockGap?: number; afterGap?: number },
): number {
  if (!text?.trim()) return y;
  const source = looksLikeHtml(text) ? fieldToPlainText(text) : text;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const afterGap = options?.afterGap ?? 4;
  return renderMarkdownFlow(doc, source, MARGIN, y, CONTENT_WIDTH, options?.blockGap) + afterGap;
}

function renderMarkdownFlow(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  blockGap = 2,
): number {
  const blocks = partitionMarkdownBlocks(text);
  if (!blocks.length) {
    return wrapMarkdownRuns(doc, text, x, y, maxWidth);
  }
  for (const block of blocks) {
    if (block.type === 'treatments') {
      const numbered = block.lines.length >= 2;
      for (let i = 0; i < block.lines.length; i += 1) {
        const item = block.lines[i].replace(/^\s*\d+[.)]\s+/, '');
        const prefix = numbered ? `${i + 1}. ` : '';
        y = wrapMarkdownRuns(doc, `${prefix}${item}`, x, y, maxWidth);
      }
      y += blockGap + 2;
      continue;
    }
    if (block.type === 'bullets') {
      for (const item of block.items) {
        y = wrapMarkdownRuns(doc, `•  ${item}`, x, y, maxWidth);
      }
      y += blockGap + 2;
      continue;
    }
    y = wrapMarkdownRuns(doc, block.text, x, y, maxWidth) + blockGap + 2;
  }
  return y;
}

function splitBullets(text?: string): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n|•|;/)
    .map((s) => s.replace(/^(?:[-–—]|[*•])(?!\*)\s+/, '').trim())
    .filter((s) => s.length > 1);
}

function pharmacistBlock(doc: jsPDF, ctx: PdfContext, y: number): number {
  y = ensureSpace(doc, y, ctx.pharmacistSignature ? 42 : 28);
  y += 4;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;
  if (ctx.pharmacistSignature) {
    const box = drawPdfImage(doc, ctx.pharmacistSignature, MARGIN, y, 48, 14);
    y += box.h + 3;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(ctx.pharmacistName + (ctx.pharmacistCredentials ? `, ${ctx.pharmacistCredentials}` : ', RPh'), MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (ctx.tenantName) {
    doc.text(ctx.tenantName, MARGIN, y);
    y += 4.5;
  }
  const contact = [ctx.pharmacyPhone, ctx.pharmacyFax, ctx.pharmacyEmail].filter(Boolean).join('  ·  ');
  if (contact) {
    doc.text(contact, MARGIN, y);
    y += 4.5;
  }
  doc.text(`Date: ${ctx.consultationDate}`, MARGIN, y);
  return y + 4;
}

// ── DAP Note ──────────────────────────────────────────────────────────────────

function buildDapNote(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const fields = upgradeDapNoteFields(pkg.documents?.consultation_note ?? {});
  const title = fields.documentTitle?.trim() || DAP_NOTE_TITLE;

  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  y = wrapText(doc, title, MARGIN, y, CONTENT_WIDTH);
  y += 8;

  for (const section of listPopulatedDapSections(fields)) {
    y = ensureSpace(doc, y, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(section.label, MARGIN, y);
    y += 7;
    y = paragraph(doc, section.value, y, { blockGap: 4, afterGap: 7 });
    y += 2;
  }

  const references = fields.clinicalReferences?.trim();
  if (references) {
    y = ensureSpace(doc, y, 16);
    y += 6;
    y = paragraph(doc, references, y, { afterGap: 4 });
  }

  const attestation = fields.attestationBlock?.trim();
  if (attestation) {
    y = ensureSpace(doc, y, 32);
    y += 8;
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    for (const line of attestation.split('\n').map((l) => l.trim()).filter(Boolean)) {
      y = ensureSpace(doc, y, 8);
      doc.text(line, MARGIN, y);
      y += 6;
    }
    y += 2;
  } else {
    y = pharmacistBlock(doc, ctx, y);
  }

  finalizePages(doc, ctx, { omitConsultationRef: true });
}

// ── Prescriber Communication ──────────────────────────────────────────────────

function buildPrescriberCommunication(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const fields = upgradePcpCommunicationFields(
    pkg.documents?.prescriber_communication ?? {},
  );
  const title = fields.documentTitle?.trim() || PCP_LETTER_TITLE;

  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  y = wrapText(doc, title, MARGIN, y, CONTENT_WIDTH);
  y += 8;

  const header = fields.headerBlock?.trim();
  if (header) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    for (const line of header.split('\n')) {
      if (!line.trim() || /^re:/i.test(line)) {
        continue;
      }
      y = wrapText(doc, line, MARGIN, y, CONTENT_WIDTH);
    }
    y += 4;
  }

  const identity = pcpIdentityFromPatientInfo(ctx.patientInfo, fields);
  const name = identity.name;
  const dob = formatPcpPatientDob(identity.dateOfBirth);
  const phn = identity.phnNotAvailable ? 'Not available' : identity.phn;
  if (name || dob || phn) {
    y = ensureSpace(doc, y, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('PATIENT INFORMATION', MARGIN, y);
    y += 5;
    const row = [
      name ? `Name: ${name}` : null,
      dob ? `Date of birth: ${dob}` : null,
      phn ? `PHN: ${phn}` : null,
    ].filter(Boolean) as string[];
    const boxH = 12;
    doc.setFillColor(245, 246, 247);
    doc.setDrawColor(217, 222, 227);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y - 4, CONTENT_WIDTH, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const colW = CONTENT_WIDTH / Math.max(row.length, 1);
    row.forEach((cell, i) => {
      const [label, ...rest] = cell.split(':');
      const value = rest.join(':').trim();
      const x = MARGIN + 3 + i * colW;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, x, y + 3);
      const labelW = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      doc.text(value, x + labelW, y + 3);
    });
    y += boxH + 4;
  }

  const salutation = fields.salutation?.trim() || pcpSalutation(fields.recipientName);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  y = wrapText(doc, salutation, MARGIN, y, CONTENT_WIDTH);
  y += 6;

  const opening = fields.openingSentence?.trim();
  if (opening) {
    y = paragraph(doc, opening, y);
    y += 2;
  }

  for (const section of listPopulatedPcpSections(fields)) {
    y = ensureSpace(doc, y, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`${section.label}:`, MARGIN, y);
    y += 6;
    if (section.key === 'treatment') {
      const lines = section.value
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      for (const line of lines) {
        y = wrapText(doc, line, MARGIN, y, CONTENT_WIDTH);
        y += 2;
      }
      y += 2;
    } else {
      y = paragraph(doc, section.value, y);
      y += 1;
    }
  }

  y += 2;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  y = wrapText(
    doc,
    fields.closingSentence?.trim() || PCP_CLOSING_SENTENCE,
    MARGIN,
    y,
    CONTENT_WIDTH,
  );
  y += 8;

  const signature = fields.signatureBlock?.trim();
  if (ctx.pharmacistSignature) {
    y = ensureSpace(doc, y, 22);
    const box = drawPdfImage(doc, ctx.pharmacistSignature, MARGIN, y, 48, 14);
    y += box.h + 4;
  }
  if (signature) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    for (const line of signature.split('\n')) {
      if (!line.trim()) {
        y += 3;
        continue;
      }
      y = wrapText(doc, line, MARGIN, y, CONTENT_WIDTH);
    }
  }

  finalizePages(doc, ctx, { omitConsultationRef: true });
}

// ── Patient Care Summary ──────────────────────────────────────────────────────

function buildPatientCareSummary(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const fields = upgradePatientHandoutFields(pkg.documents?.patient_care_summary ?? {});
  const title = resolveHandoutTitle(fields);
  const rtl = isRtlHandoutLanguage(fields.handoutLanguage);
  const align: 'left' | 'right' = rtl ? 'right' : 'left';
  const cardKeys = new Set([
    'treatment',
    'expectedResponse',
    'selfCare',
    'seekCare',
    'followUp',
  ]);

  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  y = wrapText(doc, title, MARGIN, y, CONTENT_WIDTH, align);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const identity = [ctx.patientInfo.name?.trim(), ctx.consultationDate]
    .filter(Boolean)
    .join('  ·  ');
  if (identity) {
    if (rtl) doc.text(identity, PAGE_WIDTH - MARGIN, y, { align: 'right' });
    else doc.text(identity, MARGIN, y);
    y += 5;
  }

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  for (const section of listPopulatedHandoutSections(fields)) {
    const items = splitBullets(section.value);
    const asList =
      section.key !== 'questionsContact' &&
      (section.key === 'treatment' || items.length > 1);
    const lines =
      section.key === 'questionsContact'
        ? section.value
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : asList
          ? (items.length ? items : [section.value]).map((s) => s.trim()).filter(Boolean)
          : [section.value.trim()].filter(Boolean);
    const isCard = cardKeys.has(section.key);
    const caution = section.key === 'seekCare';
    const fill: [number, number, number] = caution ? [255, 248, 235] : [246, 251, 251];
    const stroke: [number, number, number] = caution ? [239, 197, 127] : [213, 228, 230];

    y = ensureSpace(doc, y, isCard ? 22 : 16);
    if (isCard) {
      const innerWidth = CONTENT_WIDTH - 8;
      const titleHeight = 6;
      const bodyHeight = lines.reduce((sum, item) => {
        const wrapped = doc.splitTextToSize(`•  ${item}`, innerWidth) as string[];
        return sum + wrapped.length * LINE_HEIGHT + 1;
      }, 0);
      const boxHeight = titleHeight + bodyHeight + 8;
      y = ensureSpace(doc, y, boxHeight);
      doc.setFillColor(...fill);
      doc.setDrawColor(...stroke);
      doc.setLineWidth(0.35);
      doc.roundedRect(MARGIN, y - 3, CONTENT_WIDTH, boxHeight, 2.5, 2.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...(caution ? ([122, 75, 0] as [number, number, number]) : INK));
      if (rtl) doc.text(section.label, PAGE_WIDTH - MARGIN - 4, y + 3, { align: 'right' });
      else doc.text(section.label, MARGIN + 4, y + 3);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      for (const item of lines) {
        const prefix = rtl ? '' : '•  ';
        const suffix = rtl ? '  •' : '';
        const bullet = `${prefix}${item}${suffix}`;
        y =
          (rtl
            ? wrapText(doc, stripInlineMarkdown(bullet), MARGIN + 4, y, innerWidth, align)
            : wrapMarkdownRuns(doc, bullet, MARGIN + 4, y, innerWidth)) + 1;
      }
      y += 6;
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      if (rtl) doc.text(section.label, PAGE_WIDTH - MARGIN, y, { align: 'right' });
      else doc.text(section.label, MARGIN, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (asList) {
        for (const item of lines) {
          y = ensureSpace(doc, y, 10);
          const prefix = rtl ? '' : '•  ';
          const suffix = rtl ? '  •' : '';
          const bullet = `${prefix}${item}${suffix}`;
          y =
            (rtl
              ? wrapText(doc, stripInlineMarkdown(bullet), MARGIN, y, CONTENT_WIDTH, align)
              : wrapMarkdownRuns(doc, bullet, MARGIN, y, CONTENT_WIDTH)) + 1;
        }
        y += 2;
      } else {
        for (const item of lines) {
          y = rtl
            ? wrapText(doc, stripInlineMarkdown(item), MARGIN, y, CONTENT_WIDTH, align)
            : wrapMarkdownRuns(doc, item, MARGIN, y, CONTENT_WIDTH);
        }
        y += 4;
      }
      y += 2;
    }
  }

  finalizePages(doc, ctx);
}

function rxRule(doc: jsPDF, y: number): number {
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.35);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  return y + 6;
}

function formatPatientNameRx(name?: string, fallback?: string): string {
  const raw = (name ?? '').trim();
  if (!raw) return (fallback ?? 'PATIENT').toUpperCase();
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return parts[0].toUpperCase();
  const last = parts[parts.length - 1].toUpperCase();
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}

function shortPrintedDate(isoOrLabel: string): string {
  const parsed = Date.parse(isoOrLabel);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed)
      .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace(/ /g, '-');
  }
  // "11 July 2026" → "11-Jul-2026"
  const m = isoOrLabel.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      January: 'Jan',
      February: 'Feb',
      March: 'Mar',
      April: 'Apr',
      May: 'May',
      June: 'Jun',
      July: 'Jul',
      August: 'Aug',
      September: 'Sep',
      October: 'Oct',
      November: 'Nov',
      December: 'Dec',
    };
    const mon = months[m[2]] ?? m[2].slice(0, 3);
    return `${m[1].padStart(2, '0')}-${mon}-${m[3]}`;
  }
  return isoOrLabel;
}

function formatAgeSex(age?: string, sex?: string): string | null {
  const a = age?.trim();
  const s = sex?.trim();
  if (!a && !s) return null;
  if (a && s) return `Age: ${a}${/year/i.test(a) ? '' : ' years'} (${s.charAt(0).toUpperCase()})`;
  if (a) return `Age: ${a}${/year/i.test(a) ? '' : ' years'}`;
  return `(${s!.charAt(0).toUpperCase()})`;
}

function sigLine(med: {
  dosage?: string;
  frequency?: string;
  duration?: string;
}): string {
  const dosage = med.dosage?.trim();
  const frequency = med.frequency?.trim();
  const duration = med.duration?.trim();
  // TipTap list dumps can leak into dosage; never print that chrome on the Rx PDF.
  if (
    dosage &&
    (/Patient Instructions:/i.test(dosage) ||
      /\bQty:\s*/i.test(dosage) ||
      /\bStart:\s*/i.test(dosage) ||
      /\d+[.)]\s*Rx\s*-/i.test(dosage) ||
      /^Rx\s*-/i.test(dosage))
  ) {
    return '';
  }
  const parts = [dosage, frequency].filter(Boolean);
  let line = parts.join(', ');
  if (duration) {
    line = line ? `${line} X ${duration}` : duration;
  }
  return line;
}

/** Prefer structured fields; fall back to legacy "Original prescription: Name · Date" instructions. */
function resolveOriginalPrescriberForPdf(med: {
  originalPrescriber?: string;
  originalPrescriptionDate?: string;
  instructions?: string;
}): { name?: string; date?: string } {
  const name = med.originalPrescriber?.trim();
  if (name) {
    return { name, date: med.originalPrescriptionDate?.trim() || undefined };
  }
  const instructions = med.instructions?.trim();
  if (!instructions || !/^Original prescription:/i.test(instructions)) return {};
  const bits = instructions
    .replace(/^Original prescription:\s*/i, '')
    .split(/\s*[·•|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^Rx\s*#/i.test(part));
  if (!bits.length) return {};
  const dateIdx = bits.findIndex((part) => /^\d{1,2}-[A-Za-z]{3,}-\d{4}$/.test(part));
  const date = dateIdx >= 0 ? bits[dateIdx] : undefined;
  const resolvedName = bits.filter((_, index) => index !== dateIdx).join(' · ').trim();
  return resolvedName ? { name: resolvedName, date } : {};
}

function gridRow(
  doc: jsPDF,
  y: number,
  leftLabel: string,
  leftValue: string | undefined,
  rightLabel: string,
  rightValue: string | undefined,
  boldLeftValue = false,
): number {
  const mid = PAGE_WIDTH / 2 + 4;
  const labelW = 38;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);

  doc.text(`${leftLabel}:`, MARGIN, y);
  doc.setFont('helvetica', boldLeftValue ? 'bold' : 'normal');
  doc.text(leftValue?.trim() || '—', MARGIN + labelW, y);

  doc.setFont('helvetica', 'normal');
  doc.text(`${rightLabel}:`, mid, y);
  doc.text(rightValue?.trim() || '—', mid + labelW, y);
  return y + 5;
}

function formatDobRx(dob?: string): string | null {
  if (!dob?.trim()) return null;
  const parsed = Date.parse(dob.includes('T') ? dob : `${dob}T12:00:00`);
  if (Number.isNaN(parsed)) return dob.trim();
  return new Date(parsed)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace(/ /g, '-');
}

function ageFromDob(dob?: string): string | null {
  if (!dob?.trim()) return null;
  const birth = new Date(`${dob.trim()}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  if (age < 0 || age > 120) return null;
  return String(age);
}

/** Clinical-style Rx PDF matching the SafeScribe / clinic prescription sample layout */
function buildPrescription(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const d = pkg.documents?.prescription ?? {};
  // Prefer TipTap / Notion medicationBlock edits over the original structured rows.
  const meds =
    syncPrescriptionMedicationsFromBlock(d.medications, d.medicationBlock) ??
    d.medications ??
    [];

  // Overlay pharmacist-edited patient fields from the saved patientBlock.
  // This ensures that edits to name, DOB, PHN, address in the TipTap editor
  // are reflected in the printed/faxed PDF instead of using stale ctx values.
  const editedPatient = parsePatientBlockForPdf(d.patientBlock);
  const patient: PatientDocumentInfo = {
    ...ctx.patientInfo,
    ...(editedPatient.name ? { name: editedPatient.name } : {}),
    ...(editedPatient.dateOfBirth ? { dateOfBirth: editedPatient.dateOfBirth } : {}),
    ...(editedPatient.patientId !== undefined
      ? {
          patientId: editedPatient.patientId,
          phnNotAvailable: editedPatient.patientId === 'Not available',
        }
      : {}),
    ...(editedPatient.address ? { address: editedPatient.address } : {}),
    ...(editedPatient.phone ? { phone: editedPatient.phone } : {}),
  };

  let y = MARGIN + 2;

  // ── Header: Rx mark + prescriber / pharmacy ───────────────────────────────
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(32);
  doc.setTextColor(...INK);
  doc.text('Rx', MARGIN, y + 10);

  const headerX = MARGIN + 24;
  const cred = ctx.pharmacistCredentials ? `, ${ctx.pharmacistCredentials}` : ', RPh';
  let logoBox: { w: number; h: number } | null = null;
  if (ctx.pharmacyLogo) {
    logoBox = fitImageBox(ctx.pharmacyLogo.widthPx, ctx.pharmacyLogo.heightPx, 32, 16);
    drawPdfImage(
      doc,
      ctx.pharmacyLogo,
      PAGE_WIDTH - MARGIN - logoBox.w,
      y - 1,
      32,
      16,
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const nameMax = logoBox ? CONTENT_WIDTH - 24 - logoBox.w - 6 : CONTENT_WIDTH - 24;
  const nameLines = doc.splitTextToSize(
    `${ctx.pharmacistName.toUpperCase()}${cred.toUpperCase()}`,
    Math.max(70, nameMax),
  ) as string[];
  doc.text(nameLines[0] ?? '', headerX, y + 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let hy = y + 8;
  if (ctx.tenantName?.trim()) {
    doc.text(ctx.tenantName.trim(), headerX, hy);
    hy += 4.2;
  } else {
    doc.text('Pharmacy', headerX, hy);
    hy += 4.2;
  }
  if (ctx.pharmacyAddress?.trim()) {
    const addrLines = ctx.pharmacyAddress
      .trim()
      .split(/\n+/)
      .flatMap((line) => doc.splitTextToSize(line.trim(), 105) as string[]);
    for (const line of addrLines.slice(0, 3)) {
      if (!line) continue;
      doc.text(line, headerX, hy);
      hy += 4;
    }
  }
  const telFax = [
    ctx.pharmacyPhone && `Tel: ${ctx.pharmacyPhone}`,
    ctx.pharmacyFax && `Fax: ${ctx.pharmacyFax}`,
  ]
    .filter(Boolean)
    .join('   ');
  if (telFax) {
    doc.text(telFax, headerX, hy);
    hy += 4;
  }

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (logoBox) {
    doc.text(
      `printed ${shortPrintedDate(ctx.consultationDate)}`,
      PAGE_WIDTH - MARGIN,
      y - 1 + logoBox.h + 4,
      { align: 'right' },
    );
    hy = Math.max(hy, y - 1 + logoBox.h + 6);
  } else {
    doc.text(`printed ${shortPrintedDate(ctx.consultationDate)}`, PAGE_WIDTH - MARGIN, y + 3, {
      align: 'right',
    });
  }
  doc.setTextColor(...INK);

  y = Math.max(hy, y + 20) + 3;
  y = rxRule(doc, y);

  // ── Patient block (left identity / address · right PHN / DOB / age) ────────
  const displayName = formatPatientNameRx(patient.name, 'PATIENT');
  const rightX = PAGE_WIDTH / 2 + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(displayName, MARGIN, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let ly = y + 5;
  let ry = y;

  if (patient.patientId?.trim() && patient.patientId !== 'Not available') {
    doc.text(`PHN: ${patient.patientId.trim()}`, rightX, ry);
    ry += 4.5;
  } else if (patient.phnNotAvailable) {
    doc.text('PHN: Not available', rightX, ry);
    ry += 4.5;
  }
  const dobLabel = formatDobRx(patient.dateOfBirth);
  if (dobLabel) {
    doc.text(`DOB: ${dobLabel}`, rightX, ry);
    ry += 4.5;
  }
  const age = patient.age?.trim() || ageFromDob(patient.dateOfBirth) || undefined;
  const ageSex = formatAgeSex(age, patient.sex);
  if (ageSex) {
    doc.text(ageSex, rightX, ry);
    ry += 4.5;
  }

  const street = [
    patient.addressLines?.unit?.trim()
      ? `Unit ${patient.addressLines.unit.trim()}`
      : null,
    patient.addressLines?.street?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const cityLine = [
    patient.addressLines?.city?.trim(),
    patient.addressLines?.province?.trim(),
    patient.addressLines?.postalCode?.trim(),
  ]
    .filter(Boolean)
    .join(', ');

  if (street || cityLine) {
    if (street) {
      doc.text(street, MARGIN, ly);
      ly += 4.2;
    }
    if (cityLine) {
      doc.text(cityLine, MARGIN, ly);
      ly += 4.2;
    }
  } else if (patient.address?.trim()) {
    const addrLines = doc.splitTextToSize(
      patient.address.trim(),
      CONTENT_WIDTH / 2 - 6,
    ) as string[];
    for (const line of addrLines.slice(0, 3)) {
      doc.text(line, MARGIN, ly);
      ly += 4.2;
    }
  }
  if (patient.phone?.trim()) {
    doc.text(
      formatDocumentFaxNumber(patient.phone) ?? patient.phone.trim(),
      MARGIN,
      ly,
    );
    ly += 4.2;
  }

  y = Math.max(ly, ry) + 3;
  y = rxRule(doc, y);

  // ── Medication blocks ─────────────────────────────────────────────────────
  if (!meds.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.text('No medications prescribed.', MARGIN, y);
    y += 10;
  } else {
    for (let i = 0; i < meds.length; i++) {
      const med = meds[i];
      y = ensureSpace(doc, y, 58);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      const rxLabel = formatPrescriptionRxBrandLine(med);
      doc.text(rxLabel, MARGIN, y);

      if (med.genericName?.trim()) {
        const brandW = doc.getTextWidth(`${rxLabel} `);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text(`(${med.genericName.trim()})`, MARGIN + brandW, y);
      }
      y += 6;

      const sig = sigLine(med);
      if (sig) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        y = wrapText(doc, sig, MARGIN, y, CONTENT_WIDTH) + 2;
      }

      const instructions = med.instructions?.trim();
      const isLegacyOriginalRx =
        Boolean(instructions) && /^Original prescription:/i.test(instructions!);
      if (instructions && !isLegacyOriginalRx) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Patient Instructions:', MARGIN + 2, y);
        y += 4.2;
        doc.setFont('helvetica', 'normal');
        y =
          wrapText(doc, instructions, MARGIN + 2, y, CONTENT_WIDTH - 2) +
          3;
      } else {
        y += 2;
      }

      const start =
        med.startDate?.trim() || shortPrintedDate(ctx.consultationDate);
      const effective = med.effectiveDate?.trim() || start;

      y = gridRow(
        doc,
        y,
        'Qty',
        med.quantity || 'As directed',
        'Drug Use',
        med.drugUse || 'As directed',
      );
      y = gridRow(doc, y, 'Refills', med.refills ?? '0', 'Route', med.route || '—', true);
      y = gridRow(doc, y, 'Start Date', start, 'End Date', med.endDate || '—');
      y = gridRow(
        doc,
        y,
        'Compliance Pkg Req',
        med.compliancePkg || 'No',
        'Substitutions',
        med.substitutions || 'Allowed',
      );
      y = gridRow(
        doc,
        y,
        'Effective Date',
        effective,
        'Expiry Date',
        med.expiryDate || '—',
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text('Trial Dispenses:', PAGE_WIDTH / 2 + 4, y);
      doc.text(med.trialDispenses || 'Not Authorized', PAGE_WIDTH / 2 + 4 + 38, y);
      y += 7;

      const original = resolveOriginalPrescriberForPdf(med);
      if (original.name) {
        y = ensureSpace(doc, y, 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        const originalLine = original.date
          ? `Original Prescriber: ${original.name}  ·  Date: ${original.date}`
          : `Original Prescriber: ${original.name}`;
        y = wrapText(doc, originalLine, MARGIN, y, CONTENT_WIDTH) + 4;
      }

      if (i < meds.length - 1) {
        y += 5;
        y = rxRule(doc, y);
        y += 6;
      }
    }
  }

  y = rxRule(doc, y);

  // ── Signature / footer ────────────────────────────────────────────────────
  y = ensureSpace(doc, y, ctx.pharmacistSignature ? 44 : 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('Signature:', MARGIN, y);

  if (ctx.pharmacistSignature) {
    const box = drawPdfImage(doc, ctx.pharmacistSignature, MARGIN + 22, y - 4, 52, 16);
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    const lineEnd = MARGIN + 22 + Math.max(68, box.w);
    doc.line(MARGIN + 22, y + box.h - 3, lineEnd, y + box.h - 3);
    y += box.h + 2;
  } else {
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    doc.line(MARGIN + 22, y + 1, MARGIN + 90, y + 1);
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`${ctx.pharmacistName}${cred}`, MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    'Prescribed under provincial pharmacist prescribing authority.',
    MARGIN,
    y,
  );
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('** Please take this prescription to your pharmacist **', MARGIN, y);

  if (d.notes?.trim() || d.specialInstructions?.trim()) {
    y += 8;
    y = ensureSpace(doc, y, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notes', MARGIN, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    y = wrapText(
      doc,
      d.notes?.trim() || d.specialInstructions?.trim() || '',
      MARGIN,
      y,
      CONTENT_WIDTH,
    );
  }

  finalizePages(doc, ctx);
}

function buildConsultationSummary(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const d = pkg.documents?.consultationSummary ?? {};
  let y = addDocTitle(doc, 'Consultation Summary', ctx);
  y = paragraph(doc, d.summary, y);
  y = heading(doc, 'Chief Complaint', y);
  y = paragraph(doc, d.chiefComplaint, y);
  y = heading(doc, 'Diagnosis', y);
  y = paragraph(doc, d.diagnosis, y);
  y = heading(doc, 'Treatment', y);
  y = paragraph(doc, d.treatmentProvided, y);
  y = heading(doc, 'Outcome', y);
  y = paragraph(doc, d.outcome, y);
  y = pharmacistBlock(doc, ctx, y);
  finalizePages(doc, ctx);
}

function buildMedicationInstructions(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const d = pkg.documents?.medicationInstructions ?? {};
  let y = addDocTitle(doc, 'Medication Instructions', ctx);
  y = paragraph(doc, d.overview, y);
  for (const med of d.medications ?? []) {
    y = heading(doc, med.name, y);
    y = paragraph(
      doc,
      [
        med.howToTake && `How to take: ${med.howToTake}`,
        med.whenToTake && `When to take: ${med.whenToTake}`,
        med.sideEffects && `Side effects: ${med.sideEffects}`,
        med.warnings && `Warnings: ${med.warnings}`,
      ]
        .filter(Boolean)
        .join('\n'),
      y,
    );
  }
  y = paragraph(doc, d.generalAdvice, y);
  finalizePages(doc, ctx);
}

function buildFollowUpCare(doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) {
  const d = pkg.documents?.followUpCare ?? {};
  let y = addDocTitle(doc, 'Follow-up Care', ctx);
  y = paragraph(doc, d.timeframe, y);
  y = paragraph(doc, d.instructions, y);
  y = paragraph(doc, d.monitoringPoints, y);
  y = paragraph(doc, d.whenToReturn, y);
  y = paragraph(doc, d.contactInformation, y);
  finalizePages(doc, ctx);
}

const BUILDERS: Record<DocumentTypeId, (doc: jsPDF, pkg: DocumentationPackage, ctx: PdfContext) => void> = {
  consultation_note: buildDapNote,
  prescription: buildPrescription,
  prescriber_communication: buildPrescriberCommunication,
  patient_care_summary: buildPatientCareSummary,
};

export function buildPdfContext(consultation: Consultation, patientInfo: PatientDocumentInfo): PdfContext {
  const pharmacist = consultation.pharmacist;
  const demo = consultation.demographics;
  const enrichedPatient: PatientDocumentInfo = {
    ...finalizePatientDocumentInfo(patientInfo),
    age: patientInfo.age || demo?.age,
    sex: patientInfo.sex || demo?.sex,
  };
  return {
    consultationRef: consultation.consultationRef,
    consultationDate: new Date(consultation.createdAt).toLocaleDateString('en-CA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    pharmacistName: pharmacist ? `${pharmacist.firstName} ${pharmacist.lastName}` : 'Pharmacist',
    pharmacistCredentials: 'RPh',
    pathwayName: consultation.pathway?.name ?? consultation.pathway?.condition,
    tenantName: consultation.tenant?.name,
    pharmacyAddress: consultation.tenant?.address?.trim() || undefined,
    pharmacyPhone: formatDocumentFaxNumber(consultation.tenant?.phone) || undefined,
    pharmacyEmail: undefined,
    pharmacyFax: formatDocumentFaxNumber(consultation.tenant?.faxNumber) || undefined,
    patientInfo: enrichedPatient,
    pharmacistSignatureUrl: consultation.id
      ? `/consultations/${consultation.id}/branding/signature`
      : undefined,
    pharmacyLogoUrl: consultation.id
      ? `/consultations/${consultation.id}/branding/logo`
      : undefined,
  };
}

export type PdfLayoutMap = Partial<Record<DocumentTypeId, PdfLayoutConfig | null>>;

export async function generateDocumentPdf(
  typeId: DocumentTypeId,
  pkg: DocumentationPackage,
  ctx: PdfContext,
  layout?: PdfLayoutConfig | null,
): Promise<Blob> {
  const hydrated = await hydratePdfImages(ctx);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Patient Care Summary, PCP letter, and DAP note always use the canonical
  // Word-sample layout so Notion edits, PDF, print, and fax stay on one format.
  const useLayout =
    typeId !== 'patient_care_summary' &&
    typeId !== 'prescriber_communication' &&
    typeId !== 'consultation_note' &&
    layout?.mode === 'sections' &&
    Boolean(layout.sections?.length);

  if (useLayout) {
    const raw = (pkg.documents?.[typeId as keyof typeof pkg.documents] ?? {}) as Record<
      string,
      unknown
    >;
    renderPdfFromLayout(doc, layout!, raw, hydrated);
    return doc.output('blob');
  }

  BUILDERS[typeId](doc, pkg, hydrated);
  return doc.output('blob');
}

export async function generateAllPdfs(
  pkg: DocumentationPackage,
  ctx: PdfContext,
  layouts?: PdfLayoutMap,
  definitions: DocumentMeta[] = DOCUMENT_DEFINITIONS,
): Promise<Map<DocumentTypeId, Blob>> {
  const hydrated = await hydratePdfImages(ctx);
  const result = new Map<DocumentTypeId, Blob>();
  for (const def of definitions) {
    result.set(def.id, await generateDocumentPdf(def.id, pkg, hydrated, layouts?.[def.id]));
  }
  return result;
}

export function openPdfForPrint(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => {
      win.print();
    });
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.position = 'fixed';
  a.style.left = '-9999px';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const marker = 'base64,';
      const idx = result.indexOf(marker);
      resolve(idx >= 0 ? result.slice(idx + marker.length) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read PDF'));
    reader.readAsDataURL(blob);
  });
}
