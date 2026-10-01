import type { PathwayEvidence, PathwayReference, PathwayReviewer } from '../assessment/assessment-types';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asReviewers(value: unknown): PathwayReviewer[] {
  if (!Array.isArray(value)) return [];
  const reviewers: PathwayReviewer[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const fullName = asString(item.fullName);
    if (!fullName) continue;
    const reviewerType: PathwayReviewer['reviewerType'] =
      item.reviewerType === 'independent_external_peer_review'
        ? 'independent_external_peer_review'
        : 'internal_clinical_review';
    reviewers.push({
      fullName,
      credentials: asString(item.credentials),
      role: asString(item.role) ?? 'Reviewer',
      reviewerType,
      reviewedAt: asString(item.reviewedAt),
    });
  }
  return reviewers;
}

function asReferences(value: unknown): PathwayReference[] {
  if (!Array.isArray(value)) return [];
  const references: PathwayReference[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = asString(item.id);
    const citationTitle = asString(item.citationTitle);
    if (!id || !citationTitle) continue;
    references.push({
      id,
      citationTitle,
      organization: asString(item.organization),
      publicationYear: typeof item.publicationYear === 'number' ? item.publicationYear : null,
      edition: asString(item.edition),
      url: asString(item.url),
      referenceType: asString(item.referenceType) ?? 'source',
      supportsSections: Array.isArray(item.supportsSections)
        ? item.supportsSections.filter((section): section is string => typeof section === 'string')
        : [],
    });
  }
  return references;
}

function asDocumentationReference(value: unknown): PathwayEvidence['primaryReference'] {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = asString(item.id);
  const citationTitle = asString(item.citationTitle);
  if (!id || !citationTitle) return null;
  return {
    id,
    citationTitle,
    publicationYear: typeof item.publicationYear === 'number' ? item.publicationYear : null,
    edition: asString(item.edition),
  };
}

function asVersionHistory(value: unknown): PathwayEvidence['versionHistory'] {
  if (!Array.isArray(value)) return [];
  const history: PathwayEvidence['versionHistory'] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const version = row as Record<string, unknown>;
    const label = asString(version.version);
    if (!label) continue;
    history.push({
      version: label,
      effectiveDate: asString(version.effectiveDate),
      changeSummary: Array.isArray(version.changeSummary)
        ? version.changeSummary.filter((line): line is string => typeof line === 'string')
        : [],
    });
  }
  return history;
}

export function parsePathwayEvidence(value: unknown): PathwayEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const pathwayId = asString(item.pathwayId);
  const displayName = asString(item.displayName);
  const pathwayVersion = asString(item.pathwayVersion);
  if (!pathwayId || !displayName || !pathwayVersion) return null;

  const clinical = item.clinicalReview && typeof item.clinicalReview === 'object'
    ? (item.clinicalReview as Record<string, unknown>)
    : {};
  const independent =
    item.independentPeerReview && typeof item.independentPeerReview === 'object'
      ? (item.independentPeerReview as Record<string, unknown>)
      : {};

  return {
    pathwayId,
    displayName,
    jurisdiction: asString(item.jurisdiction) ?? 'Not specified',
    pathwayVersion,
    effectiveDate: asString(item.effectiveDate),
    clinicalSources: Array.isArray(item.clinicalSources)
      ? item.clinicalSources.filter((source): source is string => typeof source === 'string' && Boolean(source.trim()))
      : [],
    clinicalReview: {
      status: clinical.status === 'completed' ? 'completed' : 'pending',
      summary: asString(clinical.summary) ?? 'Clinical review status is not listed for this version.',
      lastReviewed: asString(clinical.lastReviewed),
      reviewers: asReviewers(clinical.reviewers),
    },
    independentPeerReview: {
      status:
        independent.status === 'completed' || independent.status === 'pending'
          ? independent.status
          : 'not_completed',
      summary:
        asString(independent.summary) ?? 'Independent peer review status is not listed for this version.',
      reviewers: asReviewers(independent.reviewers),
    },
    references: asReferences(item.references),
    primaryReference: asDocumentationReference(item.primaryReference),
    secondaryReference: asDocumentationReference(item.secondaryReference),
    versionHistory: asVersionHistory(item.versionHistory),
  };
}

export function fallbackPathwayEvidence(input: {
  pathwayId?: string;
  displayName?: string;
  jurisdiction?: string | null;
  pathwayVersion?: string | null;
}): PathwayEvidence | null {
  if (!input.pathwayId || !input.displayName) return null;
  return {
    pathwayId: input.pathwayId,
    displayName: input.displayName,
    jurisdiction: input.jurisdiction?.trim() || 'Not specified',
    pathwayVersion: input.pathwayVersion?.trim() || 'v—',
    effectiveDate: null,
    clinicalSources: [],
    clinicalReview: {
      status: 'pending',
      summary: 'Clinical review status is not listed for this version.',
      lastReviewed: null,
      reviewers: [],
    },
    independentPeerReview: {
      status: 'not_completed',
      summary: 'Independent peer review status is not listed for this version.',
      reviewers: [],
    },
    references: [],
    primaryReference: null,
    secondaryReference: null,
    versionHistory: [],
  };
}

export function referencesForQuestion(
  references: PathwayReference[],
  questionId: string,
  evidenceRefIds?: string[],
): PathwayReference[] {
  const id = questionId.trim().toLowerCase();
  const linked = new Set((evidenceRefIds ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!id && !linked.size) return [];
  return references.filter((reference) => {
    if (linked.has(reference.id.trim().toLowerCase())) return true;
    return reference.supportsSections.some((section) => {
      const token = section.trim().toLowerCase();
      return token === id || token.includes(id);
    });
  });
}
