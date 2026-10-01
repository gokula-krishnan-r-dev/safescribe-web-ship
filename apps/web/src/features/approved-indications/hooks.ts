'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { MappingLevel, RelationshipType } from './labels';

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };

export type IndicationMapping = {
  id: string;
  medicationConceptId: string;
  medicationDisplayName: string;
  medicationMappingLevel: MappingLevel | string;
  indicationConceptId: string;
  indicationDisplayName: string;
  relationshipType: RelationshipType | string;
  jurisdiction: string;
  sourceLabel: string | null;
  status: 'approved' | 'retired' | string;
  mappingVersion: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  approvedById: string | null;
};

export type IndicationCandidate = {
  id: string;
  medicationConceptId: string;
  medicationDisplayName?: string;
  medicationMappingLevel: string;
  indicationConceptId: string;
  indicationDisplayName?: string;
  sourceType?: string;
  jurisdiction: string;
  usageCount?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  status: string;
  relationshipTypeSuggested?: string | null;
};

export type IndicationCoverage = {
  medicationsEncountered: number;
  withApprovedMappings: number;
  needsReview: number;
  noApprovedMappings: number;
  pendingRelationships: number;
  approvedRelationships: number;
};

export type IndicationRepositoryVersion = {
  id: string;
  version: string;
  versionCode?: string;
  publishedAt: string;
  publishedBy?: string | null;
  publishedById?: string | null;
  publishedByName?: string | null;
  changesSummary?: string | null;
  changeSummary?: string | null;
  status: string;
  addedCount?: number;
  updatedCount?: number;
  retiredCount?: number;
  mappingsAdded?: number;
  mappingsUpdated?: number;
  mappingsRetired?: number;
};

export type SnomedSearchHit = {
  conceptId: string;
  displayName: string;
  preferredTerm?: string;
};

export type SaveMappingInput = {
  medicationConceptId: string;
  medicationDisplayName?: string;
  medicationMappingLevel: MappingLevel;
  indicationConceptId: string;
  indicationDisplayName?: string;
  relationshipType: RelationshipType;
  jurisdiction: string;
  sourceLabel?: string | null;
  notes?: string | null;
};

const BASE = '/approved-indications';
const QUERY_ROOT = ['approved-indications'] as const;

function buildQuery(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

export function useIndicationMappings(params: {
  q: string;
  page: number;
  limit?: number;
  jurisdiction?: string;
  relationshipType?: string;
  medicationMappingLevel?: string;
  status?: string;
}) {
  const qs = buildQuery({
    page: params.page,
    limit: params.limit ?? 20,
    q: params.q.trim() || undefined,
    jurisdiction: params.jurisdiction || undefined,
    relationship: params.relationshipType || undefined,
    level: params.medicationMappingLevel || undefined,
    status:
      params.status && params.status !== 'all' ? params.status : undefined,
  });
  return useQuery({
    queryKey: [...QUERY_ROOT, 'mappings', params],
    queryFn: () =>
      api.get<{ data: IndicationMapping[]; meta: PageMeta }>(
        `${BASE}/mappings?${qs}`,
      ),
  });
}

export function useIndicationCandidates(params: {
  status?: string;
  page?: number;
  limit?: number;
  q?: string;
}) {
  const qs = buildQuery({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    status: params.status ?? 'pending',
    q: params.q?.trim() || undefined,
  });
  return useQuery({
    queryKey: [...QUERY_ROOT, 'candidates', params],
    queryFn: () =>
      api.get<{ data: IndicationCandidate[]; meta: PageMeta }>(
        `${BASE}/candidates?${qs}`,
      ),
  });
}

export function usePendingCandidateCount() {
  return useQuery({
    queryKey: [...QUERY_ROOT, 'candidates', 'pending-count'],
    queryFn: async () => {
      const res = await api.get<{ data: IndicationCandidate[]; meta: PageMeta }>(
        `${BASE}/candidates?${buildQuery({ status: 'pending', page: 1, limit: 1 })}`,
      );
      return res.meta.total;
    },
    staleTime: 30_000,
  });
}

export function useIndicationCoverage() {
  return useQuery({
    queryKey: [...QUERY_ROOT, 'coverage'],
    queryFn: () => api.get<IndicationCoverage>(`${BASE}/coverage`),
  });
}

export function useIndicationVersions(params?: { page?: number; limit?: number }) {
  const qs = buildQuery({
    page: params?.page ?? 1,
    limit: params?.limit ?? 20,
  });
  return useQuery({
    queryKey: [...QUERY_ROOT, 'versions', params],
    queryFn: async () => {
      const res = await api.get<{
        data: IndicationRepositoryVersion[];
        meta?: PageMeta;
      }>(`${BASE}/versions?${qs}`);
      return {
        ...res,
        data: (res.data ?? []).map((row) => ({
          ...row,
          version: row.version || row.versionCode || '—',
          changesSummary: row.changesSummary ?? row.changeSummary ?? null,
          publishedBy: row.publishedBy ?? row.publishedById ?? null,
          addedCount: row.addedCount ?? row.mappingsAdded,
          updatedCount: row.updatedCount ?? row.mappingsUpdated,
          retiredCount: row.retiredCount ?? row.mappingsRetired,
        })),
      };
    },
  });
}

export function useSnomedIndicationSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: [...QUERY_ROOT, 'snomed-search', q],
    queryFn: async () => {
      const raw = await api.get<
        SnomedSearchHit[] | { data: SnomedSearchHit[] }
      >(`${BASE}/snomed/search?${buildQuery({ q })}`);
      const rows = Array.isArray(raw) ? raw : raw.data;
      return rows.map((row) => ({
        conceptId: row.conceptId ?? (row as { id?: string }).id ?? '',
        displayName:
          row.displayName ??
          row.preferredTerm ??
          (row as { label?: string }).label ??
          '',
      }));
    },
    enabled: enabled && q.length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useIndicationMappingMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [...QUERY_ROOT] });

  return {
    createMapping: useMutation({
      mutationFn: (body: SaveMappingInput) =>
        api.post<IndicationMapping>(`${BASE}/mappings`, body),
      onSuccess: invalidate,
    }),
    updateMapping: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Partial<SaveMappingInput> }) =>
        api.patch<IndicationMapping>(`${BASE}/mappings/${id}`, body),
      onSuccess: invalidate,
    }),
    retireMapping: useMutation({
      mutationFn: (id: string) =>
        api.post<IndicationMapping>(`${BASE}/mappings/${id}/retire`, {}),
      onSuccess: invalidate,
    }),
    approveCandidate: useMutation({
      mutationFn: (id: string) =>
        api.post(`${BASE}/candidates/${id}/review`, { action: 'approve' }),
      onSuccess: invalidate,
    }),
    rejectCandidate: useMutation({
      mutationFn: (id: string) =>
        api.post(`${BASE}/candidates/${id}/review`, { action: 'reject' }),
      onSuccess: invalidate,
    }),
    publishVersion: useMutation({
      mutationFn: (changeSummary?: string) =>
        api.post<IndicationRepositoryVersion>(`${BASE}/versions`, {
          changeSummary: changeSummary?.trim() || undefined,
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
