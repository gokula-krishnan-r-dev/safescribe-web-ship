/**
 * Parse ChatGPT Red Flags import (items + section evidence + library).
 * Spec: SafeScribe_Red_Flags_ChatGPT_Import_References_Cursor_Spec.md
 */

import {
  parseReferenceIds,
  questionOverlapScore,
  normalizeQuestionKey,
} from './presentation-review-import.parser';
import {
  parseReferenceLibraryMarkdown,
  type ParsedReferenceImportItem,
} from './references-import.parser';

export const RED_FLAG_IMPORT_ACTIONS = [
  'IMMEDIATE_REFERRAL',
  'SAME_DAY_PHYSICIAN',
  'EMERGENCY',
  'PATHWAY_EXCLUDED',
  'PHARMACIST_DISCRETION',
] as const;

export type RedFlagImportAction = (typeof RED_FLAG_IMPORT_ACTIONS)[number];
export type RedFlagImportSeverity = 'CRITICAL' | 'WARNING';
export type RedFlagsImportFormat = 'structured' | 'legacy' | 'unstructured';

export type ParsedImportedRedFlag = {
  importKey: string;
  title: string;
  question: string;
  severity: RedFlagImportSeverity | null;
  whyItMatters: string;
  recommendedAction: RedFlagImportAction | null;
  actionNote: string;
  required: boolean;
  importedReferenceIds: string[];
  warnings: string[];
  blockingErrors: string[];
};

export type ParsedRedFlagsImport = {
  format: RedFlagsImportFormat;
  flags: ParsedImportedRedFlag[];
  sectionEvidenceIds: string[];
  references: ParsedReferenceImportItem[];
  libraryKeys: string[];
  blockingErrors: string[];
  warnings: string[];
};

const NULLISH = /^(null|none|n\/a|na|nil|-|—)?$/i;
const ACTION_SET = new Set<string>(RED_FLAG_IMPORT_ACTIONS);

function field(block: string, name: string): string {
  const re = new RegExp(
    `^-?\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]\\s*(.*)$`,
    'im',
  );
  const m = block.match(re);
  return unwrap(m?.[1]?.trim() ?? '');
}

function unwrap(value: string): string {
  return value.replace(/^\[(.*)\]$/, '$1').replace(/^"(.*)"$/, '$1').trim();
}

function extractSection(text: string, heading: RegExp, stop: RegExp[]): string {
  const start = text.search(heading);
  if (start < 0) return '';
  const afterHeading = text.slice(start).replace(heading, '');
  let end = afterHeading.length;
  for (const next of stop) {
    const idx = afterHeading.search(next);
    if (idx >= 0 && idx < end) end = idx;
  }
  return afterHeading.slice(0, end).trim();
}

function parseRequired(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === 'no' || v === '0' || v === 'optional') return false;
  return true;
}

function parseSeverity(raw: string): { value: RedFlagImportSeverity | null; error?: string } {
  const compact = raw.trim().toUpperCase();
  if (!compact || NULLISH.test(compact)) {
    return { value: null, error: 'Severity is missing' };
  }
  if (compact === 'CRITICAL' || compact === 'WARNING') return { value: compact };
  return {
    value: null,
    error: `Severity “${raw.trim()}” is invalid. Use CRITICAL or WARNING.`,
  };
}

function parseAction(raw: string): { value: RedFlagImportAction | null; error?: string } {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!compact || NULLISH.test(compact)) {
    return { value: null, error: 'Recommended action is missing' };
  }
  if (ACTION_SET.has(compact)) return { value: compact as RedFlagImportAction };
  return {
    value: null,
    error: `Recommended action “${raw.trim()}” is invalid.`,
  };
}

export function normalizeRedFlagKey(title: string, question = ''): string {
  return normalizeQuestionKey(`${title} ${question}`.trim());
}

function parseStructuredFlags(body: string): ParsedImportedRedFlag[] {
  const chunks = body.split(/^###\s+/m).map((c) => c.trim()).filter(Boolean);
  const flags: ParsedImportedRedFlag[] = [];
  let index = 0;
  for (const chunk of chunks) {
    if (/^section\s+evidence\b/i.test(chunk) || /^reference\s+library\b/i.test(chunk)) continue;
    const headingLine = chunk.split('\n')[0] ?? '';
    const heading = headingLine.replace(/^\d+[.)]\s*/, '').trim();
    if (!heading || heading.length < 2) continue;
    index += 1;
    const numbered = headingLine.match(/^(\d+)/);
    flags.push(buildFlag(`RF${numbered?.[1] ?? index}`, heading, chunk));
  }
  return flags;
}

function parseLegacyFlags(text: string): ParsedImportedRedFlag[] {
  const parts = text.split(/##\s*Red\s*Flag\b/i).map((p) => p.trim()).filter(Boolean);
  const flags: ParsedImportedRedFlag[] = [];
  let index = 0;
  for (const block of parts) {
    if (/^section\s+evidence\b/i.test(block) || /^reference\s+library\b/i.test(block)) continue;
    const title =
      field(block, 'Title') || block.split('\n')[0]?.replace(/^[-*•]\s*/, '').trim() || '';
    if (!title || title.length < 2) continue;
    if (/^red flags?\b/i.test(title) && !field(block, 'Title')) continue;
    index += 1;
    const flag = buildFlag(`RF${index}`, title, block);
    flag.warnings.push(
      'Legacy Title / Severity / Action script. Prefer the ### 1. structured format with a Reference Library.',
    );
    if (!flag.importedReferenceIds.length) {
      flag.warnings.push('Red flag has no reference');
    }
    flags.push(flag);
  }
  return flags;
}

function buildFlag(importKey: string, title: string, block: string): ParsedImportedRedFlag {
  const question = field(block, 'Question') || field(block, 'Description');
  const severity = parseSeverity(field(block, 'Severity'));
  const action = parseAction(
    field(block, 'Recommended action') || field(block, 'Action'),
  );
  const why = field(block, 'Why this matters') || field(block, 'Why it matters');
  const actionNote = field(block, 'Action note');
  const refs = parseReferenceIds(field(block, 'References') || field(block, 'Reference IDs'));
  const warnings: string[] = [];
  const blockingErrors: string[] = [];

  if (title.trim().length < 2) blockingErrors.push('Red flag title is missing');
  if (!question || NULLISH.test(question) || question.length < 8) {
    blockingErrors.push('Question is missing');
  }
  if (severity.error) blockingErrors.push(severity.error);
  if (action.error) blockingErrors.push(action.error);
  if (!why || NULLISH.test(why)) warnings.push('Why this matters is missing');
  if (!actionNote || NULLISH.test(actionNote)) warnings.push('Action note is missing');
  if (!refs.length) warnings.push('Red flag has no reference');

  return {
    importKey,
    title: title.trim(),
    question: question.trim(),
    severity: severity.value,
    whyItMatters: !why || NULLISH.test(why) ? '' : why,
    recommendedAction: action.value,
    actionNote: !actionNote || NULLISH.test(actionNote) ? '' : actionNote,
    required: parseRequired(field(block, 'Required')),
    importedReferenceIds: refs,
    warnings,
    blockingErrors,
  };
}

export function parseRedFlagsImport(text: string): ParsedRedFlagsImport {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (cleaned.length < 8) {
    return {
      format: 'unstructured',
      flags: [],
      sectionEvidenceIds: [],
      references: [],
      libraryKeys: [],
      blockingErrors: ['Paste structured ChatGPT output instead'],
      warnings,
    };
  }

  if (/\b\d{1,3}\s*%\s*(sure|confident|confidence)\b/i.test(cleaned)) {
    warnings.push('Confidence percentages were ignored');
  }

  const hasRedFlagHeading = /##\s*Red\s+Flags?(?:\s*&\s*Safety\s+Screening)?\b/i.test(cleaned);
  const hasSectionEvidence = /##\s*Section\s+Evidence\b/i.test(cleaned);
  const hasLibrary = /##\s*Reference\s+Library\b/i.test(cleaned);
  const hasStructuredItem = /^###\s+\d+/m.test(cleaned);

  const flagBody = extractSection(
    cleaned,
    /##\s*Red\s+Flags?(?:\s*&\s*Safety\s+Screening)?\b[^\n]*/i,
    [/##\s*Section\s+Evidence\b/i, /##\s*Reference\s+Library\b/i],
  );
  const sectionBody = extractSection(
    cleaned,
    /##\s*Section\s+Evidence\b[^\n]*/i,
    [/##\s*Reference\s+Library\b/i, /##\s*Red\s+Flags?\b/i],
  );

  let references: ParsedReferenceImportItem[] = [];
  if (hasLibrary) {
    const libraryParsed = parseReferenceLibraryMarkdown(cleaned, 'presentation_review');
    references = libraryParsed.items;
    if (libraryParsed.error && !libraryParsed.items.length) {
      blockingErrors.push(libraryParsed.error);
    }
  }

  const libraryKeys = references.map((r) => r.importKey.toUpperCase());
  const libraryKeySet = new Set(libraryKeys);

  let format: RedFlagsImportFormat = 'unstructured';
  let flags: ParsedImportedRedFlag[] = [];

  if (hasStructuredItem && (hasRedFlagHeading || flagBody || cleaned.includes('###'))) {
    format = 'structured';
    flags = parseStructuredFlags(flagBody || cleaned);
  }

  if (!flags.length) {
    flags = parseLegacyFlags(cleaned);
    if (flags.length) {
      format = 'legacy';
      warnings.push(
        'Legacy red-flag script. References were not inferred. Paste structured ChatGPT output instead if you need evidence mappings.',
      );
    }
  }

  if (!flags.length) {
    blockingErrors.push(
      'Could not find red flags. Use ## Red Flag with ### 1. title blocks, Section Evidence, and a Reference Library.',
    );
  }

  const sectionEvidenceIds = parseReferenceIds(sectionBody);
  if (hasSectionEvidence && !sectionEvidenceIds.length) {
    warnings.push('Section Evidence heading was present but no reference IDs were found');
  }

  for (const flag of flags) {
    const unknown = flag.importedReferenceIds.filter((id) => !libraryKeySet.has(id));
    if (unknown.length) {
      const msg = `Undefined reference ID${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`;
      flag.blockingErrors.push(msg);
      blockingErrors.push(`${flag.importKey}: ${msg}`);
    }
    blockingErrors.push(...flag.blockingErrors.filter((e) => !blockingErrors.includes(e) && !e.startsWith('Undefined')));
  }
  for (const id of sectionEvidenceIds) {
    if (!libraryKeySet.has(id)) {
      blockingErrors.push(`Section Evidence references undefined ID ${id}`);
    }
  }

  for (const ref of references) {
    blockingErrors.push(...ref.blockingErrors.map((e) => `${ref.importKey}: ${e}`));
    if (!ref.url) warnings.push(`${ref.importKey}: URL not provided`);
    else if (!/^https?:\/\//i.test(ref.url)) warnings.push(`${ref.importKey}: URL format looks invalid`);
    if (ref.verificationRequired) warnings.push(`${ref.importKey}: Verification required`);
  }

  const seen = new Set<string>();
  for (const flag of flags) {
    const key = normalizeRedFlagKey(flag.title, flag.question);
    if (seen.has(key)) {
      flag.warnings.push('Duplicate imported red flag');
      warnings.push(`Possible overlap: ${flag.title}`);
    }
    seen.add(key);
  }

  return {
    format,
    flags,
    sectionEvidenceIds,
    references,
    libraryKeys,
    blockingErrors: [...new Set(blockingErrors)],
    warnings: [...new Set(warnings)],
  };
}

export function redFlagOverlapScore(
  a: { title: string; question: string },
  b: { title: string; question: string },
): number {
  const titleScore = questionOverlapScore(a.title, b.title);
  const questionScore = questionOverlapScore(a.question || a.title, b.question || b.title);
  return Math.max(titleScore, questionScore);
}
