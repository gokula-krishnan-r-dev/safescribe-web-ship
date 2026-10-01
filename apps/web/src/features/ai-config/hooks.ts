'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AiConfigCatalog, ApplyAiConfigPayload } from './types';

const BASE = '/admin/ai-config';

export const aiConfigKeys = {
  all: ['ai-config'] as const,
  catalog: () => [...aiConfigKeys.all, 'catalog'] as const,
};

export function useAiConfigCatalog() {
  return useQuery({
    queryKey: aiConfigKeys.catalog(),
    queryFn: () => api.get<AiConfigCatalog>(BASE),
    staleTime: 15_000,
  });
}

export function useApplyAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApplyAiConfigPayload) =>
      api.post<{
        message: string;
        aiEngineSynced: boolean;
        aiEngineMessage?: string;
        catalog: AiConfigCatalog;
      }>(`${BASE}/apply`, payload),
    onSuccess: (data) => {
      qc.setQueryData(aiConfigKeys.catalog(), data.catalog);
    },
  });
}

export function useResetAiPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api.post<{ message: string; catalog: AiConfigCatalog }>(`${BASE}/reset`, { key }),
    onSuccess: (data) => {
      qc.setQueryData(aiConfigKeys.catalog(), data.catalog);
    },
  });
}

export function useResetAllAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ message: string; catalog: AiConfigCatalog }>(`${BASE}/reset-all`, {}),
    onSuccess: (data) => {
      qc.setQueryData(aiConfigKeys.catalog(), data.catalog);
    },
  });
}
