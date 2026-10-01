/**
 * Parse ChatGPT Differential Review import (items + section evidence + library).
 * Spec: SafeScribe_Differential_Review_ChatGPT_Import_References_Cursor_Spec.md
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

export const DIFFERENTIAL_IMPORT_LIKELIHOODS = ['COMMON', 'LESS_COMMON', 'RARE'] as const;

export type DifferentialImportLikelihood = (typeof DIFFERENTIAL_IMPORT_LIKELIHOODS)[number];
export type DifferentialsImportFormat = 'structured' | 'legacy' | 'unstructured';

export type ParsedImportedDifferential = {
  importKey: string;
  condition: string;
  likelihood: DifferentialImportLikelihood | null;
  screeningQuestion: string;
  whyItMatters: string;
  positiveResult: string;
  keySymptoms: string;
  howToDistinguish: string;
  suggestedNextStep: string;
  required: boolean;
  importedReferenceIds: string[];
  warnings: string[];
  blockingErrors: string[];
};

export type ParsedDifferentialsImport = {
  format: DifferentialsImportFormat;
  items: ParsedImportedDifferential[];
  sectionEvidenceIds: string[];
  references: ParsedReferenceImportItem[];
  libraryKeys: string[];
  blockingErrors: string[];
  warnings: string[];
};

const NULLISH = /^(null|none|n\/a|na|nil|-|—)?$/i;
const LIKELIHOOD_SET = new Set<string>(DIFFERENTIAL_IMPORT_LIKELIHOODS);

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

function parseLikelihood(raw: string): {
  value: DifferentialImportLikelihood | null;
  error?: string;
} {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!compact || NULLISH.test(compact)) {
    return { value: null, error: 'Likelihood is missing' };
  }
  if (LIKELIHOOD_SET.has(compact)) return { value: compact as DifferentialImportLikelihood };
  return {
    value: null,
    error: `Likelihood “${raw.trim()}” is invalid. Use COMMON, LESS_COMMON, or RARE.`,
  };
}

export function normalizeDifferentialKey(condition: string, question = ''): string {
  return normalizeQuestionKey(`${condition} ${question}`.trim());
}

function parseStructuredItems(body: string): ParsedImportedDifferential[] {
  const chunks = body.split(/^###\s+/m).map((c) => c.trim()).filter(Boolean);
  const items: ParsedImportedDifferential[] = [];
  let index = 0;
  for (const chunk of chunks) {
    if (/^section\s+evidence\b/i.test(chunk) || /^reference\s+library\b/i.test(chunk)) continue;
    const headingLine = chunk.split('\n')[0] ?? '';
    const heading = headingLine.replace(/^\d+[.)]\s*/, '').trim();
    if (!heading || heading.length < 2) continue;
    index += 1;
    const numbered = headingLine.match(/^(\d+)/);
    items.push(buildItem(`DDX${numbered?.[1] ?? index}`, heading, chunk));
  }
  return items;
}

function parseLegacyItems(text: string): ParsedImportedDifferential[] {
  const hasHeading = /##\s*Differential(?:\s+Review)?\b/i.test(text);
  const hasConditionField = /^-?\s*Condition\s*[:：]/im.test(text);
  if (!hasHeading && !hasConditionField) return [];

  const parts = hasHeading
    ? text.split(/##\s*Differential(?:\s+Review)?\b/i).map((p) => p.trim()).filter(Boolean)
    : [text];
  const items: ParsedImportedDifferential[] = [];
  let index = 0;
  for (const block of parts) {
    if (/^section\s+evidence\b/i.test(block) || /^reference\s+library\b/i.test(block)) continue;
    const condition =
      field(block, 'Condition') || block.split('\n')[0]?.replace(/^[-*•]\s*/, '').trim() || '';
    if (!condition || condition.length < 2) continue;
    if (/^differential(s)?(\s+review)?\b/i.test(condition) && !field(block, 'Condition')) continue;
    if (!field(block, 'Condition') && (condition.length > 80 || /\sinclude\b/i.test(condition))) {
      continue;
    }
    index += 1;
    const item = buildItem(`DDX${index}`, condition, block);
    item.warnings.push(
      'Legacy Condition / Likelihood script. Prefer the ### 1. structured format with a Reference Library.',
    );
    if (!item.importedReferenceIds.length) {
      item.warnings.push('Differential has no reference');
    }
    items.push(item);
  }
  return items;
}

function buildItem(importKey: string, condition: string, block: string): ParsedImportedDifferential {
  const screeningQuestion =
    field(block, 'Screening question') || field(block, 'Question');
  const likelihood = parseLikelihood(field(block, 'Likelihood'));
  const why = field(block, 'Why this matters') || field(block, 'Why it matters');
  const positiveResult =
    field(block, 'If yes → suggested result') ||
    field(block, 'If yes -> suggested result') ||
    field(block, 'Suggested result') ||
    field(block, 'Suggested pathway');
  const keySymptoms =
    field(block, 'Key symptoms / features') || field(block, 'Key symptoms');
  const howToDistinguish =
    field(block, 'How to distinguish') || field(block, 'Distinguishing features');
  const suggestedNextStep =
    field(block, 'Suggested next step') || field(block, 'Recommended action');
  const refs = parseReferenceIds(field(block, 'References') || field(block, 'Reference IDs'));
  const requiredRaw =
    field(block, 'Required in screening') || field(block, 'Required');
  const warnings: string[] = [];
  const blockingErrors: string[] = [];

  if (condition.trim().length < 2) blockingErrors.push('Condition name is missing');
  if (!screeningQuestion || NULLISH.test(screeningQuestion) || screeningQuestion.length < 8) {
    blockingErrors.push('Screening question is missing');
  }
  if (likelihood.error) blockingErrors.push(likelihood.error);
  if (!why || NULLISH.test(why)) warnings.push('Why this matters is missing');
  if (!keySymptoms || NULLISH.test(keySymptoms)) warnings.push('Key symptoms missing');
  if (!howToDistinguish || NULLISH.test(howToDistinguish)) warnings.push('How to distinguish missing');
  if (!suggestedNextStep || NULLISH.test(suggestedNextStep)) {
    warnings.push('Suggested next step missing');
  }
  if (!refs.length) warnings.push('Differential has no reference');

  return {
    importKey,
    condition: condition.trim(),
    likelihood: likelihood.value,
    screeningQuestion: screeningQuestion.trim(),
    whyItMatters: !why || NULLISH.test(why) ? '' : why,
    positiveResult: !positiveResult || NULLISH.test(positiveResult) ? '' : positiveResult,
    keySymptoms: !keySymptoms || NULLISH.test(keySymptoms) ? '' : keySymptoms,
    howToDistinguish: !howToDistinguish || NULLISH.test(howToDistinguish) ? '' : howToDistinguish,
    suggestedNextStep: !suggestedNextStep || NULLISH.test(suggestedNextStep) ? '' : suggestedNextStep,
    required: parseRequired(requiredRaw),
    importedReferenceIds: refs,
    warnings,
    blockingErrors,
  };
}

export function parseDifferentialsImport(text: string): ParsedDifferentialsImport {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (cleaned.length < 8) {
    return {
      format: 'unstructured',
      items: [],
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

  const hasDifferentialHeading = /##\s*Differential(?:\s+Review)?\b/i.test(cleaned);
  const hasSectionEvidence = /##\s*Section\s+Evidence\b/i.test(cleaned);
  const hasLibrary = /##\s*Reference\s+Library\b/i.test(cleaned);
  const hasStructuredItem = /^###\s+\d+/m.test(cleaned);

  const itemBody = extractSection(
    cleaned,
    /##\s*Differential(?:\s+Review)?\b[^\n]*/i,
    [/##\s*Section\s+Evidence\b/i, /##\s*Reference\s+Library\b/i],
  );
  const sectionBody = extractSection(
    cleaned,
    /##\s*Section\s+Evidence\b[^\n]*/i,
    [/##\s*Reference\s+Library\b/i, /##\s*Differential(?:\s+Review)?\b/i],
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

  let format: DifferentialsImportFormat = 'unstructured';
  let items: ParsedImportedDifferential[] = [];

  if (hasStructuredItem && (hasDifferentialHeading || itemBody || cleaned.includes('###'))) {
    format = 'structured';
    items = parseStructuredItems(itemBody || cleaned);
  }

  if (!items.length) {
    items = parseLegacyItems(cleaned);
    if (items.length) {
      format = 'legacy';
      warnings.push(
        'Legacy differential script. References were not inferred. Paste structured ChatGPT output instead if you need evidence mappings.',
      );
    }
  }

  if (!items.length) {
    blockingErrors.push(
      'Could not find differentials. Use ## Differential Review with ### 1. condition blocks, Section Evidence, and a Reference Library.',
    );
  }

  const sectionEvidenceIds = parseReferenceIds(sectionBody);
  if (hasSectionEvidence && !sectionEvidenceIds.length) {
    warnings.push('Section Evidence heading was present but no reference IDs were found');
  }

  for (const item of items) {
    const unknown = item.importedReferenceIds.filter((id) => !libraryKeySet.has(id));
    if (unknown.length) {
      const msg = `Undefined reference ID${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`;
      item.blockingErrors.push(msg);
      blockingErrors.push(`${item.importKey}: ${msg}`);
    }
    blockingErrors.push(
      ...item.blockingErrors.filter((e) => !blockingErrors.includes(e) && !e.startsWith('Undefined')),
    );
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
  for (const item of items) {
    const key = normalizeDifferentialKey(item.condition, item.screeningQuestion);
    if (seen.has(key)) {
      item.warnings.push('Duplicate imported differential');
      warnings.push(`Possible overlap: ${item.condition}`);
    }
    seen.add(key);
  }

  return {
    format,
    items,
    sectionEvidenceIds,
    references,
    libraryKeys,
    blockingErrors: [...new Set(blockingErrors)],
    warnings: [...new Set(warnings)],
  };
}

export function differentialOverlapScore(
  a: { condition: string; screeningQuestion: string },
  b: { condition: string; screeningQuestion: string },
): number {
  const titleScore = questionOverlapScore(a.condition, b.condition);
  const questionScore = questionOverlapScore(
    a.screeningQuestion || a.condition,
    b.screeningQuestion || b.condition,
  );
  return Math.max(titleScore, questionScore);
}
