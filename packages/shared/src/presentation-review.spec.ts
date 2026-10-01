import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approvalStatusLabel,
  citationDisplay,
  detectLegacyTwoSectionImport,
  editionLabel,
  evidenceCountLabel,
  formatVisibilityLabel,
  parsePresentationReviewState,
  parseVisibilityRule,
  uniqueIdList,
} from './presentation-review';

describe('presentation review evidence helpers', () => {
  it('labels linked and unlinked evidence without clinical-alert wording', () => {
    assert.equal(evidenceCountLabel(0), 'Evidence not linked');
    assert.equal(evidenceCountLabel(1), 'Evidence: 1 linked');
    assert.equal(evidenceCountLabel(3), 'Evidence: 3 linked');
  });

  it('maps stored question status to Approved / Needs review only', () => {
    assert.equal(approvalStatusLabel('APPROVED', true), 'approved');
    assert.equal(approvalStatusLabel('NEEDS_REVIEW', false), 'needs_review');
    assert.equal(approvalStatusLabel('AI_GENERATED', false), 'needs_review');
  });

  it('parses section evidence IDs without duplicating them', () => {
    const state = parsePresentationReviewState({
      sectionEvidenceRefIds: ['cps-1', 'cps-1', 'hc-2', ''],
    });
    assert.deepEqual(state.sectionEvidenceRefIds, ['cps-1', 'hc-2']);
  });

  it('formats visibility labels from stored rules', () => {
    const rule = parseVisibilityRule({
      sourceField: 'priorColdSoreHistory',
      operator: 'eq',
      value: true,
      label: 'Shown only if prior cold sore history is documented.',
    });
    assert.equal(
      formatVisibilityLabel(rule),
      'Shown only if prior cold sore history is documented.',
    );
  });

  it('detects legacy two-section ChatGPT imports', () => {
    assert.equal(
      detectLegacyTwoSectionImport('## Diagnosis Confirmation\n1. A?\n## Treatment Eligibility\n1. B?'),
      true,
    );
    assert.equal(detectLegacyTwoSectionImport('## Presentation Review\n1. A?'), false);
  });

  it('displays citation title without inventing organization', () => {
    assert.equal(
      citationDisplay({ citationTitle: 'Herpes simplex infections', organization: 'CPS' }),
      'CPS — Herpes simplex infections',
    );
    assert.equal(editionLabel({ edition: null, publicationYear: null }), 'Current edition');
  });

  it('dedupes id lists', () => {
    assert.deepEqual(uniqueIdList(['a', 'a', 'b', null]), ['a', 'b']);
  });
});
