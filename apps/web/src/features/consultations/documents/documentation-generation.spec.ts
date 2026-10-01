import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  documentationReadyCopy,
  isDocumentCardGenerating,
  llmDocumentTargets,
} from './documentation-generation';

describe('documentation generation UX helpers', () => {
  it('sends only DAP and PCP to the LLM', () => {
    assert.deepEqual(
      llmDocumentTargets([
        'prescription',
        'patient_care_summary',
        'consultation_note',
        'prescriber_communication',
      ]),
      ['consultation_note', 'prescriber_communication'],
    );
  });

  it('reports per-card generating from document status, not a global percent', () => {
    assert.equal(
      isDocumentCardGenerating({
        id: 'consultation_note',
        status: 'GENERATING',
        versionId: 'v1',
      }),
      true,
    );
    assert.equal(
      isDocumentCardGenerating({
        id: 'prescription',
        status: 'REVIEW_REQUIRED',
        versionId: 'v1',
      }),
      false,
    );
    assert.equal(
      isDocumentCardGenerating({
        id: 'consultation_note',
        status: 'pending',
        versionId: 'v1',
      }),
      false,
      'pending (gated / queued) must not look like active generation',
    );
    assert.equal(documentationReadyCopy(2, 4), 'Preparing documents · 2 of 4 ready');
  });
});
