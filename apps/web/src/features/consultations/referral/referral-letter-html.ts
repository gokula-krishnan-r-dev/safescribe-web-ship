import { escapeHtml } from '../documents/tiptap-text';

/** Unapproved drafts that still use the numbered field-dump template. */
export function isLegacyReferralLetterDump(draft: string): boolean {
  const text = String(draft ?? '');
  if (text.includes('referral-letter-v3')) return false;
  return (
    /Presenting concern\s*\/\s*pathway/i.test(text) ||
    /Not recorded in consultation/i.test(text) ||
    /Date and Consultation/i.test(text) ||
    /Triggered red flags/i.test(text)
  );
}

/** Legacy section titles — still recognized so older saved drafts render. */
const SECTION_HEADERS = new Set(
  [
    'Patient',
    'Presenting concern / pathway',
    'Referral urgency',
    'Triggered red flags',
    'Reason for referral',
    'Action already taken',
    'Pharmacist note',
    'Requested assessment',
    'Referring pharmacist',
  ].map((s) => s.toLowerCase()),
);

const CLOSING_LINES = new Set(['dear colleague,', 'sincerely,', 'sincerely']);

const LETTER_DATE = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;

function displayLetterTitle(raw: string): string {
  const stripped = raw
    .replace(/\s*—\s*DRAFT$/i, '')
    .replace(/\s*-\s*DRAFT$/i, '')
    .trim();
  if (!stripped || /^referral letter$/i.test(stripped)) return 'Referral letter';
  return stripped;
}

/**
 * Convert a plain-text referral letter draft into Notion/TipTap HTML.
 * Already-HTML drafts are returned as-is only when they are document markup,
 * not because a clinical note happens to mention an HTML tag.
 */
export function referralLetterToHtml(draft: string): string {
  const raw = String(draft ?? '').trim();
  if (!raw) {
    return '<h1>Referral letter</h1><p></p>';
  }
  if (/^<(h1|h2|p|div|article|section)\b/i.test(raw)) return raw;

  const lines = raw.split(/\r?\n/);
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i < lines.length) {
    parts.push(`<h1>${escapeHtml(displayLetterTitle(lines[i].trim()))}</h1>`);
    i += 1;
    while (i < lines.length && !lines[i].trim()) i += 1;
    if (i < lines.length && /^draft$/i.test(lines[i].trim())) {
      i += 1;
    }
  }

  let listItems: string[] = [];
  let inLetterhead = true;
  const flushList = () => {
    if (!listItems.length) return;
    parts.push(`<ul>${listItems.map((li) => `<li>${li}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed === '—' || trimmed === '-') {
      flushList();
      parts.push('<hr>');
      inLetterhead = false;
      continue;
    }

    if (CLOSING_LINES.has(trimmed.toLowerCase())) {
      flushList();
      inLetterhead = false;
      parts.push(`<p>${escapeHtml(trimmed)}</p>`);
      continue;
    }

    if (SECTION_HEADERS.has(trimmed.toLowerCase())) {
      flushList();
      inLetterhead = false;
      parts.push(`<h2>${escapeHtml(trimmed)}</h2>`);
      continue;
    }

    const bullet = trimmed.match(/^[•\-\*]\s+(.+)$/);
    if (bullet) {
      inLetterhead = false;
      listItems.push(escapeHtml(bullet[1]));
      continue;
    }

    flushList();

    if (/^(to|subject|re|dob|age|sex|consultation reference)\b/i.test(trimmed)) {
      inLetterhead = false;
    }

    const labeled = trimmed.match(/^([^:]{2,48}):\s*(.+)$/);
    if (labeled) {
      parts.push(
        `<p><strong>${escapeHtml(labeled[1])}:</strong> ${escapeHtml(labeled[2])}</p>`,
      );
      continue;
    }

    if (inLetterhead && !LETTER_DATE.test(trimmed)) {
      parts.push(`<p><strong>${escapeHtml(trimmed)}</strong></p>`);
      continue;
    }

    parts.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  flushList();
  if (!parts.length) parts.push('<p></p>');
  return parts.join('');
}
