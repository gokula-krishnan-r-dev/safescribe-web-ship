import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractClinicalNoteLocal,
  renderConsultationNote,
} from '@safescript/shared';
import { INTAKE_COPY } from './intake-copy';

describe('Step 1 intake copy', () => {
  it('keeps the symptom-based presenting-concern placeholder', () => {
    assert.match(INTAKE_COPY.presentingPlaceholder, /blister on upper lip/i);
    assert.doesNotMatch(INTAKE_COPY.presentingPlaceholder, /cold sore/i);
  });

  it('approves and continues in one action', () => {
    assert.equal(INTAKE_COPY.approve, 'Approve & continue');
    assert.equal(INTAKE_COPY.continueApproved, 'Continue');
  });
});

describe('Step 1 note rendering', () => {
  it('renders the spec example as presenting concern + relevant clinical chips', () => {
    const result = extractClinicalNoteLocal(`
00:05 Patient: I have tingling on my upper lip since yesterday.
00:12 Patient: I have type 2 diabetes and I take metformin.
00:19 Patient: I'm allergic to amoxicillin.
00:37 Patient: No, I don't have any other symptoms.
`);
    const rendered = renderConsultationNote(result);
    assert.equal(rendered.presentingConcern, 'Tingling on upper lip since yesterday');
    assert.ok(rendered.chipItems.some((item) => item.text === 'Amoxicillin allergy'));
    assert.doesNotMatch(rendered.plainText, /school|herpes|cold sore/i);
  });
});
