import type { CounsellingPlan } from './counselling-panel-model';
import type { TreatmentRecommendation } from './types';
import type { PatientDocumentInfo } from './documents/types';
import type { TreatmentPlanConfirmStatus } from '@safescript/shared';

const PREFIX = 'safescript:consultation:';

export interface TreatmentStepDraft {
  treatments: TreatmentRecommendation[];
  selectedIndexes: number[];
  summary: string;
  intendedIndication: string;
  treatmentGoal: string;
  planConfirmStatus: TreatmentPlanConfirmStatus;
  confirmationId: string | null;
  confirmedAt: string | null;
  planVersion: number;
  confirmedPlanHash: string | null;
  counsellingPlan: CounsellingPlan | null;
  counsellingReviewed: boolean;
  /** Option keys that have been explicitly saved via "Save treatment". */
  savedTreatmentKeys?: string[];
}

interface ConsultationDraftBag {
  TREATMENT?: TreatmentStepDraft;
  DOCUMENTATION_PATIENT?: PatientDocumentInfo;
  /** Set when pharmacist Saves or Skips patient details on Consultation Documents. */
  DOCUMENTATION_PATIENT_GATE?: { confirmedAt: string };
}

function storageKey(consultationId: string) {
  return `${PREFIX}${consultationId}`;
}

const memory = new Map<string, ConsultationDraftBag>();

function readBag(consultationId: string): ConsultationDraftBag {
  const fromMem = memory.get(consultationId);
  if (fromMem) return fromMem;
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey(consultationId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConsultationDraftBag;
    if (!parsed || typeof parsed !== 'object') return {};
    memory.set(consultationId, parsed);
    return parsed;
  } catch {
    return {};
  }
}

function writeBag(consultationId: string, bag: ConsultationDraftBag) {
  memory.set(consultationId, bag);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(consultationId), JSON.stringify(bag));
  } catch {
    /* private mode / quota */
  }
}

export function readConsultationDraft<K extends keyof ConsultationDraftBag>(
  consultationId: string,
  key: K,
): ConsultationDraftBag[K] | undefined {
  if (!consultationId) return undefined;
  return readBag(consultationId)[key];
}

export function writeConsultationDraft<K extends keyof ConsultationDraftBag>(
  consultationId: string,
  key: K,
  value: ConsultationDraftBag[K],
) {
  if (!consultationId) return;
  const bag = { ...readBag(consultationId), [key]: value };
  writeBag(consultationId, bag);
}

export function clearConsultationDraft(consultationId: string) {
  if (!consultationId) return;
  memory.delete(consultationId);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(consultationId));
  } catch {
    /* private mode */
  }
}
