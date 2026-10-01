'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

const BASE = '/admin/clinical-references';

export const clinicalReferenceKeys = {
  all: ['clinical-references'] as const,
  summary: () => [...clinicalReferenceKeys.all, 'summary'] as const,
  list: (kind: string, params?: Record<string, unknown>) =>
    [...clinicalReferenceKeys.all, kind, params] as const,
  detail: (kind: string, id: string) => [...clinicalReferenceKeys.all, kind, 'detail', id] as const,
  releases: () => [...clinicalReferenceKeys.all, 'releases'] as const,
};

export type ReferenceStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUPERSEDED' | 'ARCHIVED' | 'ACTIVE';

export type HistoryRow = {
  id: string;
  versionNumber: number;
  status: ReferenceStatus;
  createdAt: string;
  updatedAt: string;
  releaseId: string | null;
};

export type ReferenceValueRow = {
  id: string;
  referenceId: string;
  versionNumber: number;
  inputCode: string;
  label: string;
  category: string | null;
  population: string;
  sex: string;
  context: string | null;
  referenceStrategy: string;
  referenceKind: string;
  uiUse: string | null;
  lowerNumeric: number | null;
  upperNumeric: number | null;
  operator: string | null;
  targetValue: string | null;
  unit: string | null;
  displayText: string | null;
  sourceCode: string | null;
  sourcePriority: number | null;
  notes: string | null;
  status: ReferenceStatus;
  reviewApprovedAt: string | null;
  updatedAt: string;
  createdAt: string;
  history?: HistoryRow[];
  source?: ReferenceSourceRow | null;
};

export type TreatmentTargetRow = {
  id: string;
  targetId: string;
  versionNumber: number;
  inputCode: string;
  label: string;
  population: string;
  clinicalContext: string;
  parameter: string;
  operator: string | null;
  targetValue: string | null;
  unit: string | null;
  displayText: string;
  sourceCode: string;
  targetType: string;
  notes: string | null;
  status: ReferenceStatus;
  reviewApprovedAt: string | null;
  updatedAt: string;
  createdAt: string;
  history?: HistoryRow[];
  source?: ReferenceSourceRow | null;
};

export type PediatricPolicyRow = {
  id: string;
  inputCode: string;
  versionNumber: number;
  label: string | null;
  category: string | null;
  strategy: string;
  preferredSource: string | null;
  fallbackAllowed: boolean;
  adultFallbackAllowed: boolean;
  implementationNote: string | null;
  sourceUrl: string | null;
  status: ReferenceStatus;
  reviewApprovedAt: string | null;
  updatedAt: string;
  createdAt: string;
  history?: HistoryRow[];
};

export type ReferenceSourceRow = {
  id: string;
  sourceCode: string;
  versionNumber: number;
  sourceName: string;
  sourceType: string;
  publisher: string | null;
  jurisdiction: string | null;
  version: string | null;
  sourceUrl: string | null;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
  useCase: string | null;
  notes: string | null;
  status: ReferenceStatus;
  reviewApprovedAt: string | null;
  updatedAt: string;
  createdAt: string;
  history?: HistoryRow[];
};

export type ReferenceReleaseRow = {
  id: string;
  releaseId: string;
  versionLabel: string;
  status: ReferenceStatus;
  publishedAt: string | null;
  notes: string | null;
  createdAt: string;
  isActive?: boolean;
  _count?: { values: number; targets: number; pediatric: number; sources: number };
};

export type ReferenceSummary = {
  publishedRelease: {
    id: string;
    releaseId: string;
    versionLabel: string;
    status: string;
    publishedAt: string | null;
    notes: string | null;
  } | null;
  draftChanges: number;
  inReviewChanges: number;
  counts: { values: number; targets: number; pediatric: number; sources: number };
};

export type Paginated<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function useReferenceSummary() {
  return useQuery({
    queryKey: clinicalReferenceKeys.summary(),
    queryFn: () => api.get<ReferenceSummary>(`${BASE}/summary`),
    staleTime: 10_000,
  });
}

export function useReferenceValues(params: Record<string, unknown>) {
  return useQuery({
    queryKey: clinicalReferenceKeys.list('values', params),
    queryFn: () => api.get<Paginated<ReferenceValueRow>>(`${BASE}/values${qs(params)}`),
  });
}

export function useTreatmentTargets(params: Record<string, unknown>) {
  return useQuery({
    queryKey: clinicalReferenceKeys.list('targets', params),
    queryFn: () => api.get<Paginated<TreatmentTargetRow>>(`${BASE}/targets${qs(params)}`),
  });
}

export function usePediatricPolicies(params: Record<string, unknown>) {
  return useQuery({
    queryKey: clinicalReferenceKeys.list('pediatric', params),
    queryFn: () => api.get<Paginated<PediatricPolicyRow>>(`${BASE}/pediatric${qs(params)}`),
  });
}

export function useReferenceSources(params: Record<string, unknown>) {
  return useQuery({
    queryKey: clinicalReferenceKeys.list('sources', params),
    queryFn: () => api.get<Paginated<ReferenceSourceRow>>(`${BASE}/sources${qs(params)}`),
  });
}

export function useReferenceReleases() {
  return useQuery({
    queryKey: clinicalReferenceKeys.releases(),
    queryFn: () => api.get<{ data: ReferenceReleaseRow[] }>(`${BASE}/releases`),
  });
}

export function useReferenceValue(id: string | null) {
  return useQuery({
    queryKey: clinicalReferenceKeys.detail('values', id ?? ''),
    queryFn: () => api.get<ReferenceValueRow>(`${BASE}/values/${id}`),
    enabled: Boolean(id),
  });
}

export function useTreatmentTarget(id: string | null) {
  return useQuery({
    queryKey: clinicalReferenceKeys.detail('targets', id ?? ''),
    queryFn: () => api.get<TreatmentTargetRow>(`${BASE}/targets/${id}`),
    enabled: Boolean(id),
  });
}

export function usePediatricPolicy(id: string | null) {
  return useQuery({
    queryKey: clinicalReferenceKeys.detail('pediatric', id ?? ''),
    queryFn: () => api.get<PediatricPolicyRow>(`${BASE}/pediatric/${id}`),
    enabled: Boolean(id),
  });
}

export function useReferenceSource(id: string | null) {
  return useQuery({
    queryKey: clinicalReferenceKeys.detail('sources', id ?? ''),
    queryFn: () => api.get<ReferenceSourceRow>(`${BASE}/sources/${id}`),
    enabled: Boolean(id),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: clinicalReferenceKeys.all });
}

export function useImportReferencePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ message: string; bootstrap: boolean }>(`${BASE}/import-pack`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function usePublishReferenceRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { notes?: string } = {}) => api.post(`${BASE}/releases/publish`, payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useExportReferencePack() {
  return useMutation({
    mutationFn: () => api.get<Record<string, unknown>>(`${BASE}/export`),
  });
}

export function useReferenceRecordAction(kind: 'values' | 'targets' | 'pediatric' | 'sources') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      body,
    }: {
      id: string;
      action: 'draft' | 'submit-review' | 'approve' | 'return-draft' | 'patch' | 'delete';
      body?: Record<string, unknown>;
    }) => {
      if (action === 'patch') return api.patch(`${BASE}/${kind}/${id}`, body);
      if (action === 'delete') return api.delete(`${BASE}/${kind}/${id}`);
      return api.post(`${BASE}/${kind}/${id}/${action}`, body);
    },
    onSuccess: () => invalidateAll(qc),
  });
}
