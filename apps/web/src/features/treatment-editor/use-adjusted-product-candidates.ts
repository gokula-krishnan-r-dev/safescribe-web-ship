import { useMutation } from '@tanstack/react-query';
import { api, type ApiError } from '@/lib/api-client';
import type { CompatibleProductCandidate } from '@safescript/shared';

export interface AdjustedProductSelectionContext {
  recommendationId: string;
  recommendationType: 'RENAL';
  treatmentKey: string;
  currentRegimenLabel: 'Current pathway regimen' | 'Current prescribed regimen';
  currentProductDisplay: string;
  currentRegimenDisplay: { primary: string };
  adjustedRegimenDisplay: { primary: string; supporting?: string };
  generatedSearchText: string;
  preferredCandidateId?: string;
  candidates: CompatibleProductCandidate[];
}

export function adjustedProductErrorMessage(error: unknown): string {
  const apiError = error as ApiError | undefined;
  const raw = apiError?.message;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'message' in raw) {
    return String((raw as { message?: string }).message ?? '');
  }
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return 'Compatible products could not be loaded. Check your connection and try again.';
}

export function adjustedProductErrorCode(error: unknown): string | undefined {
  const apiError = error as ApiError | undefined;
  const raw = apiError?.message;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'code' in raw) {
    return String((raw as { code?: string }).code ?? '');
  }
  return apiError?.code;
}

export function useAdjustedProductCandidates() {
  return useMutation({
    mutationFn: (input: {
      consultationId: string;
      treatmentKey: string;
      query?: string | null;
      recommendationId?: string | null;
    }) =>
      api.post<AdjustedProductSelectionContext>(
        `/consultations/${input.consultationId}/treatments/${encodeURIComponent(input.treatmentKey)}/adjusted-product-candidates`,
        {
          treatmentKey: input.treatmentKey,
          ...(input.query != null && input.query !== '' ? { query: input.query } : {}),
          ...(input.recommendationId ? { recommendationId: input.recommendationId } : {}),
        },
      ),
  });
}
