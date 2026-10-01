import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeExtractionIntoNote } from './apply-captured-note';

describe('mergeExtractionIntoNote', () => {
  it('keeps dictated text when extraction returns an empty note', () => {
    const merged = mergeExtractionIntoNote({
      payload: {
        transcript: '',
        rendered: { plainText: '', items: [], presentingConcern: null },
        sourceTranscript: 'Painful blister on the upper lip since yesterday.',
      },
      currentNotes: 'Painful blister on the upper lip since yesterday.',
      currentConcern: '',
      currentItems: [],
    });

    assert.equal(merged.notes, 'Painful blister on the upper lip since yesterday.');
    assert.equal(merged.editing, true);
    assert.equal(merged.items.length, 0);
  });

  it('shows structured review when extraction found clinical items', () => {
    const merged = mergeExtractionIntoNote({
      payload: {
        chiefComplaint: 'Painful blister on upper lip',
        rendered: {
          presentingConcern: 'Painful blister on upper lip',
          plainText: 'Presenting concern\nPainful blister on upper lip\n\nRelevant clinical information\n• Type 2 diabetes',
          items: [
            {
              id: '1',
              category: 'medical_condition',
              text: 'Type 2 diabetes',
              certainty: 'confirmed',
              clinicallyRelevantReason: 'safety',
            },
          ],
        },
        sourceTranscript: 'I have a painful blister and type 2 diabetes.',
      },
      currentNotes: 'I have a painful blister and type 2 diabetes.',
      currentConcern: '',
      currentItems: [],
    });

    assert.match(merged.notes, /Type 2 diabetes/);
    assert.equal(merged.presentingConcern, 'Painful blister on upper lip');
    assert.equal(merged.editing, false);
    assert.equal(merged.items[0]?.text, 'Type 2 diabetes');
  });
});
