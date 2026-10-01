/**
 * Adapt Step 4 Document Session system prompts (Super Admin AI System defaults).
 *
 * Consultation note uses the Adapt DAP generation prompt (v2).
 * Prescriber communication uses the Adapt PCP notification prompt.
 * Adapted prescription is deterministic; the Adapt Rx prompt is catalog/formatter only.
 * Patient handout is mostly deterministic; AI may only simplify confirmed narrative fields.
 */

import { ADAPT_DAP_CONSULTATION_NOTE_PROMPT } from './adapt-dap-consultation-note-prompt';
import { ADAPT_PCP_COMMUNICATION_PROMPT } from './adapt-pcp-communication-prompt';
import { ADAPT_PHARMACIST_PRESCRIPTION_PROMPT } from './adapt-pharmacist-prescription-prompt';
import { ADAPT_PATIENT_HANDOUT_PROMPT } from './adapt-patient-handout-prompt';
import type { AdaptDocumentTypeId } from './adapt';

export const ADAPT_DOCUMENTATION_PROMPT_KEYS = {
  CONSULTATION_NOTE: 'ADAPT_DOCUMENTATION_CONSULTATION_NOTE',
  PRESCRIBER_COMMUNICATION: 'ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION',
  PRESCRIPTION: 'ADAPT_DOCUMENTATION_PRESCRIPTION',
  PATIENT_CARE_SUMMARY: 'ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY',
} as const;

export type AdaptDocumentationPromptKey =
  (typeof ADAPT_DOCUMENTATION_PROMPT_KEYS)[keyof typeof ADAPT_DOCUMENTATION_PROMPT_KEYS];

export const ADAPT_DOCUMENT_KIND_TO_PROMPT_KEY: Partial<
  Record<AdaptDocumentTypeId, AdaptDocumentationPromptKey>
> = {
  consultation_note: ADAPT_DOCUMENTATION_PROMPT_KEYS.CONSULTATION_NOTE,
  prescriber_communication: ADAPT_DOCUMENTATION_PROMPT_KEYS.PRESCRIBER_COMMUNICATION,
  prescription: ADAPT_DOCUMENTATION_PROMPT_KEYS.PRESCRIPTION,
  patient_care_summary: ADAPT_DOCUMENTATION_PROMPT_KEYS.PATIENT_CARE_SUMMARY,
};

/** Adapt Step 4 Pharmacist Consultation Note (DAP) system prompt. */
export const ADAPT_DOCUMENTATION_CONSULTATION_NOTE_PROMPT = ADAPT_DAP_CONSULTATION_NOTE_PROMPT;

/** Adapt Step 4 PCP / Prescriber Communication system prompt. */
export const ADAPT_DOCUMENTATION_PRESCRIBER_COMMUNICATION_PROMPT =
  ADAPT_PCP_COMMUNICATION_PROMPT;

/** Adapt Step 4 Adapted Prescription prompt (deterministic Nest/shared render; catalog only). */
export const ADAPT_DOCUMENTATION_PRESCRIPTION_PROMPT =
  ADAPT_PHARMACIST_PRESCRIPTION_PROMPT;

/** Adapt Step 4 Patient Handout prompt (deterministic Nest + optional narrative simplification). */
export const ADAPT_DOCUMENTATION_PATIENT_CARE_SUMMARY_PROMPT = ADAPT_PATIENT_HANDOUT_PROMPT;

/**
 * Adapt Document Session DAP prompts must expose structured JSON fields
 * the Adapt DAP assembler expects (data / assessment / plan).
 */
export function adaptPromptCanDriveDapGeneration(content: string): boolean {
  const live = content.trim();
  if (!live) return false;
  return /"data"/.test(live) && /"assessment"/.test(live) && /"plan"/.test(live);
}

/**
 * Adapt Document Session PCP prompts must expose structured JSON fields
 * the Adapt PCP assembler expects.
 */
export function adaptPromptCanDrivePcpGeneration(content: string): boolean {
  const live = content.trim();
  if (!live) return false;
  return (
    /"intro"/.test(live) &&
    /"rationale"/.test(live) &&
    /"closing"/.test(live)
  );
}

/**
 * Adapt Document Session patient-handout prompts must expose the narrative JSON fields.
 */
export function adaptPromptCanDrivePatientHandoutGeneration(content: string): boolean {
  const live = content.trim();
  if (!live) return false;
  return (
    /"what_changed"/.test(live) &&
    /"why_it_changed"/.test(live) &&
    /"follow_up"/.test(live) &&
    /"when_to_get_help"/.test(live)
  );
}
