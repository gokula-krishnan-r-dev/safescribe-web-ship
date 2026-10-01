/**
 * Pathway `helpText` is the pharmacist tip. Script import often prefixes
 * `Expected answer: YES` (or `Date documented`) before the guidance sentence.
 */

const KNOWN_EXPECTED_ANSWERS = [
  'date documented',
  'not applicable',
  'documented',
  'unknown',
  'present',
  'absent',
  'true',
  'false',
  'yes',
  'no',
  'n/a',
] as const;

export type PharmacistTipParts = {
  expectedAnswer: string | null;
  guidance: string | null;
};

function collapseWs(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatExpectedAnswer(value: string): string {
  const t = value.trim();
  if (/^(yes|no|true|false)$/i.test(t)) return t.toUpperCase();
  return t;
}

export function parsePharmacistTip(helpText?: string | null): PharmacistTipParts | null {
  let raw = collapseWs(String(helpText ?? ''));
  if (!raw) return null;
  raw = raw.replace(/^pharmacist tip:\s*/i, '').trim();
  if (!raw) return null;

  const expectedPrefix = raw.match(/^expected answer:\s*/i);
  if (!expectedPrefix) {
    return { expectedAnswer: null, guidance: raw };
  }

  const after = raw.slice(expectedPrefix[0].length).trim();
  if (!after) return null;

  const lower = after.toLowerCase();
  const known = [...KNOWN_EXPECTED_ANSWERS].sort((a, b) => b.length - a.length);
  for (const token of known) {
    if (lower === token || lower.startsWith(`${token} `) || lower.startsWith(`${token}.`)) {
      const value = after.slice(0, token.length);
      const guidance = after
        .slice(token.length)
        .replace(/^[.\s]+/, '')
        .replace(/^pharmacist tip:\s*/i, '')
        .trim();
      return {
        expectedAnswer: formatExpectedAnswer(value),
        guidance: guidance || null,
      };
    }
  }

  const clause = after.match(/^([^.]{1,48}?)\.\s+(.+)$/);
  if (clause?.[2]?.trim()) {
    return {
      expectedAnswer: formatExpectedAnswer(clause[1]),
      guidance: clause[2].trim(),
    };
  }

  return { expectedAnswer: formatExpectedAnswer(after), guidance: null };
}
