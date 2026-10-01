'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

const BASE = '/admin/clinical-repository';

export const clinicalRepoKeys = {
  all: ['clinical-repository'] as const,
  imports: (params?: Record<string, unknown>) => [...clinicalRepoKeys.all, 'imports', params] as const,
  import: (id: string) => [...clinicalRepoKeys.all, 'import', id] as const,
  workbooks: () => [...clinicalRepoKeys.all, 'workbooks'] as const,
  valueSets: (params?: Record<string, unknown>) => [...clinicalRepoKeys.all, 'value-sets', params] as const,
  evidence: (params?: Record<string, unknown>) => [...clinicalRepoKeys.all, 'evidence', params] as const,
  testCases: (params?: Record<string, unknown>) => [...clinicalRepoKeys.all, 'test-cases', params] as const,
  terminology: () => [...clinicalRepoKeys.all, 'terminology'] as const,
  terminologyConcepts: (params?: Record<string, unknown>) =>
    [...clinicalRepoKeys.all, 'terminology-concepts', params] as const,
  terminologyReleases: () => [...clinicalRepoKeys.all, 'terminology-releases'] as const,
  preflight: () => [...clinicalRepoKeys.all, 'preflight'] as const,
  releases: (params?: Record<string, unknown>) => [...clinicalRepoKeys.all, 'releases', params] as const,
};

export type TerminologyActiveSummary = {
  active: {
    id: string;
    releaseKey: string;
    status: string;
    ccddVersion: string;
    activatedAt: string | null;
    downloadedAt?: string | null;
    createdAt?: string;
  } | null;
  conceptCount: number;
  ingredientCount: number;
  productCount: number;
  edgeCount: number;
  lastSyncedAt: string | null;
  isStale: boolean;
  recommendedResyncDays: number;
};

export type TerminologyConceptRow = {
  id: string;
  preferredNameEn: string;
  brandName: string | null;
  conceptType: string;
  sourceSystem: string;
  sourceCode: string;
  doseFormDisplay: string | null;
  dinCodes: string[];
  snomedCode: string | null;
  createdAt: string;
};

export type TerminologyReleaseRow = {
  id: string;
  releaseKey: string;
  status: string;
  ccddVersion: string;
  conceptCount: number;
  downloadedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type KnowledgeReleaseRow = {
  id: string;
  version: string;
  checksum: string;
  engineVersion: string;
  releaseNotes: string | null;
  ruleCount: number;
  publishedAt: string;
  publishedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  priorRelease: { id: string; version: string } | null;
  isActive: boolean;
  canRestore: boolean;
};

export type ClinicalIssueSummary = {
  code: string;
  severity: string;
  message: string;
  suggestedFix?: string;
  count: number;
  sampleRows: number[];
  reason: string;
};

export type ClinicalUploadResult = {
  batchId: string;
  fileType: string;
  schemaVersion: string;
  status: string;
  counts: { total: number; valid: number; warnings: number; errors: number };
  issues: Array<{
    severity: string;
    code: string;
    row: number;
    column?: string;
    message: string;
    suggestedFix?: string;
  }>;
  issueSummary?: ClinicalIssueSummary[];
  notice?: string;
  idempotent?: boolean;
  message?: string;
};

export function useClinicalWorkbooks() {
  return useQuery({
    queryKey: clinicalRepoKeys.workbooks(),
    queryFn: () =>
      api.get<
        Array<{
          typeKey: string;
          schemaVersion: string;
          domain: string;
          headerCount: number;
          businessKeyColumns: string[];
        }>
      >(`${BASE}/workbooks`),
    staleTime: 60_000,
  });
}

export function useClinicalImports(params: { page?: number; limit?: number; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  const query = qs.toString();
  return useQuery({
    queryKey: clinicalRepoKeys.imports(params),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          fileTypeKey: string | null;
          originalFilename: string;
          status: string;
          totalRows: number;
          validRows: number;
          warningRows: number;
          errorRows: number;
          uploadedAt: string;
        }>;
        meta: { total: number; page: number; limit: number; totalPages: number };
      }>(`${BASE}/imports${query ? `?${query}` : ''}`),
  });
}

export function useUploadClinicalWorkbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ClinicalUploadResult>(`${BASE}/imports`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalRepoKeys.all }),
  });
}

export function usePromoteClinicalImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => api.post(`${BASE}/imports/${batchId}/promote`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clinicalRepoKeys.all });
      qc.invalidateQueries({ queryKey: ['safety-engine'] });
    },
  });
}

export function useClinicalValueSets(params: { page?: number; limit?: number; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return useQuery({
    queryKey: clinicalRepoKeys.valueSets(params),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          valueSetCode: string;
          valueSetVersion: string;
          displayName: string;
          recordStatus: string;
          _count: { members: number };
        }>;
        meta: { total: number };
      }>(`${BASE}/value-sets${query ? `?${query}` : ''}`),
  });
}

export function useClinicalEvidence(params: { page?: number; limit?: number; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return useQuery({
    queryKey: clinicalRepoKeys.evidence(params),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          evidenceLinkId: string | null;
          ruleCode: string | null;
          source: string;
          sourceStatus: string | null;
          approvalStatus: string | null;
        }>;
        meta: { total: number };
      }>(`${BASE}/evidence${query ? `?${query}` : ''}`),
  });
}

export function useClinicalTestCases(params: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: clinicalRepoKeys.testCases(params),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          testCaseId: string;
          suiteVersion: string;
          testCaseName: string;
          safetyDomain: string;
          priority: string;
          contentStatus: string;
        }>;
        meta: { total: number };
      }>(`${BASE}/test-cases${query ? `?${query}` : ''}`),
  });
}

export function useActiveTerminology() {
  return useQuery({
    queryKey: clinicalRepoKeys.terminology(),
    queryFn: () =>
      api.get<TerminologyActiveSummary>(`${BASE}/terminology/active`),
    staleTime: 30_000,
  });
}

export function useTerminologyConcepts(params: {
  page?: number;
  limit?: number;
  search?: string;
  conceptType?: string;
  enabled?: boolean;
} = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.conceptType) qs.set('conceptType', params.conceptType);
  const query = qs.toString();
  return useQuery({
    queryKey: clinicalRepoKeys.terminologyConcepts(params),
    queryFn: () =>
      api.get<{
        data: TerminologyConceptRow[];
        meta: { total: number; page: number; limit: number; totalPages: number };
        releaseId: string | null;
      }>(`${BASE}/terminology/concepts${query ? `?${query}` : ''}`),
    enabled: params.enabled !== false,
    staleTime: 20_000,
  });
}

export function useTerminologyReleases(enabled = true) {
  return useQuery({
    queryKey: clinicalRepoKeys.terminologyReleases(),
    queryFn: () =>
      api.get<TerminologyReleaseRow[]>(`${BASE}/terminology/releases?limit=20`),
    enabled,
    staleTime: 30_000,
  });
}

export function useSnapshotTerminology() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queries?: string[]) =>
      api.post<{
        releaseId: string;
        results: Array<{ query: string; conceptId: string | null; status: string }>;
        ok: number;
        failed: number;
        summary: TerminologyActiveSummary;
      }>(`${BASE}/terminology/snapshot`, queries ? { queries } : {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clinicalRepoKeys.terminology() });
      void qc.invalidateQueries({
        queryKey: [...clinicalRepoKeys.all, 'terminology-concepts'],
      });
      void qc.invalidateQueries({
        queryKey: clinicalRepoKeys.terminologyReleases(),
      });
    },
  });
}

export function useClinicalPreflight(enabled = false) {
  return useQuery({
    queryKey: clinicalRepoKeys.preflight(),
    queryFn: () =>
      api.get<{
        ok: boolean;
        checks: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
      }>(`${BASE}/releases/preflight`),
    enabled,
    staleTime: 15_000,
  });
}

export function useRunClinicalTests() {
  return useMutation({
    mutationFn: () =>
      api.post<{
        runId: string;
        total: number;
        passed: number;
        failed: number;
        criticalFailed: number;
        highFailed: number;
        ok: boolean;
      }>(`${BASE}/test-runs`, {}),
  });
}

export function usePublishClinicalRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { releaseNotes?: string } | void) =>
      api.post(`${BASE}/releases/publish`, {
        releaseNotes: opts && typeof opts === 'object' ? opts.releaseNotes : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clinicalRepoKeys.all });
      qc.invalidateQueries({ queryKey: ['safety-engine'] });
    },
  });
}

export function useClinicalReleases(params: { page?: number; limit?: number } = {}, enabled = true) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: clinicalRepoKeys.releases(params),
    queryFn: () =>
      api.get<{
        data: KnowledgeReleaseRow[];
        meta: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
          activeReleaseId: string | null;
        };
      }>(`${BASE}/releases${query ? `?${query}` : ''}`),
    enabled,
    staleTime: 15_000,
  });
}

export function useRestoreClinicalRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, reason }: { releaseId: string; reason?: string }) =>
      api.post<{
        restored: { id: string; version: string; ruleCount: number };
        previous: { id: string; version: string } | null;
        message: string;
      }>(`${BASE}/releases/${releaseId}/restore`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clinicalRepoKeys.all });
      qc.invalidateQueries({ queryKey: ['safety-engine'] });
    },
  });
}

export type RenewWorkflowDataset = 'indications' | 'monitoring' | 'inputs' | 'questions';

export function datasetKeyToRenewWorkflow(
  key: string,
): RenewWorkflowDataset | null {
  if (key === 'renew-medication-indications') return 'indications';
  if (key === 'renew-monitoring-rules') return 'monitoring';
  if (key === 'renew-input-definitions') return 'inputs';
  if (key === 'renew-conditional-questions') return 'questions';
  return null;
}

export function useRenewWorkflowCounts() {
  return useQuery({
    queryKey: [...clinicalRepoKeys.all, 'renew-workflow-counts'] as const,
    queryFn: () =>
      api.get<{ indications: number; monitoring: number; inputs: number; questions: number }>(
        `${BASE}/renew-workflow/counts`,
      ),
    staleTime: 15_000,
  });
}

export function useRenewWorkflowRows(
  dataset: RenewWorkflowDataset,
  params: { page?: number; limit?: number; search?: string } = {},
  enabled = true,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  const query = qs.toString();
  return useQuery({
    queryKey: [...clinicalRepoKeys.all, 'renew-workflow', dataset, params] as const,
    queryFn: () =>
      api.get<{ data: Record<string, unknown>[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `${BASE}/renew-workflow/${dataset}${query ? `?${query}` : ''}`,
      ),
    enabled,
  });
}
