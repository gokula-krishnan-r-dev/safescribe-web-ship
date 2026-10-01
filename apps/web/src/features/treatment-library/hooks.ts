'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { TreatmentFormData } from '@/features/pathways/treatment-form-dialog';
import type {
  PathwayLibrarySearchResponse,
  TreatmentLibraryDetailResponse,
  TreatmentLibraryListParams,
  TreatmentLibraryListResponse,
} from './types';

const BASE = '/treatment-library';

export const treatmentLibraryKeys = {
  all: ['treatment-library'] as const,
  lists: () => [...treatmentLibraryKeys.all, 'list'] as const,
  list: (params: object) => [...treatmentLibraryKeys.lists(), params] as const,
  detail: (id: string) => [...treatmentLibraryKeys.all, 'detail', id] as const,
  usage: (id: string) => [...treatmentLibraryKeys.all, 'usage', id] as const,
  search: (q: string) => [...treatmentLibraryKeys.all, 'search', q] as const,
  pathwaySearch: (params: object) => [...treatmentLibraryKeys.all, 'pathway-search', params] as const,
};

export function useTreatmentLibraryList(params: TreatmentLibraryListParams) {
  return useQuery({
    queryKey: treatmentLibraryKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      });
      return api.get<TreatmentLibraryListResponse>(`${BASE}?${qs}`);
    },
    placeholderData: (prev) => prev,
  });
}

export function useTreatmentLibraryItem(id: string | undefined) {
  return useQuery({
    queryKey: treatmentLibraryKeys.detail(id ?? ''),
    queryFn: () => api.get<TreatmentLibraryDetailResponse>(`${BASE}/${id}`),
    enabled: Boolean(id),
  });
}

export function useTreatmentLibraryUsage(id: string | null) {
  return useQuery({
    queryKey: treatmentLibraryKeys.usage(id ?? ''),
    queryFn: () =>
      api.get<{
        items: Array<{
          pathwayId: string;
          pathwayName: string;
          province: string;
          pathwayStatus: string;
          pathwayTreatmentId: string;
          sourceVersionNumber: number | null;
          hasUpdateAvailable: boolean;
        }>;
      }>(`${BASE}/${id}/usage`),
    enabled: Boolean(id),
  });
}

export function useApprovedLibrarySearch(q: string, enabled = false) {
  return useQuery({
    queryKey: treatmentLibraryKeys.search(q),
    queryFn: () =>
      api.get<PathwayLibrarySearchResponse>(
        `${BASE}/search?q=${encodeURIComponent(q)}`,
      ),
    enabled,
  });
}

export function usePathwayLibrarySearch(
  params: {
    q?: string;
    pathwayId?: string;
    treatmentType?: string;
    population?: string;
    form?: string;
    route?: string;
    page?: number;
  },
  enabled = false,
) {
  return useQuery({
    queryKey: treatmentLibraryKeys.pathwaySearch(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      });
      return api.get<PathwayLibrarySearchResponse>(`${BASE}/search?${qs}`);
    },
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function formDataToLibraryPayload(data: TreatmentFormData) {
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const regimens = Array.isArray(meta.regimens) ? meta.regimens : [];
  const first = (regimens[0] ?? {}) as Record<string, unknown>;
  const matchRaw = String(meta.matchStatus ?? '');
  const matchStatus =
    matchRaw === 'MATCHED' || matchRaw === 'matched'
      ? 'MATCHED'
      : matchRaw === 'INCOMPLETE' || matchRaw === 'REVIEW_REQUIRED'
        ? 'INCOMPLETE'
        : 'UNMATCHED';
  return {
    category: data.category,
    displayName: data.medicationName,
    genericName: data.genericName,
    brandName: data.brandName,
    strength: data.strength,
    population: (data.population as string | undefined) || (meta.population as string | undefined) || 'ADULT',
    matchStatus,
    productFormDisplay: String(first.productForm ?? meta.productForm ?? ''),
    routeDisplay: data.route || String(first.route ?? ''),
    regimenLabel: String(first.label ?? data.dose ?? ''),
    medication: meta.medicationConcept ?? {},
    regimens,
    directions: data.directions,
    clinicalNotes: data.clinicalNotes,
    eligibility: data.eligibility,
    extras: { ...meta, population: data.population ?? meta.population },
    safety: {
      renalAdjustment: data.renalAdjustment === 'Yes',
      renalReason: data.renalAdjustmentReason,
      renalDosingBasis: data.renalDosingBasis ?? 'NONE',
      renalDosingRules: data.renalDosingRules ?? [],
      hepaticAdjustment: data.hepaticAdjustment === 'Yes',
      hepaticReason: data.hepaticAdjustmentReason,
      pregnancyConsideration: data.pregnancyNotes === 'Yes',
      pregnancyReason: data.pregnancyReason,
      lactationConsideration: data.breastfeedingNotes === 'Yes',
      lactationReason: data.lactationReason,
      labMonitoringNeeded: data.monitoring === 'Yes',
      labMonitoringReason: data.monitoringReason,
      monitoringText: data.followUpAdvice,
    },
  };
}

export function useCreateLibraryTreatment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof formDataToLibraryPayload>) =>
      api.post<TreatmentLibraryDetailResponse>(BASE, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.lists() });
    },
  });
}

export function useSaveLibraryDraft(itemId: string, versionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReturnType<typeof formDataToLibraryPayload>) =>
      api.patch<TreatmentLibraryDetailResponse>(`${BASE}/${itemId}/versions/${versionId}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.detail(itemId) });
      void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.lists() });
    },
  });
}

export function useLibraryWorkflow(itemId: string, versionId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.detail(itemId) });
    void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.lists() });
  };
  const submit = useMutation({
    mutationFn: () =>
      api.post<TreatmentLibraryDetailResponse>(
        `${BASE}/${itemId}/versions/${versionId}/submit-review`,
        {},
      ),
    onSuccess: invalidate,
  });
  const validate = useMutation({
    mutationFn: () =>
      api.post<{ checks: Array<{ id: string; label: string; ok: boolean; detail?: string }> }>(
        `${BASE}/${itemId}/versions/${versionId}/validate`,
        {},
      ),
  });
  const approve = useMutation({
    mutationFn: () =>
      api.post<TreatmentLibraryDetailResponse>(
        `${BASE}/${itemId}/versions/${versionId}/approve`,
        {},
      ),
    onSuccess: invalidate,
  });
  const requestChanges = useMutation({
    mutationFn: (reviewNotes?: string) =>
      api.post<TreatmentLibraryDetailResponse>(
        `${BASE}/${itemId}/versions/${versionId}/request-changes`,
        { reviewNotes },
      ),
    onSuccess: invalidate,
  });
  const newVersion = useMutation({
    mutationFn: () => api.post<TreatmentLibraryDetailResponse>(`${BASE}/${itemId}/versions`, {}),
    onSuccess: invalidate,
  });
  return { submit, validate, approve, requestChanges, newVersion };
}

export function useRetireLibraryTreatment(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<TreatmentLibraryDetailResponse>(`${BASE}/${itemId}/retire`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.detail(itemId) });
      void qc.invalidateQueries({ queryKey: treatmentLibraryKeys.lists() });
    },
  });
}
