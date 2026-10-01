'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type {
  ApplyDocFormatsPayload,
  DocFormatCatalog,
  DocFormatPreviewResult,
  PublishedDocFormat,
} from './types';

const ADMIN_BASE = '/admin/doc-formats';
const PUBLIC_BASE = '/doc-formats';

export const docFormatKeys = {
  all: ['doc-formats'] as const,
  catalog: () => [...docFormatKeys.all, 'catalog'] as const,
  published: () => [...docFormatKeys.all, 'published'] as const,
};

export function useDocFormatCatalog() {
  return useQuery({
    queryKey: docFormatKeys.catalog(),
    queryFn: () => api.get<DocFormatCatalog>(ADMIN_BASE),
    staleTime: 15_000,
  });
}

export function usePublishedDocFormats() {
  return useQuery({
    queryKey: docFormatKeys.published(),
    queryFn: () => api.get<PublishedDocFormat[]>(PUBLIC_BASE),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useApplyDocFormats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApplyDocFormatsPayload) =>
      api.post<{ message: string; catalog: DocFormatCatalog }>(`${ADMIN_BASE}/apply`, payload),
    onSuccess: (data) => {
      qc.setQueryData(docFormatKeys.catalog(), data.catalog);
      void qc.invalidateQueries({ queryKey: docFormatKeys.published() });
    },
  });
}

export function useResetDocFormat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api.post<{ message: string; catalog: DocFormatCatalog }>(`${ADMIN_BASE}/reset`, { key }),
    onSuccess: (data) => {
      qc.setQueryData(docFormatKeys.catalog(), data.catalog);
      void qc.invalidateQueries({ queryKey: docFormatKeys.published() });
    },
  });
}

export function useResetAllDocFormats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ message: string; catalog: DocFormatCatalog }>(`${ADMIN_BASE}/reset-all`, {}),
    onSuccess: (data) => {
      qc.setQueryData(docFormatKeys.catalog(), data.catalog);
      void qc.invalidateQueries({ queryKey: docFormatKeys.published() });
    },
  });
}

export function usePreviewDocFormat() {
  return useMutation({
    mutationFn: (payload: {
      key: string;
      aiPrompt?: string;
      styleNotes?: string;
      exampleOutput?: string;
      pdfLayout?: import('./types').PdfLayoutConfig;
    }) => api.post<DocFormatPreviewResult>(`${ADMIN_BASE}/preview`, payload),
  });
}
