'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { consultationKeys } from '@/features/consultations/hooks';
import type { Consultation } from '@/features/consultations/types';
import {
  applyPlanPatch,
  parseRenewPayload,
  type RenewConditionCatalogItem,
  type RenewConditionReview,
  type RenewDocumentKind,
  type RenewDurationId,
  type RenewDuplicatePair,
  type RenewMedication,
  type RenewPatientContextAnswer,
  type RenewStep3View,
  type RenewStep4View,
  type RenewTherapyReviewState,
  type RenewVerifiedFromId,
  type TherapyReviewGate,
  type RenewCommunicationMethod,
  type RenewCommunicationPurpose,
  type RenewCommunicationRecipient,
} from '@safescript/shared';

export type RenewExtractResult = {
  medications: RenewMedication[];
  sourceSystem: string | null;
  documentType: string | null;
  imageQuality: 'clear' | 'partial' | 'poor';
  warnings: string[];
  cached: boolean;
  duplicates: RenewDuplicatePair[];
  suggestedVerifiedFrom: RenewVerifiedFromId | null;
};

export type TherapyReviewResponse = {
  medications: RenewMedication[];
  therapyReview: RenewTherapyReviewState;
  conditions: RenewConditionCatalogItem[];
  gate: TherapyReviewGate;
  suggestionsUnavailable: boolean;
  updatedConditionCount?: number;
  preservedConditionCount?: number;
  skippedUnsavedCount?: number;
};

export const therapyReviewKey = (consultationId: string) =>
  ['renew-therapy-review', consultationId] as const;

function syncTherapyIntoConsultation(
  qc: ReturnType<typeof useQueryClient>,
  consultationId: string,
  data: TherapyReviewResponse,
) {
  qc.setQueryData(therapyReviewKey(consultationId), data);
  qc.setQueryData(consultationKeys.detail(consultationId), (prev: Consultation | undefined) => {
    if (!prev) return prev;
    const payload = parseRenewPayload(prev.renewPayload);
    return {
      ...prev,
      renewPayload: {
        ...payload,
        medicationList: {
          ...payload.medicationList,
          items: data.medications.length ? data.medications : payload.medicationList.items,
        },
        therapyReview: data.therapyReview,
      },
    };
  });
}

export function useExtractRenewMedications(consultationId: string) {
  return useMutation({
    mutationFn: ({
      files,
      file,
      sourceType,
      note,
    }: {
      files?: File[];
      file?: File;
      sourceType: 'screenshot' | 'pharmacy_document';
      note?: string;
    }) => {
      const list = files?.length ? files : file ? [file] : [];
      const form = new FormData();
      for (const item of list) form.append('files', item);
      if (note?.trim()) form.append('note', note.trim());
      return api.upload<RenewExtractResult>(
        `/consultations/${consultationId}/renew/extract-medications?sourceType=${sourceType}`,
        form,
      );
    },
  });
}

export function useTherapyReview(consultationId: string, enabled = true) {
  return useQuery({
    queryKey: therapyReviewKey(consultationId),
    queryFn: () => api.get<TherapyReviewResponse>(`/consultations/${consultationId}/renew/therapy-review`),
    enabled: Boolean(consultationId) && enabled,
    staleTime: 15_000,
  });
}

export function useSuggestTherapyMappings(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<TherapyReviewResponse>(`/consultations/${consultationId}/renew/therapy-review/suggest-mappings`),
    onSuccess: (data) => syncTherapyIntoConsultation(qc, consultationId, data),
  });
}

export function useSearchRenewConditions(consultationId: string) {
  return useMutation({
    mutationFn: (q: string) =>
      api.get<RenewConditionCatalogItem[]>(
        `/consultations/${consultationId}/renew/conditions/search?q=${encodeURIComponent(q)}`,
      ),
  });
}

export function useAddRenewCondition(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { conditionId?: string; customText?: string; medicationIds?: string[] }) =>
      api.post<TherapyReviewResponse>(`/consultations/${consultationId}/renew/conditions`, body),
    onSuccess: (data) => syncTherapyIntoConsultation(qc, consultationId, data),
  });
}

export function useSetRenewIndication(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      medicationId,
      conditionId,
      customIndicationText,
    }: {
      medicationId: string;
      conditionId?: string | null;
      customIndicationText?: string | null;
    }) =>
      api.patch<TherapyReviewResponse>(
        `/consultations/${consultationId}/renew/medications/${medicationId}/indication`,
        { conditionId, customIndicationText },
      ),
    onSuccess: (data) => syncTherapyIntoConsultation(qc, consultationId, data),
  });
}

export function usePatchConditionReview(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, patch }: { reviewId: string; patch: Partial<RenewConditionReview> }) =>
      api.patch<TherapyReviewResponse>(
        `/consultations/${consultationId}/renew/condition-reviews/${reviewId}`,
        patch,
      ),
    onSuccess: (data) => syncTherapyIntoConsultation(qc, consultationId, data),
  });
}

export function useApplyStableAll(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skipReviewIds: string[] = []) =>
      api.post<TherapyReviewResponse>(
        `/consultations/${consultationId}/renew/therapy-review/apply-stable-all`,
        { skipReviewIds },
      ),
    onSuccess: (data) => syncTherapyIntoConsultation(qc, consultationId, data),
  });
}

export function useCompleteTherapyReview(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<TherapyReviewResponse>(`/consultations/${consultationId}/renew/therapy-review/complete`),
    onSuccess: (data) => {
      syncTherapyIntoConsultation(qc, consultationId, data);
      qc.setQueryData(consultationKeys.detail(consultationId), (prev: Consultation | undefined) =>
        prev
          ? { ...prev, currentStep: 'RENEW_CLINICAL_ASSESSMENT', stepIndex: 2 }
          : prev,
      );
    },
  });
}

export const monitoringSafetyKey = (consultationId: string) =>
  ['renew-monitoring-safety', consultationId] as const;

export function useMonitoringSafety(consultationId: string, enabled = true) {
  return useQuery({
    queryKey: monitoringSafetyKey(consultationId),
    queryFn: () => api.get<RenewStep3View>(`/consultations/${consultationId}/renew/step3`),
    enabled: Boolean(consultationId) && enabled,
    staleTime: 10_000,
    retry: false,
  });
}

function setMonitoringCache(
  qc: ReturnType<typeof useQueryClient>,
  consultationId: string,
  data: RenewStep3View,
) {
  qc.setQueryData(monitoringSafetyKey(consultationId), data);
}

export function useSaveMonitoringResult(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      inputCode,
      body,
    }: {
      inputCode: string;
      body: {
        numericValue?: number | null;
        secondaryNumericValue?: number | null;
        valueText?: string | null;
        unit?: string | null;
        observedDate?: string | null;
        sourceLabel?: string | null;
      };
    }) =>
      api.put<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/monitoring/${encodeURIComponent(inputCode)}`,
        body,
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useMarkMonitoringUnavailable(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ inputCode, note }: { inputCode: string; note?: string }) =>
      api.post<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/monitoring/${encodeURIComponent(inputCode)}/unavailable`,
        { note },
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useSaveMonitoringReview(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      inputCode,
      action,
      note,
      otherText,
      affectedMedicationIds,
      shorterDurationId,
    }: {
      inputCode: string;
      action: string;
      note?: string | null;
      otherText?: string | null;
      affectedMedicationIds?: string[];
      shorterDurationId?: string | null;
    }) =>
      api.put<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/monitoring/${encodeURIComponent(inputCode)}/review`,
        { action, note, otherText, affectedMedicationIds, shorterDurationId },
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useSaveMonitoringContext(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      inputCode,
      body,
    }: {
      inputCode: string;
      body: Partial<
        Pick<
          RenewPatientContextAnswer,
          | 'status'
          | 'valueText'
          | 'numericValue'
          | 'note'
          | 'unableReasonCode'
          | 'unableReasonText'
          | 'followup'
          | 'enteredUnit'
          | 'sourceDate'
        >
      >;
    }) =>
      api.put<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/context/${encodeURIComponent(inputCode)}`,
        body,
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useSavePatientSpecificInformation(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      answers?: Array<{ questionRuleId: string; answer: 'YES' | 'NO' | 'UNKNOWN'; source?: 'MANUAL' | 'BULK_NO_CONCERNS' }>;
      removedQuestions?: Array<{ questionRuleId: string; reasonCode: string; reasonText?: string | null }>;
      restoreQuestionIds?: string[];
      additionalNote?: string | null;
      confirmed?: boolean;
      applyNoConcerns?: boolean;
      undoBulkActionId?: string;
      ackBulkConfirm?: boolean;
    }) =>
      api.put<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/patient-specific-information`,
        body,
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useSaveMonitoringWorkspace(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      removedItems?: Array<{ inputCode: string; reasonCode: string; reasonText?: string | null }>;
      restoreInputCodes?: string[];
      extraInputCodes?: string[];
      confirmed?: boolean;
    }) =>
      api.put<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/monitoring-workspace`,
        body,
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useExtractMonitoringResults(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      files,
      file,
      sourceType,
      note,
    }: {
      files?: File[];
      file?: File;
      sourceType: 'screenshot' | 'upload';
      note?: string;
    }) => {
      const list = files?.length ? files : file ? [file] : [];
      const form = new FormData();
      for (const item of list) form.append('files', item);
      if (note?.trim()) form.append('note', note.trim());
      return api.upload<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/extractions?sourceType=${sourceType}`,
        form,
      );
    },
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useConfirmMonitoringExtraction(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ extractionId, selectedCodes }: { extractionId: string; selectedCodes?: string[] }) =>
      api.post<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/extractions/${extractionId}/confirm`,
        { selectedCodes },
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useRejectMonitoringExtraction(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (extractionId: string) =>
      api.post<RenewStep3View>(
        `/consultations/${consultationId}/renew/step3/extractions/${extractionId}/reject`,
      ),
    onSuccess: (data) => setMonitoringCache(qc, consultationId, data),
  });
}

export function useCompleteMonitoringSafety(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RenewStep3View>(`/consultations/${consultationId}/renew/step3/complete`),
    onSuccess: (data) => {
      setMonitoringCache(qc, consultationId, data);
      void qc.invalidateQueries({ queryKey: ['consultations', consultationId] });
    },
  });
}

export const renewStep4Key = (consultationId: string) =>
  ['renew-step4', consultationId] as const;

type RenewPlanPatchBody = {
  medicationId: string;
  selected?: boolean;
  durationId?: RenewDurationId | null;
  customDurationDays?: number | null;
  customDurationText?: string | null;
  durationSource?: 'DEFAULT' | 'BULK' | 'MANUAL';
};

/** Instant client-side plan update so checkbox/duration UI does not wait on the network. */
export function optimisticPatchRenewStep4View(
  view: RenewStep4View,
  body: RenewPlanPatchBody,
): RenewStep4View {
  const target = view.rows.find((row) => row.medicationId === body.medicationId);
  if (!target) return view;

  const items = applyPlanPatch(
    view.decision.items,
    body.medicationId,
    {
      selected: body.selected,
      durationId: body.durationId,
      customDurationDays: body.customDurationDays,
      customDurationText: body.customDurationText,
      durationSource: body.durationSource,
    },
    target.safety,
  );
  const byId = new Map(items.map((item) => [item.medicationId, item]));
  const rows = view.rows.map((row) => {
    const item = byId.get(row.medicationId);
    if (!item) return row;
    return {
      ...row,
      selected: item.selected,
      decision: item.decision,
      durationId: item.durationId,
      customDurationDays: item.customDurationDays,
      customDurationText: item.customDurationText,
      durationSource: item.durationSource,
      durationApplyNote: item.durationApplyNote,
      pharmacistOverride: item.pharmacistOverride,
    };
  });

  return {
    ...view,
    rows,
    decision: { ...view.decision, items },
    summary: {
      ...view.summary,
      selectedToRenew: rows.filter((row) => row.selected).length,
    },
  };
}

function setStep4Cache(
  qc: ReturnType<typeof useQueryClient>,
  consultationId: string,
  data: RenewStep4View,
) {
  qc.setQueryData(renewStep4Key(consultationId), data);
}

export function useRenewStep4(consultationId: string, enabled = true) {
  return useQuery({
    queryKey: renewStep4Key(consultationId),
    queryFn: () => api.get<RenewStep4View>(`/consultations/${consultationId}/renew/step4`),
    enabled: Boolean(consultationId) && enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePatchRenewPlan(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RenewPlanPatchBody) =>
      api.patch<RenewStep4View>(`/consultations/${consultationId}/renew/step4/plan`, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: renewStep4Key(consultationId) });
      const previous = qc.getQueryData<RenewStep4View>(renewStep4Key(consultationId));
      if (previous) {
        qc.setQueryData(renewStep4Key(consultationId), optimisticPatchRenewStep4View(previous, body));
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) setStep4Cache(qc, consultationId, context.previous);
    },
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useRenewAllEligible(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/plan/renew-all-eligible`),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useApplyRenewPlanDuration(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      durationId: RenewDurationId;
      customDurationDays?: number | null;
      overwriteManual?: boolean;
    }) => api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/plan/apply-duration`, body),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useUndoRenewPlanDuration(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { bulkActionId: string }) =>
      api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/plan/undo-duration`, body),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useConfirmRenewPlan(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/plan/confirm`),
    onSuccess: (data) => {
      setStep4Cache(qc, consultationId, data);
      void qc.invalidateQueries({ queryKey: ['consultations', consultationId] });
    },
  });
}

export function useUnconfirmRenewPlan(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/plan/unconfirm`),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useSaveRenewPatientInfo(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      patientName: string;
      dateOfBirth: string;
      phn?: string | null;
      skipped?: boolean;
    }) => api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/patient-info`, body),
    onSuccess: (data) => {
      setStep4Cache(qc, consultationId, data);
      void qc.invalidateQueries({ queryKey: ['consultations', consultationId] });
    },
  });
}

export function useGenerateRenewDocuments(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kinds?: RenewDocumentKind[]) =>
      api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/documents/generate`, {
        kinds,
      }),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useUpdateRenewDocument(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      body,
      reviewed,
    }: {
      kind: RenewDocumentKind;
      body: string;
      reviewed?: boolean;
    }) =>
      api.patch<RenewStep4View>(
        `/consultations/${consultationId}/renew/step4/documents/${encodeURIComponent(kind)}`,
        { body, reviewed },
      ),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useTranslateRenewPatientHandout(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetLanguage: string) =>
      api.post<RenewStep4View>(
        `/consultations/${consultationId}/renew/step4/documents/patient_handout/translate`,
        { targetLanguage },
      ),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useAttestRenewDocumentation(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attested: boolean) =>
      api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/attest`, { attested }),
    onSuccess: (data) => setStep4Cache(qc, consultationId, data),
  });
}

export function useSaveRenewCommunication(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      noAffectedProfessional?: boolean;
      purpose?: RenewCommunicationPurpose;
      recipient?: RenewCommunicationRecipient | null;
    }) => api.patch<RenewStep4View>(`/consultations/${consultationId}/renew/step4/communication`, body),
    onSuccess: (data) => {
      setStep4Cache(qc, consultationId, data);
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(consultationId) });
    },
  });
}

export function useCompleteRenewCommunication(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      method: RenewCommunicationMethod;
      communicatedAt: string;
      note?: string | null;
      phoneSummary?: string | null;
      recipient?: RenewCommunicationRecipient | null;
    }) =>
      api.post<RenewStep4View>(`/consultations/${consultationId}/renew/step4/communication/complete`, body),
    onSuccess: (data) => {
      setStep4Cache(qc, consultationId, data);
      void qc.invalidateQueries({ queryKey: consultationKeys.detail(consultationId) });
    },
  });
}
