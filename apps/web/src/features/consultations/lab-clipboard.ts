/** Clipboard helpers for Labs & Vitals paste (plain text, HTML-only EMR copy, screenshots). */

export function htmlFragmentToPlainText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (typeof DOMParser === 'undefined') {
    return trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  const text = doc.body?.innerText ?? doc.body?.textContent ?? '';
  return text.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
}

export function laboratoryTextFromClipboardData(input: {
  plain?: string | null;
  html?: string | null;
}): string {
  const plain = (input.plain ?? '').replace(/\r\n/g, '\n');
  if (plain.trim()) return plain;
  return htmlFragmentToPlainText(input.html ?? '');
}

export function laboratoryTextFromClipboard(data: DataTransfer | null | undefined): string {
  if (!data) return '';
  return laboratoryTextFromClipboardData({
    plain: data.getData('text/plain'),
    html: data.getData('text/html'),
  });
}

export function imagesFromClipboard(data: DataTransfer | null | undefined): File[] {
  const out: File[] = [];
  if (!data) return out;
  for (const item of Array.from(data.items ?? [])) {
    if (!item.type.startsWith('image/')) continue;
    const blob = item.getAsFile();
    if (!blob) continue;
    const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const name =
      blob.name && blob.name !== 'image.png'
        ? blob.name
        : `lab-report-${Date.now()}-${out.length + 1}.${ext}`;
    out.push(new File([blob], name, { type: item.type || 'image/png' }));
  }
  return out;
}

export function insertTextAtCaret(
  current: string,
  insertion: string,
  element: Pick<HTMLTextAreaElement, 'selectionStart' | 'selectionEnd'>,
): { next: string; caret: number } {
  const start = element.selectionStart ?? current.length;
  const end = element.selectionEnd ?? current.length;
  const next = `${current.slice(0, start)}${insertion}${current.slice(end)}`;
  return { next, caret: start + insertion.length };
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}
