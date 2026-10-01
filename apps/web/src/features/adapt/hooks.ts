'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type {
  AdaptIndicationSelection,
  AdaptIndicationSuggestion,
  ApprovedIndicationMapping,
  RenewConditionCatalogItem,
  RenewIndicationCandidate,
} from '@safescript/shared';

export type AdaptIndicationSearchHit = RenewConditionCatalogItem & {
  source: 'approved_library' | 'snomed';
  snomedConceptId?: string | null;
};

export type AdaptIndicationResolveResponse = {
  medicationId: string;
  medicationConceptKey: string;
  medicationDisplayName: string;
  approvedMappings: ApprovedIndicationMapping[];
  candidates: RenewIndicationCandidate[];
  suggestions: AdaptIndicationSuggestion[];
  commonIndications: RenewConditionCatalogItem[];
  patientConditionMatches: RenewConditionCatalogItem[];
  repositoryVersion: string;
  needsAiRanking: boolean;
  suggestionsUnavailable: boolean;
  resolverStatus: 'empty' | 'provisional' | 'needs_confirmation';
  provisionalConditionId: string | null;
  existingSelection: AdaptIndicationSelection | null;
};

export const adaptIndicationKey = (consultationId: string, medicationId?: string | null) =>
  ['adapt-indication', consultationId, medicationId ?? 'none'] as const;

export type AdaptIndicationMedicationHint = {
  id?: string | null;
  medicationText?: string | null;
  genericName?: string | null;
  brandName?: string | null;
  medicationConceptId?: string | null;
};

export function useAdaptIndicationResolve(
  consultationId: string,
  medication: AdaptIndicationMedicationHint | string | null | undefined,
  enabled = true,
) {
  const hint: AdaptIndicationMedicationHint =
    typeof medication === 'string'
      ? { id: medication }
      : medication ?? {};
  const medicationId = hint.id ?? null;
  const hintKey = [
    medicationId ?? '',
    hint.medicationConceptId ?? '',
    hint.genericName ?? '',
    hint.brandName ?? '',
    hint.medicationText ?? '',
  ].join('|');

  return useQuery({
    queryKey: [...adaptIndicationKey(consultationId, medicationId), hintKey],
    queryFn: () => {
      const params = new URLSearchParams({ suggest: 'true' });
      if (medicationId) params.set('medicationId', medicationId);
      if (hint.medicationText?.trim()) params.set('medicationText', hint.medicationText.trim());
      if (hint.genericName?.trim()) params.set('genericName', hint.genericName.trim());
      if (hint.brandName?.trim()) params.set('brandName', hint.brandName.trim());
      if (hint.medicationConceptId?.trim()) {
        params.set('medicationConceptId', hint.medicationConceptId.trim());
      }
      return api.get<AdaptIndicationResolveResponse>(
        `/consultations/${consultationId}/adapt/indication?${params.toString()}`,
      );
    },
    enabled:
      Boolean(consultationId) &&
      Boolean(
        medicationId ||
          hint.medicationText?.trim() ||
          hint.genericName?.trim() ||
          hint.brandName?.trim() ||
          hint.medicationConceptId?.trim(),
      ) &&
      enabled,
    staleTime: 30_000,
    // Step 1 may resolve before renewPayload autosave finishes — retry briefly.
    retry: (count, error) => {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : 0;
      if (status === 400 || status === 404) return count < 4;
      return count < 1;
    },
    retryDelay: (attempt) => Math.min(350 * (attempt + 1), 1600),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      // Soft-empty / provisional while Rx is still syncing — poll briefly then stop.
      const stillSyncing =
        (!data.medicationId || data.resolverStatus === 'empty') &&
        Boolean(medicationId) &&
        query.state.dataUpdateCount < 6;
      return stillSyncing ? 1000 : false;
    },
  });
}

export function useSearchAdaptIndicationConditions(consultationId: string) {
  return useMutation({
    mutationFn: (q: string) =>
      api.get<AdaptIndicationSearchHit[]>(
        `/consultations/${consultationId}/adapt/indication/conditions/search?q=${encodeURIComponent(q)}`,
      ),
  });
}

export function useRecordAdaptIndicationCandidate(consultationId: string) {
  return useMutation({
    mutationFn: (body: {
      snomedConceptId: string;
      displayName: string;
      medicationId: string;
    }) =>
      api.post<{ ok: true; candidateId: string }>(
        `/consultations/${consultationId}/adapt/indication/manual-candidate`,
        body,
      ),
  });
}

export type AdaptSubstitutionAlternative = {
  id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  strengths: string[];
  defaultStrength: string;
  dosageForm: string;
  metadata?: string;
  rationale?: string;
  drugId?: string;
  proposed: {
    drugId?: string;
    drugName: string;
    genericName?: string;
    brandName?: string;
    strength?: string;
    dosageForm?: string;
    dose?: string;
    frequency?: string;
    route?: string;
    quantity?: number | string | null;
    quantityUnit?: string;
    refills?: number | string | null;
    sig: string;
  };
  source: 'ai';
};

export type AdaptSubstitutionAlternativesResponse = {
  alternatives: AdaptSubstitutionAlternative[];
  source: 'ai' | 'unavailable';
  model?: string;
  unavailableReason?: string;
};

export const adaptSubstitutionAlternativesKey = (consultationId: string) =>
  ['adapt-substitution-alternatives', consultationId] as const;

/** AI evidence-linked therapeutic substitution candidates for Adapt Step 3A. */
export function useAdaptSubstitutionAlternatives(
  consultationId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: adaptSubstitutionAlternativesKey(consultationId || 'none'),
    queryFn: () =>
      api.post<AdaptSubstitutionAlternativesResponse>(
        `/consultations/${consultationId}/adapt/substitution-alternatives`,
        {},
      ),
    enabled: Boolean(consultationId) && consultationId !== 'preview' && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export type AdaptClinicalGuidanceResponse = {
  caseFocus: string;
  summary: string;
  keyPoints: string[];
  comparativeOptions: string[];
  monitoring: string[];
  source: 'ai' | 'unavailable';
  model?: string;
  unavailableReason?: string;
};

export const adaptClinicalGuidanceKey = (consultationId: string) =>
  ['adapt-clinical-guidance', consultationId] as const;

/** Patient- and case-specific clinical guidance for Adapt Step 3A sidebar. */
export function useAdaptClinicalGuidance(
  consultationId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: adaptClinicalGuidanceKey(consultationId || 'none'),
    queryFn: () =>
      api.post<AdaptClinicalGuidanceResponse>(
        `/consultations/${consultationId}/adapt/clinical-guidance`,
        {},
      ),
    enabled: Boolean(consultationId) && consultationId !== 'preview' && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export type AdaptClinicalRationaleResponse = {
  rationale: string;
  source: 'ai' | 'deterministic_fallback';
  model?: string;
  unavailableReason?: string;
};

/** Precise AI clinical rationale draft (≤500 chars) for Adapt Step 3A. */
export function useGenerateAdaptClinicalRationale(consultationId: string | undefined) {
  return useMutation({
    mutationFn: (proposedPrescription?: Record<string, unknown>) =>
      api.post<AdaptClinicalRationaleResponse>(
        `/consultations/${consultationId}/adapt/clinical-rationale`,
        { proposedPrescription },
      ),
  });
}

export type AdaptCounsellingAiOutput = {
  what_to_expect: string[];
  self_care: string[];
  routine_follow_up: string[];
  seek_care: string[];
};

export type AdaptCounsellingSectionDto = {
  section_key: 'MEDICATION_USE' | 'EXPECTED_RESPONSE' | 'SELF_CARE' | 'FOLLOW_UP';
  title: string;
  bullets: string[];
};

export type AdaptCounsellingResponse = {
  schemaVersion: string;
  promptVersion: string;
  source: 'ai' | 'deterministic_fallback';
  model?: string;
  unavailableReason?: string;
  generatedAt: string;
  ai: AdaptCounsellingAiOutput;
  sections: AdaptCounsellingSectionDto[];
  howToUse: string;
};

/** AI counselling Cards 2–4 for Adapt after treatment plan confirm. */
export function useGenerateAdaptCounselling(consultationId: string | undefined) {
  return useMutation({
    mutationFn: () =>
      api.post<AdaptCounsellingResponse>(
        `/consultations/${consultationId}/adapt/counselling`,
        {},
      ),
  });
}
