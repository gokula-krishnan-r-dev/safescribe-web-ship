/**
 * Clinical documents must never show datastore ids, pathway UUIDs, or
 * screening-item keys. Convert those into pharmacist-facing phrases, or drop them.
 */

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATHWAY_ID = new RegExp(`\\bpathway:${UUID}\\b`, 'gi');
const BARE_UUID = new RegExp(`\\b${UUID}\\b`, 'gi');
const LEGACY_ID = /\blegacy:\d+\b/gi;
const RF_KEY = /\brf[_-][a-z0-9_]+\b/gi;

export function isTechnicalClinicalId(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(pathway|legacy):/i.test(t)) return true;
  if (new RegExp(`^${UUID}$`, 'i').test(t)) return true;
  if (/^rf[_-][a-z0-9_]+$/i.test(t)) return true;
  return false;
}

/** Turn a screening question or pathway title into a short clinical phrase. */
export function toClinicalScreeningPhrase(raw: string | null | undefined): string | null {
  let t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t || isTechnicalClinicalId(t)) return null;
  t = t.replace(/^is the following present:\s*/i, '');
  t = t
    .replace(/\?+$/, '')
    .replace(
      /^(does|did|has|have|is|are|was|were|can|could)\s+the\s+patient\s+(have|had|report|experience|show|present with)?\s*/i,
      '',
    )
    .replace(/^(does|did)\s+/i, '')
    .replace(/^(patient\s+)?(has|had|reports?|experiences?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/\?+$/, '').trim();
  if (!t || isTechnicalClinicalId(t)) return null;
  return t;
}

function collapseListPunctuation(text: string): string {
  return text
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/,\s+and\s+,/gi, ', ')
    .replace(/\s+and\s+,/gi, ' ')
    .replace(/,\s+and\s*$/i, '')
    .replace(/\s+and\s+and\b/gi, ' and ')
    .replace(/\bfor\s+,/gi, 'for ')
    .replace(/\bfor\s+and\b/gi, 'for ')
    .replace(/\?\s*,/g, ',')
    .replace(/\?(?=\s+and\b)/gi, '')
    .replace(/\?(?=\s*\.)/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+\./g, '.')
    .replace(/\bnegative for\s*\./gi, 'negative.')
    .replace(/\bwas negative for\s*\.\s*/gi, 'was negative. ')
    .replace(/\bnegative for\s*$/i, 'negative.')
    .trim();
}

/** Strip leaked ids from already-generated DAP / HTML so print, PDF, and fax stay clinical. */
export function scrubTechnicalIdsFromProse(text: string): string {
  if (!text) return text;
  let out = text.replace(PATHWAY_ID, '');
  out = out.replace(LEGACY_ID, '');
  out = out.replace(RF_KEY, '');
  out = out.replace(BARE_UUID, '');
  out = out.replace(/is the following present:\s*/gi, '');
  out = collapseListPunctuation(out);
  out = out.replace(
    /Safety screening was negative for\s*[.,]?\s*(No red flags)/gi,
    'Safety screening was negative. $1',
  );
  return collapseListPunctuation(out);
}
