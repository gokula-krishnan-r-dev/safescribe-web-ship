/**
 * SafeScribe Renew — Step 4 renewal plan, safety derivation, and documentation helpers.
 * The pharmacist decides what to renew. Rules surface safety. Documents are generated from the confirmed plan.
 */

import { lookupEffectivenessReasonLabel, isUnableToAssessStatus } from './renew-effectiveness';
import {
  adherenceIssueLabel,
  conditionGroupKey,
  isEffectivenessConcern,
  isIndicationResolved,
  medicationConcernActionLabel,
  medicationConcernLabel,
  type TherapyReviewGate,
} from './renew-therapy';
import type {
  RenewMonitoringRequirement,
  RenewSafetyFindingSummary,
} from './renew-monitoring';
import {
  RENEW_DURATION_OPTIONS,
  emptyRenewDocument,
  emptyRenewDocuments,
  formatRenewDuration,
  isRequiredRenewDocument,
  mergeRenewDocuments,
  medicationDirections,
  medicationDisplayName,
  medicationQuantityLabel,
  type RenewDecisionState,
  type RenewDocumentKind,
  type RenewDurationId,
  type RenewDurationSource,
  type RenewGeneratedDocument,
  type RenewMedication,
  type RenewMedicationPlanItem,
  type RenewalPatientInfo,
  type RenewPayload,
  type RenewPlanDecision,
  type RenewSafetyTone,
  type RenewTherapyIssue,
  type RenewTherapyReviewState,
} from './renew';
import { planConfirmIssues } from './renew-duration';
import { dateOfBirthError, parseIsoDateLocal } from './patient-age';
import { displayDob } from './referral-letter-document';
import {
  buildRenewConsultationNote,
  type RenewDocumentGenerationContext,
} from './renew-dap-note';
import { buildPrescriberNotificationNote } from './renew-prescriber-notification';
import { buildPatientHandoutNote } from './renew-patient-handout';
import { buildRenewPharmacistPrescriptionNote } from './renew-pharmacist-prescription';
import { isRenewCommunicationResolved, syncRenewCommunication } from './renew-communication';

export interface RenewMedicationSafety {
  tone: RenewSafetyTone;
  label: string;
  note: string | null;
}

export interface RenewMedicationPlanRow {
  medicationId: string;
  displayName: string;
  formLabel: string | null;
  quantityLabel: string | null;
  directions: string | null;
  safety: RenewMedicationSafety;
  selected: boolean;
  decision: RenewPlanDecision;
  durationId: RenewDurationId | null;
  customDurationDays: number | null;
  customDurationText: string | null;
  durationSource: RenewDurationSource;
  durationApplyNote: string | null;
  eligible: boolean;
  pharmacistOverride: boolean;
}

export type RenewAdherenceSummary = 'Good' | 'Concerns' | 'Not reviewed';

export interface RenewStep4Summary {
  medicationsReviewed: number;
  selectedToRenew: number;
  needReview: number;
  monitoringUnavailable: number;
  conditionsConfirmed: number;
  adherence: RenewAdherenceSummary;
  linkedCount: number;
  totalMedications: number;
  needIndicationConfirmation: number;
}

export interface RenewStep4Gate {
  canConfirm: boolean;
  canGenerateDocs: boolean;
  canComplete: boolean;
  planConfirmed: boolean;
  patientInfoValid: boolean;
  requiredDocsReady: boolean;
  requiredDocsReviewed: boolean;
  requiredReviewedCount: number;
  requiredDocumentCount: number;
  attested: boolean;
  staleDocs: boolean;
  communicationRequired: boolean;
  communicationResolved: boolean;
  reason: string | null;
}

export interface RenewStep4View {
  rows: RenewMedicationPlanRow[];
  decision: RenewDecisionState;
  summary: RenewStep4Summary;
  gate: RenewStep4Gate;
  requestedDurationId: RenewDurationId | null;
  requestedDurationLabel: string | null;
  durationOptions: Array<{ id: RenewDurationId; label: string }>;
  customDurationLimits: { min: number; max: number };
  recordedAgeYears: number | null;
}

const CHRONIC_NSAID_KEYS = [
  'ibuprofen',
  'advil',
  'motrin',
  'naproxen',
  'aleve',
  'diclofenac',
  'voltaren',
  'celecoxib',
  'celebrex',
  'meloxicam',
  'mobic',
  'ketorolac',
  'indomethacin',
  'piroxicam',
];

export function renewalPlanFingerprint(items: RenewMedicationPlanItem[]): string {
  return items
    .map(
      (row) =>
        `${row.medicationId}:${row.selected ? '1' : '0'}:${row.durationId ?? ''}:${row.customDurationDays ?? ''}:${row.customDurationText ?? ''}`,
    )
    .sort()
    .join('|');
}

export function newRenewVersionId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function patientInfoFingerprint(info?: RenewalPatientInfo | null): string {
  if (info?.skipped) return 'skipped';
  return [
    (info?.patientName ?? '').trim().toLowerCase(),
    (info?.dateOfBirth ?? '').trim(),
    (info?.phn ?? '').replace(/\s+/g, '').toLowerCase(),
  ].join('|');
}

export function isRenewPatientInfoValid(info?: RenewalPatientInfo | null): boolean {
  if (info?.skipped) return true;
  const name = info?.patientName?.trim() ?? '';
  if (name.length < 2) return false;
  return dateOfBirthError(info?.dateOfBirth) == null;
}

export function isRenewPatientInfoConfirmed(info?: RenewalPatientInfo | null): boolean {
  return Boolean(info?.confirmedAt) && isRenewPatientInfoValid(info);
}

export const RENEW_DOB_AGE_MISMATCH_MESSAGE =
  'The date of birth does not match the age entered earlier. Please confirm the correct date of birth.';

export function renewDobAgeMismatch(
  dob: string,
  recordedAgeYears: number | null | undefined,
  asOf = new Date(),
): string | null {
  if (recordedAgeYears == null || !Number.isFinite(recordedAgeYears)) return null;
  const birth = parseIsoDateLocal(dob);
  if (!birth) return null;
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let years = today.getFullYear() - birth.getFullYear();
  const birthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!birthdayPassed) years -= 1;
  if (Math.abs(years - recordedAgeYears) > 1) return RENEW_DOB_AGE_MISMATCH_MESSAGE;
  return null;
}

export function validateRenewPatientInfo(input: {
  patientName?: string | null;
  dateOfBirth?: string | null;
  phn?: string | null;
  recordedAgeYears?: number | null;
  skipped?: boolean;
}): { valid: boolean; nameError: string | null; dobError: string | null; phnError: string | null } {
  if (input.skipped) {
    return { valid: true, nameError: null, dobError: null, phnError: null };
  }
  const name = (input.patientName ?? '').trim();
  const dob = (input.dateOfBirth ?? '').trim();
  const phn = (input.phn ?? '').trim();
  const nameError = name.length < 2 ? 'Enter the patient name.' : null;
  const calendarError = dateOfBirthError(dob);
  const mismatch = !calendarError ? renewDobAgeMismatch(dob, input.recordedAgeYears) : null;
  const phnError = phn && phn.length < 3 ? 'Enter a valid PHN, or leave blank.' : null;
  return {
    valid: !nameError && !calendarError && !mismatch && !phnError,
    nameError,
    dobError: calendarError || mismatch,
    phnError,
  };
}

export function maskRenewPhn(phn?: string | null): string | null {
  const digits = (phn ?? '').replace(/\s+/g, '');
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `••••${digits.slice(-4)}`;
}

export function formatRenewPatientSummary(info?: RenewalPatientInfo | null): string {
  if (!info) return '';
  const name = info.patientName.trim();
  const dob = info.dateOfBirth.trim() ? displayDob(info.dateOfBirth) : '';
  const phn = maskRenewPhn(info.phn);
  return [name, dob, phn ? `PHN ${phn}` : null].filter(Boolean).join(' · ');
}

export function formatPlanItemDuration(item: Pick<
  RenewMedicationPlanItem,
  'durationId' | 'customDurationDays' | 'customDurationText'
>): string | null {
  if (!item.durationId) return null;
  if (item.durationId === 'custom') {
    if (item.customDurationDays && item.customDurationDays > 0) {
      return `${item.customDurationDays} days`;
    }
    return item.customDurationText?.trim() || 'Custom';
  }
  return RENEW_DURATION_OPTIONS.find((option) => option.id === item.durationId)?.label ?? null;
}

export function dominantPlanDuration(items: RenewMedicationPlanItem[]): string | null {
  const selected = items.filter((row) => row.selected);
  if (!selected.length) return null;
  const labels = selected.map((row) => formatPlanItemDuration(row)).filter((v): v is string => Boolean(v));
  const unique = [...new Set(labels)];
  if (unique.length === 1) return unique[0] ?? null;
  if (unique.length > 1) return 'Mixed durations';
  return null;
}

export function isChronicNsaid(med: RenewMedication): boolean {
  const blob = `${med.normalized.genericName ?? ''} ${med.normalized.brandName ?? ''} ${med.raw.medicationText ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  return CHRONIC_NSAID_KEYS.some((key) => blob.includes(key));
}

function therapyIssueForMedication(
  medicationId: string,
  therapy: RenewTherapyReviewState,
): RenewTherapyIssue | { issueType: string; details: string } | null {
  const mapping = therapy.mappings.find((row) => row.medicationId === medicationId);
  if (!mapping || !isIndicationResolved(mapping)) return null;
  const key = conditionGroupKey(mapping.conditionId, mapping.customIndicationText);
  const review = therapy.reviews.find(
    (row) => conditionGroupKey(row.conditionId, row.customConditionText) === key,
  );
  if (!review) return null;
  if (review.medicationConcernStatus === 'yes') {
    return (
      review.issues.find(
        (issue) =>
          issue.issueType === 'medication_concern' &&
          (issue.medicationIds.length === 0 || issue.medicationIds.includes(medicationId)),
      ) ?? {
        issueType: 'medication_concern',
        details: 'Medication concern',
      }
    );
  }
  if (review.adherenceStatus === 'no') {
    return (
      review.issues.find(
        (issue) => issue.issueType === 'adherence' && issue.medicationIds.includes(medicationId),
      ) ??
      review.issues.find((issue) => issue.issueType === 'adherence') ?? {
        issueType: 'adherence',
        details: 'Adherence concern',
      }
    );
  }
  if (isEffectivenessConcern(review.effectivenessStatus)) {
    const issue = review.issues.find((row) => row.issueType === 'effectiveness');
    const reason = lookupEffectivenessReasonLabel(issue?.issueCategory);
    if (isUnableToAssessStatus(review.effectivenessStatus)) {
      return (
        issue ?? {
          issueType: 'effectiveness',
          details: `Unable to assess control — ${reason}`,
        }
      );
    }
    return (
      issue ?? {
        issueType: 'effectiveness',
        details: `Control concern — ${reason}`,
      }
    );
  }
  return null;
}

function therapyIssueNote(
  issue: RenewTherapyIssue | { issueType: string; details: string } | null,
): string | null {
  if (!issue) return null;
  if (issue.issueType === 'adherence' && 'issueCategory' in issue) {
    const label = adherenceIssueLabel(issue.issueCategory);
    const extra = issue.otherText?.trim() || issue.details?.trim();
    return extra ? `${label}: ${extra}` : label;
  }
  if (issue.issueType === 'effectiveness') {
    const reason =
      'issueCategory' in issue ? lookupEffectivenessReasonLabel(issue.issueCategory) : null;
    const extra =
      ('otherText' in issue ? issue.otherText?.trim() : null) ||
      ('details' in issue ? issue.details?.trim() : null);
    if (reason && extra && extra !== reason) return `${reason}: ${extra}`;
    return reason || extra || null;
  }
  if (issue.issueType === 'medication_concern' && 'issueCategory' in issue) {
    const label = medicationConcernLabel(issue.issueCategory);
    const action = medicationConcernActionLabel(issue.actionTaken);
    const extra = issue.otherText?.trim() || issue.details?.trim();
    const lead = extra ? `${label}: ${extra}` : label;
    return issue.actionTaken ? `${lead} — ${action}` : lead;
  }
  if ('details' in issue && issue.details?.trim()) return issue.details.trim();
  if ('issueCategory' in issue && issue.issueCategory) return issue.issueCategory;
  return null;
}

function monitoringNote(row: RenewMonitoringRequirement): string {
  const label = row.label;
  if (row.result.status === 'UNAVAILABLE') {
    return row.result.note?.trim() || `Last ${label} unavailable`;
  }
  if (row.result.status === 'CONCERNING') {
    return row.result.note?.trim() || `${label} needs review`;
  }
  if (row.inputCode === 'BP') return 'BP controlled';
  if (row.inputCode === 'EGFR') return 'eGFR UTD';
  if (row.inputCode === 'A1C') return 'A1c UTD';
  if (row.inputCode === 'INR') return 'INR UTD';
  if (/lipid|ldl|cholest/i.test(label) || row.inputCode === 'LIPIDS') return 'Lipids UTD';
  if (/phq/i.test(label) || row.inputCode === 'PHQ9') return `${label} UTD`;
  return `${label} UTD`;
}

export function deriveMedicationSafety(
  med: RenewMedication,
  monitoring: RenewMonitoringRequirement[],
  findings: RenewSafetyFindingSummary[],
  therapy: RenewTherapyReviewState,
): RenewMedicationSafety {
  const related = monitoring.filter((row) => row.medicationIds.includes(med.id));
  const concerning = related.filter((row) => row.result.status === 'CONCERNING');
  const unavailable = related.filter((row) => row.result.status === 'UNAVAILABLE');
  const available = related.filter((row) => row.result.status === 'AVAILABLE');
  const attributedFindings = findings.filter((finding) => {
    if (finding.clinicalSeverity !== 'AVOID' && finding.clinicalSeverity !== 'REVIEW_REQUIRED') {
      return false;
    }
    if (finding.inputCode && related.some((row) => row.inputCode === finding.inputCode)) return true;
    const name = medicationDisplayName(med).toLowerCase();
    const generic = med.normalized.genericName?.toLowerCase();
    const blob = `${finding.summary} ${finding.detail}`.toLowerCase();
    return Boolean(name && blob.includes(name.toLowerCase())) || Boolean(generic && blob.includes(generic));
  });
  const therapyIssue = therapyIssueForMedication(med.id, therapy);
  const nsaid = isChronicNsaid(med);

  if (attributedFindings.length || concerning.length || therapyIssue) {
    const note =
      attributedFindings[0]?.summary ??
      therapyIssueNote(therapyIssue) ??
      (concerning[0] ? monitoringNote(concerning[0]) : null);
    return {
      tone: 'review',
      label: 'Review recommended',
      note: note?.trim() || 'Clinical review recommended',
    };
  }

  if (nsaid) {
    return { tone: 'review', label: 'Review recommended', note: 'Chronic use' };
  }

  if (unavailable.length) {
    return {
      tone: 'unavailable',
      label: 'Monitoring unavailable',
      note: monitoringNote(unavailable[0]!),
    };
  }

  return {
    tone: 'clear',
    label: 'No concerns',
    note: available[0] ? monitoringNote(available[0]) : 'Appropriate use',
  };
}

export function defaultPlanItem(
  medicationId: string,
  safety: RenewMedicationSafety,
  durationId: RenewDurationId | null,
  customDurationDays: number | null,
  customDurationText: string | null,
  existing?: RenewMedicationPlanItem | null,
): RenewMedicationPlanItem {
  const eligible = safety.tone !== 'review';
  const selected = existing ? existing.selected : eligible;
  return {
    medicationId,
    selected,
    decision: selected ? 'renew' : safety.tone === 'review' ? 'review' : 'do_not_renew',
    durationId: selected ? (existing?.durationId ?? durationId) : existing?.durationId ?? null,
    customDurationDays: selected
      ? (existing?.customDurationDays ?? customDurationDays)
      : existing?.customDurationDays ?? null,
    customDurationText: selected
      ? (existing?.customDurationText ?? customDurationText)
      : existing?.customDurationText ?? null,
    pharmacistOverride: existing?.pharmacistOverride ?? false,
    durationSource: existing?.durationSource ?? 'DEFAULT',
    durationBulkActionId: existing?.durationBulkActionId ?? null,
    durationApplyNote: existing?.durationApplyNote ?? null,
  };
}

export function syncPlanItems(
  medications: RenewMedication[],
  decision: RenewDecisionState,
  safetyById: Map<string, RenewMedicationSafety>,
  durationId: RenewDurationId | null,
  customDurationDays: number | null,
  customDurationText: string | null,
): RenewMedicationPlanItem[] {
  const existing = new Map(decision.items.map((row) => [row.medicationId, row]));
  const locked = decision.confirmed;
  return medications.map((med) => {
    const current = existing.get(med.id);
    if (locked && current) return current;
    const safety = safetyById.get(med.id) ?? { tone: 'clear', label: 'No concerns', note: 'Appropriate use' };
    return defaultPlanItem(med.id, safety, durationId, customDurationDays, customDurationText, current);
  });
}

export function applyPlanPatch(
  items: RenewMedicationPlanItem[],
  medicationId: string,
  patch: Partial<
    Pick<
      RenewMedicationPlanItem,
      | 'selected'
      | 'durationId'
      | 'customDurationDays'
      | 'customDurationText'
      | 'durationSource'
    >
  >,
  safety: RenewMedicationSafety,
): RenewMedicationPlanItem[] {
  return items.map((row) => {
    if (row.medicationId !== medicationId) return row;
    const selected = patch.selected ?? row.selected;
    const durationChanged =
      (patch.durationId !== undefined && patch.durationId !== row.durationId) ||
      (patch.customDurationDays !== undefined && patch.customDurationDays !== row.customDurationDays) ||
      (patch.customDurationText !== undefined && patch.customDurationText !== row.customDurationText);
    const durationId = patch.durationId !== undefined ? patch.durationId : row.durationId;
    const customDurationDays =
      durationId === 'custom'
        ? (patch.customDurationDays !== undefined ? patch.customDurationDays : row.customDurationDays)
        : durationChanged && patch.durationId !== undefined
          ? null
          : row.customDurationDays;
    const customDurationText =
      durationId === 'custom'
        ? (patch.customDurationText !== undefined
            ? patch.customDurationText
            : customDurationDays
              ? `${customDurationDays} days`
              : row.customDurationText)
        : durationChanged && patch.durationId !== undefined
          ? null
          : row.customDurationText;
    return {
      ...row,
      selected,
      durationId,
      customDurationDays,
      customDurationText,
      decision: selected ? 'renew' : safety.tone === 'review' ? 'review' : 'do_not_renew',
      pharmacistOverride: selected && safety.tone === 'review' ? true : row.pharmacistOverride,
      durationSource: durationChanged ? (patch.durationSource ?? 'MANUAL') : row.durationSource,
      durationBulkActionId: durationChanged ? null : row.durationBulkActionId,
      durationApplyNote: durationChanged ? null : row.durationApplyNote,
    };
  });
}

export function renewAllEligible(
  items: RenewMedicationPlanItem[],
  safetyById: Map<string, RenewMedicationSafety>,
): RenewMedicationPlanItem[] {
  return items.map((row) => {
    const safety = safetyById.get(row.medicationId);
    const eligible = safety?.tone !== 'review';
    if (!eligible) {
      return {
        ...row,
        selected: false,
        decision: 'review' as const,
      };
    }
    return {
      ...row,
      selected: true,
      decision: 'renew',
    };
  });
}

export function markDocumentsStale(documents: RenewGeneratedDocument[]): RenewGeneratedDocument[] {
  return documents.map((doc) =>
    doc.status === 'generated' || doc.body.trim()
      ? { ...doc, status: 'stale' as const, reviewed: false, reviewedAt: null }
      : doc,
  );
}

export function isRenewDocumentReviewed(doc?: RenewGeneratedDocument | null): boolean {
  return Boolean(doc && doc.status === 'generated' && doc.reviewed && doc.body.trim());
}

export function requiredDocumentsReady(documents: RenewGeneratedDocument[]): boolean {
  const note = documents.find((doc) => doc.kind === 'consultation_note');
  const summary = documents.find((doc) => doc.kind === 'renewal_summary');
  return (
    note?.status === 'generated' &&
    Boolean(note.body.trim()) &&
    summary?.status === 'generated' &&
    Boolean(summary.body.trim())
  );
}

/** Only the two required documents gate completion. Optional outputs never block. */
export function requiredDocumentsReviewed(documents: RenewGeneratedDocument[]): boolean {
  const note = documents.find((doc) => doc.kind === 'consultation_note');
  const summary = documents.find((doc) => doc.kind === 'renewal_summary');
  return isRenewDocumentReviewed(note) && isRenewDocumentReviewed(summary);
}

export function requiredReviewedCount(documents: RenewGeneratedDocument[]): number {
  return documents.filter((doc) => isRequiredRenewDocument(doc.kind) && isRenewDocumentReviewed(doc)).length;
}

export function documentsAreStale(documents: RenewGeneratedDocument[]): boolean {
  return documents.some((doc) => isRequiredRenewDocument(doc.kind) && doc.status === 'stale');
}

export function evaluateRenewStep4Gate(decision: RenewDecisionState): RenewStep4Gate {
  const staleDocs = documentsAreStale(decision.documents);
  const patientInfoValid = isRenewPatientInfoConfirmed(decision.patientInfo);
  const requiredDocsReady = requiredDocumentsReady(decision.documents) && !staleDocs;
  const reviewedCount = requiredReviewedCount(decision.documents);
  const requiredDocsReviewed = requiredDocsReady && requiredDocumentsReviewed(decision.documents);
  const confirmIssues = planConfirmIssues(decision.items);
  const canConfirm = !decision.confirmed && confirmIssues.length === 0;
  const canGenerateDocs = decision.confirmed && isRenewPatientInfoValid(decision.patientInfo);
  const attested = decision.pharmacistAttested;
  const communication = syncRenewCommunication(decision);
  const communicationResolved = isRenewCommunicationResolved(communication);
  const canComplete =
    decision.confirmed && patientInfoValid && requiredDocsReady && requiredDocsReviewed;
  let reason: string | null = null;
  if (!decision.confirmed) reason = 'Confirm the renewal plan before generating documentation.';
  else if (!patientInfoValid) reason = 'Patient information must be confirmed first.';
  else if (staleDocs) {
    reason = 'Renewal plan changed. Required documents were regenerated and need review again.';
  } else if (!requiredDocsReady) {
    reason = 'Save patient information to generate the required documents.';
  } else if (!requiredDocsReviewed) {
    const remaining = 2 - reviewedCount;
    reason = `${remaining} required document${remaining === 1 ? '' : 's'} still need review.`;
  }
  return {
    canConfirm,
    canGenerateDocs,
    canComplete,
    planConfirmed: decision.confirmed,
    patientInfoValid,
    requiredDocsReady,
    requiredDocsReviewed,
    requiredReviewedCount: reviewedCount,
    requiredDocumentCount: 2,
    attested,
    staleDocs,
    communicationRequired: communication.requirement === 'REQUIRED',
    communicationResolved,
    reason,
  };
}

export function summarizeAdherence(therapy: RenewTherapyReviewState): RenewAdherenceSummary {
  const reviews = therapy.reviews.filter(
    (row) => Boolean(row.conditionId) || Boolean(row.customConditionText?.trim()),
  );
  if (!reviews.length) return 'Not reviewed';
  if (reviews.some((row) => row.adherenceStatus === 'no')) return 'Concerns';
  if (reviews.every((row) => row.adherenceStatus === 'yes')) return 'Good';
  if (reviews.every((row) => row.adherenceStatus)) return 'Good';
  return 'Not reviewed';
}

export function buildStep4Summary(
  rows: RenewMedicationPlanRow[],
  therapy: RenewTherapyReviewState,
  therapyGate?: Pick<
    TherapyReviewGate,
    'conditionsConfirmed' | 'linkedCount' | 'totalMedications' | 'unresolvedMedicationIds'
  >,
): RenewStep4Summary {
  return {
    medicationsReviewed: rows.length,
    selectedToRenew: rows.filter((row) => row.selected).length,
    needReview: rows.filter((row) => row.safety.tone === 'review').length,
    monitoringUnavailable: rows.filter((row) => row.safety.tone === 'unavailable').length,
    conditionsConfirmed: therapyGate?.conditionsConfirmed ?? therapy.reviews.length,
    adherence: summarizeAdherence(therapy),
    linkedCount: therapyGate?.linkedCount ?? therapy.mappings.filter(isIndicationResolved).length,
    totalMedications: therapyGate?.totalMedications ?? rows.length,
    needIndicationConfirmation: therapyGate?.unresolvedMedicationIds.length ?? 0,
  };
}

function medicationFormLabel(med: RenewMedication): string | null {
  return med.normalized.dosageForm?.trim() || null;
}

export function toPlanRows(
  medications: RenewMedication[],
  items: RenewMedicationPlanItem[],
  safetyById: Map<string, RenewMedicationSafety>,
): RenewMedicationPlanRow[] {
  const byId = new Map(items.map((row) => [row.medicationId, row]));
  return medications.map((med) => {
    const safety = safetyById.get(med.id) ?? {
      tone: 'clear' as const,
      label: 'No concerns',
      note: 'Appropriate use',
    };
    const item = byId.get(med.id);
    const selected = item?.selected ?? safety.tone !== 'review';
    const displayName = medicationDisplayName(med);
    return {
      medicationId: med.id,
      displayName,
      formLabel: medicationFormLabel(med),
      quantityLabel: medicationQuantityLabel(med),
      directions: medicationDirections(med),
      safety,
      selected,
      decision: item?.decision ?? (selected ? 'renew' : safety.tone === 'review' ? 'review' : 'do_not_renew'),
      durationId: item?.durationId ?? null,
      customDurationDays: item?.customDurationDays ?? null,
      customDurationText: item?.customDurationText ?? null,
      durationSource: item?.durationSource ?? 'DEFAULT',
      durationApplyNote: item?.durationApplyNote ?? null,
      eligible: safety.tone !== 'review',
      pharmacistOverride: item?.pharmacistOverride ?? false,
    };
  });
}

export function buildConsultationNote(
  payload: RenewPayload,
  rows: RenewMedicationPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  return buildRenewConsultationNote(payload, rows, context);
}

export function buildRenewalSummary(
  payload: RenewPayload,
  rows: RenewMedicationPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  return buildRenewPharmacistPrescriptionNote(payload, rows, context);
}

export function buildPrescriberNotification(
  payload: RenewPayload,
  rows: RenewMedicationPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  return buildPrescriberNotificationNote(payload, rows, context);
}

export function buildPatientHandout(
  payload: RenewPayload,
  rows: RenewMedicationPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  return buildPatientHandoutNote(payload, rows, context);
}

export function generateRenewDocuments(
  payload: RenewPayload,
  rows: RenewMedicationPlanRow[],
  kinds: RenewDocumentKind[],
  existing: RenewGeneratedDocument[],
  context?: RenewDocumentGenerationContext,
): RenewGeneratedDocument[] {
  const stamp = new Date().toISOString();
  const planVersion = payload.renewalDecision.planVersionId;
  const patientVersion = payload.renewalDecision.patientInfoVersion;
  const builders: Record<RenewDocumentKind, () => string> = {
    consultation_note: () => buildConsultationNote(payload, rows, context),
    renewal_summary: () => buildRenewalSummary(payload, rows, context),
    patient_handout: () => buildPatientHandout(payload, rows, context),
    prescriber_notification: () => buildPrescriberNotification(payload, rows, context),
  };
  const current = mergeRenewDocuments(existing.length ? existing : emptyRenewDocuments());
  return current.map((doc) => {
    if (!kinds.includes(doc.kind)) return doc;
    const template = emptyRenewDocument(doc.kind);
    const body = builders[doc.kind]();
    return {
      ...doc,
      title: template.title,
      description: template.description,
      status: 'generated',
      body,
      generatedAt: stamp,
      edited: false,
      reviewed: false,
      reviewedAt: null,
      generatedFromPlanVersion: planVersion,
      generatedFromPatientInfoVersion: patientVersion,
      generatedFromPromptHash: context?.promptHashes?.[doc.kind] ?? null,
      generationSource: 'template',
      ...(doc.kind === 'patient_handout'
        ? {
            handoutLanguage: 'en',
            englishBody: body,
            translationStatus: 'ok',
            translationMessage: null,
            translationFallback: false,
          }
        : {}),
    };
  });
}

export function confirmRenewalPlan(
  decision: RenewDecisionState,
  confirmedBy?: string | null,
): RenewDecisionState {
  const fingerprint = renewalPlanFingerprint(decision.items);
  return {
    ...decision,
    confirmed: true,
    confirmedAt: new Date().toISOString(),
    confirmedBy: confirmedBy ?? decision.confirmedBy,
    planVersionId: decision.planVersionId ?? newRenewVersionId(),
    planExpanded: false,
    docsExpanded: false,
    pharmacistAttested: false,
    attestedAt: null,
    planFingerprint: fingerprint,
  };
}

export function unconfirmRenewalPlan(decision: RenewDecisionState, stale: boolean): RenewDecisionState {
  return {
    ...decision,
    confirmed: false,
    confirmedAt: null,
    confirmedBy: null,
    planExpanded: true,
    docsExpanded: decision.docsExpanded,
    pharmacistAttested: false,
    attestedAt: null,
    documents: stale ? markDocumentsStale(decision.documents) : decision.documents,
  };
}

export function confirmRenewPatientInfo(
  decision: RenewDecisionState,
  input: {
    patientName: string;
    dateOfBirth: string;
    phn?: string | null;
    skipped?: boolean;
  },
  confirmedBy: string,
): RenewDecisionState {
  const skipped = input.skipped === true;
  return {
    ...decision,
    patientInfo: {
      patientName: skipped ? '' : input.patientName.trim(),
      dateOfBirth: skipped ? '' : input.dateOfBirth.trim(),
      phn: skipped ? null : input.phn?.trim() || null,
      source: 'STEP4_MANUAL',
      confirmedAt: new Date().toISOString(),
      confirmedBy,
      skipped,
    },
    patientInfoVersion: newRenewVersionId(),
    docsExpanded: true,
  };
}
