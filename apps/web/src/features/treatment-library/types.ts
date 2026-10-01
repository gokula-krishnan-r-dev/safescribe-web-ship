import type {
  TreatmentLibraryMatchStatus,
  TreatmentLibraryPopulation,
  TreatmentLibraryStatus,
  TreatmentLibraryListTab,
} from '@safescript/shared';

export interface TreatmentLibraryListItem {
  id: string;
  displayName: string;
  genericName: string;
  brandName: string;
  strength: string;
  productFormDisplay: string;
  routeDisplay: string;
  regimenLabel: string;
  category?: string;
  population: TreatmentLibraryPopulation;
  matchStatus: TreatmentLibraryMatchStatus;
  status: TreatmentLibraryStatus;
  approvedVersionNumber: number | null;
  currentApprovedVersionId: string | null;
  pendingReviewVersionId: string | null;
  isRetired: boolean;
  pathwayUsageCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface TreatmentLibraryVersion {
  id: string;
  itemId: string;
  versionNumber: number;
  status: TreatmentLibraryStatus;
  payload: Record<string, unknown>;
  payloadHash: string;
  changeSummary: string | null;
  submittedById: string | null;
  submittedAt: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentLibraryListResponse {
  items: TreatmentLibraryListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { all: number; approved: number; drafts: number; needsReview: number };
  facets: {
    forms: string[];
    routes: string[];
    formRoutes: Array<{ form: string; route: string; label: string }>;
  };
}

export interface TreatmentLibraryDetailResponse {
  item: TreatmentLibraryListItem;
  workingVersion: TreatmentLibraryVersion | null;
  versions: TreatmentLibraryVersion[];
}

export type PathwayLibraryUsage =
  | { state: 'not_used' }
  | { state: 'exact_version'; pathwayTreatmentId: string }
  | {
      state: 'older_version';
      pathwayTreatmentId: string;
      currentVersionNumber: number;
    }
  | {
      state: 'similar_treatment';
      pathwayTreatmentId: string;
      reasonCode: string;
    };

export interface PathwayLibrarySearchResult extends TreatmentLibraryListItem {
  itemId: string;
  approvedVersionId: string | null;
  versionNumber: number;
  treatmentType?: string;
  strengthText?: string;
  populationLabel?: string;
  regimenSummary?: string;
  medicationMatchStatus?: string;
  currentPathwayUsage: PathwayLibraryUsage;
}

export interface PathwayLibrarySearchResponse {
  items: PathwayLibrarySearchResult[];
  page: number;
  pageSize: number;
  total: number;
  filters: {
    formRoutes: Array<{ form: string; route: string; label: string }>;
  };
}

export interface TreatmentLibraryListParams {
  search?: string;
  status?: TreatmentLibraryListTab;
  population?: TreatmentLibraryPopulation | '';
  form?: string;
  route?: string;
  matchStatus?: TreatmentLibraryMatchStatus | '';
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
