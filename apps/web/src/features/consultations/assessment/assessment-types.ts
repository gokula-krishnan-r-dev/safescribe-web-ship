export type PathwayMatchStatus = 'matched' | 'none' | 'ambiguous';

export type PathwayReviewer = {
  fullName: string;
  credentials: string | null;
  role: string;
  reviewerType: 'internal_clinical_review' | 'independent_external_peer_review';
  reviewedAt?: string | null;
};

export type PathwayDocumentationReference = {
  id: string;
  citationTitle: string;
  publicationYear?: number | null;
  edition?: string | null;
};

export type PathwayReference = {
  id: string;
  citationTitle: string;
  organization?: string | null;
  publicationYear?: number | null;
  edition?: string | null;
  url?: string | null;
  referenceType: string;
  supportsSections: string[];
};

export type PathwayEvidence = {
  pathwayId: string;
  displayName: string;
  jurisdiction: string;
  pathwayVersion: string;
  effectiveDate: string | null;
  clinicalSources: string[];
  clinicalReview: {
    status: 'completed' | 'pending';
    summary: string;
    lastReviewed: string | null;
    reviewers: PathwayReviewer[];
  };
  independentPeerReview: {
    status: 'completed' | 'pending' | 'not_completed';
    summary: string;
    reviewers: PathwayReviewer[];
  };
  references: PathwayReference[];
  primaryReference: PathwayDocumentationReference | null;
  secondaryReference: PathwayDocumentationReference | null;
  versionHistory: Array<{
    version: string;
    effectiveDate: string | null;
    changeSummary: string[];
  }>;
};

export type ClinicalAssessmentMatch = {
  status: PathwayMatchStatus;
  assessmentText: string;
  normalizedAssessment: string;
  matchMethod: string | null;
  message: string | null;
  pathway: {
    id: string;
    name: string;
    condition: string;
    displayName: string;
    version: string;
  } | null;
  candidates?: Array<{
    id: string;
    name: string;
    condition: string | null;
    displayName: string;
    version: string;
    matchMethod?: string;
    score?: number;
  }>;
  evidence: PathwayEvidence | null;
};
