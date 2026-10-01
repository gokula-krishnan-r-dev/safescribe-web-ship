'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { SectionVisibility } from '@safescript/shared';
import type {
  ClinicalPathway,
  PaginatedPathways,
  PathwayEvidenceReference,
  PathwayStats,
  RedFlag,
  DifferentialDiagnosis,
} from './types';

const BASE = '/clinical-pathways';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const pathwayKeys = {
  all: ['clinical-pathways'] as const,
  lists: () => [...pathwayKeys.all, 'list'] as const,
  list: (params: object) => [...pathwayKeys.lists(), params] as const,
  detail: (id: string) => [...pathwayKeys.all, 'detail', id] as const,
  stats: () => [...pathwayKeys.all, 'stats'] as const,
};

// ─── List & Stats ─────────────────────────────────────────────────────────────

export function usePathways(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  province?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  return useQuery({
    queryKey: pathwayKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      });
      return api.get<PaginatedPathways>(`${BASE}?${qs}`);
    },
  });
}

export function usePathwayStats() {
  return useQuery({
    queryKey: pathwayKeys.stats(),
    queryFn: () => api.get<PathwayStats>(`${BASE}/stats`),
  });
}

// ─── Single Pathway ───────────────────────────────────────────────────────────

export function usePathway(id: string) {
  return useQuery({
    queryKey: pathwayKeys.detail(id),
    queryFn: () => api.get<ClinicalPathway>(`${BASE}/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as ClinicalPathway | undefined;
      if (!data) return false;
      if (data.status === 'AI_PROCESSING') return 4000;
      const stage = data.pipelineStage;
      if (
        stage === 'CLASSIFYING' ||
        stage === 'EXTRACTING_CONCEPTS' ||
        stage === 'GENERATING'
      ) {
        return 4000;
      }
      return false;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreatePathway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      condition: string;
      province: string;
      provinceAvailability?: string;
      category: string;
      description?: string;
      notes?: string;
    }) => api.post<ClinicalPathway>(BASE, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.lists() }),
  });
}

export function useUpdatePathway(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<{
      name: string;
      condition: string;
      province: string;
      category: string;
      description: string;
      notes: string;
      provinceAvailability: string;
      ageMin: number | null;
      ageMax: number | null;
      pharmacistPrescribingEligible: boolean;
      requiresPhysicalExam: 'NEVER' | 'OPTIONAL' | 'REQUIRED';
      requiresLabResults: 'NEVER' | 'OPTIONAL' | 'REQUIRED';
      requiresFollowUp: boolean;
      guidelineSource: string;
      lastClinicalReview: string | null;
      assessmentSectionsEnabled: {
        diagnosisConfirmation?: boolean;
        additionalAssessment?: boolean;
        treatmentEligibility?: boolean;
      };
      customAssessment?: {
        displayName?: string;
        visibility?: SectionVisibility | null;
      };
      routingAliases?: string[];
      routingPresentingComplaints?: string[];
      routingContextTerms?: string[];
      routingDescription?: string | null;
    }>) => api.patch<ClinicalPathway>(`${BASE}/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pathwayKeys.detail(id) });
      qc.invalidateQueries({ queryKey: pathwayKeys.lists() });
    },
  });
}

export function useGenerateRoutingSuggestions(id: string) {
  return useMutation({
    mutationFn: () =>
      api.post<{
        aliases: string[];
        presentingComplaints: string[];
        contextTerms: string[];
        description: string;
        suggestedKeys: string[];
      }>(`${BASE}/${id}/generate-routing-suggestions`, {}),
  });
}

export function useUpdatePathwayStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { status: string; reason?: string }) =>
      api.patch<ClinicalPathway>(`${BASE}/${id}/status`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pathwayKeys.detail(id) });
      qc.invalidateQueries({ queryKey: pathwayKeys.lists() });
      qc.invalidateQueries({ queryKey: pathwayKeys.stats() });
    },
  });
}

export function usePublishPathway(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { notes?: string }) =>
      api.post<ClinicalPathway>(`${BASE}/${id}/publish`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pathwayKeys.detail(id) });
      qc.invalidateQueries({ queryKey: pathwayKeys.lists() });
      qc.invalidateQueries({ queryKey: pathwayKeys.stats() });
    },
  });
}

export function useRegeneratePathway(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { instructions?: string; reparseDocuments?: boolean }) =>
      api.post(`${BASE}/${id}/regenerate`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(id) }),
  });
}

export function useConfirmDocumentRoles(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      roles: Array<{ documentId: string; role: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE_ONLY' }>;
      startExtraction?: boolean;
    }) => api.post(`${BASE}/${pathwayId}/documents/confirm-roles`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useExtractConcepts(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${BASE}/${pathwayId}/extract-concepts`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useRegenerateFromConcepts(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: { limits?: Record<string, number> }) =>
      api.post(`${BASE}/${pathwayId}/regenerate-from-concepts`, data ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useApproveClinicalReview(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${BASE}/${pathwayId}/clinical-review/approve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) });
      qc.invalidateQueries({ queryKey: pathwayKeys.lists() });
    },
  });
}

export function useUpdateConcept(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      conceptId,
      ...data
    }: {
      conceptId: string;
      label?: string;
      description?: string | null;
      category?: string;
      importance?: string | null;
      approved?: boolean;
    }) => api.patch(`${BASE}/${pathwayId}/concepts/${conceptId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeleteConcept(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conceptId: string) => api.delete(`${BASE}/${pathwayId}/concepts/${conceptId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useCurateConcepts(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ kept: number; removed: number; max: number }>(
        `${BASE}/${pathwayId}/concepts/curate`,
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useMergeConcepts(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      targetConceptId: string;
      sourceConceptIds: string[];
      canonicalLabel?: string;
    }) => api.post(`${BASE}/${pathwayId}/concepts/merge`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeletePathway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.lists() }),
  });
}

// ─── Document Upload ──────────────────────────────────────────────────────────

export function useUploadDocuments(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      return api.upload<{ documents: { documentId: string; status: string }[]; status: string }>(
        `${BASE}/${pathwayId}/upload`,
        form,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

/** @deprecated use useUploadDocuments */
export function useUploadDocument(pathwayId: string) {
  const inner = useUploadDocuments(pathwayId);
  return {
    ...inner,
    mutateAsync: (file: File) => inner.mutateAsync([file]),
  };
}

// ─── Questions ────────────────────────────────────────────────────────────────

export function useCreateQuestion(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      question: string;
      type: string;
      required: boolean;
      sectionId?: string;
      sectionName?: string;
      description?: string;
      helpText?: string;
      displayOrder?: number;
      options?: { label: string; value: string }[];
      visibilityRule?: {
        sourceField: string;
        operator: string;
        value: unknown;
        label?: string;
      };
    }) => api.post(`${BASE}/${pathwayId}/questions`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useCreateEvidenceReference(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      citationTitle: string;
      organization: string;
      edition?: string;
      publicationYear?: number;
      url?: string;
      doi?: string;
      documentType: string;
      jurisdiction: string;
      referenceType?: string;
      status?: string;
      verifiedBy?: string;
      verificationDate?: string;
    }) => api.post<PathwayEvidenceReference>(`${BASE}/${pathwayId}/evidence-references`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useLinkEvidenceFromLibrary(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (libraryItemId: string) =>
      api.post<PathwayEvidenceReference>(
        `${BASE}/${pathwayId}/evidence-references/link-from-library`,
        { libraryItemId },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdateEvidenceReference(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      referenceId,
      data,
    }: {
      referenceId: string;
      data: Record<string, unknown>;
    }) => api.patch(`${BASE}/${pathwayId}/evidence-references/${referenceId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeleteEvidenceReference(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (referenceId: string) =>
      api.delete(`${BASE}/${pathwayId}/evidence-references/${referenceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDuplicateEvidenceReference(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (referenceId: string) =>
      api.post(`${BASE}/${pathwayId}/evidence-references/${referenceId}/duplicate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useArchiveEvidenceReference(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (referenceId: string) =>
      api.post(`${BASE}/${pathwayId}/evidence-references/${referenceId}/archive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useReplaceEvidenceMappings(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      referenceId,
      mappings,
    }: {
      referenceId: string;
      mappings: Array<{
        section: string;
        mappingType: string;
        targetId?: string | null;
        suggested?: boolean;
      }>;
    }) =>
      api.put(`${BASE}/${pathwayId}/evidence-references/${referenceId}/mappings`, { mappings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdatePathwayGovernance(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      internalReviewStatus?: string;
      externalPeerReviewStatus?: string;
      lastReviewedAt?: string | null;
      nextReviewDueAt?: string | null;
      primaryDocumentationReferenceId?: string | null;
      secondaryDocumentationReferenceId?: string | null;
    }) => api.patch(`${BASE}/${pathwayId}/governance`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useCreatePathwayReviewer(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      reviewerType: string;
      name: string;
      credentials: string;
      organization?: string;
      role: string;
      reviewedAreas: string[];
      reviewDate: string;
      notes?: string;
    }) => api.post(`${BASE}/${pathwayId}/reviewers`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useLinkReviewerFromLibrary(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      libraryReviewerId: string;
      reviewerType: string;
      reviewedAreas: string[];
      reviewDate: string;
      notes?: string;
    }) => api.post(`${BASE}/${pathwayId}/reviewers/link-from-library`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdatePathwayReviewer(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewerId,
      data,
    }: {
      reviewerId: string;
      data: Record<string, unknown>;
    }) => api.patch(`${BASE}/${pathwayId}/reviewers/${reviewerId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeletePathwayReviewer(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewerId: string) =>
      api.delete(`${BASE}/${pathwayId}/reviewers/${reviewerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdatePresentationReviewSection(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sectionEvidenceRefIds: string[] }) =>
      api.patch(`${BASE}/${pathwayId}/presentation-review`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useImportQuestionScript(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace_section';
      sections?: Array<
        'diagnosisConfirmation' | 'additionalAssessment' | 'treatmentEligibility'
      >;
      useAiFallback?: boolean;
    }) =>
      api.post<{
        imported: number;
        skipped: number;
        bySection: Record<string, number>;
        parseSource: string;
        totalParsed: number;
        mode: string;
      }>(`${BASE}/${pathwayId}/questions/import-script`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useImportChatGptScript(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      target:
        | 'overview'
        | 'concepts'
        | 'assessment'
        | 'red-flags'
        | 'differentials'
        | 'rules'
        | 'treatments'
        | 'counselling'
        | 'references';
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      sections?: Array<
        'diagnosisConfirmation' | 'additionalAssessment' | 'treatmentEligibility'
      >;
      useAiFallback?: boolean;
    }) =>
      api.post<{
        target: string;
        imported: number;
        skipped: number;
        created?: number;
        matched?: number;
        parseSource?: string;
        mode?: string;
        bySection?: Record<string, number>;
        duplicateReviewNeeded?: boolean;
        message?: string;
        reviewerGovernanceIgnored?: boolean;
      }>(`${BASE}/${pathwayId}/import-chatgpt`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function usePreviewReferencesImport(pathwayId: string) {
  return useMutation({
    mutationFn: (data: { text?: string; fileBase64?: string; fileName?: string }) =>
      api.post<import('./references-governance/references-import-preview').ReferenceImportPreview>(
        `${BASE}/${pathwayId}/evidence-references/import-chatgpt/preview`,
        data,
      ),
  });
}

export function useCommitReferencesImport(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      decisions: Array<{
        importKey: string;
        action: 'use_existing' | 'create_new' | 'skip';
        existingReferenceId?: string;
      }>;
    }) =>
      api.post<{
        imported: number;
        created: number;
        matched: number;
        skipped: number;
        message: string;
        reviewerGovernanceIgnored?: boolean;
      }>(`${BASE}/${pathwayId}/evidence-references/import-chatgpt/commit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

/** Alias for References & Governance ChatGPT import. */
export function useImportReferencesChatGpt(pathwayId: string) {
  return useImportChatGptScript(pathwayId);
}

export function usePreviewPresentationReviewImport(pathwayId: string) {
  return useMutation({
    mutationFn: (data: { text?: string; fileBase64?: string; fileName?: string }) =>
      api.post<
        import('./presentation-review/presentation-review-import-preview').PresentationReviewImportPreview
      >(`${BASE}/${pathwayId}/presentation-review/import-chatgpt/preview`, data),
  });
}

export function useCommitPresentationReviewImport(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      confirmedReplace?: boolean;
      decisions?: Array<{
        importKey: string;
        action: 'use_existing' | 'create_new' | 'skip';
        existingReferenceId?: string;
      }>;
      skipQuestionKeys?: string[];
    }) =>
      api.post<{
        imported: number;
        skipped: number;
        message?: string;
        duplicateReviewNeeded?: boolean;
      }>(`${BASE}/${pathwayId}/presentation-review/import-chatgpt/commit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function usePreviewRedFlagsImport(pathwayId: string) {
  return useMutation({
    mutationFn: (data: { text?: string; fileBase64?: string; fileName?: string }) =>
      api.post<import('./red-flags/red-flags-import-preview').RedFlagsImportPreview>(
        `${BASE}/${pathwayId}/red-flags/import-chatgpt/preview`,
        data,
      ),
  });
}

export function useCommitRedFlagsImport(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      confirmedReplace?: boolean;
      decisions?: Array<{
        importKey: string;
        action: 'use_existing' | 'create_new' | 'skip';
        existingReferenceId?: string;
      }>;
      skipFlagKeys?: string[];
    }) =>
      api.post<{
        imported: number;
        skipped: number;
        message?: string;
      }>(`${BASE}/${pathwayId}/red-flags/import-chatgpt/commit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function usePreviewDifferentialsImport(pathwayId: string) {
  return useMutation({
    mutationFn: (data: { text?: string; fileBase64?: string; fileName?: string }) =>
      api.post<import('./differentials/differentials-import-preview').DifferentialsImportPreview>(
        `${BASE}/${pathwayId}/differentials/import-chatgpt/preview`,
        data,
      ),
  });
}

export function useCommitDifferentialsImport(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      confirmedReplace?: boolean;
      decisions?: Array<{
        importKey: string;
        action: 'use_existing' | 'create_new' | 'skip';
        existingReferenceId?: string;
      }>;
      skipDifferentialKeys?: string[];
    }) =>
      api.post<{
        imported: number;
        skipped: number;
        message?: string;
      }>(`${BASE}/${pathwayId}/differentials/import-chatgpt/commit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function usePreviewTreatmentsImport(pathwayId: string) {
  return useMutation({
    mutationFn: (data: { text?: string; fileBase64?: string; fileName?: string }) =>
      api.post<import('./treatments/treatments-import-preview').TreatmentsImportPreview>(
        `${BASE}/${pathwayId}/treatments/import-chatgpt/preview`,
        data,
      ),
  });
}

export function useCommitTreatmentsImport(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      confirmedReplace?: boolean;
      decisions?: Array<{
        importKey: string;
        action: 'use_existing' | 'create_new' | 'skip';
        existingReferenceId?: string;
      }>;
      skipTreatmentKeys?: string[];
    }) =>
      api.post<{
        imported: number;
        skipped: number;
        message?: string;
      }>(`${BASE}/${pathwayId}/treatments/import-chatgpt/commit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdateQuestion(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, data }: { questionId: string; data: Record<string, unknown> }) =>
      api.patch(`${BASE}/${pathwayId}/questions/${questionId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeleteQuestion(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) => api.delete(`${BASE}/${pathwayId}/questions/${questionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useApproveAllQuestions(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${BASE}/${pathwayId}/questions/approve-all`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useReorderQuestions(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.put(`${BASE}/${pathwayId}/questions/reorder`, { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useBulkApproveQuestions(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`${BASE}/${pathwayId}/questions/bulk-approve`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useBulkDeleteQuestions(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`${BASE}/${pathwayId}/questions/bulk-delete`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

// ─── Red Flags ────────────────────────────────────────────────────────────────

export type RedFlagInput = Partial<
  Pick<
    RedFlag,
    | 'id'
    | 'description'
    | 'question'
    | 'whyItMatters'
    | 'actionNote'
    | 'action'
    | 'required'
    | 'approved'
    | 'evidenceRefIds'
  >
> & {
  title: string;
  severity: RedFlag['severity'];
};

export function useUpdateRedFlags(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { redFlags: RedFlagInput[]; sectionEvidenceRefIds?: string[] }) =>
      api.put(`${BASE}/${pathwayId}/red-flags`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

// ─── Differential Diagnoses ─────────────────────────────────────────────────────

export type DifferentialInput = Partial<
  Pick<
    DifferentialDiagnosis,
    | 'id'
    | 'question'
    | 'whyItMatters'
    | 'suggestedPathway'
    | 'distinguishingFeatures'
    | 'keySymptoms'
    | 'recommendedAction'
    | 'likelihood'
    | 'required'
    | 'evidenceRefIds'
  >
> & {
  condition: string;
};

export function useUpdateDifferentials(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      differentials: DifferentialInput[];
      sectionEvidenceRefIds?: string[];
    }) => api.put(`${BASE}/${pathwayId}/differentials`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export function useCreateRule(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`${BASE}/${pathwayId}/rules`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdateRule(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Record<string, unknown> }) =>
      api.patch(`${BASE}/${pathwayId}/rules/${ruleId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeleteRule(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => api.delete(`${BASE}/${pathwayId}/rules/${ruleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

// ─── Treatments ───────────────────────────────────────────────────────────────

export function useCreateTreatment(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`${BASE}/${pathwayId}/treatments`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdateTreatment(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ treatmentId, data }: { treatmentId: string; data: Record<string, unknown> }) =>
      api.patch(`${BASE}/${pathwayId}/treatments/${treatmentId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdateTreatmentSectionEvidence(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceRefIds: string[]) =>
      api.put(`${BASE}/${pathwayId}/treatments/section-evidence`, { evidenceRefIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeleteTreatment(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (treatmentId: string) => api.delete(`${BASE}/${pathwayId}/treatments/${treatmentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useReorderTreatments(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.put(`${BASE}/${pathwayId}/treatments/reorder`, { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useBulkApproveTreatments(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`${BASE}/${pathwayId}/treatments/bulk-approve`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useBulkDeleteTreatments(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`${BASE}/${pathwayId}/treatments/bulk-delete`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useArchiveTreatment(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ treatmentId, restore }: { treatmentId: string; restore?: boolean }) =>
      api.post(
        `${BASE}/${pathwayId}/treatments/${treatmentId}/${restore ? 'restore' : 'archive'}`,
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function usePreviewTreatmentsExcel(pathwayId: string) {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<{
        valid: boolean;
        errors: Array<{ sheet: string; row?: number; message: string }>;
        preview: Array<{
          row: number;
          medicationName: string;
          status: 'valid' | 'error';
          messages: string[];
        }>;
        rowCount: number;
      }>(`${BASE}/${pathwayId}/treatments/import/preview`, form);
    },
  });
}

export function useImportTreatmentsExcel(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<{
        created: number;
        treatments: Array<{ id: string; medicationName: string }>;
      }>(`${BASE}/${pathwayId}/treatments/import`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

// ─── Counselling ──────────────────────────────────────────────────────────────

export function useCreateCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post(`${BASE}/${pathwayId}/counselling`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useUpdateCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) =>
      api.patch(`${BASE}/${pathwayId}/counselling/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useDeleteCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.delete(`${BASE}/${pathwayId}/counselling/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useRestoreCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post(`${BASE}/${pathwayId}/counselling/${itemId}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useReorderCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderedIds: string[]; outputSection?: string }) =>
      api.put(`${BASE}/${pathwayId}/counselling/reorder`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useBulkApproveCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`${BASE}/${pathwayId}/counselling/bulk-approve`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}

export function useBulkDeleteCounselling(pathwayId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post(`${BASE}/${pathwayId}/counselling/bulk-delete`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathwayKeys.detail(pathwayId) }),
  });
}
