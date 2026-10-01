/**
 * Parse ChatGPT Presentation Review import (questions + section evidence + library).
 * Spec: SafeScribe_Presentation_Review_ChatGPT_Import_Cursor_Spec.md
 */

import { detectLegacyTwoSectionImport } from '@safescript/shared';
import { parseQuestionScript } from './script-import.parser';
import {
  parseReferenceLibraryMarkdown,
  type ParsedReferenceImportItem,
} from './references-import.parser';

export type ExpectedPathwayAnswer = 'yes' | 'no' | 'either';

export type ParsedPresentationReviewQuestion = {
  importKey: string;
  questionText: string;
  answerType: string;
  required: boolean;
  expectedAnswer: ExpectedPathwayAnswer | null;
  whyItMatters: string;
  pharmacistTip: string;
  conditionalDisplayDraft: string | null;
  importedReferenceIds: string[];
  answerTypeNeedsReview: boolean;
  needsRuleReview: boolean;
  warnings: string[];
  blockingErrors: string[];
};

export type PresentationReviewImportFormat = 'structured' | 'legacy' | 'unstructured';

export type ParsedPresentationReviewImport = {
  format: PresentationReviewImportFormat;
  questions: ParsedPresentationReviewQuestion[];
  sectionEvidenceIds: string[];
  references: ParsedReferenceImportItem[];
  libraryKeys: string[];
  legacyTwoSectionImport: boolean;
  blockingErrors: string[];
  warnings: string[];
};

const NULLISH = /^(null|none|n\/a|na|nil|-|—)?$/i;

function field(block: string, name: string): string {
  const re = new RegExp(`^-?\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]\\s*(.*)$`, 'im');
  const m = block.match(re);
  return m?.[1]?.trim() ?? '';
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

export function parseReferenceIds(raw: string): string[] {
  if (!raw.trim() || NULLISH.test(raw.trim())) return [];
  const ids = [...raw.matchAll(/\bR\d+\b/gi)].map((m) => m[0]!.toUpperCase());
  return [...new Set(ids)];
}

function parseRequired(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === 'no' || v === '0') return false;
  return true;
}

function parseExpectedAnswer(raw: string): ExpectedPathwayAnswer | null {
  const v = raw.trim().toLowerCase();
  if (!v || NULLISH.test(v)) return null;
  if (v === 'yes' || v === 'y') return 'yes';
  if (v === 'no' || v === 'n') return 'no';
  if (v === 'either' || v === 'any') return 'either';
  return null;
}

function parseAnswerType(raw: string): { type: string; needsReview: boolean } {
  const compact = raw.trim().toUpperCase().replace(/[\s/-]+/g, '_');
  if (!compact || compact === 'YES_NO' || compact === 'YESNO' || compact === 'BOOLEAN') {
    return { type: 'YES_NO', needsReview: false };
  }
  return { type: compact, needsReview: true };
}

function parseConditional(raw: string): { draft: string | null; needsRuleReview: boolean } {
  const v = raw.trim();
  if (!v || NULLISH.test(v)) return { draft: null, needsRuleReview: false };
  return { draft: v, needsRuleReview: true };
}

function questionTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function questionOverlapScore(a: string, b: string): number {
  const A = questionTokens(a);
  const B = questionTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export function normalizeQuestionKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseStructuredQuestions(body: string): ParsedPresentationReviewQuestion[] {
  const chunks = body.split(/^###\s+/m).map((c) => c.trim()).filter(Boolean);
  const questions: ParsedPresentationReviewQuestion[] = [];
  let index = 0;
  for (const chunk of chunks) {
    if (/^section\s+evidence\b/i.test(chunk) || /^reference\s+library\b/i.test(chunk)) continue;
    const headingLine = chunk.split('\n')[0] ?? '';
    const heading = headingLine.replace(/^\d+[.)]\s*/, '').trim();
    if (!heading || heading.length < 5) continue;
    index += 1;
    const numbered = headingLine.match(/^(\d+)/);
    const importKey = `Q${numbered?.[1] ?? index}`;
    const answer = parseAnswerType(
      field(chunk, 'Answer type') || field(chunk, 'Type') || 'YES_NO',
    );
    const expectedRaw =
      field(chunk, 'Expected pathway-consistent answer') || field(chunk, 'Expected answer');
    const expected = parseExpectedAnswer(expectedRaw);
    const conditional = parseConditional(
      field(chunk, 'Conditional display') || field(chunk, 'Conditional logic'),
    );
    const refs = parseReferenceIds(field(chunk, 'References') || field(chunk, 'Reference IDs'));
    const tip = field(chunk, 'Pharmacist tip');
    const warnings: string[] = [];
    const blockingErrors: string[] = [];
    if (heading.length < 8) blockingErrors.push('Question text is missing or too short');
    if (answer.needsReview) warnings.push(`Unsupported answer type “${answer.type}” — imported as Needs review`);
    if (!refs.length) warnings.push('Question has no reference');
    if (!tip || NULLISH.test(tip)) warnings.push('Pharmacist tip is missing');
    if (conditional.needsRuleReview) warnings.push('Conditional logic remains unstructured — needs rule review');
    if (expectedRaw && !expected) warnings.push('Expected pathway-consistent answer was not YES / NO / EITHER');
    questions.push({
      importKey,
      questionText: heading.replace(/\s+\((YES_NO|YES\s*\/\s*NO)\)\s*$/i, '').trim(),
      answerType: answer.needsReview ? answer.type : 'YES_NO',
      required: parseRequired(field(chunk, 'Required')),
      expectedAnswer: expected,
      whyItMatters: field(chunk, 'Why this matters') || field(chunk, 'Why it matters'),
      pharmacistTip: !tip || NULLISH.test(tip) ? '' : tip,
      conditionalDisplayDraft: conditional.draft,
      importedReferenceIds: refs,
      answerTypeNeedsReview: answer.needsReview,
      needsRuleReview: conditional.needsRuleReview,
      warnings,
      blockingErrors,
    });
  }
  return questions;
}

function fromLegacyScript(text: string): ParsedPresentationReviewQuestion[] {
  const parsed = parseQuestionScript(text);
  if (!parsed?.questions.length) return [];
  return parsed.questions.map((q, i) => {
    const warnings: string[] = [];
    if (!q.description) warnings.push('Why it matters is missing');
    if (!q.helpText) warnings.push('Pharmacist tip is missing');
    warnings.push('Question has no reference');
    const expected = /expected answer:\s*(yes|no)/i.exec(q.helpText || '');
    const tip = (q.helpText || '').replace(/expected answer:\s*(yes|no|either)\s*/i, '').trim();
    return {
      importKey: `Q${i + 1}`,
      questionText: q.question,
      answerType: q.type || 'YES_NO',
      required: q.required !== false,
      expectedAnswer: expected ? (expected[1]!.toLowerCase() as ExpectedPathwayAnswer) : null,
      whyItMatters: q.description || '',
      pharmacistTip: tip,
      conditionalDisplayDraft: null,
      importedReferenceIds: [],
      answerTypeNeedsReview: (q.type || 'YES_NO') !== 'YES_NO',
      needsRuleReview: false,
      warnings,
      blockingErrors: q.question.trim().length < 8 ? ['Question text is missing or too short'] : [],
    };
  });
}

export function parsePresentationReviewImport(text: string): ParsedPresentationReviewImport {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (cleaned.length < 8) {
    return {
      format: 'unstructured',
      questions: [],
      sectionEvidenceIds: [],
      references: [],
      libraryKeys: [],
      legacyTwoSectionImport: false,
      blockingErrors: ['Paste structured ChatGPT output instead'],
      warnings,
    };
  }

  const hasPresentationHeading = /##\s*Presentation\s+Review\b/i.test(cleaned);
  const hasSectionEvidence = /##\s*Section\s+Evidence\b/i.test(cleaned);
  const hasLibrary = /##\s*Reference\s+Library\b/i.test(cleaned);
  const hasStructuredQuestion = /^###\s+\d+/m.test(cleaned);

  const questionBody = extractSection(
    cleaned,
    /##\s*Presentation\s+Review\b[^\n]*/i,
    [/##\s*Section\s+Evidence\b/i, /##\s*Reference\s+Library\b/i],
  );
  const sectionBody = extractSection(
    cleaned,
    /##\s*Section\s+Evidence\b[^\n]*/i,
    [/##\s*Reference\s+Library\b/i, /##\s*Presentation\s+Review\b/i],
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

  let format: PresentationReviewImportFormat = 'unstructured';
  let questions: ParsedPresentationReviewQuestion[] = [];

  if (hasPresentationHeading && hasStructuredQuestion) {
    format = 'structured';
    questions = parseStructuredQuestions(questionBody || cleaned);
  } else if (hasPresentationHeading) {
    format = 'structured';
    questions = parseStructuredQuestions(questionBody);
    if (!questions.length) {
      questions = fromLegacyScript(questionBody || cleaned);
      if (questions.length) {
        warnings.push('Questions were parsed from a simpler list. Prefer the ### 1. structured format.');
      }
    }
  } else {
    questions = fromLegacyScript(cleaned);
    format = questions.length ? 'legacy' : 'unstructured';
    if (format === 'legacy') {
      warnings.push(
        'Legacy Diagnosis Confirmation / Treatment Eligibility (or unstructured) script. References were not inferred. Paste structured ChatGPT output instead if you need evidence mappings.',
      );
    }
  }

  if (!questions.length) {
    blockingErrors.push(
      'Could not find Presentation Review questions. Use ## Presentation Review with ### 1. question blocks.',
    );
  }

  if (hasPresentationHeading === false && format === 'unstructured') {
    warnings.push('Paste structured ChatGPT output instead');
  }

  const sectionEvidenceIds = parseReferenceIds(sectionBody);
  if (hasSectionEvidence && !sectionEvidenceIds.length) {
    warnings.push('Section Evidence heading was present but no reference IDs were found');
  }

  const knownKeys = libraryKeySet;
  for (const q of questions) {
    const unknown = q.importedReferenceIds.filter((id) => !knownKeys.has(id));
    if (unknown.length) {
      const msg = `Undefined reference ID${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`;
      q.blockingErrors.push(msg);
      blockingErrors.push(`${q.importKey}: ${msg}`);
    }
  }
  for (const id of sectionEvidenceIds) {
    if (!knownKeys.has(id)) {
      blockingErrors.push(`Section Evidence references undefined ID ${id}`);
    }
  }

  for (const ref of references) {
    blockingErrors.push(...ref.blockingErrors.map((e) => `${ref.importKey}: ${e}`));
    if (!ref.url) warnings.push(`${ref.importKey}: URL not provided`);
    else if (!/^https?:\/\//i.test(ref.url)) warnings.push(`${ref.importKey}: URL format looks invalid`);
    if (ref.verificationRequired) warnings.push(`${ref.importKey}: Verification required`);
  }

  if (format !== 'structured' && (hasSectionEvidence || hasLibrary)) {
    warnings.push('Top-level evidence sections were present but question structure was incomplete');
  }

  const seen = new Set<string>();
  for (const q of questions) {
    const key = normalizeQuestionKey(q.questionText);
    if (seen.has(key)) {
      q.warnings.push('Duplicate imported question');
      warnings.push(`Possible overlap: ${q.questionText}`);
    }
    seen.add(key);
  }

  return {
    format,
    questions,
    sectionEvidenceIds,
    references,
    libraryKeys,
    legacyTwoSectionImport: detectLegacyTwoSectionImport(cleaned),
    blockingErrors: [...new Set(blockingErrors)],
    warnings: [...new Set(warnings)],
  };
}
