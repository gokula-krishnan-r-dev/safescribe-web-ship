/**
 * SafeScribe Renew — ACP communication requirement vs optional notification document.
 * Requirement is rules-based. Generate/Copy never equals communicated.
 */

import {
  RENEW_COMMUNICATION_METHOD_OPTIONS,
  emptyRenewCommunication,
  type RenewCommunicationMethod,
  type RenewCommunicationPurpose,
  type RenewCommunicationRecipient,
  type RenewCommunicationStatus,
  type RenewDecisionState,
  type RenewGeneratedDocument,
  type RenewMedicationPlanItem,
  type RenewPrescriberCommunication,
} from './renew';

export function communicationIsRequiredForPlan(
  items: Pick<RenewMedicationPlanItem, 'selected'>[],
): boolean {
  return items.some((item) => item.selected);
}

export function notificationDocument(
  documents: RenewGeneratedDocument[],
): RenewGeneratedDocument | undefined {
  return documents.find((doc) => doc.kind === 'prescriber_notification');
}

export function syncRenewCommunication(
  decision: Pick<RenewDecisionState, 'items' | 'documents' | 'communication'>,
): RenewPrescriberCommunication {
  const stored = decision.communication ?? emptyRenewCommunication();
  const required = communicationIsRequiredForPlan(decision.items);
  if (!required) {
    return {
      ...emptyRenewCommunication(),
      recipient: stored.recipient,
    };
  }

  const notification = notificationDocument(decision.documents);
  const generated = Boolean(notification?.body.trim()) && notification?.status === 'generated';
  const stale = notification?.status === 'stale';
  let status: RenewCommunicationStatus = stored.status;
  if (stored.noAffectedProfessional && status !== 'COMMUNICATED') {
    status = generated ? 'DRAFT_GENERATED' : 'REQUIRED_PENDING';
  } else if (status === 'NOT_REQUIRED' || !status) {
    status = generated ? 'DRAFT_GENERATED' : 'REQUIRED_PENDING';
  } else if (stale && status !== 'REQUIRED_PENDING') {
    status = 'STALE';
  } else if (generated && (status === 'REQUIRED_PENDING' || status === 'STALE')) {
    status = 'DRAFT_GENERATED';
  }

  return {
    ...stored,
    requirement: 'REQUIRED',
    status,
    noAffectedProfessional: stored.noAffectedProfessional,
  };
}

export function isRenewCommunicationResolved(communication: RenewPrescriberCommunication): boolean {
  if (communication.requirement === 'NOT_REQUIRED') return true;
  if (communication.noAffectedProfessional) return true;
  return communication.status === 'COMMUNICATED';
}

export function communicationBlocksCompletion(decision: RenewDecisionState): boolean {
  return !isRenewCommunicationResolved(syncRenewCommunication(decision));
}

export function communicationRecipientResolved(
  communication: Pick<RenewPrescriberCommunication, 'recipient' | 'noAffectedProfessional'>,
): boolean {
  if (communication.noAffectedProfessional) return true;
  return Boolean(communication.recipient?.name?.trim());
}

export function communicationRequiresRecipient(communication: RenewPrescriberCommunication): boolean {
  return (
    communication.requirement === 'REQUIRED' &&
    !communication.noAffectedProfessional &&
    !communication.recipient?.name?.trim()
  );
}

export type ProviderNotificationFaxState = 'ready' | 'missing_recipient' | 'missing_fax' | 'not_reviewed';

/**
 * Fax enablement for provider notifications.
 * Recipient + fax number are collected in Send Fax (same as Prescribe) — not a separate Recipient control.
 */
export function providerNotificationFaxState(args: {
  reviewed: boolean;
  recipientName?: string | null;
  faxNumber?: string | null;
}): ProviderNotificationFaxState {
  if (!args.reviewed) return 'not_reviewed';
  return 'ready';
}

export function providerNotificationFaxHint(state: ProviderNotificationFaxState): string | null {
  if (state === 'not_reviewed') return 'Review this document before faxing';
  if (state === 'missing_recipient') return 'Recipient required';
  if (state === 'missing_fax') return 'Fax unavailable — add recipient fax number';
  return null;
}

export function providerNotificationRequirementCopy(args: {
  requirement: RenewPrescriberCommunication['requirement'];
  recipientNeeded: boolean;
}): { banner: string; detail: string } {
  if (args.requirement !== 'REQUIRED') {
    return {
      banner: 'Optional communication document.',
      detail: 'Generate, edit, or copy as needed.',
    };
  }
  return {
    banner: 'Communication required for this prescribing decision.',
    detail: 'Complete communication before finishing the consultation.',
  };
}

export function communicationPendingCopy(communication: RenewPrescriberCommunication): string | null {
  const synced = communication;
  if (synced.requirement !== 'REQUIRED') return null;
  if (isRenewCommunicationResolved(synced)) return null;
  if (synced.status === 'STALE') {
    return 'Clinical information changed. Review or regenerate this notification before communicating.';
  }
  if (synced.noAffectedProfessional) return null;
  return 'Required communication pending.';
}

export function formatCommunicationMethod(method: RenewCommunicationMethod | null | undefined): string | null {
  if (!method) return null;
  return RENEW_COMMUNICATION_METHOD_OPTIONS.find((row) => row.id === method)?.label ?? method;
}

export function formatRecipientLine(recipient: RenewCommunicationRecipient | null | undefined): string | null {
  if (!recipient) return null;
  const bits = [
    recipient.name?.trim(),
    recipient.profession?.trim(),
    recipient.clinicName?.trim(),
  ].filter(Boolean);
  return bits.length ? bits.join(' / ') : null;
}

export function formatDapCommunicationRecord(communication: RenewPrescriberCommunication): string | null {
  const synced = communication;
  if (synced.requirement === 'NOT_REQUIRED' || synced.noAffectedProfessional) return null;
  if (synced.status === 'COMMUNICATED' && synced.communicatedAt) {
    const when = formatCommunicationDate(synced.communicatedAt);
    const method = clinicalCommunicationMethod(synced.method);
    return method
      ? `Original Prescriber Notified by ${method} on ${when}.`
      : `Original Prescriber Notified on ${when}.`;
  }
  const when = formatCommunicationDate(new Date().toISOString());
  return `Original Prescriber Notified on ${when}.`;
}

function clinicalCommunicationMethod(method: RenewCommunicationMethod | null | undefined): string | null {
  if (!method) return null;
  if (method === 'SECURE_FAX') return 'fax';
  if (method === 'PHONE') return 'telephone';
  if (method === 'SECURE_ELECTRONIC_MESSAGE') return 'secure message';
  if (method === 'SHARED_HEALTH_RECORD') return 'shared health record';
  if (method === 'HAND_DELIVERED') return 'hand delivery';
  return formatCommunicationMethod(method)?.toLowerCase() ?? null;
}

export function formatCommunicationDate(iso: string, timeZone = 'America/Edmonton'): string {
  return formatCommunicationDateTime(iso, timeZone).replace(/\s+at\s+\d{1,2}:\d{2}$/, '');
}

export function formatCommunicationDateTime(iso: string, timeZone = 'America/Edmonton'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
      timeZone,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')}-${get('month')}-${get('year')} at ${get('hour')}:${get('minute')}`;
  } catch {
    return iso;
  }
}

export function canMarkCommunicationComplete(args: {
  documents: RenewGeneratedDocument[];
  method: RenewCommunicationMethod;
  communicatedAt: string;
  phoneSummary?: string | null;
  recipientName?: string | null;
  status?: RenewCommunicationStatus;
}): { ok: boolean; reason: string | null } {
  const notification = notificationDocument(args.documents);
  if (args.status === 'STALE' || notification?.status === 'stale') {
    return {
      ok: false,
      reason: 'Clinical information changed. Review or regenerate this notification before communicating.',
    };
  }
  if (!args.recipientName?.trim()) {
    return { ok: false, reason: 'Required communication — recipient not identified.' };
  }
  if (!args.method) {
    return { ok: false, reason: 'Select how the communication was sent.' };
  }
  const at = new Date(args.communicatedAt);
  if (Number.isNaN(at.getTime())) {
    return { ok: false, reason: 'Enter the date and time of communication.' };
  }
  if (args.method === 'PHONE' && !args.phoneSummary?.trim()) {
    return { ok: false, reason: 'Record a brief summary of the telephone communication.' };
  }
  return { ok: true, reason: null };
}

export function applyDraftGenerated(
  communication: RenewPrescriberCommunication,
  required: boolean,
): RenewPrescriberCommunication {
  if (!required) {
    return {
      ...communication,
      requirement: 'NOT_REQUIRED',
      status: 'NOT_REQUIRED',
    };
  }
  return {
    ...communication,
    requirement: 'REQUIRED',
    status: communication.status === 'COMMUNICATED' ? 'COMMUNICATED' : 'DRAFT_GENERATED',
  };
}

export function staleCommunicationOnClinicalChange(
  communication: RenewPrescriberCommunication,
): RenewPrescriberCommunication {
  if (communication.requirement !== 'REQUIRED') return communication;
  if (communication.status === 'NOT_REQUIRED' || communication.status === 'REQUIRED_PENDING') {
    return communication;
  }
  return {
    ...communication,
    status: 'STALE',
    communicatedAt: communication.status === 'COMMUNICATED' ? communication.communicatedAt : null,
    method: communication.status === 'COMMUNICATED' ? communication.method : communication.method,
  };
}

export function markRenewCommunicationComplete(
  communication: RenewPrescriberCommunication,
  body: {
    method: RenewCommunicationMethod;
    communicatedAt: string;
    communicatedBy?: string | null;
    note?: string | null;
    phoneSummary?: string | null;
    purpose?: RenewCommunicationPurpose;
    recipient?: RenewCommunicationRecipient | null;
  },
): RenewPrescriberCommunication {
  return {
    ...communication,
    requirement: 'REQUIRED',
    status: 'COMMUNICATED',
    purpose: body.purpose ?? communication.purpose,
    recipient: body.recipient ?? communication.recipient,
    method: body.method,
    communicatedAt: body.communicatedAt,
    communicatedBy: body.communicatedBy ?? communication.communicatedBy,
    note: body.note?.trim() || null,
    phoneSummary: body.method === 'PHONE' ? body.phoneSummary?.trim() || null : communication.phoneSummary,
    noAffectedProfessional: false,
  };
}

export function confirmNoAffectedProfessional(
  communication: RenewPrescriberCommunication,
  confirmed: boolean,
): RenewPrescriberCommunication {
  return {
    ...communication,
    noAffectedProfessional: confirmed,
  };
}
