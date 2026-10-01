import { jsPDF } from 'jspdf';
import type { PdfContext } from './types';
import { formatPatientAddress } from './patient-address';
import type { PdfLayoutConfig, PdfLayoutSection } from './pdf-layout-types';

const MARGIN = 18;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5.2;
const INK: [number, number, number] = [28, 28, 28];
const MUTED: [number, number, number] = [100, 100, 100];
const RULE: [number, number, number] = [210, 210, 210];

function ensureSpace(doc: jsPDF, y: number, need = 20): number {
  if (y > 275 - need) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  if (!text?.trim()) return y;
  const lines = doc.splitTextToSize(text.trim(), maxWidth) as string[];
  for (const line of lines) {
    y = ensureSpace(doc, y, 10);
    doc.text(line, x, y);
    y += LINE_HEIGHT;
  }
  return y;
}

function addFooter(doc: jsPDF, ctx: PdfContext, pageNum: number, totalPages: number) {
  const y = 287;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, y - 4, PAGE_WIDTH - MARGIN, y - 4);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(ctx.tenantName ?? '', MARGIN, y);
  doc.text(ctx.consultationDate, PAGE_WIDTH / 2, y, { align: 'center' });
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
}

function finalizePages(doc: jsPDF, ctx: PdfContext, enabled = true) {
  if (!enabled) return;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    addFooter(doc, ctx, i, total);
  }
}

function patientLabel(ctx: PdfContext): string {
  if (ctx.patientInfo.name?.trim()) return ctx.patientInfo.name.trim();
  return 'Patient';
}

function addDocTitle(doc: jsPDF, title: string, ctx: PdfContext, showHeader: boolean): number {
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

  if (!showHeader) return y;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const patient = patientLabel(ctx);
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

function body(doc: jsPDF, text: string | undefined, y: number): number {
  if (!text?.trim()) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  return wrapText(doc, text, MARGIN, y, CONTENT_WIDTH) + 3;
}

function bullets(doc: jsPDF, items: string[], y: number): number {
  const clean = items.map((s) => s.trim()).filter(Boolean);
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

function splitBullets(text?: string): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n|•|;/)
    .map((s) => s.replace(/^[-*]\s*/, '').trim())
    .filter((s) => s.length > 1);
}

function pharmacistBlock(doc: jsPDF, ctx: PdfContext, y: number): number {
  y = ensureSpace(doc, y, 28);
  y += 4;
  doc.setDrawColor(...RULE);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(
    ctx.pharmacistName + (ctx.pharmacistCredentials ? `, ${ctx.pharmacistCredentials}` : ', RPh'),
    MARGIN,
    y,
  );
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (ctx.tenantName) {
    doc.text(ctx.tenantName, MARGIN, y);
    y += 4.5;
  }
  const contact = [ctx.pharmacyPhone, ctx.pharmacyFax, ctx.pharmacyEmail]
    .filter(Boolean)
    .join('  ·  ');
  if (contact) {
    doc.text(contact, MARGIN, y);
    y += 4.5;
  }
  doc.text(`Date: ${ctx.consultationDate}`, MARGIN, y);
  return y + 4;
}

function fieldValue(data: Record<string, unknown>, field?: string): string {
  if (!field) return '';
  const raw = data[field];
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'name' in item) {
          return String((item as { name: unknown }).name);
        }
        return JSON.stringify(item);
      })
      .join('\n');
  }
  return JSON.stringify(raw, null, 2);
}

function renderSection(
  doc: jsPDF,
  section: PdfLayoutSection,
  data: Record<string, unknown>,
  ctx: PdfContext,
  y: number,
): number {
  switch (section.type) {
    case 'heading':
      return heading(doc, section.label || 'Section', y);
    case 'subheading':
      return subheading(doc, section.label || '', y);
    case 'spacer':
      return y + 6;
    case 'pharmacist':
      return pharmacistBlock(doc, ctx, y);
    case 'static': {
      const text = section.text?.trim();
      if (!text) return y;
      y = ensureSpace(doc, y, 12);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      return wrapText(doc, text, MARGIN, y, CONTENT_WIDTH) + 4;
    }
    case 'bullets': {
      const value = fieldValue(data, section.field);
      const items = splitBullets(value || section.fallback);
      if (!items.length) {
        if (section.showIfEmpty) return bullets(doc, ['—'], y);
        return y;
      }
      return bullets(doc, items, y);
    }
    case 'field':
    default: {
      const value = fieldValue(data, section.field).trim();
      const text = value || section.fallback || '';
      if (!text) {
        if (section.showIfEmpty) return body(doc, '—', y);
        return y;
      }
      return body(doc, text, y);
    }
  }
}

/** Render a PDF from Super Admin Doc Download Format layout + document content. */
export function renderPdfFromLayout(
  doc: jsPDF,
  layout: PdfLayoutConfig,
  data: Record<string, unknown>,
  ctx: PdfContext,
) {
  let y = addDocTitle(doc, layout.title || 'Document', ctx, layout.showPatientHeader !== false);
  for (const section of layout.sections ?? []) {
    y = renderSection(doc, section, data, ctx, y);
  }
  finalizePages(doc, ctx, layout.showPageFooter !== false);
}
