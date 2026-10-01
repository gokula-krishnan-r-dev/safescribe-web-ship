import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parsePresentationReviewImport,
  parseReferenceIds,
  questionOverlapScore,
} from './presentation-review-import.parser';

const SAMPLE = `## Presentation Review

### 1. Does the patient have typical prodromal symptoms before the lesion appears?
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: Prodromal tingling or burning may precede visible lesions in recurrent herpes labialis.
- Pharmacist tip: Ask when symptoms first began, not only when the blister became visible.
- Conditional display: null
- References: R1

### 2. Is the lesion on or near the vermilion border of the lip?
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: Typical location helps support consistency with herpes labialis.
- Pharmacist tip: Confirm whether lesions are external/perioral rather than only intraoral.
- Conditional display: null
- References: R1, R2

### 3. For a recurrent episode, does this resemble the patient's usual pattern?
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: A predictable pattern supports consistency with a recurrent episode.
- Pharmacist tip: None
- Conditional display: Only show if prior history of cold sores = Yes
- References: R1

## Section Evidence
- R1
- R2

## Reference Library

### R1
- Title: [source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true

### R2
- Title: [second source title]
- Organization / publisher: [organization]
- Guideline / document type: Product monograph
- Year / edition: [edition]
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: false
`;

describe('presentation review ChatGPT import parser', () => {
  it('parses questions, section evidence, and the reference library', () => {
    const parsed = parsePresentationReviewImport(SAMPLE);
    assert.equal(parsed.format, 'structured');
    assert.equal(parsed.questions.length, 3);
    assert.equal(parsed.questions[0]!.questionText.startsWith('Does the patient have typical prodromal'), true);
    assert.equal(parsed.questions[0]!.answerType, 'YES_NO');
    assert.equal(parsed.questions[0]!.expectedAnswer, 'yes');
    assert.deepEqual(parsed.questions[0]!.importedReferenceIds, ['R1']);
    assert.deepEqual(parsed.questions[1]!.importedReferenceIds, ['R1', 'R2']);
    assert.equal(parsed.questions[2]!.needsRuleReview, true);
    assert.deepEqual(parsed.sectionEvidenceIds, ['R1', 'R2']);
    assert.equal(parsed.references.length, 2);
    assert.equal(parsed.references[0]!.importKey, 'R1');
    assert.equal(parsed.references[0]!.verificationRequired, true);
    assert.equal(parsed.references[0]!.documentType, 'clinical_reference');
    assert.deepEqual(parsed.references[0]!.suggestedSections, ['presentation_review']);
    assert.equal(parsed.blockingErrors.length, 0);
  });

  it('blocks unknown reference IDs instead of guessing', () => {
    const parsed = parsePresentationReviewImport(`## Presentation Review

### 1. Is the lesion typical?
- Answer type: YES_NO
- Required: true
- Expected pathway-consistent answer: YES
- Why this matters: Location supports consistency.
- Pharmacist tip: Confirm site.
- Conditional display: null
- References: R9

## Section Evidence
- R9

## Reference Library

### R1
- Title: [source title]
- Organization / publisher: [organization]
- Guideline / document type: Clinical reference
- Year / edition:
- Jurisdiction: Canada
- URL:
- DOI:
- Verification required: true
`);
    assert.ok(parsed.blockingErrors.some((e) => /R9/.test(e)));
    assert.ok(parsed.questions[0]!.blockingErrors.some((e) => /R9/.test(e)));
  });

  it('does not invent references from unstructured prose', () => {
    const parsed = parsePresentationReviewImport(
      'The patient likely has a cold sore. Consider valacyclovir. See some guideline.',
    );
    assert.equal(parsed.format, 'unstructured');
    assert.equal(parsed.questions.length, 0);
    assert.equal(parsed.references.length, 0);
    assert.ok(parsed.blockingErrors.length > 0);
  });

  it('flags legacy two-section imports without auto-deleting questions', () => {
    const parsed = parsePresentationReviewImport(`## Diagnosis Confirmation
1. Does the patient have typical symptoms of this condition? (YES_NO)
Why it matters: Typical features support consistency.

## Treatment Eligibility
1. Did symptoms begin recently? (YES_NO)
Why it matters: Timing is relevant before treatment review.
`);
    assert.equal(parsed.legacyTwoSectionImport, true);
    assert.equal(parsed.questions.length, 2);
    assert.equal(parsed.questions[0]!.importedReferenceIds.length, 0);
  });

  it('parses R-IDs from mixed lists', () => {
    assert.deepEqual(parseReferenceIds('R1, r2 and R1'), ['R1', 'R2']);
    assert.deepEqual(parseReferenceIds('null'), []);
  });

  it('scores overlapping question wording for admin review', () => {
    const score = questionOverlapScore(
      'Has the patient had similar cold sore episodes before?',
      'Has the current episode followed the patients usual cold sore pattern?',
    );
    assert.ok(score > 0.2);
  });
});
