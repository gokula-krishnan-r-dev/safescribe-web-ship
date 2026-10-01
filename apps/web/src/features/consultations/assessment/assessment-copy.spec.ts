import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASSESSMENT_COPY,
  reviewerCountLabel,
  reviewerInitials,
  reviewersListedLabel,
} from './assessment-copy';

describe('Step 2 assessment copy', () => {
  it('asks the pharmacist to enter the assessment', () => {
    assert.equal(ASSESSMENT_COPY.assessmentLabel, 'Enter your clinical assessment');
    assert.match(ASSESSMENT_COPY.placeholder, /cold sore \/ UTI \/ migraine/i);
  });

  it('never markets confidence, differentials, or auto-diagnosis', () => {
    const joined = [
      ASSESSMENT_COPY.assessmentLabel,
      ASSESSMENT_COPY.placeholder,
      ASSESSMENT_COPY.structuredAvailable,
      ASSESSMENT_COPY.evidenceReview,
      ASSESSMENT_COPY.clinicalJudgment,
      ASSESSMENT_COPY.noPathway,
      ASSESSMENT_COPY.helpIntro,
      ...ASSESSMENT_COPY.helpBullets,
    ].join(' ');
    assert.doesNotMatch(joined, /confidence|differential|auto-select|% match/i);
    assert.match(joined, /Clinical Judgment/i);
  });

  it('keeps evidence behind a single link and Clinical Judgment as a peer route', () => {
    assert.equal(ASSESSMENT_COPY.evidenceReview, 'Evidence & review');
    assert.equal(ASSESSMENT_COPY.clinicalJudgment, 'Continue with Clinical Judgment');
    assert.equal(ASSESSMENT_COPY.structuredAvailable, 'Structured pathway available');
  });

  it('labels development review and reviewer counts clearly', () => {
    assert.equal(ASSESSMENT_COPY.developmentReview, 'Development & review');
    assert.equal(reviewerCountLabel(0), 'No reviewers listed');
    assert.equal(reviewerCountLabel(1), '1 reviewer');
    assert.equal(reviewerCountLabel(3), '3 reviewers');
    assert.equal(reviewersListedLabel(2), '2 reviewers listed');
    assert.equal(reviewerInitials('Jane Doe'), 'JD');
  });
});
