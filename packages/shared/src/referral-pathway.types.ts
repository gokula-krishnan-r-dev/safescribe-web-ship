/** SafeScribe referral pathway — shared enums, contracts, and validation */

export const REFERRAL_DESTINATIONS = [
  'emergency_department',
  'urgent_care',
  'family_doctor_np',
  'walk_in_clinic',
  'other',
] as const;

export type ReferralDestination = (typeof REFERRAL_DESTINATIONS)[number];

export const REFERRAL_DESTINATION_LABELS: Record<ReferralDestination, string> = {
  emergency_department: 'Emergency department',
  urgent_care: 'Urgent care',
  family_doctor_np: 'Family doctor / NP',
  walk_in_clinic: 'Walk-in clinic',
  other: 'Other',
};

export const REFERRAL_ACTIONS = [
  'patient_advised',
  'provider_contacted',
  'referral_sent',
  'appointment_arranged',
] as const;

export type ReferralAction = (typeof REFERRAL_ACTIONS)[number];

export const REFERRAL_ACTION_LABELS: Record<ReferralAction, string> = {
  patient_advised: 'Patient advised to seek care',
  provider_contacted: 'Provider contacted',
  referral_sent: 'Referral sent',
  appointment_arranged: 'Appointment arranged',
};

export const PATIENT_REFERRAL_RESPONSES = [
  'agreed',
  'declined',
  'unable_to_confirm',
] as const;

export type PatientReferralResponse = (typeof PATIENT_REFERRAL_RESPONSES)[number];

export const PATIENT_REFERRAL_RESPONSE_LABELS: Record<PatientReferralResponse, string> = {
  agreed: 'Agreed',
  declined: 'Declined',
  unable_to_confirm: 'Unable to confirm',
};

export const REFERRAL_CONTACT_METHODS = [
  'phone',
  'secure_fax',
  'electronic_referral',
  'printed_letter',
  'in_person',
  'other',
] as const;

export type ReferralContactMethod = (typeof REFERRAL_CONTACT_METHODS)[number];

export const REFERRAL_CONTACT_METHOD_LABELS: Record<ReferralContactMethod, string> = {
  phone: 'Phone',
  secure_fax: 'Secure fax',
  electronic_referral: 'Electronic referral',
  printed_letter: 'Printed letter',
  in_person: 'In person',
  other: 'Other',
};

export const FORMAL_HANDOFF_ACTIONS: ReadonlySet<ReferralAction> = new Set([
  'provider_contacted',
  'referral_sent',
  'appointment_arranged',
]);

export const CONTACT_METHOD_REQUIRED_ACTIONS: ReadonlySet<ReferralAction> = new Set([
  'provider_contacted',
  'referral_sent',
]);

export type ReferralUrgencyCode =
  | 'IMMEDIATE_REFERRAL'
  | 'SAME_DAY_REFERRAL'
  | 'FOLLOW_UP_REFERRAL';

export const REFERRAL_URGENCY_DISPLAY: Record<ReferralUrgencyCode, string> = {
  IMMEDIATE_REFERRAL: 'Immediate medical assessment required',
  SAME_DAY_REFERRAL: 'Same-day medical assessment recommended',
  FOLLOW_UP_REFERRAL: 'Medical follow-up recommended',
};

export type ReferralOutcomeStatus = 'draft' | 'completed';

/** Letter lifecycle for the gated create → approve → complete flow */
export type ReferralLetterStatus =
  | 'not_created'
  | 'generating'
  | 'draft'
  | 'approved'
  | 'stale'
  | 'generation_failed'
  | 'finalized';

export type ReferralCompletionState =
  | 'editing_referral'
  | 'previewing_letter'
  | 'ready_to_complete'
  | 'completing'
  | 'completed'
  | 'completion_failed';

/**
 * Policy for whether a pharmacist-approved referral letter gates completion.
 * This release uses `always` — switch pathway/jurisdiction later without UI rewrites.
 */
export type ReferralLetterRequirement = 'always' | 'formal_actions_only' | 'optional';

export const REFERRAL_LETTER_REQUIREMENT: ReferralLetterRequirement = 'always';

/** Implicit action persisted for letter/docs compatibility — not collected in the referral UI. */
export const DEFAULT_REFERRAL_ACTION: ReferralAction = 'patient_advised';

/** Implicit patient response persisted for letter/docs compatibility — not collected in the referral UI. */
export const DEFAULT_REFERRAL_RESPONSE: PatientReferralResponse = 'agreed';

export const REFERRAL_REASON_MIN = 8;
export const REFERRAL_REASON_MAX = 2000;

export type DerivedReferralOutcomeCode =
  | 'referral_recommended_patient_declined'
  | 'provider_contacted'
  | 'referral_sent'
  | 'appointment_arranged'
  | 'referral_advice_provided';

export const DERIVED_REFERRAL_OUTCOME_LABELS: Record<DerivedReferralOutcomeCode, string> = {
  referral_recommended_patient_declined: 'Referral recommended — patient declined',
  provider_contacted: 'Provider contacted',
  referral_sent: 'Referral sent',
  appointment_arranged: 'Appointment arranged',
  referral_advice_provided: 'Referral advice provided',
};

export interface ReferralTriggerSnapshotItem {
  ruleId: string;
  questionId: string;
  responseId?: string;
  label: string;
  urgencyCode: ReferralUrgencyCode;
  urgencyDisplay: string;
}

export interface FormalHandoffInput {
  providerId?: string;
  providerFacility: string;
  contactMethod?: ReferralContactMethod;
  contactMethodOtherText?: string;
  confirmationReceived?: boolean | null;
  handoffAt: string;
}

export interface SaveReferralOutcomeInput {
  pathwayId: string;
  pathwayVersion: number;
  destination: ReferralDestination;
  destinationOtherText?: string;
  /** Pharmacist-reviewed clinical reason. Auto-drafted from assessment, then editable. */
  reasonForReferral: string;
  /** Optional. Server defaults to patient_advised when omitted (not collected in UI). */
  actionTaken?: ReferralAction;
  /** Optional. Server defaults to agreed when omitted (not collected in UI). */
  patientResponse?: PatientReferralResponse;
  additionalNote?: string;
  handoff?: FormalHandoffInput;
  /** Client hint only — server rebuilds the authoritative snapshot */
  triggerSnapshot?: ReferralTriggerSnapshotItem[];
  clientRequestId: string;
  completeConsultation: boolean;
}

export interface ReferralOutcomeValidationError {
  field: string;
  message: string;
}

export function severityToUrgencyCode(severity: string | null | undefined): ReferralUrgencyCode {
  const s = String(severity ?? '').toUpperCase();
  if (s === 'EMERGENCY') return 'IMMEDIATE_REFERRAL';
  if (s === 'CRITICAL') return 'SAME_DAY_REFERRAL';
  return 'FOLLOW_UP_REFERRAL';
}

export function urgencyRank(code: ReferralUrgencyCode): number {
  if (code === 'IMMEDIATE_REFERRAL') return 3;
  if (code === 'SAME_DAY_REFERRAL') return 2;
  return 1;
}

export function pickHighestUrgency(
  codes: ReferralUrgencyCode[],
): { code: ReferralUrgencyCode; display: string } {
  let best: ReferralUrgencyCode = 'FOLLOW_UP_REFERRAL';
  for (const c of codes) {
    if (urgencyRank(c) > urgencyRank(best)) best = c;
  }
  return { code: best, display: REFERRAL_URGENCY_DISPLAY[best] };
}

export function deriveReferralOutcome(
  action: ReferralAction,
  response: PatientReferralResponse,
): DerivedReferralOutcomeCode {
  if (response === 'declined') return 'referral_recommended_patient_declined';
  switch (action) {
    case 'provider_contacted':
      return 'provider_contacted';
    case 'referral_sent':
      return 'referral_sent';
    case 'appointment_arranged':
      return 'appointment_arranged';
    default:
      return 'referral_advice_provided';
  }
}

export function isFormalHandoffAction(action: ReferralAction): boolean {
  return FORMAL_HANDOFF_ACTIONS.has(action);
}

export function sanitizeReferralNote(raw: string | undefined | null, max = 1000): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, max)
    .trim();
}

export function sanitizeReferralReason(raw: string | undefined | null): string {
  return sanitizeReferralNote(raw, REFERRAL_REASON_MAX);
}

export function resolveReferralAction(action?: string | null): ReferralAction {
  if (action && (REFERRAL_ACTIONS as readonly string[]).includes(action)) {
    return action as ReferralAction;
  }
  return DEFAULT_REFERRAL_ACTION;
}

export function resolveReferralResponse(
  response?: string | null,
): PatientReferralResponse {
  if (response && (PATIENT_REFERRAL_RESPONSES as readonly string[]).includes(response)) {
    return response as PatientReferralResponse;
  }
  return DEFAULT_REFERRAL_RESPONSE;
}

/** Client + server shared validation for completed referral outcomes */
export function validateReferralOutcomeInput(input: {
  destination?: string | null;
  destinationOtherText?: string | null;
  reasonForReferral?: string | null;
  actionTaken?: string | null;
  patientResponse?: string | null;
  additionalNote?: string | null;
  handoff?: Partial<FormalHandoffInput> | null;
}): ReferralOutcomeValidationError[] {
  const errors: ReferralOutcomeValidationError[] = [];

  if (!input.destination || !(REFERRAL_DESTINATIONS as readonly string[]).includes(input.destination)) {
    errors.push({ field: 'destination', message: 'Select where the patient was directed.' });
  } else if (input.destination === 'other') {
    const other = String(input.destinationOtherText ?? '').trim();
    if (!other) {
      errors.push({
        field: 'destinationOtherText',
        message: 'Specify the destination when Other is selected.',
      });
    }
  }

  const reasonRaw = String(input.reasonForReferral ?? '');
  const reason = reasonRaw.trim();
  if (!reason) {
    errors.push({ field: 'reasonForReferral', message: 'Enter the reason for referral.' });
  } else if (reason.length < REFERRAL_REASON_MIN) {
    errors.push({
      field: 'reasonForReferral',
      message: 'Reason for referral is too short. Add a brief clinical reason.',
    });
  } else if (reasonRaw.length > REFERRAL_REASON_MAX) {
    errors.push({
      field: 'reasonForReferral',
      message: `Reason for referral must be ${REFERRAL_REASON_MAX.toLocaleString()} characters or fewer.`,
    });
  }

  if (
    input.actionTaken != null &&
    input.actionTaken !== '' &&
    !(REFERRAL_ACTIONS as readonly string[]).includes(input.actionTaken)
  ) {
    errors.push({ field: 'actionTaken', message: 'Select a valid action taken.' });
  }

  if (
    input.patientResponse != null &&
    input.patientResponse !== '' &&
    !(PATIENT_REFERRAL_RESPONSES as readonly string[]).includes(input.patientResponse)
  ) {
    errors.push({ field: 'patientResponse', message: 'Select a valid patient response.' });
  }

  const note = String(input.additionalNote ?? '');
  if (note.length > 1000) {
    errors.push({ field: 'additionalNote', message: 'Additional note must be 1,000 characters or fewer.' });
  }

  const action = input.actionTaken
    ? resolveReferralAction(input.actionTaken)
    : undefined;
  if (action && isFormalHandoffAction(action)) {
    const facility = String(input.handoff?.providerFacility ?? '').trim();
    if (!facility) {
      errors.push({
        field: 'handoff.providerFacility',
        message: 'Enter the provider or facility for this handoff.',
      });
    }

    if (CONTACT_METHOD_REQUIRED_ACTIONS.has(action)) {
      const method = input.handoff?.contactMethod;
      if (!method || !(REFERRAL_CONTACT_METHODS as readonly string[]).includes(method)) {
        errors.push({
          field: 'handoff.contactMethod',
          message: 'Select how the provider was contacted or the referral was sent.',
        });
      } else if (method === 'other') {
        const other = String(input.handoff?.contactMethodOtherText ?? '').trim();
        if (!other) {
          errors.push({
            field: 'handoff.contactMethodOtherText',
            message: 'Specify the contact method when Other is selected.',
          });
        }
      }
    }

    if (!input.handoff?.handoffAt) {
      errors.push({
        field: 'handoff.handoffAt',
        message: 'Enter the handoff date and time.',
      });
    }
  }

  return errors;
}

/** Deterministic referral documentation from structured fields only */
export function buildReferralDocumentationText(params: {
  urgencyDisplay: string;
  triggerLabels: string[];
  destination: ReferralDestination;
  destinationOtherText?: string | null;
  reasonForReferral?: string | null;
  actionTaken?: ReferralAction | null;
  patientResponse?: PatientReferralResponse | null;
  additionalNote?: string | null;
  letterApproved?: boolean;
  handoff?: {
    providerFacility?: string | null;
    contactMethod?: ReferralContactMethod | null;
    contactMethodOtherText?: string | null;
    confirmationReceived?: boolean | null;
    handoffAt?: string | null;
  } | null;
}): string {
  const triggers =
    params.triggerLabels.length > 0
      ? params.triggerLabels.join('; ')
      : 'pathway safety criteria';

  const destLabel =
    params.destination === 'other' && params.destinationOtherText?.trim()
      ? params.destinationOtherText.trim()
      : REFERRAL_DESTINATION_LABELS[params.destination].toLowerCase();

  const action = params.actionTaken
    ? resolveReferralAction(params.actionTaken)
    : DEFAULT_REFERRAL_ACTION;
  const response = params.patientResponse
    ? resolveReferralResponse(params.patientResponse)
    : DEFAULT_REFERRAL_RESPONSE;

  const parts: string[] = [];
  parts.push(
    `Referral recommended for ${params.urgencyDisplay.toLowerCase()} due to: ${triggers}.`,
  );
  parts.push(`Patient directed to the ${destLabel}.`);

  const reason = params.reasonForReferral?.trim();
  if (reason) {
    parts.push(`Reason for referral: ${reason}`);
  }

  // Do not invent action/response copy for the simplified UI (defaults).
  if (isFormalHandoffAction(action)) {
    parts.push(`${REFERRAL_ACTION_LABELS[action]}.`);
  }

  if (response === 'declined') {
    parts.push('Patient declined the referral recommendation.');
  } else if (response === 'unable_to_confirm') {
    parts.push('Patient response: unable to confirm.');
  }

  if (isFormalHandoffAction(action) && params.handoff?.providerFacility) {
    const method =
      params.handoff.contactMethod === 'other' && params.handoff.contactMethodOtherText
        ? params.handoff.contactMethodOtherText
        : params.handoff.contactMethod
          ? REFERRAL_CONTACT_METHOD_LABELS[params.handoff.contactMethod]
          : null;
    let handoffLine = `Formal handoff: ${params.handoff.providerFacility}`;
    if (method) handoffLine += ` via ${method}`;
    if (params.handoff.handoffAt) {
      handoffLine += ` at ${params.handoff.handoffAt}`;
    }
    if (params.handoff.confirmationReceived === true) handoffLine += '. Confirmation received.';
    else if (params.handoff.confirmationReceived === false) handoffLine += '. Confirmation not received.';
    else if (params.handoff.confirmationReceived === null) {
      handoffLine += '. Confirmation status unable to confirm.';
    } else {
      handoffLine += '.';
    }
    parts.push(handoffLine);
  }

  if (params.additionalNote?.trim()) {
    parts.push(`Pharmacist note: ${params.additionalNote.trim()}`);
  }

  if (params.letterApproved) {
    parts.push('A referral letter was created and pharmacist-approved.');
  }

  parts.push('No pharmacist treatment was initiated.');
  return parts.join(' ');
}

/** Stable fingerprint of all fields that affect the referral letter content. */
export function buildReferralSourceFingerprint(input: {
  pathwayId?: string | null;
  pathwayVersion?: number | null;
  urgencyCode?: string | null;
  triggerLabels?: string[];
  destination?: string | null;
  destinationOtherText?: string | null;
  reasonForReferral?: string | null;
  actionTaken?: string | null;
  patientResponse?: string | null;
  additionalNote?: string | null;
  providerFacility?: string | null;
  contactMethod?: string | null;
  contactMethodOtherText?: string | null;
  confirmationReceived?: boolean | null;
  handoffAt?: string | null;
  presentingConcern?: string | null;
}): string {
  const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const confirmation =
    input.confirmationReceived === true
      ? 'yes'
      : input.confirmationReceived === false
        ? 'no'
        : input.confirmationReceived === null
          ? 'unable'
          : '';
  const triggers = (input.triggerLabels ?? [])
    .map((t) => normalize(t))
    .filter(Boolean)
    .sort()
    .join('|');

  return [
    normalize(input.pathwayId),
    String(input.pathwayVersion ?? ''),
    normalize(input.urgencyCode),
    triggers,
    normalize(input.destination),
    normalize(input.destinationOtherText),
    normalize(input.reasonForReferral),
    normalize(input.actionTaken),
    normalize(input.patientResponse),
    normalize(input.additionalNote),
    normalize(input.providerFacility),
    normalize(input.contactMethod),
    normalize(input.contactMethodOtherText),
    confirmation,
    normalize(input.handoffAt),
    normalize(input.presentingConcern),
  ].join('::');
}

export function letterRequirementApplies(
  requirement: ReferralLetterRequirement,
  actionTaken: ReferralAction | string | null | undefined,
): boolean {
  if (requirement === 'always') return true;
  if (requirement === 'optional') return false;
  return isFormalHandoffAction(actionTaken as ReferralAction);
}

export function canCompleteReferralWithLetter(params: {
  referralFormIsValid: boolean;
  referralOutcomeStatus: ReferralOutcomeStatus | 'DRAFT' | 'COMPLETED' | string;
  letterStatus: ReferralLetterStatus | string | null | undefined;
  letterSourceRevision: number | null | undefined;
  referralSourceRevision: number | null | undefined;
  consultationCompleted?: boolean;
  isSaving?: boolean;
  requirement?: ReferralLetterRequirement;
  actionTaken?: ReferralAction | string | null;
  handlingRecorded?: boolean;
}): boolean {
  if (params.consultationCompleted || params.isSaving) return false;
  if (!params.referralFormIsValid) return false;
  const outcomeStatus = String(params.referralOutcomeStatus).toLowerCase();
  if (outcomeStatus === 'completed') return false;

  const requirement = params.requirement ?? REFERRAL_LETTER_REQUIREMENT;
  if (!letterRequirementApplies(requirement, params.actionTaken)) {
    return true;
  }

  const letterStatus = String(params.letterStatus ?? 'not_created').toLowerCase();
  if (letterStatus !== 'approved' && letterStatus !== 'finalized') return false;
  if (
    params.letterSourceRevision == null ||
    params.referralSourceRevision == null ||
    params.letterSourceRevision !== params.referralSourceRevision
  ) {
    return false;
  }
  if (!params.handlingRecorded) return false;

  return true;
}

export interface DocumentFact {
  factId: string;
  label: string;
  displayValue: string;
  sourceType: 'patient' | 'pathway_answer' | 'vital' | 'lab' | 'profile' | 'pharmacist';
  sourceId: string;
  recordedAt?: string;
}

/** Canonical structured facts used to generate pathway-agnostic referral letters */
export interface ReferralLetterFacts {
  consultation: {
    consultationId: string;
    occurredAt: string;
    jurisdiction: string;
    pathwayId: string;
    pathwayName: string;
    pathwayVersionId: string;
    presentingConcern: string;
  };
  patient: {
    patientId: string;
    fullName: string;
    dateOfBirth?: string;
    healthNumber?: string;
    phone?: string;
  };
  recipient: {
    destination: ReferralDestination;
    destinationDisplay: string;
    providerId?: string;
    providerFacility?: string;
  };
  referral: {
    urgencyCode: string;
    urgencyDisplay: string;
    requestedAssessment: string;
    triggerSnapshot: ReferralTriggerSnapshotItem[];
    actionTaken: ReferralAction;
    patientResponse: PatientReferralResponse;
    additionalNote?: string;
  };
  clinical: {
    consultationSummary?: string;
    relevantPositiveFindings: DocumentFact[];
    relevantNegativeFindings: DocumentFact[];
    vitals: DocumentFact[];
    relevantLabs: DocumentFact[];
    relevantConditions: DocumentFact[];
    relevantMedications: DocumentFact[];
    allergies: DocumentFact[];
    interimCare?: DocumentFact[];
  };
  handoff?: FormalHandoffInput;
  pharmacist: {
    userId: string;
    fullName: string;
    licenceNumber?: string;
    pharmacyName: string;
    pharmacyAddress?: string;
    pharmacyPhone?: string;
    pharmacyFax?: string;
  };
}
