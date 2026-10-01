import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAP_CONSULTATION_NOTE_PROMPT } from './dap-consultation-note-prompt';

describe('DAP consultation note system prompt', () => {
  it('uses the verified dap_payload and JSON-only DAP contract', () => {
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /validated `dap_payload`/);
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /"documentTitle": "Pharmacist Consultation Note"/);
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /"data": ""/);
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /"assessment": ""/);
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /"plan": ""/);
  });

  it('forbids monograph safety text and unconfirmed actions', () => {
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /NO MONOGRAPH OR REFERENCE TEXT IN DAP/);
    assert.match(DAP_CONSULTATION_NOTE_PROMPT, /Generated ≠ completed/);
    assert.match(
      DAP_CONSULTATION_NOTE_PROMPT,
      /Patient informed consent obtained prior to the pharmacist assessment/,
    );
  });
});
