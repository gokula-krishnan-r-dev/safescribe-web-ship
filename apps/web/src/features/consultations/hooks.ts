'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Consultation, PaginatedConsultations } from './types';
import type { DrugSearchResult } from './medication-utils';
import { sanitizeDrugSearchResult } from './medication-utils';
import type {
  ActiveConsultationsResponse,
  EnsureWorkspaceResponse,
  RenewConditionCatalogItem,
} from '@safescript/shared';

const BASE = '/consultations';

export const consultationKeys = {
  all: ['consultations'] as const,
  lists: () => [...consultationKeys.all, 'list'] as const,
  list: (p: object) => [...consultationKeys.lists(), p] as const,
  active: () => [...consultationKeys.all, 'active'] as const,
  detail: (id: string) => [...consultationKeys.all, id] as const,
};

export function useConsultations(
  params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    activeSince?: string;
    enabled?: boolean;
  } = {},
) {
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: consultationKeys.list(queryParams),
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v != null) qs.set(k, String(v));
      });
      return api.get<PaginatedConsultations>(`${BASE}?${qs}`);
    },
    enabled,
  });
}

/** Active temporary consultations for the Prescribe work-queue sidebar. */
export function useActiveConsultations(
  opts: { enabled?: boolean; module?: 'prescribe' | 'renew' | 'adapt' } = {},
) {
  const { enabled = true, module = 'prescribe' } = opts;
  return useQuery({
    queryKey: [...consultationKeys.active(), module],
    queryFn: () =>
      api.get<ActiveConsultationsResponse>(`${BASE}/active?module=${module}`),
    enabled,
    staleTime: 10_000,
    // Catch midnight auto-deletion / multi-tab completion without a full refresh.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useConsultation(id: string | null) {
  return useQuery({
    queryKey: consultationKeys.detail(id ?? ''),
    queryFn: () => api.get<Consultation>(`${BASE}/${id}`),
    enabled: Boolean(id),
    staleTime: 5000,
  });
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Search the approved indication/condition master table for patient-history pickers.
 * Empty query returns curated `commonForRenewal` rows (never a hardcoded frontend list).
 */
export function useConditionCatalogSearch(
  consultationId: string | null | undefined,
  query: string,
  opts: { enabled?: boolean } = {},
) {
  const { enabled = true } = opts;
  const debounced = useDebouncedValue(query.trim(), 180);
  return useQuery({
    queryKey: ['condition-catalog', consultationId ?? '', debounced] as const,
    queryFn: () =>
      api.get<RenewConditionCatalogItem[]>(
        `${BASE}/${consultationId}/condition-catalog/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: Boolean(consultationId) && enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { module?: 'prescribe' | 'renew' | 'adapt' } | void) =>
      api.post<Consultation>(BASE, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
      qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });
}

/** Start a new consult (or reuse an unused blank draft). Safe to call on every login/landing. */
export function useEnsureWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { module?: 'prescribe' | 'renew' | 'adapt' } | void) =>
      api.post<EnsureWorkspaceResponse>(`${BASE}/workspace`, body ?? {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
      if (data.created) {
        qc.invalidateQueries({ queryKey: ['entitlements'] });
      }
    },
  });
}

export function useSaveStep(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { stepIndex: number; currentStep: string; data?: Record<string, unknown> }) =>
      api.patch<Consultation>(`${BASE}/${id}/step`, data),
    onSuccess: (data) => {
      qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) => {
        if (!prev) return data;
        return {
          ...prev,
          treatmentPlan: data.treatmentPlan ?? prev.treatmentPlan,
          counsellingNotes: data.counsellingNotes ?? prev.counsellingNotes,
          documentation: data.documentation ?? prev.documentation,
          demographics: data.demographics ?? prev.demographics,
          redFlags: data.redFlags ?? prev.redFlags,
          eligibility: data.eligibility ?? prev.eligibility,
          questionResponses: data.questionResponses ?? prev.questionResponses,
          renewPayload: data.renewPayload ?? prev.renewPayload,
          module: data.module ?? prev.module,
          stepIndex: data.stepIndex ?? prev.stepIndex,
          currentStep: data.currentStep ?? prev.currentStep,
          status: data.status ?? prev.status,
          chiefComplaint: data.chiefComplaint ?? prev.chiefComplaint,
          transcript: data.transcript ?? prev.transcript,
        };
      });
      void qc.invalidateQueries({ queryKey: consultationKeys.active() });
    },
  });
}

export function useUpdateTranscript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { transcript: string; chiefComplaint?: string; aiEntities?: Record<string, unknown> }) =>
      api.patch<Consultation>(`${BASE}/${id}/transcript`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useSelectPathway(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { pathwayId: string; aiSuggestions?: Record<string, unknown> }) =>
      api.patch<Consultation>(`${BASE}/${id}/pathway`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
      qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });
}

export function useSelectApproach(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      mode: 'GUIDED_PATHWAY' | 'CLINICAL_JUDGMENT';
      pathwayId?: string;
      aiSuggestions?: Record<string, unknown>;
    }) => api.put<Consultation & { nextRoute?: string }>(`${BASE}/${id}/approach`, data),
    onSuccess: (data) => {
      // Seed cache immediately so mode-aware stepper/list are correct before goNext
      qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) =>
        prev
          ? {
              ...prev,
              ...data,
              consultationMode:
                data.consultationMode ??
                (data as { consultationMode?: string }).consultationMode ??
                prev.consultationMode,
            }
          : data,
      );
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: consultationKeys.active() });
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
  });
}

export function useSaveClinicalImpression(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      workingDiagnosisText: string;
      diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';
      assessmentSummary?: string;
      assessmentSummarySource?: string;
      workingDiagnosisCode?: string;
      workingDiagnosisSystem?: string;
      confirm?: boolean;
      action?: 'SAVE_DRAFT' | 'CONFIRM_AND_CONTINUE';
    }) => api.put(`${BASE}/${id}/clinical-judgment/impression`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useGenerateAssessmentSummary(id: string) {
  return useMutation({
    mutationFn: (data?: {
      workingDiagnosisText?: string;
      diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';
    }) =>
      api.post<{
        summary: string;
        draft?: string;
        source: string;
        label: string;
        artifactId?: string;
      }>(`${BASE}/${id}/clinical-judgment/impression/generate-summary`, data ?? {}),
  });
}

export function useSavePrescribingReadiness(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      assessmentSufficient: boolean;
      unresolvedRedFlags?: boolean;
      reasonCodes?: string[];
      reasonDetail?: string;
      readinessReason?: string;
      nextAction?:
        | 'CONTINUE_TO_TREATMENT'
        | 'OBTAIN_OR_UPDATE_INFORMATION'
        | 'DOCUMENT_AND_REFER';
      returnTarget?: 'CLINICAL_IMPRESSION' | 'PATIENT_PROFILE' | 'RED_FLAG_CHECK';
      expectedSourceSnapshotHash?: string;
      expectedReadinessRowVersion?: number | null;
    }) =>
      api.put<{
        decision:
          | 'READY_TO_CONTINUE'
          | 'DOCUMENTATION_REFERRAL'
          | 'MORE_INFORMATION';
        nextRoute: string;
        status?: string;
        readinessId?: string;
        workflowState?: string;
        returnTarget?: string;
        rowVersion?: number;
      }>(`${BASE}/${id}/clinical-judgment/readiness`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function usePrescribingReadiness(id: string, enabled = true) {
  return useQuery({
    queryKey: [...consultationKeys.detail(id), 'prescribing-readiness'],
    queryFn: () =>
      api.get<{
        consultationId: string;
        mode: string;
        workflowState: string;
        blockingCode?: string | null;
        message?: string | null;
        nextRoute?: string;
        redFlagSummary?: {
          checkId: string;
          generationMode: string;
          status: string;
          questionCount: number;
          otherUnresolvedConcern: boolean;
          confirmedBy: { id: string; displayName: string } | null;
          confirmedAt: string | null;
          isCurrent: boolean;
          isManual?: boolean;
        } | null;
        readiness?: {
          id: string;
          status: string;
          assessmentSufficient: boolean | null;
          reasonCodes: string[];
          reasonDetail?: string | null;
          nextAction?: string | null;
          returnTarget?: string | null;
          sourceSnapshotHash?: string;
          rowVersion?: number | null;
          confirmedAt?: string | null;
        } | null;
        permissions?: { canConfirm: boolean; canRefer: boolean };
        nextAllowedRoutes?: string[];
      }>(`${BASE}/${id}/clinical-judgment/readiness`),
    enabled: Boolean(id) && enabled,
    staleTime: 15_000,
  });
}

export type CjRedFlagPage = {
  checkId: string | null;
  status: string;
  sourceSnapshotHash?: string;
  generationMode?: string | null;
  questions: Array<{
    id: string;
    sequence: number;
    candidateId?: string;
    question: string;
    whyItMatters: string;
    severity?: string;
    referralAction?: string;
    answer: string | null;
    sourceReferences?: unknown;
  }>;
  manualConcerns?: Array<{
    id: string;
    concernText: string;
    whyItMatters?: string | null;
    responseStatus: string;
    referralAction?: string | null;
  }>;
  otherUnresolvedConcern: boolean | null;
  otherConcernDetails?: string | null;
  rowVersion: number | null;
  isCurrent?: boolean;
  workingDiagnosis?: string;
  permissions?: { canGenerate: boolean; canConfirm: boolean; canRefer: boolean };
};

export function useCjRedFlags(id: string, enabled = true) {
  return useQuery({
    queryKey: [...consultationKeys.detail(id), 'cj-red-flags'],
    queryFn: () => api.get<CjRedFlagPage>(`${BASE}/${id}/clinical-judgment/red-flags`),
    enabled: Boolean(id) && enabled,
    staleTime: 10_000,
  });
}

export function useGenerateCjRedFlags(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      reason?: string;
      reasonDetail?: string | null;
      forceManualFallback?: boolean;
    }) =>
      api.post(`${BASE}/${id}/clinical-judgment/red-flags/generate`, data ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: [...consultationKeys.detail(id), 'cj-red-flags'],
      });
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
    },
  });
}

export function useSaveCjRedFlagAnswer(id: string) {
  const qc = useQueryClient();
  const key = [...consultationKeys.detail(id), 'cj-red-flags'];
  return useMutation({
    mutationFn: (data: {
      checkId: string;
      questionId: string;
      answer: 'NO' | 'YES';
      answerNotes?: string | null;
    }) =>
      api.put<CjRedFlagPage>(
        `${BASE}/${id}/clinical-judgment/red-flags/${data.checkId}/questions/${data.questionId}`,
        {
          answer: data.answer,
          answerNotes: data.answerNotes,
        },
      ),
    onSuccess: (page) => qc.setQueryData(key, page),
  });
}

export function useSaveCjRedFlagAttestation(id: string) {
  const qc = useQueryClient();
  const key = [...consultationKeys.detail(id), 'cj-red-flags'];
  return useMutation({
    mutationFn: ({
      checkId,
      ...body
    }: {
      checkId: string;
      otherUnresolvedConcern: boolean;
      otherConcernDetails?: string | null;
    }) =>
      api.put<CjRedFlagPage>(
        `${BASE}/${id}/clinical-judgment/red-flags/${checkId}/attestation`,
        body,
      ),
    onSuccess: (page) => qc.setQueryData(key, page),
  });
}

export function useAddCjRedFlagConcern(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      checkId,
      ...body
    }: {
      checkId: string;
      concernText: string;
      whyItMatters?: string | null;
      responseStatus?: string;
      referralAction?: string | null;
    }) =>
      api.post(
        `${BASE}/${id}/clinical-judgment/red-flags/${checkId}/concerns`,
        body,
      ),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: [...consultationKeys.detail(id), 'cj-red-flags'],
      }),
  });
}

export function useConfirmCjRedFlags(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      checkId,
      ...body
    }: {
      checkId: string;
      otherUnresolvedConcern: boolean;
      otherConcernDetails?: string | null;
      expectedCheckRowVersion?: number;
      expectedSourceSnapshotHash?: string;
      answers?: Array<{
        questionId: string;
        answer: 'NO' | 'YES';
      }>;
    }) =>
      api.post<{
        decision: string;
        workflowState: string;
        nextRoute: string;
        referralAction?: string;
      }>(
        `${BASE}/${id}/clinical-judgment/red-flags/${checkId}/confirm`,
        body,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      void qc.invalidateQueries({
        queryKey: [...consultationKeys.detail(id), 'cj-red-flags'],
      });
      void qc.invalidateQueries({
        queryKey: [...consultationKeys.detail(id), 'prescribing-readiness'],
      });
    },
  });
}

export function useTreatmentRationale(id: string, enabled = true) {
  return useQuery({
    queryKey: [...consultationKeys.detail(id), 'rationale'],
    queryFn: () => api.get(`${BASE}/${id}/rationale`),
    enabled: Boolean(id) && enabled,
  });
}

export function useSaveTreatmentRationale(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`${BASE}/${id}/rationale`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: [...consultationKeys.detail(id), 'rationale'] });
    },
  });
}

export function useGenerateRationale(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { section: string }) =>
      api.post(`${BASE}/${id}/rationale/generate`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: [...consultationKeys.detail(id), 'rationale'] });
    },
  });
}

export function useConfirmRationale(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`${BASE}/${id}/rationale/confirm`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: [...consultationKeys.detail(id), 'rationale'] });
    },
  });
}

export function useSubmitConsultation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Consultation>(`${BASE}/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useCompleteConsultation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { documentationConfirmed: true; clientRequestId?: string }) =>
      api.post<{ status: 'completed' | 'already_completed'; consultationId: string }>(
        `${BASE}/${id}/complete`,
        body,
      ),
    onSuccess: () => {
      // Stop refetch of the deleted row (would 404 the last-step success UI).
      void qc.cancelQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
    },
  });
}

export function useSaveReferralOutcome(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put<{
        referralOutcomeId: string;
        consultationId: string;
        status: 'draft' | 'completed';
        consultationOutcome: 'referred' | 'in_progress';
        displayOutcome: string;
        completedAt: string | null;
        documentationText: string;
        sourceRevision?: number;
        letterStatus?: string;
        letterApprovedSourceRevision?: number | null;
      }>(`${BASE}/${id}/referral-outcome`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
    },
  });
}

export type ReferralReasonDraftResponse = {
  draftReason: string;
  origin: 'AI_DRAFT' | 'RULE_TEMPLATE' | 'MANUAL';
  needsManualReason: boolean;
  approvedRequestSentence: string;
  usedReferralReasonIds: string[];
  usedFactIds: string[];
  sourceRevision: number;
  requestId: string;
  promptVersion: string | null;
  consultationId: string;
  referralId: string | null;
};

export function useDraftReferralReason(id: string) {
  return useMutation({
    mutationFn: (body: {
      destination?: string;
      destinationOtherText?: string;
      requestId?: string;
      sourceRevision?: number;
      redFlagsData?: Record<string, unknown>;
    }) => api.post<ReferralReasonDraftResponse>(`${BASE}/${id}/referral/reason-draft`, body),
  });
}

export function useCreateReferralLetter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown> = {}) =>
      api.post<{
        referralOutcomeId: string;
        letterDraft: string | null;
        letterStatus: string;
        sourceRevision: number;
        letterApprovedSourceRevision: number | null;
        referralSent: boolean;
        consultationCompleted: boolean;
        versionNumber?: number | null;
      }>(`${BASE}/${id}/referral-letter`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useUpdateReferralLetterDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (letterDraft: string) =>
      api.patch<{
        referralOutcomeId: string;
        letterDraft: string | null;
        letterStatus: string;
        sourceRevision: number;
        letterApprovedSourceRevision: number | null;
        referralSent: boolean;
        consultationCompleted: boolean;
      }>(`${BASE}/${id}/referral-letter`, { letterDraft }),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useApproveReferralLetter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      clientRequestId: string;
      letterDraft?: string;
      expectedSourceRevision?: number;
      externalSendConfirmed?: boolean;
    }) =>
      api.post<{
        referralOutcomeId: string;
        letterDraft: string | null;
        letterStatus: string;
        sourceRevision: number;
        letterApprovedSourceRevision: number | null;
        letterApprovedAt: string | null;
        referralSent: boolean;
        consultationCompleted: boolean;
        versionNumber?: number | null;
      }>(`${BASE}/${id}/referral-letter/approve`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
      qc.invalidateQueries({ queryKey: consultationKeys.lists() });
      qc.invalidateQueries({ queryKey: consultationKeys.active() });
    },
  });
}

// ── AI Hooks ──────────────────────────────────────────────────────────────────

const aiPost = <T>(id: string, path: string) =>
  api.post<T>(`${BASE}/${id}/ai/${path}`, {});

export function useAnalyzeTranscript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { transcript?: string; chiefComplaint?: string }) =>
      api.post(`${BASE}/${id}/ai/analyze-transcript`, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useExtractClinicalNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      transcript?: string;
      presentingConcern?: string;
      captureMode?: 'type' | 'dictation' | 'conversation' | null;
      rewriteNote?: boolean;
    }) => api.post(`${BASE}/${id}/ai/extract-clinical-note`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useApproveConsultationNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      presentingConcern?: string;
      transcript?: string;
      captureMode?: 'type' | 'dictation' | 'conversation' | null;
    }) => api.post(`${BASE}/${id}/consultation-note/approve`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useMatchClinicalAssessment(id: string) {
  return useMutation({
    mutationFn: (body: { assessmentText: string }) =>
      api.post(`${BASE}/${id}/clinical-assessment/match`, body),
  });
}

export function useConfirmClinicalAssessment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      assessmentText?: string;
      matchedPathwayId?: string | null;
      route: 'structured_pathway' | 'clinical_judgment';
    }) => api.post(`${BASE}/${id}/clinical-assessment/confirm`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useClinicalAssessmentEvent(id: string) {
  return useMutation({
    mutationFn: (body: { event: string; pathwayId?: string; pathwayVersion?: string }) =>
      api.post(`${BASE}/${id}/clinical-assessment/events`, body),
  });
}

export function useRecommendPathways(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      aiPost<{
        pathways: unknown[];
        allPathways: unknown[];
        imageFindings?: unknown;
      }>(id, 'recommend-pathways'),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useAnswerQuestions(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { forceRefresh?: boolean } = {}) =>
      api.post<{ answers: unknown[]; refreshed?: boolean }>(
        `${BASE}/${id}/ai/answer-questions`,
        body,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useScreenRedFlags(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiPost(id, 'screen-red-flags'),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useAssessEligibility(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiPost(id, 'assess-eligibility'),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useRecommendTreatment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aiPost(id, 'recommend-treatment'),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useConfirmTreatmentPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      selectedIndexes: number[];
      selectedTreatments: unknown[];
      expectedPlanVersion?: number;
      idempotencyKey?: string;
    }) =>
      api.post<{
        confirmationId: string;
        planVersion: number;
        planHash: string;
        confirmedAt: string;
        counsellingStatus: 'QUEUED' | 'READY';
      }>(`${BASE}/${id}/treatment-plan/confirm`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useGenerateCounselling(id: string) {
  // Do NOT invalidate consultation detail on success — the API persists
  // counsellingNotes, but invalidating re-renders Treatment and used to
  // re-trigger generation in a tight loop (thousands of requests).
  return useMutation({
    mutationFn: (body?: {
      treatmentPlan?: Record<string, unknown>;
      selectedTreatments?: unknown[];
      confirmationId?: string;
      mode?: 'fast' | 'ai';
      draft?: Record<string, unknown>;
    }) =>
      api.post<{
        sections?: unknown[];
        keyMessages?: string[];
        whenToSeekHelp?: string[];
        followUpAdvice?: string;
        source?: string;
        generationMode?: string;
        reason?: string;
      }>(`${BASE}/${id}/ai/generate-counselling`, body ?? {}),
  });
}

export function useGenerateDocumentation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: {
      requestedDocumentTypes?: string[];
      force?: boolean;
    }) =>
      api.post(`${BASE}/${id}/ai/generate-documentation`, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

/** Adapt Step 4 — refine DAP, PCP, and/or Patient Handout with Adapt Document Session prompts. */
export function useRefineAdaptClinicalDocuments(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      kinds?: Array<
        'consultation_note' | 'prescriber_communication' | 'patient_care_summary'
      >,
    ) =>
      api.post<{
        consultation_note?: {
          id: string;
          title: string;
          shortName: string;
          fileName: string;
          category: string;
          categoryLabel: string;
          description: string;
          bullets: string[];
          html: string;
          plainText: string;
          lastEditedAt?: string;
        };
        prescriber_communication?: {
          id: string;
          title: string;
          shortName: string;
          fileName: string;
          category: string;
          categoryLabel: string;
          description: string;
          bullets: string[];
          html: string;
          plainText: string;
          lastEditedAt?: string;
        };
        patient_care_summary?: {
          id: string;
          title: string;
          shortName: string;
          fileName: string;
          category: string;
          categoryLabel: string;
          description: string;
          bullets: string[];
          html: string;
          plainText: string;
          lastEditedAt?: string;
        };
        usedAiDraft: {
          consultation_note: boolean;
          prescriber_communication: boolean;
          patient_care_summary: boolean;
        };
        promptVersion: string;
        warnings: string[];
      }>(`${BASE}/${id}/adapt/step4/documents/refine`, { kinds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

/** Adapt Step 4 — DAP-only refine (compat wrapper). */
export function useRefineAdaptDapNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{
        consultation_note: {
          id: string;
          title: string;
          shortName: string;
          fileName: string;
          category: string;
          categoryLabel: string;
          description: string;
          bullets: string[];
          html: string;
          plainText: string;
          lastEditedAt?: string;
        };
        usedAiDraft: boolean;
        promptVersion: string;
        warnings: string[];
      }>(`${BASE}/${id}/adapt/step4/documents/refine-dap`),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export type OptionalDobApiResult = import('@safescript/shared').OptionalDobValidationResult & {
  patientSnapshotVersion?: number;
  demographics?: Consultation['demographics'];
  status?: string;
  previousAge?: { value: number; unit: string };
  resolvedAge?: { value: number; unit: string };
  affectedItems?: Array<{ type: string; label: string; status: string }>;
  documentStatus?: string;
  nextStep?: string;
};

export function useValidateOptionalDob(id: string) {
  return useMutation({
    mutationFn: (body: { dob: string; expectedPatientSnapshotVersion?: number }) =>
      api.post<OptionalDobApiResult>(`${BASE}/${id}/patient/validate-optional-dob`, body),
  });
}

export function useConfirmMatchingDob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { dob: string; expectedPatientSnapshotVersion?: number }) =>
      api.post<OptionalDobApiResult>(`${BASE}/${id}/patient/confirm-matching-dob`, body),
    onSuccess: (data) => {
      if (data.demographics) {
        qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) =>
          prev ? { ...prev, demographics: data.demographics, updatedAt: prev.updatedAt } : prev,
        );
      }
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
    },
  });
}

export function useResolveAgeDobConflict(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      resolution: 'USE_DOB_RECHECK_AGE' | 'KEEP_MANUAL_AGE_REMOVE_DOB';
      dob?: string;
      expectedPatientSnapshotVersion?: number;
    }) =>
      api.post<OptionalDobApiResult>(`${BASE}/${id}/patient/resolve-age-dob-conflict`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
    },
  });
}

export function useTranslatePatientHandout(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetLanguage: string) =>
      api.post<{
        fields: Record<string, string>;
        translation: {
          language: string;
          requestedLanguage: string;
          sourceHash: string;
          validationStatus: string;
          requiresReview: boolean;
          fallback: boolean;
          stale: boolean;
          message: string | null;
          provider: string | null;
          model: string | null;
        };
      }>(`${BASE}/${id}/patient-handout/translate`, { targetLanguage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(id) }),
  });
}

export function useExtractLabValues(consultationId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<import('./types').LabReportExtractionResult>(
        `/consultations/${consultationId}/extract-lab-values`,
        form,
      );
    },
  });
}

export function useParseLabText(consultationId: string) {
  return useMutation({
    mutationFn: (text: string) =>
      api.post<import('./types').LabReportExtractionResult>(
        `/consultations/${consultationId}/parse-lab-text`,
        { text },
      ),
  });
}

export function useUploadAttachments(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      return api.upload<{ attachments: import('./types').ConsultationAttachment[] }>(
        `/consultations/${consultationId}/attachments`,
        form,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(consultationId) }),
  });
}

export function useDeleteAttachment(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete<{ attachments: import('./types').ConsultationAttachment[] }>(
        `/consultations/${consultationId}/attachments/${attachmentId}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: consultationKeys.detail(consultationId) }),
  });
}

// ── Terminology / Medication search ───────────────────────────────────────────

const TERMINOLOGY_BASE = '/terminology';

function normalizeDrugResult(raw: DrugSearchResult): DrugSearchResult {
  const source = raw.source as DrugSearchResult['source'];
  return sanitizeDrugSearchResult({
    ...raw,
    source:
      source === 'ccdd' ||
      source === 'rxnorm' ||
      source === 'openfda' ||
      source === 'transcript' ||
      source === 'manual'
        ? source
        : 'ccdd',
  });
}

export function useDrugSearch(
  query: string,
  enabled = true,
  purpose: 'medication' | 'allergy' = 'medication',
  limit = 24,
) {
  return useQuery({
    queryKey: ['terminology', 'drugs', 'search', purpose, query, limit],
    queryFn: async () => {
      const results = await api.get<DrugSearchResult[]>(
        `${TERMINOLOGY_BASE}/drugs/search?q=${encodeURIComponent(query)}&limit=${limit}&purpose=${purpose}`,
      );
      return results.map(normalizeDrugResult);
    },
    enabled: enabled && (/^\d+$/.test(query.trim()) ? query.trim().length >= 3 : query.length >= 2),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useResolveMedications() {
  return useMutation({
    mutationFn: async (
      input: string[] | { names: string[]; purpose?: 'allergy' | 'medication' },
    ) => {
      const names = Array.isArray(input) ? input : input.names;
      const purpose = Array.isArray(input) ? 'medication' : (input.purpose ?? 'medication');
      if (!names.length) return [] as DrugSearchResult[];
      const results = await api.get<DrugSearchResult[]>(
        `${TERMINOLOGY_BASE}/drugs/resolve?names=${encodeURIComponent(names.join(','))}&purpose=${purpose}`,
      );
      return results.map(normalizeDrugResult);
    },
  });
}

/** Patient CDS from Safety Engine for the selected medicine. */
export function useTreatmentSafety(
  consultationId: string,
  medicationName?: string | null,
  genericName?: string | null,
) {
  return useQuery({
    queryKey: [
      'consultations',
      consultationId,
      'treatment-safety',
      medicationName ?? '',
      genericName ?? '',
    ],
    queryFn: () => {
      const qs = new URLSearchParams({
        medicationName: medicationName!.trim(),
      });
      if (genericName?.trim()) qs.set('genericName', genericName.trim());
      return api.get<import('./treatment-safety-types').TreatmentSafetyProfile>(
        `${BASE}/${consultationId}/treatment-safety?${qs}`,
      );
    },
    enabled: Boolean(consultationId && medicationName && medicationName.trim().length >= 2),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useEvaluateTreatmentCandidate(consultationId: string | undefined) {
  return useMutation({
    mutationFn: (body: {
      treatmentInstanceId?: string;
      source: 'SEARCH' | 'QUICK_ADD' | 'MANUAL';
      medicationId?: string;
      drugId?: string;
      medicationName: string;
      genericName?: string;
      route?: string;
      rxcui?: string;
      ndc?: string;
      existingTreatments?: Array<Record<string, unknown>>;
    }) =>
      api.post<import('./add-treatment/candidate').TreatmentCandidateEvaluateResponse>(
        `${BASE}/${consultationId}/treatment-candidates/evaluate`,
        body,
      ),
  });
}

export function useCheckConsultationAllergy(consultationId: string) {
  return useMutation({
    mutationFn: (medications: string[]) =>
      api.post<{
        blocked: boolean;
        matches: Array<{
          patientAllergy: string;
          prescribedDrug: string;
          reason: string;
          risk: string;
          matchType: string;
        }>;
      }>(`${BASE}/${consultationId}/check-allergy`, { medications }),
  });
}

export type SendConsultationFaxInput = {
  recipientName: string;
  faxNumber: string;
  documentTypeId: string;
  documentName?: string;
  pdfBase64: string;
};

export type SendConsultationFaxResult = {
  id: string;
  status: string;
  ifaxJobId: string | null;
  recipientName: string;
  faxNumber: string;
  documentTypeId: string;
  documentName: string;
  createdAt: string;
};

export function useSendConsultationFax(consultationId: string) {
  return useMutation({
    mutationFn: (body: SendConsultationFaxInput) =>
      api.post<SendConsultationFaxResult>(`${BASE}/${consultationId}/fax`, body),
  });
}

export type PathwayClinicalJudgementSnapshot = {
  record: import('@safescript/shared').PathwayClinicalJudgementRecord;
  evaluation: import('@safescript/shared').CombinedAssessmentEvaluation;
  sourceAnswerRevision: string;
  draft?: string;
  nextStep?: 'DOCUMENTATION';
};

export function useSavePathwayClinicalJudgementDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      workingDiagnosisDisplay?: string;
      workingDiagnosisConceptId?: string;
      diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN' | null;
      rationaleDraft?: string;
      uiState?: 'prompt' | 'form' | 'documented';
    }) => api.put<PathwayClinicalJudgementSnapshot>(`${BASE}/${id}/pathway-clinical-judgement`, body),
    onSuccess: (data) => {
      qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) =>
        prev ? { ...prev, pathwayClinicalJudgement: data.record } : prev,
      );
    },
  });
}

export function useDraftPathwayClinicalJudgement(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<PathwayClinicalJudgementSnapshot>(
        `${BASE}/${id}/pathway-clinical-judgement/draft-rationale`,
        {},
      ),
    onSuccess: (data) => {
      qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) =>
        prev ? { ...prev, pathwayClinicalJudgement: data.record } : prev,
      );
    },
  });
}

export function useConfirmPathwayClinicalJudgement(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      workingDiagnosisDisplay: string;
      workingDiagnosisConceptId?: string;
      diagnosticCertainty: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';
      rationaleApproved: string;
      sourceAnswerRevision: string;
    }) =>
      api.post<PathwayClinicalJudgementSnapshot>(
        `${BASE}/${id}/pathway-clinical-judgement/confirm`,
        body,
      ),
    onSuccess: (data) => {
      qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) =>
        prev ? { ...prev, pathwayClinicalJudgement: data.record } : prev,
      );
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
    },
  });
}

export function usePathwayNoTreatment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<PathwayClinicalJudgementSnapshot>(
        `${BASE}/${id}/pathway-clinical-judgement/no-treatment`,
        {},
      ),
    onSuccess: (data) => {
      qc.setQueryData(consultationKeys.detail(id), (prev: Consultation | undefined) =>
        prev
          ? {
              ...prev,
              pathwayClinicalJudgement: data.record,
              currentStep: data.nextStep ?? prev.currentStep,
            }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(id) });
    },
  });
}
