/**
 * Parse ChatGPT Treatment Options import (treatments + section evidence + library).
 * Spec: SafeScribe_Treatment_ChatGPT_Import_References_eGFR_Cursor_Spec.md
 */

import {
  parseRenalDosingRulesJson,
  validateRenalDosingRules,
  type RenalDosingRule,
} from '@safescript/shared';
import {
  isolateTreatmentsMarkdown,
  parseTreatmentsScript,
  type ParsedChatGptTreatment,
} from './chatgpt-import.parser';
import { parseReferenceIds } from './presentation-review-import.parser';
import {
  parseReferenceLibraryMarkdown,
  type ParsedReferenceImportItem,
} from './references-import.parser';

export type TreatmentsImportFormat = 'structured' | 'legacy' | 'unstructured';

export type RenalEgfrMappingStatus =
  | 'not_applicable'
  | 'source_egfr'
  | 'validated_mapping'
  | 'requires_review';

export type ParsedImportedTreatment = ParsedChatGptTreatment & {
  importKey: string;
  whyThisOption: string;
  importedReferenceIds: string[];
  documentationReferenceImportId: string | null;
  renalEgfrMappingStatus: RenalEgfrMappingStatus;
  renalMappingReviewRequired: boolean;
  importWarnings: string[];
  blockingErrors: string[];
};

export type ParsedTreatmentsImport = {
  format: TreatmentsImportFormat;
  items: ParsedImportedTreatment[];
  sectionEvidenceIds: string[];
  references: ParsedReferenceImportItem[];
  libraryKeys: string[];
  blockingErrors: string[];
  warnings: string[];
};

const NULLISH = /^(null|none|n\/a|na|nil|-|—)?$/i;
const CATEGORY_SET = new Set(['PRESCRIPTION', 'OTC', 'SUPPLEMENT', 'NON_DRUG']);
const RECOMMENDATION_SET = new Set([
  'FIRST_LINE',
  'SECOND_LINE',
  'ALTERNATIVE',
  'ADJUNCTIVE',
  'SUPPORTIVE_CARE',
  'SPECIALIST',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function field(block: string, name: string): string {
  const re = new RegExp(
    `^-?\\s*${escapeRegExp(name)}\\s*[:：]\\s*(.*)$`,
    'im',
  );
  const m = block.match(re);
  return unwrap(m?.[1]?.trim() ?? '');
}

function fieldAny(block: string, names: string[]): string {
  for (const name of names) {
    const value = field(block, name);
    if (value) return value;
  }
  return '';
}

function unwrap(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed === '[]' ||
    (trimmed.startsWith('[{') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('[') && trimmed.includes('{"') && trimmed.endsWith(']'))
  ) {
    return trimmed;
  }
  return trimmed.replace(/^\[(.*)\]$/, '$1').replace(/^"(.*)"$/, '$1').trim();
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

export function normalizeTreatmentImportKey(medicationName: string): string {
  return medicationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isRecognizedCategory(raw: string): boolean {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (CATEGORY_SET.has(compact)) return true;
  const lower = raw.toLowerCase();
  return /otc|over.?the.?counter|non.?prescription|supplement|vitamin|mineral|probiotic|omega|herbal|nutraceut|non.?drug|non.?pharm|lifestyle|self.?care|non.?med|behaviour|hygiene|watch.?wait|prescription|rx\b/.test(
    lower,
  );
}

function isRecognizedRecommendation(raw: string): boolean {
  const compact = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (RECOMMENDATION_SET.has(compact)) return true;
  const lower = raw.toLowerCase();
  return /first|1st|preferred|second|2nd|adjunct|support|specialist|refer|alt/.test(lower);
}

function extractThresholdNumbers(text: string): number[] {
  const out: number[] = [];
  const labeled = /(?:egfr|crcl)\s*(?:≥|<=|≤|>=|>|<|=)?\s*(\d+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = labeled.exec(text))) {
    out.push(Number(match[1]));
  }
  const range = /(\d+(?:\.\d+)?)\s*to\s*<?\s*(\d+(?:\.\d+)?)/gi;
  while ((match = range.exec(text))) {
    out.push(Number(match[1]), Number(match[2]));
  }
  return [...new Set(out.filter((n) => Number.isFinite(n)))];
}

function ruleThresholdNumbers(rules: RenalDosingRule[]): number[] {
  return [
    ...new Set(
      rules
        .flatMap((rule) => [rule.min, rule.max])
        .filter((n): n is number => n != null && Number.isFinite(n) && n !== 0),
    ),
  ];
}

function hasArtificialDecimalBound(rules: RenalDosingRule[]): boolean {
  return rules.some((rule) =>
    [rule.min, rule.max].some(
      (n) => n != null && !Number.isInteger(n) && /\.99$/.test(String(n)),
    ),
  );
}

function jsonHasStringNumbers(raw: string): boolean {
  return /"(min|max|doseAmount|duration|totalDoses)"\s*:\s*"/i.test(raw);
}

function deactivateRenalRules(
  item: ParsedImportedTreatment,
  warning: string,
  status: RenalEgfrMappingStatus = 'requires_review',
) {
  item.renalDosingBasis = 'NONE';
  item.renalDosingRules = [];
  item.renalEgfrMappingStatus = status;
  item.renalMappingReviewRequired = true;
  item.metadata = {
    ...item.metadata,
    renalEgfrMappingStatus: status,
    renalMappingReviewRequired: true,
  };
  if (!item.importWarnings.includes(warning)) item.importWarnings.push(warning);
}

function applyEgfrSafeguards(item: ParsedImportedTreatment, block: string) {
  const flag = (item.renalAdjustment ?? '').trim().toLowerCase();
  const source = (item.renalSourceBasis ?? '').trim();
  const jsonRaw = field(block, 'Renal dosing rules');
  const hasJsonPayload = Boolean(jsonRaw) && jsonRaw !== '[]' && !NULLISH.test(jsonRaw);
  const parseError = item.metadata.renalDosingRulesParseError;

  if (flag === 'no' || !flag) {
    item.renalEgfrMappingStatus = 'not_applicable';
    item.renalMappingReviewRequired = false;
    item.renalDosingBasis = item.renalDosingBasis || 'NONE';
    item.renalDosingRules = [];
    item.metadata = {
      ...item.metadata,
      renalEgfrMappingStatus: 'not_applicable',
      renalMappingReviewRequired: false,
    };
    return;
  }

  if (hasJsonPayload && (parseError || jsonHasStringNumbers(jsonRaw))) {
    item.blockingErrors.push(
      parseError || 'Renal dosing rules contain string numbers where numeric values are required',
    );
    deactivateRenalRules(item, 'Renal mapping review required');
    return;
  }

  if (hasJsonPayload) {
    const parsed = parseRenalDosingRulesJson(jsonRaw);
    if (!parsed.ok) {
      item.blockingErrors.push(parsed.error || 'Renal dosing rules must be valid JSON');
      deactivateRenalRules(item, 'Renal mapping review required');
      return;
    }
  }

  const rules = item.renalDosingRules ?? [];
  const basis = (item.renalDosingBasis ?? '').trim();

  if (!rules.length) {
    if (source === 'eGFR') {
      item.renalEgfrMappingStatus = 'source_egfr';
      item.renalMappingReviewRequired = false;
    } else if (source === 'NONE' || !source) {
      item.renalEgfrMappingStatus = 'not_applicable';
      item.renalMappingReviewRequired = false;
    } else {
      item.renalEgfrMappingStatus = 'requires_review';
      item.renalMappingReviewRequired = true;
      item.importWarnings.push('Renal mapping review required');
    }
    item.renalDosingBasis = 'NONE';
    item.metadata = {
      ...item.metadata,
      renalEgfrMappingStatus: item.renalEgfrMappingStatus,
      renalMappingReviewRequired: item.renalMappingReviewRequired,
    };
    return;
  }

  if (basis && basis !== 'eGFR' && basis !== 'NONE') {
    item.importWarnings.push(
      `Renal dosing basis “${basis}” is not valid for structured rules. Use eGFR or NONE.`,
    );
    deactivateRenalRules(item, 'Renal mapping review required');
    return;
  }

  if (basis !== 'eGFR') {
    deactivateRenalRules(
      item,
      'Structured renal rules require Renal dosing basis: eGFR. Rules were not activated.',
    );
    return;
  }

  if (!source || source === 'NONE') {
    deactivateRenalRules(item, 'Renal mapping review required');
    return;
  }

  if (source === 'CrCl' || source === 'OTHER') {
    deactivateRenalRules(
      item,
      source === 'CrCl'
        ? 'Renal mapping verification required — CrCl thresholds were not activated as eGFR rules'
        : 'Renal mapping review required',
    );
    return;
  }

  if (hasArtificialDecimalBound(rules)) {
    deactivateRenalRules(
      item,
      'Artificial decimal renal boundaries (for example 49.99) — review required',
    );
    return;
  }

  const issues = validateRenalDosingRules(rules);
  if (issues.length) {
    deactivateRenalRules(item, `Renal rule mismatch — review required (${issues[0]!.message})`);
    return;
  }

  const reasonThresholds = extractThresholdNumbers(item.renalAdjustmentReason ?? '');
  const ruleThresholds = ruleThresholdNumbers(rules);
  if (reasonThresholds.length && ruleThresholds.length) {
    const missing = reasonThresholds.filter((n) => !ruleThresholds.includes(n));
    const extra = ruleThresholds.filter((n) => !reasonThresholds.includes(n));
    if (missing.length || extra.length) {
      deactivateRenalRules(item, 'Renal rule mismatch — review required');
      return;
    }
  }

  item.renalEgfrMappingStatus = source === 'eGFR' ? 'source_egfr' : 'requires_review';
  item.renalMappingReviewRequired = item.renalEgfrMappingStatus === 'requires_review';
  item.renalDosingBasis = 'eGFR';
  item.metadata = {
    ...item.metadata,
    renalEgfrMappingStatus: item.renalEgfrMappingStatus,
    renalMappingReviewRequired: item.renalMappingReviewRequired,
  };
}

function splitTreatmentBlocks(body: string): string[] {
  return body
    .split(/^##\s*Treatment\b/im)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^section\s+evidence\b/i.test(part) && !/^reference\s+library\b/i.test(part));
}

export function parseTreatmentsImport(text: string): ParsedTreatmentsImport {
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

  const hasTreatmentHeading = /##\s*Treatment\b/i.test(cleaned);
  const hasSectionEvidence = /##\s*Section\s+Evidence\b/i.test(cleaned);
  const hasLibrary = /##\s*Reference\s+Library\b/i.test(cleaned);
  const treatmentBody = isolateTreatmentsMarkdown(cleaned);
  const sectionBody = extractSection(
    cleaned,
    /##\s*Section\s+Evidence\b[^\n]*/i,
    [/##\s*Reference\s+Library\b/i, /##\s*Treatment\b/i],
  );

  let references: ParsedReferenceImportItem[] = [];
  if (hasLibrary) {
    const libraryParsed = parseReferenceLibraryMarkdown(cleaned, 'presentation_review');
    references = libraryParsed.items.map((item) => ({
      ...item,
      suggestedSections: item.suggestedSections.length
        ? item.suggestedSections
        : (['treatment_options'] as ParsedReferenceImportItem['suggestedSections']),
    }));
    if (libraryParsed.error && !libraryParsed.items.length) {
      blockingErrors.push(libraryParsed.error);
    }
  }

  const libraryKeys = references.map((r) => r.importKey.toUpperCase());
  const libraryKeySet = new Set(libraryKeys);

  let format: TreatmentsImportFormat = 'unstructured';
  const items: ParsedImportedTreatment[] = [];

  if (hasTreatmentHeading) {
    format = hasLibrary || hasSectionEvidence ? 'structured' : 'legacy';
    const blocks = splitTreatmentBlocks(treatmentBody);
    let index = 0;
    for (const block of blocks) {
      index += 1;
      const importKey = `TX${index}`;
      const medicationName =
        fieldAny(block, ['Medication', 'Name', 'Drug', 'Treatment name']) || '';
      const itemWarnings: string[] = [];
      const itemBlocking: string[] = [];

      if (!medicationName || medicationName.length < 2) {
        itemBlocking.push('Medication is missing');
        blockingErrors.push(`${importKey}: Medication is missing`);
        continue;
      }

      const categoryRaw = fieldAny(block, ['Category', 'Type']);
      if (categoryRaw && !isRecognizedCategory(categoryRaw)) {
        itemBlocking.push(`Category “${categoryRaw}” is invalid`);
      }
      const recommendationRaw = fieldAny(block, [
        'Recommendation',
        'Line',
        'Recommendation level',
      ]);
      if (recommendationRaw && !isRecognizedRecommendation(recommendationRaw)) {
        itemBlocking.push(`Recommendation “${recommendationRaw}” is invalid`);
      }

      const parsedList = parseTreatmentsScript(`## Treatment\n${block}`);
      const parsed = parsedList[0];
      if (!parsed) {
        itemBlocking.push('Could not parse this treatment block');
        blockingErrors.push(`${importKey}: Could not parse this treatment block`);
        continue;
      }

      const whyThisOption =
        fieldAny(block, ['Why this option?', 'Why this option', 'Clinical rationale']) ||
        parsed.clinicalNotes ||
        '';
      parsed.clinicalNotes = whyThisOption || parsed.clinicalNotes;

      const importedReferenceIds = parseReferenceIds(
        fieldAny(block, ['References', 'Reference IDs']) || '',
      );
      const documentationRaw = field(block, 'Documentation reference');
      const documentationIds = parseReferenceIds(documentationRaw);
      let documentationReferenceImportId: string | null = null;
      if (documentationRaw && !NULLISH.test(documentationRaw) && documentationIds.length === 0) {
        itemBlocking.push('Documentation reference ID is undefined');
      } else if (documentationIds.length > 1) {
        itemBlocking.push('Documentation reference must contain at most one reference ID');
      } else if (documentationIds.length === 1) {
        documentationReferenceImportId = documentationIds[0]!;
      } else {
        itemWarnings.push('Documentation reference blank');
      }

      if (!importedReferenceIds.length) {
        itemWarnings.push('Treatment has no reference');
      }
      if (!whyThisOption || NULLISH.test(whyThisOption)) {
        itemWarnings.push('Why this option? is missing');
      }

      const item: ParsedImportedTreatment = {
        ...parsed,
        importKey,
        whyThisOption: !whyThisOption || NULLISH.test(whyThisOption) ? '' : whyThisOption,
        importedReferenceIds,
        documentationReferenceImportId,
        renalEgfrMappingStatus: 'not_applicable',
        renalMappingReviewRequired: false,
        importWarnings: itemWarnings,
        blockingErrors: itemBlocking,
        metadata: {
          ...parsed.metadata,
          renalEgfrMappingStatus: 'not_applicable',
          renalMappingReviewRequired: false,
        },
      };

      applyEgfrSafeguards(item, block);
      items.push(item);
    }

    if (format === 'legacy') {
      warnings.push(
        'Legacy treatment script. Prefer the structured format with Section Evidence and a Reference Library.',
      );
    }
  }

  if (!items.length && !blockingErrors.length) {
    blockingErrors.push(
      'Could not find treatments. Use ## Treatment blocks, Section Evidence, and a Reference Library.',
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
    if (
      item.documentationReferenceImportId &&
      !libraryKeySet.has(item.documentationReferenceImportId)
    ) {
      const msg = `Undefined Documentation reference ID: ${item.documentationReferenceImportId}`;
      item.blockingErrors.push(msg);
      blockingErrors.push(`${item.importKey}: ${msg}`);
    }
    blockingErrors.push(
      ...item.blockingErrors.filter(
        (e) => !blockingErrors.includes(e) && !e.startsWith('Undefined') && !e.includes(item.importKey),
      ),
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
    const key = normalizeTreatmentImportKey(item.medicationName);
    if (seen.has(key)) {
      item.importWarnings.push('Possible duplicate treatment');
      warnings.push(`Possible duplicate treatment: ${item.medicationName}`);
    }
    seen.add(key);
  }

  for (const item of items) {
    warnings.push(...item.importWarnings);
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
