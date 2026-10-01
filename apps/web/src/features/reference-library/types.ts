export type ReferenceLibraryItem = {
  id: string;
  citationTitle: string;
  organization: string | null;
  edition: string | null;
  publicationYear: number | null;
  url: string | null;
  doi: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  referenceType: string;
  status: string;
  verifiedBy: string | null;
  verificationDate: string | null;
  importSource: string;
  isRetired: boolean;
  pathwayUsageCount: number;
  clinicalUseTags?: string[];
  suggestedSections?: string[];
  documentationCandidate?: boolean;
  verificationRequired?: boolean;
  notes?: string | null;
  pathwayIds?: string[];
  createdAt: string;
  updatedAt: string;
  alreadyLinked?: boolean;
};

export type ReviewerLibraryItem = {
  id: string;
  reviewerType: string;
  name: string;
  credentials: string;
  organization: string | null;
  role: string;
  isRetired: boolean;
  pathwayUsageCount: number;
  createdAt: string;
  updatedAt: string;
  alreadyLinked?: boolean;
};

export type LibraryListResponse<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};
