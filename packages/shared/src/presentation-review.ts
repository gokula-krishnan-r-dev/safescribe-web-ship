/**
 * Presentation Review — shared admin + pharmacist contract.
 * Reference metadata lives in the pathway References & Governance library.
 * Presentation Review only stores linked IDs.
 */

export const PRESENTATION_REVIEW_TITLE = 'Presentation Review';

export const PRESENTATION_REVIEW_SUBTITLE =
  'Structured questions used to review whether the patient presentation is consistent with this pathway.';

export type PresentationReviewAnswerType = 'yes_no';

export type PresentationReviewApprovalStatus = 'approved' | 'needs_review';

export type QuestionVisibilityRule = {
  sourceField: string;
  operator: string;
  value: unknown;
  /** Human-readable condition shown in admin and pharmacist UI. */
  label?: string;
};

export type PathwayEvidenceLibraryReference = {
  id: string;
  citationTitle: string;
  organization?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  url?: string | null;
  doi?: string | null;
  documentType?: string | null;
  jurisdiction?: string | null;
  referenceType: string;
  status?: string;
  verifiedBy?: string | null;
  verificationDate?: string | null;
  importSource?: string | null;
  clinicalUseTags?: string[];
  documentationCandidate?: boolean;
  verificationRequired?: boolean;
  notes?: string | null;
  suggestedSections?: string[];
};

export type PresentationReviewSectionState = {
  sectionEvidenceRefIds: string[];
  duplicateReviewNeeded?: boolean;
};

export type PresentationReviewGovernanceStatus = 'completed' | 'pending' | 'not_started';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function uniqueIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = asString(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function parseVisibilityRule(value: unknown): QuestionVisibilityRule | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const sourceField = asString(item.sourceField);
  const operator = asString(item.operator) ?? 'eq';
  const label = asString(item.label);
  if (!sourceField && !label) return null;
  return {
    sourceField: sourceField ?? '',
    operator,
    value: item.value,
    label: label ?? undefined,
  };
}

export function parsePresentationReviewState(value: unknown): PresentationReviewSectionState {
  if (!value || typeof value !== 'object') {
    return { sectionEvidenceRefIds: [] };
  }
  const item = value as Record<string, unknown>;
  return {
    sectionEvidenceRefIds: uniqueIdList(item.sectionEvidenceRefIds),
    duplicateReviewNeeded: item.duplicateReviewNeeded === true ? true : undefined,
  };
}

export function evidenceCountLabel(count: number): string {
  if (count <= 0) return 'Evidence not linked';
  return `Evidence: ${count} linked`;
}

export function approvalStatusLabel(
  status: string | null | undefined,
  approved?: boolean,
): PresentationReviewApprovalStatus {
  if (approved === true || status === 'APPROVED') return 'approved';
  return 'needs_review';
}

export function formatVisibilityLabel(rule: QuestionVisibilityRule | null | undefined): string | null {
  if (!rule) return null;
  if (rule.label?.trim()) return rule.label.trim();
  if (!rule.sourceField) return null;
  const value =
    typeof rule.value === 'string' || typeof rule.value === 'number' || typeof rule.value === 'boolean'
      ? String(rule.value)
      : '';
  if (!value) return `Shown only if ${rule.sourceField} is set.`;
  return `Shown only if ${rule.sourceField} ${rule.operator === 'eq' ? 'is' : rule.operator} ${value}.`;
}

export function detectLegacyTwoSectionImport(text: string): boolean {
  const hasDiagnosis = /diagnosis\s*confirmation/i.test(text);
  const hasEligibility = /treatment\s*eligibility/i.test(text);
  return hasDiagnosis && hasEligibility;
}

export function isPresentationReviewHeading(raw: string): boolean {
  const compact = raw.toLowerCase().replace(/[^a-z]/g, '');
  return compact === 'presentationreview' || compact === 'clinicalpresentationreview';
}

export function citationDisplay(ref: Pick<PathwayEvidenceLibraryReference, 'citationTitle' | 'organization'>): string {
  const title = ref.citationTitle.trim();
  const org = ref.organization?.trim();
  if (org && !title.toLowerCase().startsWith(org.toLowerCase())) {
    return `${org} — ${title}`;
  }
  return title;
}

export function editionLabel(ref: Pick<PathwayEvidenceLibraryReference, 'edition' | 'publicationYear'>): string {
  if (ref.edition?.trim()) return ref.edition.trim();
  if (typeof ref.publicationYear === 'number') return String(ref.publicationYear);
  return 'Current edition';
}
