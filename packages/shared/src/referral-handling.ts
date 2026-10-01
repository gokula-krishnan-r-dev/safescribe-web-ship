/** Referral handling / delivery outcome after letter approval. */

export const REFERRAL_HANDLING_METHODS = [
  'FAXED_FROM_SAFESCRIBE',
  'PRINTED_AND_PROVIDED_TO_PATIENT',
  'PATIENT_DIRECTED_LETTER_NOT_SENT',
  'SENT_ANOTHER_WAY',
] as const;

export type ReferralHandlingMethod = (typeof REFERRAL_HANDLING_METHODS)[number];

/** Pharmacist-selectable methods. Faxed-from-SafeScribe is set only by verified fax success. */
export const MANUAL_REFERRAL_HANDLING_METHODS = [
  'PRINTED_AND_PROVIDED_TO_PATIENT',
  'PATIENT_DIRECTED_LETTER_NOT_SENT',
  'SENT_ANOTHER_WAY',
] as const;

export type ManualReferralHandlingMethod = (typeof MANUAL_REFERRAL_HANDLING_METHODS)[number];

export const REFERRAL_HANDLING_STORAGE: Record<ReferralHandlingMethod, string> = {
  FAXED_FROM_SAFESCRIBE: 'secure_fax',
  PRINTED_AND_PROVIDED_TO_PATIENT: 'printed_and_provided',
  PATIENT_DIRECTED_LETTER_NOT_SENT: 'patient_directed_not_sent',
  SENT_ANOTHER_WAY: 'sent_another_way',
};

const STORAGE_TO_METHOD: Record<string, ReferralHandlingMethod> = {
  secure_fax: 'FAXED_FROM_SAFESCRIBE',
  printed_letter: 'PRINTED_AND_PROVIDED_TO_PATIENT',
  printed_and_provided: 'PRINTED_AND_PROVIDED_TO_PATIENT',
  patient_directed_not_sent: 'PATIENT_DIRECTED_LETTER_NOT_SENT',
  sent_another_way: 'SENT_ANOTHER_WAY',
  other: 'SENT_ANOTHER_WAY',
};

export const REFERRAL_HANDLING_OPTION_LABELS: Record<ManualReferralHandlingMethod, string> = {
  PRINTED_AND_PROVIDED_TO_PATIENT: 'Printed and provided to patient',
  PATIENT_DIRECTED_LETTER_NOT_SENT: 'Patient directed to care; letter not sent',
  SENT_ANOTHER_WAY: 'Sent another way',
};

export const REFERRAL_HANDLING_DETAIL_MAX = 250;

export function isReferralHandlingMethod(value: string | null | undefined): value is ReferralHandlingMethod {
  return Boolean(value && (REFERRAL_HANDLING_METHODS as readonly string[]).includes(value));
}

export function isManualReferralHandlingMethod(
  value: string | null | undefined,
): value is ManualReferralHandlingMethod {
  return Boolean(value && (MANUAL_REFERRAL_HANDLING_METHODS as readonly string[]).includes(value));
}

export function handlingMethodFromStorage(
  contactMethod: string | null | undefined,
  opts: { faxConfirmed?: boolean | null; letterApproved?: boolean } = {},
): ReferralHandlingMethod | null {
  const key = String(contactMethod ?? '').trim().toLowerCase();
  if (key) return STORAGE_TO_METHOD[key] ?? null;
  // Historical fax success may exist after a later edit. Only treat it as the
  // current handling method while this working version is still approved.
  if (opts.letterApproved && opts.faxConfirmed) return 'FAXED_FROM_SAFESCRIBE';
  return null;
}

export function handlingMethodToStorage(method: ReferralHandlingMethod): string {
  return REFERRAL_HANDLING_STORAGE[method];
}

export function referralHandlingLabel(
  method: ReferralHandlingMethod | null | undefined,
  detail?: string | null,
): string {
  if (!method) return 'Not recorded';
  if (method === 'FAXED_FROM_SAFESCRIBE') return 'Fax sent from SafeScribe';
  if (method === 'SENT_ANOTHER_WAY') {
    const extra = String(detail ?? '').trim();
    return extra ? `Sent another way — ${extra}` : 'Sent another way';
  }
  return REFERRAL_HANDLING_OPTION_LABELS[method];
}

export function handlingRecordIsComplete(
  method: ReferralHandlingMethod | null | undefined,
  detail?: string | null,
): boolean {
  if (!method) return false;
  if (method === 'SENT_ANOTHER_WAY') return String(detail ?? '').trim().length > 0;
  return true;
}
