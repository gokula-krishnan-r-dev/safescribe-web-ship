import { jsPDF } from 'jspdf';
import { fieldToPlainText } from '../documents/tiptap-text';

const MARGIN = 18;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5.2;
const INK: [number, number, number] = [28, 28, 28];
const MUTED: [number, number, number] = [100, 100, 100];
const RULE: [number, number, number] = [210, 210, 210];

export type ReferralLetterPdfMeta = {
  tenantName?: string | null;
  dateLabel?: string | null;
  documentRef?: string | null;
  draft?: boolean;
};

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

/**
 * Build a printable PDF from the live referral-letter HTML so fax, print, and
 * on-screen edits stay on the same document.
 */
export async function generateReferralLetterPdf(
  html: string,
  meta: ReferralLetterPdfMeta = {},
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (need = 16): void => {
    if (y > 275 - need) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const wrap = (text: string, font: 'bold' | 'normal', size: number, color = INK) => {
    const source = text.replace(/[^\S\n]+/g, ' ').replace(/\n[ \t]+/g, '\n').trim();
    if (!source) return;
    doc.setFont('helvetica', font);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const segment of source.split('\n')) {
      const lines = doc.splitTextToSize(segment || ' ', CONTENT_WIDTH) as string[];
      for (const line of lines) {
        ensureSpace(LINE_HEIGHT + 2);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT;
      }
    }
  };

  for (const block of parseReferralBlocks(html)) {
    if (block.type === 'title') {
      wrap(block.text, 'bold', 16);
      y += 2;
      if (meta.draft) {
        wrap('DRAFT — NOT APPROVED', 'bold', 9, MUTED);
        y += 2;
      }
      y += 4;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
      y += 8;
      continue;
    }
    if (block.type === 'heading') {
      y += 3;
      wrap(block.text, 'bold', 11, MUTED);
      y += 1.5;
      continue;
    }
    if (block.type === 'rule') {
      ensureSpace(8);
      y += 3;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
      y += 5;
      continue;
    }
    if (block.type === 'bullet') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(`•  ${block.text}`, CONTENT_WIDTH) as string[];
      for (const line of lines) {
        ensureSpace(LINE_HEIGHT + 2);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT;
      }
      y += 1;
      continue;
    }
    wrap(block.text, 'normal', 11);
    y += 1.5;
  }

  const total = doc.getNumberOfPages();
  const left = meta.tenantName?.trim() ?? '';
  const center = meta.documentRef?.trim() || meta.dateLabel?.trim() || '';
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    const fy = 287;
    doc.setDrawColor(...RULE);
    doc.line(MARGIN, fy - 4, PAGE_WIDTH - MARGIN, fy - 4);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    if (left) doc.text(left, MARGIN, fy);
    if (center) doc.text(center, PAGE_WIDTH / 2, fy, { align: 'center' });
    doc.text(`Page ${i} of ${total}`, PAGE_WIDTH - MARGIN, fy, { align: 'right' });
  }

  return doc.output('blob');
}

type ReferralPdfBlock =
  | { type: 'title'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'rule' };

function parseReferralBlocks(html: string): ReferralPdfBlock[] {
  const raw = String(html ?? '').trim();
  if (!raw) return [{ type: 'title', text: 'Referral letter' }];

  if (typeof document !== 'undefined') {
    const root = document.createElement('div');
    root.innerHTML = raw;
    const blocks: ReferralPdfBlock[] = [];
    let sawTitle = false;

    const pushText = (type: Exclude<ReferralPdfBlock['type'], 'rule'>, el: Element) => {
      const text = fieldToPlainText(el.outerHTML || el.textContent || '').trim();
      if (!text) return;
      blocks.push({ type, text });
    };

    const visit = (node: ChildNode) => {
      if (!(node instanceof HTMLElement)) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'h1') {
        pushText('title', node);
        sawTitle = true;
        return;
      }
      if (tag === 'h2' || tag === 'h3') {
        pushText('heading', node);
        return;
      }
      if (tag === 'hr') {
        blocks.push({ type: 'rule' });
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        node.querySelectorAll(':scope > li').forEach((li) => pushText('bullet', li));
        return;
      }
      if (tag === 'p' || tag === 'div' || tag === 'li' || tag === 'header' || tag === 'footer') {
        pushText(tag === 'li' ? 'bullet' : 'paragraph', node);
        return;
      }
      if (tag === 'table') {
        node.querySelectorAll('tr').forEach((tr) => {
          const th = (tr.querySelector('th')?.textContent ?? '').replace(/\s+/g, ' ').trim();
          const td = tr.querySelector('td');
          if (!td) return;
          const clone = td.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
          const value = (clone.textContent ?? '').replace(/\u00a0/g, ' ').trim();
          if (!th && !value) return;
          blocks.push({
            type: 'paragraph',
            text: th ? `${th}: ${value}` : value,
          });
        });
        return;
      }
      if (tag === 'article' || tag === 'section') {
        node.childNodes.forEach(visit);
        return;
      }
      node.childNodes.forEach(visit);
    };

    root.childNodes.forEach(visit);
    if (!sawTitle && blocks.length && !/ss-referral-letter/.test(raw)) {
      blocks.unshift({ type: 'title', text: 'Referral letter' });
    }
    return blocks.length ? blocks : [{ type: 'title', text: 'Referral letter' }];
  }

  const plain = fieldToPlainText(raw);
  return plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, i) => ({ type: i === 0 ? 'title' : 'paragraph', text }) as ReferralPdfBlock);
}
