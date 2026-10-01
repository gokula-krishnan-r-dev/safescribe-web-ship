/**
 * Clinical-document markdown → TipTap HTML.
 *
 * AI / DAP payloads often emit **drug:** markers, wrapping quotes, and
 * blockquote prefixes. The Notion editor, PDF, and Kroll copy all consume
 * this converter so pharmacists never see leftover markdown.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type MarkdownRun = { text: string; bold?: boolean };

export type MarkdownBlock =
  | { type: 'treatments'; lines: string[] }
  | { type: 'bullets'; items: string[] }
  | { type: 'paragraph'; text: string };

const TREATMENT_START =
  /^(?:\d+[.)]\s+)?(?:\*\*([^*]{1,80})\*\*|__([^_]{1,80})__)(?:\s*:)?\s*(.*)$/;
const TREATMENT_TOKEN = /\*\*[^*\s][^*]{0,79}\*\*/g;

export function hasClinicalMarkdown(value: string): boolean {
  return /(?:\*\*|__|^>\s)/m.test(String(value ?? ''));
}

export function unwrapWrappingQuotes(text: string): string {
  const t = String(text ?? '').trim();
  const wrapped = t.match(/^[“”"«»„]\s*([\s\S]*?)\s*[“”"«»„]$/);
  if (wrapped?.[1] != null && t.length >= 2) return wrapped[1].trim();
  return t;
}

export function isTreatmentLine(line: string): boolean {
  const t = stripTags(line).replace(/&nbsp;/g, ' ').trim();
  if (!t) return false;
  const m = t.match(TREATMENT_START);
  if (!m) return false;
  const name = (m[1] || m[2] || '').replace(/:$/, '').trim();
  const rest = (m[3] || '').trim();
  if (!name || name.length > 80) return false;
  if (name.includes('.')) return false;
  if (name.split(/\s+/).length > 8) return false;
  // A second **name:** in the remainder means this is not a single treatment line.
  if (/\*\*[^*\s][^*]{0,79}\*\*/.test(rest)) return false;
  return true;
}

export function stripInlineMarkdown(text: string): string {
  return splitInlineMarkdownRuns(text)
    .map((run) => run.text)
    .join('');
}

export function splitInlineMarkdownRuns(text: string): MarkdownRun[] {
  const source = unwrapWrappingQuotes(String(text ?? '')).replace(/^>\s?/gm, '');
  const runs: MarkdownRun[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) {
      runs.push({ text: source.slice(last, match.index) });
    }
    runs.push({ text: match[1] || match[2] || '', bold: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last) });
  return runs.filter((run) => run.text.length > 0);
}

/** Consecutive **name:** lines (blank-line or same-paragraph) as a numbered list. */
export function collectTreatmentLines(text: string): string[] | null {
  const lines = partitionMarkdownBlocks(text)
    .filter((block): block is Extract<MarkdownBlock, { type: 'treatments' }> => block.type === 'treatments')
    .flatMap((block) => block.lines);
  return lines.length ? lines : null;
}

export function inlineMarkdownToHtml(text: string, alreadyEscaped = false): string {
  let s = alreadyEscaped ? String(text ?? '') : escapeHtml(String(text ?? ''));
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '$1');
  return s;
}

export function partitionMarkdownBlocks(value: string): MarkdownBlock[] {
  const raw = unwrapWrappingQuotes(String(value ?? '').replace(/\r\n/g, '\n'));
  if (!raw.trim()) return [];

  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const out: MarkdownBlock[] = [];
  let treatments: string[] = [];

  const flushTreatments = () => {
    if (!treatments.length) return;
    out.push({ type: 'treatments', lines: treatments });
    treatments = [];
  };

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.replace(/^>\s?/, '').trim())
      .filter(Boolean);
    const inlineChunks = splitInlineTreatmentChunks(block);
    if (inlineChunks && inlineChunks.length >= 2) {
      flushTreatments();
      out.push({ type: 'treatments', lines: inlineChunks });
      continue;
    }

    if (lines.length && lines.every(isTreatmentLine)) {
      treatments.push(...lines);
      continue;
    }

    flushTreatments();
    const bullets = lines.filter(
      (line) => /^(?:[-–—]|[*•])\s+/.test(line) && !/^\*\*/.test(line),
    );
    if (lines.length >= 1 && bullets.length === lines.length) {
      out.push({
        type: 'bullets',
        items: lines.map((line) => line.replace(/^(?:[-–—]|[*•])\s+/, '')),
      });
      continue;
    }
    out.push({ type: 'paragraph', text: block.replace(/^>\s?/gm, '') });
  }
  flushTreatments();
  return out;
}

export function clinicalMarkdownToHtml(value: string): string {
  const blocks = partitionMarkdownBlocks(value);
  if (!blocks.length) return '<p></p>';
  return blocks
    .map((block) => {
      if (block.type === 'treatments') return renderTreatmentList(block.lines);
      if (block.type === 'bullets') {
        return `<ul>${block.items
          .map((item) => `<li><p>${inlineMarkdownToHtml(item)}</p></li>`)
          .join('')}</ul>`;
      }
      return `<p>${inlineMarkdownToHtml(unwrapWrappingQuotes(block.text)).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

export function hydrateMarkdownInHtml(html: string): string {
  const raw = String(html ?? '');
  if (!raw.trim()) return raw;

  let next = raw.replace(
    /<p(\b[^>]*)>([\s\S]*?)<\/p>/gi,
    (full, attrs: string, inner: string) => {
      const open = `<p${attrs}>`;
      if (/data-field\s*=/i.test(attrs)) {
        return `${open}${applyInlineInTextNodes(inner)}</p>`;
      }
      return convertParagraph(open, inner);
    },
  );

  next = dedupeTreatmentListFollowOnParagraphs(next);
  next = mergeAdjacentTreatmentParagraphs(next);
  next = mergeTreatmentHeadingParagraphs(next);
  next = dedupeAdjacentDuplicateTreatmentLists(next);
  next = stripClinicalPathwayParagraphs(next);

  if (hasClinicalMarkdown(next) && !/<p\b/i.test(next)) {
    next = applyInlineInTextNodes(next);
  }
  return next;
}

function renderTreatmentList(lines: string[]): string {
  const items = lines.map((line) =>
    line.replace(/^\s*\d+[.)]\s+/, '').trim(),
  );
  if (items.length >= 2) {
    return `<ol>${items
      .map((item) => `<li><p>${inlineMarkdownToHtml(item)}</p></li>`)
      .join('')}</ol>`;
  }
  return `<p>${inlineMarkdownToHtml(items[0] ?? '')}</p>`;
}

function convertParagraph(open: string, inner: string): string {
  const pieces = inner
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim())
    .filter(Boolean);

  let chunks = pieces;
  if (pieces.length === 1) {
    const split = splitInlineTreatmentChunks(stripTags(pieces[0]));
    if (split && split.length >= 2 && split.every(isTreatmentLine)) {
      chunks = split;
    }
  }

  if (chunks.length >= 2 && chunks.every((chunk) => isTreatmentLine(chunk))) {
    return renderTreatmentList(chunks.map((chunk) => stripTags(chunk)));
  }

  return `${open}${applyInlineInTextNodes(inner)}</p>`;
}

function mergeAdjacentTreatmentParagraphs(html: string): string {
  // Do not use [\s\S]*? between strong and </p> — backtracking can swallow
  // neighboring list-item markup and nest a second <ol> inside the first.
  return html.replace(
    /(?:<p(?![^>]*data-field)(?:\s[^>]*)?>\s*<(?:strong|b)>[^<]+<\/(?:strong|b)>[^<]*<\/p>\s*){2,}/gi,
    (seq) => {
      const items = [...seq.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)].map(
        (m) => m[1].trim(),
      );
      if (items.length < 2) return seq;
      return `<ol>${items.map((item) => `<li><p>${item}</p></li>`).join('')}</ol>`;
    },
  );
}

/**
 * When plan HTML has a numbered treatment list and then repeats the same
 * regimens as plain paragraphs, drop the plain duplicates.
 */
function dedupeTreatmentListFollowOnParagraphs(html: string): string {
  return html.replace(
    /(<ol\b[^>]*>[\s\S]*?<\/ol>)((?:\s*<p(?![^>]*data-field)(?:\s[^>]*)?>[\s\S]*?<\/p>)+)/gi,
    (full, listHtml: string, parasHtml: string) => {
      const listKeys = treatmentKeysFromList(listHtml);
      if (!listKeys.size) return full;

      const kept: string[] = [];
      for (const match of parasHtml.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi)) {
        const paragraph = match[0];
        const key = normalizeTreatmentKey(paragraph);
        if (!key || listKeys.has(key)) continue;
        kept.push(paragraph);
      }
      return `${listHtml}${kept.join('')}`;
    },
  );
}

/** Drop a second treatment `<ol>` that repeats the regimens from the previous list. */
function dedupeAdjacentDuplicateTreatmentLists(html: string): string {
  return html.replace(
    /(<ol\b[^>]*>[\s\S]*?<\/ol>)(\s*)(<ol\b[^>]*>[\s\S]*?<\/ol>)/gi,
    (full, first: string, gap: string, second: string) => {
      const firstKeys = treatmentKeysFromList(first);
      const secondKeys = [...treatmentKeysFromList(second)];
      if (!firstKeys.size || !secondKeys.length) return full;
      if (secondKeys.every((key) => firstKeys.has(key))) return first;
      return `${first}${gap}${second}`;
    },
  );
}

function treatmentKeysFromList(listHtml: string): Set<string> {
  return new Set(
    [...listHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => normalizeTreatmentKey(m[1] ?? ''))
      .filter(Boolean),
  );
}

function normalizeTreatmentKey(htmlOrText: string): string {
  return stripTags(htmlOrText)
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Remove legacy pathway governance paragraphs (and BR-separated chrome tails). */
function stripClinicalPathwayParagraphs(html: string): string {
  let next = html.replace(
    /<p(\b[^>]*data-field=["']clinicalReferences["'][^>]*)>([\s\S]*?)<\/p>/gi,
    (_full, attrs: string, inner: string) => {
      const cleaned = inner
        .split(/<br\s*\/?>/i)
        .map((part) => part.trim())
        .filter(
          (part) =>
            Boolean(part) &&
            !/^Clinical pathway:\s*/i.test(stripTags(part)) &&
            !/^Pathway last reviewed:\s*/i.test(stripTags(part)),
        )
        .join('<br><br>');
      if (!cleaned.trim()) return '';
      return `<p${attrs}>${cleaned}</p>`;
    },
  );
  next = next.replace(
    /<p(?![^>]*data-field)(?:\s[^>]*)?>\s*(?:Clinical pathway:|Pathway last reviewed:)[\s\S]*?<\/p>/gi,
    '',
  );
  return next;
}

/** Keep every regimen inside the Treatment card (`h2 + p` only styles the first sibling). */
function mergeTreatmentHeadingParagraphs(html: string): string {
  return html.replace(
    /(<h2[^>]*data-field=["']treatment["'][^>]*>[\s\S]*?<\/h2>)(\s*(?:<p(?![^>]*data-field)(?:\s[^>]*)?>[\s\S]*?<\/p>\s*){2,})/gi,
    (_full, heading: string, paras: string) => {
      const lines = [...paras.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      if (lines.length < 2) return `${heading}${paras}`;
      return `${heading}<p>${lines.join('<br>')}</p>`;
    },
  );
}

function applyInlineInTextNodes(fragment: string): string {
  return fragment.replace(/(^|>)([^<]+)(<|$)/g, (_m, open: string, text: string, close: string) => {
    if (!/\*\*|__|`/.test(text)) return `${open}${text}${close}`;
    return `${open}${inlineMarkdownToHtml(text, true)}${close}`;
  });
}

function splitInlineTreatmentChunks(text: string): string[] | null {
  const source = unwrapWrappingQuotes(text).replace(/\s+/g, ' ').trim();
  if (!source.includes('**') && !source.includes('__')) return null;
  TREATMENT_TOKEN.lastIndex = 0;
  const matches = [...source.matchAll(TREATMENT_TOKEN)].filter((match) => {
    const name = match[0].replace(/\*/g, '').replace(/:$/, '').trim();
    return name.length > 0 && name.length <= 80 && !name.includes('.') && name.split(/\s+/).length <= 8;
  });
  if (matches.length < 2) return null;
  const firstAt = matches[0]?.index ?? 0;
  if (firstAt > 3) return null;
  const chunks = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    return source.slice(start, end).trim();
  });
  if (chunks.length < 2 || !chunks.every(isTreatmentLine)) return null;
  return chunks;
}

function stripTags(value: string): string {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}
