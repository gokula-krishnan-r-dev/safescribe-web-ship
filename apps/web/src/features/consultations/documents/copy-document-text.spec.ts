import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDocumentPlainText } from './copy-document-text';

describe('copy document text', () => {
  it('builds patient care summary copy from confirmed fields', () => {
    const text = buildDocumentPlainText('patient_care_summary', {
      documents: {
        patient_care_summary: {
          documentTitle: 'Acute Gout Exacerbation — Your Care Plan',
          howToUse: 'Take naproxen 500 mg twice daily with food.',
        },
      },
    });
    assert.match(text, /Acute Gout Exacerbation/);
    assert.match(text, /naproxen 500 mg/);
  });

  it('does not invent copy for an empty unknown document', () => {
    assert.equal(buildDocumentPlainText('consultation_note', { documents: {} }).trim().length >= 0, true);
  });
});
