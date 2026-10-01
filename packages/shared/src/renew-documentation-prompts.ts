/**
 * Renew Step 4 Document Session system prompts (Super Admin AI System defaults).
 *
 * Consultation note uses the Renew DAP compact chart-copy prompt.
 * Prescriber notification uses the Renew PCP provider-communication prompt.
 * Pharmacist prescription is deterministic; the Renew Rx prompt is catalog/formatter only.
 * Patient handout is deterministic; the Renew handout prompt is catalog/formatter only.
 */

import { RENEW_DAP_CONSULTATION_NOTE_PROMPT } from './renew-dap-consultation-note-prompt';
import { RENEW_PATIENT_HANDOUT_PROMPT } from './renew-patient-handout-prompt';
import { RENEW_PCP_COMMUNICATION_PROMPT } from './renew-pcp-communication-prompt';
import { RENEW_PHARMACIST_PRESCRIPTION_PROMPT } from './renew-pharmacist-prescription-prompt';
import type { RenewDocumentKind } from './renew';

export const RENEW_DOCUMENTATION_PROMPT_KEYS = {
  CONSULTATION_NOTE: 'RENEW_DOCUMENTATION_CONSULTATION_NOTE',
  RENEWAL_SUMMARY: 'RENEW_DOCUMENTATION_RENEWAL_SUMMARY',
  PRESCRIBER_NOTIFICATION: 'RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION',
  PATIENT_HANDOUT: 'RENEW_DOCUMENTATION_PATIENT_HANDOUT',
} as const;

export type RenewDocumentationPromptKey =
  (typeof RENEW_DOCUMENTATION_PROMPT_KEYS)[keyof typeof RENEW_DOCUMENTATION_PROMPT_KEYS];

export const RENEW_DOCUMENT_KIND_TO_PROMPT_KEY: Record<
  RenewDocumentKind,
  RenewDocumentationPromptKey
> = {
  consultation_note: RENEW_DOCUMENTATION_PROMPT_KEYS.CONSULTATION_NOTE,
  renewal_summary: RENEW_DOCUMENTATION_PROMPT_KEYS.RENEWAL_SUMMARY,
  prescriber_notification: RENEW_DOCUMENTATION_PROMPT_KEYS.PRESCRIBER_NOTIFICATION,
  patient_handout: RENEW_DOCUMENTATION_PROMPT_KEYS.PATIENT_HANDOUT,
};

/** Renew compact chart-copy DAP prompt (not the Prescribe consultation-note prompt). */
export const RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT =
  RENEW_DAP_CONSULTATION_NOTE_PROMPT;

/** Renew formal pharmacist prescription prompt (deterministic Nest render; catalog/formatter only). */
export const RENEW_DOCUMENTATION_RENEWAL_SUMMARY_PROMPT =
  RENEW_PHARMACIST_PRESCRIPTION_PROMPT;

/** Renew provider-communication prompt (not the Prescribe PCP letter prompt). */
export const RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT =
  RENEW_PCP_COMMUNICATION_PROMPT;

/** Renew optional patient handout prompt (deterministic Nest render; catalog/formatter only). */
export const RENEW_DOCUMENTATION_PATIENT_HANDOUT_PROMPT = RENEW_PATIENT_HANDOUT_PROMPT;

/**
 * Renew Document Session prompts must expose the structured JSON fields the
 * Renew assemblers expect (DAP data/assessment/plan or PCP body).
 */
export function renewPromptCanDrivePrescribeGeneration(
  kind: Extract<RenewDocumentKind, 'consultation_note' | 'prescriber_notification'>,
  content: string,
): boolean {
  const live = content.trim();
  if (!live) return false;
  if (kind === 'consultation_note') {
    return /"data"/.test(live) && /"assessment"/.test(live) && /"plan"/.test(live);
  }
  return /"body"/.test(live) && /PROVIDER_NOTIFICATION|provider communication|renew_pcp_source/i.test(live);
}
