import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRESENTATION_REVIEW_COPY } from './presentation-review-copy';
import {
  clampFindingText,
  parsePresentationFindings,
  serializePresentationFindings,
} from './presentation-review-findings';
import { fallbackPathwayEvidence, parsePathwayEvidence, referencesForQuestion } from './presentation-review-evidence';

describe('Presentation Review copy', () => {
  it('uses Presentation Review terminology for the merged section', () => {
    assert.equal(PRESENTATION_REVIEW_COPY.title, 'Presentation Review');
    assert.match(PRESENTATION_REVIEW_COPY.subtitle, /consistent with this pathway/i);
  });

  it('does not use diagnosis, confidence, or AI language', () => {
    const joined = Object.values(PRESENTATION_REVIEW_COPY)
      .map((value) => (typeof value === 'function' ? value(1, 3) : value))
      .join(' ');
    assert.doesNotMatch(joined, /diagnosis confirmation|ai diagnosis|confidence|% match/i);
  });
});

describe('additional clinical findings', () => {
  it('clamps free text to 250 characters', () => {
    assert.equal(clampFindingText('  hello   world  '), 'hello world');
    assert.equal(clampFindingText('x'.repeat(300)).length, 250);
  });

  it('round-trips saved findings without inventing answers', () => {
    const payload = serializePresentationFindings([
      { id: 'f1', text: 'Tenderness more than usual', createdAt: '2026-09-04T14:15:00.000Z' },
    ]);
    const parsed = parsePresentationFindings(payload);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.text, 'Tenderness more than usual');
  });
});

describe('question evidence', () => {
  it('returns only stored references that support the question', () => {
    const refs = [
      {
        id: 'a',
        citationTitle: 'CPS',
        referenceType: 'guideline',
        supportsSections: ['q-1'],
      },
      {
        id: 'b',
        citationTitle: 'Unrelated',
        referenceType: 'guideline',
        supportsSections: ['eligibility'],
      },
    ];
    assert.deepEqual(
      referencesForQuestion(refs, 'q-1').map((row) => row.id),
      ['a'],
    );
  });

  it('does not invent pathway evidence from empty snapshots', () => {
    assert.equal(parsePathwayEvidence(null), null);
    assert.equal(parsePathwayEvidence({ displayName: 'Cold sore' }), null);
  });

  it('builds a fallback evidence record without fabricating reviewers or citations', () => {
    const evidence = fallbackPathwayEvidence({
      pathwayId: 'p1',
      displayName: 'Cold sore',
      jurisdiction: 'Alberta',
      pathwayVersion: 'v1.2',
    });
    assert.equal(evidence?.clinicalReview.reviewers.length, 0);
    assert.equal(evidence?.independentPeerReview.reviewers.length, 0);
    assert.equal(evidence?.references.length, 0);
    assert.equal(evidence?.primaryReference, null);
    assert.equal(evidence?.secondaryReference, null);
    assert.equal(evidence?.clinicalReview.status, 'pending');
  });
});
