/**
 * References & Governance — shared admin + pharmacist contract.
 * Central library owns citation metadata; content modules store IDs / mappings only.
 */

import type { PathwayEvidenceLibraryReference } from './presentation-review';
import { citationDisplay, uniqueIdList } from './presentation-review';

export const EVIDENCE_DOCUMENT_TYPES = [
  'clinical_reference',
  'guideline',
  'product_monograph',
  'regulatory_guidance',
  'specialty_guideline',
  'public_health_guidance',
  'systematic_review',
  'other',
] as const;

export type EvidenceDocumentType = (typeof EVIDENCE_DOCUMENT_TYPES)[number];

export const EVIDENCE_REFERENCE_STATUSES = [
  'verified',
  'needs_review',
  'verification_required',
  'archived',
] as const;

export type EvidenceReferenceStatus = (typeof EVIDENCE_REFERENCE_STATUSES)[number];

export const EVIDENCE_IMPORT_SOURCES = ['manual', 'chatgpt', 'excel', 'migration', 'library'] as const;
export type EvidenceImportSource = (typeof EVIDENCE_IMPORT_SOURCES)[number];

export const EVIDENCE_SECTIONS = [
  'presentation_review',
  'differential_review',
  'red_flags',
  'treatment_options',
  'patient_guidance',
] as const;

export type EvidenceSection = (typeof EVIDENCE_SECTIONS)[number];

/** ChatGPT may suggest Section-wide in addition to clinical sections. */
export const EVIDENCE_IMPORT_SECTIONS = [...EVIDENCE_SECTIONS, 'section_wide'] as const;
export type EvidenceImportSection = (typeof EVIDENCE_IMPORT_SECTIONS)[number];

export const EVIDENCE_MAPPING_TYPES = [
  'section',
  'question',
  'differential',
  'red_flag',
  'treatment',
  'guidance',
] as const;

export type EvidenceMappingType = (typeof EVIDENCE_MAPPING_TYPES)[number];

export const REVIEWED_AREAS = [
  'presentation_review',
  'differential_review',
  'red_flags',
  'treatment_options',
  'patient_guidance',
  'references',
] as const;

export type ReviewedArea = (typeof REVIEWED_AREAS)[number];

export const GOVERNANCE_REVIEW_STATUSES = ['not_started', 'pending', 'completed'] as const;
export type GovernanceReviewStatus = (typeof GOVERNANCE_REVIEW_STATUSES)[number];

export const REVIEWER_TYPES = ['internal', 'external'] as const;
export type PathwayReviewerType = (typeof REVIEWER_TYPES)[number];

export type PathwayEvidenceReferenceRecord = PathwayEvidenceLibraryReference & {
  doi?: string | null;
  verifiedBy?: string | null;
  verificationDate?: string | null;
  importSource?: EvidenceImportSource | string | null;
  libraryItemId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PathwayEvidenceMappingRecord = {
  id: string;
  pathwayId: string;
  referenceId: string;
  section: EvidenceSection | string;
  mappingType: EvidenceMappingType | string;
  targetId?: string | null;
  suggested?: boolean;
  createdById?: string | null;
  createdAt?: string;
};

export type PathwayReviewerRecord = {
  id: string;
  pathwayId: string;
  libraryReviewerId?: string | null;
  reviewerType: PathwayReviewerType | string;
  name: string;
  credentials: string;
  organization?: string | null;
  role: string;
  reviewedAreas: Array<ReviewedArea | string>;
  reviewDate: string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PathwayGovernanceState = {
  internalReviewStatus: GovernanceReviewStatus;
  externalPeerReviewStatus: GovernanceReviewStatus;
  lastReviewedAt?: string | null;
  nextReviewDueAt?: string | null;
  primaryDocumentationReferenceId?: string | null;
  secondaryDocumentationReferenceId?: string | null;
};

export const SECTION_LABELS: Record<EvidenceSection | 'section_wide', string> = {
  presentation_review: 'Presentation',
  differential_review: 'Differential',
  red_flags: 'Red Flags',
  treatment_options: 'Treatment',
  patient_guidance: 'Patient Guidance',
  section_wide: 'Section-wide',
};

export const SECTION_FULL_LABELS: Record<EvidenceSection | 'section_wide', string> = {
  presentation_review: 'Presentation Review',
  differential_review: 'Differential Review',
  red_flags: 'Red Flags',
  treatment_options: 'Treatment Options',
  patient_guidance: 'Patient Guidance',
  section_wide: 'Section-wide',
};

export const DOCUMENT_TYPE_LABELS: Record<EvidenceDocumentType, string> = {
  clinical_reference: 'Clinical reference',
  guideline: 'Guideline',
  product_monograph: 'Product monograph',
  regulatory_guidance: 'Regulatory guidance',
  specialty_guideline: 'Specialty guideline',
  public_health_guidance: 'Public-health guidance',
  systematic_review: 'Systematic review',
  other: 'Other',
};

export const REFERENCE_STATUS_LABELS: Record<EvidenceReferenceStatus, string> = {
  verified: 'Verified',
  needs_review: 'Needs review',
  verification_required: 'Verification required',
  archived: 'Archived',
};

export const GOVERNANCE_STATUS_LABELS: Record<GovernanceReviewStatus, string> = {
  not_started: 'Not started',
  pending: 'Pending',
  completed: 'Completed',
};

export const REVIEWED_AREA_LABELS: Record<ReviewedArea, string> = {
  presentation_review: 'Presentation Review',
  differential_review: 'Differential Review',
  red_flags: 'Red Flags',
  treatment_options: 'Treatment Options',
  patient_guidance: 'Patient Guidance',
  references: 'References',
};

const MATERIAL_REFERENCE_FIELDS = [
  'citationTitle',
  'organization',
  'edition',
  'publicationYear',
  'url',
  'doi',
  'documentType',
  'jurisdiction',
] as const;

export function isEvidenceSection(value: unknown): value is EvidenceSection {
  return typeof value === 'string' && (EVIDENCE_SECTIONS as readonly string[]).includes(value);
}

export function isEvidenceReferenceStatus(value: unknown): value is EvidenceReferenceStatus {
  return (
    typeof value === 'string' &&
    (EVIDENCE_REFERENCE_STATUSES as readonly string[]).includes(value)
  );
}

export function parsePathwayGovernance(
  value: unknown,
  primaryDocumentationReferenceId?: string | null,
  secondaryDocumentationReferenceId?: string | null,
): PathwayGovernanceState {
  const base: PathwayGovernanceState = {
    internalReviewStatus: 'not_started',
    externalPeerReviewStatus: 'not_started',
    lastReviewedAt: null,
    nextReviewDueAt: null,
    primaryDocumentationReferenceId: primaryDocumentationReferenceId ?? null,
    secondaryDocumentationReferenceId: secondaryDocumentationReferenceId ?? null,
  };
  if (!value || typeof value !== 'object') return base;
  const item = value as Record<string, unknown>;
  const internal = asGovernanceStatus(item.internalReviewStatus);
  const external = asGovernanceStatus(item.externalPeerReviewStatus);
  return {
    internalReviewStatus: internal ?? base.internalReviewStatus,
    externalPeerReviewStatus: external ?? base.externalPeerReviewStatus,
    lastReviewedAt: asIsoDate(item.lastReviewedAt),
    nextReviewDueAt: asIsoDate(item.nextReviewDueAt),
    primaryDocumentationReferenceId:
      asString(item.primaryDocumentationReferenceId) ??
      primaryDocumentationReferenceId ??
      null,
    secondaryDocumentationReferenceId:
      asString(item.secondaryDocumentationReferenceId) ??
      secondaryDocumentationReferenceId ??
      null,
  };
}

function asGovernanceStatus(value: unknown): GovernanceReviewStatus | null {
  if (
    typeof value === 'string' &&
    (GOVERNANCE_REVIEW_STATUSES as readonly string[]).includes(value)
  ) {
    return value as GovernanceReviewStatus;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asIsoDate(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

/** Resolve documentation citation: treatment override → pathway primary → pathway secondary. */
export function resolveDocumentationReferenceId(
  treatmentDocumentationReferenceId: string | null | undefined,
  pathwayPrimaryDocumentationReferenceId: string | null | undefined,
  pathwaySecondaryDocumentationReferenceId?: string | null,
): string | null {
  return (
    asString(treatmentDocumentationReferenceId) ??
    asString(pathwayPrimaryDocumentationReferenceId) ??
    asString(pathwaySecondaryDocumentationReferenceId) ??
    null
  );
}

export function resolveDocumentationCitationLine(
  refs: Array<Pick<PathwayEvidenceLibraryReference, 'id' | 'citationTitle' | 'organization'>>,
  treatmentDocumentationReferenceId: string | null | undefined,
  pathwayPrimaryDocumentationReferenceId: string | null | undefined,
  pathwaySecondaryDocumentationReferenceId?: string | null,
): string | null {
  const id = resolveDocumentationReferenceId(
    treatmentDocumentationReferenceId,
    pathwayPrimaryDocumentationReferenceId,
    pathwaySecondaryDocumentationReferenceId,
  );
  if (!id) return null;
  const ref = refs.find((r) => r.id === id);
  if (!ref) return null;
  return citationDisplay(ref);
}

export function shouldRevokeVerificationOnEdit(
  previous: Partial<Record<(typeof MATERIAL_REFERENCE_FIELDS)[number], unknown>> & {
    status?: string | null;
  },
  next: Partial<Record<(typeof MATERIAL_REFERENCE_FIELDS)[number], unknown>>,
): boolean {
  if (previous.status !== 'verified') return false;
  for (const field of MATERIAL_REFERENCE_FIELDS) {
    if (next[field] === undefined) continue;
    const a = normalizeComparable(previous[field]);
    const b = normalizeComparable(next[field]);
    if (a !== b) return true;
  }
  return false;
}

function normalizeComparable(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  return String(value).trim().toLowerCase();
}

export function normalizeReferenceMatchKey(input: {
  doi?: string | null;
  url?: string | null;
  citationTitle?: string | null;
  organization?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
}): { doi: string | null; url: string | null; titleOrg: string | null; titleYear: string | null } {
  const doi = asString(input.doi)?.toLowerCase() ?? null;
  const url = normalizeUrl(input.url);
  const title = asString(input.citationTitle)?.toLowerCase() ?? null;
  const org = asString(input.organization)?.toLowerCase() ?? null;
  const year =
    typeof input.publicationYear === 'number'
      ? String(input.publicationYear)
      : asString(input.edition)?.toLowerCase() ?? null;
  return {
    doi,
    url,
    titleOrg: title && org ? `${title}::${org}` : null,
    titleYear: title && year ? `${title}::${year}` : null,
  };
}

function normalizeUrl(value: string | null | undefined): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const tracking = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
    ]);
    for (const key of [...u.searchParams.keys()]) {
      if (tracking.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    const query = u.searchParams.toString();
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/$/, '').toLowerCase()}${
      query ? `?${query}` : ''
    }`;
  } catch {
    return raw.toLowerCase().replace(/\/$/, '');
  }
}

export type PublishingReadinessIssue = {
  code: string;
  section: string;
  message: string;
  severity: 'blocking' | 'warning';
};

export type PublishingReadinessResult = {
  ready: boolean;
  issues: PublishingReadinessIssue[];
  sectionStatus: Record<
    EvidenceSection | 'references' | 'internal_review' | 'external_review',
    'approved' | 'needs_review' | 'needs_verification' | 'pending' | 'completed'
  >;
};

export function computePublishingReadiness(input: {
  references: Array<{ status: string }>;
  governance: PathwayGovernanceState;
  /** When false, external peer review is not required to publish. */
  requireExternalPeerReview?: boolean;
  presentationApproved: boolean;
  differentialApproved: boolean;
  redFlagsApproved: boolean;
  treatmentsApproved: boolean;
  guidanceApproved: boolean;
  treatmentsMissingEvidence: number;
  redFlagsMissingEvidence: number;
}): PublishingReadinessResult {
  const issues: PublishingReadinessIssue[] = [];
  const unverified = input.references.filter(
    (r) => r.status === 'needs_review' || r.status === 'verification_required',
  ).length;
  const requireExternal = input.requireExternalPeerReview !== false;

  const sectionStatus: PublishingReadinessResult['sectionStatus'] = {
    presentation_review: input.presentationApproved ? 'approved' : 'needs_review',
    differential_review: input.differentialApproved ? 'approved' : 'needs_review',
    red_flags: input.redFlagsApproved ? 'approved' : 'needs_review',
    treatment_options: input.treatmentsApproved ? 'approved' : 'needs_review',
    patient_guidance: input.guidanceApproved ? 'approved' : 'needs_review',
    references: unverified > 0 ? 'needs_verification' : 'approved',
    internal_review:
      input.governance.internalReviewStatus === 'completed' ? 'completed' : 'pending',
    external_review:
      input.governance.externalPeerReviewStatus === 'completed' ? 'completed' : 'pending',
  };

  if (!input.presentationApproved) {
    issues.push({
      code: 'presentation_needs_review',
      section: 'Presentation Review',
      message: 'Presentation Review has items that still need review.',
      severity: 'blocking',
    });
  }
  if (!input.differentialApproved) {
    issues.push({
      code: 'differential_needs_review',
      section: 'Differential Review',
      message: 'Differential Review has items that still need review.',
      severity: 'blocking',
    });
  }
  if (!input.redFlagsApproved) {
    issues.push({
      code: 'red_flags_needs_review',
      section: 'Red Flags',
      message: 'Red Flags has items that still need review.',
      severity: 'blocking',
    });
  }
  if (!input.treatmentsApproved) {
    issues.push({
      code: 'treatments_needs_review',
      section: 'Treatment Options',
      message: 'Treatment Options has items that still need review.',
      severity: 'blocking',
    });
  }
  if (!input.guidanceApproved) {
    issues.push({
      code: 'guidance_needs_review',
      section: 'Patient Guidance',
      message: 'Patient Guidance has items that still need review.',
      severity: 'blocking',
    });
  }
  if (unverified > 0) {
    issues.push({
      code: 'references_need_verification',
      section: 'References',
      message: `${unverified} reference${unverified === 1 ? '' : 's'} require verification.`,
      severity: 'blocking',
    });
  }
  if (input.treatmentsMissingEvidence > 0) {
    issues.push({
      code: 'treatments_missing_evidence',
      section: 'Treatment Options',
      message: `${input.treatmentsMissingEvidence} active treatment${input.treatmentsMissingEvidence === 1 ? '' : 's'} missing supporting evidence.`,
      severity: 'blocking',
    });
  }
  if (input.redFlagsMissingEvidence > 0) {
    issues.push({
      code: 'red_flags_missing_evidence',
      section: 'Red Flags',
      message: `${input.redFlagsMissingEvidence} red flag${input.redFlagsMissingEvidence === 1 ? '' : 's'} missing supporting evidence.`,
      severity: 'warning',
    });
  }
  if (input.governance.internalReviewStatus !== 'completed') {
    issues.push({
      code: 'internal_review_incomplete',
      section: 'Internal review',
      message: 'Internal clinical review is not completed.',
      severity: 'blocking',
    });
  }
  if (requireExternal && input.governance.externalPeerReviewStatus !== 'completed') {
    issues.push({
      code: 'external_review_incomplete',
      section: 'Independent peer review',
      message: 'Independent peer review is not completed.',
      severity: 'blocking',
    });
  }

  const ready = !issues.some((i) => i.severity === 'blocking');
  return { ready, issues, sectionStatus };
}

export function aggregateReviewedAreas(
  reviewers: Array<{ reviewedAreas: string[] }>,
): ReviewedArea[] {
  const set = new Set<ReviewedArea>();
  for (const reviewer of reviewers) {
    for (const area of reviewer.reviewedAreas) {
      if ((REVIEWED_AREAS as readonly string[]).includes(area)) {
        set.add(area as ReviewedArea);
      }
    }
  }
  return REVIEWED_AREAS.filter((area) => set.has(area));
}

export function usageBadgesFromMappings(
  mappings: Array<{ section: string; mappingType: string }>,
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.section === 'section_wide') {
      if (!seen.has('Section-wide')) {
        seen.add('Section-wide');
        labels.push('Section-wide');
      }
      continue;
    }
    if (mapping.mappingType === 'section' && isEvidenceSection(mapping.section)) {
      const label = SECTION_LABELS[mapping.section];
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
      continue;
    }
    if (!isEvidenceSection(mapping.section)) continue;
    const label = SECTION_LABELS[mapping.section];
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

export function parseSuggestedSections(raw: unknown): EvidenceImportSection[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;|]/)
      : [];
  const out: EvidenceImportSection[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const section = normalizeSectionName(String(value));
    if (!section || seen.has(section)) continue;
    seen.add(section);
    out.push(section);
  }
  return out;
}

export function normalizeSectionName(raw: string): EvidenceImportSection | null {
  const compact = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!compact) return null;
  if (compact === 'sectionwide' || compact === 'pathway' || compact === 'pathwaywide') {
    return 'section_wide';
  }
  if (compact.includes('presentation')) return 'presentation_review';
  if (compact.includes('differential')) return 'differential_review';
  if (compact.includes('redflag') || compact === 'safety' || compact.includes('safetyscreen')) {
    return 'red_flags';
  }
  if (compact.includes('treatment')) return 'treatment_options';
  if (
    compact.includes('patientguidance') ||
    compact.includes('guidance') ||
    compact.includes('counselling') ||
    compact.includes('counseling')
  ) {
    return 'patient_guidance';
  }
  return null;
}

export function evidenceRefIdsFromJsonItems(items: unknown): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = asString(row.id);
    if (!id) continue;
    map.set(id, uniqueIdList(row.evidenceRefIds ?? row.referenceIds));
  }
  return map;
}
