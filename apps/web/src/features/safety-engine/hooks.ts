'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type {
  CreateSafetyRuleInput,
  ImportBatchCommitResponse,
  ImportBatchPreviewResponse,
  ImportCommitCounts,
  ImportPreviewResponse,
  SafetyReleaseResponse,
  SafetyRuleDetail,
  SafetyRulesListResponse,
} from './types';

const BASE = '/admin/medication-safety';

export const safetyEngineKeys = {
  all: ['safety-engine'] as const,
  rules: (params?: Record<string, unknown>) => [...safetyEngineKeys.all, 'rules', params] as const,
  rule: (id: string) => [...safetyEngineKeys.all, 'rule', id] as const,
  release: () => [...safetyEngineKeys.all, 'release'] as const,
  drugClasses: (params?: Record<string, unknown>) => [...safetyEngineKeys.all, 'drug-classes', params] as const,
  drugCatalog: (params?: Record<string, unknown>) => [...safetyEngineKeys.all, 'drug-catalog', params] as const,
};

export function useSafetyRules(params: {
  page?: number;
  limit?: number;
  search?: string;
  ruleType?: string;
  status?: string;
  jurisdiction?: string;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.ruleType) qs.set('ruleType', params.ruleType);
  if (params.status) qs.set('status', params.status);
  if (params.jurisdiction) qs.set('jurisdiction', params.jurisdiction);
  const query = qs.toString();

  return useQuery({
    queryKey: safetyEngineKeys.rules(params),
    queryFn: () => api.get<SafetyRulesListResponse>(`${BASE}/rules${query ? `?${query}` : ''}`),
    staleTime: 10_000,
  });
}

export function useSafetyRule(id: string | null) {
  return useQuery({
    queryKey: safetyEngineKeys.rule(id ?? ''),
    queryFn: () => api.get<SafetyRuleDetail>(`${BASE}/rules/${id}`),
    enabled: Boolean(id),
  });
}

export function useSafetyRelease() {
  return useQuery({
    queryKey: safetyEngineKeys.release(),
    queryFn: () => api.get<SafetyReleaseResponse>(`${BASE}/releases/current`),
    staleTime: 10_000,
  });
}

export function useCreateSafetyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSafetyRuleInput) => api.post(`${BASE}/rules`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useUpdateSafetyRule(ruleId: string, versionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateSafetyRuleInput>) =>
      api.patch(`${BASE}/rules/${ruleId}/versions/${versionId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

/** Spreadsheet-style patch — pass rule/version ids per call (table rows). */
export function usePatchSafetyRuleVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ruleId,
      versionId,
      data,
    }: {
      ruleId: string;
      versionId: string;
      data: Partial<{
        summary: string;
        detail: string;
        clinicalSeverity: CreateSafetyRuleInput['clinicalSeverity'];
        recommendedAction: string;
        changeSummary: string;
      }>;
    }) => api.patch(`${BASE}/rules/${ruleId}/versions/${versionId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useApproveSafetyRule(ruleId: string, versionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${BASE}/rules/${ruleId}/versions/${versionId}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useDeleteSafetyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useBulkUpdateSafetyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: string[]; jurisdiction?: string; status?: string; clinicalSeverity?: string }) =>
      api.post<{ updated: number; approved?: number }>(`${BASE}/rules/bulk-update`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useApproveAllDraftRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: { ruleType?: string; search?: string }) =>
      api.post<{ approved: number; message: string }>(`${BASE}/rules/approve-all`, data ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: safetyEngineKeys.all });
      qc.invalidateQueries({ queryKey: ['clinical-repository'] });
    },
  });
}

export function useBulkDeleteSafetyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post(`${BASE}/rules/bulk-delete`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ImportPreviewResponse>(`${BASE}/import/preview`, form);
    },
  });
}

export function useImportCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ImportCommitCounts>(`${BASE}/import/commit`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useImportPreviewBatch() {
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      return api.upload<ImportBatchPreviewResponse>(`${BASE}/import/preview-batch`, form);
    },
  });
}

export function useImportCommitBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      return api.upload<ImportBatchCommitResponse>(`${BASE}/import/commit-batch`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useDrugClasses(params: { page?: number; limit?: number; search?: string }) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return useQuery({
    queryKey: safetyEngineKeys.drugClasses(params),
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          className: string;
          parentClass: string | null;
          therapeuticGroup: string | null;
          riskTags: string[];
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`${BASE}/drug-classes${query ? `?${query}` : ''}`),
    staleTime: 30_000,
  });
}

export function useDrugCatalog(params: {
  page?: number;
  limit?: number;
  search?: string;
  className?: string;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.className) qs.set('className', params.className);
  const query = qs.toString();
  return useQuery({
    queryKey: safetyEngineKeys.drugCatalog(params),
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          drugName: string;
          className: string;
          ingredient: string | null;
          commonBrands: string[];
          notes: string | null;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`${BASE}/drugs${query ? `?${query}` : ''}`),
    staleTime: 30_000,
  });
}

export function usePublishSafetyRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ release: { id: string; version: string; ruleCount: number } }>(
      `${BASE}/releases/publish`,
      {},
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: safetyEngineKeys.all }),
  });
}

export function useMedicationSafetyEvaluate(consultationId?: string) {
  return useMutation({
    mutationFn: (body: {
      selectedMedications: Array<{ productName: string; genericName?: string }>;
      patientContext: {
        allergies: Array<{
          substance: string;
          clinicalStatus?: string;
          verificationStatus?: string;
          reaction?: string;
        }>;
        conditions?: string[];
        age?: number;
      };
      jurisdiction?: string;
    }) =>
      api.post(`/medication-safety/evaluate`, {
        consultationId,
        ...body,
      }),
  });
}

export function useSafetyOverride(evaluationId: string) {
  return useMutation({
    mutationFn: (data: { reasonCode: string; reasonComment?: string }) =>
      api.post(`/medication-safety/evaluations/${evaluationId}/override`, data),
  });
}
