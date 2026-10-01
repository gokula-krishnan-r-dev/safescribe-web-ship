'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { QuickAddResponse, QuickAddSource, RecordQuickAddUsageInput } from './quick-add';

export const quickAddKeys = {
  all: (consultationId: string) =>
    ['consultations', consultationId, 'treatments', 'quick-add'] as const,
  list: (consultationId: string, source: QuickAddSource, limit: number) =>
    [...quickAddKeys.all(consultationId), source, limit] as const,
};

export function useTreatmentQuickAdd(
  consultationId: string | undefined,
  source: QuickAddSource,
  limit: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: quickAddKeys.list(consultationId ?? '', source, limit),
    queryFn: () =>
      api.get<QuickAddResponse>(
        `/consultations/${consultationId}/treatments/quick-add?source=${source}&limit=${limit}`,
      ),
    enabled: Boolean(consultationId) && enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useRecordQuickAddUsage(consultationId: string | undefined) {
  return useMutation({
    mutationFn: (body: RecordQuickAddUsageInput) =>
      api.post<{ recorded: boolean }>(
        `/consultations/${consultationId}/treatments/quick-add/usage`,
        body,
      ),
  });
}
