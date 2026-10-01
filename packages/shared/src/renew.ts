/**
 * SafeScribe Renew — Step 1 shared types, constants, and duplicate helpers.
 * AI extracts; SafeScribe structures; the pharmacist verifies.
 */

import {
  baseIngredientKeys,
  normalizeMedicationKey,
} from './treatment-duplicate';
import { toIsoCalendarDate } from './patient-age';
import {
  emptyMonitoringSafety,
  parseMonitoringSafety,
  type RenewMonitoringSafetyState,
} from './renew-monitoring';
import type {
  MedicationClinicalIdentity,
  MedicationProductIdentity,
  MedicationResolutionStatus,
} from './medication-product-resolver';

export const CONSULTATION_MODULES = {
  PRESCRIBE: 'prescribe',
  RENEW: 'renew',
} as const;

export type ConsultationModule =
  (typeof CONSULTATION_MODULES)[keyof typeof CONSULTATION_MODULES];

export const RENEW_DB_STEPS = [
  'RENEW_MEDICATIONS',
  'RENEW_THERAPY_REVIEW',
  'RENEW_CLINICAL_ASSESSMENT',
  'RENEW_DECISION',
  'RENEW_DOCUMENTATION',
  'RENEW_SUMMARY',
] as const;

export type RenewDbStep = (typeof RENEW_DB_STEPS)[number];

export const RENEW_UI_STEP_IDS = [
  'MEDICATIONS_TO_RENEW',
  'THERAPY_REVIEW',
  'CLINICAL_ASSESSMENT',
  'RENEW_AND_DOCUMENT',
] as const;

export type RenewUIStepId = (typeof RENEW_UI_STEP_IDS)[number];

export const RENEW_UI_STEPS: Array<{
  id: RenewUIStepId;
  dbStep: RenewDbStep;
  label: string;
  shortLabel: string;
  helper: string;
  pageTitle: string;
  description: string;
}> = [
  {
    id: 'MEDICATIONS_TO_RENEW',
    dbStep: 'RENEW_MEDICATIONS',
    label: 'Medications',
    shortLabel: 'Medications',
    helper: 'Add or import medications',
    pageTitle: 'Medications to Renew',
    description: 'Confirm the current medications, then provide a few renewal details.',
  },
  {
    id: 'THERAPY_REVIEW',
    dbStep: 'RENEW_THERAPY_REVIEW',
    label: 'Therapy',
    shortLabel: 'Therapy',
    helper: 'Indications & effectiveness',
    pageTitle: 'Therapy review',
    description:
      'Review each medication for indication, adherence, effectiveness, and medication-related concerns.',
  },
  {
    id: 'CLINICAL_ASSESSMENT',
    dbStep: 'RENEW_CLINICAL_ASSESSMENT',
    label: 'Monitoring',
    shortLabel: 'Monitoring',
    helper: 'Labs, vitals & safety',
    pageTitle: 'Monitoring & Safety',
    description: 'Review patient results that are relevant to the medications being renewed.',
  },
  {
    id: 'RENEW_AND_DOCUMENT',
    dbStep: 'RENEW_DECISION',
    label: 'Renew',
    shortLabel: 'Renew',
    helper: 'Plan & documentation',
    pageTitle: 'Renew & Document',
    description: 'Finalize the renewal plan, confirm patient details, review documentation, and complete.',
  },
];

export type RenewMedicationSourceType =
  | 'manual_search'
  | 'screenshot'
  | 'pharmacy_document';

export type RenewReviewStatus = 'confirmed' | 'needs_review' | 'not_reviewed';

export type RenewCcddMatchStatus = 'matched' | 'ambiguous' | 'unmatched';

export type RenewResolutionStatus = MedicationResolutionStatus;

export interface RenewMedicationConfidence {
  medication?: number | null;
  strength?: number | null;
  directions?: number | null;
  quantity?: number | null;
  prescriber?: number | null;
  dates?: number | null;
}

export interface RenewCcddCandidate {
  id: string;
  label: string;
  brandName?: string | null;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  din?: string | null;
  codeDisplay?: string | null;
  clinicalDifference?: string | null;
  pharmacistDisplayName?: string | null;
  pharmacistDetail?: string | null;
}

export interface RenewMedication {
  id: string;
  source: {
    type: RenewMedicationSourceType;
    documentType?: string | null;
    sourceSystem?: string | null;
  };
  raw: {
    medicationText?: string | null;
    directionsText?: string | null;
    quantityText?: string | null;
    prescriberText?: string | null;
    dateText?: string | null;
  };
  normalized: {
    medicationConceptId?: string | null;
    din?: string | null;
    brandName?: string | null;
    genericName?: string | null;
    strength?: string | null;
    dosageForm?: string | null;
    route?: string | null;
    directions?: string | null;
    directionsNormalized?: string | null;
    frequency?: string | null;
    dose?: string | null;
    doseUnit?: string | null;
    prn?: boolean;
    quantity?: number | null;
    quantityUnit?: string | null;
    prescriberName?: string | null;
    prescribedDate?: string | null;
    lastFillDate?: string | null;
    refillsRemaining?: number | null;
    previousAuthorizedRefills?: number | null;
    complianceSchedule?: {
      morning?: number | null;
      noon?: number | null;
      evening?: number | null;
      bedtime?: number | null;
    } | null;
  };
  confidence: RenewMedicationConfidence;
  reviewStatus: RenewReviewStatus;
  ccddMatchStatus: RenewCcddMatchStatus;
  ccddCandidates?: RenewCcddCandidate[];
  resolutionStatus?: RenewResolutionStatus;
  productIdentity?: MedicationProductIdentity;
  clinicalIdentity?: MedicationClinicalIdentity;
  pharmacistEdited: boolean;
  /** Pharmacist-facing current SIG status. Empty is not the same as unavailable. */
  directionsStatus?: 'CONFIRMED' | 'UNAVAILABLE';
  /** DPD/CCDD-matched products are VERIFIED; manual non-DPD entries are UNVERIFIED. */
  identityVerificationStatus?: 'VERIFIED' | 'UNVERIFIED';
}

export const RENEW_DURATION_OPTIONS = [
  { id: '7_days', label: '7 days' },
  { id: '14_days', label: '14 days' },
  { id: '30_days', label: '30 days' },
  { id: 'next_blister_cycle', label: 'Next blister cycle' },
  { id: 'custom', label: 'Custom' },
] as const;

export type RenewDurationId = (typeof RENEW_DURATION_OPTIONS)[number]['id'];

export const RENEW_CUSTOM_DURATION_LIMITS = { min: 1, max: 90 } as const;

export const RENEW_DURATION_SOURCES = ['DEFAULT', 'BULK', 'MANUAL'] as const;
export type RenewDurationSource = (typeof RENEW_DURATION_SOURCES)[number];

export const RENEW_REASON_OPTIONS = [
  { id: 'no_refills_remaining', label: 'No refills remaining' },
  { id: 'unable_to_see_prescriber', label: 'Unable to see prescriber' },
  { id: 'blister_pack_continuity', label: 'Blister pack continuity' },
  { id: 'travelling_forgot', label: 'Travelling / forgot medication' },
  { id: 'lost_medication', label: 'Lost medication' },
  { id: 'prescriber_pharmacy_unavailable', label: 'Prescriber / pharmacy unavailable' },
  { id: 'other', label: 'Other / specify' },
] as const;

export type RenewReasonId = (typeof RENEW_REASON_OPTIONS)[number]['id'];

export const RENEW_VERIFIED_FROM_OPTIONS = [
  { id: 'pharmacy_dispensing_record', label: 'Pharmacy dispensing record' },
  { id: 'provincial_medication_record', label: 'Provincial medication record' },
  { id: 'rx_medication_label', label: 'Rx / medication label' },
  { id: 'blister_pack_profile', label: 'Blister pack profile' },
  { id: 'another_pharmacy_prescriber', label: 'Another pharmacy / prescriber' },
  { id: 'patient_caregiver_report', label: 'Patient / caregiver report' },
  { id: 'other', label: 'Other' },
] as const;

export type RenewVerifiedFromId = (typeof RENEW_VERIFIED_FROM_OPTIONS)[number]['id'];

export interface RenewMedicationListState {
  items: RenewMedication[];
  confirmed: boolean;
  expanded: boolean;
  confirmedAt?: string | null;
  lastImportSummary?: string | null;
}

export interface RenewRequestState {
  expanded: boolean;
  requestedDuration: RenewDurationId | null;
  customDurationDays?: number | null;
  customDurationText?: string | null;
  reasons: RenewReasonId[];
  otherReasonText?: string;
  verifiedFrom: RenewVerifiedFromId | null;
  otherVerifiedText?: string;
  pharmacistConfirmedAccuracy: boolean;
}

export const RENEW_MAPPING_SOURCES = [
  'curated_auto',
  'ai_ranked',
  'pharmacist_selected',
  'pharmacist_changed',
  'custom',
] as const;
export type RenewMappingSource = (typeof RENEW_MAPPING_SOURCES)[number];

export const RENEW_MAPPING_STATUSES = [
  'provisional',
  'needs_confirmation',
  'pharmacist_confirmed',
  'custom',
] as const;
export type RenewMappingStatus = (typeof RENEW_MAPPING_STATUSES)[number];

export const RENEW_ADHERENCE_STATUSES = ['yes', 'no'] as const;
export type RenewAdherenceStatus = (typeof RENEW_ADHERENCE_STATUSES)[number];

export const RENEW_EFFECTIVENESS_STATUSES = [
  'yes',
  'no',
  'unable_to_assess',
  'unsure',
  'no_unsure',
] as const;
export type RenewEffectivenessStatus = (typeof RENEW_EFFECTIVENESS_STATUSES)[number];

export const RENEW_CONCERN_STATUSES = ['no', 'yes'] as const;
export type RenewConcernStatus = (typeof RENEW_CONCERN_STATUSES)[number];

export const RENEW_ANSWER_SOURCES = ['individual', 'pharmacist_bulk_action'] as const;
export type RenewAnswerSource = (typeof RENEW_ANSWER_SOURCES)[number];

export const RENEW_ISSUE_TYPES = ['adherence', 'effectiveness', 'medication_concern'] as const;
export type RenewTherapyIssueType = (typeof RENEW_ISSUE_TYPES)[number];

export const RENEW_ADHERENCE_CATEGORIES = [
  { id: 'missed_occasionally', label: 'Missed doses occasionally' },
  { id: 'missed_frequently', label: 'Frequently missed doses' },
  { id: 'taking_differently', label: 'Taking differently than prescribed' },
  { id: 'stopped', label: 'Stopped medication' },
  { id: 'unable_to_obtain', label: 'Unable to obtain medication' },
  { id: 'prn_instead_of_scheduled', label: 'Taking only when needed' },
  { id: 'timing_issue', label: 'Dose timing issue' },
  { id: 'administration_difficulty', label: 'Difficulty using medication' },
  { id: 'cost_access', label: 'Cost / access issue' },
  { id: 'other', label: 'Other' },
  { id: 'missed_doses', label: 'Missed doses' },
] as const;
export type RenewAdherenceCategoryId = (typeof RENEW_ADHERENCE_CATEGORIES)[number]['id'];

export const RENEW_ADHERENCE_ISSUE_OPTIONS = RENEW_ADHERENCE_CATEGORIES.filter(
  (row) => row.id !== 'missed_doses',
);

export const RENEW_CONCERN_CATEGORIES = [
  { id: 'side_effect', label: 'Side effect / intolerance' },
  { id: 'drug_interaction', label: 'Drug interaction concern' },
  { id: 'dose_too_high', label: 'Dose too high' },
  { id: 'dose_too_low', label: 'Dose too low' },
  { id: 'duplicate_therapy', label: 'Duplicate therapy' },
  { id: 'no_longer_needed', label: 'Medication no longer needed' },
  { id: 'wrong_medication_or_confusion', label: 'Wrong medication / confusion' },
  { id: 'complex_regimen', label: 'Complex regimen / difficulty managing' },
  { id: 'monitoring_concern', label: 'Monitoring concern' },
  { id: 'contraindication_or_precaution', label: 'Contraindication / precaution' },
  { id: 'other', label: 'Other' },
  { id: 'administration', label: 'Administration / use difficulty' },
  { id: 'patient_concern', label: 'Patient concern' },
] as const;
export type RenewConcernCategoryId = (typeof RENEW_CONCERN_CATEGORIES)[number]['id'];

export const RENEW_CONCERN_ISSUE_OPTIONS = RENEW_CONCERN_CATEGORIES.filter(
  (row) => row.id !== 'administration' && row.id !== 'patient_concern',
);

export const RENEW_CONCERN_ACTIONS = [
  { id: 'continue_and_monitor', label: 'Continue and monitor' },
  { id: 'counselled_patient', label: 'Counselled patient' },
  { id: 'refer_to_prescriber', label: 'Refer to prescriber' },
  { id: 'do_not_renew', label: 'Hold / do not renew this medication' },
  { id: 'renew_short_term_only', label: 'Renew short-term only' },
  { id: 'recommend_follow_up_or_labs', label: 'Recommend follow-up / labs' },
  { id: 'adjusted_or_changed_plan', label: 'Adjusted / changed plan' },
  { id: 'other', label: 'Other' },
  { id: 'assess_further', label: 'Assess further' },
  { id: 'counsel_patient', label: 'Counselled patient' },
  { id: 'contact_prescriber', label: 'Refer to prescriber' },
  { id: 'monitor', label: 'Continue and monitor' },
] as const;
export type RenewConcernActionId = (typeof RENEW_CONCERN_ACTIONS)[number]['id'];

export const RENEW_CONCERN_ACTION_OPTIONS = RENEW_CONCERN_ACTIONS.filter(
  (row) =>
    row.id !== 'assess_further' &&
    row.id !== 'counsel_patient' &&
    row.id !== 'contact_prescriber' &&
    row.id !== 'monitor',
);

export interface RenewIndicationCandidate {
  conditionId: string;
  conditionCode: string;
  displayName: string;
  mappingStrength?: 'primary' | 'common' | 'possible' | 'rare' | null;
  rank?: number | null;
  confidenceBand?: 'high' | 'moderate' | 'low' | null;
}

export interface RenewMedicationIndication {
  medicationId: string;
  conditionId: string | null;
  customIndicationText: string | null;
  mappingSource: RenewMappingSource;
  status: RenewMappingStatus;
  pharmacistConfirmed: boolean;
  candidates: RenewIndicationCandidate[];
}

export interface RenewTherapyIssue {
  id: string;
  conditionKey: string;
  medicationIds: string[];
  issueType: RenewTherapyIssueType;
  issueCategory: string | null;
  actionTaken: string | null;
  details: string | null;
  otherText?: string | null;
  otherActionText?: string | null;
  requiresStep3Review: boolean;
}

export interface RenewConditionReview {
  id: string;
  conditionId: string | null;
  customConditionText: string | null;
  adherenceStatus: RenewAdherenceStatus | null;
  effectivenessStatus: RenewEffectivenessStatus | null;
  medicationConcernStatus: RenewConcernStatus | null;
  answerSource: RenewAnswerSource | null;
  issues: RenewTherapyIssue[];
  manuallyPreserved: boolean;
}

export interface RenewTherapyReviewState {
  mappings: RenewMedicationIndication[];
  reviews: RenewConditionReview[];
  suggestedConditionIds: string[];
  completed: boolean;
  completedAt: string | null;
  mappingFingerprint: string | null;
}

export const RENEW_PLAN_DECISIONS = ['renew', 'review', 'do_not_renew'] as const;
export type RenewPlanDecision = (typeof RENEW_PLAN_DECISIONS)[number];

export const RENEW_SAFETY_TONES = ['clear', 'unavailable', 'review'] as const;
export type RenewSafetyTone = (typeof RENEW_SAFETY_TONES)[number];

export const RENEW_DOCUMENT_KINDS = [
  'consultation_note',
  'renewal_summary',
  'patient_handout',
  'prescriber_notification',
] as const;
export type RenewDocumentKind = (typeof RENEW_DOCUMENT_KINDS)[number];

export const RENEW_REQUIRED_DOCUMENT_KINDS = ['consultation_note', 'renewal_summary'] as const;
export type RenewRequiredDocumentKind = (typeof RENEW_REQUIRED_DOCUMENT_KINDS)[number];

export const RENEW_OPTIONAL_DOCUMENT_KINDS = ['patient_handout', 'prescriber_notification'] as const;
export type RenewOptionalDocumentKind = (typeof RENEW_OPTIONAL_DOCUMENT_KINDS)[number];

export const RENEW_DOCUMENT_STATUSES = ['not_generated', 'generated', 'stale'] as const;
export type RenewDocumentStatus = (typeof RENEW_DOCUMENT_STATUSES)[number];

export const RENEW_PATIENT_INFO_SOURCES = ['INTAKE', 'STEP4_MANUAL', 'EXTRACTED_CONFIRMED'] as const;
export type RenewPatientInfoSource = (typeof RENEW_PATIENT_INFO_SOURCES)[number];

export interface RenewalPatientInfo {
  patientName: string;
  dateOfBirth: string;
  phn: string | null;
  source: RenewPatientInfoSource;
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** Pharmacist skipped Step 4 patient details; documents generate without identity headers. */
  skipped?: boolean;
}

export interface RenewMedicationPlanItem {
  medicationId: string;
  selected: boolean;
  decision: RenewPlanDecision;
  durationId: RenewDurationId | null;
  customDurationDays: number | null;
  customDurationText: string | null;
  pharmacistOverride: boolean;
  durationSource: RenewDurationSource;
  durationBulkActionId: string | null;
  durationApplyNote: string | null;
}

export interface RenewDurationBulkSnapshotItem {
  medicationId: string;
  durationId: RenewDurationId | null;
  customDurationDays: number | null;
  customDurationText: string | null;
  durationSource: RenewDurationSource;
  durationBulkActionId: string | null;
  durationApplyNote: string | null;
}

export interface RenewDurationBulkAction {
  bulkActionId: string;
  requestedDurationId: RenewDurationId;
  requestedCustomDays: number | null;
  requestedLabel: string;
  createdAt: string;
  snapshots: RenewDurationBulkSnapshotItem[];
  appliedIds: string[];
  skippedIds: string[];
}

export interface RenewDurationBulkResult {
  bulkActionId: string;
  requestedLabel: string;
  appliedCount: number;
  skippedCount: number;
  skippedReviewCount: number;
  preservedManualCount: number;
  canUndo: boolean;
}

export interface RenewGeneratedDocument {
  kind: RenewDocumentKind;
  status: RenewDocumentStatus;
  title: string;
  description: string;
  body: string;
  generatedAt: string | null;
  edited: boolean;
  /** Pharmacist marked this generated version reviewed in the document workspace. */
  reviewed: boolean;
  reviewedAt: string | null;
  generatedFromPlanVersion: string | null;
  generatedFromPatientInfoVersion: string | null;
  /** Hash of the live Super Admin prompt used when this body was generated. */
  generatedFromPromptHash: string | null;
  /**
   * `ai` when the Prescribe Document Session draft was accepted.
   * `template` when the Nest/deterministic body is serving (AI down, timeout, or validation).
   */
  generationSource?: 'ai' | 'template' | null;
  /** Patient-handout language. Other document kinds ignore this. */
  handoutLanguage?: string | null;
  /** Canonical English patient-handout body used for re-translation. */
  englishBody?: string | null;
  translationStatus?: string | null;
  translationMessage?: string | null;
  translationFallback?: boolean | null;
}

export const RENEW_COMMUNICATION_REQUIREMENTS = ['NOT_REQUIRED', 'REQUIRED'] as const;
export type RenewCommunicationRequirement = (typeof RENEW_COMMUNICATION_REQUIREMENTS)[number];

export const RENEW_COMMUNICATION_STATUSES = [
  'NOT_REQUIRED',
  'REQUIRED_PENDING',
  'DRAFT_GENERATED',
  'COMMUNICATED',
  'STALE',
  'TRANSMISSION_FAILED',
] as const;
export type RenewCommunicationStatus = (typeof RENEW_COMMUNICATION_STATUSES)[number];

export const RENEW_COMMUNICATION_PURPOSES = [
  'NOTIFICATION_ONLY',
  'FOLLOW_UP_REQUESTED',
  'CLARIFICATION_REQUESTED',
  'URGENT_CLINICAL_FOLLOW_UP',
] as const;
export type RenewCommunicationPurpose = (typeof RENEW_COMMUNICATION_PURPOSES)[number];

export const RENEW_COMMUNICATION_METHODS = [
  'SECURE_FAX',
  'SECURE_ELECTRONIC_MESSAGE',
  'PHONE',
  'SHARED_HEALTH_RECORD',
  'HAND_DELIVERED',
  'OTHER',
] as const;
export type RenewCommunicationMethod = (typeof RENEW_COMMUNICATION_METHODS)[number];

export const RENEW_COMMUNICATION_RECIPIENT_TYPES = [
  'ORIGINAL_PRESCRIBER',
  'PRIMARY_CARE_PRESCRIBER',
  'SPECIALIST',
  'NURSE_PRACTITIONER',
  'PHARMACIST',
  'OTHER_REGULATED_HEALTH_PROFESSIONAL',
] as const;
export type RenewCommunicationRecipientType = (typeof RENEW_COMMUNICATION_RECIPIENT_TYPES)[number];

export const RENEW_COMMUNICATION_METHOD_OPTIONS: Array<{
  id: RenewCommunicationMethod;
  label: string;
}> = [
  { id: 'SECURE_FAX', label: 'Secure fax' },
  { id: 'SECURE_ELECTRONIC_MESSAGE', label: 'Secure electronic message' },
  { id: 'PHONE', label: 'Telephone' },
  { id: 'SHARED_HEALTH_RECORD', label: 'Shared health record' },
  { id: 'HAND_DELIVERED', label: 'Hand delivered' },
  { id: 'OTHER', label: 'Other' },
];

export const RENEW_COMMUNICATION_RECIPIENT_TYPE_OPTIONS: Array<{
  id: RenewCommunicationRecipientType;
  label: string;
}> = [
  { id: 'ORIGINAL_PRESCRIBER', label: 'Original prescriber' },
  { id: 'PRIMARY_CARE_PRESCRIBER', label: 'Primary care prescriber' },
  { id: 'SPECIALIST', label: 'Specialist' },
  { id: 'NURSE_PRACTITIONER', label: 'Nurse practitioner' },
  { id: 'PHARMACIST', label: 'Pharmacist' },
  { id: 'OTHER_REGULATED_HEALTH_PROFESSIONAL', label: 'Other regulated health professional' },
];

export const RENEW_COMMUNICATION_PURPOSE_OPTIONS: Array<{
  id: RenewCommunicationPurpose;
  label: string;
}> = [
  { id: 'NOTIFICATION_ONLY', label: 'Notification only' },
  { id: 'FOLLOW_UP_REQUESTED', label: 'Follow-up requested' },
  { id: 'CLARIFICATION_REQUESTED', label: 'Clarification requested' },
  { id: 'URGENT_CLINICAL_FOLLOW_UP', label: 'Urgent clinical follow-up' },
];

export interface RenewCommunicationRecipient {
  recipientType: RenewCommunicationRecipientType;
  name: string | null;
  profession: string | null;
  clinicName: string | null;
  fax: string | null;
  phone: string | null;
  secureMessageAddress: string | null;
}

export interface RenewPrescriberCommunication {
  requirement: RenewCommunicationRequirement;
  status: RenewCommunicationStatus;
  purpose: RenewCommunicationPurpose;
  recipient: RenewCommunicationRecipient | null;
  noAffectedProfessional: boolean;
  method: RenewCommunicationMethod | null;
  communicatedAt: string | null;
  communicatedBy: string | null;
  note: string | null;
  phoneSummary: string | null;
}

export interface RenewDecisionState {
  items: RenewMedicationPlanItem[];
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
  planVersionId: string | null;
  planExpanded: boolean;
  docsExpanded: boolean;
  patientInfo: RenewalPatientInfo;
  patientInfoVersion: string | null;
  documents: RenewGeneratedDocument[];
  communication: RenewPrescriberCommunication;
  pharmacistAttested: boolean;
  attestedAt: string | null;
  planFingerprint: string | null;
  lastDurationBulk: RenewDurationBulkAction | null;
  lastDurationBulkResult: RenewDurationBulkResult | null;
}

export interface RenewPayload {
  version: 1;
  medicationList: RenewMedicationListState;
  renewalRequest: RenewRequestState;
  therapyReview: RenewTherapyReviewState;
  monitoringSafety: RenewMonitoringSafetyState;
  renewalDecision: RenewDecisionState;
}

export function emptyTherapyReview(): RenewTherapyReviewState {
  return {
    mappings: [],
    reviews: [],
    suggestedConditionIds: [],
    completed: false,
    completedAt: null,
    mappingFingerprint: null,
  };
}

export function emptyRenewalPatientInfo(): RenewalPatientInfo {
  return {
    patientName: '',
    dateOfBirth: '',
    phn: null,
    source: 'STEP4_MANUAL',
    confirmedAt: null,
    confirmedBy: null,
    skipped: false,
  };
}

export function emptyRenewDocument(
  kind: RenewDocumentKind,
  extras?: Partial<RenewGeneratedDocument>,
): RenewGeneratedDocument {
  const templates: Record<RenewDocumentKind, Pick<RenewGeneratedDocument, 'title' | 'description'>> = {
    consultation_note: {
      title: 'Pharmacist Renewal Assessment',
      description: 'Permanent DAP clinical record. Print, PDF, fax, and Kroll copy use this same document.',
    },
    renewal_summary: {
      title: 'Pharmacist Prescription',
      description: 'Formal pharmacist prescription from the confirmed renewal plan. Deterministic; review before authorizing.',
    },
    patient_handout: {
      title: 'Your Medication Renewal',
      description:
        'Optional plain-language medication renewal handout. Deterministic from the confirmed plan; never blocks completing the consultation.',
    },
    prescriber_notification: {
      title: 'Prescriber Communication',
      description:
        'Concise pharmacist renewal notification. Recipient stays on the fax/cover sheet; generating or copying does not record that the recipient was notified.',
    },
  };
  return {
    kind,
    status: 'not_generated',
    title: templates[kind].title,
    description: templates[kind].description,
    body: '',
    generatedAt: null,
    edited: false,
    reviewed: false,
    reviewedAt: null,
    generatedFromPlanVersion: null,
    generatedFromPatientInfoVersion: null,
    generatedFromPromptHash: null,
    generationSource: extras?.generationSource ?? null,
    ...extras,
  };
}

export function emptyRenewDocuments(): RenewGeneratedDocument[] {
  return RENEW_DOCUMENT_KINDS.map((kind) => emptyRenewDocument(kind));
}

export function mergeRenewDocuments(existing: RenewGeneratedDocument[]): RenewGeneratedDocument[] {
  const byKind = new Map(existing.map((row) => [row.kind, row]));
  return emptyRenewDocuments().map((row) => {
    const current = byKind.get(row.kind);
    if (!current) return row;
    return {
      ...row,
      ...current,
      title: current.title || row.title,
      description: current.description || row.description,
    };
  });
}

/** Consultation note uses the Renew compact DAP prompt; PCP uses the Renew provider-communication prompt. */
export const RENEW_LLM_DOCUMENT_KINDS: readonly RenewDocumentKind[] = [
  'consultation_note',
  'prescriber_notification',
];

export function isRenewLlmDocumentKind(
  kind: RenewDocumentKind,
): kind is 'consultation_note' | 'prescriber_notification' {
  return kind === 'consultation_note' || kind === 'prescriber_notification';
}

/** True when a generated LLM document is serving the Nest/template body instead of an accepted AI draft. */
export function renewLlmDocumentsUsedFallback(documents: RenewGeneratedDocument[]): boolean {
  return documents.some(
    (doc) =>
      isRenewLlmDocumentKind(doc.kind) &&
      doc.status === 'generated' &&
      Boolean(doc.body.trim()) &&
      doc.generationSource !== 'ai',
  );
}

export function isRequiredRenewDocument(kind: RenewDocumentKind): boolean {
  return (RENEW_REQUIRED_DOCUMENT_KINDS as readonly string[]).includes(kind);
}

export function emptyRenewCommunication(): RenewPrescriberCommunication {
  return {
    requirement: 'NOT_REQUIRED',
    status: 'NOT_REQUIRED',
    purpose: 'NOTIFICATION_ONLY',
    recipient: null,
    noAffectedProfessional: false,
    method: null,
    communicatedAt: null,
    communicatedBy: null,
    note: null,
    phoneSummary: null,
  };
}

export function emptyRenewalDecision(): RenewDecisionState {
  return {
    items: [],
    confirmed: false,
    confirmedAt: null,
    confirmedBy: null,
    planVersionId: null,
    planExpanded: true,
    docsExpanded: false,
    patientInfo: emptyRenewalPatientInfo(),
    patientInfoVersion: null,
    documents: emptyRenewDocuments(),
    communication: emptyRenewCommunication(),
    pharmacistAttested: false,
    attestedAt: null,
    planFingerprint: null,
    lastDurationBulk: null,
    lastDurationBulkResult: null,
  };
}

export function isEmptyRenewalDecision(state: RenewDecisionState | null | undefined): boolean {
  if (!state) return true;
  return (
    !state.items.length &&
    !state.confirmed &&
    !state.pharmacistAttested &&
    !state.documents.some((doc) => doc.status !== 'not_generated' || Boolean(doc.body.trim())) &&
    !state.patientInfo.patientName.trim() &&
    !state.patientInfo.dateOfBirth.trim()
  );
}

export function emptyRenewPayload(): RenewPayload {
  return {
    version: 1,
    medicationList: {
      items: [],
      confirmed: false,
      expanded: true,
      confirmedAt: null,
      lastImportSummary: null,
    },
    renewalRequest: {
      expanded: false,
      requestedDuration: null,
      customDurationDays: null,
      customDurationText: null,
      reasons: [],
      otherReasonText: '',
      verifiedFrom: null,
      otherVerifiedText: '',
      pharmacistConfirmedAccuracy: false,
    },
    therapyReview: emptyTherapyReview(),
    monitoringSafety: emptyMonitoringSafety(),
    renewalDecision: emptyRenewalDecision(),
  };
}

export function isRenewDbStep(step: string | null | undefined): step is RenewDbStep {
  return Boolean(step && (RENEW_DB_STEPS as readonly string[]).includes(step));
}

export function renewDbStepToUIStepId(dbStep: string | null | undefined): RenewUIStepId {
  if (
    dbStep === 'RENEW_DECISION' ||
    dbStep === 'RENEW_DOCUMENTATION' ||
    dbStep === 'RENEW_SUMMARY'
  ) {
    return 'RENEW_AND_DOCUMENT';
  }
  const match = RENEW_UI_STEPS.find((s) => s.dbStep === dbStep);
  return match?.id ?? 'MEDICATIONS_TO_RENEW';
}

export function renewUIStepToDbStep(uiStep: RenewUIStepId): RenewDbStep {
  return RENEW_UI_STEPS.find((s) => s.id === uiStep)?.dbStep ?? 'RENEW_MEDICATIONS';
}

export function renewUIIndex(uiStep: RenewUIStepId): number {
  const idx = RENEW_UI_STEPS.findIndex((s) => s.id === uiStep);
  return idx >= 0 ? idx : 0;
}

export function medicationDisplayName(med: RenewMedication): string {
  const n = med.normalized;
  const source = med.productIdentity?.sourceDisplayName?.trim() || med.raw.medicationText?.trim();
  const product = med.productIdentity?.productName?.trim();
  const brand = n.brandName?.trim();
  const generic = n.genericName?.trim();
  const strength = n.strength?.trim();
  const form = n.dosageForm?.trim();
  const name = source || product || brand || generic || 'Untitled medication';
  const bits = [name];
  if (strength && !name.toLowerCase().includes(strength.toLowerCase())) bits.push(strength);
  if (form && !name.toLowerCase().includes(form.toLowerCase()) && !source?.toLowerCase().includes(form.toLowerCase())) {
    bits.push(form);
  }
  return bits.join(' ');
}

export function medicationClinicalLabel(med: RenewMedication): string | null {
  const clinical = med.clinicalIdentity?.ingredientNames[0]?.trim() || med.normalized.genericName?.trim() || null;
  if (!clinical) return null;
  const display = medicationDisplayName(med).toLowerCase();
  if (display.includes(clinical.toLowerCase())) return null;
  return clinical;
}

export function medicationShortName(med: RenewMedication): string {
  return (
    med.normalized.genericName?.trim() ||
    med.normalized.brandName?.trim() ||
    med.raw.medicationText?.trim() ||
    'Medication'
  );
}

export function medicationDirections(med: RenewMedication): string | null {
  return med.normalized.directions?.trim() || med.raw.directionsText?.trim() || null;
}

export function medicationQuantityLabel(med: RenewMedication): string | null {
  const quantity = med.normalized.quantity;
  const unit =
    med.normalized.quantityUnit?.trim() ||
    med.raw.quantityText?.replace(/[\d.,]+/g, '').trim() ||
    (med.normalized.dosageForm?.toLowerCase().includes('tablet') ? 'tablets' : null);
  if (quantity != null && unit) return `${quantity} ${unit}`;
  if (quantity != null) return String(quantity);
  return med.raw.quantityText?.trim() || null;
}

export function formatRenewDuration(
  request: Pick<RenewRequestState, 'requestedDuration' | 'customDurationDays' | 'customDurationText'>,
): string | null {
  if (!request.requestedDuration) return null;
  if (request.requestedDuration === 'custom') {
    if (request.customDurationDays && request.customDurationDays > 0) {
      return `${request.customDurationDays} days`;
    }
    return request.customDurationText?.trim() || 'Custom';
  }
  return RENEW_DURATION_OPTIONS.find((o) => o.id === request.requestedDuration)?.label ?? null;
}

export function formatRenewReasons(request: Pick<RenewRequestState, 'reasons' | 'otherReasonText'>): string | null {
  if (!request.reasons.length) return null;
  const labels = request.reasons.map((id) => {
    if (id === 'other' && request.otherReasonText?.trim()) return request.otherReasonText.trim();
    return RENEW_REASON_OPTIONS.find((o) => o.id === id)?.label ?? id;
  });
  return labels.join(', ');
}

export function formatVerifiedFrom(
  request: Pick<RenewRequestState, 'verifiedFrom' | 'otherVerifiedText'>,
): string | null {
  if (!request.verifiedFrom) return null;
  if (request.verifiedFrom === 'other' && request.otherVerifiedText?.trim()) {
    return request.otherVerifiedText.trim();
  }
  return RENEW_VERIFIED_FROM_OPTIONS.find((o) => o.id === request.verifiedFrom)?.label ?? null;
}

export function prefillVerifiedFrom(
  sourceSystem?: string | null,
  documentType?: string | null,
): RenewVerifiedFromId | null {
  const blob = `${sourceSystem ?? ''} ${documentType ?? ''}`.toLowerCase();
  if (/(netcare|pharmanet|provincial)/.test(blob)) return 'provincial_medication_record';
  if (/(kroll|pharmacy|dispens|compliance|blister)/.test(blob)) return 'pharmacy_dispensing_record';
  if (/(label|rx\b)/.test(blob)) return 'rx_medication_label';
  return null;
}

export interface RenewDuplicatePair {
  aId: string;
  bId: string;
  aLabel: string;
  bLabel: string;
  reason: 'same_din' | 'same_concept' | 'same_generic_strength_form';
}

function dinKey(med: RenewMedication): string | null {
  const din = med.normalized.din?.replace(/\D/g, '') ?? '';
  return din.length >= 6 ? din : null;
}

function identityKey(med: RenewMedication): string | null {
  const concept = med.normalized.medicationConceptId?.trim().toLowerCase();
  if (concept) return `concept:${concept}`;
  const din = dinKey(med);
  if (din) return `din:${din}`;
  return null;
}

function clinicalKeys(med: RenewMedication): string[] {
  const ingredients = baseIngredientKeys(
    med.normalized.genericName,
    med.normalized.brandName,
    med.raw.medicationText,
  );
  const strength = normalizeMedicationKey(med.normalized.strength ?? '');
  const form = normalizeMedicationKey(med.normalized.dosageForm ?? '');
  return ingredients.map((ingredient) => `${ingredient}|${strength}|${form}`);
}

export function renewDuplicateReason(
  a: RenewMedication,
  b: RenewMedication,
): RenewDuplicatePair['reason'] | null {
  const aDin = dinKey(a);
  const bDin = dinKey(b);
  if (aDin && bDin && aDin === bDin) return 'same_din';

  const aId = identityKey(a);
  const bId = identityKey(b);
  if (aId && bId && aId === bId) return 'same_concept';

  const aClin = new Set(clinicalKeys(a));
  const bClin = clinicalKeys(b);
  if (aClin.size && bClin.some((key) => aClin.has(key))) {
    return 'same_generic_strength_form';
  }

  return null;
}

export function findRenewDuplicates(items: RenewMedication[]): RenewDuplicatePair[] {
  const pairs: RenewDuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a || !b) continue;

      const reason = renewDuplicateReason(a, b);
      if (!reason) continue;
      const key = [a.id, b.id].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        aId: a.id,
        bId: b.id,
        aLabel: medicationDisplayName(a),
        bLabel: medicationDisplayName(b),
        reason,
      });
    }
  }

  return pairs;
}

function pickText(a?: string | null, b?: string | null): string | null {
  const left = a?.trim() || null;
  const right = b?.trim() || null;
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}

function pickNumber(a?: number | null, b?: number | null): number | null {
  return a != null && Number.isFinite(a) ? a : b != null && Number.isFinite(b) ? b : null;
}

function pickConfidence(a?: number | null, b?: number | null): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

function pickQuantity(
  a: number | null | undefined,
  aConf: number | null | undefined,
  b: number | null | undefined,
  bConf: number | null | undefined,
): number | null {
  if (a == null) return pickNumber(null, b);
  if (b == null) return a;
  return (bConf ?? 0) > (aConf ?? 0) ? b : a;
}

function mergeSchedule(
  a: RenewMedication['normalized']['complianceSchedule'],
  b: RenewMedication['normalized']['complianceSchedule'],
): RenewMedication['normalized']['complianceSchedule'] {
  if (!a && !b) return null;
  return {
    morning: a?.morning ?? b?.morning ?? null,
    noon: a?.noon ?? b?.noon ?? null,
    evening: a?.evening ?? b?.evening ?? null,
    bedtime: a?.bedtime ?? b?.bedtime ?? null,
  };
}

function mergeCcddStatus(
  a: RenewCcddMatchStatus,
  b: RenewCcddMatchStatus,
): RenewCcddMatchStatus {
  const rank = { matched: 2, ambiguous: 1, unmatched: 0 };
  return rank[a] >= rank[b] ? a : b;
}

function mergeExtractedPair(keeper: RenewMedication, other: RenewMedication): RenewMedication {
  const quantity = pickQuantity(
    keeper.normalized.quantity,
    keeper.confidence.quantity,
    other.normalized.quantity,
    other.confidence.quantity,
  );
  const ccddMatchStatus = mergeCcddStatus(keeper.ccddMatchStatus, other.ccddMatchStatus);
  const merged: RenewMedication = {
    ...keeper,
    raw: {
      medicationText: pickText(keeper.raw.medicationText, other.raw.medicationText),
      directionsText: pickText(keeper.raw.directionsText, other.raw.directionsText),
      quantityText: pickText(keeper.raw.quantityText, other.raw.quantityText),
      prescriberText: pickText(keeper.raw.prescriberText, other.raw.prescriberText),
      dateText: pickText(keeper.raw.dateText, other.raw.dateText),
    },
    normalized: {
      ...keeper.normalized,
      medicationConceptId:
        keeper.normalized.medicationConceptId ?? other.normalized.medicationConceptId ?? null,
      din: keeper.normalized.din ?? other.normalized.din ?? null,
      brandName: pickText(keeper.normalized.brandName, other.normalized.brandName),
      genericName: pickText(keeper.normalized.genericName, other.normalized.genericName),
      strength: pickText(keeper.normalized.strength, other.normalized.strength),
      dosageForm: pickText(keeper.normalized.dosageForm, other.normalized.dosageForm),
      route: pickText(keeper.normalized.route, other.normalized.route),
      directions: pickText(keeper.normalized.directions, other.normalized.directions),
      directionsNormalized: pickText(
        keeper.normalized.directionsNormalized,
        other.normalized.directionsNormalized,
      ),
      frequency: pickText(keeper.normalized.frequency, other.normalized.frequency),
      dose: pickText(keeper.normalized.dose, other.normalized.dose),
      doseUnit: pickText(keeper.normalized.doseUnit, other.normalized.doseUnit),
      quantity,
      quantityUnit: pickText(keeper.normalized.quantityUnit, other.normalized.quantityUnit),
      prescriberName: pickText(keeper.normalized.prescriberName, other.normalized.prescriberName),
      prescribedDate: pickText(keeper.normalized.prescribedDate, other.normalized.prescribedDate),
      lastFillDate: pickText(keeper.normalized.lastFillDate, other.normalized.lastFillDate),
      refillsRemaining: pickNumber(
        keeper.normalized.refillsRemaining,
        other.normalized.refillsRemaining,
      ),
      previousAuthorizedRefills: pickNumber(
        keeper.normalized.previousAuthorizedRefills,
        other.normalized.previousAuthorizedRefills,
      ),
      complianceSchedule: mergeSchedule(
        keeper.normalized.complianceSchedule,
        other.normalized.complianceSchedule,
      ),
    },
    confidence: {
      medication: pickConfidence(keeper.confidence.medication, other.confidence.medication),
      strength: pickConfidence(keeper.confidence.strength, other.confidence.strength),
      directions: pickConfidence(keeper.confidence.directions, other.confidence.directions),
      quantity: pickConfidence(keeper.confidence.quantity, other.confidence.quantity),
      prescriber: pickConfidence(keeper.confidence.prescriber, other.confidence.prescriber),
      dates: pickConfidence(keeper.confidence.dates, other.confidence.dates),
    },
    ccddMatchStatus,
    ccddCandidates:
      ccddMatchStatus === 'ambiguous'
        ? [...(keeper.ccddCandidates ?? []), ...(other.ccddCandidates ?? [])].slice(0, 6)
        : [],
    resolutionStatus: keeper.resolutionStatus ?? other.resolutionStatus,
    productIdentity: keeper.productIdentity ?? other.productIdentity,
    clinicalIdentity: keeper.clinicalIdentity ?? other.clinicalIdentity,
    pharmacistEdited: keeper.pharmacistEdited || other.pharmacistEdited,
  };
  merged.reviewStatus = deriveReviewStatus(merged);
  return merged;
}

/** Collapse the same medication extracted more than once (e.g. overlapping screenshots). */
export function mergeExtractedDuplicates(items: RenewMedication[]): RenewMedication[] {
  const kept: RenewMedication[] = [];
  for (const item of items) {
    const index = kept.findIndex((existing) => renewDuplicateReason(existing, item));
    if (index === -1) {
      kept.push(item);
      continue;
    }
    const current = kept[index];
    if (current) kept[index] = mergeExtractedPair(current, item);
  }
  return kept;
}

export function fieldNeedsReview(confidence: number | null | undefined): boolean {
  if (confidence == null) return false;
  const value = confidence > 1 ? confidence / 100 : confidence;
  return value < 0.75;
}

export function deriveReviewStatus(
  med: Pick<
    RenewMedication,
    'confidence' | 'ccddMatchStatus' | 'pharmacistEdited' | 'resolutionStatus'
  >,
): RenewReviewStatus {
  if (med.pharmacistEdited) return 'confirmed';
  if (
    med.resolutionStatus === 'PHARMACIST_REVIEW_REQUIRED' ||
    med.resolutionStatus === 'UNRESOLVED' ||
    med.ccddMatchStatus === 'ambiguous'
  ) {
    return 'needs_review';
  }
  const conf = med.confidence;
  if (
    fieldNeedsReview(conf.medication) ||
    fieldNeedsReview(conf.strength) ||
    fieldNeedsReview(conf.directions) ||
    fieldNeedsReview(conf.quantity) ||
    fieldNeedsReview(conf.prescriber) ||
    fieldNeedsReview(conf.dates)
  ) {
    return 'needs_review';
  }
  return 'not_reviewed';
}

const DURATION_IDS = new Set<string>(RENEW_DURATION_OPTIONS.map((o) => o.id));
const DURATION_SOURCE_IDS = new Set<string>(RENEW_DURATION_SOURCES);
const REASON_IDS = new Set<string>(RENEW_REASON_OPTIONS.map((o) => o.id));
const VERIFIED_IDS = new Set<string>(RENEW_VERIFIED_FROM_OPTIONS.map((o) => o.id));

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asIsoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return toIsoCalendarDate(raw) ?? raw;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function parseEffectivenessStatus(value: string | null): RenewEffectivenessStatus | null {
  if (value === 'unsure' || value === 'no_unsure' || value === 'unable_to_assess') {
    return 'unable_to_assess';
  }
  if (value === 'yes' || value === 'no') return value;
  return null;
}

const MAPPING_SOURCES = new Set<string>(RENEW_MAPPING_SOURCES);
const MAPPING_STATUSES = new Set<string>(RENEW_MAPPING_STATUSES);
const ADHERENCE_STATUSES = new Set<string>(RENEW_ADHERENCE_STATUSES);
const CONCERN_STATUSES = new Set<string>(RENEW_CONCERN_STATUSES);
const ANSWER_SOURCES = new Set<string>(RENEW_ANSWER_SOURCES);
const ISSUE_TYPES = new Set<string>(RENEW_ISSUE_TYPES);

function parseIndicationCandidate(raw: unknown): RenewIndicationCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const conditionId = asString(src.conditionId);
  const conditionCode = asString(src.conditionCode);
  const displayName = asString(src.displayName);
  if (!conditionId || !conditionCode || !displayName) return null;
  const strength = asString(src.mappingStrength);
  const band = asString(src.confidenceBand);
  return {
    conditionId,
    conditionCode,
    displayName,
    mappingStrength:
      strength === 'primary' || strength === 'common' || strength === 'possible' || strength === 'rare'
        ? strength
        : null,
    rank: asNumber(src.rank),
    confidenceBand: band === 'high' || band === 'moderate' || band === 'low' ? band : null,
  };
}

function parseTherapyIssue(raw: unknown): RenewTherapyIssue | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const id = asString(src.id);
  const conditionKey = asString(src.conditionKey);
  const issueType = asString(src.issueType);
  if (!id || !conditionKey || !issueType || !ISSUE_TYPES.has(issueType)) return null;
  const medicationIds = Array.isArray(src.medicationIds)
    ? src.medicationIds.map((v) => asString(v)).filter((v): v is string => Boolean(v))
    : [];
  return {
    id,
    conditionKey,
    medicationIds,
    issueType: issueType as RenewTherapyIssueType,
    issueCategory: asString(src.issueCategory),
    actionTaken: asString(src.actionTaken),
    details: asString(src.details),
    otherText: asString(src.otherText),
    otherActionText: asString(src.otherActionText),
    requiresStep3Review: src.requiresStep3Review === false ? false : true,
  };
}

function parseConditionReview(raw: unknown): RenewConditionReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const id = asString(src.id);
  if (!id) return null;
  const adherence = asString(src.adherenceStatus);
  const effectiveness = asString(src.effectivenessStatus);
  const concern = asString(src.medicationConcernStatus);
  const answerSource = asString(src.answerSource);
  return {
    id,
    conditionId: asString(src.conditionId),
    customConditionText: asString(src.customConditionText),
    adherenceStatus:
      adherence && ADHERENCE_STATUSES.has(adherence) ? (adherence as RenewAdherenceStatus) : null,
    effectivenessStatus: parseEffectivenessStatus(effectiveness),
    medicationConcernStatus:
      concern && CONCERN_STATUSES.has(concern) ? (concern as RenewConcernStatus) : null,
    answerSource:
      answerSource && ANSWER_SOURCES.has(answerSource) ? (answerSource as RenewAnswerSource) : null,
    issues: Array.isArray(src.issues)
      ? src.issues.map(parseTherapyIssue).filter((row): row is RenewTherapyIssue => Boolean(row))
      : [],
    manuallyPreserved: asBool(src.manuallyPreserved),
  };
}

function parseMedicationIndication(raw: unknown): RenewMedicationIndication | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const medicationId = asString(src.medicationId);
  if (!medicationId) return null;
  const source = asString(src.mappingSource);
  const status = asString(src.status);
  return {
    medicationId,
    conditionId: asString(src.conditionId),
    customIndicationText: asString(src.customIndicationText),
    mappingSource:
      source && MAPPING_SOURCES.has(source) ? (source as RenewMappingSource) : 'curated_auto',
    status:
      status && MAPPING_STATUSES.has(status) ? (status as RenewMappingStatus) : 'needs_confirmation',
    pharmacistConfirmed: asBool(src.pharmacistConfirmed),
    candidates: Array.isArray(src.candidates)
      ? src.candidates
          .map(parseIndicationCandidate)
          .filter((row): row is RenewIndicationCandidate => Boolean(row))
      : [],
  };
}

export function parseTherapyReview(raw: unknown): RenewTherapyReviewState {
  const base = emptyTherapyReview();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  return {
    mappings: Array.isArray(src.mappings)
      ? src.mappings
          .map(parseMedicationIndication)
          .filter((row): row is RenewMedicationIndication => Boolean(row))
      : [],
    reviews: Array.isArray(src.reviews)
      ? src.reviews.map(parseConditionReview).filter((row): row is RenewConditionReview => Boolean(row))
      : [],
    suggestedConditionIds: Array.isArray(src.suggestedConditionIds)
      ? src.suggestedConditionIds.map((v) => asString(v)).filter((v): v is string => Boolean(v))
      : [],
    completed: asBool(src.completed),
    completedAt: asString(src.completedAt),
    mappingFingerprint: asString(src.mappingFingerprint),
  };
}

export function isEmptyTherapyReview(review: RenewTherapyReviewState | null | undefined): boolean {
  if (!review) return true;
  return !review.mappings.length && !review.reviews.length && !review.completed;
}

const PLAN_DECISIONS = new Set<string>(RENEW_PLAN_DECISIONS);
const DOCUMENT_KINDS = new Set<string>(RENEW_DOCUMENT_KINDS);
const DOCUMENT_STATUSES = new Set<string>(RENEW_DOCUMENT_STATUSES);
const COMMUNICATION_REQUIREMENTS = new Set<string>(RENEW_COMMUNICATION_REQUIREMENTS);
const COMMUNICATION_STATUSES = new Set<string>(RENEW_COMMUNICATION_STATUSES);
const COMMUNICATION_PURPOSES = new Set<string>(RENEW_COMMUNICATION_PURPOSES);
const COMMUNICATION_METHODS = new Set<string>(RENEW_COMMUNICATION_METHODS);
const COMMUNICATION_RECIPIENT_TYPES = new Set<string>(RENEW_COMMUNICATION_RECIPIENT_TYPES);

function parseCommunicationRecipient(raw: unknown): RenewCommunicationRecipient | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const recipientType = asString(src.recipientType);
  if (!recipientType || !COMMUNICATION_RECIPIENT_TYPES.has(recipientType)) return null;
  return {
    recipientType: recipientType as RenewCommunicationRecipientType,
    name: asString(src.name),
    profession: asString(src.profession),
    clinicName: asString(src.clinicName),
    fax: asString(src.fax),
    phone: asString(src.phone),
    secureMessageAddress: asString(src.secureMessageAddress),
  };
}

function parseCommunication(raw: unknown): RenewPrescriberCommunication {
  const base = emptyRenewCommunication();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  const requirement = asString(src.requirement);
  const status = asString(src.status);
  const purpose = asString(src.purpose);
  const method = asString(src.method);
  return {
    requirement:
      requirement && COMMUNICATION_REQUIREMENTS.has(requirement)
        ? (requirement as RenewCommunicationRequirement)
        : base.requirement,
    status:
      status && COMMUNICATION_STATUSES.has(status)
        ? (status as RenewCommunicationStatus)
        : base.status,
    purpose:
      purpose && COMMUNICATION_PURPOSES.has(purpose)
        ? (purpose as RenewCommunicationPurpose)
        : base.purpose,
    recipient: parseCommunicationRecipient(src.recipient),
    noAffectedProfessional: asBool(src.noAffectedProfessional),
    method:
      method && COMMUNICATION_METHODS.has(method) ? (method as RenewCommunicationMethod) : null,
    communicatedAt: asString(src.communicatedAt),
    communicatedBy: asString(src.communicatedBy),
    note: asString(src.note),
    phoneSummary: asString(src.phoneSummary),
  };
}

function parseDurationSource(value: unknown): RenewDurationSource {
  const source = asString(value);
  return source && DURATION_SOURCE_IDS.has(source) ? (source as RenewDurationSource) : 'DEFAULT';
}

function parsePlanItem(raw: unknown): RenewMedicationPlanItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const medicationId = asString(src.medicationId);
  if (!medicationId) return null;
  const decision = asString(src.decision);
  const duration = asString(src.durationId);
  const selected = src.selected === true;
  return {
    medicationId,
    selected,
    decision:
      decision && PLAN_DECISIONS.has(decision)
        ? (decision as RenewPlanDecision)
        : selected
          ? 'renew'
          : 'do_not_renew',
    durationId: duration && DURATION_IDS.has(duration) ? (duration as RenewDurationId) : null,
    customDurationDays: asNumber(src.customDurationDays),
    customDurationText: asString(src.customDurationText),
    pharmacistOverride: asBool(src.pharmacistOverride),
    durationSource: parseDurationSource(src.durationSource),
    durationBulkActionId: asString(src.durationBulkActionId),
    durationApplyNote: asString(src.durationApplyNote),
  };
}

function parseDurationBulkSnapshotItem(raw: unknown): RenewDurationBulkSnapshotItem | null {
  const item = parsePlanItem(raw);
  if (!item) return null;
  return {
    medicationId: item.medicationId,
    durationId: item.durationId,
    customDurationDays: item.customDurationDays,
    customDurationText: item.customDurationText,
    durationSource: item.durationSource,
    durationBulkActionId: item.durationBulkActionId,
    durationApplyNote: item.durationApplyNote,
  };
}

function parseDurationBulkAction(raw: unknown): RenewDurationBulkAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const bulkActionId = asString(src.bulkActionId);
  const requestedDurationId = asString(src.requestedDurationId);
  if (!bulkActionId || !requestedDurationId || !DURATION_IDS.has(requestedDurationId)) return null;
  const snapshots = Array.isArray(src.snapshots)
    ? src.snapshots
        .map(parseDurationBulkSnapshotItem)
        .filter((row): row is RenewDurationBulkSnapshotItem => Boolean(row))
    : [];
  return {
    bulkActionId,
    requestedDurationId: requestedDurationId as RenewDurationId,
    requestedCustomDays: asNumber(src.requestedCustomDays),
    requestedLabel: asString(src.requestedLabel) ?? 'Duration',
    createdAt: asString(src.createdAt) ?? new Date().toISOString(),
    snapshots,
    appliedIds: Array.isArray(src.appliedIds)
      ? src.appliedIds.map((id) => asString(id)).filter((id): id is string => Boolean(id))
      : [],
    skippedIds: Array.isArray(src.skippedIds)
      ? src.skippedIds.map((id) => asString(id)).filter((id): id is string => Boolean(id))
      : [],
  };
}

function parseDurationBulkResult(raw: unknown): RenewDurationBulkResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const bulkActionId = asString(src.bulkActionId);
  if (!bulkActionId) return null;
  return {
    bulkActionId,
    requestedLabel: asString(src.requestedLabel) ?? 'Duration',
    appliedCount: asNumber(src.appliedCount) ?? 0,
    skippedCount: asNumber(src.skippedCount) ?? 0,
    skippedReviewCount: asNumber(src.skippedReviewCount) ?? 0,
    preservedManualCount: asNumber(src.preservedManualCount) ?? 0,
    canUndo: src.canUndo === true,
  };
}

function parseGeneratedDocument(raw: unknown): RenewGeneratedDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const kind = asString(src.kind);
  if (!kind || !DOCUMENT_KINDS.has(kind)) return null;
  const status = asString(src.status);
  const fallback = emptyRenewDocument(kind as RenewDocumentKind);
  return {
    kind: kind as RenewDocumentKind,
    status:
      status && DOCUMENT_STATUSES.has(status) ? (status as RenewDocumentStatus) : 'not_generated',
    title: asString(src.title) ?? fallback.title,
    description: asString(src.description) ?? fallback.description,
    body: typeof src.body === 'string' ? src.body : '',
    generatedAt: asString(src.generatedAt),
    edited: asBool(src.edited),
    reviewed: asBool(src.reviewed),
    reviewedAt: asString(src.reviewedAt),
    generatedFromPlanVersion: asString(src.generatedFromPlanVersion),
    generatedFromPatientInfoVersion: asString(src.generatedFromPatientInfoVersion),
    generatedFromPromptHash: asString(src.generatedFromPromptHash),
    generationSource:
      src.generationSource === 'ai' || src.generationSource === 'template'
        ? src.generationSource
        : null,
    handoutLanguage: asString(src.handoutLanguage),
    englishBody: typeof src.englishBody === 'string' ? src.englishBody : null,
    translationStatus: asString(src.translationStatus),
    translationMessage: asString(src.translationMessage),
    translationFallback: src.translationFallback == null ? null : src.translationFallback === true,
  };
}

function parsePatientInfo(raw: unknown): RenewalPatientInfo {
  const base = emptyRenewalPatientInfo();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  const source = asString(src.source);
  return {
    patientName: asString(src.patientName) ?? '',
    dateOfBirth: asString(src.dateOfBirth) ?? '',
    phn: asString(src.phn),
    source:
      source && (RENEW_PATIENT_INFO_SOURCES as readonly string[]).includes(source)
        ? (source as RenewPatientInfoSource)
        : 'STEP4_MANUAL',
    confirmedAt: asString(src.confirmedAt),
    confirmedBy: asString(src.confirmedBy),
    skipped: src.skipped === true,
  };
}

export function parseRenewalDecision(raw: unknown): RenewDecisionState {
  const base = emptyRenewalDecision();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  const parsedDocs = Array.isArray(src.documents)
    ? src.documents.map(parseGeneratedDocument).filter((row): row is RenewGeneratedDocument => Boolean(row))
    : [];
  return {
    items: Array.isArray(src.items)
      ? src.items.map(parsePlanItem).filter((row): row is RenewMedicationPlanItem => Boolean(row))
      : [],
    confirmed: asBool(src.confirmed),
    confirmedAt: asString(src.confirmedAt),
    confirmedBy: asString(src.confirmedBy),
    planVersionId: asString(src.planVersionId),
    planExpanded: src.planExpanded === false ? false : src.confirmed === true ? false : true,
    docsExpanded: src.docsExpanded === true || asBool(src.confirmed),
    patientInfo: parsePatientInfo(src.patientInfo),
    patientInfoVersion: asString(src.patientInfoVersion),
    documents: mergeRenewDocuments(parsedDocs),
    communication: parseCommunication(src.communication),
    pharmacistAttested: asBool(src.pharmacistAttested),
    attestedAt: asString(src.attestedAt),
    planFingerprint: asString(src.planFingerprint),
    lastDurationBulk: parseDurationBulkAction(src.lastDurationBulk),
    lastDurationBulkResult: parseDurationBulkResult(src.lastDurationBulkResult),
  };
}

export function parseRenewPayload(raw: unknown): RenewPayload {
  const base = emptyRenewPayload();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  const list = (src.medicationList ?? src) as Record<string, unknown>;
  const request = (src.renewalRequest ?? {}) as Record<string, unknown>;

  const items = Array.isArray(list.items)
    ? list.items.map(parseRenewMedication).filter((m): m is RenewMedication => Boolean(m))
    : [];

  const duration = asString(request.requestedDuration);
  const reasons = Array.isArray(request.reasons)
    ? request.reasons
        .map((r) => String(r))
        .filter((id): id is RenewReasonId => REASON_IDS.has(id))
    : [];
  const verified = asString(request.verifiedFrom);

  return {
    version: 1,
    medicationList: {
      items,
      confirmed: asBool(list.confirmed),
      expanded: list.expanded === false ? false : items.length === 0 || !asBool(list.confirmed),
      confirmedAt: asString(list.confirmedAt),
      lastImportSummary: asString(list.lastImportSummary),
    },
    renewalRequest: {
      expanded: request.expanded === true || asBool(list.confirmed),
      requestedDuration:
        duration && DURATION_IDS.has(duration) ? (duration as RenewDurationId) : null,
      customDurationDays: asNumber(request.customDurationDays),
      customDurationText: asString(request.customDurationText),
      reasons,
      otherReasonText: asString(request.otherReasonText) ?? '',
      verifiedFrom:
        verified && VERIFIED_IDS.has(verified) ? (verified as RenewVerifiedFromId) : null,
      otherVerifiedText: asString(request.otherVerifiedText) ?? '',
      pharmacistConfirmedAccuracy: asBool(request.pharmacistConfirmedAccuracy),
    },
    therapyReview: parseTherapyReview(src.therapyReview),
    monitoringSafety: parseMonitoringSafety(src.monitoringSafety),
    renewalDecision: parseRenewalDecision(src.renewalDecision),
  };
}

function parseResolutionStatus(
  raw: unknown,
  ccddMatch: string | null,
): RenewResolutionStatus | undefined {
  const value = asString(raw);
  if (
    value === 'AUTO_RESOLVED' ||
    value === 'PHARMACIST_REVIEW_REQUIRED' ||
    value === 'UNRESOLVED'
  ) {
    return value;
  }
  if (ccddMatch === 'ambiguous') return 'PHARMACIST_REVIEW_REQUIRED';
  if (ccddMatch === 'matched') return 'AUTO_RESOLVED';
  if (ccddMatch === 'unmatched') return 'UNRESOLVED';
  return undefined;
}

function parseProductIdentity(
  raw: unknown,
  src: Record<string, unknown>,
  rawFields: Record<string, unknown>,
  normalized: Record<string, unknown>,
): MedicationProductIdentity | undefined {
  const display =
    asString(rawFields.medicationText) ||
    asString(normalized.brandName) ||
    asString(normalized.genericName) ||
    asString(src.displayName) ||
    'Medication';
  if (!raw || typeof raw !== 'object') {
    return {
      sourceDisplayName: display,
      productName: asString(normalized.brandName),
      brandName: asString(normalized.brandName),
      din: asString(normalized.din),
      matchMethod: 'UNRESOLVED',
      matchConfidence: 0,
    };
  }
  const row = raw as Record<string, unknown>;
  const method = asString(row.matchMethod);
  return {
    sourceDisplayName: asString(row.sourceDisplayName) || display,
    productName: asString(row.productName),
    brandName: asString(row.brandName),
    manufacturer: asString(row.manufacturer),
    din: asString(row.din),
    dpdProductId: asString(row.dpdProductId),
    ccddManufacturedProductId: asString(row.ccddManufacturedProductId),
    matchMethod:
      method === 'DIN_EXACT' ||
      method === 'PRODUCT_NAME_EXACT' ||
      method === 'PRODUCT_NAME_STRENGTH' ||
      method === 'GENERIC_NORMALIZED' ||
      method === 'PHARMACIST_SELECTED' ||
      method === 'UNRESOLVED'
        ? method
        : 'UNRESOLVED',
    matchConfidence: asNumber(row.matchConfidence) ?? 0,
    isExplicitProduct: row.isExplicitProduct === true,
  };
}

function parseClinicalIdentity(
  raw: unknown,
  normalized: Record<string, unknown>,
): MedicationClinicalIdentity | undefined {
  if (!raw || typeof raw !== 'object') {
    const generic = asString(normalized.genericName);
    return {
      ingredientIds: [],
      ingredientNames: generic ? [generic] : [],
      strength: asString(normalized.strength),
      route: asString(normalized.route),
      dosageForm: asString(normalized.dosageForm),
    };
  }
  const row = raw as Record<string, unknown>;
  const names = Array.isArray(row.ingredientNames)
    ? row.ingredientNames.filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
    : [];
  const ids = Array.isArray(row.ingredientIds)
    ? row.ingredientIds.filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
    : [];
  const release = asString(row.releaseType);
  return {
    ingredientIds: ids,
    ingredientNames: names,
    strength: asString(row.strength) ?? asString(normalized.strength),
    route: asString(row.route) ?? asString(normalized.route),
    dosageForm: asString(row.dosageForm) ?? asString(normalized.dosageForm),
    releaseType:
      release === 'IMMEDIATE' || release === 'EXTENDED' || release === 'DELAYED' || release === 'UNKNOWN'
        ? release
        : undefined,
    ccddClinicalConceptId: asString(row.ccddClinicalConceptId),
    drugClassIds: Array.isArray(row.drugClassIds)
      ? row.drugClassIds.filter((n): n is string => typeof n === 'string')
      : [],
  };
}

export function parseRenewMedication(raw: unknown): RenewMedication | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const id = asString(src.id);
  if (!id) return null;
  const source = (src.source ?? {}) as Record<string, unknown>;
  const rawFields = (src.raw ?? {}) as Record<string, unknown>;
  const normalized = (src.normalized ?? {}) as Record<string, unknown>;
  const confidence = (src.confidence ?? {}) as Record<string, unknown>;
  const schedule = (normalized.complianceSchedule ?? null) as Record<string, unknown> | null;
  const sourceType = asString(source.type);
  const review = asString(src.reviewStatus);
  const match = asString(src.ccddMatchStatus);
  const candidates: RenewCcddCandidate[] = Array.isArray(src.ccddCandidates)
    ? src.ccddCandidates.flatMap((c) => {
        if (!c || typeof c !== 'object') return [];
        const row = c as Record<string, unknown>;
        const cid = asString(row.id);
        const label = asString(row.label);
        if (!cid || !label) return [];
        const candidate: RenewCcddCandidate = {
          id: cid,
          label,
          brandName: asString(row.brandName),
          genericName: asString(row.genericName),
          strength: asString(row.strength),
          dosageForm: asString(row.dosageForm),
          din: asString(row.din),
          codeDisplay: asString(row.codeDisplay),
          clinicalDifference: asString(row.clinicalDifference),
          pharmacistDisplayName: asString(row.pharmacistDisplayName),
          pharmacistDetail: asString(row.pharmacistDetail),
        };
        return [candidate];
      })
    : [];

  const med: RenewMedication = {
    id,
    source: {
      type:
        sourceType === 'screenshot' || sourceType === 'pharmacy_document'
          ? sourceType
          : 'manual_search',
      documentType: asString(source.documentType),
      sourceSystem: asString(source.sourceSystem),
    },
    raw: {
      medicationText: asString(rawFields.medicationText),
      directionsText: asString(rawFields.directionsText),
      quantityText: asString(rawFields.quantityText),
      prescriberText: asString(rawFields.prescriberText),
      dateText: asString(rawFields.dateText),
    },
    normalized: {
      medicationConceptId: asString(normalized.medicationConceptId),
      din: asString(normalized.din),
      brandName: asString(normalized.brandName),
      genericName: asString(normalized.genericName),
      strength: asString(normalized.strength),
      dosageForm: asString(normalized.dosageForm),
      route: asString(normalized.route),
      directions: asString(normalized.directions),
      directionsNormalized: asString(normalized.directionsNormalized),
      frequency: asString(normalized.frequency),
      dose: asString(normalized.dose),
      doseUnit: asString(normalized.doseUnit),
      prn: asBool(normalized.prn),
      quantity: asNumber(normalized.quantity),
      quantityUnit: asString(normalized.quantityUnit),
      prescriberName: asString(normalized.prescriberName),
      prescribedDate: asIsoDate(normalized.prescribedDate),
      lastFillDate: asIsoDate(normalized.lastFillDate),
      refillsRemaining: asNumber(normalized.refillsRemaining),
      previousAuthorizedRefills: asNumber(normalized.previousAuthorizedRefills),
      complianceSchedule: schedule
        ? {
            morning: asNumber(schedule.morning),
            noon: asNumber(schedule.noon),
            evening: asNumber(schedule.evening),
            bedtime: asNumber(schedule.bedtime),
          }
        : null,
    },
    confidence: {
      medication: asNumber(confidence.medication),
      strength: asNumber(confidence.strength),
      directions: asNumber(confidence.directions),
      quantity: asNumber(confidence.quantity),
      prescriber: asNumber(confidence.prescriber),
      dates: asNumber(confidence.dates),
    },
    reviewStatus:
      review === 'confirmed' || review === 'needs_review' || review === 'not_reviewed'
        ? review
        : 'not_reviewed',
    ccddMatchStatus:
      match === 'matched' || match === 'ambiguous' || match === 'unmatched' ? match : 'unmatched',
    ccddCandidates: candidates,
    resolutionStatus: parseResolutionStatus(src.resolutionStatus, match),
    productIdentity: parseProductIdentity(src.productIdentity, src, rawFields, normalized),
    clinicalIdentity: parseClinicalIdentity(src.clinicalIdentity, normalized),
    pharmacistEdited: asBool(src.pharmacistEdited),
    directionsStatus:
      src.directionsStatus === 'UNAVAILABLE' || src.directionsStatus === 'CONFIRMED'
        ? src.directionsStatus
        : undefined,
    identityVerificationStatus:
      src.identityVerificationStatus === 'UNVERIFIED' || src.identityVerificationStatus === 'VERIFIED'
        ? src.identityVerificationStatus
        : undefined,
  };

  if (med.reviewStatus === 'not_reviewed') {
    med.reviewStatus = deriveReviewStatus(med);
  }
  return med;
}

export function renewDisplayLabel(payload: RenewPayload | null | undefined): string {
  const count = payload?.medicationList.items.length ?? 0;
  if (payload?.medicationList.confirmed && count > 0) {
    return `${count} medication${count === 1 ? '' : 's'} confirmed`;
  }
  if (count > 0) return `Renewal · ${count} medication${count === 1 ? '' : 's'}`;
  return 'Medication renewal';
}
