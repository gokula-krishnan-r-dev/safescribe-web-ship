/**
 * Parse ChatGPT "## Reference Library" markdown for References & Governance import.
 * Spec: SafeScribe_Reference_Library_Modified_UI_Backend_Cursor_Instructions.md
 * Prompt: refrence prompt.txt
 */

import {
  DOCUMENT_TYPE_LABELS,
  isEvidenceReferenceStatus,
  normalizeEvidenceJurisdiction,
  normalizeReferenceMatchKey,
  normalizeSectionName,
  parseClinicalUseTags,
  parseSuggestedSections,
  type ClinicalUseTagCode,
  type EvidenceDocumentType,
  type EvidenceImportSection,
  type EvidenceJurisdiction,
} from '@safescript/shared';

export type ParsedReferenceImportItem = {
  importKey: string;
  citationTitle: string;
  organization: string;
  documentType: EvidenceDocumentType | 'unknown';
  documentTypeRaw: string;
  edition: string | null;
  publicationYear: number | null;
  yearEdition: string | null;
  jurisdiction: EvidenceJurisdiction | string | null;
  url: string | null;
  doi: string | null;
  applicablePathways: string[];
  suggestedSections: EvidenceImportSection[];
  clinicalUseTags: ClinicalUseTagCode[];
  documentationReferenceCandidate: boolean;
  verificationRequired: boolean;
  notes: string | null;
  unknownSections: string[];
  unknownClinicalUseTags: string[];
  warnings: string[];
  blockingErrors: string[];
};

export type ReferenceImportParseResult = {
  ok: boolean;
  error?: string;
  items: ParsedReferenceImportItem[];
  reviewerGovernanceIgnored: boolean;
  summary: {
    found: number;
    blocking: number;
    verificationRequired: number;
    documentationCandidates: number;
    sectionCounts: Record<string, number>;
  };
};

const DOCUMENT_TYPE_MAP: Record<string, EvidenceDocumentType> = {
  clinicalreference: 'clinical_reference',
  guideline: 'guideline',
  productmonograph: 'product_monograph',
  regulatoryguidance: 'regulatory_guidance',
  specialtyguideline: 'specialty_guideline',
  publichealthguidance: 'public_health_guidance',
  publichealth: 'public_health_guidance',
  systematicreview: 'systematic_review',
  other: 'other',
};

/** Extract a single-line field; blank values do not swallow the next line. */
function field(block: string, name: string): string {
  const re = new RegExp(
    `^-?[ \\t]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*[:：][ \\t]*(.*)$`,
    'im',
  );
  const m = block.match(re);
  return m?.[1]?.trim() ?? '';
}

function parseYearEdition(raw: string): {
  edition: string | null;
  publicationYear: number | null;
  yearEdition: string | null;
} {
  const text = raw.trim();
  if (!text) return { edition: null, publicationYear: null, yearEdition: null };
  const yearOnly = text.match(/^(19|20)\d{2}$/);
  if (yearOnly) {
    return { edition: text, publicationYear: Number(text), yearEdition: text };
  }
  const embedded = text.match(/\b((19|20)\d{2})\b/);
  return {
    edition: text,
    publicationYear: embedded ? Number(embedded[1]) : null,
    yearEdition: text,
  };
}

function parseBoolStrict(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'true' || v === 'yes' || v === 'y' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === 'n' || v === '0') return false;
  return null;
}

function parseYesNo(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'yes' || v === 'y' || v === 'true' || v === '1';
}

function normalizeDocumentType(
  raw: string,
): { type: EvidenceDocumentType | 'unknown'; warning?: string } {
  const compact = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!compact) {
    return { type: 'unknown', warning: 'Document type missing' };
  }
  const mapped = DOCUMENT_TYPE_MAP[compact];
  if (mapped) return { type: mapped };
  return {
    type: 'unknown',
    warning: `Unknown document type “${raw.trim()}” — requires admin correction`,
  };
}

function extractImportKey(headingLine: string, index: number): string {
  const m = headingLine.match(/^(R\d+)\b/i) || headingLine.match(/^Reference\s+(\d+)\b/i);
  if (m) {
    const num = m[1]!.replace(/^reference\s+/i, '');
    return /^R/i.test(num) ? num.toUpperCase() : `R${num}`;
  }
  return `R${index + 1}`;
}

function detectReviewerGovernanceLeak(text: string): boolean {
  return (
    /\breviewed\s+by\b/i.test(text) ||
    /\bpeer\s+reviewed\s+by\b/i.test(text) ||
    /\bapproved\s+by\s+(committee|dr\.|doctor|reviewer)\b/i.test(text) ||
    /\binternal\s+reviewer\b/i.test(text) ||
    /\bexternal\s+peer\s+reviewer\b/i.test(text)
  );
}

function parseApplicablePathways(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sanitizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  // Reject placeholder / invented-looking URLs
  if (/^(https?:\/\/)?(example\.com|localhost|n\/?a|tbd|todo)\b/i.test(text)) {
    return null;
  }
  return text;
}

function sanitizeDoi(raw: string): string | null {
  const text = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (!text) return null;
  if (/^(n\/?a|tbd|todo)$/i.test(text)) return null;
  return text;
}

function sanitizeNotes(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  return text.slice(0, 500);
}

export type ReferenceLibraryParseMode = 'strict' | 'presentation_review';

/** Extract ### R1 blocks under ## Reference Library. */
export function parseReferenceLibraryMarkdown(
  text: string,
  mode: ReferenceLibraryParseMode = 'strict',
): ReferenceImportParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return emptyParse('Unable to parse reference library. Please use the required ChatGPT output format.');
  }

  const hasLibraryHeading = /##\s*Reference\s+Library\b/i.test(trimmed);
  if (!hasLibraryHeading) {
    return emptyParse(
      'Unable to parse reference library. Please use the required ChatGPT output format.',
    );
  }

  const libraryMatch = trimmed.match(/##\s*Reference\s+Library\b[\s\S]*/i);
  const body = libraryMatch?.[0] ?? trimmed;
  const reviewerGovernanceIgnored = detectReviewerGovernanceLeak(body);

  const parts = body.split(/^###\s+/m).map((b) => b.trim()).filter(Boolean);
  const blocks = parts.filter(
    (b, i) => i > 0 || /^R\d+/i.test(b) || /^Reference\s+\d+/i.test(b) || field(b, 'Title'),
  );

  const referenceBlocks = blocks.filter(
    (b) => /^R\d+/i.test(b) || /^Reference\s+\d+/i.test(b) || Boolean(field(b, 'Title')),
  );

  if (!referenceBlocks.length) {
    return emptyParse(
      'Unable to parse reference library. Please use the required ChatGPT output format.',
    );
  }

  const items: ParsedReferenceImportItem[] = [];
  const seenKeys = new Set<string>();

  for (const [index, block] of referenceBlocks.entries()) {
    const headingLine = block.split('\n')[0] ?? '';
    const importKey = extractImportKey(headingLine, index);
    const title = field(block, 'Title');
    const org =
      field(block, 'Organization / publisher') ||
      field(block, 'Organization') ||
      field(block, 'Publisher');
    const yearRaw =
      field(block, 'Year / edition') || field(block, 'Year') || field(block, 'Edition');
    const { edition, publicationYear, yearEdition } = parseYearEdition(yearRaw);
    const sectionsRaw =
      field(block, 'Suggested pathway sections') ||
      field(block, 'Supports pathway section(s)') ||
      field(block, 'Suggested sections') ||
      field(block, 'Sections');
    const suggestedSections = parseSuggestedSections(sectionsRaw);
    const unknownSections = sectionsRaw
      ? sectionsRaw
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !normalizeSectionName(s))
      : [];

    const tagsRaw =
      field(block, 'Clinical use tags') ||
      field(block, 'Clinical-use tags') ||
      field(block, 'Content tags');
    const { tags: clinicalUseTags, unknown: unknownClinicalUseTags } =
      parseClinicalUseTags(tagsRaw);

    const pathwaysRaw =
      field(block, 'Applicable condition(s) / pathway(s)') ||
      field(block, 'Applicable condition(s)/pathway(s)') ||
      field(block, 'Applicable pathways') ||
      field(block, 'Applicable conditions');
    const applicablePathways = parseApplicablePathways(pathwaysRaw);

    const verificationRaw =
      field(block, 'Verification required') || field(block, 'Needs verification');
    const verificationParsed = parseBoolStrict(verificationRaw);
    const docCandidateRaw =
      field(block, 'Documentation reference candidate') ||
      field(block, 'Documentation candidate');
    const documentTypeRaw =
      field(block, 'Guideline / document type') || field(block, 'Document type');
    const docType = normalizeDocumentType(documentTypeRaw);
    const jurisdictionRaw = field(block, 'Jurisdiction');
    const jurisdictionNorm = normalizeEvidenceJurisdiction(jurisdictionRaw);
    const notes = sanitizeNotes(field(block, 'Notes') || field(block, 'Note'));
    const statusRaw = field(block, 'Status');
    const lenient = mode === 'presentation_review';

    const warnings: string[] = [];
    const blockingErrors: string[] = [];

    if (!title.trim()) blockingErrors.push('Title is required');
    if (!org.trim()) {
      if (lenient) warnings.push('Organization / publisher missing');
      else blockingErrors.push('Organization / publisher is required');
    }
    if (!documentTypeRaw.trim()) {
      if (lenient) warnings.push('Document type missing');
      else blockingErrors.push('Document type is required');
    }
    if (docType.type === 'unknown' && documentTypeRaw.trim()) {
      warnings.push(docType.warning ?? 'Unknown document type');
      if (!lenient) blockingErrors.push('Document type must be an allowed value');
    }
    if (!sectionsRaw.trim()) {
      if (!lenient) blockingErrors.push('Suggested pathway sections are required');
    } else if (!suggestedSections.length) {
      if (!lenient) blockingErrors.push('At least one allowed pathway section is required');
    }
    if (jurisdictionRaw.trim() && !jurisdictionNorm.value) {
      warnings.push(jurisdictionNorm.warning ?? 'Unknown jurisdiction');
      if (!lenient) blockingErrors.push('Jurisdiction must be an allowed value');
    }
    if (!jurisdictionRaw.trim() && !lenient) {
      blockingErrors.push('Jurisdiction is required');
    }
    if (verificationRaw.trim() && verificationParsed === null) {
      if (lenient) warnings.push('Verification required must be true or false');
      else blockingErrors.push('Verification required must be true or false');
    }
    if (!verificationRaw.trim()) {
      if (lenient) warnings.push('Verification required missing — treating as required');
      else blockingErrors.push('Verification required is required');
    }
    if (seenKeys.has(importKey.toUpperCase())) {
      blockingErrors.push(`Duplicate import ID ${importKey}`);
    }
    seenKeys.add(importKey.toUpperCase());

    for (const u of unknownSections) {
      warnings.push(`Unknown section mapping: ${u}`);
    }
    for (const u of unknownClinicalUseTags) {
      warnings.push(`Unknown clinical-use tag ignored: ${u}`);
    }
    if (!yearEdition) warnings.push('Year / edition missing');
    if (!field(block, 'URL')) warnings.push('URL missing');
    if (!field(block, 'DOI')) warnings.push('DOI missing');
    if (!applicablePathways.length) warnings.push('Applicable condition(s) / pathway(s) missing');
    if (!clinicalUseTags.length && tagsRaw.trim()) {
      warnings.push('No recognized clinical-use tags');
    }
    if (verificationParsed === true) warnings.push('Verification required: true');
    if (parseYesNo(docCandidateRaw)) {
      warnings.push('Documentation reference candidate — admin must choose primary after verification');
    }
    if (statusRaw && !/^needs\s*review$/i.test(statusRaw.trim())) {
      warnings.push('Import status forced to Needs review (governance statuses are admin-only)');
    }

    const verificationRequired = verificationParsed === null ? true : verificationParsed;
    const resolvedSections =
      suggestedSections.length > 0
        ? suggestedSections
        : lenient
          ? (['presentation_review'] as EvidenceImportSection[])
          : [];

    items.push({
      importKey: importKey.toUpperCase(),
      citationTitle: title.trim(),
      organization: org.trim() || (lenient ? '' : 'Unknown organization'),
      documentType: docType.type === 'unknown' ? (lenient ? 'clinical_reference' : 'other') : docType.type,
      documentTypeRaw: documentTypeRaw.trim(),
      edition,
      publicationYear,
      yearEdition,
      jurisdiction: jurisdictionNorm.value ?? (jurisdictionRaw.trim() || null),
      url: sanitizeUrl(field(block, 'URL')),
      doi: sanitizeDoi(field(block, 'DOI')),
      applicablePathways,
      suggestedSections: resolvedSections,
      clinicalUseTags,
      documentationReferenceCandidate: parseYesNo(docCandidateRaw),
      verificationRequired,
      notes,
      unknownSections,
      unknownClinicalUseTags,
      warnings,
      blockingErrors,
    });
  }

  const sectionCounts: Record<string, number> = {};
  for (const item of items) {
    for (const section of item.suggestedSections) {
      sectionCounts[section] = (sectionCounts[section] ?? 0) + 1;
    }
  }

  const blocking = items.filter((i) => i.blockingErrors.length > 0).length;
  return {
    ok: items.length > 0 && blocking === 0,
    items,
    reviewerGovernanceIgnored,
    summary: {
      found: items.length,
      blocking,
      verificationRequired: items.filter((i) => i.verificationRequired).length,
      documentationCandidates: items.filter((i) => i.documentationReferenceCandidate).length,
      sectionCounts,
    },
  };
}

function emptyParse(error: string): ReferenceImportParseResult {
  return {
    ok: false,
    error,
    items: [],
    reviewerGovernanceIgnored: false,
    summary: {
      found: 0,
      blocking: 0,
      verificationRequired: 0,
      documentationCandidates: 0,
      sectionCounts: {},
    },
  };
}

export type MatchConfidence = 'exact' | 'possible' | 'none';

export function findMatchingReference(
  candidate: ParsedReferenceImportItem,
  existing: Array<{
    id: string;
    citationTitle: string;
    organization: string | null;
    edition: string | null;
    publicationYear: number | null;
    url: string | null;
    doi: string | null;
    status?: string | null;
  }>,
): { id: string; confidence: MatchConfidence; status?: string | null } | null {
  const key = normalizeReferenceMatchKey(candidate);
  for (const row of existing) {
    const other = normalizeReferenceMatchKey(row);
    if (key.doi && other.doi && key.doi === other.doi) {
      return { id: row.id, confidence: 'exact', status: row.status };
    }
  }
  for (const row of existing) {
    const other = normalizeReferenceMatchKey(row);
    if (key.url && other.url && key.url === other.url) {
      return { id: row.id, confidence: 'exact', status: row.status };
    }
  }
  for (const row of existing) {
    const other = normalizeReferenceMatchKey(row);
    if (key.titleOrg && other.titleOrg && key.titleOrg === other.titleOrg) {
      return { id: row.id, confidence: 'exact', status: row.status };
    }
  }
  for (const row of existing) {
    const other = normalizeReferenceMatchKey(row);
    if (key.titleYear && other.titleYear && key.titleYear === other.titleYear) {
      return { id: row.id, confidence: 'possible', status: row.status };
    }
  }
  return null;
}

/** @deprecated Use findMatchingReference */
export function findMatchingReferenceId(
  candidate: ParsedReferenceImportItem,
  existing: Array<{
    id: string;
    citationTitle: string;
    organization: string | null;
    edition: string | null;
    publicationYear: number | null;
    url: string | null;
    doi: string | null;
  }>,
): string | null {
  return findMatchingReference(candidate, existing)?.id ?? null;
}

export function importStatusForItem(
  item: Pick<ParsedReferenceImportItem, 'verificationRequired'>,
): 'needs_review' | 'verification_required' {
  return item.verificationRequired ? 'verification_required' : 'needs_review';
}

export function isValidImportStatus(status: string): boolean {
  return isEvidenceReferenceStatus(status);
}

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as EvidenceDocumentType] ?? type;
}
