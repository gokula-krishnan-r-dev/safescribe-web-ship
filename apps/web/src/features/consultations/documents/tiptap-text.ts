/**
 * Plain-text ↔ TipTap HTML helpers for clinical document fields.
 * Editor may store HTML; PDF / clipboard always consume plain text.
 */

import {
  clinicalMarkdownToHtml,
  collectTreatmentLines,
  escapeHtml,
  hydrateMarkdownInHtml,
  stripInlineMarkdown,
  unwrapWrappingQuotes,
} from './clinical-markdown';

export { escapeHtml };

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ''));
}

/** Convert stored value into TipTap-friendly HTML (markdown → bold / lists). */
export function toEditorHtml(value: string): string {
  const raw = String(value ?? '');
  if (!raw.trim()) return '<p></p>';
  if (looksLikeHtml(raw)) return hydrateMarkdownInHtml(raw);
  return clinicalMarkdownToHtml(raw);
}

/** Normalize any stored field (HTML or plain) to plain text for PDF / clipboard. */
export function fieldToPlainText(value: string | undefined | null): string {
  const raw = String(value ?? '');
  if (!raw.trim()) return '';
  if (!looksLikeHtml(raw)) return markdownFieldToPlainText(raw);

  if (typeof document === 'undefined') {
    return markdownFieldToPlainText(
      raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = raw;
  const blocks: string[] = [];

  const pushBlock = (el: HTMLElement, prefix = '') => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    const text = (clone.textContent ?? '').replace(/\u00a0/g, ' ').trimEnd();
    if (text.trim()) blocks.push(`${prefix}${text}`);
  };

  wrapper.childNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'ol') {
      let index = 1;
      node.querySelectorAll(':scope > li').forEach((li) => {
        pushBlock(li as HTMLElement, `${index}. `);
        index += 1;
      });
      return;
    }
    if (tag === 'ul') {
      node.querySelectorAll(':scope > li').forEach((li) => {
        pushBlock(li as HTMLElement);
      });
      return;
    }
    if (tag === 'p' || tag === 'li' || /^h[1-6]$/.test(tag) || tag === 'div') {
      pushBlock(node);
      return;
    }
    node.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6').forEach((child) => {
      pushBlock(child as HTMLElement);
    });
  });

  if (!blocks.length) {
    return markdownFieldToPlainText(
      (wrapper.textContent ?? '').replace(/\u00a0/g, ' ').trim(),
    );
  }
  return markdownFieldToPlainText(blocks.join('\n\n').trim());
}

function markdownFieldToPlainText(value: string): string {
  const cleaned = unwrapWrappingQuotes(value).replace(/^>\s?/gm, '');
  const treatments = collectTreatmentLines(cleaned);
  if (treatments && treatments.length >= 2) {
    return treatments
      .map((line, index) => {
        const item = stripInlineMarkdown(line.replace(/^\s*\d+[.)]\s+/, ''));
        return `${index + 1}. ${item}`;
      })
      .join('\n\n');
  }
  return stripInlineMarkdown(cleaned).trim();
}

/** Map of editable fields → plain text (for generators / copy helpers). */
export function fieldsToPlainText(
  fields: Record<string, string> | undefined | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    out[key] = fieldToPlainText(value);
  }
  return out;
}
