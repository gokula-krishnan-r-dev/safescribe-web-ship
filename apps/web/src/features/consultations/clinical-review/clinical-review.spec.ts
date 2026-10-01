import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLINICAL_REVIEW_COPY,
  clinicalReviewCopyHasForbiddenLanguage,
} from './clinical-review-copy';
import {
  appendAudit,
  canContinueToTreatment,
  clampDifferentialName,
  duplicateDifferentialName,
  mapPathwayDifferentials,
  mapRedFlagItems,
  mapSafetyOutcome,
  parseDifferentialReview,
  redFlagLabel,
  referencesForIds,
  safetyScreenComplete,
  unresolvedSafetyIds,
} from './clinical-review-model';

describe('Clinical Review copy', () => {
  it('uses the specified completion and continue wording', () => {
    assert.equal(
      CLINICAL_REVIEW_COPY.reviewedLabel,
      'I have reviewed the relevant differential diagnoses.',
    );
    assert.equal(CLINICAL_REVIEW_COPY.choosePathway, 'Choose a different pathway');
    assert.equal(CLINICAL_REVIEW_COPY.continue, 'Continue to Treatment Options');
    assert.equal(CLINICAL_REVIEW_COPY.back, 'Back to Presentation Review');
    assert.equal(CLINICAL_REVIEW_COPY.confirmNone, 'Confirm none present');
  });

  it('does not use diagnosis, AI, or forbidden action wording', () => {
    const joined = Object.values(CLINICAL_REVIEW_COPY)
      .map((value) => (typeof value === 'function' ? value(1, 5) : value))
      .join('\n');
    assert.equal(clinicalReviewCopyHasForbiddenLanguage(joined), false);
    assert.doesNotMatch(joined, /SafeScribe (is |has )?diagnos/i);
  });
});

describe('Clinical Review model', () => {
  it('maps pathway differentials without inventing features', () => {
    const items = mapPathwayDifferentials([
      {
        id: 'aphthous',
        condition: 'Aphthous Ulcer (Canker Sore)',
        likelihood: 'COMMON',
        question: 'Is the sore inside the mouth without preceding blisters?',
        suggestedPathway: 'Canker Sore (Aphthous Stomatitis)',
        distinguishingFeatures: 'Usually painful\nOften single or few lesions',
        whyItMatters: 'Can resemble a cold sore by location.',
        remember: 'Check the mucosa.',
        evidenceRefIds: ['cps-1'],
      },
    ]);
    assert.equal(items[0]?.frequencyLabel, 'common');
    assert.deepEqual(items[0]?.distinguishingFeatures, [
      'Usually painful',
      'Often single or few lesions',
    ]);
    assert.equal(items[0]?.remember, 'Check the mucosa.');
    assert.deepEqual(items[0]?.evidenceRefIds, ['cps-1']);
    assert.equal(items[0]?.required, true);
    assert.equal(
      items[0]?.screeningQuestion,
      'Is the sore inside the mouth without preceding blisters?',
    );
    assert.equal(items[0]?.positiveResult, 'Canker Sore (Aphthous Stomatitis)');
  });

  it('passes required=false through from pathway differentials', () => {
    const items = mapPathwayDifferentials([
      { id: 'optional', condition: 'Angular cheilitis', required: false },
    ]);
    assert.equal(items[0]?.required, false);
  });

  it('does not prefix red flags with repetitive wording', () => {
    assert.equal(redFlagLabel('Ocular involvement'), 'Ocular involvement?');
    assert.equal(
      redFlagLabel('Is the following present: Immunocompromised patient'),
      'Immunocompromised patient?',
    );
  });

  it('maps pathway safety actions without hard-coding a condition', () => {
    const referred = mapSafetyOutcome({ action: 'SAME_DAY_PHYSICIAN', severity: 'WARNING' });
    assert.equal(referred.kind, 'referral_recommended');
    assert.equal(referred.requiresResolution, true);
    const discretion = mapSafetyOutcome({ action: 'PHARMACIST_DISCRETION' });
    assert.equal(discretion.kind, 'continue_with_caution');
    assert.equal(discretion.requiresResolution, false);
    assert.doesNotMatch(JSON.stringify(mapRedFlagItems([])), /cold sore/i);
  });

  it('prefers stored whyItMatters and question for pharmacist safety items', () => {
    const flags = mapRedFlagItems([
      {
        id: 'eye',
        title: 'Ocular involvement',
        question: 'Does the patient have a lesion near the eye?',
        whyItMatters: 'May indicate herpes simplex keratitis.',
        action: 'IMMEDIATE_REFERRAL',
        required: true,
      },
    ]);
    assert.equal(flags[0]?.whyText, 'May indicate herpes simplex keratitis.');
    assert.equal(flags[0]?.required, true);
  });

  it('requires differential review, answers, and resolved safety actions', () => {
    const flags = mapRedFlagItems([
      { id: 'eye', title: 'Ocular involvement', action: 'IMMEDIATE_REFERRAL', required: true },
      { id: 'immune', title: 'Immunocompromised patient', action: 'PHARMACIST_DISCRETION', required: true },
    ]);
    assert.equal(safetyScreenComplete(flags, { eye: 'no', immune: 'yes' }), true);
    assert.equal(safetyScreenComplete(flags, { eye: 'no' }), false);
    const unresolved = unresolvedSafetyIds({
      flags,
      answers: { eye: 'yes', immune: 'yes' },
      resolvedIds: new Set(),
    });
    assert.deepEqual(unresolved, ['eye']);
    assert.equal(
      canContinueToTreatment({
        differentialReviewed: true,
        safetyComplete: true,
        unresolvedSafetyIds: unresolved,
      }),
      false,
    );
    assert.equal(
      canContinueToTreatment({
        differentialReviewed: true,
        safetyComplete: true,
        unresolvedSafetyIds: [],
      }),
      true,
    );
  });

  it('shows only references mapped to the item', () => {
    const refs = referencesForIds(
      [
        {
          id: 'cps-1',
          citationTitle: 'CPS. Herpes simplex infections.',
          referenceType: 'guideline',
          supportsSections: ['eye'],
        },
        {
          id: 'other',
          citationTitle: 'Unrelated monograph',
          referenceType: 'source',
          supportsSections: ['treatment'],
        },
      ],
      ['cps-1'],
      'eye',
    );
    assert.deepEqual(
      refs.map((ref) => ref.id),
      ['cps-1'],
    );
  });

  it('parses pharmacist-added differentials and rejects blank names', () => {
    const parsed = parseDifferentialReview({
      reviewed: true,
      pharmacistAddedDifferentials: [{ id: 'a1', displayName: 'Oral candidiasis', source: 'pharmacist' }],
    });
    assert.equal(parsed.reviewed, true);
    assert.equal(parsed.pharmacistAddedDifferentials[0]?.displayName, 'Oral candidiasis');
    assert.equal(clampDifferentialName('   '), '');
    assert.equal(
      duplicateDifferentialName('Aphthous Ulcer', ['Aphthous Ulcer'], []),
      true,
    );
    const audited = appendAudit(parsed, 'differential_added', 'a1', '2026-09-11T00:00:00.000Z');
    assert.equal(audited.auditEvents.at(-1)?.action, 'differential_added');
  });
});
