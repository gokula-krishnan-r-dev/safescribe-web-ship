import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAP_CONSULTATION_NOTE_PROMPT } from './dap-consultation-note-prompt';
import { DOCUMENTATION_PRESCRIPTION_PROMPT } from './dap-payload';
import { PATIENT_CARE_SUMMARY_PROMPT } from './patient-care-summary';
import { PCP_COMMUNICATION_PROMPT } from './pcp-communication-prompt';
import {
  emptyRenewDocument,
  renewLlmDocumentsUsedFallback,
} from './renew';
import {
  RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT,
  RENEW_DOCUMENTATION_PATIENT_HANDOUT_PROMPT,
  RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT,
  RENEW_DOCUMENTATION_PROMPT_KEYS,
  RENEW_DOCUMENTATION_RENEWAL_SUMMARY_PROMPT,
  RENEW_DOCUMENT_KIND_TO_PROMPT_KEY,
  renewPromptCanDrivePrescribeGeneration,
} from './renew-documentation-prompts';

describe('renew documentation prompts', () => {
  it('maps each renew document kind to a Document Session key', () => {
    assert.equal(
      RENEW_DOCUMENT_KIND_TO_PROMPT_KEY.consultation_note,
      RENEW_DOCUMENTATION_PROMPT_KEYS.CONSULTATION_NOTE,
    );
    assert.equal(
      RENEW_DOCUMENT_KIND_TO_PROMPT_KEY.renewal_summary,
      RENEW_DOCUMENTATION_PROMPT_KEYS.RENEWAL_SUMMARY,
    );
    assert.equal(
      RENEW_DOCUMENT_KIND_TO_PROMPT_KEY.prescriber_notification,
      RENEW_DOCUMENTATION_PROMPT_KEYS.PRESCRIBER_NOTIFICATION,
    );
    assert.equal(
      RENEW_DOCUMENT_KIND_TO_PROMPT_KEY.patient_handout,
      RENEW_DOCUMENTATION_PROMPT_KEYS.PATIENT_HANDOUT,
    );
  });

  it('uses dedicated Renew DAP, Rx, PCP, and patient-handout prompts', () => {
    assert.notEqual(RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, DAP_CONSULTATION_NOTE_PROMPT);
    assert.match(RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, /D — Data/);
    assert.match(RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, /COMPACT_CHART_COPY|compact chart-copy/i);
    assert.match(RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, /Pharmacist Renewal Assessment/);
    assert.match(RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, /Original Prescriber Notified/);
    assert.match(RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT, /Renewal authorized for a 7-day supply/);
    assert.doesNotMatch(
      RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT,
      /no effectiveness\/stability concern or medication concern reported/,
    );
    assert.notEqual(RENEW_DOCUMENTATION_RENEWAL_SUMMARY_PROMPT, DOCUMENTATION_PRESCRIPTION_PROMPT);
    assert.match(RENEW_DOCUMENTATION_RENEWAL_SUMMARY_PROMPT, /PRESCRIPTION/);
    assert.match(RENEW_DOCUMENTATION_RENEWAL_SUMMARY_PROMPT, /Rx -/);
    assert.match(RENEW_DOCUMENTATION_RENEWAL_SUMMARY_PROMPT, /deterministic|Renew module/i);
    assert.notEqual(RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT, PCP_COMMUNICATION_PROMPT);
    assert.match(RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT, /Dear Colleague/);
    assert.match(RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT, /Do not output a "To:" line/);
    assert.doesNotMatch(
      RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT,
      /PHARMACIST PRESCRIBING \/ RENEWAL NOTIFICATION/,
    );
    assert.notEqual(RENEW_DOCUMENTATION_PATIENT_HANDOUT_PROMPT, PATIENT_CARE_SUMMARY_PROMPT);
    assert.match(RENEW_DOCUMENTATION_PATIENT_HANDOUT_PROMPT, /Your Medication Renewal/);
    assert.match(RENEW_DOCUMENTATION_PATIENT_HANDOUT_PROMPT, /patient-facing handout|deterministic Nest/i);
  });

  it('accepts Renew structured prompts for Document Session generation', () => {
    assert.equal(
      renewPromptCanDrivePrescribeGeneration(
        'consultation_note',
        'Return JSON only: { "body": "<full plain-text consultation / DAP note>" }',
      ),
      false,
    );
    assert.equal(
      renewPromptCanDrivePrescribeGeneration('consultation_note', RENEW_DOCUMENTATION_CONSULTATION_NOTE_PROMPT),
      true,
    );
    assert.equal(
      renewPromptCanDrivePrescribeGeneration(
        'prescriber_notification',
        RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION_PROMPT,
      ),
      true,
    );
    assert.equal(
      renewPromptCanDrivePrescribeGeneration('prescriber_notification', PCP_COMMUNICATION_PROMPT),
      false,
    );
  });

  it('flags generated LLM documents that did not accept an AI draft', () => {
    assert.equal(
      renewLlmDocumentsUsedFallback([
        emptyRenewDocument('consultation_note', {
          status: 'generated',
          body: 'DAP note',
          generationSource: 'template',
        }),
        emptyRenewDocument('renewal_summary', {
          status: 'generated',
          body: 'Rx',
          generationSource: 'template',
        }),
      ]),
      true,
    );
    assert.equal(
      renewLlmDocumentsUsedFallback([
        emptyRenewDocument('consultation_note', {
          status: 'generated',
          body: 'DAP note',
          generationSource: 'ai',
        }),
        emptyRenewDocument('prescriber_notification', {
          status: 'generated',
          body: 'PCP letter',
          generationSource: 'ai',
        }),
      ]),
      false,
    );
  });

  it('labels the optional handout as Your Medication Renewal', () => {
    assert.equal(emptyRenewDocument('patient_handout').title, 'Your Medication Renewal');
    assert.match(emptyRenewDocument('patient_handout').description, /optional/i);
    assert.equal(emptyRenewDocument('prescriber_notification').title, 'Prescriber Communication');
    assert.equal(emptyRenewDocument('consultation_note').title, 'Pharmacist Renewal Assessment');
  });
});
