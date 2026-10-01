'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { LibraryListResponse, ReferenceLibraryItem, ReviewerLibraryItem } from './types';

export const referenceLibraryKeys = {
  all: ['reference-library'] as const,
  lists: () => [...referenceLibraryKeys.all, 'list'] as const,
  list: (params: object) => [...referenceLibraryKeys.lists(), params] as const,
  search: (params: object) => [...referenceLibraryKeys.all, 'search', params] as const,
};

export const reviewerLibraryKeys = {
  all: ['reviewer-library'] as const,
  lists: () => [...reviewerLibraryKeys.all, 'list'] as const,
  list: (params: object) => [...reviewerLibraryKeys.lists(), params] as const,
  search: (params: object) => [...reviewerLibraryKeys.all, 'search', params] as const,
};

function toQs(params: Record<string, unknown>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  return qs.toString();
}

export function useReferenceLibraryList(params: Record<string, unknown>) {
  return useQuery({
    queryKey: referenceLibraryKeys.list(params),
    queryFn: () =>
      api.get<LibraryListResponse<ReferenceLibraryItem>>(`/reference-library?${toQs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useReferenceLibrarySearch(
  params: { q?: string; pathwayId?: string; page?: number },
  enabled = false,
) {
  return useQuery({
    queryKey: referenceLibraryKeys.search(params),
    queryFn: () =>
      api.get<LibraryListResponse<ReferenceLibraryItem>>(`/reference-library/search?${toQs(params)}`),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function useSaveReferenceLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch<ReferenceLibraryItem>(`/reference-library/${payload.id}`, payload.data)
        : api.post<ReferenceLibraryItem>('/reference-library', payload.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: referenceLibraryKeys.all });
    },
  });
}

export function useRetireReferenceLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore?: boolean }) =>
      api.post<ReferenceLibraryItem>(
        restore ? `/reference-library/${id}/restore` : `/reference-library/${id}/retire`,
        {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: referenceLibraryKeys.all });
    },
  });
}

export function useReviewerLibraryList(params: Record<string, unknown>) {
  return useQuery({
    queryKey: reviewerLibraryKeys.list(params),
    queryFn: () =>
      api.get<LibraryListResponse<ReviewerLibraryItem>>(`/reviewer-library?${toQs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useReviewerLibrarySearch(
  params: { q?: string; pathwayId?: string; reviewerType?: string; page?: number },
  enabled = false,
) {
  return useQuery({
    queryKey: reviewerLibraryKeys.search(params),
    queryFn: () =>
      api.get<LibraryListResponse<ReviewerLibraryItem>>(`/reviewer-library/search?${toQs(params)}`),
    enabled,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function useSaveReviewerLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id?: string; data: Record<string, unknown> }) =>
      payload.id
        ? api.patch<ReviewerLibraryItem>(`/reviewer-library/${payload.id}`, payload.data)
        : api.post<ReviewerLibraryItem>('/reviewer-library', payload.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewerLibraryKeys.all });
    },
  });
}

export function useRetireReviewerLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore?: boolean }) =>
      api.post<ReviewerLibraryItem>(
        restore ? `/reviewer-library/${id}/restore` : `/reviewer-library/${id}/retire`,
        {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewerLibraryKeys.all });
    },
  });
}
