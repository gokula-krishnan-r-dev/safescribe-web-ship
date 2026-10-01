/**
 * Turn raw STT output into clean clinical note sentences (English).
 * Strips spoken-punctuation artifacts and fillers from medical models.
 */
export function formatDictationSentences(raw: string): string {
  let text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  // Strip bracketed / spoken punctuation commands (common Google medical artifacts)
  text = text
    .replace(/\[\s*[^\]]{0,40}\s*\]/g, ' ')
    .replace(/\(\s*(?:close|open)\s+quote\s*\)/gi, ' ')
    .replace(
      /\b(?:close quote|open quote|end quote|period|comma|question mark|exclamation mark|new (?:line|paragraph)|caps? on|caps? off|dictation)\b/gi,
      ' ',
    )
    .replace(/\b(?:um+|uh+|erm+|ah+|hmm+)\b/gi, ' ')
    .replace(/[|]{1,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?,])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  const chunks = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const sentences = (chunks.length ? chunks : [text]).map((chunk) => {
    let s = chunk.replace(/^[-•]\s*/, '').trim();
    if (!s) return '';
    s = s.replace(/\b[A-Z]{5,}\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.!?]$/.test(s)) s += '.';
    return s;
  });

  return sentences.filter(Boolean).join(' ');
}
