/**
 * Map pharmacist-confirmed Renew state onto Prescribe documentation payloads
 * so Renew Step 4 can reuse the same Document Session prompts and post-generation
 * repair as Prescribe Step 6.
 */

import {
  DAP_NOTE_TITLE,
  emptyDapPayload,
  type DapPayload,
  type DapSelectedTreatment,
} from './dap-payload';
import type { DapFollowUpPlan, DapObjectiveDatum, DapPatientSpecificSafety } from './dap-payload-clinical';
import {
  emptyPcpFollowUpPlan,
  type PcpFollowUpPlan,
} from './pcp-follow-up';
import {
  PCP_CLOSING_SENTENCE,
  PCP_LETTER_TITLE,
  formatPcpClinicalDate,
  pcpSalutationFromName,
  type PcpCommunicationPayload,
  type PcpSelectedTreatment,
} from './pcp-communication';
import { RENEW_DURATION_OPTIONS, type RenewDocumentKind, type RenewPayload } from './renew';
import {
  sanitizeProviderNotificationBody,
  validatePrescriberNotification,
} from './renew-prescriber-notification';
import {
  buildRenewDapPayload,
  formatRenewDapChartCopy,
  type RenewDapGenerationPayload,
  type RenewDapPlanRow,
  type RenewDocumentGenerationContext,
} from './renew-dap-note';

export const RENEW_KIND_TO_PRESCRIBE_DOC_ID = {
  consultation_note: 'consultation_note',
  renewal_summary: 'prescription',
  prescriber_notification: 'prescriber_communication',
  patient_handout: 'patient_care_summary',
} as const;

export type RenewPrescribeDocId =
  (typeof RENEW_KIND_TO_PRESCRIBE_DOC_ID)[RenewDocumentKind];

export const PRESCRIBE_DOC_ID_TO_RENEW_KIND: Record<
  RenewPrescribeDocId,
  RenewDocumentKind
> = {
  consultation_note: 'consultation_note',
  prescription: 'renewal_summary',
  prescriber_communication: 'prescriber_notification',
  patient_care_summary: 'patient_handout',
};

function durationLabel(row: RenewDapPlanRow): string {
  if (!row.durationId) return row.customDurationText?.trim() || '';
  if (row.durationId === 'custom') {
    if (row.customDurationDays && row.customDurationDays > 0) {
      return `${row.customDurationDays} days`;
    }
    return row.customDurationText?.trim() || '';
  }
  return RENEW_DURATION_OPTIONS.find((option) => option.id === row.durationId)?.label ?? '';
}

function treatmentDirections(row: RenewDapPlanRow): string {
  const sig = row.directions?.trim() ?? '';
  const duration = durationLabel(row);
  if (sig && duration && !sig.toLowerCase().includes(duration.toLowerCase())) {
    return `${sig.replace(/\.$/, '')}. Duration: ${duration}.`;
  }
  return sig || (duration ? `Duration: ${duration}.` : '');
}

function selectedTreatments(rows: RenewDapPlanRow[]): DapSelectedTreatment[] {
  return rows
    .filter((row) => row.selected)
    .map((row) => ({
      display_name: row.displayName,
      patient_directions: treatmentDirections(row),
      pharmacist_confirmed: true as const,
    }))
    .filter((row) => row.display_name.trim());
}

function presentingConcern(generation: RenewDapGenerationPayload): string {
  const condition = generation.conditions.find((row) => row.displayName.trim())?.displayName.trim();
  if (condition) return condition;
  if (generation.renewalRequest.reasons.length) return 'medication renewal';
  return 'medication renewal';
}

function objectiveData(generation: RenewDapGenerationPayload): DapObjectiveDatum[] {
  return generation.monitoringResults
    .filter((row) => !row.unavailable && row.valueText?.trim())
    .slice(0, 8)
    .map((row) => ({
      type: row.label,
      value: row.valueText!.trim(),
      clinically_relevant: true as const,
    }));
}

function patientSpecificSafety(generation: RenewDapGenerationPayload): DapPatientSpecificSafety[] {
  const fromScreen = generation.patientSpecificScreen
    .filter((row) => row.positive && !row.unable)
    .map((row) => ({
      factor: row.label,
      patient_finding: row.detail?.trim() || row.label,
      clinically_relevant: true as const,
      pharmacist_reviewed: true as const,
      confirmed: true as const,
      documentation_summary: row.detail?.trim()
        ? `${row.label}: ${row.detail.trim()}`
        : `${row.label} was a patient-specific consideration in this renewal.`,
    }));
  const fromDtps = generation.dtps.map((row) => ({
    factor: row.source === 'monitoring_review' ? 'Monitoring' : 'Therapy review',
    patient_finding: row.description,
    clinically_relevant: true as const,
    pharmacist_reviewed: true as const,
    confirmed: true as const,
    documentation_summary: row.description,
  }));
  return [...fromScreen, ...fromDtps].slice(0, 8);
}

function followUpPlan(generation: RenewDapGenerationPayload): DapFollowUpPlan | null {
  if (!generation.followUp.length) return null;
  const monitoring = generation.followUp
    .filter((row) => row.kind === 'MONITORING' || row.kind === 'ADHERENCE')
    .map((row) => row.text);
  const action = generation.followUp
    .filter((row) => row.kind === 'REFERRAL' || row.kind === 'PRESCRIBER' || row.kind === 'SHORTER_RENEWAL')
    .map((row) => row.text);
  return {
    responsible_party: 'Pharmacist',
    timeframe: null,
    effectiveness_parameters: monitoring,
    safety_parameters: [],
    adherence_parameters: generation.followUp
      .filter((row) => row.kind === 'ADHERENCE')
      .map((row) => row.text),
    expected_outcomes: [],
    action_if_not_met: action,
    responsibility_override_confirmed: false,
    pharmacist_confirmed: true,
  };
}

function pcpFollowUp(generation: RenewDapGenerationPayload): PcpFollowUpPlan | null {
  if (!generation.followUp.length) return null;
  const primary = generation.followUp[0]?.text?.trim() || null;
  const action =
    generation.followUp.find((row) => row.kind === 'REFERRAL' || row.kind === 'PRESCRIBER')?.text?.trim() ||
    null;
  return {
    ...emptyPcpFollowUpPlan(),
    responsible_party: 'Pharmacist',
    primary_monitoring_target: primary,
    action_if_not_met: action,
    pharmacist_confirmed: true,
  };
}

export function buildRenewPrescribeDapPayload(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): DapPayload {
  const generation = buildRenewDapPayload(payload, rows, context);
  const base = emptyDapPayload();
  const treatments = selectedTreatments(rows);
  const conditions = generation.conditions.map((row) => row.displayName).filter(Boolean);
  const allergies = generation.patientSpecificScreen
    .filter((row) => /allerg/i.test(row.inputCode) || /allerg/i.test(row.label))
    .flatMap((row) => (row.detail ? [row.detail] : []));
  const counsellingPoints = generation.counselling.map((row) => row.description).filter(Boolean);
  const referral = generation.followUp.some((row) => row.kind === 'REFERRAL');
  const communicationCompleted =
    payload.renewalDecision.communication?.status === 'COMMUNICATED';

  return {
    ...base,
    presenting_concern: presentingConcern(generation),
    patient_context: {
      ...base.patient_context,
      age_years: generation.encounter.ageYears,
      allergies,
      conditions,
      current_medications: generation.medications.map((row) => row.displayName).filter(Boolean),
      labs: generation.monitoringResults
        .filter((row) => !row.unavailable && row.valueText?.trim())
        .map((row) => [row.label, row.valueText, row.dateText].filter(Boolean).join(' ')),
    },
    objective_data: objectiveData(generation),
    clinical_findings: generation.patientSpecificScreen
      .filter((row) => !row.unable)
      .slice(0, 8)
      .map((row) => ({
        clinical_label: row.label,
        status: row.positive ? ('present' as const) : ('absent' as const),
        documentation_value: row.detail?.trim() || (row.positive ? row.label : `No ${row.label.toLowerCase()}`),
      })),
    red_flags: {
      screening_completed: generation.safetyScreenCompleted,
      negative_findings: generation.patientSpecificScreen
        .filter((row) => !row.positive && !row.unable)
        .map((row) => row.label),
      positive_findings: generation.patientSpecificScreen
        .filter((row) => row.positive)
        .map((row) => row.label),
      uncertain_findings: generation.patientSpecificScreen
        .filter((row) => row.unable)
        .map((row) => row.label),
      referral_required: referral,
      no_red_flags_requiring_referral_confirmed: false,
    },
    assessment: {
      condition: conditions[0] ?? 'Medication renewal',
      eligible_for_pharmacist_management: payload.renewalDecision.confirmed ? true : null,
    },
    patient_specific_safety: patientSpecificSafety(generation),
    treatment_safety: {
      review_completed: generation.therapyCompleted && generation.monitoringCompleted,
      clinically_significant_findings: generation.dtps.map((row) => row.description),
    },
    selected_treatments: treatments,
    follow_up_plan: followUpPlan(generation),
    treatment_rationale: generation.conditions
      .map((row) => row.compactReview)
      .filter(Boolean)
      .slice(0, 2)
      .join(' ') || null,
    counselling_confirmed: counsellingPoints.length > 0,
    confirmed_counselling: counsellingPoints.length
      ? {
          medication_use: counsellingPoints.slice(0, 3),
          expected_response: [],
          self_care: [],
          follow_up: generation.followUp.map((row) => row.text).slice(0, 3),
        }
      : undefined,
    patient_handout_provided: false,
    referral: {
      recommended: referral,
      action_completed: false,
    },
    pcp_communication: {
      planned: generation.communicationRequired,
      completed: communicationCompleted,
    },
  };
}

export function buildRenewPrescribePcpPayload(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): PcpCommunicationPayload {
  const generation = buildRenewDapPayload(payload, rows, context);
  const treatments: PcpSelectedTreatment[] = selectedTreatments(rows).map((row, index) => ({
    treatment_id: rows.filter((item) => item.selected)[index]?.medicationId || row.display_name,
    display_name: row.display_name,
    patient_directions: row.patient_directions,
    pharmacist_confirmed: true as const,
  }));
  const recipientName = payload.renewalDecision.communication?.recipient?.name?.trim() || null;
  const condition = generation.conditions.find((row) => row.displayName.trim())?.displayName.trim() || null;
  const safety = patientSpecificSafety(generation).map((row) => row.documentation_summary);
  const followUp = pcpFollowUp(generation);
  const referral = generation.followUp.some((row) => row.kind === 'REFERRAL');

  return {
    patient: { display_name: generation.encounter.patientName || null },
    communication_date: formatPcpClinicalDate(generation.encounter.dateTime),
    pcp: { display_name: recipientName },
    pharmacist: {
      display_name: generation.encounter.pharmacistName || null,
      credentials: generation.encounter.pharmacistRole?.trim() || 'RPh',
    },
    presenting_concern: presentingConcern(generation),
    assessment: {
      condition,
      summary: null,
      eligible_for_pharmacist_management: payload.renewalDecision.confirmed ? true : null,
      no_red_flags_requiring_referral_confirmed: false,
    },
    prescribing_rationale: null,
    patient_specific_safety: safety,
    selected_treatments: treatments,
    pcp_follow_up_plan: followUp,
    follow_up_required: Boolean(followUp),
    follow_up_incomplete: false,
    confirmed_follow_up: followUp?.primary_monitoring_target ? [followUp.primary_monitoring_target] : [],
    referral: {
      recommended: referral,
      completed: false,
      reason: null,
      destination: null,
    },
  };
}

function stringFields(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export function formatPrescribeDapBody(fields: Record<string, string>): string {
  const title = fields.documentTitle?.trim() || DAP_NOTE_TITLE;
  return [
    title,
    '',
    'D — Data',
    fields.data?.trim() ?? '',
    '',
    'A — Assessment',
    fields.assessment?.trim() ?? '',
    '',
    'P — Plan',
    fields.plan?.trim() ?? '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatPrescribePcpBody(fields: Record<string, string>): string {
  const title = fields.documentTitle?.trim() || PCP_LETTER_TITLE;
  const identity = [
    fields.patientName?.trim() ? `Re: ${fields.patientName.trim()}` : null,
    fields.patientDob?.trim() ? `DOB: ${fields.patientDob.trim()}` : null,
    fields.patientPhn?.trim() ? `PHN: ${fields.patientPhn.trim()}` : null,
    fields.headerBlock?.trim() || null,
  ]
    .filter(Boolean)
    .join('\n');
  const sections = [
    fields.assessment?.trim() ? `Assessment\n${fields.assessment.trim()}` : null,
    fields.treatment?.trim() ? `Treatment\n${fields.treatment.trim()}` : null,
    fields.followUp?.trim() ? `Follow-up\n${fields.followUp.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  return [
    title,
    '',
    identity,
    fields.salutation?.trim() || pcpSalutationFromName(null),
    '',
    fields.openingSentence?.trim() ?? '',
    '',
    sections,
    '',
    fields.closingSentence?.trim() || PCP_CLOSING_SENTENCE,
    '',
    fields.signatureBlock?.trim() ?? '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function assembleRenewConsultationNoteFromAi(
  raw: unknown,
  _dap?: DapPayload,
): { body: string; ok: boolean } {
  const fields = stringFields(raw);
  const data = fields.data?.trim() ?? '';
  const assessment = fields.assessment?.trim() ?? '';
  const plan = fields.plan?.trim() ?? '';
  const body = formatRenewDapChartCopy({ data, assessment, plan });
  return { body, ok: Boolean(data && assessment && plan) && body.length >= 40 };
}

export function assembleRenewPcpFromAi(raw: unknown): { body: string; ok: boolean } {
  const fields = stringFields(raw);
  const body = sanitizeProviderNotificationBody((fields.body ?? '').trim());
  if (!body) return { body: '', ok: false };
  return {
    body,
    ok: body.length >= 40 && validatePrescriberNotification(body).length === 0,
  };
}
