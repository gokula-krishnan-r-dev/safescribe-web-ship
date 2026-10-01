import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computePublishingReadiness,
  normalizeSectionName,
  parsePathwayGovernance,
  resolveDocumentationReferenceId,
  shouldRevokeVerificationOnEdit,
  usageBadgesFromMappings,
} from './pathway-evidence-governance';

describe('pathway evidence governance', () => {
  it('parses governance defaults and primary documentation id', () => {
    const state = parsePathwayGovernance(
      {
        internalReviewStatus: 'completed',
        externalPeerReviewStatus: 'pending',
        lastReviewedAt: '2026-08-15T00:00:00.000Z',
      },
      'ref-1',
    );
    assert.equal(state.internalReviewStatus, 'completed');
    assert.equal(state.externalPeerReviewStatus, 'pending');
    assert.equal(state.primaryDocumentationReferenceId, 'ref-1');
    assert.equal(state.secondaryDocumentationReferenceId, null);
  });

  it('parses secondary documentation id from the column argument', () => {
    const state = parsePathwayGovernance({}, 'ref-1', 'ref-2');
    assert.equal(state.primaryDocumentationReferenceId, 'ref-1');
    assert.equal(state.secondaryDocumentationReferenceId, 'ref-2');
  });

  it('resolves documentation reference with treatment override then primary then secondary', () => {
    assert.equal(resolveDocumentationReferenceId('tx-ref', 'pathway-ref', 'secondary-ref'), 'tx-ref');
    assert.equal(resolveDocumentationReferenceId(null, 'pathway-ref', 'secondary-ref'), 'pathway-ref');
    assert.equal(resolveDocumentationReferenceId(null, null, 'secondary-ref'), 'secondary-ref');
    assert.equal(resolveDocumentationReferenceId(null, null, null), null);
  });

  it('revokes verified status on material metadata edits', () => {
    assert.equal(
      shouldRevokeVerificationOnEdit(
        { status: 'verified', citationTitle: 'CPS — HSV' },
        { citationTitle: 'CPS — Herpes simplex' },
      ),
      true,
    );
    assert.equal(
      shouldRevokeVerificationOnEdit(
        { status: 'needs_review', citationTitle: 'CPS — HSV' },
        { citationTitle: 'CPS — Herpes simplex' },
      ),
      false,
    );
  });

  it('normalizes ChatGPT section names', () => {
    assert.equal(normalizeSectionName('Presentation Review'), 'presentation_review');
    assert.equal(normalizeSectionName('Red Flags & Safety Screening'), 'red_flags');
    assert.equal(normalizeSectionName('Patient Guidance'), 'patient_guidance');
  });

  it('builds compact used-in badges', () => {
    const badges = usageBadgesFromMappings([
      { section: 'presentation_review', mappingType: 'question' },
      { section: 'presentation_review', mappingType: 'question' },
      { section: 'treatment_options', mappingType: 'section' },
      { section: 'red_flags', mappingType: 'red_flag' },
      { section: 'section_wide', mappingType: 'section' },
    ]);
    assert.deepEqual(badges, ['Presentation', 'Treatment', 'Red Flags', 'Section-wide']);
  });

  it('normalizes Section-wide import mapping', () => {
    assert.equal(normalizeSectionName('Section-wide'), 'section_wide');
  });

  it('computes publishing readiness from underlying statuses', () => {
    const notReady = computePublishingReadiness({
      references: [{ status: 'needs_review' }, { status: 'verified' }],
      governance: {
        internalReviewStatus: 'completed',
        externalPeerReviewStatus: 'completed',
      },
      presentationApproved: true,
      differentialApproved: true,
      redFlagsApproved: true,
      treatmentsApproved: false,
      guidanceApproved: true,
      treatmentsMissingEvidence: 1,
      redFlagsMissingEvidence: 0,
    });
    assert.equal(notReady.ready, false);
    assert.ok(notReady.issues.some((i) => i.code === 'references_need_verification'));
    assert.ok(notReady.issues.some((i) => i.code === 'treatments_needs_review'));

    const ready = computePublishingReadiness({
      references: [{ status: 'verified' }],
      governance: {
        internalReviewStatus: 'completed',
        externalPeerReviewStatus: 'completed',
      },
      presentationApproved: true,
      differentialApproved: true,
      redFlagsApproved: true,
      treatmentsApproved: true,
      guidanceApproved: true,
      treatmentsMissingEvidence: 0,
      redFlagsMissingEvidence: 0,
    });
    assert.equal(ready.ready, true);
  });
});
