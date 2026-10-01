'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { PathwayQaRun, PathwayQaRunList, PathwayQaWorkbook } from './types';

const BASE = '/pathway-qa';

export const pathwayQaKeys = {
  all: ['pathway-qa'] as const,
  workbooks: () => [...pathwayQaKeys.all, 'workbooks'] as const,
  runs: (params: object) => [...pathwayQaKeys.all, 'runs', params] as const,
  run: (id: string) => [...pathwayQaKeys.all, 'run', id] as const,
  latest: (pathwayId: string) => [...pathwayQaKeys.all, 'latest', pathwayId] as const,
};

export function usePathwayQaWorkbooks() {
  return useQuery<PathwayQaWorkbook[]>({
    queryKey: pathwayQaKeys.workbooks(),
    queryFn: () => api.get<PathwayQaWorkbook[]>(`${BASE}/workbooks`),
  });
}

export function usePathwayQaRuns(params: { pathwayId?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params.pathwayId) qs.set('pathwayId', params.pathwayId);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return useQuery<PathwayQaRunList>({
    queryKey: pathwayQaKeys.runs(params),
    queryFn: () => api.get<PathwayQaRunList>(`${BASE}/runs?${qs}`),
  });
}

export function usePathwayQaRun(id: string | null) {
  return useQuery<PathwayQaRun>({
    queryKey: pathwayQaKeys.run(id ?? ''),
    queryFn: () => api.get<PathwayQaRun>(`${BASE}/runs/${id}`),
    enabled: Boolean(id),
  });
}

export function useLatestPathwayQaRun(pathwayId: string | null) {
  return useQuery<PathwayQaRun | null>({
    queryKey: pathwayQaKeys.latest(pathwayId ?? ''),
    queryFn: () => api.get<PathwayQaRun | null>(`${BASE}/pathways/${pathwayId}/latest`),
    enabled: Boolean(pathwayId),
  });
}

export function useUploadPathwayQaWorkbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<PathwayQaWorkbook>(`${BASE}/workbooks`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayQaKeys.workbooks() }),
  });
}

export function useRunPathwayQa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { pathwayId: string; workbookId?: string; file?: File }) => {
      const form = new FormData();
      form.append('pathwayId', input.pathwayId);
      if (input.workbookId) form.append('workbookId', input.workbookId);
      if (input.file) form.append('file', input.file);
      return api.upload<PathwayQaRun>(`${BASE}/runs`, form);
    },
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: pathwayQaKeys.all });
      qc.setQueryData(pathwayQaKeys.run(run.id), run);
    },
  });
}
