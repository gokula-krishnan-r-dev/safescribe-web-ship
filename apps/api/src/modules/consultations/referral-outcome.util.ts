import {
  buildReferralDocumentationText,
  buildReferralSourceFingerprint,
  deriveReferralOutcome,
  isFormalHandoffAction,
  letterRequirementApplies,
  pickHighestUrgency,
  sanitizeReferralNote,
  sanitizeReferralReason,
  severityToUrgencyCode,
  resolveReferralAction,
  resolveReferralResponse,
  validateReferralOutcomeInput,
  DERIVED_REFERRAL_OUTCOME_LABELS,
  REFERRAL_LETTER_REQUIREMENT,
  REFERRAL_URGENCY_DISPLAY,
  type ReferralAction,
  type ReferralDestination,
  type PatientReferralResponse,
  type ReferralContactMethod,
  type ReferralTriggerSnapshotItem,
  type ReferralUrgencyCode,
} from '@safescript/shared';
import { createHash } from 'crypto';

type AcknowledgmentLike = {
  flagId?: string;
  flag?: string;
  answer?: string;
  action?: string;
};

type PathwayFlagLike = {
  id?: string;
  title?: string;
  severity?: string;
  action?: string | null;
  description?: string | null;
};

export function mapPathwayFlags(raw: unknown): PathwayFlagLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f) => f && typeof f === 'object') as PathwayFlagLike[];
}

/**
 * Build a server-owned trigger snapshot from persisted red-flag acknowledgments
 * and the pathway configuration. Never trust the client snapshot alone.
 */
export function buildServerTriggerSnapshot(
  redFlags: unknown,
  pathwayRedFlags: unknown,
): {
  triggers: ReferralTriggerSnapshotItem[];
  urgencyCode: ReferralUrgencyCode;
  urgencyDisplay: string;
} {
  const pathwayFlags = mapPathwayFlags(pathwayRedFlags);
  const flagById = new Map(
    pathwayFlags.map((f) => [String(f.id ?? ''), f] as const).filter(([id]) => Boolean(id)),
  );

  const rf = (redFlags ?? {}) as {
    acknowledgments?: AcknowledgmentLike[];
    referralSelected?: boolean;
  };

  const acks = Array.isArray(rf.acknowledgments) ? rf.acknowledgments : [];
  const referAcks = acks.filter(
    (a) => a.action === 'refer' || (a.answer === 'yes' && a.action === 'refer'),
  );

  const triggers: ReferralTriggerSnapshotItem[] = [];
  for (const ack of referAcks) {
    const flagId = String(ack.flagId ?? '');
    const pathwayFlag = flagById.get(flagId.replace(/^pathway:/, '')) ?? flagById.get(flagId);
    const severity = pathwayFlag?.severity ?? 'HIGH';
    const urgencyCode = severityToUrgencyCode(severity);
    const label =
      String(pathwayFlag?.title ?? '').trim() ||
      String(ack.flag ?? '')
        .replace(/^Is the following present:\s*/i, '')
        .replace(/\?$/, '')
        .trim() ||
      'Triggered safety criterion';

    triggers.push({
      ruleId: String((pathwayFlag?.id ?? flagId) || `ack:${triggers.length}`),
      questionId: flagId || String(pathwayFlag?.id ?? `q:${triggers.length}`),
      label,
      urgencyCode,
      urgencyDisplay: REFERRAL_URGENCY_DISPLAY[urgencyCode],
    });
  }

  // Fallback: if referral was selected but acks missing, use any Yes answers
  if (triggers.length === 0 && rf.referralSelected) {
    for (const ack of acks.filter((a) => a.answer === 'yes')) {
      const flagId = String(ack.flagId ?? '');
      const pathwayFlag = flagById.get(flagId.replace(/^pathway:/, '')) ?? flagById.get(flagId);
      const urgencyCode = severityToUrgencyCode(pathwayFlag?.severity);
      triggers.push({
        ruleId: String((pathwayFlag?.id ?? flagId) || `yes:${triggers.length}`),
        questionId: flagId || `q:${triggers.length}`,
        label: String(pathwayFlag?.title ?? ack.flag ?? 'Triggered safety criterion'),
        urgencyCode,
        urgencyDisplay: REFERRAL_URGENCY_DISPLAY[urgencyCode],
      });
    }
  }

  const { code, display } = pickHighestUrgency(triggers.map((t) => t.urgencyCode));
  return { triggers, urgencyCode: code, urgencyDisplay: display };
}

export function assertReferralTriggersActive(triggers: ReferralTriggerSnapshotItem[]): void {
  if (!triggers.length) {
    throw new Error('NO_ACTIVE_REFERRAL_TRIGGERS');
  }
}

export function validateAndNormalizeReferralFields(input: {
  destination: ReferralDestination;
  destinationOtherText?: string;
  reasonForReferral?: string;
  actionTaken?: ReferralAction;
  patientResponse?: PatientReferralResponse;
  additionalNote?: string;
  handoff?: {
    providerId?: string;
    providerFacility: string;
    contactMethod?: ReferralContactMethod;
    contactMethodOtherText?: string;
    confirmationReceived?: boolean | null;
    handoffAt: string;
  };
}) {
  const errors = validateReferralOutcomeInput(input);
  if (errors.length) {
    return { ok: false as const, errors };
  }

  const note = sanitizeReferralNote(input.additionalNote);
  const reason = sanitizeReferralReason(input.reasonForReferral);
  const actionTaken = resolveReferralAction(input.actionTaken);
  const patientResponse = resolveReferralResponse(input.patientResponse);
  const formal = isFormalHandoffAction(actionTaken);

  return {
    ok: true as const,
    destination: input.destination,
    destinationOtherText:
      input.destination === 'other' ? String(input.destinationOtherText ?? '').trim() : null,
    reasonForReferral: reason,
    actionTaken,
    patientResponse,
    additionalNote: note || null,
    handoff: formal
      ? {
          providerId: input.handoff?.providerId ?? null,
          providerFacility: String(input.handoff?.providerFacility ?? '').trim(),
          contactMethod: input.handoff?.contactMethod ?? null,
          contactMethodOtherText:
            input.handoff?.contactMethod === 'other'
              ? String(input.handoff.contactMethodOtherText ?? '').trim()
              : null,
          confirmationReceived:
            input.handoff?.confirmationReceived === undefined
              ? null
              : input.handoff.confirmationReceived,
          handoffAt: new Date(input.handoff!.handoffAt),
        }
      : null,
  };
}

export function buildDocumentationFromOutcome(params: {
  urgencyDisplay: string;
  triggers: ReferralTriggerSnapshotItem[];
  destination: ReferralDestination;
  destinationOtherText?: string | null;
  reasonForReferral?: string | null;
  actionTaken: ReferralAction;
  patientResponse: PatientReferralResponse;
  additionalNote?: string | null;
  letterApproved?: boolean;
  handoff?: {
    providerFacility?: string | null;
    contactMethod?: ReferralContactMethod | null;
    contactMethodOtherText?: string | null;
    confirmationReceived?: boolean | null;
    handoffAt?: Date | null;
  } | null;
}): { derivedCode: string; displayOutcome: string; documentationText: string } {
  const derivedCode = deriveReferralOutcome(params.actionTaken, params.patientResponse);
  return {
    derivedCode,
    displayOutcome: DERIVED_REFERRAL_OUTCOME_LABELS[derivedCode],
    documentationText: buildReferralDocumentationText({
      urgencyDisplay: params.urgencyDisplay,
      triggerLabels: params.triggers.map((t) => t.label),
      destination: params.destination,
      destinationOtherText: params.destinationOtherText,
      reasonForReferral: params.reasonForReferral,
      actionTaken: params.actionTaken,
      patientResponse: params.patientResponse,
      additionalNote: params.additionalNote,
      letterApproved: params.letterApproved,
      handoff: params.handoff
        ? {
            providerFacility: params.handoff.providerFacility,
            contactMethod: params.handoff.contactMethod,
            contactMethodOtherText: params.handoff.contactMethodOtherText,
            confirmationReceived: params.handoff.confirmationReceived,
            handoffAt: params.handoff.handoffAt
              ? params.handoff.handoffAt.toISOString()
              : null,
          }
        : null,
    }),
  };
}

export { buildReferralLetterDraft } from '@safescript/shared';

export function fingerprintFromOutcomeFields(params: {
  pathwayId: string;
  pathwayVersion: number;
  urgencyCode: string;
  triggers: ReferralTriggerSnapshotItem[];
  destination: string;
  destinationOtherText?: string | null;
  reasonForReferral?: string | null;
  actionTaken: string;
  patientResponse: string;
  additionalNote?: string | null;
  providerFacility?: string | null;
  contactMethod?: string | null;
  contactMethodOtherText?: string | null;
  confirmationReceived?: boolean | null;
  handoffAt?: Date | string | null;
  presentingConcern?: string | null;
}): string {
  return buildReferralSourceFingerprint({
    pathwayId: params.pathwayId,
    pathwayVersion: params.pathwayVersion,
    urgencyCode: params.urgencyCode,
    triggerLabels: params.triggers.map((t) => t.label),
    destination: params.destination,
    destinationOtherText: params.destinationOtherText,
    reasonForReferral: params.reasonForReferral,
    actionTaken: params.actionTaken,
    patientResponse: params.patientResponse,
    additionalNote: params.additionalNote,
    providerFacility: params.providerFacility,
    contactMethod: params.contactMethod,
    contactMethodOtherText: params.contactMethodOtherText,
    confirmationReceived: params.confirmationReceived,
    handoffAt:
      params.handoffAt instanceof Date
        ? params.handoffAt.toISOString()
        : params.handoffAt
          ? String(params.handoffAt)
          : null,
    presentingConcern: params.presentingConcern,
  });
}

export function hashLetterContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function mapDbLetterStatusToApi(
  status: string | null | undefined,
): 'not_created' | 'draft' | 'approved' | 'stale' | 'finalized' | 'void' {
  switch (String(status ?? 'NOT_CREATED').toUpperCase()) {
    case 'DRAFT':
      return 'draft';
    case 'APPROVED':
      return 'approved';
    case 'STALE':
      return 'stale';
    case 'FINALIZED':
      return 'finalized';
    case 'VOID':
      return 'void';
    default:
      return 'not_created';
  }
}

export function isLetterApprovedAndCurrent(params: {
  letterStatus: string | null | undefined;
  sourceRevision: number;
  letterApprovedSourceRevision: number | null | undefined;
}): boolean {
  const status = String(params.letterStatus ?? '').toUpperCase();
  if (status !== 'APPROVED' && status !== 'FINALIZED') return false;
  return (
    params.letterApprovedSourceRevision != null &&
    params.letterApprovedSourceRevision === params.sourceRevision
  );
}

export function assertReferralLetterGate(params: {
  actionTaken: string;
  letterStatus: string | null | undefined;
  sourceRevision: number;
  letterApprovedSourceRevision: number | null | undefined;
}): void {
  if (!letterRequirementApplies(REFERRAL_LETTER_REQUIREMENT, params.actionTaken)) {
    return;
  }

  if (
    !isLetterApprovedAndCurrent({
      letterStatus: params.letterStatus,
      sourceRevision: params.sourceRevision,
      letterApprovedSourceRevision: params.letterApprovedSourceRevision,
    })
  ) {
    const status = String(params.letterStatus ?? '').toUpperCase();
    if (status === 'STALE') {
      throw new Error('LETTER_STALE');
    }
    throw new Error('LETTER_NOT_APPROVED');
  }
}
